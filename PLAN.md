# Barber — Implementation Plan

## Project Scope and Technical Approach

Barber is a multi-tenant appointment platform for independent barbershops. Customers discover shops, select a service and barber, and book appointments. Payment happens at the shop; the application does not process payments.

### Technology stack

- **Backend:** Deno with the existing, initialized Thunder framework.
- **Frontend:** React, TypeScript, Tailwind CSS, and ShadCN UI.
- **Database:** MongoDB using the direct MongoDB JavaScript driver; no ODM.
- **Deployment requirement:** MongoDB replica set or managed equivalent supporting transactions.

**Thunder integration limitation:** Documentation queries failed with a tool error. Framework-specific APIs, directory conventions, authentication hooks, and route-registration syntax remain unverified. Extend the initialized application rather than reinitializing it. Confirm these integration points against Thunder documentation before implementing the HTTP layer; the routes below are HTTP contracts, not claims about Thunder syntax.

### MVP defaults

- One physical location per shop; owners can operate multiple shops.
- Customers must sign in to book, but discovery is public.
- One service and one barber per appointment.
- Bookings are confirmed immediately.
- Each barber serves one customer at a time.
- Shop owners manage their shop and may also work as barbers.
- Email notifications and in-app appointment history are included.
- Defaults: 60-day booking horizon, 60-minute minimum lead time, and 24-hour customer cancellation/rescheduling cutoff. Owners can configure these values.
- Excluded: online payments, deposits, commissions, subscriptions, reviews, waitlists, recurring appointments, SMS, and external calendar synchronization.

## Functional Requirements

### 1. Accounts and authorization

- Support registration, email verification, sign-in, sign-out, password reset, and profile editing.
- Customers have a global account and can book across shops.
- Use shop-scoped memberships for staff authorization:
  - **Owner:** manages shop configuration, services, staff, schedules, and appointments.
  - **Barber:** views their own schedule and appointments and updates their own appointment outcomes.
- A membership can be both owner and bookable barber.
- Owners invite barbers by email. Invitation acceptance requires a signed-in account with the matching verified email.
- Platform administrators can suspend shops and accounts. Administrator status cannot be assigned through public APIs.
- Customers access only their own appointments. Barbers access only appointments assigned to them. Owners access appointments within their shops.
- Suspended shops disappear from discovery and reject new bookings. Existing appointments remain accessible for review and cancellation.

### 2. Shop onboarding and discovery

- Owners create a draft shop containing:
  - Name, unique slug, description, telephone number, and address.
  - IANA timezone and ISO currency.
  - Opening hours and booking policies.
- Publish only after the shop has a complete profile, at least one active service, and at least one eligible barber with working hours.
- Public discovery supports shop name, city, and service-category filters with pagination.
- Public shop pages display services, prices, durations, barber profiles, opening hours, address, and booking policies.
- Owners can unpublish shops without deleting appointment history.

### 3. Services and staff

- Owners create, edit, and deactivate services.
- Each service has a name, category, description, duration, and price in integer minor currency units.
- Owners specify which barbers can perform each service.
- Service durations use five-minute increments.
- Owners maintain barber profiles and activate or deactivate memberships.
- Deactivation blocks new bookings but does not silently cancel existing appointments.
- Changes to service names, prices, or duration do not alter existing appointment snapshots.

### 4. Schedules and availability

- Configure shop opening hours and barber weekly working hours.
- Configure dated shop closures and barber time off.
- Multiple working intervals per day support lunch breaks and split shifts.
- Available appointments must fit entirely within both shop and barber working intervals.
- Subtract closures, time off, and confirmed appointments.
- Offer start times on a five-minute grid.
- Support selecting a specific barber or “Any available barber.”
- Availability results identify a concrete barber; the booking request submits that barber.
- Use the shop timezone for schedule rules and customer-facing booking times. Store appointment instants in UTC.
- Reject nonexistent daylight-saving times; distinguish repeated local times by offset.
- Revalidate availability when creating or rescheduling an appointment. A displayed slot is not a reservation.
- A barber working at multiple shops cannot receive overlapping appointments across shops.
- Schedule edits that invalidate existing confirmed appointments return a conflict list. Owners must resolve those appointments before applying the change.

