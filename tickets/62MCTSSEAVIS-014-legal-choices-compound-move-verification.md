# 62MCTSSEAVIS-014: Verify legalChoicesDiscover() Compound Move Handling

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Possibly — kernel/legal-choices.ts
**Deps**: 62MCTSSEAVIS-008

## Problem

FITL compound moves include special activities (SA) after main operations. `legalChoicesDiscover()` must correctly present SA decisions after main operation decisions complete. This ticket verifies the kernel handles compound moves and fixes it if not.

## What to Change

### 1. Write tests verifying compound move decision flow

Create unit tests that:
- Start a FITL compound move with main operation
- Step through decisions via `legalChoicesDiscover()` until main operation completes
- Verify that SA decisions are presented next
- Verify that `complete` is returned after all decisions resolve

### 2. Fix if needed

If `legalChoicesDiscover()` does not handle the compound move → SA transition:
- Extend the function to detect `move.compound.specialActivity` after main decisions
- Present SA decisions as additional pending choices
- Maintain backward compatibility

## Files to Touch

- `packages/engine/src/kernel/legal-choices.ts` (modify if fix needed)
- `packages/engine/test/unit/kernel/legal-choices-compound.test.ts` (new)

## Out of Scope

- Decision expansion module (62MCTSSEAVIS-008 — depends on this)
- Search loop changes (62MCTSSEAVIS-010)
- Changes to move structure or types
- Non-compound move handling (unchanged)

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: `legalChoicesDiscover()` with compound move presents main operation decisions first
2. Unit test: after main operation decisions complete, SA decisions are presented
3. Unit test: `complete` is returned only when ALL decisions (main + SA) are resolved
4. Unit test: non-compound moves are unaffected
5. Unit test: compound move with no SA completes after main operation
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `legalChoicesDiscover()` API contract unchanged for non-compound moves
2. Decision ordering: main operation first, then SA
3. `complete` only returned when move is fully resolved (all parameters filled)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices-compound.test.ts` — compound move decision flow

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-path-pattern legal-choices`
2. `pnpm turbo build && pnpm turbo typecheck`
