# LEGACTTOO-024: Query-Runtime-Cache Removal Lint Policy AST Hardening

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — lint/policy guard robustness for legacy module reintroduction prevention
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-020-canonical-token-state-index-for-kernel-lookups.md

## Problem

The new removal policy for `query-runtime-cache` relies on substring scanning and full-file exclusions for policy files. This creates blind spots and can miss reintroduction paths or produce brittle false positives.

## Assumption Reassessment (2026-03-07)

1. Legacy module file `src/kernel/query-runtime-cache.ts` is removed. **Confirmed in current tree.**
2. Current lint guard excludes entire policy test files from scanning. **Confirmed in `packages/engine/test/unit/lint/query-runtime-cache-ownership-policy.test.ts`.**
3. Current guard uses raw string match (`includes('query-runtime-cache')`) instead of AST import analysis. **Confirmed in same file.**

## Architecture Check

1. AST-based import policy checks are cleaner and more robust than raw substring scanning.
2. This is engine-internal architecture governance; no game-specific logic is introduced.
3. No backwards-compatibility aliasing: legacy module specifier usage is hard-failed everywhere.

## What to Change

### 1. Replace substring guard with AST import/export specifier checks

- Parse TypeScript source and detect forbidden module specifiers (`./query-runtime-cache.js`, `query-runtime-cache`, and equivalent relative paths).
- Fail on all static import/export forms.

### 2. Remove broad file-level exclusions

- Stop excluding whole policy files.
- If self-references are unavoidable in policy text, scope exemptions narrowly to exact lines/patterns with explicit rationale.

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