### 5. Booking lifecycle

- Booking flow: shop → service → barber preference → date/time → review → confirmation.
- Review displays shop-local date/time, barber, duration, price, cancellation policy, and “Pay at the shop.”
- Calculate price, duration, end time, and policy snapshots on the server.
- Customers can view upcoming appointments and appointment history.
- Customers may cancel or reschedule before the appointment’s snapshotted cutoff.
- Rescheduling retains the same shop and service; it may change the date, time, or eligible barber. Changing service requires a new booking.
- Rescheduling moves capacity atomically: if the new slot is unavailable, the original booking remains unchanged.
- Owners can cancel or reschedule future appointments regardless of the customer cutoff, supplying a reason.
- Appointment statuses:
  - `confirmed`
  - `completed`
  - `cancelled`
  - `no_show`
- Allowed transitions:
  - `confirmed → cancelled`
  - `confirmed → completed`, once the scheduled end time has passed.
  - `confirmed → no_show`, once the scheduled start time has passed.
- Terminal statuses cannot be reopened in the MVP.
- Record the actor, timestamp, and reason for appointment mutations.
- Booking and rescheduling support idempotency keys to prevent duplicate actions during retries.

### 6. Staff dashboards

- Owners see a shop-wide daily/weekly calendar and filter by barber or appointment status.
- Barbers see their assigned schedule and the customer contact details needed for service delivery.
- Owners and assigned barbers can mark appointments completed or no-show.
- Dashboards show appointment counts by status, not payment or collected-revenue totals.

### 7. Notifications and platform operations

- Send verification, password-reset, and staff-invitation emails.
- Send booking confirmations, cancellation notices, rescheduling notices, and reminders to customers.
- Notify affected staff of booking changes.
- Send one reminder approximately 24 hours before the appointment; skip reminders for bookings created inside that window.
- Email failures do not roll back a successful booking.
- Retry failed delivery with bounded backoff and record permanent failures.
- Administrators can inspect shop/account status and suspension audit records without receiving unrestricted customer-data access by default.

## Non-Functional Requirements

### Security and tenant isolation

- Validate request parameters and bodies at the HTTP boundary; enforce domain rules in application services.
- Resolve the actor from the authenticated session, never from a client-provided user ID.
- Scope every staff query by authorized `shopId`; also validate the tenant of referenced services, memberships, and appointments.
- Use opaque server-side sessions with `HttpOnly`, `Secure`, and appropriate `SameSite` cookies.
- Apply CSRF protection or strict origin validation to authenticated mutations.
- Hash passwords with a maintained, Deno-compatible Argon2id implementation.
- Store only hashes of session, reset, verification, and invitation tokens.
- Rate-limit authentication, recovery, availability, and booking endpoints.
- Use restrictive CORS, request-size limits, safe response projections, and redacted logs.
- Reject operator-shaped or unvalidated query input; never pass request objects directly to MongoDB queries.

### Booking consistency

- Use MongoDB transactions for booking, rescheduling, cancellation, schedule changes, and associated audit/outbox writes.
- Prevent overlaps with a transactional locking protocol:
  1. Mutate a persistent lock document for the shop and global barber user.
  2. Acquire multiple locks in deterministic order.
  3. Revalidate current shop, service, membership, schedule, and appointment state.
  4. Check interval overlap using `existing.startAt < requested.endAt` and `existing.endAt > requested.startAt`.
  5. Write the appointment, audit event, and notification outbox records.
- Rescheduling locks both old and new barbers where applicable.
- All changes affecting booking eligibility or availability follow the same locking protocol. Retry transient transaction conflicts with bounded retries.
- Use appointment versions for optimistic concurrency; stale modifications return `409 Conflict`.
- Check token expiration in application code; MongoDB TTL deletion is not immediate.

### Performance and reliability

