# Module: Inventory Management (`inventory`)

## Purpose
The Inventory Management module manages the complete product catalog (items, buying/selling prices, categories, units of measure), stock-in/stock-out operations, inventory count adjustments, stock transfer between shop branches, and stock movement logs.

## Current Functionality
* Item Catalog CRUD: Item creation, updates, category filtering, keyword search, soft deletion (`status = 'deleted'`).
* Price Warning Validation: Triggers a warning if selling price is lower than purchase cost.
* Category & Measurement Unit Management: Custom category and unit creation per shop.
* Manual Stock Operations: Stock In (`type = 'in'`), Stock Out (`type = 'out'`), Stock Adjustments (`type = 'in'/'out'`), and Stock Transfer between shop branches.
* Audit & Movement Logging: Comprehensive `stock_logs` recording quantity changes, reasons, and responsible users.

## User Roles
* **Admin, Owner, Manager, Staff** (Subject to `Inventory`, `Create Item`, `Edit Item`, `Delete Item`, `Stock In`, `Stock Out`, `Categories`, `Units`, `History` permissions).

## Permissions
* `Inventory` (Read inventory list, stock adjustments)
* `Create Item`, `Edit Item`, `Delete Item`
* `Stock In`, `Stock Out`
* `Categories`, `Units`
* `History` (Stock movement logs)

## File Structure
```
src/modules/inventory/
├── controllers/
│   ├── itemController.js
│   ├── categoryController.js
│   ├── unitController.js
│   └── stockController.js
├── routes/
│   ├── itemRoutes.js
│   ├── categoryRoutes.js
│   ├── unitRoutes.js
│   └── stockRoutes.js
├── context.md
└── index.js
```

## Routes
* `GET /api/items`: List shop items with optional `?search=` and `?category=`.
* `GET /api/items/:id`: Item details.
* `POST /api/items`: Add new product item.
* `PUT /api/items/:id`: Update item details.
* `DELETE /api/items/:id`: Soft delete item.
* `GET /api/categories`: List categories.
* `POST /api/categories`: Add category.
* `PUT /api/categories/:id`: Edit category.
* `DELETE /api/categories/:id`: Delete category.
* `GET /api/units`: List measurement units.
* `POST /api/units`: Add measurement unit.
* `PUT /api/units/:id`: Edit unit.
* `DELETE /api/units/:id`: Delete unit.
* `POST /api/stock/in`: Add stock.
* `POST /api/stock/out`: Remove stock.
* `POST /api/stock/adjust`: Adjust inventory stock count.
* `POST /api/stock/transfer`: Transfer stock between shop branches.
* `GET /api/stock/logs`: Audit trail of stock movement.

## Components
* Frontend interfaces in `index.html` (Inventory grid, Stock In/Out modals, Category/Unit dialogs).

## Services / Business Logic
* Item names MUST be unique per shop.
* Stock transfer checks source branch stock availability before transferring; creates item in target branch if absent.

## API / Server Actions
* Standard JSON formatting via `src/shared/utils/response.js`.

## Database Dependencies
* `items`: Product catalog & stock counts (`stock`, `qty`).
* `categories`: Shop category tags.
* `units`: Measurement unit names.
* `stock_logs`: Stock movement history.

## Shared Dependencies
* `src/shared/middleware/auth.js` (`authenticate`)
* `src/shared/middleware/rbac.js` (`checkPermission`)
* `src/shared/database/init.js` (`db`)

## Module Dependencies
* `billing`: Direct consumer of items catalog and stock decrements.
* `notifications`: Records stock operation audit trails.

## Data Flow
```
POST /api/stock/transfer
  ↓
Check item availability & stock level in Source Shop -> Deduct stock from Source Shop
  ↓
Find/Create item in Target Shop -> Increment stock in Target Shop -> Log Audit Event
```

## Important Business Rules
* Negative stock transfers MUST be blocked.
* Soft-deleted items (`status = 'deleted'`) MUST NOT be listed in POS billing searches.

## Validation Rules
* Item name is mandatory.
* Quantities must be positive numbers.

## Current UI Behaviour
* Displayed under "Inventory Stock" section in SPA.

## Known Limitations
* Dual column representation (`stock` and `qty`, `selling_price` and `price`) maintained for backward schema compatibility.

## Change History
* Consolidated items, categories, units, and stock handlers into `src/modules/inventory`.

## Future Development Instructions
* When updating stock columns, ensure both `stock` and `qty` fields are updated simultaneously.
