# FITLEVECARENC-020: Rework Bombing Pause to Canonical Event Target Semantics

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — depends on engine semantic/diagnostic tickets; FITL data + tests migration
**Deps**: tickets/FITLEVENTARCH-001-event-target-application-semantics.md, tickets/FITLEVENTARCH-002-choice-validation-error-classification.md, specs/29-fitl-event-card-encoding.md, data/games/fire-in-the-lake/41-content-event-decks.md

## Problem

`card-41` (Bombing Pause) is currently encoded with a manual `forEach` iteration workaround to apply `setMarker` across selected targets. That workaround should be removed once canonical multi-target event semantics are implemented in engine.

## Assumption Reassessment (2026-03-07)

1. Bombing Pause is now correctly modeled as single-sided with immediate effects + momentum, but uses explicit YAML iteration (`forEach`) for per-target marker application.
2. That explicit iteration is compensating for engine target-application semantics rather than expressing game rule intent.
3. Current edge-case tests for Bombing Pause also tolerate mixed invalid-classification behavior; they should be tightened once ticket FITLEVENTARCH-002 lands.

## Architecture Check

1. Replacing workaround encoding with canonical engine semantics yields cleaner GameSpecDoc intent and lower authoring complexity.
2. This preserves game-specific vs game-agnostic layering: FITL data only declares card intent; kernel handles generic execution semantics.
3. No backwards compatibility shims: remove workaround and enforce canonical representation.

## What to Change

### 1. Simplify Bombing Pause event data to canonical shape

Update `card-41` unshaded effects to use direct target-scoped expression (no manual `forEach` wrapper), relying on engine `each` target application behavior.

### 2. Tighten Bombing Pause integration assertions

Update tests to assert:
- canonical data shape (no iteration workaround)
- exact immediate effects and momentum behavior
- canonical invalid-parameter classification for out-of-domain selections

### 3. Keep momentum prohibition/reset behavior unchanged

Preserve `mom_bombingPause` activation and Coup reset semantics; migration is representational/contractual, not behavioral drift.

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/test/integration/fitl-events-bombing-pause.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-1968-nva.test.ts` (modify)
- `packages/engine/test/integration/fitl-momentum-prohibitions.test.ts` (modify, if needed for contract assertions)

## Out of Scope

- Changes to other FITL cards unless they are found to rely on the same workaround and are explicitly added to scope
- Runner visual configuration changes
- Any gameplay rebalance

## Acceptance Criteria

### Tests That Must Pass

1. Bombing Pause is encoded without manual iteration workaround while preserving behavior exactly.
2. Bombing Pause edge-case invalid selections assert a single canonical invalid-params classification.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. FITL card YAML expresses rule intent directly, not engine-gap workarounds.
2. Momentum timing (`until Coup`) remains unchanged and game-agnostic infrastructure stays generic.

## Tests

1. Update Bombing Pause integration tests for canonical representation and deterministic diagnostics.
2. Re-run related momentum prohibition/regression suites to ensure no side effects.
3. Ensure 1968 NVA card contract suite reflects the final canonical card shape.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-bombing-pause.test.ts` — canonical shape + runtime + invalid-classification assertions.
2. `packages/engine/test/integration/fitl-events-1968-nva.test.ts` — card contract assertions for final unshaded schema shape.
3. `packages/engine/test/integration/fitl-momentum-prohibitions.test.ts` — regression guard for Air Strike block/unblock behavior.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-bombing-pause.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-1968-nva.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-momentum-prohibitions.test.js`
5. `pnpm -F @ludoforge/engine test`
