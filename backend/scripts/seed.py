"""Seed the database with realistic demo data.

    uv run python -m scripts.seed           # safe to re-run
    uv run python -m scripts.seed --reset   # wipe clinic data and reseed

Re-running is safe: users are created only if missing, and clinic data (therapists,
patients, appointments, invoices) is only generated when there are no therapists yet.
`--reset` deletes clinic data first (users are kept).

All dates are relative to "today" in the clinic timezone, so the dashboard is meaningful
whenever the seed runs. Appointments are placed with the same availability rules the API
uses, so the seed never produces data the API itself would reject.
"""

import argparse
import asyncio
import logging
import random
import uuid
from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import NamedTuple

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.enums import (
    AppointmentStatus,
    Gender,
    InvoiceStatus,
    PatientStatus,
    PaymentMethod,
    SessionType,
    UserRole,
)
from app.db.models import Appointment, Invoice, Patient, Therapist, TherapistScheduleOverride, User
from app.db.session import get_engine, get_sessionmaker
from app.services.auth import create_user
from app.services.invoices import next_invoice_number
from app.services.scheduling import Slot, generate_slots, resolve_availability
from app.utils.datetime import clinic_now, utc_now

logger = logging.getLogger("seed")

# Development-only credentials, documented in the README.
USERS = [
    ("admin@physiodesk.local", "admin", "Admin123!", UserRole.ADMIN),
    ("staff@physiodesk.local", "staff", "Staff123!", UserRole.STAFF),
]

# (name, specialty, ISO working days, start, end, slot minutes)
THERAPISTS = [
    ("Dr. Anjali Shrestha", "Orthopedic rehabilitation", [7, 1, 2, 3, 4, 5], time(9), time(17), 30),
    ("Dr. Rohan Karki", "Sports physiotherapy", [1, 2, 3, 4, 5, 6], time(10), time(18), 60),
    ("Dr. Priya Gurung", "Neurological rehabilitation", [7, 1, 2, 4, 5, 6], time(8), time(14), 30),
    ("Dr. Bikash Tamang", "Pediatric physiotherapy", [1, 2, 3, 4, 5], time(12), time(18), 45),
]


class SeedPatient(NamedTuple):
    full_name: str
    phone: str
    age: int
    gender: Gender
    address: str
    condition: str
    package: str | None
    status: PatientStatus
    therapist: int | None  # index into THERAPISTS


F, M, X = Gender.FEMALE, Gender.MALE, Gender.OTHER
ACTIVE, ON_HOLD, DONE = PatientStatus.ACTIVE, PatientStatus.ON_HOLD, PatientStatus.COMPLETED

# fmt: off
PATIENTS = [
    SeedPatient("Sita Sharma", "9841234501", 42, F, "Lalitpur-3, Pulchowk",
                "Chronic lower back pain", "10-session spine care", ACTIVE, 0),
    SeedPatient("Hari Thapa", "9851234502", 28, M, "Kathmandu-10, Baneshwor",
                "ACL reconstruction rehab", "Post-surgery 12 sessions", ACTIVE, 1),
    SeedPatient("Gita Adhikari", "9801234503", 67, F, "Bhaktapur-5, Suryabinayak",
                "Post-stroke mobility", "Neuro rehab monthly", ACTIVE, 2),
    SeedPatient("Aarav Joshi", "9861234504", 9, M, "Kathmandu-4, Maharajgunj",
                "Developmental coordination disorder", "Pediatric 8 sessions", ACTIVE, 3),
    SeedPatient("Maya Rai", "9841234505", 35, F, "Lalitpur-15, Satdobato",
                "Frozen shoulder", "6-session shoulder program", ACTIVE, 0),
    SeedPatient("Nabin Khadka", "9811234506", 51, M, "Kathmandu-32, Koteshwor",
                "Knee osteoarthritis", "Pay per session", ON_HOLD, 1),
    SeedPatient("Sunita Magar", "9851234507", 24, F, "Kirtipur-2",
                "Ankle sprain (grade II)", "5-session sports recovery", DONE, 1),
    SeedPatient("Rajesh Poudel", "9841234508", 58, M, "Kathmandu-7, Chabahil",
                "Cervical spondylosis", "10-session spine care", ACTIVE, 2),
    SeedPatient("Anita Basnet", "9801234509", 31, F, "Lalitpur-9, Jawalakhel",
                "Postnatal pelvic floor weakness", "Women's health 6 sessions", ACTIVE, 0),
    SeedPatient("Kiran Lama", "9861234510", 45, X, "Bhaktapur-1, Thimi",
                "Plantar fasciitis", None, ACTIVE, None),
]
# fmt: on

