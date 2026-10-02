"""Turn an extracted ANSWER string into a comparable value and grade it."""
from .extract import parse_mcq, parse_number
from .loader import Question

TOLERANCE = 0.001


def parse_for(q: Question, raw: str | None) -> str | float | None:
    if raw is None:
        return None
    return parse_mcq(raw) if q.format == "mcq" else parse_number(raw)


def grade(q: Question, value: str | float | None) -> bool:
    if value is None:
        return False
    if q.format == "mcq":
        return value == q.answer
    return any(abs(value - a) <= TOLERANCE for a in q.answers)
