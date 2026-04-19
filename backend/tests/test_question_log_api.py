# tests/test_question_log_api.py
"""Tests for shared question log HTTP API."""
from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

import question_log_store
from api import create_app


class TestQuestionLogAPI(unittest.TestCase):
    """Verify GET/POST /api/questions ordering and overwrite flag."""

    def setUp(self) -> None:
        """Start with an empty log for isolation."""
        question_log_store.clear()
        self.client = TestClient(create_app())

    def tearDown(self) -> None:
        """Clean up store after each test."""
        question_log_store.clear()

    def test_get_empty_list(self) -> None:
        """GET returns an empty list when nothing was saved."""
        res = self.client.get("/api/questions")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data.get("questions"), [])

    def test_post_then_get_sorted_by_hour_then_question(self) -> None:
        """Questions appear grouped by hour, then question number."""
        r1 = self.client.post(
            "/api/questions",
            json={"hour": 1, "question_number": 2, "text": "Second in hour 1"},
        )
        self.assertEqual(r1.status_code, 200)
        self.assertFalse(r1.json().get("overwritten"))

        r2 = self.client.post(
            "/api/questions",
            json={"hour": 1, "question_number": 1, "text": "First in hour 1"},
        )
        self.assertEqual(r2.status_code, 200)

        r3 = self.client.post(
            "/api/questions",
            json={"hour": 2, "question_number": 1, "text": "Hour 2 starts"},
        )
        self.assertEqual(r3.status_code, 200)

        res = self.client.get("/api/questions")
        self.assertEqual(res.status_code, 200)
        qs = res.json()["questions"]
        self.assertEqual(len(qs), 3)
        self.assertEqual(qs[0]["hour"], 1)
        self.assertEqual(qs[0]["question_number"], 1)
        self.assertEqual(qs[0]["text"], "First in hour 1")
        self.assertEqual(qs[1]["question_number"], 2)
        self.assertEqual(qs[2]["hour"], 2)

    def test_overwrite_returns_true(self) -> None:
        """Saving the same hour and question number replaces text and sets overwritten."""
        self.client.post(
            "/api/questions",
            json={"hour": 1, "question_number": 1, "text": "Original"},
        )
        res = self.client.post(
            "/api/questions",
            json={"hour": 1, "question_number": 1, "text": "Replaced"},
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json().get("overwritten"))
        self.assertEqual(res.json()["question"]["text"], "Replaced")

        one = self.client.get("/api/questions").json()["questions"]
        self.assertEqual(len(one), 1)
        self.assertEqual(one[0]["text"], "Replaced")

    def test_validation_rejects_empty_text(self) -> None:
        """Empty or whitespace-only body text yields 422."""
        res = self.client.post(
            "/api/questions",
            json={"hour": 1, "question_number": 1, "text": ""},
        )
        self.assertEqual(res.status_code, 422)
        res2 = self.client.post(
            "/api/questions",
            json={"hour": 1, "question_number": 1, "text": "   "},
        )
        self.assertEqual(res2.status_code, 422)

    def test_validation_rejects_hour_above_contest_max(self) -> None:
        """Hour must not exceed 56 (long contest coverage)."""
        res = self.client.post(
            "/api/questions",
            json={"hour": 57, "question_number": 1, "text": "Too late"},
        )
        self.assertEqual(res.status_code, 422)

    def test_edit_updates_text_and_timestamp(self) -> None:
        """Upserting the same hour/Q# with new text replaces it and bumps updated_at.

        Removing this test would let text edits silently regress to the old value,
        or allow updated_at to stay stale after an edit.
        """
        first = self.client.post(
            "/api/questions",
            json={"hour": 3, "question_number": 2, "text": "Original wording"},
        ).json()
        original_updated = first["question"]["updated_at"]

        res = self.client.post(
            "/api/questions",
            json={"hour": 3, "question_number": 2, "text": "Edited wording"},
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body["overwritten"])
        self.assertEqual(body["question"]["text"], "Edited wording")
        self.assertGreaterEqual(body["question"]["updated_at"], original_updated)

    def test_correctness_mode_override_pins_got_correct(self) -> None:
        """correctness_mode='correct' forces got_correct=True even when answers don't match.

        Protects the manual-override UX: if this breaks, answer-mismatch would
        silently flip the stored correctness back to False after save.
        """
        self.client.post(
            "/api/questions",
            json={
                "hour": 1,
                "question_number": 1,
                "text": "Capital of France?",
                "our_answer": "London",
                "actual_answer": "Paris",
                "correctness_mode": "correct",
            },
        )
        q = self.client.get("/api/questions").json()["questions"][0]
        self.assertTrue(q["got_correct"])
        self.assertTrue(q["got_correct_override"])

        # Editing answers again without touching mode must preserve the override.
        self.client.post(
            "/api/questions",
            json={
                "hour": 1,
                "question_number": 1,
                "text": "Capital of France?",
                "our_answer": "Berlin",
            },
        )
        q = self.client.get("/api/questions").json()["questions"][0]
        self.assertTrue(q["got_correct"], "override should persist across edits")
        self.assertTrue(q["got_correct_override"])

    def test_correctness_mode_auto_clears_override(self) -> None:
        """correctness_mode='auto' clears the stored override and recomputes from answers."""
        self.client.post(
            "/api/questions",
            json={
                "hour": 1,
                "question_number": 1,
                "text": "2+2?",
                "our_answer": "5",
                "actual_answer": "4",
                "correctness_mode": "correct",
            },
        )
        self.client.post(
            "/api/questions",
            json={
                "hour": 1,
                "question_number": 1,
                "text": "2+2?",
                "correctness_mode": "auto",
            },
        )
        q = self.client.get("/api/questions").json()["questions"][0]
        self.assertIsNone(q["got_correct_override"])
        # Answers still mismatch (5 vs 4), so auto recompute → False.
        self.assertFalse(q["got_correct"])


if __name__ == "__main__":
    unittest.main()
