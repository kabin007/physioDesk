import datetime as dt
import uuid
from typing import Annotated, ClassVar, Self

from pydantic import AfterValidator, Field, computed_field, model_validator

from app.core.enums import AppointmentStatus, AvailabilitySource, SlotStatus
from app.schemas.common import APIModel, ClockTime, ORMModel, PatchModel, Text120, Text255
from app.utils.datetime import minutes_since_midnight


def _normalise_days(days: list[int]) -> list[int]:
    return sorted(set(days))


WorkingDays = Annotated[
    list[Annotated[int, Field(ge=1, le=7)]],
    Field(
        min_length=1,
        max_length=7,
        description="ISO weekdays: 1 = Monday ... 7 = Sunday. Duplicates are removed.",
        examples=[[1, 2, 3, 4, 5]],
    ),
    AfterValidator(_normalise_days),
]
SlotDuration = Annotated[int, Field(gt=0, le=480, examples=[30])]


def check_working_hours(start: dt.time, end: dt.time, slot_duration: int) -> None:
    """Shared by create validation and by the service after merging a PATCH."""
    if start >= end:
        raise ValueError("start_time must be before end_time")
    if slot_duration > minutes_since_midnight(end) - minutes_since_midnight(start):
        raise ValueError("slot_duration_minutes must fit at least once between start and end")


class TherapistCreate(APIModel):
    name: Text120
    specialty: Text120
    working_days: WorkingDays
    start_time: ClockTime
    end_time: ClockTime
    slot_duration_minutes: SlotDuration
    is_active: bool = True

    @model_validator(mode="after")
    def _check_hours(self) -> Self:
        check_working_hours(self.start_time, self.end_time, self.slot_duration_minutes)
        return self


class TherapistUpdate(PatchModel):
    name: Text120 | None = None
    specialty: Text120 | None = None
    working_days: WorkingDays | None = None
    start_time: ClockTime | None = None
    end_time: ClockTime | None = None
    slot_duration_minutes: SlotDuration | None = None
    is_active: bool | None = None


class TherapistSummary(ORMModel):
    id: uuid.UUID
    name: str
    specialty: str


class TherapistRead(ORMModel):
    id: uuid.UUID
    name: str
    specialty: str
    working_days: list[int]
    start_time: ClockTime
    end_time: ClockTime
    slot_duration_minutes: int
    is_active: bool
    created_at: dt.datetime
    updated_at: dt.datetime

    @computed_field(description="Regular scheduled hours per week.")  # type: ignore[prop-decorator]
    @property
    def weekly_hours(self) -> float:
        daily = minutes_since_midnight(self.end_time) - minutes_since_midnight(self.start_time)
        return round(daily * len(self.working_days) / 60, 2)


class TherapistListItem(TherapistRead):
    patients_seen_today: int = Field(
        description="Distinct patients with a COMPLETED appointment with this therapist today."
    )


# --- Schedule overrides ---------------------------------------------------------------------


def check_override(is_day_off: bool, start: dt.time | None, end: dt.time | None) -> None:
    if is_day_off:
        if start is not None or end is not None:
            raise ValueError("a day-off override must not define start_time/end_time")
        return
    if start is None or end is None:
        raise ValueError("custom-hours overrides require both start_time and end_time")
    if start >= end:
        raise ValueError("start_time must be before end_time")


class ScheduleOverrideCreate(APIModel):
    date: dt.date
    is_day_off: bool = Field(
        default=False, description="True: therapist is off. False: works custom hours."
    )
    start_time: ClockTime | None = None
    end_time: ClockTime | None = None
    note: Text255 | None = None

    @model_validator(mode="after")
    def _check(self) -> Self:
        check_override(self.is_day_off, self.start_time, self.end_time)
        return self


class ScheduleOverrideUpdate(PatchModel):
    nullable_fields: ClassVar[frozenset[str]] = frozenset({"start_time", "end_time", "note"})

    date: dt.date | None = None
    is_day_off: bool | None = None
    start_time: ClockTime | None = None
    end_time: ClockTime | None = None
    note: Text255 | None = None


class ScheduleOverrideRead(ORMModel):
    id: uuid.UUID
    therapist_id: uuid.UUID
    date: dt.date
    is_day_off: bool
    start_time: ClockTime | None
    end_time: ClockTime | None
    note: str | None
    created_at: dt.datetime
    updated_at: dt.datetime


# --- Generated schedule grid ------------------------------------------------------------------


class ScheduleSlotRead(APIModel):
    start_time: ClockTime
    end_time: ClockTime
    status: SlotStatus
    appointment_id: uuid.UUID | None = None
    appointment_status: AppointmentStatus | None = None
    patient_id: uuid.UUID | None = None
    patient_name: str | None = None


class TherapistScheduleRead(APIModel):
    therapist_id: uuid.UUID
    therapist_name: str
    specialty: str
    date: dt.date
    is_working: bool
    availability_source: AvailabilitySource
    working_start: ClockTime | None
    working_end: ClockTime | None
    slot_duration_minutes: int
    slots: list[ScheduleSlotRead]


class ScheduleRead(APIModel):
    date: dt.date
    therapists: list[TherapistScheduleRead]
