# Module Context: Central Asset Directory (`assets`)

## Module Name
Central Asset Management (`assets`)

## Purpose
Centralizes all static visual, brand, and media assets in a unified directory structure with strict naming and import conventions to eliminate broken image links.

## Directory Structure

```
d:/fun/assets/
├── backgrounds/              # CSS & canvas background textures
├── fonts/                    # Custom web fonts (if applicable)
├── icons/                    # General UI SVG and PNG icons
├── illustrations/            # Vector empty-state and error graphics
├── images/                   # Product & feature showcase images
└── logos/                    # Platform & organization brand logos
    └── logo.png              # Default STORE MANAGEMENT SYSTEMS Brand Logo
```

## Asset Fallback Chain
1. Uploaded Image Logo (`state.shop.logo` or base64 upload).
2. Custom Text Logo (Text styling configuration).
3. Default Logo (`assets/logos/logo.png`).

## Asset Naming Rules
- Lowercase with hyphens or underscores (e.g. `logo.png`, `hero_bg.png`).
- Relative web path reference: `assets/logos/logo.png`.

## Recent Changes & Changelog

### Version 2.5.0 (2026-07-31)
- **Central Asset Directory Created**: Consolidated static assets into `/assets` subdirectories (`/images`, `/logos`, `/icons`, `/illustrations`, `/backgrounds`).
