# Module: Dashboard (`dashboard`)

## Purpose
The Dashboard module aggregates real-time high-level business indicators, stock alerts, sales figures, B2B/B2C party balances, today's collections, and recent sales transactions for quick decision-making.

## Current Functionality
* Total active item counts and low-stock alerts (stock <= 5).
* Today's total revenue and overall shop revenue calculation.
* Today's transaction count and 5 most recent bills list.
* Party / B2B supplier payable and receivable balances.
* Today's cash inflow collections and cash outflow payments.

## User Roles
* **Admin, Owner, Manager, Staff** (Subject to `Dashboard` permission).

## Permissions
* Requires `Dashboard` permission in `checkPermission('Dashboard')`.

## File Structure
```
src/modules/dashboard/
├── controllers/
│   └── dashboardController.js
├── routes/
│   └── dashboardRoutes.js
├── context.md
└── index.js
```

## Routes
* `GET /api/dashboard`: Aggregates and returns executive summary metrics for the target shop.

## Components
* Communicates with Dashboard cards and summary widgets in `index.html` and `script.js`.

## Services / Business Logic
* Allows Admin users to view any shop via query parameter `?shop_id=...`; non-Admins strictly view their `active_shop_id`.
* Dynamically calculates net outstanding across B2C customers, B2B parties, and suppliers.

## API / Server Actions
* Uses Standard JSON response via `src/shared/utils/response.js`.

## Database Dependencies
* `items`: Item counts and low stock filters (`stock <= 5`).
* `bills`: Total revenue, today's revenue, recent bill records.
* `people`: Categorized party list for balance calculation.
* `purchases`: B2B supplier purchase totals.
* `payments`: Collections and cash out flows.

## Shared Dependencies
* `src/shared/middleware/auth.js` (`authenticate`)
* `src/shared/middleware/rbac.js` (`checkPermission`)
* `src/shared/database/init.js` (`db`)

## Module Dependencies
* `inventory` (Items & stock thresholds)
* `billing` (Bills & sales totals)
* `customers` (People, parties & suppliers)

## Data Flow
```
GET /api/dashboard
  ↓
Extract target shop_id -> Execute aggregated SQL queries over items, bills, people, purchases, payments
  ↓
Return formatted JSON containing items, revenue, bills, and finance metrics
```

## Important Business Rules
* Low stock threshold is fixed at `<= 5` unless overridden by shop settings.
* Deleted entities (`status = 'deleted'`) MUST be excluded from totals.

## Validation Rules
* Requires valid JWT session and permission check.

## Current UI Behaviour
* Displayed automatically on user login in main dashboard grid.

## Known Limitations
* Iterative `people` balance calculations can be optimized with unified SQL VIEW queries for ultra-large datasets.

## Change History
* Modularized into `src/modules/dashboard`.

## Future Development Instructions
* When adding new entity counters, include them in the `/api/dashboard` response object payload under appropriate widget keys.
