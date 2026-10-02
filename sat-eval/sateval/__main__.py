"""python -m sateval {validate,run,report,compare}"""
import argparse
import asyncio
import sys
from collections import Counter
from pathlib import Path

from .loader import load, validate_file
from .report import build_report, compare
from .runner import BASE_URL, CONDITIONS, run

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "questions.jsonl"
TARGETS = {"test": 200, "train": 300}


def cmd_validate(args) -> int:
    errors = validate_file(args.data)
    for e in errors:
        print(e)
    if errors:
        print(f"{len(errors)} error(s)")
        return 1
    qs = load(args.data)
    counts = Counter((q.split, q.section) for q in qs)
    for split, target in TARGETS.items():
        n = sum(v for (s, _), v in counts.items() if s == split)
        by_sec = ", ".join(f"{sec} {counts[(split, sec)]}" for sec in ("math", "rw"))
        note = "" if n >= target else f"  (target {target}+)"
        print(f"{split:<5} {n:>4}  [{by_sec}]{note}")
    print("ok")
    return 0


def cmd_run(args) -> int:
    errors = validate_file(args.data)
    if errors:
        print("\n".join(errors[:20]) + f"\n{len(errors)} validation error(s); fix them first")
        return 1
    pool = load(args.data)
    qs = [q for q in pool if q.split == args.split]
    if args.section:
        qs = [q for q in qs if q.section == args.section]
    if args.ids:
        wanted = set(args.ids.split(","))
        qs = [q for q in qs if q.id in wanted]
    if args.limit:
        qs = qs[: args.limit]
    models = args.models.split(",") if args.models else [args.model]
    run_dir = asyncio.run(run(qs, pool, args.condition, models, args.out, args.data.parent,
                              args.base_url, args.max_tokens))
    report = build_report(run_dir, args.data.parent)
    (run_dir / "report.md").write_text(report)
    print(f"\n{report}\n\n{run_dir}")
    return 0


def cmd_report(args) -> int:
    report = build_report(args.run, args.data.parent)
    (args.run / "report.md").write_text(report)
    print(report)
    return 0


def cmd_compare(args) -> int:
    print(compare(args.runs))
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="sateval")
    p.add_argument("--data", type=Path, default=DATA)
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("validate", help="check data/questions.jsonl").set_defaults(fn=cmd_validate)

    r = sub.add_parser("run", help="run one model under one condition")
    who = r.add_mutually_exclusive_group(required=True)
    who.add_argument("--model", help="e.g. gemma3:4b")
    who.add_argument("--models", help="C3/C5 mixed vote: three models, strongest first, comma-separated")
    r.add_argument("--condition", required=True, choices=sorted(CONDITIONS))
    r.add_argument("--split", default="test", choices=["test", "train"])
    r.add_argument("--section", choices=["math", "rw"])
    r.add_argument("--ids", help="comma-separated question ids")
    r.add_argument("--limit", type=int)
    r.add_argument("--max-tokens", type=int, default=8192)
    r.add_argument("--base-url", default=BASE_URL)
    r.add_argument("--out", type=Path, default=ROOT / "runs")
    r.set_defaults(fn=cmd_run)

    rp = sub.add_parser("report", help="rebuild report.md for a run directory")
    rp.add_argument("run", type=Path)
    rp.set_defaults(fn=cmd_report)

    c = sub.add_parser("compare", help="one table across run directories")
    c.add_argument("runs", type=Path, nargs="+")
    c.set_defaults(fn=cmd_compare)

    args = p.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
