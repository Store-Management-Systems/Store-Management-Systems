# Module Context: Shared Infrastructure (`shared`)

## Module Name
Shared Utilities, Middleware & Database Adapters (`shared`)

## Purpose
Provides universal server infrastructure including dual database connectivity (Neon PostgreSQL vs local SQLite), Express authentication middleware (`auth.js`), response helpers, and migration scripts.

## Core Infrastructure Components

### 1. Dual Database Layer (`src/shared/database/index.js`)
- Detects environment variable `DATABASE_URL`.
- If `DATABASE_URL` is present: Connects to **Neon PostgreSQL** (serverless pooled SQL connection via `pg` library).
- If `DATABASE_URL` is absent: Connects to **SQLite3** (`database.db` file).
- Abstracted `dbQuery(sql, params)` method wraps database calls seamlessly so controllers write standard SQL without engine lock-in.

### 2. Authentication & Tenant Authorization Middleware (`src/shared/middleware/auth.js`)
- Intercepts incoming HTTP requests.
- Validates Authorization Bearer token header.
- Verifies user status in database (`status = 'active'`).
- Auto-resolves missing `organization_id` for Organization Owners via database lookup.
- Attaches normalized `req.user` payload (`{ id, role, organization_id, shop_id }`) for controller consumption.

## Files Included
- `src/shared/index.js`
- `src/shared/database/index.js`
- `src/shared/middleware/auth.js`
- `src/shared/utils/index.js`

## Recent Changes & Changelog

### Version 2.5.0 (2026-07-31)
- **Role & Org Auto-Sync**: Updated `auth.js` middleware to sync `req.user.role` with `dbUser.role` and auto-lookup missing `organization_id`.
