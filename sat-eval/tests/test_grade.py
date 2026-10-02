from sateval.grade import grade, parse_for
from sateval.loader import Question


def q(**kw):
    base = dict(id="t-1", section="math", type="linear-rate", difficulty="easy",
                format="mcq", stem="s", choices={"A": "1", "B": "2", "C": "3", "D": "4"},
                answer="C", image=None, source="hand-written", split="test")
    base.update(kw)
    return Question(**base)


def test_mcq_correct_and_wrong():
    assert grade(q(), "C") is True
    assert grade(q(), "B") is False


def test_unparsed_is_wrong():
    assert grade(q(), None) is False


def test_gridin_equivalent_forms_match():
    g = q(format="grid-in", choices=None, answer="1/2")
    assert grade(g, 0.5) is True
    assert grade(g, 0.5004) is True
    assert grade(g, 0.502) is False


def test_gridin_accepts_alternative_answers():
    g = q(format="grid-in", choices=None, answer="2|-2")
    assert grade(g, -2) is True
    assert grade(g, 2) is True
    assert grade(g, 3) is False


def test_gridin_repeating_decimal_within_tolerance():
    g = q(format="grid-in", choices=None, answer="2/3")
    assert grade(g, 0.6667) is True
    assert grade(g, 0.667) is True


def test_parse_for_dispatches_on_format():
    assert parse_for(q(), "b") == "B"
    assert parse_for(q(format="grid-in", choices=None, answer="3"), "3/1") == 3
