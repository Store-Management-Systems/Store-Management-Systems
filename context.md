# Root Context: STORE MANAGEMENT SYSTEMS (Multi-Tenant SaaS POS Platform)

## Application Overview
- **Application Name**: STORE MANAGEMENT SYSTEMS
- **Application Type**: Multi-Tenant SaaS POS & Store Management Platform
- **Current Version**: 2.5.0
- **Deployment Platform**: Render (`https://store-management-systems.onrender.com`)
- **Database Backend**: Dual Engine (Neon PostgreSQL for Cloud Production; Local SQLite `database.db` for Offline/Local Dev)

---

## SaaS Platform Hierarchy & Role Definitions

```
                     STORE MANAGEMENT SYSTEMS (SaaS Platform)
                                       │
                ┌──────────────────────┴──────────────────────┐
                ↓                                             ↓
       Organization Tenant A                         Organization Tenant B
         (Code: ORG_A)                                 (Code: ORG_B)
                │                                             │
      Organization Owner A                          Organization Owner B
                │                                             │
      ┌─────────┴─────────┐                         ┌─────────┴─────────┐
      ↓                   ↓                         ↓                   ↓
  Branch A1           Branch A2                 Branch B1           Branch B2
  (Shop A1)           (Shop A2)                 (Shop B1)           (Shop B2)
      │                   │                         │                   │
  Manager/Staff       Manager/Staff             Manager/Staff       Manager/Staff
```

### Role Hierarchy & Responsibilities
1. **PLATFORM ADMIN (Superadmin)**:
   - **Scope**: Platform-wide SaaS Administration only.
   - **Responsibilities**: Creates, inspects, activates, deactivates, and soft-deletes Organizations & Branches; appoints Organization Owners; configures Platform Settings (support info, default pricing per branch, session timeouts); manages request approvals.
   - **Restrictions**: Strictly prohibited from viewing or accessing store-level operational modules (Inventory, POS Billing, Customer Ledgers, Store Sales Analytics, Audit Logs).

2. **ORGANIZATION OWNER**:
   - **Scope**: Entire Organization (`organization_id`).
   - **Responsibilities**: Manages organization branches, appoints Branch Managers & Staff, views organization-wide aggregated sales performance, updates Organization branding settings, and manages subscription renewals.

3. **BRANCH MANAGER**:
   - **Scope**: Assigned Branch (`shop_id`) within parent Organization (`organization_id`).
   - **Responsibilities**: Manages branch inventory, stock adjustments, pricing, customer ledgers, and staff operations for that branch location.

4. **STORE STAFF / CASHIER**:
   - **Scope**: Assigned Branch (`shop_id`).
   - **Responsibilities**: Executes POS billing, processes customer checkouts, issues sales receipts, and adds new customer records.

---

## Technology Stack
- **Frontend Architecture**: Vanilla JavaScript (ES6+), HTML5 Semantic Structure, Custom CSS3 Design System with Glassmorphism, CSS Custom Properties & Responsive Flex/Grid Layouts.
- **Service Worker / PWA**: Native Service Worker (`sw.js` v2.1.0) providing offline caching and background asset updates.
- **Backend Architecture**: Node.js & Express.js REST API with Modular Domain Architecture (`/src/modules`).
- **Authentication**: JWT (JSON Web Tokens), `bcryptjs` password hashing, and custom `auth.js` middleware with auto-resolution of organization contexts.
- **Database Engine**:
  - Production: **Neon PostgreSQL** (serverless pooled SQL via `pg`).
  - Local Fallback: **SQLite3** (`database.db` via `sqlite3` adapter).
- **Report Generation**: `exceljs` (Excel `.xlsx` workbooks) & `pdfkit` (PDF document generation).

---

## Folder Structure & Module Registry

