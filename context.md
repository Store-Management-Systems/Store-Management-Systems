# Root Context: Store Management Systems (SMS) SaaS ERP

## Purpose
Store Management Systems (SMS) is an Enterprise SaaS ERP platform designed for multi-shop management, inventory control, point-of-sale (POS) billing, party/ledger management, approvals workflow, and financial analytics with granular Role-Based Access Control (RBAC).

## Technology Stack
* **Backend Runtime**: Node.js (v20.x)
* **Web Framework**: Express.js (v4.18.2)
* **Database**: Dual Engine Support
  * Local / On-Prem: SQLite (`better-sqlite3` v9.4.3) with WAL mode
  * Cloud / Production: Neon PostgreSQL (`pg` v8.22.0) with dynamic query translation
* **Security & Optimization**: Helmet, CORS, Express Compression, Cookie Parser, Express Rate Limit, Bcryptjs, JsonWebToken (JWT)
* **Desktop Wrapper**: Electron main process support (`electron/main.js`)
* **Frontend**: HTML5, Vanilla JavaScript, CSS3, Service Worker (PWA capabile)

## Overall Architecture
The system uses a modularized layer-by-domain architecture under `src/`:
* `src/modules/`: Functional domains isolated by business area. Each module manages its own controllers, routes, business logic, public exports, and module-specific `context.md`.
* `src/shared/`: Cross-cutting concerns including database connectivity, global middlewares, and common response utilities.
* `routes/`: Express top-level entry point mounting module public routers onto `/api/*`.

```
d:/fun/
├── context.md                            # Master application context & AI protocol
├── ARCHITECTURE.md                       # Comprehensive architecture report
├── BRANCHING.md                          # Git module-wise branching strategy
├── server.js                             # Express application server
├── db.js                                 # Legacy/direct database connection module
├── index.html                            # Frontend SPA entry page
├── script.js                             # Frontend SPA logic
├── style.css                             # Application styling
├── public/                               # Static distribution files
│
└── src/
    ├── shared/
    │   ├── database/                     # DB wrappers, migrations & SQL schemas
    │   ├── middleware/                   # JWT auth, RBAC, error handling
    │   ├── utils/                        # Standard response formatters
    │   └── index.js                      # Shared exports
    │
    ├── routes/
    │   └── index.js                      # Central API router mounting all module routes
    │
    └── modules/
        ├── auth/                         # Authentication & Token management
        ├── dashboard/                    # System metrics & Overview stats
        ├── organization/                 # Multi-organization administration
        ├── shops/                        # Shop & Branch management
        ├── users/                        # Users, Staff & RBAC Roles
        ├── inventory/                    # Items, Categories, Units & Stock logs
        ├── customers/                    # Customers, Suppliers, People & Ledgers
        ├── billing/                      # POS Bills, Purchases & Payments
        ├── approvals/                    # Inter-shop & Manager approval workflow
        ├── reports/                      # Financial analytics & Business reports
        ├── settings/                     # Shop configurations & Tax settings
        └── notifications/                # In-app notifications & Audit logging
```

## Module Registry

| Module | Location | Context File |
| :--- | :--- | :--- |
| **Authentication** | `/src/modules/auth` | `/src/modules/auth/context.md` |
| **Dashboard** | `/src/modules/dashboard` | `/src/modules/dashboard/context.md` |
| **Organization Management** | `/src/modules/organization` | `/src/modules/organization/context.md` |
| **Shop Management** | `/src/modules/shops` | `/src/modules/shops/context.md` |
| **User & RBAC Management** | `/src/modules/users` | `/src/modules/users/context.md` |
| **Inventory Management** | `/src/modules/inventory` | `/src/modules/inventory/context.md` |
| **Customers & Ledgers** | `/src/modules/customers` | `/src/modules/customers/context.md` |
| **Billing & POS** | `/src/modules/billing` | `/src/modules/billing/context.md` |
| **Approval Workflow** | `/src/modules/approvals` | `/src/modules/approvals/context.md` |
| **Reports & Analytics** | `/src/modules/reports` | `/src/modules/reports/context.md` |
| **Settings** | `/src/modules/settings` | `/src/modules/settings/context.md` |
| **Notifications & Audit** | `/src/modules/notifications` | `/src/modules/notifications/context.md` |

## Authentication & Authorization Architecture
1. **JWT Authentication**: Tokens carry `id`, `username`, `role`, `shop_id`, `organization_id`, and `permissions`.
2. **Context Extraction**: `auth` middleware verifies tokens from headers/cookies and injects `req.user` into every request.
3. **Role-Based Access Control (RBAC)**: `rbac` middleware enforces permission checks against user role/permission array before controller execution.
4. **Data Isolation**: Database queries dynamically filter records by `shop_id` or `organization_id` ensuring tenant isolation.

## Database Architecture
Dual-driver engine:
* Primary local driver: `better-sqlite3` executing synchronous WAL queries.
* Cloud PostgreSQL driver: `pg` pool dynamically translating SQLite `?` parameters to `$1, $2` and `PRAGMA` queries to Information Schema queries.
* Core entities: `organizations`, `shops`, `users`, `roles`, `items`, `categories`, `units`, `customers`, `bills`, `bill_items`, `stock_logs`, `approvals`, `settings`, `notifications`, `audit_logs`.

## Module Dependency Map
```
Authentication (auth)
  ↓
Organization & Shop Management (organization / shops)
  ↓
User Management & RBAC (users)
  ↓
Inventory Management (inventory)
  ├──> Billing & POS (billing)
  └──> Reports & Analytics (reports)
  ↓
Customers & Parties (customers)
  ├──> Billing & POS (billing)
  └──> Reports & Analytics (reports)
  ↓
Approvals & Audit (approvals / notifications)
```

## AI / Antigravity Development Protocol

Before modifying any module:

1. Read the root `/context.md`.
2. Read the target module's `context.md`.
3. Identify dependencies with other modules.
4. Read the `context.md` files of directly affected dependent modules.
5. Inspect the actual implementation before making assumptions.
6. Preserve existing business rules unless the requested change explicitly modifies them.
7. Avoid modifying unrelated modules.
8. After completing a change, update the relevant `context.md`.
9. If architecture, shared behaviour or cross-module dependencies change, update the root `/context.md`.
10. Never treat `context.md` as more authoritative than the actual working implementation when they conflict. Investigate the discrepancy and update the documentation.

## Git & Branching Strategy
Develop each module on isolated branches following standard naming:
* `feature/<module>-*` (e.g. `feature/inventory-stock-adjust`)
* `fix/<module>-*` (e.g. `fix/billing-tax-calc`)
* `refactor/<module>-*` (e.g. `refactor/users-rbac-cache`)
