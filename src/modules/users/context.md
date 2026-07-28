# Module: User & RBAC Management (`users`)

## Purpose
The User & RBAC Management module provides administration of system users, staff profiles, custom role creation, granular permission assignment, administrative audit log inspection, system data backup/restore, and 3-tier guarded full data wipes.

## Current Functionality
* User CRUD: Listing staff users, creating staff accounts, profile updates, password resets, and user deletion.
* Role-Based Access Control (RBAC): Dynamic custom roles, system permissions checklist retrieval (`22 permissions`).
* Non-Superadmin Staff Creation Request: Approval queue entry creation for non-Admin staff operations.
* System Administration: Audit log listing, database JSON export backup, database restoration, and 3-tier password verified full data reset.

## User Roles
* **Admin**: Super Admin full control over all users, roles, audit logs, and data wipe operations.
* **Owner/Manager**: Manage staff users and custom roles assigned to their shop branch.

## Permissions
* Requires `Users` permission in `checkPermission('Users')` for user/role management.
* Requires `Settings` permission for admin audit logs and backup/restore endpoints.

## File Structure
```
src/modules/users/
├── controllers/
│   ├── userController.js
│   ├── roleController.js
│   └── adminController.js
├── routes/
│   ├── userRoutes.js
│   ├── roleRoutes.js
│   └── adminRoutes.js
├── context.md
└── index.js
```

## Routes
### User Management (`/api/users`)
* `GET /api/users`: List users in assigned shop branch (or all users for Super Admin).
* `GET /api/users/:id`: Get user profile.
* `POST /api/users`: Create staff user (or submit approval request).
* `PUT /api/users/:id`: Update user profile & permissions.
* `POST /api/users/:id/reset-password`: Reset staff password.
* `DELETE /api/users/:id`: Delete user account.

### Role & Permissions (`/api/roles`)
* `GET /api/roles/permissions`: Retrieve master 22 system permissions checklist.
* `GET /api/roles`: List shop roles.
* `POST /api/roles`: Create new custom role.
* `PUT /api/roles/:id`: Update role permissions.
* `DELETE /api/roles/:id`: Delete custom role.

### Admin Operations (`/api/admin`)
* `GET /api/admin/audit-logs`: List recent system audit logs.
* `GET /api/admin/backup`: Export JSON backup of all application tables.
* `POST /api/admin/restore`: Restore database from JSON backup payload.
* `POST /api/admin/delete-all-data`: Danger-zone 3-tier password confirmed full database wipe.

## Components
* Interfaces with User Management modal, Role Editor modal, Audit Log table, and Danger Zone settings in `index.html`.

## Services / Business Logic
* Self-deletion is explicitly blocked (`id === req.user.id`).
* `delete-all-data` enforces 3 separate password checks against the Admin password hash plus exact confirmation phrase `DELETE ALL DATA`.

## API / Server Actions
* Uses Standard JSON response format via `src/shared/utils/response.js`.

## Database Dependencies
* `users`: User profiles, roles, hashed passwords, permission JSON strings.
* `roles`: Custom role templates and permission sets.
* `audit_logs`: Audit trail logs.
* All tables: Backup/Restore & Delete All Data actions query and mutate all application tables.

## Shared Dependencies
* `src/shared/middleware/auth.js` (`authenticate`)
* `src/shared/middleware/rbac.js` (`checkPermission`)
* `src/shared/database/init.js` (`db`)

## Module Dependencies
* `approvals`: Registers approval requests when Non-Superadmin creates, updates, or deletes staff accounts.
* `notifications`: Sends system notifications and logs audit events.

## Data Flow
```
POST /api/users
  ↓
Check username uniqueness -> If Non-Admin, insert into `approvals` table with status 'pending_approval' -> Log Audit
  ↓
Return Response
```

## Important Business Rules
* Super Admin password MUST be verified 3 times prior to executing `delete-all-data`.
* `roles` marked `is_system = 1` CANNOT be deleted.
* Passwords MUST be encrypted using bcrypt.

## Validation Rules
* Username must be unique across the platform.
* Reset passwords must be at least 4 characters.

## Current UI Behaviour
* Displayed under User & Staff Settings and System Administration panels in SPA.

## Known Limitations
* Data restoration overwrites existing transactional data.

## Change History
* Consolidated user controller, role controller, and admin controller into `src/modules/users`.

## Future Development Instructions
* When adding a new system permission, update `SYSTEM_PERMISSIONS` in `roleController.js` and document it in `context.md`.
