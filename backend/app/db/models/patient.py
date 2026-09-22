import uuid
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Index, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import Gender, PatientStatus
from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.db.models.appointment import Appointment
    from app.db.models.invoice import Invoice
    from app.db.models.therapist import Therapist


class Patient(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "patients"
    __table_args__ = (
        CheckConstraint("age > 0 AND age <= 130", name="age_range"),
        # Trigram indexes serve the substring (ILIKE '%term%') name/phone search.
        Index(
            "ix_patients_full_name_trgm",
            "full_name",
            postgresql_using="gin",
            postgresql_ops={"full_name": "gin_trgm_ops"},
        ),
        Index(
            "ix_patients_phone_trgm",
            "phone",
            postgresql_using="gin",
            postgresql_ops={"phone": "gin_trgm_ops"},
        ),
        Index("ix_patients_created_at", "created_at"),
    )

    full_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(20))
    age: Mapped[int] = mapped_column(SmallInteger)
    gender: Mapped[Gender] = mapped_column(Enum(Gender, name="gender"))
    address: Mapped[str | None] = mapped_column(String(255))
    condition: Mapped[str] = mapped_column(String(255))
    # Assignment is a current-state pointer, not history: deleting a therapist (only possible
    # when they have no appointments) simply unassigns their patients.
    assigned_therapist_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("therapists.id", ondelete="SET NULL"), index=True
    )
    package: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[PatientStatus] = mapped_column(
        Enum(PatientStatus, name="patient_status"),
        server_default=PatientStatus.ACTIVE.value,
        index=True,
    )

    assigned_therapist: Mapped["Therapist | None"] = relationship(back_populates="patients")
    appointments: Mapped[list["Appointment"]] = relationship(
        back_populates="patient", passive_deletes="all"
    )
    invoices: Mapped[list["Invoice"]] = relationship(
        back_populates="patient", passive_deletes="all"
    )

    def __repr__(self) -> str:
        return f"<Patient {self.full_name}>"
