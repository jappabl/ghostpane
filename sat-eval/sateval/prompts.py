"""Prompt text for every condition, plus the C4 router's label parsing and example picking."""
import base64
import re
from pathlib import Path

from .loader import Question
from .taxonomy import SECTIONS

# Only the form for this question's format is shown: given both, small models echo both lines.
FORMS = {"mcq": "ANSWER: <letter>", "grid-in": "ANSWER: <number>   (a fraction or decimal)"}


def system_prompt(fmt: str, reasoning: bool) -> str:
    if not reasoning:
        return ("Answer the SAT question immediately, without explanation. "
                f"Reply with exactly one line and nothing else, in this form:\n{FORMS[fmt]}")
    return ("Solve the SAT question. Think step by step and check your arithmetic.\n"
            f"End with exactly one final line in this form:\n{FORMS[fmt]}\n"
            "Write nothing after that line.")


RETRY = "Reply with only the final answer line: {form}"

SECTION_NAMES = {"math": "Math", "rw": "Reading and Writing"}


def format_question(q: Question) -> str:
    parts = [q.stem.strip()]
    if q.format == "mcq":
        parts.append("\n".join(f"{k}) {v}" for k, v in sorted(q.choices.items())))
    else:
        parts.append("Student-produced response: answer with a number, not a letter.")
    return "\n\n".join(parts)


def _worked(ex: Question) -> str:
    return f"{format_question(ex)}\n\nSolution: {ex.explanation or ''}\nANSWER: {ex.answer.split('|')[0]}"


def build_messages(q: Question, reasoning: bool, label: str | None = None,
                   examples: list[Question] = (), data_dir: Path | None = None) -> list[dict]:
    user = format_question(q)
    if label:
        method = SECTIONS[q.section][label][1]
        shots = "\n\n".join(f"Example {i}:\n{_worked(ex)}" for i, ex in enumerate(examples, 1))
        user = f"Method for this type of question: {method}\n\n{shots}\n\nNow solve this question:\n\n{user}"
    content: str | list = user
    if q.image:
        png = base64.b64encode((Path(data_dir) / q.image).read_bytes()).decode()
        content = [{"type": "text", "text": user},
                   {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{png}"}}]
    return [{"role": "system", "content": system_prompt(q.format, reasoning)}, {"role": "user", "content": content}]


def classify_messages(q: Question) -> list[dict]:
    labels = "\n".join(f"- {k}: {desc}" for k, (desc, _) in SECTIONS[q.section].items())
    system = (f"Classify this SAT {SECTION_NAMES[q.section]} question into exactly one type. "
              f"Do not solve it. Reply with only the label.\n\nTypes:\n{labels}")
    return [{"role": "system", "content": system}, {"role": "user", "content": format_question(q)}]


def parse_label(text: str, section: str) -> str | None:
    text = text.lower()
    hits = [k for k in SECTIONS[section] if re.search(rf"(?<![\w-]){re.escape(k)}(?![\w-])", text)]
    return max(hits, key=len) if hits else None


def pick_examples(pool: list[Question], label: str, exclude: str, k: int = 2) -> list[Question]:
    """Worked examples come from the training split only, never the test set."""
    same = [x for x in pool if x.split == "train" and x.type == label and x.id != exclude and not x.image]
    return sorted(same, key=lambda x: x.id)[:k]
