"""Helpers for interpreting database errors raised through SQLAlchemy + asyncpg."""

from sqlalchemy.exc import IntegrityError


def violated_constraint(exc: IntegrityError) -> str | None:
    """Name of the constraint behind an IntegrityError, if the driver reports it.

    SQLAlchemy wraps the asyncpg exception; asyncpg exposes `constraint_name` on the original
    error, which is chained as the adapter's `__cause__`.
    """
    candidates = (exc.orig, getattr(exc.orig, "__cause__", None))
    for candidate in candidates:
        name = getattr(candidate, "constraint_name", None)
        if isinstance(name, str):
            return name
    return None
