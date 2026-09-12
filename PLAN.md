# Barber — Implementation Plan

**Scope:** Backend only (Deno + Thunder, already initialized). Multi-tenant marketplace: independent barber shops register, publish barbers/services/hours; customers book appointments. **Payment happens in-shop only — no online payments.** No frontend, no notifications in this scope.

**Thunder conventions applied (verified via docs):** top-level `routes/{name}.ts` files only (subfolders ignored); `new Router("/api", function name(router) {...})` in `routes/shops.ts` ⇒ `/shops/api/...`; named prepare callbacks returning `{ shape, handler }`; Zod schemas defined in the prepare phase and parsed in the handler via `bodyAsJson` / `queryAsJson` / `paramsAsJson`; `router.del` for DELETE; `Response` helpers from `@/core/http/response.ts`; `mongodb` collections from `@/database.ts` with `$objectId.meta({ ref })` foreign-reference naming (no `Id` suffix); indexes only in `scripts/`; no modifications to `core/` or `plugins/`.

**Unverified / to confirm before coding:**
- `Huruf-Tech/thunder-core` (better-auth, sessions, RBAC, CORS/security headers, `withAuthSession`, `withTenant`, `withAuthGuard`) is documented as *recommended*, but exact auth route paths, helper signatures, and the auth user `_id` type (ObjectId vs string) are **not** verified. Inspect the installed plugin version first; wrap it in a project-owned `lib/auth.ts` adapter so route code does not depend on plugin internals.
- `Response` has no documented `conflict()` helper — return `Response.json(body, { status: 409 })` for conflicts.
- `strictParse` is documented as a Thunder-provided Zod parser; confirm availability in the installed core version, otherwise use `parse`.

---

## Functional Requirements

### FR-1 Authentication & Identity
- **Actors:** Guest, Customer, Shop Owner, Platform Admin.
- Registration/login/session handling is delegated to **thunder-core (better-auth)**; this project does **not** implement password storage or sessions.
- Project-owned `hooks/auth.ts` (priority 100) resolves the session once per request and exposes `X-User-Id` + roles on request headers; project-owned `lib/authz.ts` provides `requireUser`, `requireShopRole(shop, roles)`, `requirePlatformAdmin`.
- A user holds a global role (`customer` | `admin`) plus zero or more **shop memberships** (`owner` | `manager`).
- Failures: missing/invalid session ⇒ `401`; authenticated but lacking shop membership/role ⇒ `403`.

### FR-2 Shop Onboarding & Profile (Shop Owner, Platform Admin)
- Any authenticated user may create a shop; creator automatically becomes `owner` member.
- Shop fields: name, unique slug, description, phone, address (line1, city, state, postalCode, country, geo point), **IANA timezone** (required), photos (URLs), `status` (`pending` | `active` | `suspended`), weekly opening hours, booking policy.
- New shops start `pending` and are invisible in public search until a Platform Admin sets `active`. Admin may `suspend` (hides shop, blocks new bookings, keeps existing appointments readable).
- Owners may update their own shop only (tenant isolation on `shop`), and may add/remove `manager` members by user email. The last `owner` cannot be removed.
- Validation: slug `^[a-z0-9-]{3,60}$` and globally unique (409 on duplicate); timezone validated against `Intl.supportedValuesOf("timeZone")`; opening hours `HH:mm`, `open < close`, no overlapping intervals per weekday.

### FR-3 Services Catalog (Shop Owner/Manager)
- CRUD of services scoped to the shop: name, description, `durationMinutes` (5–480, multiple of 5), `priceCents` (≥0, integer), `currency` (ISO-4217), `bufferAfterMinutes` (0–120), `active`.
- Price/duration are **snapshotted** onto each appointment at booking time; later edits never mutate existing appointments.
- Deleting a service performs a **soft delete** (`active=false`) when future appointments reference it; hard delete only when unreferenced.

