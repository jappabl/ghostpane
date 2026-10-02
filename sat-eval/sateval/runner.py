"""Run one model (or a set, for C3) under one condition over the question set."""
import asyncio
import json
import re
import subprocess
import time
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path

import httpx

from .extract import extract_answer_line
from .grade import grade, parse_for
from .loader import Question
from .prompts import FORMS, RETRY, build_messages, classify_messages, parse_label, pick_examples
from .vote import majority

BASE_URL = "http://127.0.0.1:11434"  # not localhost: avoids IPv6 connection errors


@dataclass(frozen=True)
class Condition:
    reasoning: bool
    route: bool = False
    vote: str | None = None  # "same" (3 seeds, one model) or "mixed" (one sample from each of 3 models)


CONDITIONS = {
    "C0": Condition(reasoning=False),
    "C1": Condition(reasoning=True),
    "C2": Condition(reasoning=True, vote="same"),
    "C3": Condition(reasoning=True, vote="mixed"),
    "C4": Condition(reasoning=True, route=True),
    "C5": Condition(reasoning=True, route=True, vote="same"),  # vote="mixed" when --models is given
}
VOTE_TEMPERATURE = 0.7
SEEDS = (1, 2, 3)


class Ollama:
    def __init__(self, base_url: str = BASE_URL, max_tokens: int = 8192):
        self.http = httpx.AsyncClient(base_url=base_url, timeout=httpx.Timeout(1800, connect=10))
        self.max_tokens = max_tokens
        self._caps: dict[str, set[str]] = {}

    async def capabilities(self, model: str) -> set[str]:
        if model not in self._caps:
            r = await self.http.post("/api/show", json={"model": model})
            r.raise_for_status()
            self._caps[model] = set(r.json().get("capabilities", []))
        return self._caps[model]

    async def chat(self, model: str, messages: list[dict], temperature: float, seed: int,
                   think: bool = True, max_tokens: int | None = None) -> dict:
        body = {"model": model, "messages": messages, "temperature": temperature, "seed": seed,
                "max_tokens": max_tokens or self.max_tokens}
        if not think and "thinking" in await self.capabilities(model):
            body["reasoning_effort"] = "none"
        t0 = time.perf_counter()
        r = await self.http.post("/v1/chat/completions", json=body)
        r.raise_for_status()
        data = r.json()
        msg = data["choices"][0]["message"]
        return {"content": msg.get("content") or "",
                # Thinking models return reasoning separately; it is stored but never graded.
                "reasoning": msg.get("reasoning") or msg.get("reasoning_content") or "",
                "seconds": time.perf_counter() - t0,
                "tokens": data.get("usage", {}).get("completion_tokens"),
                "finish": data["choices"][0].get("finish_reason")}

    async def close(self):
        await self.http.aclose()


async def _sample(client: Ollama, q: Question, model: str, messages: list[dict],
                  temperature: float, seed: int, think: bool) -> dict:
    out = await client.chat(model, messages, temperature, seed, think=think)
    raw = extract_answer_line(out["content"])
    retried, retry_out = False, None
    if parse_for(q, raw) is None:
        retried = True
        follow = messages + [{"role": "assistant", "content": out["content"]},
                             {"role": "user", "content": RETRY.format(form=FORMS[q.format])}]
        retry_out = await client.chat(model, follow, 0.0, seed, think=False, max_tokens=64)
        raw = extract_answer_line(retry_out["content"]) or raw
    value = parse_for(q, raw)
    return {"model": model, "seed": seed, "temperature": temperature,
            "content": out["content"], "reasoning": out["reasoning"],
            "finish": out["finish"], "tokens": out["tokens"],
            "raw_answer": raw, "parsed": value, "unparsed": value is None, "retried": retried,
            "retry_content": retry_out["content"] if retry_out else None,
            "seconds": out["seconds"] + (retry_out["seconds"] if retry_out else 0.0),
            "correct": grade(q, value)}


async def run_question(client: Ollama, q: Question, cond: Condition, models: list[str],
                       pool: list[Question], data_dir: Path) -> tuple[dict, list[dict]]:
    base = {"id": q.id, "section": q.section, "type": q.type, "format": q.format}
    if q.image:
        for m in models:
            if "vision" not in await client.capabilities(m):
                return {**base, "skipped": True}, []

    t0 = time.perf_counter()
    label, label_s, examples = None, 0.0, []
    if cond.route:
        out = await client.chat(models[0], classify_messages(q), 0.0, 0, think=False, max_tokens=24)
        label, label_s = parse_label(out["content"], q.section), out["seconds"]
        examples = pick_examples(pool, label, exclude=q.id) if label else []
    messages = build_messages(q, cond.reasoning, label, examples, data_dir)

    if cond.vote == "same":
        jobs = [(models[0], VOTE_TEMPERATURE, s) for s in SEEDS]
    elif cond.vote == "mixed":
        jobs = [(m, 0.0, 0) for m in models]  # strongest model first: it breaks ties
    else:
        jobs = [(models[0], 0.0, 0)]
    samples = await asyncio.gather(*(
        _sample(client, q, m, messages, t, s, think=cond.reasoning) for m, t, s in jobs))
    wall = time.perf_counter() - t0

    winner, agreement, tie = majority([s["parsed"] for s in samples])
    summary = {**base, "label": label, "answer": q.answer, "prediction": winner,
               "correct": grade(q, winner), "agreement": agreement if cond.vote else None,
               "tie": tie, "wall_s": wall,
               "calls_s": label_s + sum(s["seconds"] for s in samples)}
    return summary, [{**base, "sample": i, **s} for i, s in enumerate(samples)]


def _git_sha() -> str | None:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True,
                              text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


async def run(questions: list[Question], pool: list[Question], condition: str, models: list[str],
              out_root: Path, data_dir: Path, base_url: str = BASE_URL, max_tokens: int = 8192,
              progress=print) -> Path:
    cond = CONDITIONS[condition]
    if condition == "C5" and len(models) > 1:
        cond = Condition(reasoning=True, route=True, vote="mixed")
    if cond.vote == "mixed" and len(models) != 3:
        raise SystemExit(f"{condition} needs exactly 3 models (--models a,b,c), strongest first")

    started = datetime.now()
    name = "+".join(models)
    run_dir = Path(out_root) / f"{started:%Y%m%d-%H%M%S}-{re.sub(r'[^\w.+-]', '_', name)}-{condition}"
    run_dir.mkdir(parents=True)
    meta = {"model": name, "models": models, "condition": condition, **asdict(cond),
            "started": f"{started:%Y-%m-%d %H:%M}", "questions": len(questions),
            "base_url": base_url, "max_tokens": max_tokens, "git": _git_sha()}
    (run_dir / "meta.json").write_text(json.dumps(meta, indent=2))

    client = Ollama(base_url, max_tokens)
    correct = done = 0
    try:
        with open(run_dir / "questions.jsonl", "w") as qf, open(run_dir / "results.jsonl", "w") as rf:
            for q in questions:
                summary, samples = await run_question(client, q, cond, models, pool, data_dir)
                qf.write(json.dumps(summary) + "\n")
                rf.writelines(json.dumps(s) + "\n" for s in samples)
                qf.flush(); rf.flush()
                if not summary.get("skipped"):
                    done += 1
                    correct += summary["correct"]
                    progress(f"{done:>4}/{len(questions)} {q.id:<10} {'✓' if summary['correct'] else '✗'} "
                             f"{summary['wall_s']:6.1f}s  running {correct / done:.1%}")
    finally:
        await client.close()
    return run_dir
