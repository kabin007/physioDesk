import datetime as dt
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    SmallInteger,
    String,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.patient import Patient


class Therapist(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "therapists"
    __table_args__ = (
        CheckConstraint("start_time < end_time", name="working_hours_order"),
        CheckConstraint(
            "slot_duration_minutes > 0 AND slot_duration_minutes <= 480",
            name="slot_duration_range",
        ),
        # ISO weekdays (1 = Monday ... 7 = Sunday); at least one day, no invalid values.
        CheckConstraint(
            "cardinality(working_days) >= 1 AND working_days <@ ARRAY[1,2,3,4,5,6,7]::smallint[]",
            name="working_days_valid",
        ),
    )

    name: Mapped[str] = mapped_column(String(120))
    specialty: Mapped[str] = mapped_column(String(120))
    # A small fixed-domain set that is always read and written as a whole; a Postgres array
    # is simpler than a join table and still constrained by the CHECK above.
    working_days: Mapped[list[int]] = mapped_column(ARRAY(SmallInteger))
    start_time: Mapped[dt.time] = mapped_column(Time)
    end_time: Mapped[dt.time] = mapped_column(Time)
    slot_duration_minutes: Mapped[int] = mapped_column(SmallInteger)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"), index=True)

    patients: Mapped[list["Patient"]] = relationship(
        back_populates="assigned_therapist", passive_deletes=True
    )
    schedule_overrides: Mapped[list["TherapistScheduleOverride"]] = relationship(
        back_populates="therapist",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="TherapistScheduleOverride.date",
    )

    def __repr__(self) -> str:
        return f"<Therapist {self.name}>"


class TherapistScheduleOverride(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A date-specific exception to a therapist's weekly schedule: a day off or custom hours."""

    __tablename__ = "therapist_schedule_overrides"
    __table_args__ = (
        UniqueConstraint("therapist_id", "date", name="uq_schedule_override_therapist_date"),
        CheckConstraint(
            "(is_day_off AND start_time IS NULL AND end_time IS NULL)"
            " OR (NOT is_day_off AND start_time IS NOT NULL AND end_time IS NOT NULL"
            " AND start_time < end_time)",
            name="day_off_or_hours",
        ),
    )

    # Overrides are schedule configuration, not history: they go with their therapist.
    therapist_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("therapists.id", ondelete="CASCADE"))
    # `dt.date`: a bare `date` annotation would resolve to this very attribute.
    date: Mapped[dt.date] = mapped_column(Date)
    is_day_off: Mapped[bool] = mapped_column(Boolean)
    start_time: Mapped[dt.time | None] = mapped_column(Time)
    end_time: Mapped[dt.time | None] = mapped_column(Time)
    note: Mapped[str | None] = mapped_column(String(255))

    therapist: Mapped[Therapist] = relationship(back_populates="schedule_overrides")
