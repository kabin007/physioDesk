# PhysioDesk

Clinic management system for a physiotherapy practice.

| Part | Status | Docs |
|---|---|---|
| [`backend/`](backend/) | FastAPI + PostgreSQL REST API | [backend/README.md](backend/README.md) |
| `frontend/` | Next.js (next phase) | — |

Quick start (backend):

```bash
cd backend
make env && make install && make db-up && make migrate && make seed && make dev
# Swagger UI: http://localhost:8000/docs  ·  admin@physiodesk.local / Admin123!
```
