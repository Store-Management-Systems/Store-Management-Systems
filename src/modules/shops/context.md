# Module: Shop & Branch Management (`shops`)

## Purpose
The Shop & Branch Management module manages multi-branch store locations operating under parent Organizations in the hierarchy (`ADMIN` → `ORGANIZATION` → `OWNER` → `MULTIPLE BRANCHES`).

## Current Functionality
* Branch Creation (`createShop`):
  * Owner or Admin creates new branches (`shops` table). Each branch is associated with `organization_id` and `owner_id`.
  * Automatically recalculates parent Organization's active billable branch count and subscription amount (`Active Branches × Price Per Branch`).
* Branch Listing (`getShops`):
  * Admin: Lists all platform branches.
  * Owner: Lists ONLY branches belonging to their Organization (`organization_id = req.user.organization_id` or `owner_id = req.user.id`).
  * Staff: Lists assigned branch.
* Branch Deletion (`deleteShop`):
  * Owner or Admin can delete individual branches.
  * Server-side Authorization Check: Owner can ONLY delete branches belonging to their own Organization (`shop.organization_id === req.user.organization_id` or `shop.owner_id === req.user.id`).
  * Soft-delete strategy (`status = 'deleted'`).
  * Disables staff assigned specifically to this branch (`users.status = 'disabled'`).
  * Recalculates parent Organization's billable branch count and subscription quantity.
  * Other branches under the Organization remain completely unaffected.
  * Preserves historical sales, invoices, and inventory logs for the branch.

## Database Dependencies
* `shops`: Stores branch records with `id`, `name`, `shop_name`, `shop_code`, `owner_id`, `organization_id`, `address`, `phone`, `email`, `gst`, `currency`, `tax_rate`, `logo`, `status`.
