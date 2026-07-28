# Module: Shop & Branch Management (`shops`)

## Purpose
The Shop & Branch Management module manages multi-branch store locations operating under parent Organizations in the hierarchy (`ADMIN` → `ORGANIZATION` → `OWNER` → `MULTIPLE BRANCHES`).

## Current Functionality
* Branch Creation (`createShop`): Owner or Admin creates new branches (`shops` table). Each branch is associated with `organization_id` and `owner_id`.
* Branch Listing (`getShops`):
  * Admin: Lists all platform branches.
  * Owner: Lists ONLY branches belonging to their Organization (`organization_id = req.user.organization_id` or `owner_id = req.user.id`).
  * Staff: Lists assigned branch.
* Branch Details & Status (`getShopById`, `updateShop`, `toggleShopStatus`, `deleteShop`): Enforces organization data isolation. Non-Admin users cannot view or modify branches outside their organization.

## Database Dependencies
* `shops`: Stores branch records with `id`, `name`, `shop_name`, `shop_code`, `owner_id`, `organization_id`, `address`, `phone`, `email`, `gst`, `currency`, `tax_rate`, `logo`, `status`.

## Data Isolation Rules
* Every branch MUST have a valid `organization_id` linking it to its parent Organization.
* Owners can create and manage multiple branches strictly for their own Organization.
