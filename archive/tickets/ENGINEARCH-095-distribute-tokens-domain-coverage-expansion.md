# ENGINEARCH-095: Expand `distributeTokens` Domain-Contract Coverage Across Zone Query Families

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test-surface hardening for compiler domain diagnostics
**Deps**: specs/51-cross-game-primitive-elevation.md

## Problem

`distributeTokens` domain validation is implemented, but test coverage does not yet explicitly lock all valid zone-domain destination query families (`mapSpaces`, `adjacentZones`, `connectedZones`) or nested propagation paths (`nextInOrderByCondition` with zone/token sources). That leaves room for accidental regressions without immediate detection.

## Assumption Reassessment (2026-02-27)

1. Verified: current `compile-effects` tests assert invalid domains (`players`) and mixed `concat` for `tokens`, but only cover a `zones` happy path for `distributeTokens.destinations`.
2. Verified discrepancy: recursive domain propagation is implemented in `inferQueryDomainKinds` and already unit-tested in `kernel/query-domain-kinds.test.ts`, but `distributeTokens` tests do not currently pin those recursive paths end-to-end.
3. Corrected scope: this ticket is test-only contract hardening for `distributeTokens` destination-domain validation (no runtime architecture changes expected).

## Architecture Check

1. Broad, explicit contract coverage is cleaner than relying on implicit behavior because it stabilizes future query-surface evolution.
2. Tests remain game-agnostic and validate generic query-domain contracts, not game-specific content.
3. No backwards-compatibility aliasing/shims introduced.

## What to Change

### 1. Add valid destination-family coverage

Add compile tests proving `distributeTokens.destinations` accepts `zones`, `mapSpaces`, `adjacentZones`, and `connectedZones` as zone-domain queries.

### 2. Add recursive domain-propagation coverage in `distributeTokens`

Add compile tests for `nextInOrderByCondition` with zone-domain source (valid destination) and token-domain source (invalid destination).

### 3. Keep error contracts explicit

Assert targeted diagnostics for invalid recursive/mismatched destination domains.

## Files to Touch

- `packages/engine/test/unit/compile-effects.test.ts` (modify)

## Out of Scope

- Any runtime engine behavior changes.
- New query kinds or schema changes.

## Acceptance Criteria

### Tests That Must Pass

1. All valid zone-domain destination query families are accepted by `distributeTokens` without diagnostics.
2. Recursive destination-domain mismatches are rejected with targeted diagnostics.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `distributeTokens.tokens` remains token-domain only; `destinations` remains zone-domain only.
2. Coverage remains deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — acceptance tests for zone-domain destination query families.
2. `packages/engine/test/unit/compile-effects.test.ts` — recursive propagation tests for `nextInOrderByCondition` destination source domains.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- --coverage=false`
2. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion Date**: 2026-02-27
- **What Changed**:
  - Updated assumption reassessment to reflect current code/tests accurately, including the existing recursive domain inference unit coverage and the missing `distributeTokens`-specific coverage.
  - Expanded `distributeTokens` compile-effect tests to cover all supported zone-domain destination query families (`zones`, `mapSpaces`, `adjacentZones`, `connectedZones`).
  - Added recursive propagation coverage for `nextInOrderByCondition` destinations, including a valid zone-domain source case and an invalid token-domain source case with targeted diagnostics.
- **Deviations From Original Plan**:
  - No scope deviation in implementation. Clarified assumptions before implementation to correct nuance about where recursive behavior was already tested.
- **Verification Results**:
  - `pnpm turbo build` ✅
  - `pnpm -F @ludoforge/engine test:unit -- --coverage=false` ✅ (183 passed, 0 failed)
  - `pnpm -F @ludoforge/engine test` ✅ (308 passed, 0 failed)
  - `pnpm -F @ludoforge/engine lint` ✅
