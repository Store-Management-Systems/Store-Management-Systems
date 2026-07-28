# Module: Settings (`settings`)

## Purpose
The Settings module handles shop-specific configuration attributes including receipt tagline, store branding logo, currency format, default sales tax rate, low stock warning alert thresholds, and address/contact headers.

## Current Functionality
* Settings Retrieval: Reads shop configuration attributes, with auto-fallback to `shops` table if uninitialized.
* Settings Update: Updates `settings` table and synchronizes corresponding attributes in `shops` table.

## User Roles
* **Admin, Owner, Manager** (Subject to `Settings` permission).

## Permissions
* `GET /api/settings`: Authenticated access.
* `PUT /api/settings`: Requires `Settings` permission in `checkPermission('Settings')`.

## File Structure
```
src/modules/settings/
├── controllers/
│   └── settingsController.js
├── routes/
│   └── settingsRoutes.js
├── context.md
└── index.js
```

## Routes
* `GET /api/settings`: Retrieve shop settings configuration.
* `PUT /api/settings`: Update shop settings & sync shop profile.

## Components
* Interfaces with Settings form and receipt preview in `index.html`.

## Services / Business Logic
* Dual Sync: Updating settings automatically updates matching fields (`shop_name`, `address`, `phone`, `gst`, `currency`, `tax_rate`, `logo`, `low_stock_alert`) in the `shops` table.

## API / Server Actions
* Returns standard JSON payload via `src/shared/utils/response.js`.

## Database Dependencies
* `settings`: Shop configuration record.
* `shops`: Shop branch profile record.

## Shared Dependencies
* `src/shared/middleware/auth.js` (`authenticate`)
* `src/shared/middleware/rbac.js` (`checkPermission`)
* `src/shared/database/init.js` (`db`)

## Module Dependencies
* `shops`: Synchronizes profile data.
* `notifications`: Logs audit event via `logAudit`.

## Data Flow
```
PUT /api/settings
  ↓
Update `settings` table record -> Update `shops` table record -> Log Audit Event -> Return Response
```

## Important Business Rules
* Changes to `settings` MUST be synced to `shops` to avoid UI data mismatch across session views.

## Validation Rules
* Tax rate and low stock alert values must be non-negative numbers.

## Current UI Behaviour
* Displayed under "Settings" tab in SPA.

## Known Limitations
* Multi-currency conversion rates are managed as display symbols; base accounting amounts remain in local shop currency.

## Change History
* Modularized into `src/modules/settings`.

## Future Development Instructions
* When adding a new shop-level setting (e.g. Printer Type, Barcode Format), add columns to both `settings` and `schema.sql`.
