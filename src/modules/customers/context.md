# Module Context: Customers & Parties (`customers`)

## Module Name
Customers, Suppliers & Party Ledgers (`customers`)

## Purpose
Manages B2C customers, B2B supplier records, credit ledgers, outstanding balances, and payment collections.

## Responsibilities
- Maintain customer and supplier contact profiles.
- Track credit sales and supplier purchases.
- Record payment receipts and ledger settlements.

## Access & Permissions
- **Permitted Roles**: Organization Owner, Branch Manager, Store Staff.
- **Restricted Roles**: Platform Admin (Platform Admin is strictly prohibited from accessing customer/party data).

## Routes & API Endpoints
- `GET /api/people`: List customers & suppliers.
- `POST /api/people`: Add new party.
- `PUT /api/people/:id`: Edit party profile.
- `DELETE /api/people/:id`: Soft-delete record.

## Components & Files Included
- Controller: [src/modules/customers/controllers/customerController.js](file:///d:/fun/src/modules/customers/controllers/customerController.js)
- Frontend Renderer: `script.js` (`renderPeopleSection` function)

## Recent Changes & Changelog

### Version 2.5.0 (2026-07-31)
- **Role Isolation**: Permanently removed Parties & Customers from Platform Admin experience.
