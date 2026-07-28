# Module: User & RBAC Management (`users`)

## Purpose
The User & RBAC Management module governs staff accounts, custom roles, permission matrixes, and staff creation within organizations.

## Current Functionality
* User Listing (`getUsers`):
  * Admin: Lists all platform users.
  * Owner: Lists users belonging to their Organization (`organization_id = req.user.organization_id`).
  * Staff: Lists users in their active shop branch.
* Staff Creation (`createUser`): Owners can create staff users directly for branches within their Organization.

## Database Dependencies
* `users`: Stores user accounts with `id`, `name`, `username`, `email`, `password`, `role` (`Admin`, `Owner`, `Manager`, `Staff`), `shop_id`, `organization_id`, `permissions`, `status`.
* `roles`: Stores shop/organization specific custom roles and permission arrays.
