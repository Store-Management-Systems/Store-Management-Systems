# Module: Organization Management (`organization`)

## Purpose
The Organization Management module provides corporate tenant administration for Superadmin (Admin) to create organizations, appoint/assign Organization Owners, manage subscription plans and expiry dates, and inspect organization branch structures.

## Core Hierarchy Role & Responsibilities
```
ADMIN (Superadmin) -> Creates Organization -> Assigns Owner -> Owner Manages Branches
```

## Current Functionality
* Organization Creation (`createOrganization`): Superadmin workflow to create an Organization, configure subscription details (`subscription_plan`, `subscription_expiry`), appoint an Owner account (`role = 'Owner'`, `organization_id`), and initialize the primary branch.
* Organization Listing (`getOrganizations`):
  * Superadmin: Lists all platform organizations with total branches count, owner details, subscription status, and plan details.
  * Owner: Lists only their assigned Organization.
* Organization Details (`getOrganizationById`): Enforces organization data isolation. Displays organization metadata, branch list (`shops`), and user accounts.
* Owner Assignment (`assignOwner`): Allows Superadmin to appoint or reassign an Owner user to an Organization (`POST /api/organizations/:id/assign-owner`).
* Organization Update (`updateOrganization`): Modifies organization name, contact details, status (`active`/`inactive`), subscription plan (`Standard`, `Pro`, `Enterprise`), and subscription expiry dates.

## User Roles
* **Admin**: Creates organizations, assigns owners, updates subscription plans/statuses, toggles organization status.
* **Owner**: Views their assigned Organization details.

## Permissions
* Requires authenticated session (`authenticate` middleware).
* Creation, editing, owner assignment, and deletion restricted to Superadmin (`role === 'Admin'`).

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
* `GET /api/organizations`: List organizations.
* `GET /api/organizations/:id`: View organization details, branches, and users.
* `POST /api/organizations`: Create new organization & owner account.
* `PUT /api/organizations/:id`: Update organization details & subscription plan.
* `POST /api/organizations/:id/assign-owner`: Appoint/assign owner to organization.
* `DELETE /api/organizations/:id`: Soft delete organization.

## Database Dependencies
* `organizations`: Stores `id`, `name`, `code`, `owner_id`, `owner_name`, `email`, `phone`, `status`, `subscription_plan`, `subscription_status`, `subscription_start`, `subscription_expiry`.
* `shops`: Stores branches associated via `organization_id`.
* `users`: Stores organization owner and staff accounts via `organization_id`.

## Shared Dependencies
* `src/shared/middleware/auth.js` (`authenticate`)
* `src/shared/database/init.js` (`db`)

## Data Isolation Rules
* Non-Admin users are strictly isolated to their own `organization_id`. Cross-organization access attempts return 403 Forbidden.