SESSION_PRICES = {
    SessionType.ASSESSMENT: Decimal("2000.00"),
    SessionType.TREATMENT: Decimal("1500.00"),
    SessionType.FOLLOW_UP: Decimal("1000.00"),
}
NOTES = [
    "Manual therapy and core strengthening.",
    "Range-of-motion exercises; home program updated.",
    "Gait training with parallel bars.",
    "Ultrasound therapy and stretching.",
    "Balance and proprioception drills.",
    None,
]

DAYS_BACK = 14
DAYS_AHEAD = 7


async def ensure_users(session: AsyncSession) -> None:
    for email, username, password, role in USERS:
        exists = await session.scalar(select(User.id).where(User.email == email))
        if exists:
            logger.info("User %s already exists", email)
            continue
        await create_user(session, email=email, username=username, password=password, role=role)
        logger.info("Created %s user %s", role.value, email)


async def reset_clinic_data(session: AsyncSession) -> None:
    await session.execute(
        text(
            "TRUNCATE therapists, therapist_schedule_overrides, patients, appointments, "
            "invoices RESTART IDENTITY CASCADE"
        )
    )
    await session.execute(text("ALTER SEQUENCE invoice_number_seq RESTART"))
    await session.commit()
    logger.info("Clinic data removed")


def _clinic_instant(day: date, at: time) -> datetime:
    """A clinic-local wall-clock moment as an aware UTC datetime."""
    return datetime.combine(day, at, tzinfo=get_settings().clinic_tz).astimezone(UTC)


