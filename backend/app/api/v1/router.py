from fastapi import APIRouter, Depends

from app.api.dependencies import get_current_user
from app.api.v1.endpoints import (
    appointments,
    auth,
    dashboard,
    invoices,
    patients,
    schedule,
    therapists,
)

api_router = APIRouter()

# Authentication endpoints are the only public API routes.
api_router.include_router(auth.router)

# Everything else requires a valid access token. Enforced once here (in addition to the
# per-endpoint user/role dependencies) so a new route cannot accidentally be left public.
protected = APIRouter(dependencies=[Depends(get_current_user)])
protected.include_router(dashboard.router)
protected.include_router(patients.router)
protected.include_router(therapists.router)
protected.include_router(appointments.router)
protected.include_router(schedule.router)
protected.include_router(invoices.router)

api_router.include_router(protected)
