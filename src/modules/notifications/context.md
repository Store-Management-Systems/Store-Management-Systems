# Module: Notifications & Audit Logging (`notifications`)

## Purpose
The Notifications & Audit Logging module provides in-app alert notifications, system activity tracking, and central audit log recording (`logAudit`) across all business transactions and administrative actions.

## Current Functionality
* Notifications Listing: Fetches recent in-app system alerts (`limit 50`).
* Mark as Read: Updates `is_read = 1` for notification items.
* Audit Log Inspection: Returns shop-specific audit trail records with user details.
* Audit Logging Service (`logAudit`): Exposes global helper function to insert structured action records into `audit_logs`.

## User Roles
* **All Roles**: Receive notification alerts.
* **Admin, Owner, Manager**: View shop audit log history.

## Permissions
* Requires authenticated session (`authenticate` middleware).

## File Structure
```
src/modules/notifications/
├── controllers/
│   └── notificationController.js
├── routes/
│   └── notificationRoutes.js
├── services/
│   └── auditService.js
├── context.md
└── index.js
```

## Routes
* `GET /api/notifications`: Retrieve recent notifications list.
* `PATCH /api/notifications/:id/read`: Mark notification as read.
* `GET /api/notifications/audit-logs`: Retrieve shop audit logs.

## Components
* Interfaces with Notification bell drawer and Audit History tab in `index.html`.

## Services / Business Logic
* `logAudit(shop_id, user_id, action, details)` safely wraps SQL insertions in a try/catch block so logging errors never disrupt primary business transactions.

## API / Server Actions
* Returns standard JSON payload via `src/shared/utils/response.js`.

## Database Dependencies
* `notifications`: In-app alert messages, type, read status.
* `audit_logs`: Detailed action audit trail with user references.

## Shared Dependencies
* `src/shared/middleware/auth.js` (`authenticate`)
* `src/shared/database/init.js` (`db`)
* `src/shared/utils/response.js` (`success`, `error`)

## Module Dependencies
* Consumed by all modules (`auth`, `organization`, `shops`, `users`, `inventory`, `billing`, `customers`, `settings`, `approvals`) to log user activities.

## Data Flow
```
Module Action (e.g. Create Bill)
  ↓
Invoke `logAudit(shop_id, user_id, 'Create Bill', details)`
  ↓
Insert record into `audit_logs` table (Non-blocking)
```

## Important Business Rules
* Failures in `logAudit` MUST NOT break the calling HTTP endpoint execution path.

## Validation Rules
* Requires valid notification or shop context.

## Current UI Behaviour
* Displayed in topbar notification badge and "Audit History" panel in SPA.

## Known Limitations
* Audit log queries return up to 100 recent entries per shop.

## Change History
* Modularized into `src/modules/notifications`.

## Future Development Instructions
* When adding a new module or administrative endpoint, always call `logAudit` upon state mutation.