### FR-4 Barbers & Availability (Shop Owner/Manager)
- Barbers are shop-managed records (**no barber login in this scope**): name, bio, photo, `services` (subset of shop services), `active`.
- Weekly `workingHours` per barber (weekday + intervals), constrained to lie within shop opening hours.
- **Time off**: dated blocks (`startAt`/`endAt` UTC, reason) preventing bookings; creating time off that overlaps existing booked appointments is rejected with a list of conflicting appointment IDs (`409`) unless `force=true`, which cancels them with reason `shop_time_off`.
- Any change to shop hours, barber hours, time off, or a service duration increments the shop's `scheduleRevision` (concurrency guard, see FR-6).

### FR-5 Discovery & Slot Search (Public / Guest)
- Public list/search of `active` shops: by text (name/description), city, geo radius (`near` + `radiusKm`, `$nearSphere`), service name, sorted by distance or rating; paginated (`offset`/`limit`, limit ≤ 100).
- Public shop detail returns shop, active services, active barbers, opening hours — never member/customer PII.
- **Availability endpoint** computes free slots for `(shop, service, date, barber?)`:
  1. Resolve the shop timezone; expand the requested local date range (max 14 days) into UTC intervals from barber working hours ∩ shop opening hours.
  2. Subtract time off, blackout dates, and existing `active` appointments (each occupying `start → end + service.bufferAfterMinutes`).
  3. Emit candidate starts on `slotGranularityMinutes` (shop policy, default 15) where the whole `durationMinutes` fits.
  4. Drop slots earlier than `now + minLeadTimeMinutes` and later than `now + maxAdvanceDays`.
- Slot results are advisory only; the booking transaction is authoritative.

### FR-6 Booking (Customer)
- A customer books: `shop`, `barber`, `service`, `startAt` (UTC ISO), optional `notes` (≤500 chars), optional guest contact name/phone for the customer profile.
- Server recomputes `endAt = startAt + durationMinutes` and validates, inside a **MongoDB transaction** (`mongodb.withSession` + `session.withTransaction`):
  1. Shop `active`, barber `active` and belongs to shop, service `active` and offered by the barber.
  2. `startAt` aligned to slot granularity; within lead-time and max-advance window.
  3. Slot inside working hours, outside time off/blackouts.
  4. No overlap with existing `active` appointments for that barber (including buffer).
  5. Customer has no other `active` appointment overlapping the same interval (double-booking guard).
  6. Per-customer caps: max `maxActivePerShop` (default 3) active appointments per shop.
  7. Re-read `shop.scheduleRevision` at commit; if it changed since slot validation, abort with `409 SCHEDULE_CHANGED`.
- A **partial unique index** on `{ barber: 1, startAt: 1 }` filtered by `active: true` is the final race guard; duplicate-key errors map to `409 SLOT_TAKEN`.
- Created appointments start as `confirmed` (auto-confirm) unless shop policy `requiresApproval` is on, in which case they start `pending` and require owner/manager action.
- Every appointment records `priceCentsSnapshot`, `durationSnapshot`, `currency`, `timezone`, and `paymentMode: "in_shop"`; no payment state machine exists.

### FR-7 Appointment Lifecycle
- Statuses: `pending → confirmed → completed`, plus `cancelled_by_customer`, `cancelled_by_shop`, `no_show`, `rejected`.
- Allowed transitions:
  - Customer: cancel own `pending`/`confirmed` appointment while `now < startAt - cancellationWindowMinutes` (default 120); reschedule = cancel + rebook via a dedicated endpoint that runs FR-6 validation atomically and links `rescheduledFrom`.
  - Owner/Manager: confirm or reject `pending`; cancel `pending`/`confirmed` with reason; mark `completed` or `no_show` only after `startAt`.
  - Platform Admin: read-only access plus forced cancel on shop suspension.
- Any transition into a terminal status sets `active=false`, freeing the slot; illegal transitions ⇒ `409 INVALID_TRANSITION`; acting on another tenant's appointment ⇒ `403`.
- Every transition appends an immutable entry to `appointments.history` (`from`, `to`, `by`, `reason`, `at`).

