# Module Context: Authentication (`auth`)

## Module Name
Authentication & Session Management (`auth`)

## Purpose
Provides secure authentication, password validation, JWT token generation, role resolution, and context auto-repair for Platform Admin, Organization Owners, Branch Managers, and Store Staff.

## Responsibilities
- Validate user login credentials against bcrypt-hashed passwords.
- Resolve user role (`Admin`, `Owner`, `Manager`, `Staff`, `Cashier`).
- Look up tenant organization (`organization_id`) and active billable branch locations (`ownedShops`).
- Auto-repair missing `users.organization_id` column for Organization Owners.
- Return signed JWT access tokens containing user claims.
- Provide `/api/auth/me` profile verification endpoint.

## Current Features
- **Multi-Role Login Endpoint**: `POST /api/auth/login`
- **Profile Endpoint**: `GET /api/auth/me`
- **Password Hashing**: `bcryptjs` (salt rounds: 10)
- **Token Verification**: Signed JWT tokens via `JWT_SECRET`
- **Auto-Repair Pipeline**: Detects missing `organization_id` on Owner user records and updates the database automatically upon successful login.

## Business Rules
1. Platform Admin (`role = 'Admin'`) logs in without requiring an `organization_id` or `shop_id`.
2. Organization Owners MUST be resolved to their primary `organization_id`.
3. If an Owner account has a null `organization_id` in `users`, backend queries `organizations` where `owner_id = user.id` and repairs `users.organization_id`.
4. Password verification MUST fail gracefully with HTTP 401 Unauthorized for invalid credentials.
5. Inactive users (`status != 'active'`) are blocked from logging in.

## Routes & API Endpoints
- `POST /api/auth/login` (Public): Accepts `{ username, password }`, returns `{ success: true, token, user }`.
- `GET /api/auth/me` (Protected): Accepts Bearer token, returns live user profile & branch array.

## Components & Files Included
- Controller: [src/modules/auth/controllers/authController.js](file:///d:/fun/src/modules/auth/controllers/authController.js)
- Middleware: [src/shared/middleware/auth.js](file:///d:/fun/src/shared/middleware/auth.js)
- Database Layer: `src/shared/database/index.js`

## Recent Changes & Changelog

### Version 2.5.0 (2026-07-31)
- **Auto-Repair Pipeline Introduced**: Reordered `orgDetails` lookup prior to `ownedShops` execution in `login` and `getMe` controllers to auto-repair missing `users.organization_id`.
- **Role Sync in Middleware**: Updated `auth.js` middleware to sync `req.user.role` with `dbUser.role` on every protected request.
