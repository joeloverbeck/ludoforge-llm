# ENGINEARCH-095: Expand `distributeTokens` Domain-Contract Coverage Across Zone Query Families

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test-surface hardening for compiler domain diagnostics
**Deps**: specs/51-cross-game-primitive-elevation.md

## Problem

`distributeTokens` domain validation is implemented, but test coverage does not yet explicitly lock all valid zone-domain destination query families (`mapSpaces`, `adjacentZones`, `connectedZones`) or nested propagation paths (`nextInOrderByCondition` with zone/token sources). That leaves room for accidental regressions without immediate detection.

## Assumption Reassessment (2026-02-27)

1. Current `compile-effects` tests assert invalid domains (`players`) and mixed `concat` for `tokens`, but do not cover all valid zone-domain destination families.
2. Shared query-domain utility includes recursive propagation semantics; however, `distributeTokens` tests do not currently pin those recursive paths end-to-end.
3. Mismatch: feature exists but coverage is incomplete; corrected scope is targeted contract coverage expansion only.

## Architecture Check

1. Broad, explicit contract coverage is cleaner than relying on implicit behavior because it stabilizes future query-surface evolution.
2. Tests remain game-agnostic and validate generic query-domain contracts, not game-specific content.
3. No backwards-compatibility aliasing/shims introduced.

## What to Change

### 1. Add valid destination-family coverage

Add compile tests proving `distributeTokens.destinations` accepts `zones`, `mapSpaces`, `adjacentZones`, and `connectedZones` as zone-domain queries.

### 2. Add recursive domain-propagation coverage

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
