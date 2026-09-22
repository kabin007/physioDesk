import datetime as dt
import uuid
from typing import Annotated, ClassVar

from pydantic import Field, StringConstraints

from app.core.enums import AppointmentStatus, PaymentMethod, SessionType
from app.schemas.common import APIModel, ClockTime, ORMModel, PatchModel
from app.schemas.patient import PatientSummary
from app.schemas.therapist import TherapistSummary

Notes = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class AppointmentCreate(APIModel):
    patient_id: uuid.UUID
    therapist_id: uuid.UUID
    appointment_date: dt.date = Field(description="Clinic-local date.")
    start_time: ClockTime = Field(
        description="Must be a slot start in the therapist's schedule. The end time is "
        "derived from the therapist's slot duration."
    )
    payment_method: PaymentMethod
    session_type: SessionType = SessionType.TREATMENT
    notes: Notes | None = None


class AppointmentUpdate(PatchModel):
    """Reschedule (therapist/date/start_time), change status or edit details.

    Allowed status transitions: BOOKED -> COMPLETED | CANCELLED. COMPLETED and CANCELLED are
    final; book a new appointment instead of reviving a cancelled one.
    """

    nullable_fields: ClassVar[frozenset[str]] = frozenset({"notes"})

    therapist_id: uuid.UUID | None = None
    appointment_date: dt.date | None = None
    start_time: ClockTime | None = None
    status: AppointmentStatus | None = None
    payment_method: PaymentMethod | None = None
    session_type: SessionType | None = None
    notes: Notes | None = None


class AppointmentRead(ORMModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    therapist_id: uuid.UUID
    appointment_date: dt.date
    start_time: ClockTime
    end_time: ClockTime
    status: AppointmentStatus
    session_type: SessionType
    payment_method: PaymentMethod
    notes: str | None
    patient: PatientSummary
    therapist: TherapistSummary
    created_at: dt.datetime
    updated_at: dt.datetime
