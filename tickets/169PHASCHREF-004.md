# 169PHASCHREF-004: Phase 3 — remaining distance units & schedule.distance.toPhase aliases

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — policy ref resolver extension
**Deps**: `tickets/169PHASCHREF-003.md`

## Problem

With `schedule.distance.toBoundary.<BoundaryId>.cards` shipped in 003, Spec 169 §4.2 still requires four additional units (`.microturns`, `.actions`, `.turns`, `.rounds`) for `cardDraw` boundaries, plus the convenience aliasing surface `schedule.distance.toPhase.<PhaseId>.<unit>` that resolves to the nearest `phaseEntry` boundary targeting `<PhaseId>`. These units expose the same underlying distance information in alternative quantization — useful for considerations that reason in turn or action terms rather than cards.

The four new units are state-local O(1) reads over kernel-maintained counters (`turnCount`, `actionCount`, etc., already tracked per the existing turn-state machinery). The `.toPhase.<PhaseId>` aliases are pure compile-time resolution (compiler picks the boundary; resolver dispatches as if the user had written `.toBoundary.<picked>.<unit>`).

## Assumption Reassessment (2026-05-13)

1. **Turn/action/microturn/round counters exist on `GameState`**: confirmed in the kernel state surface — these are maintained by the existing turn-flow machinery and not introduced by this ticket.
2. **Card-position-to-microturn mapping is computable**: for `cardDraw` boundaries, microturn / action / turn / round distances derive from the card-draw rate (cards drawn per turn unit), which is part of the compiled deck rate (confirm via grep on `deck` types).
3. **`schedule.distance.toPhase` is a compiler-resolved alias**: per spec §4.2 ("convenience aliases that resolve to the nearest boundary of `kind: phaseEntry` targeting `<PhaseId>`"). Compile-time picks the boundary; runtime dispatches as `.toBoundary.<picked>.<unit>`. If multiple `phaseEntry` boundaries exist for one phase, spec §11 Open Question 3 directs aliasing to the first declared.
4. **No new diagnostic codes**: 001's matrix already covers `SCHEDULE_REF_UNSUPPORTED_UNIT` and `SCHEDULE_REF_UNKNOWN_PHASE` / `SCHEDULE_REF_NO_PHASE_BOUNDARY`. This ticket extends the resolver, not the diagnostic surface.

## Architecture Check

1. **Foundation #1 (Engine agnosticism)**: all new units are universal scalar quantities — no game-specific assumptions about "what a turn is" or "what an action is". Conversion from card-position-to-unit-N is deterministic given the deck's compiled rate.
2. **Foundation #10 (Bounded)**: all new resolutions are O(1) — same index lookup as 003's `.cards`, with a constant-time arithmetic conversion to the target unit.
3. **Foundation #14 (No backwards compatibility)**: new units are additive. No existing ref kind is overloaded.
4. **`.toPhase` aliasing is compile-time**: the alias resolves to a concrete `toBoundary` AST node at compile time, so the runtime dispatcher needs zero new branches for `target.kind === 'phase'`. The AST is rewritten in `compile-agents.ts`.

## What to Change

### 1. Extend distance resolver for non-card units

In `policy-runtime.ts` (extension of the `scheduleDistance` resolver branch from 003):

- For `unit === 'microturns'`: compute via `(target card position - current draw position) × cards-per-microturn-rate`. The card-rate is part of the compiled deck — confirm exact field name during implementation.
- For `unit === 'actions'`: similar conversion against actions-per-card rate.
- For `unit === 'turns'`: distance in turns until the triggering card is drawn, computed against turns-per-card rate.
- For `unit === 'rounds'`: distance in rounds. May resolve to `0` (current round) for boundaries about to fire mid-round; document this in the trace.