### FR-8 Appointment Access & Listing
- Customer lists own appointments filtered by `status` and `upcoming|past`, sorted by `startAt`.
- Owner/Manager lists shop appointments filtered by date range (shop-local day), barber, status — always tenant-scoped by `shop`; returns customer name/phone for operational use only.
- Fetching an appointment requires being its customer, a member of its shop, or platform admin (`404` rather than `403` for non-members, to avoid existence leaks on direct-ID probing).

### FR-9 Reviews (Customer)
- A customer may post exactly one review per `completed` appointment: `rating` 1–5, `comment` ≤ 1000 chars; reviewable within 30 days of `startAt`.
- Reviews are public and denormalize `ratingAverage` / `ratingCount` onto the shop (and barber) via `$inc`/recompute inside the review transaction.
- Owner may post one public `reply` per review. Platform admin may hide a review (`hidden=true`, excluded from public lists and aggregates recomputation).
- Reviewing a non-completed/foreign appointment ⇒ `403`; duplicate review ⇒ `409` (enforced by unique index on `appointment`).

### Thunder components to reuse
| Need | Reuse |
|---|---|
| Auth, sessions, RBAC, CORS, security headers | `Huruf-Tech/thunder-core` plugin (adapter-wrapped) |
| Simple owner-scoped CRUD (services, barbers, time off) | `createCRUD` with `isolationFields` keyed on `shop` |
| Validation + OpenAPI/SDK generation | Zod `shape()` per route, `deno task generate:openapi` / `generate:sdk` |
| Responses & errors | `Response.*` helpers; thrown `Response`; automatic `ZodError → 400` |
| Request parsing | `bodyAsJson`, `queryAsJson`, `paramsAsJson` |
| Config | `Env.get/number/enabled` from `@/core/utils/env.ts` |
| Logging | `Logger` from `@/core/utils/logger.ts` |
| Read-through caching of shop/barber config in availability | `cache(fn, 30_000)` from `@/core/utils/cache.ts` |
| Indexes | `scripts/syncDBIndexes.ts` with `import.meta.main` guard |
| Bulk maintenance (e.g. auto-complete past appointments) | `paginated` util inside `workers/` (deployed separately) |

---

## Non-Functional Requirements

**Security (confirmed)**
- All mutating endpoints require an authenticated session; public endpoints are read-only and expose no PII.
- Tenant isolation is enforced server-side on every query via `shop` in the filter — never trusted from the body alone.
- All input parsed with Zod; unknown fields stripped; `ObjectId` casting via `$objectId` with `400` on malformed IDs.
- No secrets in code; all config via `Env`. CORS/security headers via thunder-core configuration.

**Performance (proposed targets)**
- p95 < 150 ms for reads, < 300 ms for booking transactions (excluding cold start), measured at 50 rps.
- Availability computation for one barber/7 days performs ≤ 3 queries and runs in-process (no per-slot queries).
- Pagination mandatory: default `limit=20`, max `100`; no unbounded `find()`.
- Serverless-friendly: no startup index creation, no in-request background loops, reuse the shared `mongodb` client.

**Reliability**
- Booking, reschedule, forced time-off cancellation, and review aggregation run in MongoDB transactions (**requires a replica set / Atlas** — single-node standalone Mongo is unsupported; proposed assumption).
- Partial unique index as the last-resort double-booking guard; duplicate-key errors handled, never surfaced raw.
- All write endpoints are idempotent-safe: booking accepts an optional `Idempotency-Key` header stored on the appointment with a unique sparse index; a repeat key returns the original appointment.
- All timestamps stored as UTC `Date`; shop timezone stored as IANA string; DST handled by converting local wall-clock rules to UTC per date.

