"""Pull the graded answer out of a model reply. Only the final ANSWER: line counts."""
import re

# Models often bold the line ("**ANSWER:** C"); emphasis markers around it are ignored.
_ANSWER_LINE = re.compile(r"^[*_`\s]*ANSWER[*_`]*:[*_`]*\s*(.+?)[*_`\s]*$", re.IGNORECASE | re.MULTILINE)
_MCQ = re.compile(r"^\(?([A-D])\)?(?=$|[\s.):])(.*)$", re.IGNORECASE)
_FRAC = re.compile(r"^(-?\d+(?:\.\d+)?)\s*/\s*(-?\d+(?:\.\d+)?)$")
_NUM = re.compile(r"^-?(?:\d+(?:\.\d*)?|\.\d+)$")


def extract_answer_line(text: str) -> str | None:
    matches = _ANSWER_LINE.findall(text or "")
    return matches[-1].strip() if matches else None


def parse_mcq(raw: str) -> str | None:
    m = _MCQ.match(raw.strip())
    # "D) 14" is a letter plus its choice text; "C or D" names two letters and is unparsed.
    if not m or re.search(r"\b[A-D]\b", m.group(2)):
        return None
    return m.group(1).upper()


def parse_number(raw: str) -> float | None:
    s = raw.strip()
    s = re.sub(r"\\boxed\{(.*)\}", r"\1", s)
    s = re.sub(r"\\d?frac\{([^}]*)\}\{([^}]*)\}", r"\1/\2", s)
    s = re.sub(r"^[a-zA-Z]\s*=\s*", "", s)  # "x = 4"
    s = s.replace("$", "").replace(",", "").replace("%", "").strip().rstrip(".")
    if m := _FRAC.match(s):
        num, den = float(m.group(1)), float(m.group(2))
        return num / den if den else None
    if _NUM.match(s):
        return float(s)
    return None