```
d:/fun
├── assets/                       # Central Asset Management Directory
│   ├── backgrounds/              # Background patterns & overlays
│   ├── fonts/                    # Web typography assets
│   ├── icons/                    # UI SVG and PNG icon assets
│   ├── illustrations/            # Empty state vector illustrations
│   ├── images/                   # Product & feature demonstration images
│   └── logos/                    # Default platform branding logos
├── controllers/                  # Legacy root controller adapters (delegates to src/modules)
├── database/                     # SQLite database files & backup schemas
├── middleware/                   # Express authentication and error middleware
├── public/                       # Web root for static deployment (synced from root files)
│   ├── index.html                # Web root html template
│   ├── script.html               # Compiled frontend script
│   ├── style.css                 # Application styling
│   └── sw.js                     # Progressive Web App service worker
├── routes/                       # Express API route declarations
├── scratch/                      # Automated test scripts & utility helpers
│   ├── sync_public.js            # Build script syncing root assets to public/
│   ├── test_all_roles_login.js   # Automated multi-role auth test suite
│   └── test_deletion_subscription.js # Automated subscription & cascade deletion test suite
├── src/                          # Modular Source Code Directory
│   ├── modules/                  # Feature Modules
│   │   ├── approvals/            # Approval requests & superadmin audit log
│   │   ├── auth/                 # Authentication, JWT login & password management
│   │   ├── billing/              # POS checkout, sales invoices, transactions
│   │   ├── customers/            # Customers, Suppliers, Party ledgers
│   │   ├── dashboard/            # Platform Admin & Store dashboard renderers
│   │   ├── inventory/            # Items, Stock movements, Categories, Units
│   │   ├── notifications/        # System notifications & alerts
│   │   ├── organization/         # Organization tenant management & lifecycle
│   │   ├── reports/              # Excel & PDF export services
│   │   ├── settings/             # Scoped Platform, Organization & Branch settings
│   │   ├── shops/                # Branch management & location directory
│   │   └── users/                # Staff user management & permissions
│   ├── routes/                   # Centralized API routing registry
│   └── shared/                   # Shared database adapters, middleware & utilities
├── index.html                    # Single Page Application HTML canvas
├── script.js                     # Primary Frontend SPA Logic Controller (270KB)
├── server.js                     # Node.js Express Application Server Entry Point
├── style.css                     # Primary Design System & UI Stylesheet
└── context.md                    # THIS FILE — Master System Documentation
```

---

## Authentication & Authorization Flow

```
[Client Login Request] ──> POST /api/auth/login
                                │
                                ↓
                 [Authenticate Credentials & Hash]
                                │
                                ↓
                 [Query User Record & Organization]
                                │
                                ↓
                 [Auto-Repair Missing organization_id]
                                │
                                ↓
             [Fetch Billable Active Branches (ownedShops)]
                                │
                                ↓
                 [Generate Signed JWT Payload]
                                │
                                ↓
      { user: { id, role, organization_id, branches: [...] }, token }
```

### Authorization Middleware Rules (`src/shared/middleware/auth.js`)
1. Decodes JWT and validates expiration.
2. Queries database to verify user record is active (`status = 'active'`).
3. Re-verifies role against live database state.
4. Enforces strict tenant scope (`organization_id = req.user.organization_id`).

---

## Multi-Tenant Organization & Branch Isolation
- **Database Partitioning**: Every record in tenant-specific tables (`shops`, `items`, `bills`, `people`, `transactions`) contains `organization_id` and `shop_id`.
- **Query Scoping**: Server controllers enforce `WHERE organization_id = req.user.organization_id`.
- **Cross-Tenant Security**: Any attempt by a user to modify or view records belonging to another organization yields HTTP `403 Forbidden`.

---

## Subscription Engine & Calculation Rules

```
Total Monthly Subscription = Active Billable Branches × Price Per Branch
```

- **Billable Units**: ONLY branches with `status = 'active'` count toward the monthly bill.
- **Dynamic Recalculation**:
  - Adding an active branch increments active branch count and updates total subscription.
  - Deactivating or deleting a branch decrements active branch count and reduces subscription.
  - Organization deletion soft-deletes all branches and sets active billable count to `0`.
- **Historical Data Retention**: Soft-deleting branches or organizations preserves financial transactions (`bills`, `purchases`, `ledgers`) for audit reporting.