**Observability**
- `Logger.error` on transaction aborts, conflict responses, and authz denials with `{ requestId, userId, shopId, route }`; no PII in logs.
- Structured error codes in responses: `{ error: { code, message, details? } }` with codes `SLOT_TAKEN`, `SCHEDULE_CHANGED`, `INVALID_TRANSITION`, `OUTSIDE_WORKING_HOURS`, `LEAD_TIME_VIOLATION`, `LIMIT_EXCEEDED`, `DUPLICATE_SLUG`, `NOT_A_MEMBER`.
- `GET /health` returning app + MongoDB ping status.

**Testing (proposed)**
- Unit tests for the slot generator (DST boundaries, buffers, partial-day time off, granularity) and the status transition matrix.
- Integration tests per route group against an ephemeral Mongo replica set, including a concurrent-booking test that asserts exactly one success and one `409`.
- `deno task check` clean; OpenAPI spec regenerated on route changes.

---

## User Stories

**US-1 (FR-2)** As a shop owner, I want to register my shop, so that customers can find and book it.
*AC:* Authenticated POST creates a `pending` shop with me as `owner`; duplicate slug ⇒ 409 `DUPLICATE_SLUG`; the shop is absent from public search until an admin activates it.

**US-2 (FR-2)** As a platform admin, I want to approve or suspend shops, so that the marketplace stays trustworthy.
*AC:* Admin-only status change; `active` makes the shop publicly listable; `suspend` removes it from search and rejects new bookings with 409 while existing appointments remain readable; non-admin ⇒ 403.

**US-3 (FR-3)** As a shop owner, I want to manage my service menu, so that prices and durations are accurate.
*AC:* CRUD limited to my shop; `durationMinutes` not a multiple of 5 ⇒ 400; deleting a service referenced by future appointments soft-deactivates it and those appointments keep their snapshotted price/duration.

**US-4 (FR-4)** As a shop owner, I want to set each barber's weekly hours and time off, so that only real availability is bookable.
*AC:* Hours outside shop opening hours ⇒ 400; time off overlapping booked appointments ⇒ 409 listing conflicts; `force=true` cancels them with reason `shop_time_off`; `scheduleRevision` increments on each change.

**US-5 (FR-5)** As a guest, I want to search nearby shops and see open slots, so that I can choose a time.
*AC:* Search returns only `active` shops, paginated, sortable by distance; availability returns slots in UTC with the shop timezone; slots overlapping bookings/time off/lead-time are absent; range > 14 days ⇒ 400.

**US-6 (FR-6)** As a customer, I want to book a slot, so that my appointment is reserved.
*AC:* Valid request ⇒ 201 with status `confirmed` (or `pending` when `requiresApproval`) and snapshotted price/duration; concurrent identical booking ⇒ 409 `SLOT_TAKEN`; slot outside working hours ⇒ 409 `OUTSIDE_WORKING_HOURS`; repeating the same `Idempotency-Key` returns the same appointment.

**US-7 (FR-7)** As a customer, I want to cancel or reschedule, so that I can change plans.
*AC:* Cancel inside the cancellation window ⇒ 409 `INVALID_TRANSITION`; a successful cancel sets `active=false` and the slot reappears in availability; reschedule either fully succeeds (new appointment linked via `rescheduledFrom`, old one cancelled) or leaves the original untouched.

**US-8 (FR-7/FR-8)** As a shop manager, I want a day view of my shop's appointments and to mark outcomes, so that I can run the floor.
*AC:* Day list is tenant-scoped and filterable by barber/status; `completed`/`no_show` rejected before `startAt` ⇒ 409; another shop's appointment ⇒ 404.

**US-9 (FR-9)** As a customer, I want to review a completed visit, so that others can judge quality.
*AC:* Only my `completed` appointment within 30 days is reviewable; second review ⇒ 409; shop `ratingAverage`/`ratingCount` update atomically; owner can reply once.

---

## Use Cases

