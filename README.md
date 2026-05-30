# ⚡ Thunder

> A serverless-first, full-stack API framework for [Deno](https://deno.com) — file-based routing, a powerful hooks system, first-class Zod validation, MongoDB integration, and a composable plugin architecture.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Runtime: Deno](https://img.shields.io/badge/runtime-Deno-000?logo=deno&logoColor=white)](https://deno.com)
[![Database: MongoDB](https://img.shields.io/badge/database-MongoDB-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com)

Thunder lets you build type-safe HTTP APIs fast, then ship them anywhere — from serverless platforms to a long-running server — without changing your code. It stays minimal at its core and grows through plugins.

---

## Table of Contents

- [Why Thunder](#why-thunder)
- [Features](#features)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Core Concepts](#core-concepts)
  - [Routing](#routing)
  - [Validation with Zod](#validation-with-zod)
  - [Response Helpers](#response-helpers)
  - [Hooks](#hooks)
  - [Models & Database](#models--database)
  - [CRUD Helper](#crud-helper)
- [Environment Variables](#environment-variables)
- [Plugins](#plugins)
- [Available Tasks](#available-tasks)
- [Code Generation](#code-generation)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Code of Conduct](#code-of-conduct)
- [License](#license)

---

## Why Thunder

Most frameworks force a trade-off between "batteries included" and "stays out of your way." Thunder picks both: a tiny, predictable core plus an ecosystem of installable plugins that merge their routes, hooks, and models straight into your app.

- **Serverless-first by design.** Stateless requests, fast cold starts, no hidden startup work. Database indexes and migrations run via explicit scripts — never on boot.
- **Type-safe end to end.** Zod schemas double as runtime validators, OpenAPI specs, and generated TypeScript SDKs.
- **Convention over configuration.** Drop a file in `routes/`, export a `Router`, and it's live.
- **A project is a plugin.** Any Thunder project can be published to GitHub and installed into another. No special packaging.

## Features

- 🗂 **File-based routing** — `routes/users.ts` automatically serves `/users/*`.
- 🪝 **Hooks system** — pre/post request interceptors with priority-based ordering for auth, logging, rate limiting, and more.
- ✅ **Zod validation** — validate params, query, and body; one schema powers runtime checks, OpenAPI, and SDKs.
- 🍃 **MongoDB integration** — typed collections, transactions, and a `createCRUD` helper for instant REST endpoints.
- 🧩 **Plugin architecture** — compose features (auth, payments, email, ...) by installing other Thunder projects.
- 🛠 **Code generation** — OpenAPI spec, TypeScript SDK, and a ready-made dashboard app.
- 🔌 **Utilities included** — env management, caching, structured logging, hashing, template rendering, pagination.

## Requirements

- [Deno](https://docs.deno.com/runtime/getting_started/installation/) v2 or newer
- A MongoDB connection string (local or hosted, e.g. MongoDB Atlas)

## Quick Start

```bash
# 1. Clone the framework as a new project
git clone https://github.com/Huruf-Tech/thunder.git my-app
cd my-app

# 2. Initialize the project
#    ⚠️ Only run this on a fresh clone — it resets git history and sets up env.
deno task init

# 3. Configure your database connection
echo "DATABASE_URL=mongodb://localhost:27017/my-db" > .env

# 4. (Recommended) Install the official core plugin
#    Adds auth, RBAC, CORS, security headers, and user management.
deno task add:plugin -n Huruf-Tech/thunder-core

# 5. Start the development server with hot reload
deno task dev
```

Your API is now running at **http://localhost:8000**.

## Project Structure

```
thunder/
├── routes/           # Route handlers (file-based routing)
│   ├── index.ts      # Fallback router (handles /)
│   └── {name}.ts     # Route modules (e.g., users.ts → /users/*)
├── hooks/            # Pre/post request hooks (interceptors)
├── plugins/          # Installed plugins ({org}/{name}/)
├── schemas/          # MongoDB collection schemas with Zod validation
├── scripts/          # One-time setup scripts (indexes, migrations, seeds)
├── workers/          # (Optional) Background workers for separate deployment
├── public/www/       # Static assets / web root
├── core/             # Framework internals — DO NOT MODIFY
├── serve.ts          # Server entry point
├── serve.base.ts     # Request handler setup — DO NOT MODIFY
├── database.ts       # MongoDB connection instance
├── .env              # Environment variables
└── deno.json         # Project configuration & tasks
```

> **Never edit `core/` or `plugins/`.** They are managed by the framework and overwritten by `deno task update:core` / `update:plugin`. Build on top using `routes/`, `hooks/`, `schemas/`, and `scripts/` instead.

## Core Concepts

### Routing

Each file in `routes/` exports a `Router`. The filename becomes the route prefix, and only top-level `.ts` files are registered (sub-folders are ignored and can be used for organization).

```typescript
// routes/foo.ts
import { Router } from "@/core/http/router.ts";

export default new Router("/api", function foo(router) {
  // GET /foo/api
  router.get("/", function hello() {
    return () => Response.json({ message: "Hello" });
  });

  // GET /foo/api/users/:id
  router.get("/users/:id", function getUser() {
    return (req) => Response.json({ id: "123" });
  });
}).group("Foo");
```

**Two rules to remember:**

1. **Named functions are required** for both the router callback and every handler (arrow functions throw an error).
2. **The prepare pattern**: the outer handler function runs once at registration; the inner function it returns runs per request.

Supported methods: `get`, `post`, `put`, `patch`, `del` (note: `del`, not `delete`), and `all`. Path parameters use [`path-to-regexp`](https://github.com/pillarjs/path-to-regexp) syntax (`:id`, `:id?`, `{/*path}`, `{/:id}`).

### Validation with Zod

Return an object with `shape()` and `handler()` to register validators. The `shape()` function feeds runtime validation **and** OpenAPI/SDK generation.

```typescript
import { Router } from "@/core/http/router.ts";
import { bodyAsJson } from "@/core/http/utils.ts";
import z from "zod";

export default new Router("/api", function users(router) {
  router.post("/users", function createUser() {
    const $body = z.object({
      name: z.string().min(1),
      email: z.string().email(),
    });
    const $return = z.object({ id: z.string(), name: z.string() });

    return {
      shape: () => ({ body: $body, return: $return }),
      handler: async (req) => {
        const body = $body.parse(await bodyAsJson(req));
        return Response.json(
          { id: "123", name: body.name } satisfies z.output<typeof $return>,
        );
      },
    };
  });
}).group("Users");
```

### Response Helpers

```typescript
import { Response } from "@/core/http/response.ts";

Response.ok();                    // 200
Response.json({ data: "value" }); // 200 JSON
Response.created({ id: "123" });  // 201
Response.badRequest();            // 400
Response.unauthorized();          // 401
Response.forbidden();             // 403
Response.notFound();              // 404
Response.redirect("/path");       // 302
```

Errors are caught and formatted automatically: `ZodError` → 400 with details, a thrown `Response` is returned as-is, and any other `Error` → 500.

### Hooks

Hooks intercept requests before/after handlers. Drop a file in `hooks/`. **Higher priority numbers run first.**

```typescript
// hooks/auth.ts
import type { THook } from "@/core/http/hooks.ts";

export default {
  priority: 100, // runs early
  pre: async ({ req }) => {
    const token = req.headers.get("Authorization");
    if (!token) return Response.unauthorized();
    // Return a Response to short-circuit, or void to continue.
  },
  post: async ({ req, res }) => {
    // Return a Response to override, or void to keep the original.
  },
} satisfies THook;
```

### Models & Database

Define typed MongoDB collections with Zod in `schemas/`.

```typescript
// schemas/user.ts
import z from "zod";
import { mongodb } from "@/database.ts";

const $userInput = z.object({
  name: z.string(),
  email: z.string().email(),
});

export const $user = $userInput.extend({
  createdAt: z.date().default(() => new Date()),
});

export const userModel = mongodb.db().collection<z.infer<typeof $user>>("users");
```

```typescript
import { userModel, $user } from "@/schemas/user.ts";

// strictParse validates and applies defaults before insert
await userModel.insertOne($user.strictParse({ name: "John", email: "john@mail.com" }));
await userModel.findOne({ _id });
```

### CRUD Helper

Generate a full REST resource in a few lines:

```typescript
// routes/users.ts
import { Router } from "@/core/http/router.ts";
import { createCRUD } from "@/core/utils/createCRUD.ts";
import { userModel, $user, $userInput } from "@/schemas/user.ts";

export default new Router("/api", function users(router) {
  createCRUD({
    router,
    schema: $user,
    model: userModel,
    insertSchema: $userInput,
  });
}).group("Users");
```

This produces `POST`, `GET` (list, get-one, count), `PATCH`, and `DELETE` endpoints, with optional per-endpoint disabling, field isolation for multi-tenancy, and lifecycle hooks.

## Environment Variables

Thunder loads `.env`, plus `.env.<environment>` based on `ENV_TYPE` (`development`, `production`, `test`).

```bash
# Database connection (required)
DATABASE_URL=mongodb://username:password@localhost:27017/my-db

# Environment type
ENV_TYPE=development
```

Read them in code via the `Env` helper:

```typescript
import { Env, EnvType } from "@/core/utils/env.ts";

if (Env.is(EnvType.PRODUCTION)) { /* ... */ }
const dbUrl = await Env.get("DATABASE_URL");
const port = await Env.number("PORT");
```

## Plugins

A Thunder project **is** a plugin — publish it to GitHub and install it elsewhere. Plugins live under `plugins/{org}/{name}/`, and their routes and hooks auto-merge into the host app.

```bash
# Install (optionally run its setup lifecycle: indexes, seeds, migrations)
deno task add:plugin -n org/plugin-name --setup

# Run setup later
deno task setup:plugin -n org/plugin-name

# Update / remove
deno task update:plugin -n org/plugin-name
deno task remove:plugin -n org/plugin-name --clean
```

Start with the official **[thunder-core](https://github.com/Huruf-Tech/thunder-core)** plugin for authentication, RBAC, security headers, CORS, and user management.

> Installing a plugin copies its files and merges its import map but does **not** run setup automatically. Use `--setup` or `setup:plugin` to create indexes/seed data.

## Available Tasks

```bash
deno task dev               # Development server with hot reload
deno task start             # Production server
deno task check             # Format and lint
deno task update:core       # Update the framework core (overwrites core/)

deno task generate:openapi  # Generate an OpenAPI spec
deno task generate:sdk      # Generate a TypeScript SDK
deno task generate:app      # Generate a dashboard app in public/

deno task add:plugin    -n org/plugin-name [--setup[=env,...]]
deno task setup:plugin  -n org/plugin-name [--envs=env,...]
deno task update:plugin -n org/plugin-name
deno task remove:plugin -n org/plugin-name [--clean[=env,...]]
```

## Code Generation

Because validators are declared with `shape()`, Thunder can derive artifacts from your routes:

- **OpenAPI** — `deno task generate:openapi` writes a spec you can serve or share.
- **TypeScript SDK** — `deno task generate:sdk` produces a fully typed client.
- **Dashboard app** — `deno task generate:app` scaffolds a UI from the [thunder-ui](https://github.com/Huruf-Tech/thunder-ui) boilerplate.

## Deployment

Thunder is stateless and serverless-friendly. The same code runs on serverless platforms or a long-running server via `deno task start`. For background/async work (which serverless does not support), run a separate worker process or use an external queue — see the [full documentation](./llms.txt) for patterns.

## Documentation

The canonical, always-up-to-date reference for conventions and APIs lives in **[`llms.txt`](./llms.txt)** (and **[`llms-full.txt`](./llms-full.txt)** for AI agents, which also pulls in plugin extensions). It is the single source of truth for routing, hooks, validation, models, utilities, and code style.

## Contributing

Contributions are welcome! Please read the **[Contribution Guide](./CONTRIBUTING.md)** before opening an issue or pull request. It covers the development setup, commit conventions, and the review process.

## Code of Conduct

This project and everyone participating in it is governed by our **[Code of Conduct](./CODE_OF_CONDUCT.md)**. By participating, you are expected to uphold it.

## License

Released under the [MIT License](./LICENSE). © 2026 Saif Ali Khan.
