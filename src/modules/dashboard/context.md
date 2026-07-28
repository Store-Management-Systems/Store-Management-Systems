# Module: Dashboard (`dashboard`)

## Purpose
The Dashboard module delivers SaaS Platform executive metrics for Platform Admin, Organization Overview for Owners, and Operational Branch metrics for Staff.

## Role-Specific Dashboard Views

### 1. PLATFORM ADMIN DASHBOARD (`mode: 'Admin'`)
- **Focus**: SaaS Platform Administration & Tenant Overview
- **Summary Metrics**: Total Organizations, Active Organizations, Inactive Organizations, Total Active Branches, Active Subscriptions, Expiring Subscriptions, Expired Subscriptions.
- **Organization Directory**: Displays Organization Name, Code, Owner Details, Active Billable Branch Count, Price Per Branch, Total Subscription Amount (`Active Branches × Price Per Branch`), Subscription Status, Expiry Date, and Management Actions (View Details, Edit, Delete Organization).
- **Rule**: Operational store widgets (POS billing, low stock alerts for specific branch) are strictly excluded from Platform Admin view.

### 2. OWNER DASHBOARD (`mode: 'Owner'`)
- **Focus**: Organization Overview & Multi-Branch Sales Performance
- **Summary Metrics**: Total Organization Sales, Total Invoices, Active Billable Branch Count, Subscription Amount.
- **Filters**: Date Range Filter (Today, Yesterday, 7 Days, 30 Days, Custom) & Branch Filter Dropdown.
- **Branch Performance Breakdown**: Branch Name, Code, Sales, Bill Count, Status, Switch Branch, Delete Branch.

### 3. BRANCH DASHBOARD (`mode: 'Branch'`)
- **Focus**: Single Branch Operational Metrics (Low Stock, Today's Sales, POS quick actions, Collections, Invoices).
