# Module: Reports & Financial Analytics (`reports`)

## Purpose
The Reports & Financial Analytics module generates business intelligence summaries, top customer/supplier volume rankings, payment collection mode breakdowns, aging breakdown analysis (0-30, 31-60, 61-90, 90+ days), and multi-format file exports (Excel & PDF).

## Current Functionality
* Excel Report Generation: Multi-tab or multi-mode Excel workbook export (`Billing`, `Purchases`, `Outstanding`/`People`, `Inventory`).
* Executive PDF Report Generation: PDF summary generation for executive review.
* Financial Analytics: Top 5 customers by revenue, top 5 suppliers by purchase volume, payment mode collections breakdown, and due aging bucket analysis.

## User Roles
* **Admin, Owner, Manager, Staff** (Subject to `Reports` and `Export Excel` permissions).

## Permissions
* `Reports` (PDF generation & Analytics dashboard access)
* `Export Excel` (Excel spreadsheet generation)

## File Structure
```
src/modules/reports/
├── controllers/
│   ├── reportController.js
│   └── analyticsController.js
├── routes/
│   ├── reportRoutes.js
│   └── analyticsRoutes.js
├── context.md
└── index.js
```

## Routes
* `GET /api/reports/excel`: Download Excel spreadsheet report with `?type=`, `?from=`, `?to=`.
* `GET /api/reports/pdf`: Download PDF summary report with `?type=`.
* `GET /api/analytics`: Fetch financial analytics graphs data (Top customers, top suppliers, collections, aging breakdown).

## Components
* Interfaces with "Financial Analytics" view and Report Download buttons in `index.html`.

## Services / Business Logic
* Excel columns format currency values formatted to 2 decimal places.
* Aging buckets dynamically evaluate account creation date against current outstanding due amounts.

## API / Server Actions
* Returns standard JSON for `/analytics`; streams binary `.xlsx` and `.pdf` streams for report downloads.

## Database Dependencies
* `bills`: Sales volume, revenue per customer, date range sales.
* `purchases`: Supplier purchase volume rankings.
* `payments`: Payment mode collections and outflows.
* `people`: Due amounts and account aging calculation.
* `items`: Inventory valuation records.

## Shared Dependencies
* `src/shared/middleware/auth.js` (`authenticate`)
* `src/shared/middleware/rbac.js` (`checkPermission`)
* `src/shared/database/init.js` (`db`)

## Module Dependencies
* `billing` (Reads sales, purchases, and payment transactions)
* `customers` (Reads party due balances for aging buckets)
* `inventory` (Reads product stock valuation)

## Data Flow
```
GET /api/reports/excel?type=Billing
  ↓
Filter bills by shop_id and date range -> Build ExcelJS Workbook -> Stream .xlsx binary attachment to client
```

## Important Business Rules
* Exported numbers MUST match active database transaction records.
* Cancelled bills MUST be excluded from sales volume calculations.

## Validation Rules
* Date range params (`from`, `to`) must be valid YYYY-MM-DD strings when provided.

## Current UI Behaviour
* Displayed under "Financial Analytics" section in SPA.

## Known Limitations
* Large datasets are limited to 200 records in PDF views for layout optimization.

## Change History
* Consolidated report controller and analytics controller into `src/modules/reports`.

## Future Development Instructions
* When introducing new report types (e.g. Tax GST Return Report), add a dedicated clause in `reportController.js`.
