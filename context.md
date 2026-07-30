# Root Context: STORE MANAGEMENT SYSTEMS (Multi-Tenant SaaS POS Platform)

## SaaS Product Definition & Master Architecture
STORE MANAGEMENT SYSTEMS is a multi-tenant SaaS platform providing POS and store-management services to independent Organizations.

```
                     STORE MANAGEMENT SYSTEMS
                                │
                         SaaS Platform
                                │
               ┌────────────────┴────────────────┐
               ↓                                 ↓
        Organization A                    Organization B
               │                                 │
             Owner                             Owner
               │                                 │
          ┌────┼────┐                       ┌────┼────┐
          ↓    ↓    ↓                       ↓         ↓
       Branch Branch Branch               Branch     Branch
         A1    A2    A3                    B1         B2
          │
          ↓
     POS / Store Operations
```

### Hierarchy Breakdown & Role Definitions
1. **PLATFORM ADMIN (Superadmin)**:
   - Administrator of the STORE MANAGEMENT SYSTEMS SaaS platform.
   - Manages Organizations (creates, views, activates, deactivates, soft-deletes).
   - Appoints Organization Owners.
   - Configures global Platform Settings (support info, default SaaS currency, default branch subscription rates, session rules).
   - Inspects SaaS Platform Metrics (Total Organizations, Active Organizations, Total Branches, Active Billable Branches, Active/Expiring Subscriptions).
   - Does NOT engage in branch-level POS operations or view operational widgets.

2. **ORGANIZATION (Customer Tenant)**:
   - Independent customer tenant using Store Management Systems.
   - Logically isolated at database and server authorization level (`organization_id`).

3. **OWNER (Organization Owner)**:
   - Administrator of one Organization.
   - Manages Organization branches, staff accounts, roles & permissions.
   - Views branch-wise sales and aggregated Organization sales.

4. **BRANCH (POS Location)**:
   - Physical/business store location operating POS billing and store services.
   - Operates within `organization_id` and `shop_id` (branch) context.

5. **STAFF / USERS**:
   - Operates within permitted Organization and Branch scope.

---

## Scoped Settings Architecture
STORE MANAGEMENT SYSTEMS enforces strict settings separation across three explicit scopes:

1. **PLATFORM SETTINGS (`platform_settings` table)**:
   - Access: Platform Admin only.
   - Parameters: `platform_name`, `platform_logo`, `support_email`, `support_phone`, `default_currency`, `default_price_per_branch`, `session_timeout_minutes`, `auto_approval_hours`, `system_status`, `version`.
   - Routes: `GET /api/settings/platform`, `PUT /api/settings/platform`.

2. **ORGANIZATION SETTINGS (`organizations` table)**:
   - Access: Organization Owner only.
   - Parameters: Organization Name, Code, Owner Profile (Name, Email, Phone), Subscription Summary, Default Tax settings.
   - Routes: `GET /api/settings/organization`, `PUT /api/settings/organization`.

3. **BRANCH SETTINGS (`settings` & `shops` tables)**:
   - Access: Branch Manager / Staff.
   - Parameters: Branch Name, Address, Phone, GST/FSSAI, Logo, Tax Rate, Low Stock Threshold.
   - Routes: `GET /api/settings/branch`, `PUT /api/settings/branch`.

---

## Server & Database Level Multi-Tenant Data Isolation
- Tenant isolation is strictly enforced on every API request and database query (`SELECT ... WHERE organization_id = req.user.organization_id`).
- Frontend hiding is NOT trusted as security; server-side middleware (`auth`) validates user and tenant active status on every request.
- Cross-organization access (e.g. Owner A requesting Branch B or Sales B) is rejected with `403 Forbidden`.

---

## Subscription Model: Branch-Based Billing
```
Organization Subscription Amount = Active Billable Branches × Configured Branch Subscription Rate
```
- Billable branches: ONLY `status = 'active'` branches count toward subscription quantity.
- Creating a branch increments active branch count and updates total subscription amount.
- Deleting a branch decrements active branch count and updates total subscription amount.
- Historical billing and subscription records are safely retained.

---

## Responsive & Touch Architecture
- Responsive viewports supported: 320px, 360px, 375px, 390px, 414px (Mobile), 768px, 820px, 1024px (Tablet), 1280px, 1366px, 1440px, 1920px (Desktop).
- Touch target standard: minimum 44px height for interactive elements.
- Fluid grid layout: 4 cards per row (Desktop) → 2 cards per row (Tablet) → 1 card stacked (Mobile).
- Zero horizontal viewport scrolling on mobile screens.

---

## AI & Developer Contribution Guidelines
1. Always preserve tenant isolation on all server routes (`organization_id`).
2. Maintain strict separation between Platform Settings, Organization Settings, and Branch Settings.
3. Verify all changes using automated backend tests and responsive UI checks.

---

## Production Infrastructure & Deployment
- **Database Engine**: Neon PostgreSQL (AWS us-east-2)
- **Neon Project Name**: `Store-Management-Systems` (`bold-scene-74981958`)
- **Neon Active Branch**: `production` (`br-ancient-recipe-ay9jsixp`)
- **Neon Endpoint**: `ep-old-waterfall-ay86a9u4` (Active, 0.25 ↔ 2 CU)
- **Database Connection**: `postgresql://neondb_owner:***@ep-old-waterfall-ay86a9u4-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require`
- **Render Outbound IP CIDR Ranges (For IP Whitelisting / Firewall Configuration)**:
  - `74.220.48.0/24`
  - `74.220.56.0/24`

