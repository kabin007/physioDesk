# PhysioDesk Backend

REST API for **PhysioDesk**, a clinic management system for a physiotherapy practice:
authentication and roles, patients, therapists and their schedules, appointment booking
with double-booking prevention, billing and a live dashboard.

---

## Overview

| | |
|---|---|
| API base | `http://localhost:8000/api/v1` |
| Swagger UI | `http://localhost:8000/docs` |
| OpenAPI schema | `http://localhost:8000/openapi.json` |
| Health | `GET /health` (liveness), `GET /health/ready` (checks the database) |

The API is a stable contract for the Next.js frontend (Phase 2). Every route except
`/auth/login` and `/auth/refresh` requires a bearer access token.

## Tech Stack

- **Python 3.12**, **FastAPI**, **Pydantic v2**, **pydantic-settings**
- **PostgreSQL 16**, **SQLAlchemy 2.x** (async ORM, typed `Mapped[]` models) with **asyncpg**
- **Alembic** for migrations (the only way the schema is created)
- **PyJWT** (HS256 access/refresh tokens), **pwdlib + Argon2** for password hashing
- **uv** for dependency management, **Ruff** (lint + format), **mypy** (strict)
- **pytest**, **pytest-asyncio**, **httpx** for tests
- Docker Compose for PostgreSQL (and optionally the API)

## Architecture

A modular monolith with four layers, where each layer depends only on the one below it:

```
api/v1/endpoints   HTTP only: parse input, choose the dependency (auth/role), call a service
      │
schemas/           Pydantic v2 request/response models (Create / Update / Read per resource)
      │
services/          Business rules and transactions; raise domain exceptions, never HTTP ones
      │
db/models          SQLAlchemy models + database constraints (the last line of defence)
```

- `core/exceptions.py` defines domain errors (e.g. `AppointmentConflict`, `TherapistNotFound`)
  and maps them in one place to `{"detail": {"code", "message"}}` responses.
- `services/scheduling.py` is the **single source of truth for availability**. Booking,
  the schedule grid, the dashboard, and the checks on therapist/override changes all use it.
- **Transactions:** one `AsyncSession` per request. Each mutating service function is one
  unit of work that flushes (to surface constraint errors) and commits once at the end.
  Helpers never commit.
- There is no repository layer or DI framework: services use SQLAlchemy directly, and
  FastAPI dependencies provide the session and the current user.

## Prerequisites