async def seed_clinic_data(session: AsyncSession) -> None:
    rng = random.Random(2026)  # deterministic output for a given "today"
    now = clinic_now()
    today = now.date()

    therapists = [
        Therapist(
            name=name,
            specialty=specialty,
            working_days=days,
            start_time=start,
            end_time=end,
            slot_duration_minutes=slot,
        )
        for name, specialty, days, start, end, slot in THERAPISTS
    ]
    session.add_all(therapists)
    await session.flush()

    anjali, rohan, _priya, bikash = therapists
    overrides = [
        TherapistScheduleOverride(
            therapist_id=bikash.id, date=today, is_day_off=True, note="Attending CPD workshop"
        ),
        TherapistScheduleOverride(
            therapist_id=anjali.id,
            date=today + timedelta(days=1),
            is_day_off=False,
            start_time=time(12),
            end_time=time(16),
            note="Morning at partner hospital",
        ),
        TherapistScheduleOverride(
            therapist_id=rohan.id,
            date=today + timedelta(days=5),
            is_day_off=True,
            note="Annual leave",
        ),
    ]
    session.add_all(overrides)
    overrides_by_key = {(o.therapist_id, o.date): o for o in overrides}

    patients: list[Patient] = []
    for index, seed in enumerate(PATIENTS):
        fields = seed._asdict()
        therapist_index = fields.pop("therapist")
        patient = Patient(
            **fields,
            assigned_therapist_id=(
                therapists[therapist_index].id if therapist_index is not None else None
            ),
        )
        # Stagger creation so "recent patients" has a meaningful order.
        patient.created_at = utc_now() - timedelta(days=(len(PATIENTS) - index) * 3)
        patients.append(patient)
    session.add_all(patients)
    await session.flush()

    bookable = [p for p in patients if p.status is not PatientStatus.COMPLETED]
    appointments: list[Appointment] = []
    for offset in range(-DAYS_BACK, DAYS_AHEAD + 1):
        day = today + timedelta(days=offset)
        # Patient -> time ranges already booked that day (a patient is never double-booked).
        busy: dict[uuid.UUID, list[Slot]] = defaultdict(list)
        for therapist in therapists:
            availability = resolve_availability(
                therapist, day, overrides_by_key.get((therapist.id, day))
            )
            if availability.start_time is None or availability.end_time is None:
                continue
            slots = generate_slots(
                availability.start_time, availability.end_time, therapist.slot_duration_minutes
            )
            # Busier today so the dashboard shows real capacity use.
            wanted = min(len(slots), rng.randint(3, 5) if offset == 0 else rng.randint(1, 3))
            for slot in sorted(rng.sample(slots, wanted), key=lambda s: s.start_time):
                candidates = [
                    p
                    for p in bookable
                    if all(
                        slot.end_time <= b.start_time or slot.start_time >= b.end_time
                        for b in busy[p.id]
                    )
                ]
                if not candidates:
                    continue
                patient = rng.choice(candidates)
                busy[patient.id].append(slot)

                in_past = offset < 0 or (offset == 0 and slot.end_time <= now.time())
                if in_past:
                    appointment_status = (
                        AppointmentStatus.CANCELLED
                        if rng.random() < 0.15
                        else AppointmentStatus.COMPLETED
                    )
                else:
                    appointment_status = (
                        AppointmentStatus.CANCELLED
                        if rng.random() < 0.1
                        else AppointmentStatus.BOOKED
                    )
                appointments.append(
                    Appointment(
                        patient_id=patient.id,
                        therapist_id=therapist.id,
                        appointment_date=day,
                        start_time=slot.start_time,
                        end_time=slot.end_time,
                        status=appointment_status,
                        session_type=rng.choice(list(SessionType)),
                        payment_method=rng.choice(list(PaymentMethod)),
                        notes=rng.choice(NOTES),
                    )
                )
    session.add_all(appointments)
    await session.flush()

    # Bill completed sessions: most are paid on the day, some remain due.
    invoices: list[Invoice] = []
    for appointment in appointments:
        if appointment.status is not AppointmentStatus.COMPLETED:
            continue
        subtotal = SESSION_PRICES[appointment.session_type]
        discount = rng.choice([Decimal("0.00"), Decimal("0.00"), Decimal("100.00")])
        issued = _clinic_instant(appointment.appointment_date, appointment.end_time)
        is_paid = appointment.appointment_date == today or rng.random() < 0.75
        invoices.append(
            Invoice(
                invoice_number=await next_invoice_number(session),
                patient_id=appointment.patient_id,
                service=f"{appointment.session_type.value.replace('_', ' ').title()} session",
                subtotal=subtotal,
                discount=discount,
                status=InvoiceStatus.PAID if is_paid else InvoiceStatus.DUE,
                payment_method=appointment.payment_method if is_paid else None,
                issued_at=issued,
                paid_at=issued + timedelta(minutes=5) if is_paid else None,
            )
        )
    # A package invoice paid today and a voided one, for variety.
    invoices.append(
        Invoice(
            invoice_number=await next_invoice_number(session),
            patient_id=patients[1].id,
            service="Post-surgery 12-session package",
            subtotal=Decimal("15000.00"),
            discount=Decimal("1500.00"),
            status=InvoiceStatus.PAID,
            payment_method=PaymentMethod.BANK_TRANSFER,
            issued_at=utc_now() - timedelta(minutes=30),
            paid_at=utc_now() - timedelta(minutes=20),
        )
    )
    invoices.append(
        Invoice(
            invoice_number=await next_invoice_number(session),
            patient_id=patients[4].id,
            service="Duplicate charge (voided)",
            subtotal=Decimal("1500.00"),
            discount=Decimal("0.00"),
            status=InvoiceStatus.VOID,
            issued_at=utc_now() - timedelta(days=3),
        )
    )
    session.add_all(invoices)
    await session.commit()

    logger.info(
        "Seeded %d therapists, %d overrides, %d patients, %d appointments, %d invoices",
        len(therapists),
        len(overrides),
        len(patients),
        len(appointments),
        len(invoices),
    )


async def main(reset: bool) -> None:
    async with get_sessionmaker()() as session:
        await ensure_users(session)
        if reset:
            await reset_clinic_data(session)
        if await session.scalar(select(func.count(Therapist.id))):
            logger.info("Clinic data already present; skipping (use --reset to regenerate)")
        else:
            await seed_clinic_data(session)
    await get_engine().dispose()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Seed PhysioDesk demo data.")
    parser.add_argument(
        "--reset", action="store_true", help="delete clinic data (not users) and reseed"
    )
    asyncio.run(main(parser.parse_args().reset))
