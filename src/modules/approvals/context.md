# Module: Approval Management (`approvals`)

## Purpose
The Approval Management module governs multi-tier approval workflows for sensitive branch operations (branch creation, staff user creation, user edits, user deletion) requiring Super Admin consent, with an 8-hour auto-approval fallback.

## Current Functionality
* Approval Request Listing: Super Admin views all pending/processed requests; non-Admin views own submitted requests.
* Auto-Approval Engine: Checks pending requests upon access and auto-approves requests older than 8 hours (`processPendingAutoApprovals`).
* Manual Approval: Super Admin approves pending requests (`approveRequest`), executing payload actions (`branch_create`, `user_create`, `user_edit`, `user_delete`).
* Rejection: Super Admin rejects pending requests (`rejectRequest`), marking entity status as `rejected` or `disabled`.

## User Roles
* **Admin**: Super Admin views all requests, approves/rejects requests.
* **Owner/Manager**: Submits requests, views own submitted request status.

## Permissions
* Requires authenticated session (`authenticate` middleware).
* Approval/Rejection endpoints (`/approve`, `/reject`) strictly restricted to Super Admin (`role === 'Admin'`).

## File Structure
```
src/modules/approvals/
├── controllers/
│   └── approvalController.js
├── routes/
│   └── approvalRoutes.js
├── services/
│   └── approvalService.js
├── context.md
└── index.js
```

## Routes
* `GET /api/approvals`: List approval queue entries.
* `POST /api/approvals/:id/approve`: Manually approve request.
* `POST /api/approvals/:id/reject`: Reject request.

## Components
* Interfaces with Approval Queue table in Super Admin SPA dashboard.

## Services / Business Logic
* `processPendingAutoApprovals` evaluates `auto_approve_at` timestamp (set to current time + 8 hours on creation).
* Payload execution handles target entity state mutation (`shops` and `users` table updates).

## API / Server Actions
* Standard JSON response formatting via `src/shared/utils/response.js`.

## Database Dependencies
* `approvals`: Approval request records, type, title, status (`pending`, `approved`, `rejected`), JSON payload, timestamps.
* `shops`: Target branch status updates (`active`, `rejected`).
* `users`: Target staff status updates (`active`, `disabled`).

## Shared Dependencies
* `src/shared/middleware/auth.js` (`authenticate`)
* `src/shared/database/init.js` (`db`)

## Module Dependencies
* `shops`: Triggered during non-Superadmin branch creation.
* `users`: Triggered during non-Superadmin user creation, editing, or deletion.
* `notifications`: Logs audit trail via `logAudit`.

## Data Flow
```
GET /api/approvals
  ↓
Trigger `processPendingAutoApprovals()` -> Execute payloads for expired requests (now >= auto_approve_at)
  ↓
Query `approvals` table -> Return list to Super Admin
```

## Important Business Rules
* Only pending requests (`status === 'pending'`) can be approved or rejected.
* Auto-approval duration is 8 hours from creation time.

## Validation Rules
* Requires valid approval request ID.

## Current UI Behaviour
* Displayed under Super Admin Approvals tab.

## Known Limitations
* 8-hour auto-approval timer runs lazily on API invocation.

## Change History
* Modularized into `src/modules/approvals`.

## Future Development Instructions
* When adding a new approval request type, implement payload execution handling in `approvalService.js`.
