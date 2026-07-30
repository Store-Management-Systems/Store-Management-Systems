# Module Context: Export Reports (`reports`)

## Module Name
Export Reports & Analytics (`reports`)

## Purpose
Generates downloadable Excel (`.xlsx`) workbooks and PDF (`.pdf`) documents for sales, outstanding balances, restock orders, and stock activity logs.

## Responsibilities
- Export Sales & Billing Reports.
- Export B2B & B2C Outstanding Ledgers.
- Export Inventory Stock Value & Low Stock Alerts.
- Stream file downloads to client browser.

## Access & Permissions
- **Permitted Roles**: Organization Owner, Branch Manager, Store Staff.
- **Restricted Roles**: Platform Admin (Platform Admin header report export button `btnTopReports` has been permanently removed).

## Routes & API Endpoints
- `GET /api/reports/excel`: Download Excel spreadsheet report.
- `GET /api/reports/pdf`: Download PDF document report.

## Components & Files Included
- Controller: [src/modules/reports/controllers/reportController.js](file:///d:/fun/src/modules/reports/controllers/reportController.js)

## Recent Changes & Changelog

### Version 2.5.0 (2026-07-31)
- **Role Isolation**: Removed export reports access button from Platform Admin header interface.
