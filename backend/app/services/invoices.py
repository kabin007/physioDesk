"""Invoices.

- `total` is a generated column (subtotal - discount); clients never supply it.
- Invoice numbers are `INV-<clinic year>-<6-digit sequence>`, taken from a PostgreSQL
  sequence: unique and race-free without locks. The sequence is global rather than reset
  yearly, so numbers stay monotonic; gaps (from rolled-back transactions) are acceptable.
- DELETE voids the invoice. Billing history is never erased and VOID invoices are immutable.
"""

import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.enums import InvoiceStatus
from app.core.exceptions import InvalidInvoice, InvoiceNotFound, InvoiceVoided, PatientNotFound
from app.db.models import Invoice, Patient, invoice_number_seq
from app.schemas.common import PageParams
from app.schemas.invoice import InvoiceCreate, InvoiceUpdate
from app.services.patients import contains_pattern
from app.utils.datetime import clinic_now, utc_now


def _with_patient(query: Select[tuple[Invoice]]) -> Select[tuple[Invoice]]:
    return query.options(joinedload(Invoice.patient))


async def get_invoice(session: AsyncSession, invoice_id: uuid.UUID) -> Invoice:
    invoice = await session.scalar(_with_patient(select(Invoice)).where(Invoice.id == invoice_id))
    if invoice is None:
        raise InvoiceNotFound()
    return invoice


async def list_invoices(
    session: AsyncSession,
    page: PageParams,
    *,
    status: InvoiceStatus | None = None,
    patient_id: uuid.UUID | None = None,
    search: str | None = None,
) -> tuple[Sequence[Invoice], int]:
    query = select(Invoice)
    if status is not None:
        query = query.where(Invoice.status == status)
    if patient_id is not None:
        query = query.where(Invoice.patient_id == patient_id)
    if search:
        pattern = contains_pattern(search.strip())
        query = query.join(Invoice.patient).where(
            Invoice.invoice_number.ilike(pattern) | Patient.full_name.ilike(pattern)
        )

    total = await session.scalar(select(func.count()).select_from(query.subquery())) or 0
    invoices = (
        await session.scalars(
            _with_patient(query)
            .order_by(Invoice.issued_at.desc(), Invoice.invoice_number.desc())
            .offset(page.offset)
            .limit(page.page_size)
        )
    ).all()
    return invoices, total


async def next_invoice_number(session: AsyncSession) -> str:
    sequence_value = await session.scalar(invoice_number_seq.next_value())
    return f"INV-{clinic_now().year}-{sequence_value:06d}"


def _check_paid_at(paid_at: datetime | None) -> None:
    if paid_at is not None and paid_at > utc_now():
        raise InvalidInvoice("paid_at cannot be in the future.")


async def create_invoice(session: AsyncSession, data: InvoiceCreate) -> Invoice:
    if await session.get(Patient, data.patient_id) is None:
        raise PatientNotFound()
    paid_at = data.paid_at
    if data.status is InvoiceStatus.PAID and paid_at is None:
        paid_at = utc_now()
    _check_paid_at(paid_at)

    invoice = Invoice(
        **data.model_dump(exclude={"paid_at"}),
        paid_at=paid_at,
        invoice_number=await next_invoice_number(session),
    )
    session.add(invoice)
    await session.commit()
    return await get_invoice(session, invoice.id)


async def update_invoice(
    session: AsyncSession, invoice_id: uuid.UUID, data: InvoiceUpdate
) -> Invoice:
    invoice = await get_invoice(session, invoice_id)
    if invoice.status is InvoiceStatus.VOID:
        raise InvoiceVoided()

    changes = data.changes()
    for field, value in changes.items():
        setattr(invoice, field, value)

    # Re-check the rules against the merged state, not just the fields that were sent.
    if invoice.discount > invoice.subtotal:
        raise InvalidInvoice("discount cannot exceed subtotal.")
    if invoice.status is InvoiceStatus.PAID:
        if invoice.payment_method is None:
            raise InvalidInvoice("payment_method is required for a PAID invoice.")
        if invoice.paid_at is None:
            invoice.paid_at = utc_now()
    elif "paid_at" in changes and invoice.paid_at is not None:
        raise InvalidInvoice("paid_at must be empty for a DUE invoice.")
    else:
        invoice.paid_at = None
    _check_paid_at(invoice.paid_at)

    await session.commit()
    # `total` is computed by PostgreSQL; re-read it along with the patient.
    await session.refresh(invoice, attribute_names=["total", "patient"])
    return invoice


async def void_invoice(session: AsyncSession, invoice_id: uuid.UUID) -> None:
    invoice = await get_invoice(session, invoice_id)
    if invoice.status is InvoiceStatus.VOID:
        return
    invoice.status = InvoiceStatus.VOID
    await session.commit()
