from fastapi import APIRouter, Depends

from app.api.dependencies import get_current_user
from app.api.v1.endpoints import auth, schedule, therapists

api_router = APIRouter()

# Authentication endpoints are the only public API routes.
api_router.include_router(auth.router)

# Everything else requires a valid access token. Enforced once here (in addition to the
# per-endpoint user/role dependencies) so a new route cannot accidentally be left public.
protected = APIRouter(dependencies=[Depends(get_current_user)])
protected.include_router(therapists.router)
protected.include_router(schedule.router)

api_router.include_router(protected)
