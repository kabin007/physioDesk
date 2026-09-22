import datetime as dt
import uuid
from decimal import Decimal

from pydantic import Field

from app.core.enums import PatientStatus
from app.schemas.common import APIModel, ClockTime, ORMModel
from app.schemas.therapist import TherapistSummary


class TherapistCapacity(APIModel):
    therapist: TherapistSummary
    working_start: ClockTime
    working_end: ClockTime
    total_slots: int
    booked_slots: int = Field(description="Slots holding a BOOKED or COMPLETED appointment.")
    open_slots: int


class RecentPatient(ORMModel):
    id: uuid.UUID
    full_name: str
    condition: str
    assigned_therapist: TherapistSummary | None
    package: str | None
    status: PatientStatus
    created_at: dt.datetime


class DashboardRead(APIModel):
    date: dt.date = Field(description="Clinic-local date the statistics refer to.")
    patients_seen_today: int = Field(
        description="Distinct patients with a COMPLETED appointment on this date."
    )
    therapists_on_duty_today: int = Field(
        description="Active therapists whose resolved schedule (overrides included) has them "
        "working on this date."
    )
    revenue_collected_today: Decimal = Field(
        description="Sum of PAID invoice totals whose paid_at falls on this clinic date."
    )
    open_slots_remaining_today: int = Field(
        description="Generated slots of on-duty therapists minus non-cancelled appointments."
    )
    total_slots_today: int
    booked_slots_today: int
    therapist_capacity: list[TherapistCapacity]
    recent_patients: list[RecentPatient] = Field(description="The 5 most recently added.")
