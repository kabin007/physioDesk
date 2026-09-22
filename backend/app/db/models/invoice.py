import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Computed,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    Sequence,
    String,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import InvoiceStatus, PaymentMethod
from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.patient import Patient

# 12 digits, 2 decimals: exact decimal arithmetic, never floating point.
Money = Numeric(12, 2)

# Source of the numeric part of human-friendly invoice numbers (INV-2026-000001).
# A sequence is concurrency-safe without locking; gaps after rollbacks are acceptable.
invoice_number_seq = Sequence("invoice_number_seq", metadata=Base.metadata)


class Invoice(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "invoices"
    __table_args__ = (
        CheckConstraint("subtotal >= 0", name="subtotal_non_negative"),
        CheckConstraint("discount >= 0", name="discount_non_negative"),
        CheckConstraint("discount <= subtotal", name="discount_not_above_subtotal"),
        CheckConstraint(
            "status <> 'PAID' OR (paid_at IS NOT NULL AND payment_method IS NOT NULL)",
            name="paid_requires_payment_details",
        ),
    )

    invoice_number: Mapped[str] = mapped_column(String(32), unique=True)
    # RESTRICT: billing history must survive; patients with invoices cannot be deleted.
    patient_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("patients.id", ondelete="RESTRICT"), index=True
    )
    service: Mapped[str] = mapped_column(String(200))
    subtotal: Mapped[Decimal] = mapped_column(Money)
    discount: Mapped[Decimal] = mapped_column(Money, server_default=text("0"))
    # Computed by PostgreSQL, so a client-supplied or stale total is impossible.
    total: Mapped[Decimal] = mapped_column(Money, Computed("subtotal - discount", persisted=True))
    status: Mapped[InvoiceStatus] = mapped_column(
        Enum(InvoiceStatus, name="invoice_status"), index=True
    )
    payment_method: Mapped[PaymentMethod | None] = mapped_column(
        Enum(PaymentMethod, name="payment_method")
    )
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    patient: Mapped["Patient"] = relationship(back_populates="invoices")
