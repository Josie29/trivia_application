"""Derived correctness for shared question log from ``our`` vs ``actual`` answers."""
from __future__ import annotations


def compute_got_correct(our_answer: str, actual_answer: str) -> bool:
    """Return True when both sides are non-empty after trim and compare equal case-insensitively.

    Args:
        our_answer: The team's submitted answer.
        actual_answer: The official correct answer.

    Returns:
        bool: ``True`` if both strings are non-empty after stripping and match under casefold.
    """

    o = our_answer.strip().casefold()
    a = actual_answer.strip().casefold()
    if not o or not a:
        return False
    return o == a
