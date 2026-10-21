# Thunder Framework

Deno + MongoDB, serverless-first backend framework. File-based routing.

## Context: read these first

`llms-full.txt` is the context manifest. Follow it:

1. [llms.txt](llms.txt) — source of truth for the framework (routing, hooks, validation, env, models, response helpers, code style). Always read before writing backend code.
2. Glob `plugins/*/*/llms.extension.txt` — read every match. Plugin rules are *additive* and apply only in that plugin's scope; on conflict, core `llms.txt` wins and flag the discrepancy.
3. Glob `public/*/llms.txt` — read the app's file before touching its UI. The backend contract (routes/schemas in `llms.txt` + plugin extensions) is authoritative; flag mismatches instead of inventing either side.

Re-run the plugin glob after any `deno task add:plugin` / `update:plugin` / `remove:plugin` — read the new `llms.extension.txt` (or its `routes/`, `hooks/`, `schemas/`, `.env.example` if missing) **before** writing code against it. Never guess a plugin's API from its name.

Ignore `_temp/` entirely — never read from it, never write into it, exclude it from globs and search.

## Hard rules

- **Never edit `core/` or `plugins/`.** Both are overwritten by update tasks. Extend via `routes/`, `hooks/`, `schemas/`, `scripts/`, or by wrapping core utilities.
- **Named functions only** for routers and handlers (`new Router("/api/", function users(router) {...})`); arrow functions throw. Handler names unique per router.
- **`@/` alias** for all project imports — no relative `../core/` or `../database.ts` (lint plugins enforce this).
- **Reuse built-ins before writing or installing anything**: `Env`, `Logger`, `cache`/`memoize`, `createHash`, `queryAsJson`, `paginated`, `createCRUD`, `normalizeFilters`, `bodyAsJson`, `Response` helpers, `zod`. Prefer `@std/*` over npm. Justify every new dependency.
- Sub-folders in `routes/` don't affect routing — discovery is recursive and matches on **filename only**, so `routes/hr/payroll.ts` === `routes/payroll.ts` → `/payroll/*`. Folders organize code; keep filenames unique across `routes/`.
- No background jobs in-process (serverless); use `workers/` on a separate server or an external queue.
- Zod schemas go in the prepare phase, outside the request handler. Throw `Response.forbidden(...)` etc. for error responses.

## Tasks

```
deno task dev            # hot-reload server on :8000
deno task check          # fmt + lint
deno task setup          # cloned/forked project (git hooks only)
deno task init           # BRAND-NEW project from template — RESETS git history
deno task add:plugin -n {org}/{name}
deno task update:core
deno task generate:openapi | generate:sdk | generate:app
```
