"""Centralised date/time helpers.

Strategy:
- Instants (created_at, paid_at, issued_at, token timestamps) are stored as UTC `timestamptz`.
- Appointment dates/times and therapist hours are clinic-local wall-clock values
  (`date` / `time without time zone`), because that is how a clinic thinks about them.
- "Today" always means today in the configured clinic timezone, never the server's.

Nothing else in the codebase should call `datetime.now()` directly.
"""

from datetime import UTC, date, datetime, time, timedelta

from app.core.config import get_settings


def utc_now() -> datetime:
    return datetime.now(UTC)


def clinic_now() -> datetime:
    return datetime.now(get_settings().clinic_tz)


def clinic_today() -> date:
    return clinic_now().date()


def clinic_day_bounds_utc(day: date) -> tuple[datetime, datetime]:
    """Return the [start, end) UTC instants covering `day` in the clinic timezone."""
    tz = get_settings().clinic_tz
    start = datetime.combine(day, time.min, tzinfo=tz)
    end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=tz)
    return start.astimezone(UTC), end.astimezone(UTC)


def to_clinic_date(instant: datetime) -> date:
    """The clinic-local calendar date of an aware instant."""
    return instant.astimezone(get_settings().clinic_tz).date()


def minutes_since_midnight(value: time) -> int:
    return value.hour * 60 + value.minute


def time_from_minutes(minutes: int) -> time:
    if not 0 <= minutes < 24 * 60:
        raise ValueError("minutes must fall within a single day")
    return time(hour=minutes // 60, minute=minutes % 60)


def add_minutes(value: time, minutes: int) -> time:
    """Add minutes to a wall-clock time. Raises ValueError if the result crosses midnight."""
    return time_from_minutes(minutes_since_midnight(value) + minutes)