- Initial acceptance targets under a representative load of 100 concurrent users:
  - Public and dashboard reads: p95 below 500 ms.
  - Availability lookup for one shop and seven days: p95 below one second.
  - Booking mutations: p95 below 1.5 seconds, excluding email delivery.
- Restrict availability requests to a maximum 31-day range within the booking horizon.
- Paginate list endpoints, defaulting to 20 and capping at 100 records.
- Use a pooled MongoDB client and indexed queries.
- Target 99.5% monthly availability for the initial release.
- Maintain encrypted daily backups and test restoration before launch.
- Run durable email processing outside request handling with worker leases and retries.

### Accessibility and user experience

- Responsive, mobile-first interface using Tailwind CSS and ShadCN UI.
- Target WCAG 2.2 AA, including keyboard-accessible slot selection, explicit labels, visible focus, and accessible errors.
- Always display the shop timezone during booking and appointment review.
- Include loading, empty, offline/error, and slot-conflict states.
- Never display confirmation until the server has committed the booking.

### Maintainability and testing

- Separate HTTP adapters, authorization, domain services, MongoDB repositories, and notification delivery.
- Reuse Thunder’s existing conventions after verifying them; do not introduce a replacement web framework.
- Use TypeScript throughout, Deno lint/type checks, and automated tests in CI.
- Test tenant isolation, role combinations, invitation ownership, DST boundaries, cutoff boundaries, transaction retries, idempotency, and concurrent bookings.
- Collect structured logs, request IDs, latency/error metrics, transaction-conflict counts, and notification-failure metrics.
- Define customer-data retention and deletion policies before production launch; avoid storing sensitive free-text notes in the MVP.

## User Stories

| Actor | Story | Acceptance criteria |
|---|---|---|
| Visitor | As a visitor, I want to find a shop by city and service. | Only published, nonsuspended shops appear; results are paginated. |
| Customer | As a customer, I want to compare services and barbers. | Shop pages show current prices, durations, and eligible barbers. |
| Customer | As a customer, I want to book an available appointment. | A valid request creates exactly one confirmed appointment and explains payment occurs at the shop. |
| Customer | As a customer, I want protection from stale availability. | If another customer takes the slot, I receive a conflict and can refresh available times. |
| Customer | As a customer, I want to reschedule safely. | The original appointment remains intact unless the new time commits successfully. |
| Customer | As a customer, I want to cancel within the policy. | Eligible cancellation updates status and releases capacity immediately. |
| Customer | As a customer, I want reminders. | Eligible appointments receive one logical reminder; cancelled and superseded appointment versions do not. |
| Owner | As an owner, I want to publish my shop. | Publication requires complete profile, services, and bookable staff. |
| Owner | As an owner, I want to manage staff and hours. | Only my shop’s records are editable; conflicting schedule changes are rejected. |
| Barber | As a barber, I want to manage my appointment outcomes. | I can view my appointments and mark permitted outcomes, but cannot access another barber’s customers. |
| Administrator | As an administrator, I want to suspend abusive shops. | Suspended shops cannot accept new bookings; the action is audited. |

## Use Cases

### UC1 — Onboard a shop

**Actor:** Signed-in, verified user.

1. Create a draft shop; the server creates its owner membership in the same transaction.
2. Enter address, timezone, currency, policies, and opening hours.
3. Create services.
4. Add the owner as a barber or invite staff.
5. Assign service eligibility and working hours.
6. Publish the shop.

**Exceptions:** Duplicate slug, incomplete configuration, or no eligible barber prevents publication.

### UC2 — Book an appointment

**Actor:** Customer.

1. Browse a published shop and select a service.
2. Request availability for a barber or any eligible barber.
3. Select a slot and review the booking details.
4. Submit `serviceId`, `barberMembershipId`, and `startAt` with an idempotency key.
5. Server authenticates the customer, obtains transaction locks, revalidates availability, and derives immutable snapshots.
6. Commit the confirmed appointment, audit event, and notification records.
7. Display the appointment confirmation.

