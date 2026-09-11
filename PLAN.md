I now have sufficient information from my memories (multi-tenant app with Customer, Barber, and Admin roles) and the Thunder framework documentation. Let me create the complete project plan.

## Barber - Appointment Booking App

### Project Overview
A multi-tenant barber appointment booking application that allows barbershops to manage appointments, services, barbers, and customer bookings. The system supports three user roles: Customer, Barber, and Admin.

---

## Functional Requirements

### Customer Features
1. **Account Management**
   - Register and login as a customer
   - View and update profile information
   - View appointment history

2. **Appointment Booking**
   - Browse available barbershops
   - View barber profiles and their services
   - Check available time slots for a barber
   - Book appointments with selected barber and services
   - Cancel appointments (with time restrictions)
   - Receive appointment confirmations

3. **Reviews & Ratings**
   - Rate and review barbers after appointments

### Barber Features
1. **Account Management**
   - Login with barber credentials
   - View and update profile (bio, photo, specializations)

2. **Schedule Management**
   - Set working hours and availability
   - View daily/weekly appointment calendar
   - Mark time slots as unavailable
   - View upcoming appointments

3. **Service Management**
   - View assigned services and pricing

4. **Appointment Management**
   - View appointment details
   - Mark appointments as completed or no-show

### Admin Features
1. **Shop Management**
   - Manage barbershop information (name, address, contact, hours)
   - Configure shop settings

2. **Barber Management**
   - Add, edit, deactivate barbers
   - Assign services to barbers
   - View barber performance metrics

3. **Service Management**
   - Create, edit, delete services
   - Set service prices and durations

4. **Appointment Overview**
   - View all appointments across the shop
   - Generate reports (daily, weekly, monthly)

---

## Non-Functional Requirements

1. **Performance**
   - API response time < 500ms for standard operations
   - Support for concurrent appointment bookings with conflict detection

2. **Security**
   - JWT-based authentication via thunder-core (better-auth)
   - Role-based access control (RBAC) for all endpoints
   - Input validation using Zod schemas

3. **Scalability**
   - Multi-tenant architecture with shop isolation
   - Stateless API design for serverless deployment

4. **Reliability**
   - Appointment booking with transaction support to prevent double-bookings
   - Data validation at schema level

5. **Usability**
   - RESTful API design
   - Mobile-responsive frontend (React with Tailwind CSS)

---

## User Stories

### Customer
| ID | Story |
|----|-------|
| C1 | As a customer, I want to register an account so that I can book appointments |
| C2 | As a customer, I want to browse barbershops so that I can find one near me |
| C3 | As a customer, I want to view a barber's profile and services so that I can choose the right barber |
| C4 | As a customer, I want to see available time slots so that I can book a convenient time |
| C5 | As a customer, I want to book an appointment so that I can get a haircut |
| C6 | As a customer, I want to view my upcoming appointments so that I don't forget them |
| C7 | As a customer, I want to cancel an appointment if my plans change |
| C8 | As a customer, I want to rate my barber after an appointment so others can benefit from my experience |

### Barber
| ID | Story |
|----|-------|
| B1 | As a barber, I want to view my daily schedule so that I know my appointments |
| B2 | As a barber, I want to set my availability so that customers only book when I'm free |
| B3 | As a barber, I want to mark appointments as completed so I can track my work |
| B4 | As a barber, I want to update my profile so customers can learn about me |
| B5 | As a barber, I want to block time slots for breaks or personal time |

### Admin
| ID | Story |
|----|-------|
| A1 | As an admin, I want to add barbers to my shop so they can receive appointments |
| A2 | As an admin, I want to create services with prices so customers know what we offer |
| A3 | As an admin, I want to view all appointments so I can manage my shop operations |
| A4 | As an admin, I want to update shop information so customers have accurate details |
| A5 | As an admin, I want to view reports so I can track business performance |

---

## Use Cases

