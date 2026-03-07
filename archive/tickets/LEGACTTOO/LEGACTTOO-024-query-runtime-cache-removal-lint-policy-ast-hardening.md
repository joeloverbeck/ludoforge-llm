# LEGACTTOO-024: Query-Runtime-Cache Removal Lint Policy AST Hardening

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — lint/policy guard robustness for legacy module reintroduction prevention
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-020-canonical-token-state-index-for-kernel-lookups.md

## Problem

The new removal policy for `query-runtime-cache` relies on substring scanning and full-file exclusions for policy files. This creates blind spots and can miss reintroduction paths or produce brittle false positives.

## Assumption Reassessment (2026-03-07)

1. Legacy module file `src/kernel/query-runtime-cache.ts` is removed. **Confirmed in current tree.**
2. Main ownership lint guard excludes both policy test files from scanning. **Confirmed in `packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts`.**
3. Key-literal policy guard excludes only itself to avoid self-triggering fixture text. **Confirmed in `packages/engine/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.ts`.**
4. Main ownership guard uses raw string match (`includes('query-runtime-cache')`) instead of AST import/export analysis. **Confirmed in `packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts`.**
5. Shared TypeScript AST utilities already exist in `packages/engine/test/helpers/kernel-source-ast-guard.ts`; this ticket should reuse shared helpers rather than adding duplicate parser logic.

## Architecture Check

1. AST-based import policy checks are cleaner and more robust than raw substring scanning.
2. This is engine-internal architecture governance; no game-specific logic is introduced.
3. No backwards-compatibility aliasing: legacy module specifier usage is hard-failed everywhere.

## What to Change

### 1. Replace substring guard with AST import/export specifier checks

- Parse TypeScript source and detect forbidden module specifiers (`./query-runtime-cache.js`, `query-runtime-cache`, and equivalent relative paths).
- Fail on static module reference forms used by TypeScript source policy (`import`, `export ... from`, and `import = require(...)`).
- Reuse shared AST helper surface (or extend shared lint helpers in one place) instead of duplicating parser traversal in a single test file.

### 2. Remove broad file-level exclusions

- Stop excluding whole policy files from the main ownership guard.
- Keep only narrowly-scoped self-reference exemptions where a policy test intentionally contains forbidden literal text as fixture content.

## Files to Touch

- `packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts` (modify)
- `packages/engine/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.ts` (modify if needed)
- `packages/engine/test/helpers/` (modify/add helper only if shared AST utility reuse is needed)

## Out of Scope

- Runtime behavior changes
- Query/effect semantic changes
- Ticket archival workflow changes

## Acceptance Criteria

### Tests That Must Pass

1. Any reintroduced import/export reference to `query-runtime-cache` fails policy tests.
2. Policy test itself no longer depends on broad file-level exclusion.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Legacy module path is structurally forbidden by guardrails.
2. Architecture policy checks remain deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts` — AST-based forbidden-specifier enforcement.
2. `packages/engine/test/unit/lint/query-runtime-cache-key-literal-ownership-policy.test.ts` — adjust only if helper coupling requires it.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/lint/query-runtime-cache-ownership-policy.test.js`
3. `pnpm -F @ludoforge/engine test:unit`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-07
- What changed:
  - Replaced the legacy query-runtime-cache ownership policy from raw substring scanning to AST-based static module reference checks (`import`, `export ... from`, `import = require(...)`).
  - Removed broad ownership-policy file exclusions; the test now scans all `src` + `test` TypeScript files and only inspects static module specifiers.
  - Added explicit fixture coverage for static edge cases (type-only import, re-export, and import-equals require) to prevent regression.
  - Added shared helper support in `test/helpers/lint-policy-helpers.ts` for collecting static module references with line/kind metadata.
- Deviations from original plan:
  - Instead of implementing AST traversal only inside the ticket test file, the traversal was added to shared lint helpers to avoid duplicated parser logic and to improve extensibility for future policy tests.
  - Equivalent-path coverage is enforced through specifier pattern matching over AST-collected static module specifiers, rather than full path resolution against filesystem layout.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/lint/query-runtime-cache-ownership-policy.test.js` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed (`286/286`).
  - `pnpm -F @ludoforge/engine lint` passed.
