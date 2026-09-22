"""Invoice schemas. Money is `Decimal` end to end and serialised as a decimal string
(e.g. "1500.00") so no precision is lost in JSON."""

import datetime as dt
import uuid
from decimal import Decimal
from typing import Annotated, ClassVar, Literal, Self

from pydantic import AwareDatetime, Field, model_validator

from app.core.enums import InvoiceStatus, PaymentMethod
from app.schemas.common import APIModel, ORMModel, PatchModel, Text200
from app.schemas.patient import PatientSummary

Money = Annotated[
    Decimal,
    Field(ge=0, max_digits=12, decimal_places=2, examples=["1500.00"]),
]

# VOID is reached only through DELETE, so it cannot be set directly.
EditableStatus = Literal[InvoiceStatus.PAID, InvoiceStatus.DUE]


class InvoiceCreate(APIModel):
    patient_id: uuid.UUID
    service: Text200 = Field(examples=["Physiotherapy session x5"])
    subtotal: Money
    discount: Money = Decimal("0.00")
    status: EditableStatus = InvoiceStatus.DUE
    payment_method: PaymentMethod | None = Field(
        default=None, description="Required when status is PAID."
    )
    paid_at: AwareDatetime | None = Field(
        default=None, description="Defaults to now when status is PAID; must be omitted if DUE."
    )

    @model_validator(mode="after")
    def _check(self) -> Self:
        if self.discount > self.subtotal:
            raise ValueError("discount cannot exceed subtotal")
        if self.status is InvoiceStatus.PAID and self.payment_method is None:
            raise ValueError("payment_method is required for a PAID invoice")
        if self.status is InvoiceStatus.DUE and self.paid_at is not None:
            raise ValueError("paid_at must be empty for a DUE invoice")
        return self


class InvoiceUpdate(PatchModel):
    """Partial update, e.g. `{"status": "PAID", "payment_method": "CASH"}` to mark as paid.
    Amount rules are re-checked after merging with the stored invoice."""

    nullable_fields: ClassVar[frozenset[str]] = frozenset({"payment_method", "paid_at"})

    service: Text200 | None = None
    subtotal: Money | None = None
    discount: Money | None = None
    status: EditableStatus | None = None
    payment_method: PaymentMethod | None = None
    paid_at: AwareDatetime | None = None


class InvoiceRead(ORMModel):
    id: uuid.UUID
    invoice_number: str = Field(examples=["INV-2026-000001"])
    patient_id: uuid.UUID
    patient: PatientSummary
    service: str
    subtotal: Decimal
    discount: Decimal
    total: Decimal = Field(description="subtotal - discount, computed by the database.")
    status: InvoiceStatus
    payment_method: PaymentMethod | None
    issued_at: dt.datetime
    paid_at: dt.datetime | None
    created_at: dt.datetime
    updated_at: dt.datetime
