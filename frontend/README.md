# PhysioDesk — Frontend

Next.js web app for PhysioDesk. It talks to the FastAPI backend (`../backend`) through a
small backend-for-frontend (BFF) layer and follows the fixed PhysioDesk design system.

See the [root README](../README.md) for full-stack setup. This file describes the
frontend's internals.

## Stack

| Concern      | Choice                                                                        |
| ------------ | ----------------------------------------------------------------------------- |
| Framework    | Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict)             |
| Styling      | Tailwind CSS 4, shadcn/ui (Radix primitives), Lucide icons                    |
| Server state | TanStack Query 5                                                              |
| Forms        | React Hook Form + Zod                                                         |
| Dates        | date-fns + `Intl` (clinic timezone)                                           |
| Fonts        | Fraunces, Inter and IBM Plex Mono via `next/font` (self-hosted at build time) |
| Quality      | ESLint (Next config), `tsc --noEmit`, Prettier (+ Tailwind class ordering)    |

## Commands

```bash
npm install          # or `make install` from the repo root
cp .env.example .env.local
npm run dev          # http://localhost:3000 (needs the API on :8000)
npm run lint
npm run typecheck    # next typegen && tsc --noEmit
npm run format       # prettier --write .
npm run build
npm run check        # lint + typecheck + format:check + build
npm run gen:api      # regenerate src/types/api.gen.ts from openapi.json
```

## Environment

| Variable                      | Default                 | Purpose                                                                      |
| ----------------------------- | ----------------------- | ---------------------------------------------------------------------------- |
| `API_URL`                     | `http://localhost:8000` | FastAPI base URL. **Server-only**: the browser never calls FastAPI directly. |
| `API_PREFIX`                  | `/api/v1`               | FastAPI API prefix                                                           |
| `COOKIE_SECURE`               | `true` in production    | Set `false` only for plain-HTTP deployments                                  |
| `NEXT_PUBLIC_CLINIC_TIMEZONE` | `Asia/Kathmandu`        | Must match the backend's `CLINIC_TIMEZONE`                                   |
| `NEXT_PUBLIC_CURRENCY`        | `NPR`                   | Label shown with amounts (the API stores amounts without a currency)         |

## Structure

```
src/
├── app/
│   ├── (auth)/login/             # split-screen sign-in (no sign-up)
│   ├── (dashboard)/              # authenticated app, wrapped in the AppShell
│   │   ├── page.tsx              # dashboard
│   │   ├── patients/[id]/        # list + profile
│   │   ├── schedule/  billing/  therapists/[id]/
│   │   └── error.tsx             # error boundary inside the shell
│   ├── api/
│   │   ├── auth/{login,logout,session}/route.ts   # BFF: token cookies
│   │   └── backend/[...path]/route.ts             # BFF: authenticated proxy to FastAPI
│   ├── layout.tsx  globals.css  not-found.tsx
├── components/
│   ├── ui/          # shadcn primitives, restyled to the design system
│   ├── shared/      # PageHeader, Panel, StatusBadge, Money, Pagination, SearchInput,
│   │                # FilterSelect, FormField, DatePicker, ConfirmDialog, Empty/Error states…
│   ├── layout/      # AppShell, Sidebar, Logo
│   ├── dashboard/  patients/  schedule/  billing/  therapists/  auth/
├── hooks/           # useTherapists, useSearchParamState, invalidation helpers
├── lib/
│   ├── api/         # client.ts (the only fetch), errors.ts, one module per resource
│   ├── server/      # backend.ts: server-only cookie + refresh logic
│   ├── auth/        # session hook, permissions
│   ├── query/       # QueryClient defaults, centralised query keys
│   ├── validations/ # Zod schemas per form
│   ├── format.ts    # dates, times, money
│   └── labels.ts    # enum → label/tone/icon maps
├── types/           # api.gen.ts (generated) + api.ts (friendly aliases)
└── proxy.ts         # Next 16 "proxy" (middleware): route protection
```

