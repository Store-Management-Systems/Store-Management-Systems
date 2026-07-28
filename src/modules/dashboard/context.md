# Module: Dashboard (`dashboard`)

## Purpose
The Dashboard module delivers tailored real-time executive and operational views depending on the user's role in the organizational hierarchy: Superadmin Overview, Owner Organization & Branch-wise Performance, and Branch Staff Operational Metrics.

## Role-Specific Dashboard Modes

### 1. ADMIN DASHBOARD (`mode: 'Admin'`)
Focuses on Organization & Subscription Management:
* Metrics Cards: Total Organizations, Active Organizations, Inactive Organizations, Expiring Subscriptions, Expired Subscriptions.
* Organization Directory Table: Displays Organization Name, Code, Owner Name & Username, Branch Count, Subscription Plan, Subscription Status, Subscription Expiry Date, Status, and Action buttons (Edit / Assign Owner).

### 2. OWNER DASHBOARD (`mode: 'Owner'`)
Focuses on Organization Sales Overview & Branch Performance:
* Organization Header: Displays Organization Name, Subscription Plan, and Active Status.
* Total Organization Sales Card: Aggregated sales across all branches belonging exclusively to the Owner's Organization.
* Date Range Filter: Supports `all`, `today`, `yesterday`, `7days`, `30days`, and custom date ranges.
* Branch Filter Dropdown: Filter performance by "All Branches" or a specific branch belonging to the Organization.
* Branch Performance Table: Branch-wise sales breakdown (Branch Name, Code, Total Sales, Bill Count, Status, and "Switch to Branch" action button).

### 3. BRANCH / STAFF DASHBOARD (`mode: 'Branch'`)
Focuses on single branch operational metrics:
* Low stock warning alerts.
* Total Items & Low Stock counters.
* Today's Collections & Today's Sales.
* Financial Position Overview (Total Receivable, Total Payable, Net Outstanding).
* Retail B2C, B2B Parties, and Suppliers Widget summaries.
* Quick Enterprise Action buttons & Recent Invoices list.

## File Structure
```
src/modules/dashboard/
├── controllers/
│   └── dashboardController.js
├── routes/
│   └── dashboardRoutes.js
├── context.md
└── index.js
```

## Routes
* `GET /api/dashboard`: Fetch role-specific dashboard metrics with optional `?range=` and `?branch_id=` filters.

## Shared Dependencies
* `src/shared/middleware/auth.js` (`authenticate`)
* `src/shared/database/init.js` (`db`)

## Data Isolation Rules
* Owner Dashboard strictly aggregates and filters branches where `organization_id = req.user.organization_id` or `owner_id = req.user.id`. Sales or branch metrics belonging to other organizations are never included.