### UC1: Book Appointment
**Actor:** Customer  
**Precondition:** Customer is logged in  
**Flow:**
1. Customer selects a barbershop
2. Customer views available barbers
3. Customer selects a barber
4. Customer selects desired services
5. System displays available time slots
6. Customer selects a time slot
7. System validates slot availability (prevents double-booking)
8. System creates appointment
9. System confirms booking to customer

**Postcondition:** Appointment is created and stored

### UC2: Manage Barber Availability
**Actor:** Barber  
**Precondition:** Barber is logged in  
**Flow:**
1. Barber navigates to schedule management
2. Barber sets recurring working hours
3. Barber can add specific unavailable time blocks
4. System updates availability for booking

**Postcondition:** Availability is updated

### UC3: Add Service
**Actor:** Admin  
**Precondition:** Admin is logged in  
**Flow:**
1. Admin navigates to services management
2. Admin enters service name, description, duration, and price
3. System validates input
4. System creates service

**Postcondition:** New service is available for booking

### UC4: Cancel Appointment
**Actor:** Customer  
**Precondition:** Customer is logged in, appointment exists  
**Flow:**
1. Customer views upcoming appointments
2. Customer selects appointment to cancel
3. System checks cancellation policy (e.g., 2 hours before)
4. System cancels appointment
5. System frees up the time slot

**Postcondition:** Appointment is cancelled, slot is available again

---

## Necessary Routes

### Authentication (via thunder-core)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/auth/api/register` | Customer registration | Public |
| POST | `/auth/api/login` | User login | Public |
| POST | `/auth/api/logout` | User logout | Authenticated |

### Shops
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/shops/api` | List all barbershops | Public |
| GET | `/shops/api/:id` | Get shop details | Public |
| POST | `/shops/api` | Create shop | Admin |
| PATCH | `/shops/api/:id` | Update shop | Admin (owner) |

### Barbers
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/barbers/api` | List barbers (by shop) | Public |
| GET | `/barbers/api/:id` | Get barber profile | Public |
| POST | `/barbers/api` | Add barber to shop | Admin |
| PATCH | `/barbers/api/:id` | Update barber profile | Barber/Admin |
| DELETE | `/barbers/api/:id` | Deactivate barber | Admin |

### Services
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/services/api` | List services (by shop) | Public |
| GET | `/services/api/:id` | Get service details | Public |
| POST | `/services/api` | Create service | Admin |
| PATCH | `/services/api/:id` | Update service | Admin |
| DELETE | `/services/api/:id` | Delete service | Admin |

### Appointments
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/appointments/api` | List appointments | Authenticated |
| GET | `/appointments/api/:id` | Get appointment details | Authenticated |
| POST | `/appointments/api` | Book appointment | Customer |
| PATCH | `/appointments/api/:id` | Update appointment status | Barber/Admin |
| DELETE | `/appointments/api/:id` | Cancel appointment | Customer/Admin |
| GET | `/appointments/api/barber/:barberId` | Get barber's appointments | Barber/Admin |

### Availability
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/availability/api/:barberId` | Get barber availability | Public |
| GET | `/availability/api/:barberId/slots` | Get available time slots | Public |
| POST | `/availability/api` | Set working hours | Barber |
| POST | `/availability/api/block` | Block time slot | Barber |
| DELETE | `/availability/api/block/:id` | Unblock time slot | Barber |

### Reviews
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/reviews/api` | List reviews (by barber) | Public |
| POST | `/reviews/api` | Create review | Customer |
| DELETE | `/reviews/api/:id` | Delete review | Customer/Admin |

### Reports (Admin)
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/reports/api/appointments` | Appointment statistics | Admin |
| GET | `/reports/api/revenue` | Revenue summary | Admin |

---

## Database Schema

### shops
```typescript
// schemas/shop.ts
import z from "zod";
import { mongodb } from "@/database.ts";
import { $objectId } from "@/core/utils/createCRUD.ts";

