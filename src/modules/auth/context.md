# Module: Authentication (`auth`)

## Purpose
The Authentication module manages user login, session validation (`/me`), password changes, logout, and token issuance (JWT). It serves as the primary security gateway for the application.

## Current Functionality
* User login via username or email with password verification.
* Issuance of HTTP-only JWT cookies and bearer token payload.
* Current user profile retrieval (`getMe`) returning user object, permissions array, active shop details, and accessible branches.
* Secure password updating with current password validation and bcrypt hashing.
* Session termination / logout clearing HTTP cookies.
* Audit logging of authentication events.

## User Roles
* **All Roles**: Admin, Owner, Manager, Staff, Accountant.

## Permissions
* Public access for `/login`.
* Authenticated access (`authenticate` middleware) required for `/logout`, `/me`, `/change-password`.

## File Structure
```
src/modules/auth/
├── controllers/
│   └── authController.js
├── routes/
│   └── authRoutes.js
├── context.md
└── index.js
```

## Routes
* `POST /api/auth/login`: Authenticate credentials and return JWT & user details.
* `POST /api/auth/logout`: Clear session cookies.
* `GET /api/auth/me`: Fetch current logged-in user profile & shop data.
* `POST /api/auth/change-password`: Update authenticated user password.

## Components
* Backend module; communicates with frontend login modal & SPA session state in `script.js`.

## Services / Business Logic
* Validates user account status (`active` vs `disabled`/`deleted`/`rejected`).
* Supports legacy plain text password comparison alongside bcrypt hash verification (`bcrypt.compareSync`).
* Injects permission array into JWT payload.

## API / Server Actions
* Uses Standard JSON response format via `src/shared/utils/response.js`.

## Database Dependencies
* `users`: Account lookup (`username`, `email`, `password_hash`, `role`, `shop_id`, `permissions`).
* `shops`: Associated shop information & owned branch lists.

## Shared Dependencies
* `src/shared/middleware/auth.js` (`authenticate`, `JWT_SECRET`)
* `src/shared/database/init.js` (`db`)
* `src/shared/utils/response.js` (`success`, `error`)

## Module Dependencies
* `notifications`: Invokes `logAudit` service for recording login/password audit logs.
* `shops`: Fetches branch list and active shop metadata.

## Data Flow
```
User Login Request
  ↓
Validate input -> Query `users` table -> Check status & bcrypt password
  ↓
Query `shops` table -> Sign JWT token -> Set Cookie & return user + branch payload
```

## Important Business Rules
* Deactivated, deleted, or rejected users MUST be rejected with HTTP 403.
* Super Admin role receives all branch shops; non-Admin receives assigned/owned shops.
* Passwords MUST be hashed using bcrypt (10 salt rounds) when updated.

## Validation Rules
* Username/email and password cannot be empty.
* Old password must match existing account password during password change.

## Current UI Behaviour
* Login modal handles user authentication; token stored in cookie/memory.

## Known Limitations
* Dual password validation (plain text fallback) maintained for backward compatibility with legacy demo seeds.

## Change History
* Initial modularization into `src/modules/auth`.

## Future Development Instructions
* Always maintain `logAudit` calls on login and password change events.
* Preserve JWT payload structure to ensure compatibility with `rbac` middleware.
