# 169PHASCHREF-007: Phase 3b — real non-card schedule distance units

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — schedule unit semantics and runtime accounting
**Deps**: `archive/tickets/169PHASCHREF-004.md`

## Problem

Spec 169 originally grouped `.microturns`, `.actions`, `.turns`, and `.rounds` into `archive/tickets/169PHASCHREF-004.md`, but live reassessment showed the required substrate is not present. The engine currently tracks `turnCount`, but it does not persist action count, microturn count, round count, or compiled card-to-unit rate metadata that would make non-card units meaningful for `cardDraw` boundaries.

This ticket owns the architectural design and implementation for real non-card schedule distance units. It must define what each unit means at the kernel/rule-protocol level before adding resolver support.

## Assumption Reassessment (2026-05-13)

1. `schedule.distance.toBoundary.<BoundaryId>.cards` is implemented by `archive/tickets/169PHASCHREF-003.md`.
2. `schedule.distance.toPhase.<PhaseId>.cards` aliasing is owned by `archive/tickets/169PHASCHREF-004.md`.
3. Live `GameState` does not expose enough counters/rates to compute `.microturns`, `.actions`, `.turns`, or `.rounds` honestly from a card-draw schedule.
4. Any implementation must choose a Foundation-aligned semantic model rather than aliasing all units to card distance.

## Architecture Check

1. Preserve Foundation #8 by using exact deterministic counters or declared deterministic conversion metadata.
2. Preserve Foundation #10 by keeping per-ref resolution bounded and avoiding forward simulation.
3. Preserve Foundation #15 by defining one coherent unit model across kernel, compiler, runtime, and tests.
4. Preserve Foundation #16 by proving every unit with automated tests over reachable fixture states.

## What to Change

### 1. Define unit semantics

Decide and document the exact meaning of:

- `.microturns`
- `.actions`
- `.turns`
- `.rounds`

The design must specify whether each value is a live counter delta, a compiled schedule-rate conversion, or unsupported for `cardDraw` until a richer schedule kind exists.

### 2. Add runtime/compiler substrate

Add the minimal generic kernel/runtime/compiler state needed for the selected semantics. Do not add game-specific assumptions about FITL, coup cards, or faction turns.

### 3. Extend schedule distance resolution

Extend the TypeScript resolver so all supported units share the same ready/unavailable status source as `.cards` when that is the selected model, or fail closed when a unit is not derivable from the declared schedule kind.

### 4. Add proof coverage

Add unit-level golden tests and cross-unit consistency tests that reflect the final semantics.

## Files to Touch

- `packages/engine/src/agents/policy-runtime.ts` (modify likely) — schedule distance resolver.
- `packages/engine/src/cnl/compile-agents.ts` or `packages/engine/src/cnl/compile-phase-boundaries.ts` (modify likely) — unit validation if semantics require a narrower matrix.
- `packages/engine/src/kernel/*` (modify if counters or runtime state are introduced) — exact paths depend on the selected unit model.
- `packages/engine/test/unit/agents/schedule-distance-units.test.ts` (new) — per-unit golden tests.
- `packages/engine/test/unit/agents/schedule-distance-cross-unit-consistency.test.ts` (new) — cross-unit invariants.

## Out of Scope

- `.toPhase` aliasing — completed by `archive/tickets/169PHASCHREF-004.md`.
- WASM opcode integration — `tickets/169PHASCHREF-005.md` should integrate only the schedule refs that exist when it starts; non-card unit WASM parity follows this ticket if needed.
- FITL `phaseBoundaries` authoring — `tickets/169PHASCHREF-006.md`.
- Cumulative-sequence distance until an entire multi-phase sequence completes.

## Acceptance Criteria

### Tests That Must Pass

1. `schedule-distance-units.test.ts` — per-unit golden tests at 3+ fixture positions for every implemented non-card unit.
2. `schedule-distance-cross-unit-consistency.test.ts` — cross-unit invariants match the semantics chosen in this ticket.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit` passes.

### Invariants

1. No unit is implemented as a misleading alias for cards unless the ticket explicitly changes the spec to make that alias rule-authoritative.
2. Unsupported or underived units fail closed at compile time or resolve unavailable with a tested reason; they do not silently coerce to numeric contributions.
3. Unit semantics stay engine-generic and do not encode FITL-specific phase or faction assumptions.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/schedule-distance-units.test.ts` — per-unit resolution.
2. `packages/engine/test/unit/agents/schedule-distance-cross-unit-consistency.test.ts` — architectural invariants.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/agents/schedule-distance-units.test.js`
3. `node --test packages/engine/dist/test/unit/agents/schedule-distance-cross-unit-consistency.test.js`
4. `pnpm -F @ludoforge/engine test:unit`
5. `pnpm turbo typecheck`
