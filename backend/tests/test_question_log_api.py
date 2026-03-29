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


if __name__ == "__main__":
    unittest.main()
