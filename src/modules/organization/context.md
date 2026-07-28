# Module: Organization Management (`organization`)

## Purpose
The Organization Management module provides super-admin SaaS multi-tenant capabilities, allowing creation, configuration, branch linking, owner user creation, and lifecycle management of client business organizations.

## Current Functionality
* Fetching all active organizations (Admin view) or owned organization.
* Retrieving single organization details including attached branch shops and associated users.
* Creating new organizations with auto-generated default HQ shop and Owner user profile.
* Updating organization name, email, phone, and status.
* Soft-deleting organizations (`status = 'deleted'`).

## User Roles
* **Admin**: Super Admin full CRUD control over all organizations.
* **Owner**: View access to their own organization profile and branches.

## Permissions
* Requires authenticated session (`authenticate` middleware).
* Mutating endpoints (`POST`, `PUT`, `DELETE`) strictly restricted to Super Admin (`req.user.role === 'Admin'`).

## File Structure
```
src/modules/organization/
├── controllers/
│   └── organizationController.js
├── routes/
│   └── organizationRoutes.js
├── context.md
└── index.js
```

## Routes
* `GET /api/organizations`: List accessible organizations.
* `GET /api/organizations/:id`: Retrieve detailed organization metadata with branches and staff.
* `POST /api/organizations`: Provision a new organization, HQ shop, and Owner credentials.
* `PUT /api/organizations/:id`: Update organization attributes.
* `DELETE /api/organizations/:id`: Soft delete an organization.

## Components
* Backend module; interfaces with Super Admin Organization Management UI.

## Services / Business Logic
* Generates unique IDs (`org_xxxxxx`, `shp_xxxxxx`, `usr_xxxxxx`) via `uuidv4`.
* Auto-provisions HQ shop and provisions default full permissions array for Owner users.

## API / Server Actions
* Uses Standard JSON response via `src/shared/utils/response.js`.

## Database Dependencies
* `organizations`: Core organization record storage.
* `shops`: Branch shop association via `organization_id`.
* `users`: Organization staff association via `organization_id`.

## Shared Dependencies
* `src/shared/middleware/auth.js` (`authenticate`)
* `src/shared/database/init.js` (`db`)
* `src/shared/utils/response.js` (`success`, `error`)

## Module Dependencies
* `shops`: Auto-provisions initial HQ branch shop.
* `users`: Auto-provisions initial Owner account.
* `notifications`: Logs audit trail via `logAudit`.

## Data Flow
```
POST /api/organizations
  ↓
Validate code uniqueness -> Create `organizations` entry -> Provision default `shops` HQ branch -> Provision default `users` Owner
  ↓
Log Audit Event -> Return 201 Created Response
```

## Important Business Rules
* Organization codes (`code`) MUST be unique across the platform.
* Deleting an organization marks `status = 'deleted'` to preserve historical transactional auditing.

## Validation Rules
* Organization name and code are mandatory.
* Owner username must be unique if owner account is created during organization provisioning.

## Current UI Behaviour
* Displayed in Super Admin dashboard view for SaaS organization administration.

## Known Limitations
* Hard-coded initial owner permission set (can be managed via Role Management afterwards).

## Change History
* Modularized into `src/modules/organization`.

## Future Development Instructions
* When updating organization schema, verify `shops` and `users` tables maintain foreign reference parity.
