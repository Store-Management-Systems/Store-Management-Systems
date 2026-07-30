# Module Context: Scoped Settings & Branding (`settings`)

## Module Name
Scoped Settings & Brand Identity System (`settings`)

## Purpose
Manages system configuration across three distinct scopes: **Platform Settings**, **Organization Settings**, and **Branch Settings**, and provides live previews for custom brand identities.

## Responsibilities
- **Platform Settings**: Global SaaS parameters (support email, phone, default currency, session timeout, branch subscription rates).
- **Organization Settings**: Organization profile, owner details, tax defaults, and branding identity (Uploaded Image Logo vs Custom Text Logo).
- **Branch Settings**: Store branch contact information, GST/FSSAI numbers, tax rates, and low stock threshold alerts.

## Scoped Architecture Breakdown

```
                             SETTINGS ARCHITECTURE
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ↓                              ↓                              ↓
 PLATFORM SETTINGS            ORGANIZATION SETTINGS            BRANCH SETTINGS
(`platform_settings`)           (`organizations`)            (`settings`/`shops`)
 - Support Contact             - Tenant Name & Code           - Branch Address
 - Default Currency            - Owner Profile                - GST / FSSAI No.
 - Branch Sub Price            - Brand Identity Config        - Local Tax Rate
 - Session Timeout             - Default Tax Defaults         - Min Stock Threshold
 (Platform Admin Only)         (Organization Owner Only)      (Store Personnel)
```

## Branding Fallback Algorithm
```
1. Uploaded Image Logo (if logo_type = 'image' and image valid)
2. Custom Text Logo (if logo_type = 'text' with font weight, size, letter-spacing, color)
3. Default Logo (assets/logos/logo.png)
```

## Routes & API Endpoints
- `GET /api/settings/platform`: Fetch Platform Settings (Admin only).
- `PUT /api/settings/platform`: Update Platform Settings (Admin only).
- `GET /api/settings/organization`: Fetch Organization Settings (Owner only).
- `PUT /api/settings/organization`: Update Organization Settings & Branding (Owner only).
- `GET /api/settings`: Fetch Branch Settings.
- `PUT /api/settings`: Update Branch Settings.

## Components & Files Included
- Controller: [src/modules/settings/controllers/settingController.js](file:///d:/fun/src/modules/settings/controllers/settingController.js)
- Frontend Renderer: `script.js` (`renderSettings` & `renderOrgBrandElement` functions)

## Recent Changes & Changelog

### Version 2.5.0 (2026-07-31)
- **Organization Branding System**: Added custom text logo styling controls and image upload with real-time live preview canvas.
- **Scoped Division**: Enforced strict parameter separation between Platform Admin, Organization Owner, and Branch Manager settings.
