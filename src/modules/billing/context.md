# Module: Billing & POS (`billing`)

## Purpose
The Billing & POS module processes retail sales transactions, split payments (Cash, UPI, Card), partial due clearance, B2B supplier purchase orders, stock decrements/restocking, bill cancellations, and financial invoice generation.

## Current Functionality
* POS Checkout: Sequential bill number generation (`000001`), line item mapping, discounts, taxes, and instant stock deduction.
* Split Payment Support: Multi-mode payment breakdown (e.g. Cash + UPI + Card).
* Credit Limit Enforcement: Validates B2B party credit limits before allowing unpaid/credit sales.
* Bill Payment Clearance: Recording partial or full due clearance against existing credit invoices.
* Bill Cancellation: Invoice cancellation with automated inventory stock restoration and ledger reversal.
* Supplier Purchase Orders: B2B stock replenishment, supplier invoice recording, and inventory stock-in.

## User Roles
* **Admin, Owner, Manager, Staff** (Subject to `Billing` and `Inventory` permissions).

## Permissions
* Requires `Billing` permission for POS sales and bill cancellation.
* Requires `Inventory` permission for recording supplier purchases.

## File Structure
```
src/modules/billing/
├── controllers/
│   ├── billController.js
│   ├── purchaseController.js
│   └── paymentController.js
├── routes/
│   ├── billRoutes.js
│   ├── purchaseRoutes.js
│   └── paymentRoutes.js
├── context.md
└── index.js
```

## Routes
* `GET /api/bills`: Retrieve list of sales bills with date range and status filters.
* `GET /api/bills/stats`: Retrieve summary billing statistics (today's sales, average bill value, due amounts).
* `GET /api/bills/:id`: Retrieve single bill details with line items and cashier metadata.
* `POST /api/bills`: Generate new sales bill (POS checkout).
* `POST /api/bills/:id/payments`: Record due payment against credit bill.
* `POST /api/bills/:id/cancel`: Cancel sales bill and restore inventory.
* `GET /api/purchases`: List B2B purchase orders.
* `GET /api/purchases/:id`: Purchase order details.
* `POST /api/purchases`: Record B2B supplier purchase order & restock inventory.
* `GET /api/payments`: List payments log.
* `POST /api/payments`: Record incoming/outgoing payment.

## Components
* Interfaces with POS terminal, thermal receipt printer module, and Sales History table in `index.html`.

## Services / Business Logic
* Paid amount cannot exceed grand total.
* Item inventory stock is verified before checkout; insufficient stock fails transaction.
* Bill cancellation automatically restores stock quantities and adds `in` records in `stock_logs`.

## API / Server Actions
* Uses Standard JSON formatting via `src/shared/utils/response.js`.

## Database Dependencies
* `bills`: Master sales invoice records.
* `bill_items`: Detailed line items per bill.
* `purchases` & `purchase_items`: B2B inventory purchases.
* `payments`: Transaction payment records.
* `items`: Inventory stock deduction and price verification.
* `ledgers`: Account entries for customer/party/supplier statements.

## Shared Dependencies
* `src/shared/middleware/auth.js` (`authenticate`)
* `src/shared/middleware/rbac.js` (`checkPermission`)
* `src/shared/database/init.js` (`db`)

## Module Dependencies
* `inventory`: Deducts stock on bill creation; restores stock on bill cancellation; increments stock on purchases.
* `customers`: Links transactions to party ledgers and checks credit limits.
* `notifications`: Records audit trail for checkout and bill cancellation events.

## Data Flow
```
POST /api/bills (Checkout)
  ↓
Check item stock & Party credit limit -> Insert `bills` & `bill_items`
  ↓
Decrement stock in `items` -> Log in `stock_logs` -> Post to `ledgers` & `payments` -> Return Bill Payload
```

## Important Business Rules
* Cancelled bills CANNOT be un-cancelled or edited.
* Sequential bill numbers MUST NOT contain gaps within a shop branch.

## Validation Rules
* Minimum 1 line item required per bill.
* Customer phone number must be 10 digits if provided.

## Current UI Behaviour
* Displayed in "POS Billing" tab and thermal print preview.

## Known Limitations
* Draft bill functionality exists in schema but complete draft recovery UI is handled locally on frontend.

## Change History
* Consolidated bill, purchase, and payment controllers into `src/modules/billing`.

## Future Development Instructions
* When adding custom tax rules or GST splits, update calculation logic in `createBill`.
