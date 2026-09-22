"""Domain enumerations shared by the persistence and API layers.

They are `StrEnum`s whose values equal their names, so they serialise predictably in JSON
and map 1:1 onto PostgreSQL enum types.
"""

from enum import StrEnum


class UserRole(StrEnum):
    ADMIN = "ADMIN"
    STAFF = "STAFF"


class Gender(StrEnum):
    MALE = "MALE"
    FEMALE = "FEMALE"
    OTHER = "OTHER"


class PatientStatus(StrEnum):
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    ON_HOLD = "ON_HOLD"


class AppointmentStatus(StrEnum):
    BOOKED = "BOOKED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class SessionType(StrEnum):
    ASSESSMENT = "ASSESSMENT"
    TREATMENT = "TREATMENT"
    FOLLOW_UP = "FOLLOW_UP"


class PaymentMethod(StrEnum):
    CASH = "CASH"
    CARD = "CARD"
    BANK_TRANSFER = "BANK_TRANSFER"
    OTHER = "OTHER"


class InvoiceStatus(StrEnum):
    PAID = "PAID"
    DUE = "DUE"
    VOID = "VOID"


class SlotStatus(StrEnum):
    OPEN = "OPEN"
    BOOKED = "BOOKED"
    THERAPIST_OFF = "THERAPIST_OFF"


class AvailabilitySource(StrEnum):
    """Why a therapist is (un)available on a given date."""

    REGULAR = "REGULAR"  # regular weekly schedule applies
    OVERRIDE_HOURS = "OVERRIDE_HOURS"  # date-specific custom hours
    OVERRIDE_DAY_OFF = "OVERRIDE_DAY_OFF"  # date-specific day off
    NON_WORKING_DAY = "NON_WORKING_DAY"  # weekday not in the regular schedule
    INACTIVE = "INACTIVE"  # therapist deactivated