- Python 3.12+ and [uv](https://docs.astral.sh/uv/getting-started/installation/)
  (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Docker (for PostgreSQL). Alternatively, any PostgreSQL 13+ where the `btree_gist` and
  `pg_trgm` extensions are available (both ship with standard PostgreSQL builds).
- GNU Make

## Quick Start

```bash
cd backend
make env          # creates .env from .env.example with a random JWT secret
make install      # uv sync
make db-up        # PostgreSQL 16 in Docker on localhost:5433
make migrate      # alembic upgrade head
make seed         # demo data + admin/staff users
make dev          # http://localhost:8000/docs
```

`cp .env.example .env` also works in place of `make env`, since the example values are
valid for local development.

## Environment Variables

All configuration comes from environment variables (or `.env`) and is validated at startup
by `app/core/config.py`. If a required value is missing, startup fails.

| Variable | Default | Notes |
|---|---|---|
| `APP_NAME` | `PhysioDesk` | |
| `APP_ENV` | `development` | `development` \| `test` \| `production` |
| `DEBUG` | `false` | Must be `false` in production |
| `API_V1_PREFIX` | `/api/v1` | |
| `LOG_LEVEL` | `INFO` | |
| `DATABASE_URL` | **required** | Must use `postgresql+asyncpg://` |
| `TEST_DATABASE_URL` | *derived* | Defaults to the `DATABASE_URL` database + `_test` |
| `JWT_SECRET_KEY` | **required** | At least 32 chars; placeholder values are rejected in production |
| `JWT_ALGORITHM` | `HS256` | `HS256` \| `HS384` \| `HS512` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated |
| `CLINIC_TIMEZONE` | `Asia/Kathmandu` | IANA name; defines "today" |

## Database

### Entities and relationships

```
users                              (auth only; not linked to clinic data)

therapists 1───* therapist_schedule_overrides   ON DELETE CASCADE (schedule config)
therapists 1───* patients.assigned_therapist_id  ON DELETE SET NULL (current pointer)
therapists 1───* appointments                    ON DELETE RESTRICT (history)
patients   1───* appointments                    ON DELETE RESTRICT (history)
patients   1───* invoices                        ON DELETE RESTRICT (billing history)
```

Every table has a UUID primary key (`gen_random_uuid()`) and `created_at`/`updated_at`
(`timestamptz`, server defaults). Money is `NUMERIC(12,2)`, never float.

### Integrity enforced by PostgreSQL

| Rule | Mechanism |
|---|---|
| No overlapping active appointments per therapist | `EXCLUDE USING gist (therapist_id WITH =, tsrange(start,end) WITH &&) WHERE status <> 'CANCELLED'` |
| No overlapping active appointments per patient | same, on `patient_id` |
| Appointment `start_time < end_time` | CHECK |
| Therapist hours order, `0 < slot_duration <= 480`, working days ⊆ 1..7 and non-empty | CHECK |
| Override is either a day off (no times) or valid custom hours | CHECK |
| One override per therapist per date | UNIQUE |
| `0 < age <= 130` | CHECK |
| `subtotal >= 0`, `discount >= 0`, `discount <= subtotal` | CHECK |
| `total = subtotal - discount` | **generated column** (clients cannot set it) |
| PAID invoice has `paid_at` and `payment_method` | CHECK |
| Unique email, username, invoice number | UNIQUE |

Indexes cover the common filters: user email/username; patient status, assigned therapist,
`created_at`, and **trigram GIN** indexes on name/phone for `ILIKE '%term%'` search;
appointment date, patient, status and `(therapist_id, date)`; invoice patient, status,
`issued_at` and `paid_at`.

**Working days** are stored as a `smallint[]` of ISO weekdays (1 = Monday … 7 = Sunday). The
set is small, fixed-domain and always read and written as a whole, so an array with a
CHECK constraint is simpler than a join table and just as safe.

## Migrations

Alembic is the source of truth for the schema; `create_all()` is never used.

```bash
make migrate                          # upgrade to head
make migration name="add x to y"      # autogenerate a new revision
make downgrade                        # roll back one revision
```

The initial migration was autogenerated, then extended by hand with what autogenerate
cannot express: the extensions, the invoice sequence and the shared enum types.
`alembic check` reports no drift between the models and the migration.

## Seed Data

```bash
make seed         # safe to re-run: creates missing users; generates clinic data only if empty
make seed-reset   # wipes clinic data (keeps users) and regenerates it
```

The seed creates:
- 2 users
- 4 therapists with different weekly schedules and slot sizes (30/45/60 minutes)
- 3 schedule overrides: a day off **today**, custom hours **tomorrow**, and leave next week
- 10 patients across all statuses
- About 3 weeks of past, today's and future appointments (completed, booked, cancelled)
- About 100 invoices (paid, due and one void)

All dates are relative to the clinic's *today*, so the dashboard shows meaningful numbers
whenever you seed. Appointments are placed with the same availability rules the API uses.

## Running the API

```bash
make dev   # auto-reload, http://localhost:8000
make run   # no reload
```

Fully containerised alternative (PostgreSQL + API; the API runs migrations on start):

```bash
make env && make docker-up
docker compose exec api python -m scripts.seed
make docker-down
```

## API Documentation

Swagger UI is at **http://localhost:8000/docs**. Click **Authorize** and paste an access
token from `POST /api/v1/auth/login`. Endpoints are grouped by tag (Authentication,
Dashboard, Patients, Therapists, Appointments, Scheduling, Billing, System) and document
their error responses.

### Endpoint summary

| Method | Path | Access |
|---|---|---|
| POST | `/auth/login` · `/auth/refresh` | public |
| POST | `/auth/logout` | any user |
| GET | `/auth/me` | any user |
| GET | `/dashboard?date=` | any user |
| GET, POST | `/patients` (`search`, `therapist_id`, `status`, `page`, `page_size`) | any user |
| GET, PATCH, DELETE | `/patients/{id}` | any user |
| GET | `/patients/{id}/appointments` · `/patients/{id}/invoices` | any user |
| GET | `/therapists` (`is_active`) · `/therapists/{id}` | any user |
| POST, PATCH, DELETE | `/therapists` · `/therapists/{id}` | **admin** |
| GET | `/therapists/{id}/schedule-overrides` (`date_from`, `date_to`) | any user |
| POST, PATCH, DELETE | `/therapists/{id}/schedule-overrides[/{override_id}]` | **admin** |
| GET | `/schedule?date=&therapist_id=` | any user |
| GET, POST | `/appointments` (`date`, `date_from`, `date_to`, `therapist_id`, `patient_id`, `status`) | any user |
| GET, PATCH, DELETE | `/appointments/{id}` | any user |
| GET | `/invoices` (`status`, `patient_id`, `search`) · `/invoices/{id}` | any user |
| POST, PATCH, DELETE | `/invoices` · `/invoices/{id}` | **admin** |
| GET | `/health` · `/health/ready` | public |

### Conventions

- **Errors:** `{"detail": {"code": "APPOINTMENT_CONFLICT", "message": "..."}}`. Request
  validation errors keep FastAPI's standard 422 body.
- **Status codes:**
  - `400` a business rule rejected the request (e.g. slot outside hours, day off)
  - `401` / `403` not authenticated / not permitted
  - `404` a resource (or a referenced one) does not exist
  - `409` the request conflicts with current state (double booking, history exists, invalid status transition)
  - `422` the request body or parameters are malformed
- **Lists:** paginated lists return `{items, page, page_size, total, pages}`. The therapist
  roster and override lists are small, so they are returned as plain arrays.
- **Times:** clinic-local `HH:MM`. Dates are `YYYY-MM-DD`. Instants are ISO-8601 in UTC.
- **Money:** returned as decimal strings (`"1500.00"`) so precision survives JSON.
- **PATCH:** partial update. Only the fields you send are applied, and `null` is accepted
  only for nullable fields.

## Testing

```bash
make test       # 63 tests, ~1.5 min (Argon2 hashing dominates)
make test-cov   # with coverage
```

Tests run against a **separate database** (`<db>_test`, or `TEST_DATABASE_URL`). The suite
creates it if missing, migrates it with Alembic (so the migration is tested too), and
truncates all tables before each test. It refuses to run against a database whose name
does not end in `_test`.

Coverage focuses on the high-risk paths:

- **Auth:** email/username login, wrong password and unknown user produce identical
  errors, missing and garbage tokens, access vs refresh token separation, refresh flow,
  logout revocation, staff blocked from every admin mutation.
- **Patients:** create/validation, unknown therapist, search (including literal `%`),
  therapist and status filters, pagination, partial update and null guarding, delete rules.
- **Scheduling (unit):**
  - override precedence, non-working days, inactive therapists
  - slot generation and alignment
- **Scheduling (API + DB):**
  - valid booking; double booking and patient double booking rejected
  - **two concurrent requests for one slot: exactly one wins**
  - the raw exclusion constraint rejects overlaps even without the service
  - outside hours, misaligned, past date, non-working day and day off all rejected
  - custom hours respected in booking and the grid; cancelling frees the slot
  - reschedule, including into a conflict; status transitions
  - schedule changes that would strand bookings are rejected; duplicate overrides rejected
- **Billing:** server-side totals, client totals rejected, invalid amounts, mark paid,
  merged-state validation, void and immutability, staff read-only.
- **Dashboard:** every statistic checked against a constructed database state.

## Code Quality

```bash
make lint        # ruff check
make format      # ruff format + safe fixes
make typecheck   # mypy --strict on app, scripts and tests
make check       # lint + format check + typecheck + tests
```

## Authentication

- `POST /auth/login` takes `{"identifier", "password"}`. The identifier is an **email or
  username**, matched case-insensitively. Passwords are hashed with **Argon2** (pwdlib).
  Hashes are upgraded on login if the parameters change.
- Unknown users, wrong passwords and inactive accounts all return the same `401
  INVALID_CREDENTIALS`. Unknown users still pay the hashing cost, so response timing does
  not reveal which accounts exist.
- Login returns `access_token` (30 min), `refresh_token` (7 days), `token_type` and
  `expires_in`. JWT claims: `sub`, `role`, `type` (`access`|`refresh`), `ver`, `iat`,
  `exp`, `jti`.
- Token types are enforced. A refresh token can never authenticate an API call, and an
  access token can never be used to refresh.
- `POST /auth/refresh` returns a new pair and re-reads the user, so deactivation or role
  changes take effect.
- **Logout:** each user has a `token_version`, which is embedded in every token as `ver`.
  Logout increments it, which immediately revokes **all** of that user's access and refresh
  tokens on every device. This is real revocation without Redis or a token table. The only
  cost is the primary-key user lookup that every request already does (to check
  `is_active`).
- The frontend should keep the refresh token in memory or an httpOnly cookie, and call
  `/auth/refresh` when it gets a 401 `INVALID_TOKEN`.

## Role Permissions

Roles are enforced in the backend (`require_admin` dependency). All non-auth routes also
require authentication at the router level, so a new route cannot accidentally be public.

| Area | ADMIN | STAFF |
|---|---|---|
| Patients | CRUD | CRUD |
| Appointments (book, reschedule, cancel) | CRUD | CRUD |
| Schedule grid | read | read |
| Dashboard | read | read |
| Therapists & schedule overrides | CRUD | **read-only** |
| Invoices | CRUD (delete = void) | **read-only** |

STAFF (receptionists) run the front desk: registering patients and booking. Billing and
therapist management are ADMIN tasks.

## Scheduling Rules

For a therapist on a date, availability is resolved in this order (in `services/scheduling.py`):

1. Therapist inactive → unavailable
2. Override for that date with **day off** → unavailable
3. Override for that date with **custom hours** → available during those hours (an override
   can also open a normally non-working day)
4. Weekday not in `working_days` → unavailable
5. Otherwise → the regular `start_time`–`end_time`

**Slots** are generated on the fly, never stored. They are consecutive
`slot_duration_minutes` blocks starting at the resolved start time; a trailing partial block
is not bookable. The schedule grid marks each slot `OPEN`, `BOOKED` (with appointment and
patient) or `THERAPIST_OFF`. On days off, the regular template is returned as
`THERAPIST_OFF`, so grid rows stay stable.

**Booking** (`POST /appointments`) and **rescheduling** (`PATCH` changing therapist, date or
time) run the same checks:
- The patient exists, and the therapist exists and is active.
- The date is not in the past.
- The start time is on a slot boundary, and the slot fits inside the resolved hours.
- `end_time` is **derived** (start + slot duration), never taken from the client.
- There is no overlap with the therapist's *or the patient's* other non-cancelled
  appointments. Cancelled appointments free their slot.

**Status transitions:** `BOOKED → COMPLETED | CANCELLED`, and both of those are final. A
future appointment cannot be marked `COMPLETED`. `DELETE /appointments/{id}` cancels
(idempotently) instead of erasing history.

### Concurrency strategy

A plain "check, then insert" can be raced by two simultaneous requests. PhysioDesk layers
three protections:

1. **Row locks:** a booking locks the therapist row `FOR SHARE`, and schedule changes lock
   it `FOR UPDATE`. So a booking and a schedule edit for the same therapist are serialised,
   while bookings don't block each other.
2. **Pre-check:** an overlap query returns a precise 409 in the normal case.
3. **Exclusion constraints (the guarantee):** PostgreSQL rejects any second non-cancelled
   appointment whose `[start, end)` range overlaps another for the same therapist (or
   patient), whatever the timing. The violation (SQLSTATE `23P01`) is translated into the
   same `409 APPOINTMENT_CONFLICT`. The test suite fires two concurrent requests and
   asserts exactly one `201` and one `409`.

### Schedule changes never strand bookings

Changing a therapist's days, hours or slot size, deactivating them, or creating, editing or
deleting an override is rejected with `409 SCHEDULE_CHANGE_CONFLICT` if it would leave any
**upcoming BOOKED** appointment outside the new availability. The response says how many
appointments are affected and gives the first one. Cancel or reschedule them first. Past
appointments are history and are not re-validated.

## Important Assumptions

- **Timezone:** instants (`created_at`, `issued_at`, `paid_at`, token times) are stored as
  UTC `timestamptz`. Appointment dates/times and therapist hours are clinic-local
  wall-clock values. "Today" and day boundaries always use `CLINIC_TIMEZONE`, via
  `app/utils/datetime.py`, the only place that reads the clock.
- **Patients seen today:** the number of *distinct* patients with a `COMPLETED`
  appointment dated today.
- **Therapists on duty:** active therapists whose resolved availability today has working
  hours (overrides included).
- **Revenue collected today:** the sum of `total` of `PAID` invoices whose `paid_at` falls
  within today in the clinic timezone. `DUE` and `VOID` invoices are excluded.
- **Open slots remaining:** generated slots of on-duty therapists minus slots holding a
  non-cancelled (booked or completed) appointment. Slots earlier in the day still count as
  open, because same-day bookings are allowed (e.g. recording a walk-in).
- **Booking window:** bookings and reschedules are allowed from today onwards (any time
  today). Past dates are rejected.
- **One appointment = one slot.** Its length is the therapist's slot duration.
- **Patient deletion:** only allowed with no appointments and no invoices; otherwise `409
  RESOURCE_IN_USE`. Set status `COMPLETED` or `ON_HOLD` instead. The foreign keys are
  `RESTRICT` as a backstop.
- **Therapist deletion:** only allowed with no appointments at all; otherwise `409`, and
  the therapist should be deactivated with `PATCH {"is_active": false}`. Deactivation is
  itself refused while they have upcoming bookings. Deleting a therapist unassigns their
  patients and removes their overrides.
- **Invoice deletion:** `DELETE` voids the invoice. Void invoices stay in history, are
  immutable and are excluded from revenue.
- **Invoices** are single-currency, stand-alone documents that are not linked to specific
  appointments. `DUE` invoices have no `paid_at`. Marking one `PAID` requires a payment
  method and sets `paid_at` to now if it isn't given. `paid_at` cannot be in the future.
- **Invoice numbers:** `INV-<clinic year>-<6-digit sequence>` from a PostgreSQL sequence.
  They are unique and monotonic, not reset each year, and may have gaps after rolled-back
  transactions (normal for sequences).
- **Session type:** the PDF's patient "session history" shows a *type*, so appointments have
  a `session_type` (`ASSESSMENT`, `TREATMENT`, `FOLLOW_UP`; default `TREATMENT`).
- **Payment method on appointments** is required, because the booking form in the
  specification asks for it. It records how the patient intends to pay; billing itself is
  done with invoices.
- **Overrides** can only be created or changed for today or future dates, and there is at
  most one per therapist per date.
- **Users** are provisioned by the seed script. There is no public sign-up or user
  management API.

## Project Structure

```
backend/
├── app/
│   ├── main.py                  # app factory, CORS, exception handlers, health probes
│   ├── api/
│   │   ├── dependencies.py      # DB session, get_current_user, require_admin, pagination
│   │   └── v1/
│   │       ├── router.py        # public auth routes + router-level auth for everything else
│   │       └── endpoints/       # auth, dashboard, patients, therapists, schedule,
│   │                            # appointments, invoices
│   ├── core/
│   │   ├── config.py            # typed settings (pydantic-settings)
│   │   ├── enums.py             # domain enums shared by models and schemas
│   │   ├── exceptions.py        # domain errors + HTTP mapping
│   │   └── security.py          # Argon2 hashing, JWT create/decode
│   ├── db/
│   │   ├── base.py              # declarative base, UUID/timestamp mixins, naming convention
│   │   ├── session.py           # async engine + session dependency
│   │   ├── errors.py            # constraint-name extraction from IntegrityError
│   │   └── models/              # user, therapist (+ overrides), patient, appointment, invoice
│   ├── schemas/                 # Pydantic request/response models per resource
│   ├── services/                # auth, patients, therapists, scheduling, appointments,
│   │                            # invoices, dashboard
│   └── utils/datetime.py        # the only place that reads the clock
├── migrations/                  # Alembic (async env, initial schema)
├── scripts/seed.py
├── tests/
├── alembic.ini · docker-compose.yml · Dockerfile · Makefile · pyproject.toml · uv.lock
└── .env.example
```

## Useful Make Commands

| Command | Description |
|---|---|
| `make help` | List all commands |
| `make env` | Create `.env` with a generated JWT secret |
| `make install` | `uv sync` (runtime + dev dependencies) |
| `make db-up` / `make db-down` | Start/stop PostgreSQL in Docker |
| `make migrate` | Apply migrations |
| `make migration name="..."` | Autogenerate a migration |
| `make downgrade` | Roll back one migration |
| `make seed` / `make seed-reset` | Seed demo data / wipe and reseed |
| `make dev` / `make run` | Run the API (reload / no reload) |
| `make test` / `make test-cov` | Tests / tests with coverage |
| `make lint` / `make format` / `make typecheck` | Quality tools |
| `make check` | All quality gates |
| `make docker-up` / `make docker-down` | PostgreSQL + API in Docker |
| `make clean` | Remove caches |

## Test Credentials

Development seed credentials only:

| Role | Email | Username | Password |
|---|---|---|---|
| ADMIN | `admin@physiodesk.local` | `admin` | `Admin123!` |
| STAFF | `staff@physiodesk.local` | `staff` | `Staff123!` |

## Trade-offs

- **Stateless JWT + `token_version`:** logout revokes all of a user's sessions rather than
  just the current device. This is simple and effective, but not per-device logout, and a
  used refresh token stays valid until logout or expiry (no single-use rotation). Both
  would need server-side token storage.
- **Database exclusion constraints** tie the scheduling guarantee to PostgreSQL
  (`btree_gist`). That's a deliberate choice: it is the strongest and simplest guarantee
  available.
- **Fixed slot grid:** an appointment is exactly one slot aligned to the resolved start
  time. Variable-length or multi-slot sessions would need a duration on the appointment,
  but the exclusion constraints already handle arbitrary ranges.
- **Hard delete with guards** instead of soft delete: data is never silently hidden or
  cascaded away, at the cost of a 409 that tells the user to archive instead.
- **Services return ORM objects**, and endpoints convert them to response models. There's
  no repository layer, because SQLAlchemy is already that abstraction.
- **Therapist and override lists are not paginated**, because a clinic roster is small.

## What I Would Add With More Time

- User management API (create or deactivate staff, change password) and password policies.
- Per-device sessions with rotating single-use refresh tokens (a refresh-token table),
  plus login rate limiting.
- Audit trail (who booked, cancelled or voided what, and when).
- Invoice line items, links from invoices to appointments, printable PDF invoices, and
  refunds.
- Multi-slot and variable-length appointments; recurring appointment series.
- Structured JSON logging with request IDs, and metrics.
- CI pipeline running `make check` against a PostgreSQL service container.
- Faster tests: cheaper Argon2 parameters under test, and a transaction-per-test
  isolation strategy.
