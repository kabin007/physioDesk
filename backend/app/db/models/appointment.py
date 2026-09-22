import uuid
from datetime import date, time
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Date, Enum, ForeignKey, Index, Text, Time, text
from sqlalchemy.dialects.postgresql import ExcludeConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import AppointmentStatus, PaymentMethod, SessionType
from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.patient import Patient
    from app.db.models.therapist import Therapist

# Constraint names are referenced by the service layer to translate violations into 409s.
THERAPIST_OVERLAP_CONSTRAINT = "ex_appointments_therapist_no_overlap"
PATIENT_OVERLAP_CONSTRAINT = "ex_appointments_patient_no_overlap"

# [start, end) as a timestamp range. `date + time` is immutable, so it is index-safe.
_TIME_RANGE = text("tsrange(appointment_date + start_time, appointment_date + end_time, '[)')")
_ACTIVE = text("status <> 'CANCELLED'")


class Appointment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "appointments"
    __table_args__ = (
        CheckConstraint("start_time < end_time", name="time_order"),
        # The real double-booking guarantee: PostgreSQL rejects any two non-cancelled
        # appointments for the same therapist (or patient) whose time ranges overlap,
        # regardless of how many requests race. Requires the btree_gist extension.
        ExcludeConstraint(
            ("therapist_id", "="),
            (_TIME_RANGE, "&&"),
            where=_ACTIVE,
            using="gist",
            name=THERAPIST_OVERLAP_CONSTRAINT,
        ),
        ExcludeConstraint(
            ("patient_id", "="),
            (_TIME_RANGE, "&&"),
            where=_ACTIVE,
            using="gist",
            name=PATIENT_OVERLAP_CONSTRAINT,
        ),
        Index("ix_appointments_therapist_date", "therapist_id", "appointment_date"),
    )

    # RESTRICT: appointments are clinical history and must never vanish via a cascade.
    patient_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("patients.id", ondelete="RESTRICT"), index=True
    )
    # Indexed via the composite (therapist_id, appointment_date) index in __table_args__.
    therapist_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("therapists.id", ondelete="RESTRICT"))
    appointment_date: Mapped[date] = mapped_column(Date, index=True)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    status: Mapped[AppointmentStatus] = mapped_column(
        Enum(AppointmentStatus, name="appointment_status"),
        server_default=AppointmentStatus.BOOKED.value,
        index=True,
    )
    session_type: Mapped[SessionType] = mapped_column(
        Enum(SessionType, name="session_type"),
        server_default=SessionType.TREATMENT.value,
    )
    payment_method: Mapped[PaymentMethod] = mapped_column(
        Enum(PaymentMethod, name="payment_method")
    )
    notes: Mapped[str | None] = mapped_column(Text)

    patient: Mapped["Patient"] = relationship(back_populates="appointments")
    therapist: Mapped["Therapist"] = relationship()
