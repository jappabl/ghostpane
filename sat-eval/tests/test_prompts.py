from sateval.loader import Question
from sateval.prompts import build_messages, parse_label, pick_examples


def q(id, split="train", type="linear-rate", **kw):
    base = dict(id=id, section="math", type=type, difficulty="easy", format="mcq",
                stem=f"stem {id}", choices={"A": "1", "B": "2", "C": "3", "D": "4"},
                answer="C", image=None, source="hand-written", split=split,
                explanation=f"why {id}")
    base.update(kw)
    return Question(**base)


def test_parse_label_finds_a_section_label():
    assert parse_label("Label: linear-rate", "math") == "linear-rate"
    assert parse_label("`Systems`", "math") == "systems"


def test_parse_label_prefers_the_longest_match():
    assert parse_label("linear-equations", "math") == "linear-equations"
    assert parse_label("evidence-quant", "rw") == "evidence-quant"


def test_parse_label_rejects_other_section_and_noise():
    assert parse_label("transitions", "math") is None
    assert parse_label("I am not sure", "math") is None


def test_examples_never_come_from_test_split():
    pool = [q("t1", split="test"), q("t2", split="test"), q("a"), q("b"), q("c")]
    picked = pick_examples(pool, "linear-rate", exclude="t1")
    assert [x.id for x in picked] == ["a", "b"]


def test_examples_match_type_and_skip_the_question_itself():
    pool = [q("a", type="systems"), q("b"), q("c")]
    assert [x.id for x in pick_examples(pool, "linear-rate", exclude="b")] == ["c"]


def test_routed_prompt_includes_method_and_examples():
    pool = [q("a"), q("b")]
    target = q("t", split="test")
    msgs = build_messages(target, reasoning=True, label="linear-rate", examples=pool)
    user = msgs[-1]["content"]
    assert "start + rate" in user and "stem a" in user and "why b" in user
    assert user.rstrip().endswith("D) 4")


def test_baseline_prompt_forbids_reasoning():
    msgs = build_messages(q("t", split="test"), reasoning=False)
    assert "nothing else" in msgs[0]["content"]


def test_system_prompt_names_only_the_question_format():
    mcq = build_messages(q("t", split="test"), reasoning=True)[0]["content"]
    assert "ANSWER: <letter>" in mcq and "<number>" not in mcq
    grid = build_messages(q("g", split="test", format="grid-in", choices=None, answer="3"),
                          reasoning=True)[0]["content"]
    assert "ANSWER: <number>" in grid and "<letter>" not in grid
