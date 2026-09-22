import datetime as dt
import uuid
from decimal import Decimal
from typing import Annotated, ClassVar

from pydantic import Field

from app.core.enums import Gender, PatientStatus
from app.schemas.common import APIModel, ClockTime, ORMModel, PatchModel, Phone, Text120, Text255
from app.schemas.therapist import TherapistSummary

Age = Annotated[int, Field(ge=1, le=130, examples=[42])]


class PatientCreate(APIModel):
    full_name: Text120 = Field(examples=["Sita Sharma"])
    phone: Phone = Field(examples=["+977 9841234567"])
    age: Age
    gender: Gender
    address: Text255 | None = None
    condition: Text255 = Field(examples=["Lower back pain"])
    assigned_therapist_id: uuid.UUID | None = None
    package: Text120 | None = Field(default=None, examples=["10-session rehab package"])
    status: PatientStatus = PatientStatus.ACTIVE


class PatientUpdate(PatchModel):
    nullable_fields: ClassVar[frozenset[str]] = frozenset(
        {"address", "assigned_therapist_id", "package"}
    )

    full_name: Text120 | None = None
    phone: Phone | None = None
    age: Age | None = None
    gender: Gender | None = None
    address: Text255 | None = None
    condition: Text255 | None = None
    assigned_therapist_id: uuid.UUID | None = None
    package: Text120 | None = None
    status: PatientStatus | None = None


class PatientSummary(ORMModel):
    id: uuid.UUID
    full_name: str
    phone: str


class PatientRead(ORMModel):
    id: uuid.UUID
    full_name: str
    phone: str
    age: int
    gender: Gender
    address: str | None
    condition: str
    assigned_therapist_id: uuid.UUID | None
    assigned_therapist: TherapistSummary | None
    package: str | None
    status: PatientStatus
    created_at: dt.datetime
    updated_at: dt.datetime


class NextAppointment(APIModel):
    id: uuid.UUID
    appointment_date: dt.date
    start_time: ClockTime
    therapist_name: str


class PatientStats(APIModel):
    completed_sessions: int
    upcoming_appointments: int
    cancelled_appointments: int
    last_visit_date: dt.date | None = Field(description="Date of the latest COMPLETED session.")
    next_appointment: NextAppointment | None
    total_paid: Decimal = Field(description="Sum of PAID invoice totals.")
    outstanding_balance: Decimal = Field(description="Sum of DUE invoice totals.")


class PatientDetail(PatientRead):
    """Profile overview. Full session and billing history are served by the
    `/patients/{id}/appointments` and `/patients/{id}/invoices` sub-resources."""

    stats: PatientStats