const $shopInput = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
    country: z.string(),
  }),
  phone: z.string(),
  email: z.string().email(),
  workingHours: z.object({
    monday: z.object({ open: z.string(), close: z.string() }).nullable(),
    tuesday: z.object({ open: z.string(), close: z.string() }).nullable(),
    wednesday: z.object({ open: z.string(), close: z.string() }).nullable(),
    thursday: z.object({ open: z.string(), close: z.string() }).nullable(),
    friday: z.object({ open: z.string(), close: z.string() }).nullable(),
    saturday: z.object({ open: z.string(), close: z.string() }).nullable(),
    sunday: z.object({ open: z.string(), close: z.string() }).nullable(),
  }),
  imageUrl: z.string().url().optional(),
  isActive: z.boolean().default(true),
});

const $shop = $shopInput.extend({
  _id: $objectId.optional(),
  ownerId: $objectId, // Admin user who owns the shop
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export const shopModel = mongodb.db().collection<z.infer<typeof $shop>>("shops");
export { $shop, $shopInput };
```

### users (extended from thunder-core)
```typescript
// schemas/user.ts
import z from "zod";
import { mongodb } from "@/database.ts";
import { $objectId } from "@/core/utils/createCRUD.ts";

const $userInput = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.enum(["customer", "barber", "admin"]).default("customer"),
  shopId: $objectId.optional(), // For barbers and admins
  imageUrl: z.string().url().optional(),
});