**UC-1 Book an appointment** — *Actor:* Customer. *Pre:* Authenticated; shop `active`.
1. Customer queries availability (FR-5) and picks a slot.
2. `POST /appointments/api` with shop, barber, service, `startAt`, optional `Idempotency-Key`.
3. Server opens a transaction, validates FR-6 rules 1–7, inserts the appointment with `active=true`.
4. Returns 201 with the appointment.
*Alt/Errors:* Duplicate idempotency key ⇒ 200 with the existing appointment. Slot taken (overlap check or duplicate-key) ⇒ 409 `SLOT_TAKEN`. Shop hours changed mid-flow ⇒ 409 `SCHEDULE_CHANGED`, client re-fetches availability. Shop suspended/inactive entities ⇒ 409/404. Transaction aborts ⇒ nothing persisted.
*Outcome:* Exactly one appointment occupies the barber/time, payable in shop.

**UC-2 Cancel by customer** — *Actor:* Customer. *Pre:* Owns an `active` appointment.
1. `POST /appointments/api/:id/cancel` with optional reason.
2. Server verifies ownership, status, and cancellation window; sets status `cancelled_by_customer`, `active=false`, appends history.
*Alt/Errors:* Past cutoff or terminal status ⇒ 409 `INVALID_TRANSITION`; not owner ⇒ 404.
*Outcome:* Slot released and visible in availability.

**UC-3 Shop declares time off with conflicts** — *Actor:* Owner/Manager. *Pre:* Member of the shop.
1. `POST /barbers/api/:id/time-off` with `startAt`/`endAt`.
2. Server finds overlapping `active` appointments; if any and `force!=true`, returns 409 with the conflict list.
3. With `force=true`, a transaction cancels conflicts as `cancelled_by_shop` (reason `shop_time_off`), inserts the time-off block, increments `scheduleRevision`.
*Alt/Errors:* `endAt <= startAt` ⇒ 400; non-member ⇒ 403.
*Outcome:* Barber unbookable for that range.

**UC-4 Reschedule** — *Actor:* Customer (or Owner/Manager). *Pre:* Appointment `pending`/`confirmed`, outside cancellation window.
1. `POST /appointments/api/:id/reschedule` with the new `startAt` and optional new barber.
2. In one transaction: validate the new slot (FR-6), cancel the original as `cancelled_by_customer` with `rescheduledTo`, insert the replacement with `rescheduledFrom`.
*Alt/Errors:* New slot unavailable ⇒ 409 and the original stays `confirmed`.
*Outcome:* Single active appointment at the new time, price re-snapshotted from the current service.

**UC-5 Complete visit and review** — *Actor:* Manager, then Customer. *Pre:* Appointment started.
1. Manager `POST /appointments/api/:id/complete`.
2. Customer `POST /reviews/api` with appointment, rating, comment.
3. Transaction inserts the review and updates shop/barber rating aggregates.
*Alt/Errors:* Not completed ⇒ 403; duplicate ⇒ 409; >30 days ⇒ 403.
*Outcome:* Public review affecting shop ranking.

**UC-6 Shop suspension by admin** — *Actor:* Platform Admin.
1. `PATCH /shops/api/:id/status` → `suspended` with reason.
2. Shop disappears from public search; new bookings rejected; existing appointments remain visible to both parties for manual handling in-shop.
*Outcome:* Shop isolated from the marketplace without data loss.

---

## Necessary Routes

All business routes live in top-level `routes/*.ts`; each file's `Router("/api", ...)` yields `/{file}/api/...`. Errors common to all authenticated routes: `401` (no session), `403` (role/tenant), `400` (Zod), `500`. Auth endpoints come from thunder-core (paths unverified — confirm after install).

