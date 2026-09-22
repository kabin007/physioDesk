# PhysioDesk

PhysioDesk is a clinic management system for a physiotherapy practice. Front-desk staff
use it to register patients, see therapists' availability, book and reschedule sessions,
and track billing. Admins also manage the therapist roster, schedules and invoices.

This repository is being built in phases:

| Phase | Part | Status |
|---|---|---|
| 1 | [`backend/`](backend/): FastAPI + PostgreSQL REST API | ✅ Complete |
| 2 | `frontend/`: Next.js web app | ⏳ Next |

> **Detailed backend documentation:** [backend/README.md](backend/README.md) covers the
> architecture, schema, every assumption and the trade-offs.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Repository Structure](#repository-structure)
4. [Getting Started](#getting-started)
5. [Test Credentials](#test-credentials)
6. [Using the API](#using-the-api)
7. [Roles and Permissions](#roles-and-permissions)
8. [How Scheduling Works](#how-scheduling-works)
9. [Data Integrity](#data-integrity)
10. [Testing and Code Quality](#testing-and-code-quality)
11. [Make Commands](#make-commands)
12. [Troubleshooting](#troubleshooting)
13. [Key Assumptions](#key-assumptions)
14. [Roadmap](#roadmap)

---

## Features

**Authentication and authorization**
- Log in with email *or* username; passwords are hashed with Argon2.
- JWT access tokens (30 min) and refresh tokens (7 days), with the two token types kept strictly apart.
- Logout revokes every token the user holds, on all devices.
- Two roles, **Admin** and **Staff**, enforced by the server rather than just hidden in the UI.

**Patients**
- Create, view, update and delete patients.
- Search by name or phone, filter by therapist or status, with paginated results.
- Profile view with session and billing summaries (completed sessions, next appointment, amount paid, outstanding balance).
- Session history and billing history for each patient.

**Therapists and schedules**
- Therapist roster with specialty, working days, hours, slot length, weekly hours and patients seen today.
- **Date-specific overrides** give a therapist a day off or custom hours on one date.
- A schedule grid for any date, showing every slot as `OPEN`, `BOOKED` (with the patient) or `THERAPIST_OFF`.

**Appointments**
- Booking follows the therapist's real availability for that date, overrides included.
- **Double-booking is impossible**, even when two requests arrive at the same moment.
- Rescheduling re-runs every rule; cancelling frees the slot but keeps the record.

**Billing**
- Invoices with human-friendly numbers (`INV-2026-000001`).
- The total is always computed by the database, so a client can't send a wrong total.
- Mark as paid or due; deleting an invoice *voids* it, so billing history is never lost.

**Dashboard**
- Live figures computed from the database: patients seen today, therapists on duty, revenue collected today and open slots remaining.
- Per-therapist capacity (booked vs. free slots) and the most recently added patients.

---

## Tech Stack

| Concern | Choice |
|---|---|
| Language | Python 3.12 |
| Web framework | FastAPI (OpenAPI / Swagger built in) |
| Validation | Pydantic v2, pydantic-settings |
| Database | PostgreSQL 16 |
| ORM | SQLAlchemy 2.x (async), asyncpg driver |
| Migrations | Alembic |
| Auth | PyJWT, pwdlib (Argon2) |
| Tooling | uv (packages), Ruff (lint/format), mypy (strict types) |
| Tests | pytest, pytest-asyncio, httpx |
| Infrastructure | Docker Compose (PostgreSQL + optional API container) |

---

## Repository Structure

```
physioDesk/
├── README.md                 ← you are here
└── backend/
    ├── README.md             ← full backend documentation
    ├── app/
    │   ├── main.py           ← app factory, CORS, error handlers, health checks
    │   ├── api/              ← HTTP layer: routes + auth/role dependencies
    │   ├── schemas/          ← request/response models (Pydantic)
    │   ├── services/         ← business rules (scheduling, billing, dashboard, ...)
    │   ├── db/               ← SQLAlchemy models, session, constraint helpers
    │   ├── core/             ← settings, security, enums, domain exceptions
    │   └── utils/            ← timezone-aware date/time helpers
    ├── migrations/           ← Alembic migrations (the schema's source of truth)
    ├── scripts/seed.py       ← demo data
    ├── tests/                ← 63 API, database and unit tests
    ├── Makefile              ← every developer command
    ├── docker-compose.yml    ← PostgreSQL (+ API with the "full" profile)
    ├── Dockerfile
    └── pyproject.toml / uv.lock
```

Requests flow in one direction: **routes → schemas → services → models**. Routes contain no
business logic, and every rule lives in one service.

---

## Getting Started

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Python | 3.12+ | [python.org](https://www.python.org/downloads/) |
| uv | latest | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Docker | any recent | [docs.docker.com](https://docs.docker.com/get-docker/) |
| GNU Make | any | preinstalled on Linux/macOS |

### Option A: run locally (recommended for development)

```bash
git clone https://github.com/kabin007/physioDesk.git
cd physioDesk/backend

make env        # 1. create .env with a random JWT secret
make install    # 2. install dependencies (uv sync)
make db-up      # 3. start PostgreSQL in Docker on localhost:5433
make migrate    # 4. create the schema
make seed       # 5. load demo data and test users
make dev        # 6. start the API with auto-reload
```

Open **http://localhost:8000/docs**.

### Option B: everything in Docker

```bash
cd physioDesk/backend
make env
make docker-up                                   # PostgreSQL + API; runs migrations on start
docker compose exec api python -m scripts.seed   # load demo data
```

The API is served at **http://localhost:8000**. Stop it with `make docker-down`.

### Using your own PostgreSQL instead of Docker

Set `DATABASE_URL` in `backend/.env`, for example
`postgresql+asyncpg://user:password@localhost:5432/physiodesk`. The database needs the
`btree_gist` and `pg_trgm` extensions, which ship with standard PostgreSQL; the migration
enables them.

### Environment variables

The most important ones are below. The [full list](backend/README.md#environment-variables)
is in the backend docs.

| Variable | Example | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://physiodesk:physiodesk@localhost:5433/physiodesk` | Database connection |
| `JWT_SECRET_KEY` | *(generated by `make env`)* | Signs tokens; at least 32 characters |
| `CORS_ORIGINS` | `http://localhost:3000` | Browser origins allowed to call the API |
| `CLINIC_TIMEZONE` | `Asia/Kathmandu` | Defines what "today" means |

---

## Test Credentials

These are created by `make seed` and are **for development only**.

| Role | Email | Username | Password |
|---|---|---|---|
| Admin | `admin@physiodesk.local` | `admin` | `Admin123!` |
| Staff | `staff@physiodesk.local` | `staff` | `Staff123!` |

The seed also creates:
- 4 therapists with different schedules
- 10 patients
- About 3 weeks of past, today's and future appointments
- Paid, due and void invoices
- Schedule overrides: one therapist is **off today**, another has **custom hours tomorrow**

So the dashboard and schedule show real data straight away.

---

## Using the API

### In Swagger UI

1. Open http://localhost:8000/docs.
2. Call `POST /api/v1/auth/login` with `{"identifier": "admin", "password": "Admin123!"}`.
3. Copy the `access_token`, click **Authorize**, and paste it.
4. Try any endpoint, for example `GET /api/v1/dashboard` or `GET /api/v1/schedule`.

### With curl

```bash
# Log in
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"admin","password":"Admin123!"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

# Today's dashboard
curl -s http://localhost:8000/api/v1/dashboard -H "Authorization: Bearer $TOKEN"

# Schedule grid for a date
curl -s "http://localhost:8000/api/v1/schedule?date=2026-09-23" -H "Authorization: Bearer $TOKEN"

# Book an appointment (use real IDs from /patients and /therapists)
curl -s -X POST http://localhost:8000/api/v1/appointments \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"patient_id":"<uuid>","therapist_id":"<uuid>","appointment_date":"2026-09-23",
       "start_time":"10:00","payment_method":"CASH"}'
```

### Endpoint overview

All paths start with `/api/v1`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| Dashboard | `GET /dashboard` |
| Patients | `GET/POST /patients`, `GET/PATCH/DELETE /patients/{id}`, `GET /patients/{id}/appointments`, `GET /patients/{id}/invoices` |
| Therapists | `GET/POST /therapists`, `GET/PATCH/DELETE /therapists/{id}` |
| Overrides | `GET/POST /therapists/{id}/schedule-overrides`, `PATCH/DELETE /therapists/{id}/schedule-overrides/{override_id}` |
| Schedule | `GET /schedule?date=&therapist_id=` |
| Appointments | `GET/POST /appointments`, `GET/PATCH/DELETE /appointments/{id}` |
| Invoices | `GET/POST /invoices`, `GET/PATCH/DELETE /invoices/{id}` |
| System | `GET /health`, `GET /health/ready` (outside `/api/v1`) |

### Response conventions

- **Errors** always have the same shape:
  ```json
  { "detail": { "code": "APPOINTMENT_CONFLICT", "message": "Therapist already has an appointment during this time." } }
  ```
- **Status codes:**
  - `400` a business rule was broken
  - `401` not logged in
  - `403` not allowed
  - `404` not found
  - `409` conflict (e.g. double booking)
  - `422` invalid input
- **Lists** are paginated: `{ "items": [...], "page": 1, "page_size": 20, "total": 100, "pages": 5 }`
- **Times** are clinic-local `HH:MM`, dates are `YYYY-MM-DD`, and money is a decimal string such as `"1500.00"`.

---

## Roles and Permissions

Every rule below is enforced by the API, not only by the UI.

| Feature | Admin | Staff |
|---|:---:|:---:|
| Patients: view, create, edit, delete | ✅ | ✅ |
| Appointments: book, reschedule, cancel | ✅ | ✅ |
| Schedule grid and dashboard | ✅ | ✅ |
| Therapists and overrides: view | ✅ | ✅ |
| Therapists and overrides: create, edit, delete | ✅ | ❌ |
| Invoices: view | ✅ | ✅ |
| Invoices: create, edit, void | ✅ | ❌ |

---

## How Scheduling Works

For a therapist on a given date, availability is resolved in this order:

1. **Inactive therapist** → unavailable.
2. **Override: day off** for that date → unavailable.
3. **Override: custom hours** for that date → those hours apply.
4. **Weekday not in their working days** → unavailable.
5. Otherwise → their regular hours.

**Slots** are generated from the resolved hours in steps of the therapist's slot length
(for example, 09:00–12:00 with 30-minute slots gives 6 slots). Slots are never stored.

**A booking is accepted only if:**
- the patient exists, and the therapist exists and is active;
- the date is today or later;
- the start time falls exactly on a slot and fits within the resolved hours;
- neither the therapist nor the patient already has an overlapping (non-cancelled) appointment.

The end time is always calculated by the server. Rescheduling runs the same checks.

**Status flow:** `BOOKED → COMPLETED` or `BOOKED → CANCELLED`. Both end states are final.

**Schedule changes are protected.** If a change to a therapist's hours or days, a new day
off, or a deactivation would leave an upcoming booking outside their availability, the
change is refused with a clear 409 message. The bookings have to be moved or cancelled first.

### Why double-booking is impossible

Checking for a free slot and then inserting can be raced by two simultaneous requests, so
PhysioDesk does not rely on application code alone:

1. **Database exclusion constraints**: PostgreSQL itself rejects any two active
   appointments whose time ranges overlap for the same therapist (or the same patient).
2. **Row locking** stops a booking and a schedule change for the same therapist from
   interleaving.
3. A friendly pre-check returns a clear error in the common case.

The test suite sends two simultaneous requests for the same slot and checks that exactly
one succeeds.

---

## Data Integrity

- **Clinical and billing history is never silently lost:**
  - Patients with appointments or invoices can't be deleted (409); change their status to *Completed* or *On hold* instead.
  - Therapists with appointments can't be deleted (409); deactivate them instead.
  - Deleting an appointment cancels it; deleting an invoice voids it.
- The database enforces its own rules, including:
  - valid ages and working hours
  - non-negative amounts, and discount ≤ subtotal
  - total = subtotal − discount (a computed column)
  - one override per therapist per date
  - unique emails, usernames and invoice numbers
- Money is stored as exact decimals, never floating point.
- Timestamps are stored in UTC, and "today" is based on the clinic's timezone.

---

## Testing and Code Quality

```bash
cd backend
make test        # 63 tests
make check       # lint + format check + strict type check + tests
```

- Tests use a **separate database** (`physiodesk_test`), which is created and migrated
  automatically, so your development data is never touched.
- They cover:
  - authentication and roles
  - patients
  - scheduling rules
  - concurrent double-booking
  - overrides and rescheduling
  - billing rules
  - dashboard statistics
- **Ruff** handles linting and formatting, and **mypy** type-checks in strict mode.

---

## Make Commands

Run these from `backend/`. `make help` lists them all.

| Command | What it does |
|---|---|
| `make env` | Create `.env` with a generated secret |
| `make install` | Install dependencies |
| `make db-up` / `make db-down` | Start / stop PostgreSQL (Docker) |
| `make migrate` | Apply database migrations |
| `make migration name="..."` | Generate a new migration |
| `make seed` / `make seed-reset` | Load demo data / wipe and reload it |
| `make dev` / `make run` | Run the API (auto-reload / no reload) |
| `make test` / `make test-cov` | Run tests / with coverage |
| `make lint` / `make format` / `make typecheck` | Quality tools |
| `make check` | All quality gates |
| `make docker-up` / `make docker-down` | Full stack in Docker |
| `make clean` | Remove caches |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `port 5433 is already allocated` | Another service uses the port. Set `POSTGRES_PORT=5434` when running `make db-up`, and update `DATABASE_URL` to match. |
| `Connect call failed ... 5433` | The database isn't running. Run `make db-up`. |
| `DATABASE_URL ... Field required` on startup | There is no `.env`. Run `make env` in `backend/`. |
| `uv: command not found` | Install uv (see Prerequisites), then restart your shell. |
| Dashboard shows zeros | Run `make seed-reset`. Seed data is relative to the day it was generated. |
| 401 `INVALID_TOKEN` | The access token expired (30 min) or you logged out. Log in again or call `/auth/refresh`. |

---

## Key Assumptions

The full list, with reasoning, is in [backend/README.md](backend/README.md#important-assumptions).

- **Patients seen today:** distinct patients with a *completed* appointment today.
- **Revenue today:** the sum of *paid* invoices whose payment time falls today in the clinic's timezone.
- **Open slots:** all slots of on-duty therapists minus booked or completed ones.
- **Staff:** read-only for billing and therapist management; full access to patients and appointments.
- **Appointments:** each one takes exactly one slot, and bookings are allowed from today onwards.
- **Overrides:** a date-specific override always wins over the weekly schedule.
- **Logout:** signs the user out of all devices.

---

## Roadmap

- [x] **Phase 1:** backend REST API, database, auth, scheduling, billing, dashboard, tests
- [ ] **Phase 2:** Next.js frontend (dashboard, patients, schedule grid, billing, therapists)
      following the design system: Fraunces / Inter / IBM Plex Mono, with the fixed
      clinic colour palette
- [ ] User management, audit log, printable invoices, CI pipeline