For each unit, status `ready` iff the card-position-based distance is `ready` (003's logic). Unavailable propagates.

### 2. Compile-time `.toPhase.<PhaseId>` aliasing

In `compile-agents.ts`:

- During ref validation (the `scheduleDistance` branch from 001), detect `target.kind === 'phase'` references.
- Scan `phaseBoundaries[]` for entries matching `kind: phaseEntry, phaseId: <PhaseId>`. If none → `SCHEDULE_REF_NO_PHASE_BOUNDARY` (diagnostic from 001).
- If multiple → choose the first in declaration order (per spec §11 Open Question 3). Emit a compile-time advisory warning (not a rejection) noting the ambiguity.
- Rewrite the AST: `target.kind = 'boundary'`, `target.boundaryId = <picked>`. Runtime dispatch is now identical to direct `.toBoundary` resolution.

### 3. Cross-unit consistency invariant

For any boundary at a given runtime position, `.actions >= .cards` (because each card draw corresponds to at least one action). Similar relationships hold for `.turns >= .cards` and `.rounds <= .turns`. These are architectural-invariant test rows.

## Files to Touch

- `packages/engine/src/agents/policy-runtime.ts` (modify) — extend distance resolver for 4 new units.
- `packages/engine/src/cnl/compile-agents.ts` (modify) — `.toPhase.<PhaseId>` alias rewrite at compile time, ambiguity advisory.
- `packages/engine/test/unit/agents/schedule-distance-units.test.ts` (new) — golden tests per unit at fixture game positions.
- `packages/engine/test/unit/agents/schedule-distance-cross-unit-consistency.test.ts` (new) — architectural-invariant: cross-unit ordering invariants hold for arbitrary fixture positions.
- `packages/engine/test/unit/agents/schedule-to-phase-alias.test.ts` (new) — architectural-invariant: `toPhase.<PhaseId>.<unit>` resolves identically to direct `toBoundary.<picked>.<unit>` for the picked boundary.

## Out of Scope

- WASM opcode integration — 005 ticket. This ticket extends the TS resolver only.
- FITL `phaseBoundaries` data authoring — 006 ticket.
- Cumulative-sequence distance (e.g., "actions until the coup sequence completes" rather than "actions until coup first enters") — spec §11 Open Question 1; deferred.
- "Multiple boundaries per phase" disambiguation beyond "pick first declared" — spec §11 Open Question 3; compile-time advisory only, no resolution mechanism.

## Acceptance Criteria

### Tests That Must Pass

1. `schedule-distance-units.test.ts` — per-unit golden tests at 3+ game positions for `.microturns`, `.actions`, `.turns`, `.rounds`. Each unit byte-pinned against fixture state.
2. `schedule-distance-cross-unit-consistency.test.ts` — for arbitrary fixture positions, `.actions >= .cards` AND `.turns >= .cards` AND `.rounds <= .turns` hold. Property-test style across 20+ fixture positions.
3. `schedule-to-phase-alias.test.ts` — for a fixture with `coupEntry` targeting `coupVictory`, `schedule.distance.toPhase.coupVictory.cards` resolves identically to `schedule.distance.toBoundary.coupEntry.cards` at every fixture position. Same status, same value.
4. `schedule-to-phase-alias.test.ts` (continued) — compile-time advisory emitted when 2+ `phaseEntry` boundaries target the same phase.
5. Existing suite: `pnpm -F @ludoforge/engine test:unit` passes — no regression.

### Invariants

1. Cross-unit ordering (`.actions >= .cards`, etc.) holds for every reachable game state. No fixture or replay produces a counterexample.
2. `.toPhase` aliases are compile-time-resolved; the runtime AST contains `target.kind === 'boundary'` only. No runtime branch for `target.kind === 'phase'`.
3. All 5 units (`.cards`, `.microturns`, `.actions`, `.turns`, `.rounds`) for a given boundary share the same `ready`/`unavailable` status (status comes from the underlying card-position lookup).

## Test Plan

### New/Modified Tests

1. `schedule-distance-units.test.ts` — `@test-class: golden-trace`.
2. `schedule-distance-cross-unit-consistency.test.ts` — `@test-class: architectural-invariant`.
3. `schedule-to-phase-alias.test.ts` — `@test-class: architectural-invariant`.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- --test-name-pattern schedule-distance` — new unit tests.
2. `pnpm -F @ludoforge/engine test:unit -- --test-name-pattern schedule-to-phase` — alias tests.
3. `pnpm turbo test --filter=@ludoforge/engine` — full engine gate.
4. `pnpm turbo typecheck` — typecheck.
