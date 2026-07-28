# Module: User & RBAC Management (`users`)

## Purpose
The User & RBAC Management module governs staff accounts, custom roles, permission matrixes, and staff access revocation upon branch/organization deletion.

## Current Functionality
* User Listing (`getUsers`):
  * Admin: Lists all platform users.
  * Owner: Lists users belonging to their Organization (`organization_id = req.user.organization_id`).
  * Staff: Lists users in their active shop branch.
* Access Revocation:
  * Deleting an Organization automatically disables access for the Owner and all branch staff (`status = 'disabled'`).
  * Deleting a Branch automatically disables access for staff assigned to that branch (`status = 'disabled'`).
  * Session requests from disabled users are rejected with 403 Forbidden.
