# Module: Organization Management (`organization`)

## Purpose
The Organization Management module provides corporate tenant administration for Superadmin (Admin) to create organizations, appoint/assign Organization Owners, manage branch-based subscriptions (`Active Branches × Price Per Branch`), and safely perform soft-deletions with cascade access revocation.

## Current Functionality
* Organization Creation (`createOrganization`): Superadmin workflow to create an Organization, configure subscription details (`subscription_plan`, `price_per_branch`, `subscription_expiry`), appoint an Owner account (`role = 'Owner'`), and create the initial branch.
* Organization Listing (`getOrganizations`):
  * Admin: Lists all organizations with active branch count, price per branch, calculated subscription amount (`Active Branches × Price Per Branch`), owner details, subscription status, and detailed branch breakdown.
  * Owner: Lists assigned Organization.
* Organization Details (`getOrganizationById`): Enforces organization data isolation. Displays organization metadata, active billable branch breakdown (`Active -> Billable`, `Deleted -> Non-Billable`), user accounts, and calculated subscription totals.
* Owner Assignment (`assignOwner`): Allows Superadmin to appoint or reassign an Owner user to an Organization (`POST /api/organizations/:id/assign-owner`).
* Organization Soft-Deletion (`deleteOrganization`):
  * Admin-only high-impact action (`DELETE /api/organizations/:id`).
  * Sets Organization `status = 'deleted'`, `subscription_status = 'Cancelled'`.
  * CASCADE soft-deletes all associated branches (`shops.status = 'deleted'`).
  * Immediately revokes access for Owner and branch staff (`users.status = 'disabled'`).
  * Preserves historical sales, invoices, payments, ledgers, inventory logs, and reports.

## Database Dependencies
* `organizations`: Stores `id`, `name`, `code`, `owner_id`, `owner_name`, `email`, `phone`, `status`, `subscription_plan`, `subscription_status`, `subscription_start`, `subscription_expiry`, `price_per_branch`, `active_branch_count`, `subscription_amount`.
* `shops`: Stores branches associated via `organization_id`.
* `users`: Stores organization owner and staff accounts via `organization_id`.
