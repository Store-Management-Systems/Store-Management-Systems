# Module: Authentication (`auth`)

## Purpose
The Authentication module handles JWT user sessions, login verification, password updates, and session metadata injection (`organization_id`, `role`, `permissions`, `branches`).

## Current Functionality
* Login (`POST /api/auth/login`): Validates user credentials, checks status (`active`), embeds `organization_id` in signed JWT, and returns user profile, organization metadata, and accessible branches.
* Session Check (`GET /api/auth/me`): Verifies JWT session, returns active user details, organization information, and owned branches.
* Password Change (`POST /api/auth/change-password`): Updates user password hash.
* Logout (`POST /api/auth/logout`): Clears HTTP-only session cookie.

## User Roles & Payload
* Payload includes `id`, `name`, `username`, `role`, `shop_id`, `organization_id`, and `permissions`.
* Owner sessions include organization details (`subscription_plan`, `subscription_status`, `subscription_expiry`) and accessible branches.
