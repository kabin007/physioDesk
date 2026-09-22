"""Domain exceptions and their mapping to HTTP responses.

Services raise these; they never raise `HTTPException`. Every error body has the shape
`{"detail": {"code": "...", "message": "..."}}`. Request validation errors keep FastAPI's
standard 422 body.

Status code policy:
- 400: a business rule rejects the request (slot outside working hours, day off, ...)
- 401 / 403: authentication / authorisation
- 404: the addressed (or referenced) resource does not exist
- 409: the request conflicts with current state (double booking, history exists, ...)
- 422: request shape/field validation (FastAPI/Pydantic)
"""

import logging
from typing import ClassVar

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger(__name__)


class AppError(Exception):
    status_code: ClassVar[int] = status.HTTP_400_BAD_REQUEST
    code: ClassVar[str] = "BAD_REQUEST"
    message: str = "The request could not be processed."

    def __init__(self, message: str | None = None) -> None:
        if message is not None:
            self.message = message
        super().__init__(self.message)

    @property
    def headers(self) -> dict[str, str] | None:
        return None


# --- 401 / 403 -------------------------------------------------------------------------


class AuthenticationError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "NOT_AUTHENTICATED"
    message = "Authentication credentials were not provided."

    @property
    def headers(self) -> dict[str, str] | None:
        return {"WWW-Authenticate": "Bearer"}


class InvalidCredentials(AuthenticationError):
    code = "INVALID_CREDENTIALS"
    message = "Invalid identifier or password."


class InvalidToken(AuthenticationError):
    code = "INVALID_TOKEN"
    message = "Token is invalid or has expired."


class PermissionDenied(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "FORBIDDEN"
    message = "You do not have permission to perform this action."


# --- 404 -------------------------------------------------------------------------------


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "NOT_FOUND"
    message = "Resource not found."


class PatientNotFound(NotFoundError):
    code = "PATIENT_NOT_FOUND"
    message = "Patient not found."


class TherapistNotFound(NotFoundError):
    code = "THERAPIST_NOT_FOUND"
    message = "Therapist not found."


class ScheduleOverrideNotFound(NotFoundError):
    code = "SCHEDULE_OVERRIDE_NOT_FOUND"
    message = "Schedule override not found."


class AppointmentNotFound(NotFoundError):
    code = "APPOINTMENT_NOT_FOUND"
    message = "Appointment not found."


class InvoiceNotFound(NotFoundError):
    code = "INVOICE_NOT_FOUND"
    message = "Invoice not found."


# --- 409 -------------------------------------------------------------------------------


class ConflictError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "CONFLICT"
    message = "The request conflicts with the current state of the resource."


class AppointmentConflict(ConflictError):
    code = "APPOINTMENT_CONFLICT"
    message = "Therapist already has an appointment during this time."


class PatientAppointmentConflict(ConflictError):
    code = "PATIENT_APPOINTMENT_CONFLICT"
    message = "Patient already has another appointment during this time."


class ScheduleOverrideExists(ConflictError):
    code = "SCHEDULE_OVERRIDE_EXISTS"
    message = "An override already exists for this therapist on this date."


class ScheduleChangeConflict(ConflictError):
    """A schedule change would strand upcoming booked appointments."""

    code = "SCHEDULE_CHANGE_CONFLICT"


class ResourceInUse(ConflictError):
    """Deleting the resource would orphan history (appointments, invoices)."""

    code = "RESOURCE_IN_USE"


class InvalidStatusTransition(ConflictError):
    code = "INVALID_STATUS_TRANSITION"


class InvoiceVoided(ConflictError):
    code = "INVOICE_VOID"
    message = "A voided invoice cannot be modified."


class DuplicateResource(ConflictError):
    code = "DUPLICATE_RESOURCE"
    message = "A resource with these unique values already exists."


# --- 400 (business rules) --------------------------------------------------------------


class InvalidSchedule(AppError):
    code = "INVALID_SCHEDULE"
    message = "The schedule is invalid."


class SlotUnavailable(AppError):
    code = "SLOT_UNAVAILABLE"
    message = "The requested time is outside the therapist's available hours."


class TherapistUnavailable(AppError):
    code = "THERAPIST_UNAVAILABLE"
    message = "The therapist is not working on this date."


class TherapistInactive(AppError):
    code = "THERAPIST_INACTIVE"
    message = "The therapist is inactive."


class AppointmentInPast(AppError):
    code = "APPOINTMENT_IN_PAST"
    message = "Appointments cannot be booked or moved to a past date."


class InvalidInvoice(AppError):
    code = "INVALID_INVOICE"


# --- handlers --------------------------------------------------------------------------


def _error_body(code: str, message: str) -> dict[str, dict[str, str]]:
    return {"detail": {"code": code, "message": message}}


async def app_error_handler(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_body(exc.code, exc.message),
        headers=exc.headers,
    )


async def integrity_error_handler(request: Request, exc: Exception) -> JSONResponse:
    # Safety net: services translate the constraint violations they expect. Anything that
    # reaches here is still a conflict with stored data, but its details stay in the logs.
    logger.warning("Unhandled integrity error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content=_error_body("INTEGRITY_CONFLICT", "The request conflicts with existing data."),
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=_error_body("INTERNAL_ERROR", "An unexpected error occurred."),
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(IntegrityError, integrity_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)
