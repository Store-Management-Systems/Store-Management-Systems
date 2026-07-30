# Module Context: Inventory & Stock (`inventory`)

## Module Name
Inventory & Stock Management (`inventory`)

## Purpose
Manages products, items, categories, measurement units, stock adjustments, low-stock threshold alerts, and supplier restock logs.

## Responsibilities
- Product catalog management (create, edit, delete items).
- Category and unit management.
- Stock adjustments (Stock In / Stock Out).
- Low stock alert threshold monitoring.

## Access & Permissions
- **Permitted Roles**: Organization Owner, Branch Manager, Store Staff.
- **Restricted Roles**: Platform Admin (Platform Admin is strictly prohibited from accessing store inventory).

## Business Rules
1. All items are scoped to `organization_id` and `shop_id`.
2. Stock quantity <= `min_stock` triggers low stock alerts.
3. Item SKU / code must be unique within branch.

## Routes & API Endpoints
- `GET /api/items`: List inventory items.
- `POST /api/items`: Add new product item.
- `PUT /api/items/:id`: Update item details.
- `DELETE /api/items/:id`: Soft-delete product.
- `GET /api/categories`: Fetch categories list.
- `GET /api/units`: Fetch measurement units list.

## Components & Files Included
- Controller: [src/modules/inventory/controllers/inventoryController.js](file:///d:/fun/src/modules/inventory/controllers/inventoryController.js)
- Frontend Renderer: `script.js` (`renderStock` function)

## Recent Changes & Changelog

### Version 2.5.0 (2026-07-31)
- **Role Isolation**: Removed Inventory Stock module from Platform Admin experience.
