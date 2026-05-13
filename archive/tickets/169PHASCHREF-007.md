# 169PHASCHREF-007: Phase 3b — real non-card schedule distance units

**Status**: COMPLETED
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

## Selected Semantics

This ticket selects the compiled schedule-rate conversion model for `cardDraw` schedules.

`schedule.kind: cardDraw` may declare optional exact positive integer `unitRates`:

```yaml
schedule:
  kind: cardDraw
  deckId: eventDeck
  cardSelector:
    tags: [coup]
  unitRates:
    microturns: 3
    actions: 2
    turns: 1
    rounds: 4
```

Each rate means "this many units per card of distance to the next matching trigger card." Runtime resolution uses the existing observer-safe `.cards` distance as the single status source:

- if `.cards` is `ready`, the non-card unit resolves to `cardDistance * unitRates[unit]`;
- if `.cards` is unavailable, the non-card unit returns the same unavailable status;
- if a non-card unit has no declared rate, the compiler rejects that ref with `SCHEDULE_REF_UNSUPPORTED_UNIT`;
- if a declared rate is not a positive integer, the compiler rejects the boundary with `PHASE_BOUNDARY_INVALID_UNIT_RATE`.

This does not add live action, microturn, or round counters and does not simulate forward. Those remain possible future schedule-kind work if a game needs live-counter semantics rather than declared card-rate semantics.

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
- WASM opcode integration — `archive/tickets/169PHASCHREF-005.md` integrates the schedule refs that existed when it started, including the declared-rate non-card units shipped here.
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

## Outcome

Completion date: 2026-05-13

Outcome amended: 2026-05-13 — post-ticket-review extended `archive/tickets/169PHASCHREF-005.md` to own WASM parity for declared-rate non-card units and archived this ticket; later path cleanup updated that owner reference after 005 archived.

What landed:

- Selected the exact declared-rate model for non-card `cardDraw` schedule units.
- Added optional `schedule.unitRates.{microturns,actions,turns,rounds}` to the authored/compiled schedule contract.
- Added compiler validation that declared rates are positive integers.
- Changed schedule unit compatibility so non-card refs compile only when the target `cardDraw` boundary declares the requested rate; underived units still reject with `SCHEDULE_REF_UNSUPPORTED_UNIT`.
- Changed the TypeScript policy runtime resolver so declared non-card units reuse the `.cards` ready/unavailable source and resolve as `cardDistance * unitRates[unit]`.
- Added per-unit golden and cross-unit consistency tests.

Touched-file scope:

- Planned and touched: `packages/engine/src/agents/policy-runtime.ts`, `packages/engine/src/cnl/compile-agents.ts`, `packages/engine/src/cnl/compile-phase-boundaries.ts`, `packages/engine/src/cnl/compiler-diagnostic-codes.ts`, `packages/engine/src/cnl/game-spec-doc.ts`, `packages/engine/src/kernel/types-core.ts`, `packages/engine/src/kernel/schemas-core.ts`, `packages/engine/test/unit/agents/schedule-distance-units.test.ts`, `packages/engine/test/unit/agents/schedule-distance-cross-unit-consistency.test.ts`, `packages/engine/test/unit/agents/schedule-ref-test-fixtures.ts`, `packages/engine/test/unit/cnl/phase-boundary-compile-validation.test.ts`.
- Owned generated fallout: `packages/engine/schemas/GameDef.schema.json`.
- Owned spec closeout: `specs/169-phase-boundary-and-schedule-refs.md`.
- Verified-no-counter-needed: `packages/engine/src/kernel/*` did not gain action/microturn/round counters because the selected semantics use declared exact conversion metadata, not live counter deltas.

Invariant proof matrix:

| Invariant | Witness/assertion | Status | Proof lane |
|---|---|---|---|
| No non-card unit aliases silently to `.cards`. | Non-card units require explicit `unitRates[unit]`; missing rates reject with `SCHEDULE_REF_UNSUPPORTED_UNIT`. | proven | `phase-boundary-compile-validation.test.js` |
| Declared non-card units use a rule-authoritative exact conversion. | Runtime values equal `cardDistance * unitRates[unit]` across fixture positions. | proven | `schedule-distance-units.test.js`, `schedule-distance-cross-unit-consistency.test.js` |
| Underived units fail closed. | Missing-rate refs remain compile-time errors; invalid rates reject with `PHASE_BOUNDARY_INVALID_UNIT_RATE`. | proven | `phase-boundary-compile-validation.test.js` |
| Ready/unavailable status source stays shared with `.cards`. | Declared non-card units preserve `noTriggeringCardRemaining` when the card distance is unavailable. | proven | `schedule-distance-units.test.js`, `schedule-distance-cross-unit-consistency.test.js` |
| Unit semantics stay engine-generic. | Synthetic generic schedule fixture uses only `cardDraw`, `BoundaryId`, and exact integer rates. | proven | focused unit tests plus build/typecheck |

