# Module: Authentication (`auth`)

## Purpose
The Authentication module handles JWT user sessions, credential verification, role resolution (Platform Admin, Organization Owner, Branch Staff), session status validation, and safe endpoint redirects.

## Root Cause & Architecture Analysis
- **Root Cause of Login Issues**: Static web hosting (such as GitHub Pages or standalone file system protocol `file://`) serving frontend static files without a local backend on the same origin was causing relative `/api/auth/login` requests to route to GitHub Pages static 404 paths or fail CORS resolution.
- **Fix Applied**: 
  - Dynamic `API_URL` determination automatically targets the active backend API (`http://localhost:3000/api` or `window.SMS_API_URL`).
  - `GET /api/auth/login` route auto-redirects (HTTP 302) browser navigation attempts to the main application homepage (`/`).
  - Login error handling prevents premature `handleUnauthorized` invocation while submitting invalid credentials.

## Scoped Login Flows by Role

### 1. PLATFORM ADMIN (`role === 'Admin'`)
```
Admin Login Credentials
          ↓
Authentication Successful
          ↓
Role = Platform Admin ('Admin')
          ↓
Skip Organization/Branch Requirement (org_id = null)
          ↓
Admin Dashboard
```
- **Organization & Branch Rule**: Platform Admin operates at SaaS platform level and does NOT require `organization_id` or `branch_id` to authenticate or access the Admin Dashboard.
- **Middleware Rule**: `auth` middleware skips tenant status checks for `Admin` user tokens.

### 2. ORGANIZATION OWNER (`role === 'Owner'`)
```
Owner Credentials
          ↓
Authentication Successful
          ↓
Role = Organization Owner ('Owner')
          ↓
Resolve organization_id
          ↓
Validate Organization Status (!= 'deleted' && != 'inactive')
          ↓
Owner Dashboard
```
- **Organization & Branch Rule**: `organization_id` is REQUIRED. `branch_id` is NOT required for accessing the Owner Dashboard. Owners manage multiple branches.

### 3. BRANCH USER / STAFF (`role === 'Staff' | 'Manager'`)
```
Staff Credentials
          ↓
Authentication Successful
          ↓
Role = Staff / Manager
          ↓
Resolve organization_id & active_shop_id
          ↓
Validate Account & Organization Active Status
          ↓
Branch Dashboard / POS Operations
```
- **Organization & Branch Rule**: Both `organization_id` and authorized `shop_id` are required for branch-level operational tasks.

---

## API Endpoints
- `POST /api/auth/login`: Credential authentication returning signed JWT token and user profile.
- `GET /api/auth/login`: Automatic HTTP 302 redirect to `/` (Homepage UI).
- `GET /api/auth/me`: Session validation returning current user profile, branches, and permissions.
- `POST /api/auth/change-password`: Current password verification and bcrypt hash update.
- `POST /api/auth/logout`: Clears authentication cookie.
