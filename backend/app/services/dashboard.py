"""Dashboard statistics, all computed from live data for one clinic-local date.

Slot capacity reuses `build_day_schedules`, the same code path as the schedule grid, so
the dashboard and the grid can never disagree. Total: 6 queries, independent of data size.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import AppointmentStatus, InvoiceStatus
from app.db.models import Appointment, Invoice, Patient
from app.schemas.dashboard import DashboardRead, RecentPatient, TherapistCapacity
from app.schemas.therapist import TherapistSummary
from app.services.scheduling import build_day_schedules
from app.utils.datetime import clinic_day_bounds_utc

RECENT_PATIENTS_LIMIT = 5


async def get_dashboard(session: AsyncSession, day: date) -> DashboardRead:
    on_duty = await build_day_schedules(session, day, only_working=True)

    patients_seen = await session.scalar(
        select(func.count(distinct(Appointment.patient_id))).where(
            Appointment.appointment_date == day,
            Appointment.status == AppointmentStatus.COMPLETED,
        )
    )

    day_start, day_end = clinic_day_bounds_utc(day)
    revenue = await session.scalar(
        select(func.coalesce(func.sum(Invoice.total), Decimal("0.00"))).where(
            Invoice.status == InvoiceStatus.PAID,
            Invoice.paid_at >= day_start,
            Invoice.paid_at < day_end,
        )
    )

    recent = (
        await session.scalars(
            select(Patient)
            .options(selectinload(Patient.assigned_therapist))
            .order_by(Patient.created_at.desc(), Patient.id)
            .limit(RECENT_PATIENTS_LIMIT)
        )
    ).all()

    capacity: list[TherapistCapacity] = []
    for d in on_duty:
        start, end = d.availability.start_time, d.availability.end_time
        if start is None or end is None:  # excluded by only_working=True; narrows types
            continue
        capacity.append(
            TherapistCapacity(
                therapist=TherapistSummary.model_validate(d.therapist),
                working_start=start,
                working_end=end,
                total_slots=d.total_slots,
                booked_slots=d.booked_slots,
                open_slots=d.open_slots,
            )
        )
    return DashboardRead(
        date=day,
        patients_seen_today=patients_seen or 0,
        therapists_on_duty_today=len(on_duty),
        revenue_collected_today=revenue or Decimal("0.00"),
        open_slots_remaining_today=sum(c.open_slots for c in capacity),
        total_slots_today=sum(c.total_slots for c in capacity),
        booked_slots_today=sum(c.booked_slots for c in capacity),
        therapist_capacity=capacity,
        recent_patients=[RecentPatient.model_validate(p) for p in recent],
    )
