import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.dependencies import AdminUser, CurrentUser, DbSession, Pagination
from app.core.enums import InvoiceStatus
from app.schemas.common import Page, error_responses
from app.schemas.invoice import InvoiceCreate, InvoiceRead, InvoiceUpdate
from app.services import invoices as invoice_service

router = APIRouter(prefix="/invoices", tags=["Billing"])


@router.get("", summary="List invoices")
async def list_invoices(
    _: CurrentUser,
    session: DbSession,
    page: Pagination,
    invoice_status: Annotated[InvoiceStatus | None, Query(alias="status")] = None,
    patient_id: Annotated[uuid.UUID | None, Query()] = None,
    search: Annotated[
        str | None,
        Query(max_length=100, description="Match on invoice number or patient name."),
    ] = None,
) -> Page[InvoiceRead]:
    invoices, total = await invoice_service.list_invoices(
        session, page, status=invoice_status, patient_id=patient_id, search=search
    )
    return Page[InvoiceRead].build([InvoiceRead.model_validate(i) for i in invoices], total, page)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Create an invoice (admin)",
    description="`total` is computed server-side as subtotal - discount. The invoice number "
    "is generated (INV-YYYY-NNNNNN).",
    responses=error_responses(400, 403, 404),
)
async def create_invoice(body: InvoiceCreate, _: AdminUser, session: DbSession) -> InvoiceRead:
    return InvoiceRead.model_validate(await invoice_service.create_invoice(session, body))


@router.get("/{invoice_id}", summary="Get an invoice", responses=error_responses(404))
async def get_invoice(invoice_id: uuid.UUID, _: CurrentUser, session: DbSession) -> InvoiceRead:
    return InvoiceRead.model_validate(await invoice_service.get_invoice(session, invoice_id))


@router.patch(
    "/{invoice_id}",
    summary="Update an invoice (admin)",
    description="E.g. mark a DUE invoice as PAID. VOID invoices cannot be modified.",
    responses=error_responses(400, 403, 404, 409),
)
async def update_invoice(
    invoice_id: uuid.UUID, body: InvoiceUpdate, _: AdminUser, session: DbSession
) -> InvoiceRead:
    return InvoiceRead.model_validate(
        await invoice_service.update_invoice(session, invoice_id, body)
    )


@router.delete(
    "/{invoice_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Void an invoice (admin)",
    description="Invoices are never physically deleted: DELETE sets status VOID, keeping "
    "billing history intact. Voided invoices are excluded from revenue. Idempotent.",
    responses=error_responses(403, 404),
)
async def void_invoice(invoice_id: uuid.UUID, _: AdminUser, session: DbSession) -> None:
    await invoice_service.void_invoice(session, invoice_id)
