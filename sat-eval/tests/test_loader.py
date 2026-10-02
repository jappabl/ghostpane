import json

from sateval.loader import load, validate_file


def write(tmp_path, records):
    p = tmp_path / "q.jsonl"
    p.write_text("\n".join(json.dumps(r) for r in records) + "\n")
    return p


def rec(**kw):
    base = {"id": "m-1", "section": "math", "type": "linear-rate", "difficulty": "easy",
            "format": "mcq", "stem": "s", "choices": {"A": "1", "B": "2", "C": "3", "D": "4"},
            "answer": "C", "image": None, "source": "hand-written", "split": "test"}
    base.update(kw)
    return base


def test_valid_file_has_no_errors(tmp_path):
    p = write(tmp_path, [rec(), rec(id="m-2", format="grid-in", choices=None, answer="1/2")])
    assert validate_file(p) == []
    assert [x.id for x in load(p)] == ["m-1", "m-2"]


def test_missing_field(tmp_path):
    r = rec()
    del r["stem"]
    errors = validate_file(write(tmp_path, [r]))
    assert len(errors) == 1 and "stem" in errors[0]


def test_duplicate_id(tmp_path):
    errors = validate_file(write(tmp_path, [rec(), rec()]))
    assert any("duplicate id m-1" in e for e in errors)


def test_answer_not_in_choices(tmp_path):
    errors = validate_file(write(tmp_path, [rec(answer="E")]))
    assert any("not in choices" in e for e in errors)


def test_mcq_needs_four_choices(tmp_path):
    errors = validate_file(write(tmp_path, [rec(choices={"A": "1", "B": "2"}, answer="A")]))
    assert any("choices" in e for e in errors)


def test_gridin_answer_must_be_numeric(tmp_path):
    errors = validate_file(write(tmp_path, [rec(format="grid-in", choices=None, answer="five")]))
    assert any("not a number" in e for e in errors)


def test_type_must_be_in_section_taxonomy(tmp_path):
    errors = validate_file(write(tmp_path, [rec(type="transitions")]))
    assert any("type" in e for e in errors)


def test_image_must_exist(tmp_path):
    errors = validate_file(write(tmp_path, [rec(image="images/missing.png")]))
    assert any("image" in e for e in errors)


def test_bad_json_line(tmp_path):
    p = tmp_path / "q.jsonl"
    p.write_text(json.dumps(rec()) + "\n{not json\n")
    errors = validate_file(p)
    assert any("line 2" in e for e in errors)