Generated/schema fallout:

- Initial expected red: `pnpm -F @ludoforge/engine run schema:artifacts:check` reported `GameDef.schema.json` out of sync after the new `unitRates` contract.
- `pnpm -F @ludoforge/engine run schema:artifacts` regenerated schema artifacts; only `GameDef.schema.json` has a persisted diff.

Deferred sibling/spec scope:

- Post-review follow-up update: `archive/tickets/169PHASCHREF-005.md` was extended to own WASM parity for the declared-rate non-card schedule units shipped here.
- FITL phase-boundary authoring remains `tickets/169PHASCHREF-006.md`.
- Live-counter schedule semantics and schedule kinds beyond `cardDraw` remain future work, not hidden behavior in this ticket.

Source-size ledger:

| Path | Before lines | After lines | Crossed cap? | Active growth | Extraction/defer rationale | Successor |
|---|---:|---:|---|---:|---|---|
| `packages/engine/src/agents/policy-runtime.ts` | 694 | 708 | No; remains near cap | +14 | The resolver change is a small extension of the existing schedule-distance branch; extracting it now would widen the ticket and obscure the shared status-source proof. | None |
| `packages/engine/src/kernel/types-core.ts` | 2263 | 2271 | No; preexisting oversized | +8 | Canonical kernel type hub; the additive schedule contract belongs beside `ScheduleKindDef`. | None |
| `packages/engine/src/kernel/schemas-core.ts` | 2686 | 2696 | No; preexisting oversized | +10 | Canonical schema mirror; the optional `unitRates` mirror belongs beside `ScheduleKindDefSchema`. | None |

Command ledger before terminal status:

| Ticket section | Literal command/shorthand | Final citation |
|---|---|---|
| Test Plan | `pnpm -F @ludoforge/engine build` | passed |
| Test Plan | `node --test packages/engine/dist/test/unit/agents/schedule-distance-units.test.js` | passed, 2 tests |
| Test Plan | `node --test packages/engine/dist/test/unit/agents/schedule-distance-cross-unit-consistency.test.js` | passed, 2 tests |
| Test Plan | `pnpm -F @ludoforge/engine test:unit` | passed, 5713 tests |
| Test Plan | `pnpm turbo typecheck` | passed, 3/3 tasks |
| Acceptance | focused compiler validation for unit compatibility | `node --test packages/engine/dist/test/unit/cnl/phase-boundary-compile-validation.test.js` passed, 17 tests |

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine run schema:artifacts:check` — passed after regeneration.
- `node --test packages/engine/dist/test/unit/agents/schedule-distance-units.test.js` — passed, 2 tests.
- `node --test packages/engine/dist/test/unit/agents/schedule-distance-cross-unit-consistency.test.js` — passed, 2 tests.
- `node --test packages/engine/dist/test/unit/cnl/phase-boundary-compile-validation.test.js` — passed, 17 tests.
- `pnpm -F @ludoforge/engine test:unit` — passed, 5713 tests.
- `pnpm turbo typecheck` — passed, 3/3 tasks.
- Final focused compiled-test reruns after `pnpm turbo typecheck` rebuilt `dist`:
  - `node --test packages/engine/dist/test/unit/agents/schedule-distance-units.test.js` — passed, 2 tests.
  - `node --test packages/engine/dist/test/unit/agents/schedule-distance-cross-unit-consistency.test.js` — passed, 2 tests.
  - `node --test packages/engine/dist/test/unit/cnl/phase-boundary-compile-validation.test.js` — passed, 17 tests.
- Final `pnpm -F @ludoforge/engine run schema:artifacts:check` — passed.
- `pnpm run check:ticket-deps` — passed for 3 active tickets and 2326 archived tickets.

Late-edit proof validity:

- No-invalidation: this terminal closeout patch only sets the already-proven status and transcribes exact proof results; it does not change scope, acceptance criteria, command semantics, touched-file ownership, proof claims, follow-up ownership, or dependency classification.
- No-invalidation: appending the ticket-dependency checker result records the just-run graph integrity proof only; it changes no implementation or acceptance boundary.
- No-invalidation: the final Spec 169 diagnostic-table addition documents the already-tested `PHASE_BOUNDARY_INVALID_UNIT_RATE` code and changes no implementation, acceptance command, or proof boundary.

Post-review archive verification:

- `pnpm run check:ticket-deps` — passed for 2 active tickets and 2327 archived tickets.
