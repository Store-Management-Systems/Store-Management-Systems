# Root Context: Store Management Systems (SMS) SaaS ERP

## Purpose
Store Management Systems (SMS) is an Enterprise SaaS ERP platform designed for multi-tenant organization management, multi-branch operations, inventory control, point-of-sale (POS) billing, party/ledger management, approvals workflow, and financial analytics with granular Role-Based Access Control (RBAC).

## Final Business Model & Organizational Hierarchy
```
                    ADMIN (Superadmin)
                      │
               Creates/Deletes
                      │
                ORGANIZATION
                      │
               Assigns OWNER
                      │
            ┌─────────┼─────────┐
            ↓         ↓         ↓
         Branch 1  Branch 2  Branch 3 (Shops)
            │         │         │
         Existing operational modules
```

### Hierarchy Breakdown & Role Responsibilities
1. **ADMIN (Superadmin)**:
   - Creates and deletes Organizations.
   - Appoints/assigns Organization Owners (`owner_id`).
   - Configures branch pricing (`price_per_branch`) and inspects subscription details.
   - Admin Dashboard displays: Organizations, Owners, Active Branch Count, Price Per Branch, Current Subscription Amount (`Active Branches × Price Per Branch`), Status, and Expiry Date.

2. **ORGANIZATION**:
   - Corporate tenant entity (`id`, `name`, `code`, `owner_id`, `subscription_plan`, `subscription_status`, `subscription_expiry`, `price_per_branch`, `active_branch_count`, `subscription_amount`, `status`).

3. **OWNER (Organization Owner)**:
   - Belongs to an Organization (`organization_id`).
   - Creates and deletes individual Branches belonging exclusively to their Organization.
   - Owner Dashboard displays: Organization Overview, Active Billable Branch Count, Branch Performance Breakdown, Date Range Filter, and Branch Filter.
   - Manages staff users within their Organization.

4. **BRANCHES / SHOPS**:
   - Each Branch operates independently under its parent Organization (`shop_id = branch_id`, `organization_id`).
   - Managers and Staff execute branch-specific operations (Billing/POS, Inventory, Customers, Ledgers, Reports, Settings).

---

## Subscription Model: Branch-Based Billing
```
Organization Subscription Amount = Number of Active Billable Branches × Configured Price Per Branch
```
* **Billable Branch Definition**: ONLY `status = 'active'` branches count toward the active subscription amount. Deleted or inactive branches are non-billable and do NOT count toward current subscription quantity.
* **Branch Creation Subscription Update**: Creating a new branch increments `active_branch_count` and recalculates total subscription amount.
* **Branch Deletion Subscription Update**: Deleting/deactivating a branch decrements `active_branch_count` and recalculates total subscription amount. Remaining branches operate completely unaffected.
* **Subscription Data Integrity**: Calculated strictly server-side from `shops` table.

---

## Safe Soft-Deletion & Access Revocation Rules

### 1. Organization Deletion (Admin)
- Soft-deletion strategy (`status = 'deleted'`, `subscription_status = 'Cancelled'`).
- CASCADE deactivates all branches belonging to the deleted Organization (`shops.status = 'deleted'`).
- Immediately revokes access for Owner and all branch staff users (`users.status = 'disabled'`).
- Requires explicit Admin confirmation in UI listing all affected branches and typing "DELETE".
- Historical sales, invoices, payments, inventory logs, ledgers, audit logs, and reports remain safely preserved in DB.

### 2. Individual Branch Deletion (Owner / Admin)
- Soft-deletion strategy (`shops.status = 'deleted'`).
- Owner can ONLY delete branches belonging to their own Organization (enforced server-side).
- Disables staff assigned to the deleted branch (`users.status = 'disabled'`).
- Automatically updates parent Organization's billable branch count and subscription quantity.
- Other branches under the Organization continue operating normally.

### 3. Session & API Security
- Session authentication (`auth` middleware and login) verifies Organization and User status on every API call.
- Access is immediately blocked if user or organization `status` is `'disabled'`, `'deleted'`, or `'inactive'`.

---

## Technology Stack
* **Backend Runtime**: Node.js (v20.x)
* **Web Framework**: Express.js (v4.18.2)
* **Database**: Dual Engine Support
  * Local / On-Prem: SQLite (`better-sqlite3` v9.4.3) with WAL mode
  * Cloud / Production: Neon PostgreSQL (`pg` v8.22.0) with dynamic query translation
* **Security & Optimization**: Helmet, CORS, Express Compression, Cookie Parser, Express Rate Limit, Bcryptjs, JsonWebToken (JWT)
* **Desktop Wrapper**: Electron main process support (`electron/main.js`)
* **Frontend**: HTML5, Vanilla JavaScript, CSS3, Service Worker (PWA capable)

---

## Overall Architecture
```
d:/fun/
├── context.md                            # Master application context & AI protocol
├── ARCHITECTURE.md                       # Comprehensive architecture report
├── BRANCHING.md                          # Git module-wise branching strategy
├── server.js                             # Express application server
├── db.js                                 # Direct database connection module
├── index.html                            # Frontend SPA entry page
├── script.js                             # Frontend SPA logic
├── style.css                             # Application styling
├── public/                               # Static distribution files
│
└── src/
    ├── shared/
    ├── routes/
    └── modules/
        ├── auth/                         # Authentication & Token management
        ├── dashboard/                    # Admin, Owner & Branch dashboards
        ├── organization/                 # Organization CRUD, Owner assignment & Subscriptions
        ├── shops/                        # Branch/Shop management
        ├── users/                        # Users, Staff & RBAC Roles
        ├── inventory/                    # Items, Categories, Units & Stock logs
        ├── customers/                    # Customers, Suppliers, People & Ledgers
        ├── billing/                      # POS Bills, Purchases & Payments
        ├── approvals/                    # Inter-shop & Manager approval workflow
        ├── reports/                      # Financial analytics & Business reports
        ├── settings/                     # Shop configurations & Tax settings
        └── notifications/                # In-app notifications & Audit logging
```

---

## AI / Antigravity Development Protocol
1. Read `/context.md` and module `context.md` before making changes.
2. Maintain data isolation and branch-based subscription integrity.
3. Preserve existing business rules and historical records during soft-deletions.
4. Verify all changes through automated build, backend, authorization, and subscription tests.
