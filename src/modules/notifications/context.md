# Module Context: Notifications & Toasts (`notifications`)

## Module Name
System Notifications & Toast Engine (`notifications`)

## Purpose
Provides in-app notification toasts (`showToast`), status alerts, and approval notifications across desktop and mobile screens.

## Responsibilities
- Render floating toast messages (Success, Warning, Info, Error).
- Auto-dismiss toasts after configurable duration (default 4000ms).
- Support single-touch dismissal on mobile viewports.

## Components & Files Included
- Frontend View: `script.js` (`showToast` & `toast` functions)
- Styling: `style.css` (`#toastContainer` & `.toast` classes)

## Recent Changes & Changelog

### Version 2.5.0 (2026-07-31)
- **Glassmorphic Toast Styling**: Updated notification cards with smooth micro-animations and accessibility dismiss controls.
