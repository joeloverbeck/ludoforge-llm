# TEXHOLKERPRIGAMTOU-010: Hand-State Consistency Contracts (Counter vs Per-Player Flags)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-008
**Blocks**: TEXHOLKERPRIGAMTOU-011, TEXHOLKERPRIGAMTOU-012

## Assumption Reassessment (Current Code/Test Reality)

1. `playersInHand` is currently both initialized/reset and directly mutated (`fold` decrements it), while `handActive`/`eliminated`/`allIn` are also used as authorities.
2. Existing Texas tests already cover card/chip conservation, non-negative stacks, determinism, and betting flow (`test/integration/texas-runtime-bootstrap.test.ts`, `test/integration/texas-holdem-hand.test.ts`), but they do not explicitly assert counter-vs-flag sync at each transition.
3. The engine already supports generic aggregation/query primitives needed to derive hand-active counts; this ticket does not require a new kernel primitive.
4. For this ticket, the clean architecture choice is to keep the engine generic and implement the consistency pattern in Texas GameSpec macros/effects (YAML), then prove it via tests.

## Problem

Texas currently allows two authorities for "players remaining in hand" (`playersInHand` and per-player flags), which can diverge on edge paths.

## 1) Updated Scope and Implementation Direction

1. Use a single source-of-truth policy for hand occupancy:
- Per-player flags (`handActive` + `eliminated`) are authoritative.
- `playersInHand` becomes a derived cache synchronized from those flags.
2. Remove direct mutation of `playersInHand` in action effects (for example, do not decrement it in `fold`).
3. Add one reusable Texas macro that synchronizes `playersInHand` from per-player flags and call it at decision/branch boundaries that depend on hand occupancy.
4. Keep this change in Texas YAML/macros only. No kernel/compiler schema changes in this ticket.
5. Extend existing Texas integration suites (instead of creating a separate broad property suite here) to add explicit sync and edge-path regression assertions.

## 2) Invariants that must pass

1. At decision/branch boundaries and after applied actions:
`playersInHand == count(handActive == true && eliminated == false)`.
2. No `eliminated == true` player is counted in `playersInHand`.
3. If `playersInHand <= 1`, uncontested-pot settlement selects exactly one eligible winner.
4. Chip conservation still holds for all transitions: `sum(chipStack) + pot` constant per hand.

## 3) Tests that must pass

1. Add/extend integration assertions that check hand-state consistency across multiple seeds and move policies.
2. Add a focused regression for fold/all-in edge progression where counter drift risk is highest.
3. Existing Texas suites:
- `test/integration/texas-runtime-bootstrap.test.ts`
- `test/integration/texas-holdem-hand.test.ts`
- `test/unit/texas-holdem-spec-structure.test.ts`
4. Full repository quality gates:
- `npm run build`
- `npm run lint`
- `npm test`

## Outcome

- **Completion date**: 2026-02-16
- **What was changed**:
  - Added reusable Texas macro `sync-players-in-hand` that derives `playersInHand` from per-player truth (`handActive && !eliminated`).
  - Removed direct `playersInHand` mutation from `fold`.
  - Wired synchronization at occupancy-sensitive boundaries (`preflop` entry, `betting-round-completion`, `advance-after-betting`, `side-pot-distribution`, and post-`eliminate-busted-players` in `hand-cleanup`).
  - Strengthened Texas test coverage to assert counter/flag consistency under smoke policies and fold/all-in-heavy paths.
- **Deviations from original plan**:
  - No kernel/compiler surface was added; existing generic query/aggregate primitives were sufficient and cleaner for the agnostic architecture rule.
  - Extended existing integration suites instead of creating separate broad property-suite files.
- **Verification results**:
  - `npm run build` ✅
  - `npm run lint` ✅
  - `npm test` ✅

### Follow-up Refinement

- **Date**: 2026-02-16
- **Architecture upgrade**:
  - Removed `playersInHand` from Texas `globalVars` entirely.
  - Removed the temporary `sync-players-in-hand` macro and all persisted-counter synchronization paths.
  - Replaced all hand-occupancy checks with direct derived aggregates over per-player truth (`handActive && !eliminated`).
  - Updated Texas tests to assert absence of stored `playersInHand` and validate derived occupancy behavior.
- **Verification results**:
  - `npm run build` ✅
  - `npm run lint` ✅
  - `npm test` ✅