**Exceptions:** Taken slot or changed eligibility returns `409`; invalid input returns `422`; inactive or inaccessible resources return an appropriate `404`/`403`.

### UC3 — Reschedule or cancel

**Actor:** Customer or shop owner.

1. Open an authorized appointment.
2. Server checks status, version, and applicable cutoff.
3. For rescheduling, choose a new eligible slot.
4. Apply the change transactionally and increment the appointment version.
5. Record the event and send updated notifications.

**Exceptions:** Expired customer cutoff, stale version, or unavailable new slot leaves the original appointment unchanged.

### UC4 — Change working hours or add time off

**Actor:** Owner.

1. Submit revised hours, a closure, or barber time off.
2. Server acquires the scheduling locks.
3. Check whether confirmed appointments become invalid.
4. Save if no conflicts exist; otherwise return the affected appointment IDs.

**Postcondition:** No existing appointment is silently invalidated or cancelled.

### UC5 — Complete a visit

**Actor:** Assigned barber or owner.

1. Open a confirmed appointment.
2. Mark completed after its end, or no-show after its start.
3. Server checks authorization, time rules, and version.
4. Persist the outcome and audit record.

**Postcondition:** Appointment becomes terminal. No online payment operation occurs.

### UC6 — Deliver a reminder

**Actor:** Background worker.

1. Atomically claim a due outbox record with a lease.
2. Recheck appointment status, current version, and start time.
3. Skip obsolete reminders.
4. Send through the configured email provider.
5. Record delivery or schedule a bounded retry.

**Delivery semantics:** At-least-once processing; use provider idempotency when supported. Do not promise exactly-once email delivery.

## Necessary routes

### API conventions

- Base path: `/api/v1`.
- IDs are serialized as strings; timestamps use ISO 8601 UTC.
- Success responses use `{ data, meta? }`; errors use `{ error: { code, message, details?, requestId } }`.
- Use `401` for unauthenticated requests, `403` for forbidden actions, `404` for unavailable resources, `409` for state conflicts, `422` for validation errors, and `429` for rate limits.
- Booking and rescheduling require `Idempotency-Key`.
- Appointment mutations require the expected `version`.
- **Customer:** authenticated account accessing its own records.
- **Owner/Barber:** active membership in the route’s shop.
- **Admin:** platform administrator.

### Authentication and account routes

| Method | Route | Access | Purpose |
|---|---|---|---|
| POST | `/auth/register` | Public | Create customer account |
| POST | `/auth/login` | Public | Create session |
| POST | `/auth/logout` | Signed in | Revoke current session |
| POST | `/auth/verify-email` | Token | Verify email |
| POST | `/auth/resend-verification` | Public, rate-limited | Request verification email |
| POST | `/auth/forgot-password` | Public | Request reset with generic response |
| POST | `/auth/reset-password` | Token | Reset password and revoke sessions |
| GET | `/me` | Signed in | Profile and membership summary |
| PATCH | `/me` | Signed in | Edit name and telephone |
| GET | `/me/shops` | Signed in | List staff memberships |

### Discovery and customer appointments

| Method | Route | Access | Purpose |
|---|---|---|---|
| GET | `/shops` | Public | Search by name, city, and category |
| GET | `/shops/:shopId` | Public | Published shop profile |
| GET | `/shops/:shopId/services` | Public | Active services |
| GET | `/shops/:shopId/barbers` | Public | Bookable barbers, optionally filtered by service |
| GET | `/shops/:shopId/availability` | Public | Slots by service, optional barber, and local date range |
| POST | `/shops/:shopId/appointments` | Verified customer | Create booking |
| GET | `/me/appointments` | Customer | Upcoming/history list |
| GET | `/me/appointments/:appointmentId` | Customer | Appointment details |
| POST | `/me/appointments/:appointmentId/cancel` | Customer | Cancel within policy |
| POST | `/me/appointments/:appointmentId/reschedule` | Customer | Atomically change slot |

### Shop management

