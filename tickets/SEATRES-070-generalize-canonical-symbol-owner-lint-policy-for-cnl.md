# SEATRES-070: Generalize canonical-symbol-owner lint policy for CNL

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — CNL lint policy architecture
**Deps**: tickets/SEATRES-069-enforce-no-alias-re-export-boundary-for-seat-diagnostic-suggestion-policy.md

## Problem

Canonical-owner lint checks are currently implemented as one-off tests with duplicated pattern logic per symbol family. This creates maintenance friction and weakens consistency when adding new policy modules that must remain single-source and no-alias.

## Assumption Reassessment (2026-03-03)

1. Repository already uses dedicated lint policy tests for canonical ownership boundaries (for example identifier normalization, seat suggestion policy). **Verified.**
2. Current tests repeat regex scanning and per-symbol conventions inline rather than using a generic canonical-symbol policy helper. **Verified.**
3. No active ticket currently scopes a reusable canonical-symbol-owner lint harness for CNL policy modules. **Verified.**

## Architecture Check

1. A shared canonical-symbol-owner lint helper is cleaner and more extensible than ad hoc regex logic in multiple tests.
2. This remains infrastructure-level policy and keeps game data in GameSpecDoc while preserving game-agnostic GameDef/runtime boundaries.
3. No compatibility shims are introduced; this raises strictness and reduces future alias-path regressions.

## What to Change

### 1. Add shared lint helper for canonical symbol ownership

Create reusable helper(s) under `packages/engine/test/helpers/` to validate:
- canonical owner module path
- allowed import specifier
- prohibited duplicate literals (optional list)
- prohibited non-canonical local definitions
- prohibited non-canonical re-exports and wildcard exports

### 2. Migrate existing policy tests to helper

Refactor existing CNL canonical-boundary lint tests (at least identifier normalization and seat suggestion policy) to use the shared helper.

### 3. Preserve strict no-alias expectations

Ensure migrated tests still enforce no alias/re-export paths and fail with actionable messages.

## Files to Touch

- `packages/engine/test/helpers/lint-policy-helpers.ts` (modify)
- `packages/engine/test/unit/lint/cnl-identifier-normalization-single-source-policy.test.ts` (modify)
- `packages/engine/test/unit/lint/cnl-seat-reference-diagnostic-suggestion-policy.test.ts` (modify)

## Out of Scope

- Runtime/kernel/compiler behavior changes
- Diagnostic message text changes
- Game-specific rule/model additions

## Acceptance Criteria

### Tests That Must Pass

1. Shared helper can express canonical-owner policies for at least two symbol families.
2. Identifier normalization policy test continues to enforce current invariants through shared helper.
3. Seat suggestion policy test enforces no duplicate definitions/import aliases/re-export aliases through shared helper.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Canonical policy modules remain single-source with no alias export/import paths.
2. Architectural lint enforcement remains reusable and low-duplication.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/cnl-identifier-normalization-single-source-policy.test.ts` — migrate to helper-backed assertions. Rationale: keeps existing guard coverage while reducing duplication.
2. `packages/engine/test/unit/lint/cnl-seat-reference-diagnostic-suggestion-policy.test.ts` — migrate/strengthen with helper for no-alias ownership. Rationale: hardens new policy boundary and standardizes approach.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/lint/cnl-identifier-normalization-single-source-policy.test.js packages/engine/dist/test/unit/lint/cnl-seat-reference-diagnostic-suggestion-policy.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`
