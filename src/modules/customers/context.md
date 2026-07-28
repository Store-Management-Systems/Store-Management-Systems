# Module: Customers & Ledgers (`customers`)

## Purpose
The Customers & Ledgers module manages B2C retail customer profiles, unified B2B/B2C party and supplier directories (`people`), opening balance accounting, and ledger statement exports (Excel & PDF).

## Current Functionality
* Customer CRUD: Legacy retail customer profiles (`customers` table).
* Unified People Directory: B2C Customers, B2B Parties, and Suppliers stored in `people` with automatic calculation of total sales, total purchases, payments, and live due balance.
* Opening Balance Entry: Auto-generates initial opening balance ledger transactions upon entity creation.
* Party Account Statement / Ledger: Chronological transaction listing with real-time running balance calculation.
* Ledger Exports: Exporting account statements to Excel (`.xlsx` via ExcelJS) and PDF (`.pdf` via PDFKit).

## User Roles
* **Admin, Owner, Manager, Staff** (Subject to `Customers` and `Parties` permissions).

## Permissions
* Requires `Customers` permission in `checkPermission('Customers')`.

## File Structure
```
src/modules/customers/
├── controllers/
│   ├── customerController.js
│   ├── peopleController.js
│   └── ledgerController.js
├── routes/
│   ├── customerRoutes.js
│   ├── peopleRoutes.js
│   └── ledgerRoutes.js
├── context.md
└── index.js
```

## Routes
* `GET /api/customers`: List retail customers.
* `GET /api/customers/:id`: Customer details.
* `POST /api/customers`: Create customer.
* `PUT /api/customers/:id`: Update customer.
* `DELETE /api/customers/:id`: Delete customer.
* `GET /api/people`: List unified directory (`Customer`, `Party`, `Supplier`).
* `GET /api/people/:id`: Get entity details with calculated due balance.
* `POST /api/people`: Create party/supplier record.
* `PUT /api/people/:id`: Update party/supplier record.
* `DELETE /api/people/:id`: Soft delete party record.
* `GET /api/ledgers/:personId`: Fetch chronological ledger statement.
* `GET /api/ledgers/:personId/export/excel`: Download Excel statement.
* `GET /api/ledgers/:personId/export/pdf`: Download PDF statement.

## Components
* Frontend interfaces in `index.html` ("Parties & Customers" panel, Ledger statement modal, Excel/PDF download buttons).

## Services / Business Logic
* Mobile number MUST be 10 numeric digits and unique per category within a shop.
* Debit/Credit rules:
  * For Suppliers: Credit increases Payable, Debit decreases Payable.
  * For B2B Parties/Customers: Debit increases Receivable, Credit decreases Receivable.

## API / Server Actions
* Uses Standard JSON formatting via `src/shared/utils/response.js`, binary response for Excel and PDF downloads.

## Database Dependencies
* `customers`: B2C retail customers table.
* `people`: Master party/supplier entity table.
* `ledgers`: Account statement ledger entries.
* `bills`: Linked sales transactions for receivable calculation.
* `purchases`: Linked purchase orders for payable calculation.
* `payments`: Linked payment collections/outflows.

## Shared Dependencies
* `src/shared/middleware/auth.js` (`authenticate`)
* `src/shared/middleware/rbac.js` (`checkPermission`)
* `src/shared/database/init.js` (`db`)

## Module Dependencies
* `billing`: Consumes customer and party records during POS checkout and B2B purchases.
* `reports`: Integrates party due balances into financial summaries.

## Data Flow
```
GET /api/ledgers/:personId
  ↓
Query entity from `people` -> Query chronological entries from `ledgers`
  ↓
Iteratively calculate running balance according to Supplier vs Party rules -> Return JSON statement
```

## Important Business Rules
* Opening balance MUST NOT be silently ignored; it MUST create an opening balance entry in `ledgers`.
* Soft-deleted people (`status = 'Deleted'`) MUST be excluded from directory searches.

## Validation Rules
* Name is required.
* Mobile number must be sanitized to 10 digits.

## Current UI Behaviour
* Displayed under "Parties & Customers" section in SPA.

## Known Limitations
* Dual support for `customers` and `people` tables preserved to prevent breaking legacy frontend components.

## Change History
* Consolidated customer, people, and ledger handlers into `src/modules/customers`.

## Future Development Instructions
* When adding new entry types to `ledgers`, update running balance calculations in both `getLedger` and export handlers (`exportLedgerExcel`, `exportLedgerPdf`).
