"""SQLAlchemy model and engine helpers for persistent shared question log (PostgreSQL / SQLite)."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from sqlalchemy import Boolean, Integer, Text, create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool


class Base(DeclarativeBase):
    """Declarative base for question log ORM models."""

    pass


class QuestionLogRow(Base):
    """One row: trivia hour + question number → question text and scoring (composite PK)."""

    __tablename__ = "question_log"

    hour: Mapped[int] = mapped_column(Integer, primary_key=True)
    question_number: Mapped[int] = mapped_column(Integer, primary_key=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False)
    our_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    actual_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    point_value: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    got_correct: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="0")


def normalize_database_url(url: str) -> str:
    """Make database URL suitable for SQLAlchemy + psycopg2 (Render / local).

    Args:
        url: Raw ``DATABASE_URL`` or SQLite path.

    Returns:
        Normalized URL string.

    Raises:
        ValueError: If the URL is empty or unsupported.
    """

    u = url.strip()
    if not u:
        raise ValueError("database URL is empty")
    # Render legacy prefix
    if u.startswith("postgres://"):
        u = "postgresql+psycopg2://" + u[len("postgres://") :]
    elif u.startswith("postgresql://") and not u.startswith("postgresql+"):
        u = "postgresql+psycopg2://" + u[len("postgresql://") :]
    return u


def create_engine_for_url(url: str) -> Engine:
    """Create a SQLAlchemy engine with sensible defaults for SQLite vs PostgreSQL.

    Args:
        url: Normalized database URL.

    Returns:
        Configured :class:`sqlalchemy.engine.Engine`.
    """

    nu = normalize_database_url(url)
    if nu.startswith("sqlite"):
        # Same in-memory DB across connections; file URLs get default pool.
        connect_args: dict[str, Any] = {"check_same_thread": False}
        if ":memory:" in nu:
            return create_engine(
                nu,
                connect_args=connect_args,
                poolclass=StaticPool,
            )
        # Ensure parent directory exists for file-based SQLite
        m = re.match(r"sqlite:///(.+)", nu)
        if m and m.group(1) not in (":memory:",):
            Path(m.group(1)).parent.mkdir(parents=True, exist_ok=True)
        return create_engine(nu, connect_args=connect_args)
    return create_engine(nu, pool_pre_ping=True)


def migrate_question_log_columns(engine: Engine) -> None:
    """Add scoring columns to ``question_log`` when upgrading an existing database."""

    insp = inspect(engine)
    if not insp.has_table("question_log"):
        return
    have = {c["name"] for c in insp.get_columns("question_log")}
    is_sqlite = engine.dialect.name == "sqlite"
    ddl: list[str] = []
    if "our_answer" not in have:
        ddl.append("ALTER TABLE question_log ADD COLUMN our_answer TEXT")
    if "actual_answer" not in have:
        ddl.append("ALTER TABLE question_log ADD COLUMN actual_answer TEXT")
    if "point_value" not in have:
        ddl.append(
            "ALTER TABLE question_log ADD COLUMN point_value INTEGER NOT NULL DEFAULT 0"
        )
    if "got_correct" not in have:
        if is_sqlite:
            ddl.append(
                "ALTER TABLE question_log ADD COLUMN got_correct INTEGER NOT NULL DEFAULT 0"
            )
        else:
            ddl.append(
                "ALTER TABLE question_log ADD COLUMN got_correct BOOLEAN NOT NULL DEFAULT FALSE"
            )
    if not ddl:
        return
    with engine.begin() as conn:
        for stmt in ddl:
            conn.execute(text(stmt))


def init_schema(engine: Engine) -> None:
    """Create tables if they do not exist, then apply additive migrations."""

    Base.metadata.create_all(bind=engine)
    migrate_question_log_columns(engine)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    """Return a session factory bound to ``engine``."""

    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