| Method | Route | Access | Purpose |
|---|---|---|---|
| POST | `/manage/shops` | Verified user | Create shop and owner membership |
| GET | `/manage/shops/:shopId` | Owner | Private configuration |
| PATCH | `/manage/shops/:shopId` | Owner | Update profile and booking policies |
| POST | `/manage/shops/:shopId/publish` | Owner | Validate and publish |
| POST | `/manage/shops/:shopId/unpublish` | Owner | Stop discovery and new bookings |
| GET, POST | `/manage/shops/:shopId/services` | Owner | List or create services |
| PATCH | `/manage/shops/:shopId/services/:serviceId` | Owner | Edit/deactivate service |
| GET | `/manage/shops/:shopId/memberships` | Owner | List staff |
| PATCH | `/manage/shops/:shopId/memberships/:membershipId` | Owner | Edit barber profile, eligibility, or active status |
| POST | `/manage/shops/:shopId/invitations` | Owner | Invite barber |
| DELETE | `/manage/shops/:shopId/invitations/:invitationId` | Owner | Revoke invitation |
| POST | `/invitations/accept` | Verified matching user | Accept invitation token |
| GET, PUT | `/manage/shops/:shopId/schedule` | Owner | Read/replace shop weekly hours |
| GET, PUT | `/manage/shops/:shopId/barbers/:membershipId/schedule` | Owner; assigned barber read-only | Read/replace barber hours |
| GET, POST | `/manage/shops/:shopId/schedule-exceptions` | Owner | List/create closures or time off |
| DELETE | `/manage/shops/:shopId/schedule-exceptions/:exceptionId` | Owner | Remove exception |
| GET | `/manage/shops/:shopId/appointments` | Owner/Barber | Shop or assigned calendar |
| GET | `/manage/shops/:shopId/appointments/:appointmentId` | Owner/assigned barber | Staff appointment detail |
| POST | `/manage/shops/:shopId/appointments/:appointmentId/cancel` | Owner | Cancel with reason |
| POST | `/manage/shops/:shopId/appointments/:appointmentId/reschedule` | Owner | Change future slot with reason |
| POST | `/manage/shops/:shopId/appointments/:appointmentId/outcome` | Owner/assigned barber | Complete or mark no-show |

### Administration and health

| Method | Route | Access | Purpose |
|---|---|---|---|
| GET | `/admin/shops` | Admin | List shops and platform status |
| PATCH | `/admin/shops/:shopId/status` | Admin | Suspend/reactivate shop |
| GET | `/admin/users` | Admin | Minimal account lookup |
| PATCH | `/admin/users/:userId/status` | Admin | Suspend/reactivate account |
| GET | `/admin/audit-events` | Admin | Review administrative events |
| GET | `/health/live` | Operational | Process liveness |
| GET | `/health/ready` | Operational | Database readiness without exposing secrets |

### Frontend routes

| Route | Screen |
|---|---|
| `/` | Shop discovery |
| `/shops/:shopId` | Shop, services, and barbers |
| `/shops/:shopId/book` | Booking wizard |
| `/login`, `/register`, `/verify-email` | Authentication |
| `/forgot-password`, `/reset-password` | Account recovery |
| `/invitations/accept` | Staff invitation acceptance |
| `/account` | Customer profile |
| `/appointments` | Customer appointment list |
| `/appointments/:appointmentId` | Detail, cancel, and reschedule |
| `/manage` | Shop switcher |
| `/manage/new` | Shop onboarding |
| `/manage/:shopId/calendar` | Owner/barber calendar |
| `/manage/:shopId/services` | Service management |
| `/manage/:shopId/team` | Staff and invitations |
| `/manage/:shopId/schedules` | Hours, closures, and time off |
| `/manage/:shopId/settings` | Shop profile, policies, and publishing |
| `/admin` | Platform moderation |

Frontend route guards improve navigation but do not replace backend authorization.

## Database schema

### Conventions

