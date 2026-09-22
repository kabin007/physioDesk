# PhysioDesk

PhysioDesk is a clinic management system for a physiotherapy practice. Front-desk staff
use it to:
- register patients;
- see every therapist's day at a glance;
- book and reschedule sessions without double-booking;
- look up billing.

Admins also manage the therapist roster, date-specific schedule changes and invoices.

| Part | What it is | Docs |
|---|---|---|
| [`backend/`](backend/) | FastAPI + PostgreSQL REST API | [backend/README.md](backend/README.md) |
| [`frontend/`](frontend/) | Next.js web app | [frontend/README.md](frontend/README.md) |

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Test Credentials](#test-credentials)
3. [Features](#features)
4. [Architecture](#architecture)
5. [Tech Stack](#tech-stack)
6. [Repository Structure](#repository-structure)
7. [Setup in Detail](#setup-in-detail)
8. [Environment Variables](#environment-variables)
9. [Roles and Permissions](#roles-and-permissions)
10. [How Scheduling Works](#how-scheduling-works)
11. [Data Integrity](#data-integrity)
12. [Testing and Code Quality](#testing-and-code-quality)
13. [Make Commands](#make-commands)
14. [Troubleshooting](#troubleshooting)
15. [Key Assumptions](#key-assumptions)
16. [Trade-offs](#trade-offs)
17. [What I Would Add With More Time](#what-i-would-add-with-more-time)

---

## Quick Start

Prerequisites: **Python 3.12+**, **[uv](https://docs.astral.sh/uv/)**, **Node.js 20+**
(22 LTS recommended), **Docker** and **GNU Make**.

```bash
git clone https://github.com/kabin007/physioDesk.git
cd physioDesk

make env        # backend/.env (random JWT secret) + frontend/.env.local
make install    # uv sync + npm ci
make db-up      # PostgreSQL 16 in Docker on localhost:5433
make migrate    # create the schema (Alembic)
make seed       # demo data + admin/staff users
make dev        # API on :8000 and web app on :3000 (Ctrl+C stops both)
```

| | URL |
|---|---|
| Web app | **http://localhost:3000** |
| API docs (Swagger) | **http://localhost:8000/docs** |
| OpenAPI schema | http://localhost:8000/openapi.json |
| Health | http://localhost:8000/health · http://localhost:8000/health/ready |

You can also run the parts in separate terminals with `make backend` and `make frontend`.

---

## Test Credentials

Created by `make seed`. **For development only.**

| Role | Email | Username | Password |
|---|---|---|---|
| Admin | `admin@physiodesk.local` | `admin` | `Admin123!` |
| Staff | `staff@physiodesk.local` | `staff` | `Staff123!` |

The seed data is relative to the day you run it:
- 4 therapists with different schedules and slot lengths;
- 10 patients;
- about 3 weeks of past, today's and upcoming appointments;
- paid, due and void invoices;
- overrides: one therapist **off today**, another on **custom hours tomorrow**.

The dashboard and schedule show meaningful data straight away. `make seed-reset`
regenerates the data for the current day.

---

## Features

### Screens

| Screen | What it does |
|---|---|
| **Login** | Email *or* username + password. No sign-up. Redirects back to the page you tried to open. |
| **Dashboard** | Live figures: patients seen today, therapists on duty, revenue collected, open slots (with total and booked). Per-therapist capacity bars for today, and the latest patients. |
| **Patients** | Search by name or phone (debounced), filter by therapist and status, server-side pagination. Add, edit and delete in dialogs. Filters live in the URL. |
| **Patient profile** | Details, metrics (sessions completed, upcoming, total paid, outstanding), last visit and next appointment, plus **Sessions** and **Billing** history tabs. Book an appointment directly from the profile. |
| **Schedule** | Day grid with therapists as columns and time as rows. Mixed slot lengths share one time axis. Shows open, booked and completed slots, days off and custom hours, and a "now" line. Click an open slot to book it (pre-filled); click a booking for its details. |
| **Booking / reschedule** | Patient search, therapist, date, **only genuinely open time slots**, payment method, session type, notes. Handles someone else taking the slot first: the form is kept, availability refreshes, and a clear message is shown. |
| **Appointment details** | Complete, reschedule or cancel. Only the transitions the backend allows are offered. |
| **Billing** | Invoice list (search, status filter, pagination). Admins can create (with live total preview), edit, mark as paid, and void (with confirmation). Staff get a read-only view. |
| **Therapists** | Roster with working days, hours, slot length, weekly hours and patients seen today. Admins can add, edit, deactivate and delete. |
| **Therapist detail** | Weekly schedule and **date overrides** (day off / custom hours). Admins manage the overrides. |

### Across the app

- **Loading states:** skeletons, not spinners.
- **Empty states:** real messages, not blank screens.
- **Errors:** retryable error states, a page-level error boundary, and not-found pages.
- **Confirmations:** every destructive action asks first, in precise words ("Void this invoice?").
- **Toasts:** on completed mutations only.
- **Accessibility:** keyboard navigation, visible focus, labelled controls, focus-trapped
  dialogs, and status pills with icons as well as colour.
- **Responsive:** built for 1440px. Down to tablet width, the sidebar collapses to a menu
  and tables and the schedule scroll horizontally.

---

## Architecture

```
┌────────────┐  same-origin, httpOnly    ┌──────────────────────────┐   Bearer JWT   ┌──────────┐     ┌────────────┐
│  Browser   │ ───── cookies ──────────▶ │ Next.js (frontend/)      │ ─────────────▶ │ FastAPI  │ ──▶ │ PostgreSQL │
│ React UI   │                           │ pages + BFF route        │                │ backend/ │     │            │
│ TanStack Q │ ◀──────────────────────── │ handlers (/api/*)        │ ◀───────────── │          │ ◀── │            │
└────────────┘                           └──────────────────────────┘                └──────────┘     └────────────┘
```

**Backend.** A modular monolith with layers routes → schemas → services → models.
- Business rules live in services.
- PostgreSQL enforces the invariants: exclusion constraints against double booking,
  CHECKs, a generated invoice total, and RESTRICT foreign keys.
- Alembic owns the schema.

See [backend/README.md](backend/README.md).

**Frontend.** Next.js App Router.
- The browser never holds a JWT. Route handlers keep the access and refresh tokens in
  httpOnly cookies, forward API calls to FastAPI, and refresh transparently.
- TanStack Query owns server state, and API types are generated from the backend's OpenAPI
  schema.

See [frontend/README.md](frontend/README.md).

---

## Tech Stack

| Layer | Choice |
|---|---|
| Backend | Python 3.12, FastAPI, Pydantic v2, pydantic-settings |
| Database / ORM | PostgreSQL 16, SQLAlchemy 2 (async) + asyncpg, **Alembic** migrations |
| Auth | JWT access/refresh tokens (PyJWT), Argon2 password hashing (pwdlib) |
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS 4, shadcn/ui (Radix), Lucide icons |
| Frontend data | TanStack Query, React Hook Form + Zod, date-fns |
| Tooling | uv, Ruff, mypy (strict), pytest · ESLint, Prettier, tsc |
| Infrastructure | Docker Compose (PostgreSQL, optional API container) |

---

## Repository Structure

```
physioDesk/
├── Makefile                 # full-stack developer commands (delegates to backend/ and frontend/)
├── README.md
├── backend/                 # FastAPI app, Alembic migrations, seed script, 63 tests
│   ├── app/                 # api/ · schemas/ · services/ · db/ · core/ · utils/
│   ├── migrations/  scripts/  tests/
│   ├── Makefile  docker-compose.yml  Dockerfile  pyproject.toml  uv.lock
│   └── README.md
└── frontend/                # Next.js app
    ├── src/app/             # routes: (auth)/login, (dashboard)/…, api/ (BFF)
    ├── src/components/      # ui/ · shared/ · layout/ · dashboard/ · patients/ · schedule/ · billing/ · therapists/
    ├── src/lib/             # api/ · server/ · auth/ · query/ · validations/ · format · labels
    ├── src/types/           # generated OpenAPI types + aliases
    ├── openapi.json         # schema snapshot used for type generation
    └── README.md
```

---

## Setup in Detail

1. **Configuration.** `make env` creates `backend/.env` (from `.env.example`, with a
   freshly generated `JWT_SECRET_KEY`) and `frontend/.env.local`. Existing files are left
   untouched.
2. **Dependencies.** `make install` runs `uv sync` in `backend/` and `npm ci` in
   `frontend/`.
3. **Database.** `make db-up` starts PostgreSQL 16 in Docker on port **5433** (so it
   doesn't clash with a local 5432). To use your own PostgreSQL, set `DATABASE_URL` in
   `backend/.env`. The `btree_gist` and `pg_trgm` extensions are required; the migration
   enables them.
4. **Migrations.** `make migrate` builds the schema from scratch. `make migration
   name="…"` (in `backend/`) autogenerates new migrations.
5. **Seed.** `make seed` is safe to re-run. `make seed-reset` wipes clinic data (keeping
   users) and reseeds.
6. **Run.** Use `make dev` for both parts, or `make backend` and `make frontend`
   separately. The frontend needs the API on `API_URL` (default `http://localhost:8000`).

A fully containerised API is also available: `make -C backend docker-up`, then
`docker compose -f backend/docker-compose.yml exec api python -m scripts.seed`.

---

## Environment Variables

**Backend (`backend/.env`).** The full list is in
[backend/README.md](backend/README.md#environment-variables).

| Variable | Example | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://physiodesk:physiodesk@localhost:5433/physiodesk` | Database |
| `JWT_SECRET_KEY` | *(generated by `make env`)* | Signs tokens (≥ 32 chars) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` / `REFRESH_TOKEN_EXPIRE_DAYS` | `30` / `7` | Token lifetimes |
| `CORS_ORIGINS` | `http://localhost:3000` | Only needed for direct browser calls (the web app uses its BFF) |
| `CLINIC_TIMEZONE` | `Asia/Kathmandu` | Defines "today" |

**Frontend (`frontend/.env.local`)**

| Variable | Example | Purpose |
|---|---|---|
| `API_URL` | `http://localhost:8000` | FastAPI base URL (server-side only) |
| `API_PREFIX` | `/api/v1` | API prefix |
| `COOKIE_SECURE` | *(true in production)* | Set `false` only for plain-HTTP deployments |
| `NEXT_PUBLIC_CLINIC_TIMEZONE` | `Asia/Kathmandu` | Must match the backend |
| `NEXT_PUBLIC_CURRENCY` | `NPR` | Currency label for amounts |

---

## Roles and Permissions

The **backend enforces** every rule. The UI mirrors them by *hiding* actions a role can't
perform, rather than showing disabled buttons.

| Feature | Admin | Staff |
|---|:---:|:---:|
| Dashboard, schedule grid | ✅ | ✅ |
| Patients: view, create, edit, delete | ✅ | ✅ |
| Appointments: book, reschedule, complete, cancel | ✅ | ✅ |
| Therapists and overrides: view | ✅ | ✅ (view-only badge) |
| Therapists and overrides: create, edit, deactivate, delete | ✅ | ❌ (hidden; API returns 403) |
| Invoices: view | ✅ | ✅ (view-only badge) |
| Invoices: create, edit, mark paid, void | ✅ | ❌ (hidden; API returns 403) |

---

## How Scheduling Works

Availability for a therapist on a date is resolved in this order:
1. An inactive therapist is unavailable.
2. A date **override** for a day off makes them unavailable.
3. A date **override** with custom hours uses those hours.
4. A weekday not in their working days makes them unavailable.
5. Otherwise their regular hours apply.

**Slots** are generated from the resolved hours in steps of the therapist's slot length.
They're never stored, and a booking takes exactly one slot.

**A booking is accepted only when** all of these hold:
- the therapist is active;
- the date is today or later;
- the start time is on a slot boundary within the resolved hours;
- neither the therapist nor the patient has an overlapping active appointment.

The end time is always computed by the server, and rescheduling runs the same checks.

**Double booking is impossible, even under concurrent requests.** PostgreSQL exclusion
constraints reject overlapping active appointments. The UI handles that 409 by keeping the
form, refreshing availability and asking the user to choose another slot.

**Schedule changes never strand bookings.** Editing hours, deactivating a therapist, or
adding or removing an override is refused (409) if an upcoming booking would fall outside
the new availability. The UI explains which bookings block it and what to do.

---

## Data Integrity

- **History is never silently lost:**
  - Patients or therapists with appointments or invoices can't be deleted (409). Archive
    the patient with a status change, or deactivate the therapist.
  - Deleting an appointment **cancels** it; deleting an invoice **voids** it.
- **PostgreSQL enforces:**
  - valid ages, hours and slot lengths;
  - non-negative money, with discount ≤ subtotal;
  - total = subtotal − discount, as a generated column;
  - one override per therapist per date;
  - unique emails, usernames and invoice numbers.
- **Types:** money is exact `NUMERIC` (decimal strings in JSON), and timestamps are UTC.
  Appointment times are clinic-local.

---

## Testing and Code Quality

```bash
make check    # everything below, for both parts
```

| Part | Gate | Result |
|---|---|---|
| Backend | `ruff check`, `ruff format --check`, `mypy --strict` | ✅ clean |
| Backend | `pytest`: 63 tests on an isolated, Alembic-migrated `*_test` database | ✅ 63 passed |
| Frontend | `npm run lint` (ESLint) | ✅ clean |
| Frontend | `npm run typecheck` (route types + `tsc --noEmit`) | ✅ clean |
| Frontend | `npm run format:check` (Prettier) | ✅ clean |
| Frontend | `npm run build` | ✅ succeeds |

**Backend tests** cover auth and RBAC, patients, scheduling rules, a concurrent
double-booking race, overrides and rescheduling, billing rules, and dashboard statistics.

**The full workflow was verified in a real browser**, with Playwright driving the UI
against the running stack (31 checks):
- **Login and routing:** redirect to login when signed out, and back to the requested page
  after login.
- **Patients and booking:** create a patient, then book from the profile.
- **Conflict handling:** a real concurrent double-booking conflict, where the form is kept,
  the taken slot disappears and the message is shown.
- **Appointment actions:** reschedule; complete for today; cancel for future appointments.
- **Billing:** create an invoice (total preview), mark it paid, and see dashboard revenue
  update by exactly the paid total.
- **Therapists:** add a therapist and a day-off override, then see "Day off" on the
  schedule.
- **Logout** ends the session.
- **Staff:** mutation controls are hidden; a forced admin request gets 403; tokens are not
  readable from JavaScript.

That browser suite isn't committed (see [What I Would Add](#what-i-would-add-with-more-time)).

---

## Make Commands

| Command | What it does |
|---|---|
| `make help` | List commands |
| `make env` | Create `backend/.env` and `frontend/.env.local` |
| `make install` | Install backend and frontend dependencies |
| `make db-up` / `make db-down` | Start / stop PostgreSQL (Docker) |
| `make migrate` | Apply migrations |
| `make seed` / `make seed-reset` | Load / regenerate demo data |
| `make dev` | API + web app together |
| `make backend` / `make frontend` | Run one part |
| `make test` | Backend tests |
| `make lint` / `make typecheck` | Both parts |
| `make check` | All quality gates, both parts |
| `make build` | Production build of the web app |
| `make api-types` | Regenerate frontend types from the backend OpenAPI schema |
| `make clean` | Remove caches and build output |

`backend/Makefile` has more (`test-cov`, `format`, `migration`, `docker-up`, …).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `port 5433 is already allocated` | Run `POSTGRES_PORT=5434 make db-up` and update `DATABASE_URL` in `backend/.env` to match. |
| Web app shows "The PhysioDesk API is unreachable" | Start the API (`make backend`) and check `API_URL` in `frontend/.env.local`. |
| Signed out unexpectedly | Sessions last as long as the refresh token (7 days). Logging out anywhere signs the user out everywhere. |
| Dashboard or schedule look empty | Seed data is relative to the day it was generated. Run `make seed-reset`. |
| `uv: command not found` | Install uv (see Quick Start) and restart the shell. |
| Login cookie not set on a remote HTTP deployment | Cookies are `Secure` in production. Serve over HTTPS, or set `COOKIE_SECURE=false`. |

---

## Key Assumptions

The full list, with reasoning, is in [backend/README.md](backend/README.md#important-assumptions).

- **Patients seen today:** distinct patients with a *completed* appointment today.
- **Revenue today:** the sum of *paid* invoices whose payment time falls today, in the
  clinic timezone. Void invoices never count.
- **Open slots:** slots of on-duty therapists minus booked or completed ones. Earlier slots
  today still count, because same-day walk-ins can be recorded.
- **Staff role:** read-only for billing and therapist management; full access to patients
  and appointments.
- **Appointments:** each takes exactly one slot. Booking is allowed from today onwards.
  Only past or today's appointments can be completed.
- **Date overrides** always take precedence over the weekly schedule.
- **Logout** signs the user out on every device (token version bump).
- **Currency:** the API stores amounts without a currency. The UI labels them `NPR`
  (configurable), matching the clinic's `Asia/Kathmandu` timezone.
- **Timezones:** all dates and times shown in the UI are clinic-local, whatever the
  viewer's timezone.
- **Accounts:** users are provisioned by the seed script. There is no sign-up or user
  management screen.

---

## Trade-offs

- **BFF proxy instead of calling FastAPI from the browser.** It adds one network hop, but
  tokens stay in httpOnly cookies, refresh is invisible to the UI, and CORS never comes into
  play.
- **Stateless JWT logout via token version.** Logging out revokes all of a user's sessions,
  not just one device. That avoids needing a token store.
- **Client-rendered data screens.** Pages are statically shelled and data loads via
  TanStack Query. That's simple and consistent, at the cost of a skeleton on first paint.
  Session-dependent UI waits for hydration so server and client output always match.
- **Scheduling correctness is tied to PostgreSQL** (exclusion constraints). This is a
  deliberate choice: it's the strongest guarantee available.
- **Guarded hard deletes instead of soft deletes.** Nothing is silently hidden, at the cost
  of a 409 that suggests archiving.

---

## What I Would Add With More Time

- A committed Playwright end-to-end suite with its own seeded database, running in CI
  alongside `make check`.
- User management: invite staff, reset passwords, deactivate accounts.
- Per-device sessions with single-use rotating refresh tokens, and login rate limiting.
- Audit trail: who booked, cancelled or voided what, and when.
- Printable/PDF invoices, invoice line items, and linking invoices to appointments.
- Multi-slot and recurring appointments; a week view of the schedule.
- Structured logging with request IDs, and monitoring.
