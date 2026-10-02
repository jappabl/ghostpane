from sateval.extract import extract_answer_line, parse_mcq, parse_number


def test_takes_last_answer_line():
    text = "ANSWER: A\nWait, recheck.\nANSWER: C"
    assert extract_answer_line(text) == "C"


def test_answer_line_is_case_insensitive():
    assert extract_answer_line("work\nanswer:  b") == "b"


def test_answer_line_tolerates_markdown_emphasis():
    assert extract_answer_line("so\n**ANSWER:** D") == "D"
    assert extract_answer_line("so\n**ANSWER: D**") == "D"


def test_no_answer_line_returns_none():
    assert extract_answer_line("The answer is C.") is None
    assert extract_answer_line("") is None


def test_answer_mid_line_does_not_count():
    assert extract_answer_line("I think the ANSWER: C") is None


def test_mcq_accepts_single_letter():
    assert parse_mcq("C") == "C"
    assert parse_mcq("c") == "C"
    assert parse_mcq("(B)") == "B"
    assert parse_mcq("D) 14") == "D"
    assert parse_mcq("A.") == "A"


def test_mcq_rejects_anything_else():
    assert parse_mcq("E") is None
    assert parse_mcq("All of them") is None
    assert parse_mcq("12") is None
    assert parse_mcq("C or D") is None


def test_number_parses_decimal_fraction_negative():
    assert parse_number("0.5") == 0.5
    assert parse_number(".5") == 0.5
    assert parse_number("1/2") == 0.5
    assert parse_number("-3/4") == -0.75
    assert parse_number("-12") == -12


def test_number_strips_units_and_formatting():
    assert parse_number("$1,200") == 1200
    assert parse_number("25%") == 25
    assert parse_number("7.") == 7
    assert parse_number("x = 4") == 4


def test_number_handles_latex():
    assert parse_number(r"\frac{3}{8}") == 0.375
    assert parse_number(r"\boxed{-2}") == -2


def test_number_rejects_garbage():
    assert parse_number("about five") is None
    assert parse_number("1/0") is None
    assert parse_number("3 or 4") is None
