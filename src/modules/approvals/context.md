# Module Context: Approvals & Audit (`approvals`)

## Module Name
Pending Approvals & Superadmin Audit Logs (`approvals`)

## Purpose
Provides an approval request pipeline where sensitive store requests submitted by branch personnel appear for Superadmin review, with automatic 8-hour approval rules.

## Responsibilities
- Record request submissions (`action_type`, `requested_by`, `shop_id`).
- Display pending, approved, and rejected request lists to Platform Admin.
- Execute auto-approval policy: Requests automatically approve after 8 hours if no manual action is taken.
- Provide Topbar Header badge alert (`🛡 Approvals`) indicating pending request count for Platform Admin.

## Routes & API Endpoints
- `GET /api/approvals`: List approval requests.
- `POST /api/approvals/:id/approve`: Approve request.
- `POST /api/approvals/:id/reject`: Decline request.

## Components & Files Included
- Controller: [src/modules/approvals/controllers/approvalController.js](file:///d:/fun/src/modules/approvals/controllers/approvalController.js)
- Frontend View: `script.js` (`openApprovalsModal` and `renderAdminApprovalsSection`)

## Recent Changes & Changelog

### Version 2.5.0 (2026-07-31)
- **Superadmin Topbar Badge**: Displayed `🛡 Approvals (Count)` badge on top bar header for Platform Admin.
- **Dedicated Full Section**: Added `renderAdminApprovalsSection` for canvas view.
