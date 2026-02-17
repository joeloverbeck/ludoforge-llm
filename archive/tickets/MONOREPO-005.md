# MONOREPO-005: Shared TypeScript Base Configuration

**Status**: ✅ COMPLETED
**Spec**: 35 — Monorepo Restructure & Build System (D4 — base tsconfig only)
**Priority**: P0
**Depends on**: MONOREPO-004
**Blocks**: MONOREPO-006, MONOREPO-007

---

## Objective

Create `tsconfig.base.json` at repo root with shared compiler options extracted from the current `tsconfig.json`. Remove the old root `tsconfig.json` (it is replaced by per-package configs that extend the base). This ticket creates the base only — per-package tsconfigs are in MONOREPO-006 and MONOREPO-007.

---

## Tasks

1. Create `tsconfig.base.json` at repo root with shared compiler options (no `module`/`moduleResolution` — those differ per package):
   ```jsonc
   {
     "compilerOptions": {
       "strict": true,
       "target": "ES2022",
       "declaration": true,
       "declarationMap": true,
       "sourceMap": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true,
       "resolveJsonModule": true,
       "isolatedModules": true,
       "noImplicitReturns": true,
       "noFallthroughCasesInSwitch": true,
       "noUncheckedIndexedAccess": true,
       "exactOptionalPropertyTypes": true
     }
   }
   ```
2. Delete the old root `tsconfig.json` (it was for the single-package layout; per-package configs replace it).

**Note**: `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictPropertyInitialization` from the old config are subsumed by `strict: true` — no loss of strictness.

---

## Files Expected to Touch

| Action | File |
|--------|------|
| Create | `tsconfig.base.json` |
| Delete | `tsconfig.json` |

---

## Out of Scope

- Creating `packages/engine/tsconfig.json` (that's MONOREPO-006).
- Creating `packages/runner/tsconfig.json` (that's MONOREPO-007).
- Modifying any source code or test files.
- Modifying `package.json` files.
- Modifying `eslint.config.js`.

---

## Acceptance Criteria

### Tests that must pass

- N/A — project remains broken until MONOREPO-006 creates the engine's tsconfig. This is a config-only ticket.

### Invariants that must remain true

- `tsconfig.base.json` exists at repo root with all 14 compiler options listed above.
- `tsconfig.base.json` does NOT contain `module`, `moduleResolution`, `outDir`, `rootDir`, `composite`, `jsx`, or `noEmit`.
- Old `tsconfig.json` no longer exists at repo root.
- No source or test files modified.
- Every strict option from the old `tsconfig.json` is preserved in `tsconfig.base.json` (either explicitly or via `strict: true`).

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed vs. original plan**:
  - Created root `tsconfig.base.json` with shared strict compiler options.
  - Removed legacy root `tsconfig.json`.
  - Continued directly into MONOREPO-006/007 so the repository never remained in a broken transitional state.
- **Verification results**:
  - `tsconfig.base.json` contains the expected shared options and no package-specific module settings.
  - Package-specific TS configs now extend the base (`packages/engine/tsconfig.json`, `packages/runner/tsconfig.json`).
