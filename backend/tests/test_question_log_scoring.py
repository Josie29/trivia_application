# tests/test_question_log_scoring.py
"""Tests for answer scoring fields and correctness on the shared question log."""
from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

import question_log_store
from api import create_app
from question_log_scoring import compute_got_correct


class TestQuestionLogScoring(unittest.TestCase):
    """Scoring fields persist; got_correct follows normalized answer match."""

    def test_compute_got_correct_pure(self) -> None:
        """Helper matches case-insensitively and rejects blanks."""
        self.assertTrue(compute_got_correct(" Paris ", "paris"))
        self.assertFalse(compute_got_correct("a", ""))
        self.assertFalse(compute_got_correct("", "b"))

    def setUp(self) -> None:
        """Clear log and create client."""
        question_log_store.clear()
        self.client = TestClient(create_app())

    def tearDown(self) -> None:
        """Clean store."""
        question_log_store.clear()

    def test_post_includes_defaults_when_omitted(self) -> None:
        """GET after minimal POST exposes empty answers, zero points, got_correct false."""
        r = self.client.post(
            "/api/questions",
            json={"hour": 1, "question_number": 1, "text": "What is 2+2?"},
        )
        self.assertEqual(r.status_code, 200)
        q = r.json()["question"]
        self.assertEqual(q["our_answer"], "")
        self.assertEqual(q["actual_answer"], "")
        self.assertEqual(q["point_value"], 0)
        self.assertFalse(q["got_correct"])

    def test_got_correct_when_answers_match_case_insensitive(self) -> None:
        """got_correct is true when trimmed casefold values match."""
        r = self.client.post(
            "/api/questions",
            json={
                "hour": 1,
                "question_number": 1,
                "text": "Capital of France?",
                "our_answer": " Paris ",
                "actual_answer": "paris",
                "point_value": 2,
            },
        )
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["question"]["got_correct"])
        self.assertEqual(r.json()["question"]["point_value"], 2)

    def test_got_false_when_one_side_empty(self) -> None:
        """got_correct is false if either answer is missing."""
        r = self.client.post(
            "/api/questions",
            json={
                "hour": 1,
                "question_number": 1,
                "text": "Q1",
                "our_answer": "yes",
                "actual_answer": "",
            },
        )
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()["question"]["got_correct"])

    def test_merge_preserves_scoring_when_resaving_question_text_only(self) -> None:
        """Omitting scoring fields on overwrite does not clear prior answers."""
        self.client.post(
            "/api/questions",
            json={
                "hour": 2,
                "question_number": 3,
                "text": "First wording",
                "our_answer": "A",
                "actual_answer": "A",
                "point_value": 5,
            },
        )
        r2 = self.client.post(
            "/api/questions",
            json={
                "hour": 2,
                "question_number": 3,
                "text": "Revised wording",
            },
        )
        self.assertEqual(r2.status_code, 200)
        q = r2.json()["question"]
        self.assertEqual(q["text"], "Revised wording")
        self.assertEqual(q["our_answer"], "A")
        self.assertEqual(q["actual_answer"], "A")
        self.assertEqual(q["point_value"], 5)
        self.assertTrue(q["got_correct"])


if __name__ == "__main__":
    unittest.main()
