# tests/test_question_log_sqlite.py
"""Tests for shared question log backed by SQLite (persistence path)."""
from __future__ import annotations

import os
import tempfile
import unittest

from fastapi.testclient import TestClient

import question_log_store
from api import create_app


class TestQuestionLogSQLite(unittest.TestCase):
    """SQLite file survives reconfigure (simulates process restart)."""

    def setUp(self) -> None:
        """Use a temp SQLite file and a fresh app client."""

        self._fd, self._path = tempfile.mkstemp(suffix=".sqlite")
        os.close(self._fd)
        os.environ["QUESTION_LOG_DATABASE_URL"] = f"sqlite:///{self._path}"
        self.client = TestClient(create_app())

    def tearDown(self) -> None:
        """Tear down DB and file."""

        os.environ.pop("QUESTION_LOG_DATABASE_URL", None)
        question_log_store.reconfigure_for_tests(None)
        try:
            os.unlink(self._path)
        except OSError:
            pass

    def test_data_survives_reopen(self) -> None:
        """After dispose + reopen same SQLite URL, rows are still there."""

        r = self.client.post(
            "/api/questions",
            json={"hour": 1, "question_number": 1, "text": "Persisted"},
        )
        self.assertEqual(r.status_code, 200)
        os.environ["QUESTION_LOG_DATABASE_URL"] = f"sqlite:///{self._path}"
        self.client = TestClient(create_app())
        res = self.client.get("/api/questions")
        self.assertEqual(res.status_code, 200)
        qs = res.json()["questions"]
        self.assertEqual(len(qs), 1)
        self.assertEqual(qs[0]["text"], "Persisted")


if __name__ == "__main__":
    unittest.main()
