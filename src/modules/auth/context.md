# Module: Authentication (`auth`)

## Purpose
The Authentication module handles JWT user sessions, login verification, password updates, and session status validation.

## Current Functionality
* Login (`POST /api/auth/login`): Validates user credentials, checks user status (`status != 'disabled'`), checks Organization status (`status != 'deleted'`), embeds `organization_id` in signed JWT, and returns user profile, organization metadata, and accessible branches.
* Session Authentication (`auth` middleware): Verifies token signature and checks database status of user and organization on EVERY API call. Access is immediately rejected (403 Forbidden) if user or organization `status` is `'disabled'`, `'deleted'`, or `'inactive'`.
* Password Change (`POST /api/auth/change-password`): Updates user password hash.
* Logout (`POST /api/auth/logout`): Clears HTTP-only session cookie.