- Use MongoDB `ObjectId` references and BSON `Date` timestamps.
- Mutable business documents include `createdAt` and `updatedAt`.
- Monetary fields use integer minor units and an ISO currency.
- Weekly hours use local weekday/time intervals; dated exceptions and appointments use UTC instants.
- Application validators and MongoDB collection validators enforce document shape.
- Historical appointments retain snapshots even when source data changes.
- Do not hard-delete referenced shops, services, or staff memberships.

### Collections

| Collection | Principal fields | Required indexes and constraints |
|---|---|---|
| `users` | `_id`, `emailNormalized`, `passwordHash`, `name`, `phone?`, `emailVerifiedAt?`, `status: active\|suspended`, `platformRole: user\|admin` | Unique `emailNormalized` |
| `sessions` | `_id`, `userId`, `tokenHash`, `expiresAt`, `lastSeenAt` | Unique `tokenHash`; TTL `expiresAt`; `userId` |
| `authTokens` | `_id`, `userId`, `purpose: verify_email\|reset_password`, `tokenHash`, `expiresAt`, `usedAt?` | Unique `tokenHash`; TTL `expiresAt`; consume atomically |
| `shops` | `_id`, `slug`, `name`, `description`, `phone`, `address: {line1, line2?, city, region?, postalCode?, country}`, `timezone`, `currency`, `publicationStatus: draft\|published`, `platformStatus: active\|suspended`, `bookingPolicy: {horizonDays, minLeadMinutes, cancellationCutoffMinutes}`, `serviceCategories[]`, `publishedAt?` | Unique `slug`; `{publicationStatus, platformStatus, address.city}`; text index on name/description |
| `memberships` | `_id`, `shopId`, `userId`, `role: owner\|barber`, `isBookable`, `active`, `displayName`, `bio?`, `serviceIds[]` | Unique `{shopId, userId}`; `{shopId, active, isBookable}`; `{userId, active}` |
| `staffInvitations` | `_id`, `shopId`, `emailNormalized`, `tokenHash`, `invitedBy`, `status: pending\|accepted\|revoked\|expired`, `expiresAt`, `acceptedBy?` | Unique `tokenHash`; partial unique `{shopId, emailNormalized}` for pending invitations; `{expiresAt, status}` |
| `services` | `_id`, `shopId`, `name`, `category`, `description?`, `durationMinutes`, `priceMinor`, `currency`, `active` | `{shopId, active}`; duration positive and divisible by five; currency matches shop |
| `weeklySchedules` | `_id`, `shopId`, `subjectType: shop\|barber`, `subjectId`, `days: [{weekday, intervals: [{startLocal, endLocal}]}]`, `version` | Unique `{shopId, subjectType, subjectId}`; intervals cannot overlap |
| `scheduleExceptions` | `_id`, `shopId`, `subjectType: shop\|barber`, `subjectId`, `startAt`, `endAt`, `reason?`, `createdBy` | `{shopId, subjectType, subjectId, startAt, endAt}`; `endAt > startAt` |
| `appointments` | See detailed structure below | Customer, shop-calendar, and global-barber interval indexes |
| `schedulingLocks` | `_id: "shop:<id>"\|"barber:<userId>"`, `revision`, `updatedAt` | Unique `_id`; precreate when shop/membership is created; never TTL-delete |
| `idempotencyRecords` | `_id`, `actorId`, `operation`, `key`, `requestHash`, `resourceId`, `responseStatus`, `responseBody`, `expiresAt` | Unique `{actorId, operation, key}`; TTL `expiresAt`; 24-hour retry guarantee |
| `notificationOutbox` | `_id`, `eventType`, `dedupeKey`, `recipientUserId?`, `recipientEmail`, `appointmentId?`, `appointmentVersion?`, `payload`, `deliverAt`, `status`, `attempts`, `leaseUntil?`, `nextAttemptAt`, `lastError?`, `sentAt?`, `purgeAt?` | Unique `dedupeKey`; `{status, nextAttemptAt, deliverAt}`; TTL `purgeAt` for terminal records only |
| `auditEvents` | `_id`, `shopId?`, `actorUserId?`, `action`, `entityType`, `entityId`, `changes`, `reason?`, `requestId`, `createdAt` | `{shopId, createdAt}`; `{entityType, entityId, createdAt}`; append-only |

