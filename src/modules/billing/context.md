# Module Context: POS Billing & Sales (`billing`)

## Module Name
POS Billing & Sales Checkout (`billing`)

## Purpose
Executes point-of-sale customer checkouts, generates sales receipts, calculates B2B/B2C taxes, deducts inventory stock, and updates customer ledgers.

## Responsibilities
- Render POS billing cart & item selector canvas.
- Process sales transactions (`POST /api/bills`).
- Deduct purchased quantities from item stock (`items.stock_quantity`).
- Record B2B vs B2C customer transactions and credit/outstanding balances.
- Generate receipt printing views.

## Access & Permissions
- **Permitted Roles**: Organization Owner, Branch Manager, Store Staff, Cashier.
- **Restricted Roles**: Platform Admin (Platform Admin is strictly prohibited from accessing POS Billing).

## Business Rules
1. Every bill is scoped to `organization_id` and `shop_id`.
2. Completing a sale automatically reduces item inventory stock in real time.
3. Credit/unpaid sales update customer ledger outstanding balance.

## Routes & API Endpoints
- `GET /api/bills`: List sales bills for current branch scope.
- `POST /api/bills`: Create new bill transaction.
- `GET /api/bills/:id`: Fetch invoice details.

## Components & Files Included
- Controller: [src/modules/billing/controllers/billingController.js](file:///d:/fun/src/modules/billing/controllers/billingController.js)
- Frontend Renderer: `script.js` (`renderBill` function)

## Recent Changes & Changelog

### Version 2.5.0 (2026-07-31)
- **Role Isolation**: Removed POS billing module from Platform Admin experience. Reserved exclusively for store personnel.