const $user = $userInput.extend({
  _id: $objectId.optional(),
  isActive: z.boolean().default(true),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export const userModel = mongodb.db().collection<z.infer<typeof $user>>("users");
export { $user, $userInput };
```

### barbers
```typescript
// schemas/barber.ts
import z from "zod";
import { mongodb } from "@/database.ts";
import { $objectId } from "@/core/utils/createCRUD.ts";

const $barberInput = z.object({
  userId: $objectId,
  shopId: $objectId,
  bio: z.string().max(500).optional(),
  specializations: z.array(z.string()).default([]),
  imageUrl: z.string().url().optional(),
  serviceIds: z.array($objectId).default([]), // Services this barber can perform
});

const $barber = $barberInput.extend({
  _id: $objectId.optional(),
  rating: z.number().min(0).max(5).default(0),
  totalReviews: z.number().default(0),
  isActive: z.boolean().default(true),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export const barberModel = mongodb.db().collection<z.infer<typeof $barber>>("barbers");
export { $barber, $barberInput };
```

### services
```typescript
// schemas/service.ts
import z from "zod";
import { mongodb } from "@/database.ts";
import { $objectId } from "@/core/utils/createCRUD.ts";

const $serviceInput = z.object({
  shopId: $objectId,
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  duration: z.number().int().min(5), // Duration in minutes
  price: z.number().min(0), // Price in cents
  currency: z.string().default("usd"), // lowercase as per memory
  imageUrl: z.string().url().optional(),
});

const $service = $serviceInput.extend({
  _id: $objectId.optional(),
  isActive: z.boolean().default(true),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export const serviceModel = mongodb.db().collection<z.infer<typeof $service>>("services");
export { $service, $serviceInput };
```

### appointments
```typescript
// schemas/appointment.ts
import z from "zod";
import { mongodb } from "@/database.ts";
import { $objectId } from "@/core/utils/createCRUD.ts";

const $appointmentInput = z.object({
  shopId: $objectId,
  customerId: $objectId,
  barberId: $objectId,
  serviceIds: z.array($objectId).min(1),
  date: z.date(),
  startTime: z.string(), // HH:mm format
  endTime: z.string(), // HH:mm format (calculated from services duration)
  totalDuration: z.number().int(), // Total duration in minutes
  totalPrice: z.number().min(0), // Total price in cents
  currency: z.string().default("usd"),
  notes: z.string().max(500).optional(),
});

const $appointment = $appointmentInput.extend({
  _id: $objectId.optional(),
  status: z.enum(["pending", "confirmed", "completed", "cancelled", "no-show"]).default("pending"),
  cancelledAt: z.date().optional(),
  cancelledBy: $objectId.optional(),
  cancellationReason: z.string().optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export const appointmentModel = mongodb.db().collection<z.infer<typeof $appointment>>("appointments");
export { $appointment, $appointmentInput };
```

### availability
```typescript
// schemas/availability.ts
import z from "zod";
import { mongodb } from "@/database.ts";
import { $objectId } from "@/core/utils/createCRUD.ts";

const $availabilityInput = z.object({
  barberId: $objectId,
  shopId: $objectId,
  dayOfWeek: z.number().int().min(0).max(6), // 0 = Sunday, 6 = Saturday
  startTime: z.string(), // HH:mm format
  endTime: z.string(), // HH:mm format
});

const $availability = $availabilityInput.extend({
  _id: $objectId.optional(),
  isActive: z.boolean().default(true),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export const availabilityModel = mongodb.db().collection<z.infer<typeof $availability>>("availability");
export { $availability, $availabilityInput };
```

### blockedSlots
```typescript
// schemas/blockedSlot.ts
import z from "zod";
import { mongodb } from "@/database.ts";
import { $objectId } from "@/core/utils/createCRUD.ts";

const $blockedSlotInput = z.object({
  barberId: $objectId,
  shopId: $objectId,
  date: z.date(),
  startTime: z.string(), // HH:mm format
  endTime: z.string(), // HH:mm format
  reason: z.string().max(200).optional(),
});

const $blockedSlot = $blockedSlotInput.extend({
  _id: $objectId.optional(),
  createdAt: z.date().default(() => new Date()),
});

export const blockedSlotModel = mongodb.db().collection<z.infer<typeof $blockedSlot>>("blockedSlots");
export { $blockedSlot, $blockedSlotInput };
```

### reviews
```typescript
// schemas/review.ts
import z from "zod";
import { mongodb } from "@/database.ts";
import { $objectId } from "@/core/utils/createCRUD.ts";

const $reviewInput = z.object({
  shopId: $objectId,
  barberId: $objectId,
  customerId: $objectId,
  appointmentId: $objectId,
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

const $review = $reviewInput.extend({
  _id: $objectId.optional(),
  createdAt: z.date().default(() => new Date()),
});

export const reviewModel = mongodb.db().collection<z.infer<typeof $review>>("reviews");
export { $review, $reviewInput };
```

### Database Indexes Script
```typescript
// scripts/createIndexes.ts
import { mongodb } from "@/database.ts";

async function createIndexes() {
  const db = mongodb.db();
  
  // Shops indexes
  await db.collection("shops").createIndex({ ownerId: 1 });
  await db.collection("shops").createIndex({ isActive: 1 });
  
  // Users indexes
  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("users").createIndex({ shopId: 1 });
  await db.collection("users").createIndex({ role: 1 });
  
  // Barbers indexes
  await db.collection("barbers").createIndex({ shopId: 1 });
  await db.collection("barbers").createIndex({ userId: 1 }, { unique: true });
  await db.collection("barbers").createIndex({ isActive: 1 });
  
  // Services indexes
  await db.collection("services").createIndex({ shopId: 1 });
  await db.collection("services").createIndex({ isActive: 1 });
  
  // Appointments indexes
  await db.collection("appointments").createIndex({ shopId: 1 });
  await db.collection("appointments").createIndex({ customerId: 1 });
  await db.collection("appointments").createIndex({ barberId: 1 });
  await db.collection("appointments").createIndex({ date: 1, barberId: 1 });
  await db.collection("appointments").createIndex({ status: 1 });
  
  // Availability indexes
  await db.collection("availability").createIndex({ barberId: 1, dayOfWeek: 1 });
  await db.collection("availability").createIndex({ shopId: 1 });
  
  // Blocked slots indexes
  await db.collection("blockedSlots").createIndex({ barberId: 1, date: 1 });
  await db.collection("blockedSlots").createIndex({ shopId: 1 });
  
  // Reviews indexes
  await db.collection("reviews").createIndex({ barberId: 1 });
  await db.collection("reviews").createIndex({ customerId: 1 });
  await db.collection("reviews").createIndex({ appointmentId: 1 }, { unique: true });
  
  console.log("✅ All indexes created successfully");
}

createIndexes();
```