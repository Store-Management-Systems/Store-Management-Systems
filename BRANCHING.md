# Module-Wise Git Branching Strategy

## Overview
To support parallel development and prevent cross-module merge conflicts, developers and AI agents must follow a module-wise Git branching strategy.

Because each functional domain now lives in its own directory (`src/modules/<module_name>/`), developers working on different features can operate in isolation without affecting unrelated code.

---

## 1. Branch Naming Conventions

### Feature Branches (`feature/<module>-*`)
Use for new features or capabilities within a specific module.
* `feature/inventory-stock-adjustment`
* `feature/billing-discount-coupon`
* `feature/users-2fa-auth`
* `feature/customers-loyalty-points`
* `feature/shops-multi-currency`
* `feature/reports-tax-export`

### Fix Branches (`fix/<module>-*`)
Use for bug fixes targeted at a specific module.
* `fix/inventory-negative-stock`
* `fix/billing-tax-calculation`
* `fix/auth-token-expiration`
* `fix/customers-phone-validation`
* `fix/approvals-auto-timer`

### Refactor Branches (`refactor/<module>-*`)
Use for internal refactoring or performance optimizations within a module.
* `refactor/billing-services`
* `refactor/users-rbac-cache`
* `refactor/reports-sql-aggregation`
* `refactor/shared-db-pool`

---

## 2. Recommended Git Workflow

### Step 1: Create a Module Feature Branch
Always branch off the `develop` or `main` branch:
```bash
git checkout develop
git pull origin develop
git checkout -b feature/inventory-stock-adjustment
```

### Step 2: Develop Within Module Boundaries
* Confine all changes strictly to `src/modules/<module_name>/`.
* If shared infrastructure changes are required (`src/shared/`), coordinate with the team before modifying shared files.
* Ensure any changes are documented in `src/modules/<module_name>/context.md`.

### Step 3: Test Module Changes
Run backend and syntax checks:
```bash
node server.js
```

### Step 4: Update Documentation
* Update `context.md` inside `src/modules/<module_name>/context.md`.
* If cross-module dependencies change, update the root `/context.md`.

### Step 5: Commit and Submit Pull Request
```bash
git add src/modules/inventory/
git commit -m "feat(inventory): add stock adjustment validation rules"
git push origin feature/inventory-stock-adjustment
```

---

## 3. Module Isolation Checklist

Before submitting a Pull Request for a module branch, verify:
- [ ] No files outside `src/modules/<module_name>/` were modified unnecessarily.
- [ ] Imports from other modules use public interfaces (`require('../<module>')`) rather than deep internal paths.
- [ ] Module `context.md` has been updated under `## Change History`.
- [ ] API contract (`/api/<module>/*`) remains backward compatible.
- [ ] `node server.js` executes without runtime errors.