### `routes/shops.ts` → `/shops/api`
| Method & Path | Purpose | Authz | Request → Response | Key errors |
|---|---|---|---|---|
| `GET /shops/api` | Public search (`q`, `city`, `lat`,`lng`,`radiusKm`, `service`, `sort`, `offset`, `limit`) | Public | query → `{ results: ShopPublic[], count }` | 400 bad geo params |
| `GET /shops/api/:id` | Public shop detail + active services/barbers/hours | Public | params → `ShopDetail` | 404 inactive/unknown |
| `POST /shops/api` | Create shop (status `pending`) | Customer (auth) | `{ name, slug, description?, phone, address, timezone, openingHours[], policy? }` → `Shop` | 409 `DUPLICATE_SLUG` |
| `PATCH /shops/api/:id` | Update profile/hours/policy (bumps `scheduleRevision` when hours change) | Owner/Manager | partial shop → `Shop` | 403, 404 |
| `PATCH /shops/api/:id/status` | Activate/suspend | Platform Admin | `{ status, reason? }` → `Shop` | 403 |
| `GET /shops/api/:id/members` | List members | Owner/Manager | → `Member[]` | 403 |
| `POST /shops/api/:id/members` | Add member by email | Owner | `{ email, role }` → `Member` | 404 user, 409 exists |
| `DELETE /shops/api/:id/members/:memberId` (`router.del`) | Remove member | Owner | → 204 | 409 last owner |
| `GET /shops/api/mine` | Shops I belong to | Auth | → `Shop[]` | — |

### `routes/services.ts` → `/services/api`
| Method & Path | Purpose | Authz | Request → Response | Key errors |
|---|---|---|---|---|
| `GET /services/api?shop=` | List services (public: active only) | Public/Member | → `{ results, count }` | 400 missing `shop` |
| `POST /services/api` | Create service | Owner/Manager | `{ shop, name, description?, durationMinutes, priceCents, currency, bufferAfterMinutes? }` → `Service` | 403, 400 |
| `PATCH /services/api/:id` | Update (bumps `scheduleRevision` on duration change) | Owner/Manager | partial → `Service` | 403, 404 |
| `DELETE /services/api/:id` | Soft/hard delete | Owner/Manager | → 204 | 409 referenced ⇒ deactivated instead |

*(Implementable with `createCRUD` + `isolationFields` returning `{ shop }`, with `beforeUpdate`/`afterUpdate` hooks for the revision bump; custom delete semantics registered separately with `disable: { del: true }`.)*

### `routes/barbers.ts` → `/barbers/api`
| Method & Path | Purpose | Authz | Request → Response | Key errors |
|---|---|---|---|---|
| `GET /barbers/api?shop=` | List barbers (public: active only) | Public/Member | → `{ results, count }` | 400 |
| `POST /barbers/api` | Create barber | Owner/Manager | `{ shop, name, bio?, photo?, services[] }` → `Barber` | 403, 400 service not in shop |
| `PATCH /barbers/api/:id` | Update profile/services/active | Owner/Manager | partial → `Barber` | 403, 404 |
| `PUT /barbers/api/:id/working-hours` | Replace weekly hours; bumps `scheduleRevision` | Owner/Manager | `{ weeklyHours: [{ weekday, intervals[] }] }` → `Barber` | 400 outside shop hours / overlaps |
| `POST /barbers/api/:id/time-off` | Create time-off block (`?force=true` to cancel conflicts) | Owner/Manager | `{ startAt, endAt, reason? }` → `TimeOff` | 409 conflicts list |
| `GET /barbers/api/:id/time-off` | List blocks in range | Member | `{ from, to }` → `TimeOff[]` | 403 |
| `DELETE /barbers/api/time-off/:id` | Remove block; bumps revision | Owner/Manager | → 204 | 404 |

### `routes/availability.ts` → `/availability/api`
| Method & Path | Purpose | Authz | Request → Response | Key errors |
|---|---|---|---|---|
| `GET /availability/api` | Free slots for `shop`, `service`, `from`, `to` (≤14 days), optional `barber` | Public | → `{ timezone, scheduleRevision, days: [{ date, barbers: [{ barber, slots: [{ startAt, endAt }] }] }] }` | 400 range/params, 404 shop/service |

