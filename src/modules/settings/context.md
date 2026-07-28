# Module: Settings (`settings`)

## Purpose
The Settings module governs multi-tenant SaaS platform configurations, Organization tenant profile defaults, and Branch-specific location operational parameters across three distinct scopes.

## Scoped Settings Architecture

### 1. PLATFORM SETTINGS (`platform_settings` table)
- **Scope**: Platform Admin (Superadmin)
- **Parameters**: `platform_name`, `platform_logo`, `support_email`, `support_phone`, `default_currency`, `default_price_per_branch`, `session_timeout_minutes`, `auto_approval_hours`, `system_status`, `version`.
- **API Endpoints**: `GET /api/settings/platform`, `PUT /api/settings/platform`.
- **Security**: Restricted exclusively to `req.user.role === 'Admin'`.

### 2. ORGANIZATION SETTINGS (`organizations` table)
- **Scope**: Organization Owner
- **Parameters**: Organization Name, Code, Owner Profile (Name, Email, Phone), Subscription Summary, Default Tax rules.
- **API Endpoints**: `GET /api/settings/organization`, `PUT /api/settings/organization`.
- **Security**: Restricted to `req.user.organization_id`.

### 3. BRANCH SETTINGS (`settings` & `shops` tables)
- **Scope**: Branch Manager / Staff
- **Parameters**: Branch Name, Address, Phone, GST/FSSAI, Logo, Currency, Tax Rate, Low Stock Alert Threshold.
- **API Endpoints**: `GET /api/settings/branch`, `PUT /api/settings/branch`.
- **Security**: Scoped to `req.user.active_shop_id`.
