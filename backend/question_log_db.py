"""SQLAlchemy model and engine helpers for persistent shared question log (PostgreSQL / SQLite)."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from sqlalchemy import Integer, Text, create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool


class Base(DeclarativeBase):
    """Declarative base for question log ORM models."""

    pass


class QuestionLogRow(Base):
    """One row: trivia hour + question number → text (composite primary key)."""

    __tablename__ = "question_log"

    hour: Mapped[int] = mapped_column(Integer, primary_key=True)
    question_number: Mapped[int] = mapped_column(Integer, primary_key=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(Text, nullable=False)


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


def init_schema(engine: Engine) -> None:
    """Create tables if they do not exist."""

    Base.metadata.create_all(bind=engine)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    """Return a session factory bound to ``engine``."""

    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
