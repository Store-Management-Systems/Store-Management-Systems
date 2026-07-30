# Module Context: Dashboard (`dashboard`)

## Module Name
Dashboard & SaaS Monitoring (`dashboard`)

## Purpose
Renders the role-isolated dashboard analytics and management directory views for **Platform Admin** and **Store Personnel**.

## Responsibilities
- Provide Platform Admin with SaaS-level tenant oversight metrics (Active Orgs, Active Branches, Inactive Orgs, Inactive Branches, Subscriptions Expiring ≤10 Days, Expired Subscriptions).
- Provide Organization Owners and Branch Managers with operational metrics (Total Revenue, Total Bills, Total Items, Low Stock items).
- Handle zero-branch organization states gracefully without crashing or throwing exceptions.

## Platform Admin Dashboard vs Store Dashboard

```
                       GET /api/dashboard
                               │
                ┌──────────────┴──────────────┐
                ↓                             ↓
        role === 'Admin'             role === 'Owner' / 'Staff'
                │                             │
    [Platform SaaS Metrics]        [Branch Operational Metrics]
    - Active Organizations         - Total Sales Revenue
    - Active Branches              - Total Bills Count
    - Expiring Subscriptions       - Inventory Item Count
    - Organization Directory       - Low Stock Thresholds
```

## Intentionally Removed from Platform Admin
The following operational business widgets were **permanently removed** from the Platform Admin dashboard to enforce SaaS administration boundaries:
- ❌ Store Inventory Stock Summary
- ❌ POS Bills & Daily Checkout Counters
- ❌ Customer & Party Ledgers
- ❌ Financial Analytics Charts
- ❌ Audit Logs & Store Activity

*Why?* Platform Admin is responsible for SaaS tenant infrastructure and branch subscriptions, NOT day-to-day store operations.

## Routes & API Endpoints
- `GET /api/dashboard`: Returns mode-specific analytics (`mode: 'Admin'`, `mode: 'Owner'`, or `mode: 'Branch'`).

## Components & Files Included
- Controller: [src/modules/dashboard/controllers/dashboardController.js](file:///d:/fun/src/modules/dashboard/controllers/dashboardController.js)
- Frontend Renderer: `script.js` (`renderDashboard` function)

## Recent Changes & Changelog

### Version 2.5.0 (2026-07-31)
- **Platform Admin Dashboard Simplification**: Stripped away operational store widgets from Admin view.
- **6 KPI Cards**: Active Orgs, Active Branches, Inactive Orgs, Inactive Branches, Expiring Subscriptions (≤10 days), Expired Subscriptions.
- **Zero-Branch Empty State**: Rendered dedicated empty state card (`No branches created yet`) for 0-branch organizations.
