"""Question records (data/questions.jsonl): schema, loading and validation."""
import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ValidationError, model_validator

from .extract import parse_number
from .taxonomy import SECTIONS


class Question(BaseModel):
    id: str
    section: Literal["math", "rw"]
    type: str
    difficulty: Literal["easy", "medium", "hard"]
    format: Literal["mcq", "grid-in"]
    stem: str
    choices: dict[str, str] | None
    answer: str  # MCQ letter, or a number; "|" separates alternative grid-in answers
    image: str | None
    source: str
    split: Literal["test", "train"]
    explanation: str | None = None  # worked solution, used when a train item is a C4 example

    @model_validator(mode="after")
    def _check(self):
        if self.type not in SECTIONS[self.section]:
            raise ValueError(f"type {self.type!r} is not a {self.section} type")
        if self.format == "mcq":
            if not self.choices or sorted(self.choices) != ["A", "B", "C", "D"]:
                raise ValueError("mcq needs choices A, B, C and D")
            if self.answer not in self.choices:
                raise ValueError(f"answer {self.answer!r} not in choices")
        else:
            bad = [a for a in self.answer.split("|") if parse_number(a) is None]
            if bad:
                raise ValueError(f"grid-in answer {bad[0]!r} is not a number")
        return self

    @property
    def answers(self) -> list[float]:
        return [parse_number(a) for a in self.answer.split("|")]


def _records(path: Path):
    for n, line in enumerate(path.read_text().splitlines(), 1):
        if line.strip():
            yield n, line


def validate_file(path: Path) -> list[str]:
    path = Path(path)
    errors, seen = [], set()
    for n, line in _records(path):
        try:
            q = Question.model_validate(json.loads(line))
        except json.JSONDecodeError as e:
            errors.append(f"line {n}: bad JSON ({e.msg})")
            continue
        except ValidationError as e:
            for err in e.errors():
                where = ".".join(str(x) for x in err["loc"]) or "record"
                errors.append(f"line {n}: {where}: {err['msg']}")
            continue
        if q.id in seen:
            errors.append(f"line {n}: duplicate id {q.id}")
        seen.add(q.id)
        if q.image and not (path.parent / q.image).is_file():
            errors.append(f"line {n}: image {q.image} not found")
    return errors


def load(path: Path) -> list[Question]:
    return [Question.model_validate(json.loads(line)) for _, line in _records(Path(path))]
