# scripts/seed_question_log_sample.py
"""Insert sample rows into the shared question log via the HTTP API.

Usage (API server must be running, default base ``http://127.0.0.1:8000``)::

    cd backend && . .venv/bin/activate && python scripts/seed_question_log_sample.py

Questions use hour **1..56** (inclusive) and question numbers starting at 1.
Re-running overwrites the same hour/Q# pairs.
"""
from __future__ import annotations

import argparse
import sys

import httpx


def build_samples(
    max_hour: int,
    questions_per_hour: int,
) -> list[dict[str, int | str]]:
    """Build POST bodies for seeding the log.

    Args:
        max_hour: Last trivia hour to include (1..56).
        questions_per_hour: How many question numbers per hour (>= 1).

    Returns:
        List of dicts suitable for JSON bodies to ``POST /api/questions``.
    """

    out: list[dict[str, int | str]] = []
    for hour in range(1, max_hour + 1):
        for qn in range(1, questions_per_hour + 1):
            out.append(
                {
                    "hour": hour,
                    "question_number": qn,
                    "text": (
                        f"[sample] Hour {hour} · Q{qn} — "
                        f"pagination test row ({hour}/{max_hour})."
                    ),
                }
            )
    return out


def seed(base_url: str, bodies: list[dict[str, int | str]]) -> tuple[int, int]:
    """POST each body to ``/api/questions``.

    Args:
        base_url: API root URL with no trailing slash.
        bodies: Payload list.

    Returns:
        Tuple of (success count, failure count).
    """

    root = base_url.rstrip("/")
    ok = 0
    fail = 0
    with httpx.Client(timeout=30.0) as client:
        for body in bodies:
            res = client.post(f"{root}/api/questions", json=body)
            if res.status_code == 200:
                ok += 1
            else:
                fail += 1
                print(
                    f"FAIL hour={body['hour']} q={body['question_number']}: "
                    f"{res.status_code} {res.text[:200]}",
                    file=sys.stderr,
                )
    return ok, fail


def main() -> None:
    """Parse CLI args and run the seed."""

    parser = argparse.ArgumentParser(
        description="Seed shared question log with sample data for UI testing."
    )
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8000",
        help="API base URL (no trailing slash)",
    )
    parser.add_argument(
        "--max-hour",
        type=int,
        default=56,
        help="Last hour to fill (default 56)",
    )
    parser.add_argument(
        "--questions-per-hour",
        type=int,
        default=1,
        help="Question numbers 1..N per hour (default 1)",
    )
    args = parser.parse_args()

    if args.max_hour < 1 or args.max_hour > 56:
        print("max-hour must be between 1 and 56.", file=sys.stderr)
        sys.exit(1)
    if args.questions_per_hour < 1:
        print("questions-per-hour must be at least 1.", file=sys.stderr)
        sys.exit(1)

    bodies = build_samples(args.max_hour, args.questions_per_hour)
    print(f"Posting {len(bodies)} rows to {args.base_url} …")
    ok, fail = seed(args.base_url, bodies)
    print(f"Done: {ok} ok, {fail} failed.")


if __name__ == "__main__":
    main()
