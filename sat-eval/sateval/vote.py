"""Majority vote over parsed answers. Samples arrive strongest-first, so ties go to sample 0."""
from .grade import TOLERANCE


def _same(a, b) -> bool:
    if isinstance(a, float) or isinstance(b, float):
        return abs(a - b) <= TOLERANCE
    return a == b


def majority(values: list) -> tuple[object, str, bool]:
    """Return (winner, agreement, tie). agreement: '3/3', '2/3', 'split', 'single' or 'none'."""
    parsed = [v for v in values if v is not None]
    if not parsed:
        return None, "none", False
    if len(parsed) == 1:
        return parsed[0], "single", False
    counts = [sum(_same(v, w) for w in parsed) for v in parsed]
    top = max(counts)
    if top == 1:
        return parsed[0], "split", True
    return parsed[counts.index(top)], f"{top}/{len(values)}", False