### `routes/appointments.ts` → `/appointments/api`
| Method & Path | Purpose | Authz | Request → Response | Key errors |
|---|---|---|---|---|
| `POST /appointments/api` | Book (transactional) | Customer | header `Idempotency-Key?`; `{ shop, barber, service, startAt, notes?, contactPhone?, scheduleRevision? }` → `Appointment` (201) | 409 `SLOT_TAKEN` / `SCHEDULE_CHANGED` / `OUTSIDE_WORKING_HOURS` / `LEAD_TIME_VIOLATION` / `LIMIT_EXCEEDED` |
| `GET /appointments/api/me` | My appointments (`scope=upcoming\|past`, `status`, pagination) | Customer | → `{ results, count }` | — |
| `GET /appointments/api` | Shop appointments (`shop`, `from`, `to`, `barber?`, `status?`) | Owner/Manager (Admin read) | → `{ results, count }` | 403 |
| `GET /appointments/api/:id` | Detail | Customer-owner / shop member / admin | → `Appointment` | 404 |
| `POST /appointments/api/:id/cancel` | Cancel | Customer-owner or Owner/Manager | `{ reason? }` → `Appointment` | 409 `INVALID_TRANSITION` |
| `POST /appointments/api/:id/reschedule` | Cancel + rebook atomically | Customer-owner or Owner/Manager | `{ startAt, barber? }` → `Appointment` (new) | 409 conflicts |
| `POST /appointments/api/:id/confirm` | Approve `pending` | Owner/Manager | → `Appointment` | 409 |
| `POST /appointments/api/:id/reject` | Reject `pending` | Owner/Manager | `{ reason? }` → `Appointment` | 409 |
| `POST /appointments/api/:id/complete` | Mark completed | Owner/Manager | → `Appointment` | 409 before `startAt` |
| `POST /appointments/api/:id/no-show` | Mark no-show | Owner/Manager | → `Appointment` | 409 before `startAt` |

### `routes/reviews.ts` → `/reviews/api`
| Method & Path | Purpose | Authz | Request → Response | Key errors |
|---|---|---|---|---|
| `GET /reviews/api?shop=&barber?` | Public reviews (non-hidden), paginated | Public | → `{ results, count, ratingAverage }` | 400 |
| `POST /reviews/api` | Create review | Customer of a completed appointment | `{ appointment, rating, comment? }` → `Review` (201) | 403 not eligible, 409 duplicate |
| `POST /reviews/api/:id/reply` | Owner reply | Owner/Manager | `{ reply }` → `Review` | 409 already replied |
| `PATCH /reviews/api/:id/hide` | Hide/unhide | Platform Admin | `{ hidden }` → `Review` | 403 |

### `routes/index.ts`
`GET /health` — liveness + Mongo ping (public).

### Scripts & workers (not HTTP)
- `scripts/syncDBIndexes.ts` — exported `syncDBIndexes()` + `import.meta.main` guard; run via `deno run -A`.
- `scripts/seedPlatformAdmin.ts` — idempotent admin bootstrap from `Env`.
- `workers/appointmentMaintenance.ts` — separately deployed job using `paginated` to auto-transition long-past `confirmed` appointments to `no_show` after `autoNoShowAfterMinutes`.

---

## Database Schema

MongoDB via the official driver; Zod schemas in `schemas/*.ts`, collections from `mongodb.db().collection<...>(...)`. Foreign-reference fields are named after the referenced entity with `$objectId.meta({ ref })` and never end in `Id`. All instants are UTC `Date`.

### `users` (owned by thunder-core; referenced only)
`_id`, `name`, `email`, `image?`, plus core auth fields. Project extension collection `userProfiles` if extra fields are needed (`user`, `phone`, `defaultCity`) — confirm core's user shape before extending.

### `shopMembers`
```
_id, shop → shops, user → users, role: "owner"|"manager",
createdAt, createdBy → users
```
Indexes: `{ shop: 1, user: 1 }` **unique**; `{ user: 1 }`.

