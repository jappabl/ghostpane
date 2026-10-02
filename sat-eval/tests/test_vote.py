from sateval.vote import majority


def test_unanimous():
    assert majority(["C", "C", "C"]) == ("C", "3/3", False)


def test_two_of_three():
    assert majority(["B", "C", "C"]) == ("C", "2/3", False)


def test_three_way_split_uses_first_sample():
    # Callers order samples so the strongest model comes first.
    assert majority(["A", "B", "C"]) == ("A", "split", True)


def test_unparsed_samples_do_not_vote():
    assert majority([None, "D", "D"]) == ("D", "2/3", False)


def test_single_parsed_sample_falls_back():
    assert majority([None, None, "B"]) == ("B", "single", False)


def test_two_parsed_disagreeing_is_split():
    assert majority([None, "A", "B"]) == ("A", "split", True)


def test_nothing_parsed():
    assert majority([None, None, None]) == (None, "none", False)


def test_numeric_answers_vote_by_value():
    assert majority([0.5, 0.50001, 2.0]) == (0.5, "2/3", False)
