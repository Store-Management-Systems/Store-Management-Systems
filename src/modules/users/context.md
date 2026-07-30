# Module Context: Users & Staff Management (`users`)

## Module Name
User Accounts, Roles & Staff Management (`users`)

## Purpose
Manages user credentials, role assignments (`Admin`, `Owner`, `Manager`, `Staff`, `Cashier`), permissions, and status controls across Organizations and Branches.

## Responsibilities
- Create user accounts for Organization Owners and Branch Staff.
- Manage staff status (`active` / `disabled`).
- Assign users to specific `organization_id` and `shop_id` contexts.

## Role Hierarchy & Permissions
1. **Admin**: SaaS Platform Superadmin.
2. **Owner**: Organization Owner (Manages organization users & branches).
3. **Manager / Staff / Cashier**: Branch-level store personnel.

## Routes & API Endpoints
- `GET /api/users`: List users accessible to current user.
- `POST /api/users`: Create user account.
- `PUT /api/users/:id`: Update user profile/role.
- `DELETE /api/users/:id`: Disable user account.

## Components & Files Included
- Controller: [src/modules/users/controllers/userController.js](file:///d:/fun/src/modules/users/controllers/userController.js)

## Recent Changes & Changelog

### Version 2.5.0 (2026-07-31)
- **Role Sync**: Guaranteed `req.user.role` syncs with `dbUser.role` in auth middleware.
- **Cascade Disable**: Soft-deleting an Organization automatically disables all associated staff user accounts.
