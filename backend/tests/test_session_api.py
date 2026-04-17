# tests/test_session_api.py
"""Tests for GET /api/session shared session status."""
from fastapi.testclient import TestClient

from api import create_app


class TestSessionApi:
    """Session status endpoint."""

    def test_session_inactive_by_default(self) -> None:
        """Fresh app reports no active session."""
        client = TestClient(create_app())
        res = client.get("/api/session")
        assert res.status_code == 200
        data = res.json()
        assert data["active"] is False
        assert data.get("stream_url") in (None, "")
