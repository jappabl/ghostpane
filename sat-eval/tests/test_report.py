import pytest

from sateval.report import improved, percentile, wilson


def test_wilson_matches_known_values():
    lo, hi = wilson(81, 100)
    assert lo == pytest.approx(0.7222, abs=1e-3)
    assert hi == pytest.approx(0.8749, abs=1e-3)


def test_wilson_edges():
    assert wilson(0, 0) == (0.0, 0.0)
    lo, hi = wilson(10, 10)
    assert hi == pytest.approx(1.0) and lo == pytest.approx(0.7225, abs=1e-3)


def test_percentile():
    xs = list(range(1, 11))
    assert percentile(xs, 50) == pytest.approx(5.5)
    assert percentile(xs, 90) == pytest.approx(9.1)


def test_improvement_requires_non_overlapping_intervals():
    # 150/200 vs 160/200 overlap heavily: not an improvement.
    assert improved((150, 200), (160, 200)) is False
    # 120/200 vs 170/200 do not overlap.
    assert improved((120, 200), (170, 200)) is True
    # A drop is never an improvement.
    assert improved((170, 200), (120, 200)) is False
