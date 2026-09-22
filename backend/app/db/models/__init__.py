"""Import every model so `Base.metadata` is complete (for Alembic and mapper configuration)."""

from app.db.models.appointment import Appointment
from app.db.models.invoice import Invoice, invoice_number_seq
from app.db.models.patient import Patient
from app.db.models.therapist import Therapist, TherapistScheduleOverride
from app.db.models.user import User

__all__ = [
    "Appointment",
    "Invoice",
    "Patient",
    "Therapist",
    "TherapistScheduleOverride",
    "User",
    "invoice_number_seq",
]
