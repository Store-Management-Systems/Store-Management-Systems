# Module: Shop Management (`shops`)

## Purpose
The Shop Management module handles multi-branch creation, branch switching, tax rates, GST/FSSAI configuration, shop status toggling, and branch approval workflows.

## Current Functionality
* Retrieval of accessible shop branches based on user role and ownership.
* Creation of new shop branches (auto-active for Superadmin, pending approval for non-Admin owners).
* Automatic seeding of default settings, categories, and units upon new shop branch creation.
* Updating shop branch metadata (name, address, tax rate, GST, FSSAI, manager, logo).
* Toggling shop status between `active` and `disabled`.
* Soft-deleting branch shops (`status = 'deleted'`) after checking for active sales transactions.

## User Roles
* **Admin**: Super Admin view and manage all shop branches across the system.
* **Owner**: View and manage owned shop branches.
* **Manager/Staff**: Access assigned shop details.

## Permissions
* Requires `Shops` permission in `checkPermission('Shops')`.

## File Structure
```
src/modules/shops/
├── controllers/
│   └── shopController.js
├── routes/
│   └── shopRoutes.js
├── context.md
└── index.js
```

## Routes
* `GET /api/shops`: List accessible shop branches.
* `GET /api/shops/:id`: Retrieve single shop branch details.
* `POST /api/shops`: Create a new shop branch (or submit branch creation request).
* `PUT /api/shops/:id`: Update shop metadata and sync with `settings`.
* `PATCH /api/shops/:id/status`: Toggle active/disabled status.
* `DELETE /api/shops/:id`: Soft delete shop branch (if zero active bills).

## Components
* Interfaces with Shop Management table and Branch Switcher UI in `script.js`.

## Services / Business Logic
* Default HQ branch (`shop_default_hq`) CANNOT be deleted.
* When created by non-Superadmin, generates an approval request in `approvals` table with auto-approve timer.
* Auto-seeds default item categories (`General`, `Bakery`, `Beverages`, etc.) and units (`Pcs`, `Kg`, `Grams`, etc.) for every new shop.

## API / Server Actions
* Returns standard JSON payload via `src/shared/utils/response.js`.

## Database Dependencies
* `shops`: Primary shop branch entity storage.
* `settings`: Synchronized shop configuration record.
* `categories`: Auto-seeded category records.
* `units`: Auto-seeded measurement unit records.
* `approvals`: Approval queue for branch creation requests.

## Shared Dependencies
* `src/shared/middleware/auth.js` (`authenticate`)
* `src/shared/middleware/rbac.js` (`checkPermission`)
* `src/shared/database/init.js` (`db`)

## Module Dependencies
* `approvals`: Registers approval requests when non-Superadmin creates a branch.
* `notifications`: Sends system alert notifications for pending approvals.
* `inventory`: Seeds default categories and units.

## Data Flow
```
POST /api/shops (by Non-Superadmin)
  ↓
Create shop record with status 'pending_approval' -> Insert into `approvals` table -> Create HQ `notifications` record
  ↓
Log Audit -> Return HTTP 202 Accepted Response
```

## Important Business Rules
* `shop_default_hq` MUST NOT be deleted under any circumstances.
* A branch with active non-cancelled sales bills CANNOT be deleted.
* Shop codes (`shop_code`) MUST be unique.

## Validation Rules
* Shop name and shop code are required.
* Tax rates and low stock alert values must be valid numbers.

## Current UI Behaviour
* Admin users can select active branch from topbar dropdown; Non-Admin users view assigned branch.

## Known Limitations
* Hardcoded auto-approve duration set to 8 hours for branch creation requests.

## Change History
* Modularized into `src/modules/shops`.

## Future Development Instructions
* Ensure any update to `shops` updates the matching `settings` table record to maintain consistency.
