# Module Context: Organization (`organization`)

## Module Name
Organization Tenant Management (`organization`)

## Purpose
Manages the complete lifecycle of customer tenant Organizations, owner assignments, status activations/deactivations, cascade soft-deletions, and branch-based subscription calculations.

## Responsibilities
- Create new Organization tenants (`POST /api/organizations`).
- View Organization directory & details (`GET /api/organizations`, `GET /api/organizations/:id`).
- Update Organization details (`PUT /api/organizations/:id`).
- Toggle Organization status (`active` / `inactive`).
- Soft-delete Organizations (`DELETE /api/organizations/:id`).
- Automatically recalculate monthly subscription amounts based on active billable branch count.

## Business Rules & Lifecycle
1. **Creation**: Organization is created with name, code, owner assignment, and price per branch (default ₹999).
2. **Owner Linking**: Setting `owner_id` links the user account as Organization Owner and updates `users.organization_id`.
3. **Subscription Recalculation**:
   $$\text{Subscription Amount} = \text{Active Billable Branches} \times \text{Price Per Branch}$$
4. **Deactivation**: Setting status to `inactive` suspends tenant access.
5. **Soft-Delete Cascade**:
   - Marking Organization `status = 'deleted'` soft-deletes all associated branches (`status = 'deleted'`).
   - All associated users are disabled (`status = 'disabled'`).
   - Active billable branches count evaluates to `0`.
   - Historical transactional tables (`bills`, `purchases`, `ledgers`) remain intact for reporting.

## Routes & API Endpoints
- `GET /api/organizations`: Returns list of organizations (Admin only).
- `GET /api/organizations/:id`: Returns single organization details with owner & branch array.
- `POST /api/organizations`: Creates new organization and optional owner account.
- `PUT /api/organizations/:id`: Updates organization details.
- `DELETE /api/organizations/:id`: Cascade soft-deletes organization, branches, and disables users.

## Components & Files Included
- Controller: [src/modules/organization/controllers/organizationController.js](file:///d:/fun/src/modules/organization/controllers/organizationController.js)
- Database Layer: `src/shared/database/index.js` (`organizations` table)

## Recent Changes & Changelog

### Version 2.5.0 (2026-07-31)
- **Cascade Soft-Delete**: Implemented multi-table cascade update marking branches `deleted` and users `disabled`.
- **Subscription Recalculation Service**: Added `recalculateOrganizationSubscription()` helper automatically triggered on branch addition/deletion.
