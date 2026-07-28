# Module: Dashboard (`dashboard`)

## Purpose
The Dashboard module delivers real-time executive and operational views depending on the user's role: Superadmin Branch-Based Subscription Overview, Owner Organization Overview & Branch Sales, and Branch Staff Operational Metrics.

## Role-Specific Dashboard Views

### 1. ADMIN DASHBOARD (`mode: 'Admin'`)
Focuses on Organization, Subscription & Tenant Management:
* Metrics Cards: Total Organizations, Active Organizations, Inactive Organizations, Expiring Subscriptions, Expired Subscriptions.
* Organization Directory Table: Displays Organization Name, Code, Owner Name & Username, Active Branch Count, Price Per Branch, Calculated Subscription Amount (`Active Branches × Price Per Branch`), Subscription Plan, Status, Expiry Date, and Action buttons (Details, Edit, Delete Organization).

### 2. OWNER DASHBOARD (`mode: 'Owner'`)
Focuses on Organization Overview & Branch Performance:
* Organization Header: Displays Organization Name, Plan Name, Status, and Active Subscription calculation (`Active Branches × Price Per Branch = Total Subscription`).
* Summary Cards: Total Organization Sales, Total Invoices, Active Billable Branch Count, Subscription Amount.
* Date Range Filter: Supports `all`, `today`, `yesterday`, `7days`, `30days`, and custom date ranges.
* Branch Filter Dropdown: Filter performance by "All Branches" or a specific branch.
* Branch Performance Table: Branch-wise sales breakdown (Branch Name, Code, Total Sales, Bill Count, Status, Switch Branch, and Delete Branch).

### 3. BRANCH / STAFF DASHBOARD (`mode: 'Branch'`)
Focuses on single branch operational metrics (Low Stock, Today's Collections, Today's Sales, Financial Position Overview, People Widgets, Quick Actions, Recent Invoices).