Pages are thin server components that set metadata and render one feature component.
Interactive features are client components.

## Authentication (BFF)

```
Browser ──(same-origin, httpOnly cookies)──▶ Next.js route handlers ──(Bearer JWT)──▶ FastAPI
```

- `POST /api/auth/login` forwards credentials to FastAPI and stores the **access** and
  **refresh** tokens in `httpOnly`, `SameSite=Lax` cookies (`Secure` in production).
  JavaScript never sees a token.
- `/api/backend/*` forwards every API call with the access token. If FastAPI answers 401,
  the handler refreshes **once** with the refresh token, retries, and writes the new
  cookies. The client only sees a 401 when the session has truly ended. At that point the
  cookies are cleared and the client does a hard redirect to `/login?next=…`.
- `POST /api/auth/logout` calls FastAPI's logout, which revokes every token of that user,
  and clears the cookies.
- `src/proxy.ts` redirects page requests without a session cookie to `/login` (and
  `/login` to `/` when signed in). This is an optimistic check. FastAPI validates every
  request.
- Token-issuing endpoints can't be reached through the generic proxy (`/api/backend/auth/*`
  returns 404).

## Data layer

- **One HTTP entry point** (`lib/api/client.ts`). Errors are normalised into `ApiError`
  (`status`, `code`, `message`, `fieldErrors`), covering FastAPI's
  `{"detail":{"code","message"}}` body, its 422 validation list, and network failures.
- **Types are generated** from the backend's OpenAPI schema (`make api-types` at the repo
  root), so the frontend can't drift from the API.
- **TanStack Query owns server state.** Keys live in `lib/query/keys.ts` and are
  hierarchical, so a mutation can invalidate a whole family. For example, an appointment
  change invalidates the schedule, dashboard, appointments, patients (history and stats)
  and the therapist roster (patients seen today).
- **Filters and pagination live in the URL** (`/patients?status=ACTIVE&search=sita&page=2`,
  `/billing?status=DUE`, `/schedule?date=2026-09-23&therapist=…`). Search is debounced.

## Forms and errors

- React Hook Form + Zod mirror the backend constraints for fast feedback. The backend stays
  authoritative, and its 422 field errors are mapped back onto the matching fields.
- Form dialogs mount their form only while open, so each open starts from fresh values.
- 409 conflicts are explained in context rather than shown as a generic failure:
  - **Double booking:** the form is kept, availability is refetched, the stale time is
    cleared, and the dialog says "That time was just booked by another user…".
  - **Schedule changes that would strand bookings:** the dialog explains which
    appointments block the change and what to do.
  - **Deleting a patient or therapist with history:** the dialog explains why, and
    suggests archiving or deactivating instead.

## Design system

The tokens in `src/app/globals.css` are the brief's palette, exposed as Tailwind utilities
(`bg-primary`, `bg-primary-soft`, `text-primary-ink`, `bg-sidebar`, `bg-success-soft`, …).
The only additions are a few named interaction tints (hover, subtle surface, skeleton).

- Status colours are used only in status pills. Every pill also has a glyph, so meaning
  never depends on colour alone.
- Typography:
  - **Fraunces** for page titles, section headings and metric values.
  - **Inter** for all UI text.
  - **IBM Plex Mono** for money, times, invoice numbers and other figures (tabular numerals).
- Cards use 14px radius, a 1px border and a very soft shadow.
- Motion is limited to 150–200ms, and `prefers-reduced-motion` is respected.

## Dates, times and money

- Appointment dates (`YYYY-MM-DD`) and times (`HH:MM`) are clinic-local wall-clock values.
  They're formatted as-is and never pass through the browser's timezone.
- Timestamps (`created_at`, `paid_at`, …) are shown in the clinic timezone, whatever the
  viewer's timezone.
- "Today" for the schedule and dashboard comes from the backend response, and otherwise
  from the clinic timezone.
- Money arrives as decimal strings and is formatted without floating-point arithmetic. The
  invoice preview computes in integer cents, and the server computes the stored total.
