"""Summaries: one run's report.md, and a comparison table across runs."""
import json
import math
from collections import defaultdict
from pathlib import Path

from .taxonomy import SECTIONS

Z = 1.96
WEAK_TYPE = 0.70


def wilson(k: int, n: int) -> tuple[float, float]:
    if n == 0:
        return 0.0, 0.0
    p = k / n
    denom = 1 + Z * Z / n
    centre = (p + Z * Z / (2 * n)) / denom
    margin = Z * math.sqrt(p * (1 - p) / n + Z * Z / (4 * n * n)) / denom
    return max(0.0, centre - margin), min(1.0, centre + margin)


def percentile(xs: list[float], pct: float) -> float:
    xs = sorted(xs)
    if not xs:
        return float("nan")
    i = (len(xs) - 1) * pct / 100
    lo = math.floor(i)
    hi = min(lo + 1, len(xs) - 1)
    return xs[lo] + (xs[hi] - xs[lo]) * (i - lo)


def improved(base: tuple[int, int], new: tuple[int, int]) -> bool:
    """A gain counts only when the two 95% intervals do not overlap."""
    return wilson(*new)[0] > wilson(*base)[1]


def _load(run: Path):
    run = Path(run)
    meta = json.loads((run / "meta.json").read_text())
    questions = [json.loads(l) for l in (run / "questions.jsonl").read_text().splitlines() if l]
    samples = [json.loads(l) for l in (run / "results.jsonl").read_text().splitlines() if l]
    return meta, questions, samples


def _acc(rows) -> str:
    k, n = sum(r["correct"] for r in rows), len(rows)
    if not n:
        return "–"
    lo, hi = wilson(k, n)
    return f"{k/n:.1%} ({lo:.0%}–{hi:.0%}) n={n}"


def _score(acc: float, section: str, data_dir: Path) -> str:
    table = data_dir / "score_table.json"
    if not table.is_file():
        return ""
    points = json.loads(table.read_text())[section]  # [[fraction correct, scaled score], ...]
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        if x0 <= acc <= x1:
            return f" · est. {round(y0 + (y1 - y0) * (acc - x0) / (x1 - x0), -1):.0f}"
    return ""


def build_report(run: Path, data_dir: Path) -> str:
    meta, questions, samples = _load(run)
    graded = [q for q in questions if not q.get("skipped")]
    skipped = len(questions) - len(graded)
    lines = [f"# {meta['model']} · {meta['condition']}", "",
             f"{meta['started']} · {len(graded)} questions graded"
             + (f", {skipped} skipped (image, model has no vision)" if skipped else ""), ""]

    lines += ["## Accuracy", "", "| Section | Accuracy (95% CI) |", "|---|---|"]
    for sec in ("math", "rw"):
        rows = [q for q in graded if q["section"] == sec]
        if rows:
            acc = sum(r["correct"] for r in rows) / len(rows)
            lines.append(f"| {sec} | {_acc(rows)}{_score(acc, sec, data_dir)} |")
    lines += [f"| **overall** | {_acc(graded)} |", ""]

    by_type = defaultdict(list)
    for q in graded:
        by_type[q["type"]].append(q)
    lines += ["## By question type", "", "| Type | Accuracy (95% CI) | |", "|---|---|---|"]
    for sec in ("math", "rw"):
        for t in SECTIONS[sec]:
            if rows := by_type.get(t):
                weak = "⚠ under 70%" if sum(r["correct"] for r in rows) / len(rows) < WEAK_TYPE else ""
                lines.append(f"| {t} | {_acc(rows)} | {weak} |")
    lines.append("")

    wall = [q["wall_s"] for q in graded]
    calls = [q["calls_s"] for q in graded]
    unparsed = sum(s["unparsed"] for s in samples)
    retried = sum(s["retried"] for s in samples)
    lines += ["## Cost", "",
              f"- Seconds per question (wall clock): median {percentile(wall, 50):.1f}, p90 {percentile(wall, 90):.1f}",
              f"- Seconds per question (sum of calls): median {percentile(calls, 50):.1f}, p90 {percentile(calls, 90):.1f}",
              f"- Unparsed samples: {unparsed}/{len(samples)} ({unparsed / max(len(samples), 1):.1%}); "
              f"{retried} needed the retry", ""]

    if meta.get("vote"):
        lines += ["## Vote agreement", "", "| Agreement | Share | Accuracy (95% CI) |", "|---|---|---|"]
        for level in ("3/3", "2/3", "split", "single", "none"):
            if rows := [q for q in graded if q["agreement"] == level]:
                lines.append(f"| {level} | {len(rows) / len(graded):.0%} | {_acc(rows)} |")
        lines.append("")

    if meta.get("route"):
        hits = [q["label"] == q["type"] for q in graded]
        k = sum(hits)
        lo, hi = wilson(k, len(hits))
        lines += ["## Router", "",
                  f"Type label matched the hand tag on {k}/{len(hits)} ({k / max(len(hits), 1):.1%}, {lo:.0%}–{hi:.0%}); "
                  "the bar is 90% before its effect on answers is read.", ""]
    return "\n".join(lines)


def compare(runs: list[Path]) -> str:
    loaded = [_load(r) for r in runs]
    c1 = {}
    for meta, qs, _ in loaded:
        if meta["condition"] == "C1":
            g = [q for q in qs if not q.get("skipped")]
            c1[meta["model"]] = (sum(q["correct"] for q in g), len(g))
    lines = ["| Model | Condition | Math | R&W | Overall | s/question (median) | Beats C1? |",
             "|---|---|---|---|---|---|---|"]
    for meta, qs, _ in sorted(loaded, key=lambda m: (m[0]["model"], m[0]["condition"])):
        g = [q for q in qs if not q.get("skipped")]
        cells = [_acc([q for q in g if q["section"] == s]) for s in ("math", "rw")]
        k, n = sum(q["correct"] for q in g), len(g)
        base = c1.get(meta["models"][0])  # mixed votes compare against their strongest model
        beats = "–" if not base or meta["condition"] == "C1" else ("yes" if improved(base, (k, n)) else "no")
        lines.append(f"| {meta['model']} | {meta['condition']} | {cells[0]} | {cells[1]} | {_acc(g)} "
                     f"| {percentile([q['wall_s'] for q in g], 50):.1f} | {beats} |")
    return "\n".join(lines)