### `shops`
```
_id, name, slug (unique), description?, phone, email?,
address: { line1, line2?, city, state?, postalCode, country },
location: { type: "Point", coordinates: [lng, lat] },
timezone (IANA), photos: string[],
status: "pending"|"active"|"suspended", statusReason?,
openingHours: [{ weekday: 0-6, intervals: [{ start: "HH:mm", end: "HH:mm" }] }],
blackoutDates: [{ startAt, endAt, reason? }],
policy: { slotGranularityMinutes=15, minLeadTimeMinutes=60, maxAdvanceDays=60,
          cancellationWindowMinutes=120, requiresApproval=false,
          maxActivePerShop=3, autoNoShowAfterMinutes=120 },
scheduleRevision: number (default 0),
ratingAverage: number (0), ratingCount: number (0),
createdAt, updatedAt
```
Indexes: `{ slug: 1 }` unique; `{ status: 1, ratingAverage: -1 }`; `{ location: "2dsphere" }`; `{ "address.city": 1, status: 1 }`; text index on `{ name: "text", description: "text" }`.

### `services`
```
_id, shop → shops, name, description?,
durationMinutes, bufferAfterMinutes (0), priceCents, currency,
active: boolean (true), createdAt, updatedAt
```
Indexes: `{ shop: 1, active: 1 }`; `{ shop: 1, name: 1 }` unique.

### `barbers`
```
_id, shop → shops, name, bio?, photo?,
services: [→ services], active: boolean (true),
weeklyHours: [{ weekday: 0-6, intervals: [{ start: "HH:mm", end: "HH:mm" }] }],
ratingAverage, ratingCount, createdAt, updatedAt
```
Indexes: `{ shop: 1, active: 1 }`; `{ services: 1 }`.

### `timeOffs`
```
_id, shop → shops, barber → barbers, startAt, endAt, reason?,
createdBy → users, createdAt
```
Indexes: `{ barber: 1, startAt: 1, endAt: 1 }`; `{ shop: 1, startAt: 1 }`.

### `appointments`
```
_id, shop → shops, barber → barbers, service → services, user → users,
startAt, endAt, blockedUntil (endAt + bufferAfterMinutes),
timezone, durationSnapshot, priceCentsSnapshot, currency,
paymentMode: "in_shop",
status: "pending"|"confirmed"|"completed"|"cancelled_by_customer"
        |"cancelled_by_shop"|"no_show"|"rejected",
active: boolean,                    // true for pending|confirmed
customerName, customerPhone, notes?,
idempotencyKey?, scheduleRevision,
rescheduledFrom? → appointments, rescheduledTo? → appointments,
cancellation?: { at, by → users, reason },
history: [{ from, to, by → users, reason?, at }],
createdAt, updatedAt
```
Indexes:
- `{ barber: 1, startAt: 1 }` **unique, partialFilterExpression `{ active: true }`** — hard double-booking guard.
- `{ barber: 1, active: 1, startAt: 1 }` — overlap scans and availability.
- `{ shop: 1, startAt: 1, status: 1 }` — shop day view.
- `{ user: 1, startAt: -1 }` — customer history.
- `{ user: 1, active: 1, startAt: 1 }` — customer overlap/limit checks.
- `{ idempotencyKey: 1 }` **unique, sparse**.
- `{ service: 1 }` — referential checks on service delete.

### `reviews`
```
_id, shop → shops, barber → barbers, appointment → appointments, user → users,
rating: 1-5, comment?, reply?: { text, by → users, at },
hidden: boolean (false), createdAt, updatedAt
```
Indexes: `{ appointment: 1 }` **unique**; `{ shop: 1, hidden: 1, createdAt: -1 }`; `{ barber: 1, hidden: 1 }`.

**Transaction notes:** booking, reschedule, forced time-off cancellation, and review creation each run in a single `session.withTransaction`, re-reading `shops.scheduleRevision` before commit. Rating aggregates are updated with `$inc` on `ratingCount` and a recomputed `ratingAverage` inside the review transaction; a periodic reconciliation in `workers/appointmentMaintenance.ts` recomputes aggregates for shops touched by hidden/unhidden reviews.