# Module Context: Branch / Shop (`shops`)

## Module Name
Branch & Store Location Management (`shops`)

## Purpose
Manages physical store locations (branches) within Organization tenants, enforces organization-level branch scoping, and handles branch creation, status toggles, and deletion.

## Responsibilities
- Create new store branches within an Organization (`POST /api/shops`).
- Fetch branches for an Organization or user context (`GET /api/shops`).
- Update branch location details (name, code, address, phone, GST/FSSAI).
- Soft-delete branches (`DELETE /api/shops/:id`).
- Trigger subscription recalculation upon branch status changes.

## Business Rules
1. Every branch MUST belong to a valid `organization_id`.
2. ONLY `status = 'active'` branches count toward the organization's billable subscription count.
3. Organization Owners can create branches within their own organization.
4. Soft-deleting a branch sets `status = 'deleted'` and decrements active billable branch count.
5. Cross-tenant branch deletion attempts by users from another organization are strictly rejected with HTTP `403 Forbidden`.

## Routes & API Endpoints
- `GET /api/shops`: List branches accessible to user.
- `GET /api/shops/:id`: Fetch single branch details.
- `POST /api/shops`: Create new branch location.
- `PUT /api/shops/:id`: Update branch details.
- `DELETE /api/shops/:id`: Soft-delete branch location.

## Components & Files Included
- Controller: [src/modules/shops/controllers/shopController.js](file:///d:/fun/src/modules/shops/controllers/shopController.js)
- Database Layer: `src/shared/database/index.js` (`shops` table)

## Recent Changes & Changelog

### Version 2.5.0 (2026-07-31)
- **Cross-Tenant Guarding**: Added strict `organization_id` validation preventing Owners from deleting branches outside their tenant scope.
- **Subscription Trigger**: Linked branch creation and deletion to `recalculateOrganizationSubscription()`.
