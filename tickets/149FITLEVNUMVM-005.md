# 149FITLEVNUMVM-005: EncodedState typed-array view builder

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/encoded-state/view.ts`
**Deps**: `tickets/149FITLEVNUMVM-004.md`

## Problem

Phase 1 of spec 149 needs a typed-array view of authoritative `GameState` derived through the `EncodedStateLayout` from ticket 004. This view (`EncodedState` per spec §2.2) is read-only outside the preview drive and is consumed by hot read paths in policy evaluation (ticket 006) and the bytecode VM (ticket 015).

## Assumption Reassessment (2026-04-28)

1. `GameState` is defined in `packages/engine/src/kernel/types.ts` and exposes `tokens`, `zones`, `markers`, `playerInts`, `globals`, and the canonical hash machinery.
2. `EncodedStateLayout` from ticket 004 provides the shape descriptors needed to size the typed arrays.
3. Spec §2.2 specifies the typed-array shapes: `tokenZone: Int16Array`, `tokenFlags: BigUint64Array`, `zoneOccupancy: Int16Array` (denormalized), `playerInts: Int32Array`, `zoneMarkers: BigUint64Array`, `globals: Int32Array`.
4. Multi-occurrence tokens require a sentinel + occurrence-list pointer per spec §5 edge cases — mirrors the invariant `MutableTokenStateIndex` enforces in `packages/engine/src/kernel/token-state-index.ts`.

## Architecture Check

1. The view is fully derived from `GameState` + `EncodedStateLayout`; no rule-authoritative data lives in the encoded view. F2 (Evolution-First) preserved — encoded view is implementation, GameSpecDoc remains source of truth.
2. View is read-only outside the preview drive. F11 (Immutability) preserved at this ticket's scope; mutation comes in ticket 008 under F11's scoped-mutation exception.
3. F4 (Authoritative State and Observer Views) preserved: encoded view never crosses an observer boundary; agents are omniscient by design.
4. No game-specific branches.

## What to Change

### 1. `packages/engine/src/kernel/encoded-state/view.ts` (new)

Export:
- `interface EncodedState` matching spec §2.2 (typed-array fields).
- `function buildEncodedState(state: GameState, layout: EncodedStateLayout): EncodedState` — pure function building the view.

Implementation notes:
- Allocate typed arrays of the correct sizes from `layout.zoneIds.length`, `layout.tokenIds.length`, etc.
- For multi-occurrence tokens, store the canonical (lowest zone-rank) zone in `tokenZone[i]` and a sentinel + occurrence-list pointer (mirror `MutableTokenStateIndex` semantics).
- Use `SENTINEL_NONE` (export this constant) for "absent" zones/players.
- Bitset population for `tokenFlags` and `zoneMarkers` walks the layout's bit positions.

### 2. Update `packages/engine/src/kernel/encoded-state/index.ts`

Re-export `buildEncodedState` and `EncodedState` types alongside ticket 004's exports.

### 3. Round-trip property test

Add a property test verifying `state → encoded → reconstruct → canonical-equal state` for the corpus of FITL replay fixtures.

## Files to Touch

- `packages/engine/src/kernel/encoded-state/view.ts` (new)
- `packages/engine/src/kernel/encoded-state/index.ts` (modify — extend barrel)
- `packages/engine/test/unit/kernel/encoded-state-view.test.ts` (new)
- `packages/engine/test/integration/encoded-state-roundtrip.test.ts` (new)

## Out of Scope

- Wiring into `policy-runtime` read paths (covered by ticket 006).
- Apply/undo machinery (covered by ticket 008).
- Performance gates (covered by ticket 007).

## Acceptance Criteria

### Tests That Must Pass

1. New test: `buildEncodedState` produces a view whose `tokenZone[i]` matches `state.tokens` for single-occurrence tokens.
2. New test: multi-occurrence tokens use the canonical zone + occurrence-list pointer convention.
3. New test: round-trip `state → encoded → reconstruct` produces canonical-equal `state` on FITL replay fixtures.
4. New test: works on both FITL and Texas Hold'em (game-agnostic check).
5. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. No game-specific branches in the view builder.
2. Encoded view is read-only — no mutation methods exposed at this ticket's scope.
3. Canonical hashing is unchanged; no encoded-view-derived hash is exposed.
4. F1, F4, F11 preserved.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/encoded-state-view.test.ts` — view-shape coverage, multi-occurrence, sentinels, both games.
2. `packages/engine/test/integration/encoded-state-roundtrip.test.ts` — round-trip property test on FITL replay corpus.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/encoded-state-view.test.js dist/test/integration/encoded-state-roundtrip.test.js`.
3. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`.