### Appointment document

```ts
type Appointment = {
  _id: ObjectId;
  shopId: ObjectId;
  customerId: ObjectId;
  serviceId: ObjectId;
  barberMembershipId: ObjectId;
  barberUserId: ObjectId;

  startAt: Date;
  endAt: Date;
  status: "confirmed" | "completed" | "cancelled" | "no_show";
  version: number;

  serviceSnapshot: {
    name: string;
    durationMinutes: number;
    priceMinor: number;
    currency: string;
  };

  shopSnapshot: {
    name: string;
    timezone: string;
    addressDisplay: string;
    phone: string;
  };

  barberSnapshot: {
    displayName: string;
  };

  customerSnapshot: {
    name: string;
    email: string;
    phone?: string;
  };

  policySnapshot: {
    cancellationCutoffMinutes: number;
  };

  paymentMethod: "pay_at_shop";

  cancelledAt?: Date;
  cancelledBy?: ObjectId;
  cancellationReason?: string;
  completedAt?: Date;
  noShowAt?: Date;

  createdAt: Date;
  updatedAt: Date;
};
```

**Appointment indexes:**

- `{customerId: 1, startAt: -1}`
- `{shopId: 1, startAt: 1, status: 1}`
- `{shopId: 1, barberMembershipId: 1, startAt: 1}`
- `{barberUserId: 1, startAt: 1, endAt: 1}`, partial on `status: "confirmed"`.

An interval index alone does not prevent overlaps; the transaction-locking protocol is mandatory.

### Additional data integrity rules

- `endAt` is derived from `startAt` and the service snapshot, never trusted from the client.
- Every referenced service and membership must belong to the appointment’s shop.
- Rescheduling preserves the original price, duration, and cutoff snapshots and increments `version`.
- Shop timezone and currency become immutable after the first booking in the MVP.
- Weekly intervals cannot span midnight; represent overnight hours as intervals on adjacent days.
- Service category search data on the shop is updated transactionally with service changes.
- Invitation acceptance checks expiration, verified email, pending status, and membership uniqueness.
- Idempotency replay returns the stored response; reuse of the same key with a different payload returns `409`.
- Token-bearing notification payloads must be encrypted, excluded from logs, and purged promptly after delivery or expiration.
- Account suspension revokes sessions and prevents new authenticated actions; it does not silently cancel appointments.
- Owner memberships cannot be removed through generic staff-edit routes; ownership transfer is outside the MVP.

## Implementation Sequence and Release Gates

1. **Verify Thunder extension points**
   - Confirm route registration, request/response handling, validation, authentication integration, error mapping, and dependency lifecycle against documentation.
   - Reuse existing initialized infrastructure; add no framework bootstrap work.

2. **Build persistence and access control**
   - Add MongoDB repositories, validators, indexes, sessions, account flows, and tenant-scoped authorization.
   - Exit gate: cross-tenant and unauthorized-role tests pass.

3. **Implement shop onboarding and discovery**
   - Deliver shop setup, services, invitations, memberships, publication, and public pages.
   - Exit gate: a new owner can publish a valid shop.

4. **Implement scheduling and transactional booking**
   - Add hours, exceptions, DST-safe availability, locks, idempotency, and appointment lifecycle.
   - Exit gate: simultaneous competing requests produce exactly one booking; failed rescheduling preserves the original.

5. **Build customer and staff interfaces**
   - Deliver booking wizard, appointment management, responsive calendars, and outcome actions.
   - Exit gate: customer and staff end-to-end flows pass on mobile and desktop.

6. **Add notifications and administration**
   - Implement durable outbox processing, reminders, suspension controls, and audit views.
   - Exit gate: provider failures do not affect committed bookings, and obsolete reminders are skipped.

7. **Harden and release**
   - Complete performance, accessibility, security, backup restoration, and transaction-concurrency testing.
   - Verify production MongoDB transactions, worker monitoring, email configuration, secrets, and operational alerts before launch.