---

## Scoped Settings Architecture

1. **PLATFORM SETTINGS (`platform_settings` table)**:
   - **Access**: Platform Admin only (`GET/PUT /api/settings/platform`).
   - **Parameters**: `support_email`, `support_phone`, `default_currency`, `default_price_per_branch`, `session_timeout_minutes`, `auto_approval_hours`.

2. **ORGANIZATION SETTINGS (`organizations` table)**:
   - **Access**: Organization Owner (`GET/PUT /api/settings/organization`).
   - **Parameters**: Organization Name, Code, Owner Contact Info, Subscription Details.

3. **BRANCH SETTINGS (`settings` & `shops` tables)**:
   - **Access**: Branch Manager / Staff (`GET/PUT /api/settings/branch`).
   - **Parameters**: Branch Name, Address, Phone, GST/FSSAI, Logo, Tax Rate, Low Stock Alert Threshold.

---

## Organization Branding System & Logo Fallback Algorithm

$$\text{Displayed Brand Logo} = \begin{cases} \text{Uploaded Image Logo} & \text{if } \text{logo\_type} = \text{'image'} \land \text{image valid} \\ \text{Custom Text Logo} & \text{if } \text{logo\_type} = \text{'text'} \lor \text{image fails to load} \\ \text{Default Platform Logo (\texttt{assets/logos/logo.png})} & \text{otherwise} \end{cases}$$

- Custom text logos support font weight (400–800), size (16px–28px), letter spacing (0–0.2em), color picker, and text alignment.

---

## Responsive Architecture & Touch Controls
- **Supported Viewports**: 320px, 375px, 390px (Mobile Portrait), 768px, 820px, 1024px (Tablet), 1280px, 1440px, 1920px (Desktop).
- **Mobile Bottom Navigation Bar**: Custom bottom bar (`#bottomNav`) optimized for single-thumb navigation on mobile portrait displays.
- **Grid Layout**: 4 columns (Desktop) → 2 columns (Tablet) → 1 column stacked (Mobile).
- **Touch Target**: Minimum 44px height for interactive buttons and inputs.

---

## Deployment & Production Environment
- **Live Hosted Application**: `https://store-management-systems.onrender.com`
- **Database Host**: Neon PostgreSQL (AWS `us-east-2`, Project `Store-Management-Systems`).
- **Build Sync Command**: `node scratch/sync_public.js` (Syncs root static assets to `public/` web root before deployment).

---

## Mandatory Future Development Protocol

Every future development task MUST follow this workflow:

1. Read root `context.md`.
2. Read affected module `context.md` files.
3. Analyse dependencies and existing architecture.
4. Make minimum required code changes without altering working business logic.
5. Preserve unrelated functionality and role isolation.
6. Update affected module `context.md` files.
7. Update root `context.md` if platform architecture changes.
8. Execute automated regression tests (`node scratch/test_all_roles_login.js` and `node scratch/test_deletion_subscription.js`).
9. Deploy only after 100% test pass confirmation.

---

## Change Log

### Version 2.5.0 (2026-07-31)
- **Platform Admin Dashboard Simplification**: Permanently removed operational widgets and modules (Inventory, Billing, Analytics, Audit History, Reports Export) from Platform Admin experience.
- **SaaS Dedicated Navigation**: Refactored Platform Admin navigation to focus exclusively on SaaS Administration (Organizations, Branches, Subscriptions, Approvals, Settings, About).
- **Root Cause Fix for Organization Login**: Resolved `Cannot read properties of null (reading 'branches')` error by adding auto-repair of `organization_id` in `authController.js` and `auth.js` middleware.
- **Zero-Branch Empty State**: Added clear UI empty state card for 0-branch organizations with a single-click `➕ Create Branch` button.
- **Central Asset Management**: Created `/assets` directory structure (`/images`, `/logos`, `/icons`, `/illustrations`, `/backgrounds`) with fallback identity system.
- **Automated Regression Suite**: Created `scratch/test_all_roles_login.js` and `scratch/test_deletion_subscription.js`.
