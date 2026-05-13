# 169PHASCHREF-004: Phase 3a — schedule.distance.toPhase aliases

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — policy ref compiler alias rewrite
**Deps**: `archive/tickets/169PHASCHREF-003.md`

## Problem

With `schedule.distance.toBoundary.<BoundaryId>.cards` shipped in 003, Spec 169 §4.2 still requires the convenience aliasing surface `schedule.distance.toPhase.<PhaseId>.cards` that resolves to the nearest `phaseEntry` boundary targeting `<PhaseId>`. The live compiler already validates `.toPhase` references, but it still emits a runtime AST target of `target.kind === 'phase'`; the intended architecture is a compile-time alias to the concrete boundary, so runtime dispatch remains identical to `.toBoundary.<BoundaryId>.cards`.

The originally drafted four non-card units (`.microturns`, `.actions`, `.turns`, `.rounds`) are deferred to `archive/tickets/169PHASCHREF-007.md`. Live reassessment proved the required action/microturn/round counters and card-to-unit rate metadata are not currently present in the engine surface, so closing them in this ticket would require inventing new semantics beyond the aliasing slice.

## Assumption Reassessment (2026-05-13)

1. **Non-card unit substrate is absent**: live `GameState` has `turnCount`, but no persistent `actionCount`, `microturnCount`, or round counter; `PhaseBoundaryDef` / `GameDefRuntime.scheduleIndex` stores card-draw positions only, not cards-per-action/turn/round rate metadata. The non-card unit work is split to `archive/tickets/169PHASCHREF-007.md`.
2. **`schedule.distance.toPhase` is a compiler-resolved alias**: per spec §4.2 ("convenience aliases that resolve to the nearest boundary of `kind: phaseEntry` targeting `<PhaseId>`"). Compile-time picks the boundary; runtime dispatches as `.toBoundary.<picked>.cards`. If multiple `phaseEntry` boundaries exist for one phase, spec §11 Open Question 3 directs aliasing to the first declared.
3. **Live compiler currently validates but does not rewrite**: `compile-agents.ts` accepts `.toPhase.<PhaseId>.cards` and emits `{ target: { kind: 'phase' } }`. This ticket removes that interim AST shape from compiler output and the public compiled ref schema.
4. **Ambiguity advisory needs a diagnostic code**: the original draft said no new diagnostic codes, but the alias contract also requires a compile-time advisory when multiple phase-entry boundaries target the same phase. This ticket adds a warning-only diagnostic for that case.

### Authorization Ledger

- User-approved option: Option 2, "Narrow ticket".
- Confirmation: 2026-05-13 user message, "Proceed with recommended option 2."
- Scope effect: narrows ticket; defers non-card unit semantics to `archive/tickets/169PHASCHREF-007.md`.
- Durable repo locations: this ticket, `archive/specs/169-phase-boundary-and-schedule-refs.md`, and `archive/tickets/169PHASCHREF-007.md`.

## Architecture Check

1. **Foundation #1 (Engine agnosticism)**: `.toPhase` resolution is a generic compile-time lookup over declared `phaseBoundaries[]`; no game-specific phase ids or deck assumptions enter engine code.
2. **Foundation #10 (Bounded)**: alias resolution is a bounded declaration-order scan at compile time and an existing O(1) `.cards` runtime lookup after lowering.
3. **Foundation #14 (No backwards compatibility)**: the interim compiled `target.kind === 'phase'` shape is removed from emitted AST/schema instead of retained as a runtime alias path.
4. **Foundation #16 (Testing as Proof)**: focused compiler and runtime tests prove `.toPhase` compiles to the exact picked boundary and produces identical status/value to the direct `.toBoundary` ref.

## What to Change

### 1. Compile-time `.toPhase.<PhaseId>.cards` aliasing

In `compile-agents.ts`:

- During ref validation (the `scheduleDistance` branch from 001), detect `target.kind === 'phase'` references.
- Scan `phaseBoundaries[]` for entries matching `kind: phaseEntry, phaseId: <PhaseId>`. If none → `SCHEDULE_REF_NO_PHASE_BOUNDARY` (diagnostic from 001).
- If multiple → choose the first in declaration order (per spec §11 Open Question 3). Emit a compile-time advisory warning (not a rejection) noting the ambiguity.
- Rewrite the AST: `target.kind = 'boundary'`, `target.boundaryId = <picked>`. Runtime dispatch is now identical to direct `.toBoundary` resolution.

### 2. Fail closed for deferred non-card units

In `compile-phase-boundaries.ts`, limit Phase 3a `cardDraw` schedule-distance support to `.cards`. The deferred `.microturns`, `.actions`, `.turns`, and `.rounds` units must reject with `SCHEDULE_REF_UNSUPPORTED_UNIT` until `archive/tickets/169PHASCHREF-007.md` defines real semantics.

### 3. Remove the interim compiled phase target shape

In `types-core.ts` and `schemas-core.ts`, remove `{ kind: 'phase', phaseId }` from the compiled `scheduleDistance.target` union. Authored `.toPhase` remains valid input syntax, but compiled/runtime artifacts contain only `nextBoundary` or concrete `boundary` targets.

### 4. Runtime identity proof

Add focused tests proving `schedule.distance.toPhase.<PhaseId>.cards` compiles to the first matching `phaseEntry` boundary and resolves identically to direct `.toBoundary.<picked>.cards` across multiple card positions.

## Files to Touch

- `packages/engine/src/cnl/compile-agents.ts` (modify) — `.toPhase.<PhaseId>` alias rewrite at compile time, ambiguity advisory.
- `packages/engine/src/cnl/compile-phase-boundaries.ts` (modify) — reject deferred non-card units until `007`.
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify) — warning diagnostic for ambiguous phase aliases.
- `packages/engine/src/kernel/types-core.ts` (modify) — remove interim compiled phase target.
- `packages/engine/src/kernel/schemas-core.ts` (modify) — schema mirror for compiled target union.
- `packages/engine/schemas/GameDef.schema.json` (modify if schema artifacts change).
- `packages/engine/test/unit/agents/schedule-to-phase-alias.test.ts` (new) — architectural-invariant: `toPhase.<PhaseId>.cards` resolves identically to direct `toBoundary.<picked>.cards` for the picked boundary.
- `packages/engine/test/unit/cnl/phase-boundary-compile-validation.test.ts` (modify) — compiled AST rewrite and ambiguity warning coverage.

## Out of Scope

- Non-card distance units (`.microturns`, `.actions`, `.turns`, `.rounds`) — split to `archive/tickets/169PHASCHREF-007.md`.
- WASM opcode integration — 005 ticket. This ticket extends the TS resolver only.
- FITL `phaseBoundaries` data authoring — 006 ticket.
- Cumulative-sequence distance (e.g., "actions until the coup sequence completes" rather than "actions until coup first enters") — spec §11 Open Question 1; deferred.
- "Multiple boundaries per phase" disambiguation beyond "pick first declared" — spec §11 Open Question 3; compile-time advisory only, no resolution mechanism.

## Acceptance Criteria

### Tests That Must Pass

1. `phase-boundary-compile-validation.test.ts` — `schedule.distance.toPhase.<PhaseId>.cards` lowers to `{ target: { kind: 'boundary', boundaryId: <picked> }, unit: 'cards' }`, never to `{ target: { kind: 'phase' } }`.
2. `phase-boundary-compile-validation.test.ts` — warning diagnostic emitted when 2+ `phaseEntry` boundaries target the same phase, while compilation remains successful.
3. `phase-boundary-compile-validation.test.ts` — non-card units reject with `SCHEDULE_REF_UNSUPPORTED_UNIT` while `archive/tickets/169PHASCHREF-007.md` owns their semantics.
4. `schedule-to-phase-alias.test.ts` — for a fixture with `coupEntry` and `lateCoupEntry` both targeting `scoring`, `schedule.distance.toPhase.scoring.cards` resolves identically to `schedule.distance.toBoundary.coupEntry.cards` at every fixture position. Same status, same value.
5. Existing suite: `pnpm -F @ludoforge/engine test:unit` passes — no regression.

### Invariants

1. `.toPhase` aliases are compile-time-resolved; the runtime AST contains `target.kind === 'boundary'` only. No runtime branch for `target.kind === 'phase'`.
2. Deferred non-card units fail closed at compile time until `007`; they do not compile to a runtime unsupported branch.
3. Direct `.toBoundary.<picked>.cards` and alias `.toPhase.<PhaseId>.cards` share the same `ready`/`unavailable` status and value because they compile to the same boundary target.
4. If multiple matching `phaseEntry` boundaries exist, declaration order is authoritative and visible via a warning.

## Test Plan

### New/Modified Tests

1. `schedule-to-phase-alias.test.ts` — `@test-class: architectural-invariant`.
2. `phase-boundary-compile-validation.test.ts` — existing architectural-invariant compiler test extended for alias rewrite and ambiguity warning.

### Commands

1. `pnpm -F @ludoforge/engine build` — produces compiled test/runtime output.
2. `node --test packages/engine/dist/test/unit/cnl/phase-boundary-compile-validation.test.js` — compiler alias tests.
3. `node --test packages/engine/dist/test/unit/agents/schedule-to-phase-alias.test.js` — runtime alias parity tests.
4. `pnpm -F @ludoforge/engine run schema:artifacts:check` — schema mirror check.
5. `pnpm -F @ludoforge/engine test:unit` — unit suite.
6. `pnpm turbo test --filter=@ludoforge/engine` — full engine gate.
7. `pnpm turbo typecheck` — typecheck.

## Outcome

Completion date: 2026-05-13

Outcome amended: 2026-05-13 — updated stale handoff paths after `169PHASCHREF-007`, `169PHASCHREF-005`, and `169PHASCHREF-006` completed and archived; updated the Spec 169 path after it moved to `archive/specs/169-phase-boundary-and-schedule-refs.md`.

What landed:

- Corrected this ticket to the user-approved narrowed boundary: `schedule.distance.toPhase.<PhaseId>.cards` aliasing only.
- Added `archive/tickets/169PHASCHREF-007.md` as the owner for real non-card unit semantics.
- Updated Spec 169 and `archive/tickets/169PHASCHREF-005.md` so the series no longer assumes `.microturns`, `.actions`, `.turns`, or `.rounds` exist before their substrate is designed.
- Changed `.toPhase.<PhaseId>.cards` lowering to emit a concrete `boundary` target for the first matching `phaseEntry` boundary.
- Added warning diagnostic `SCHEDULE_REF_AMBIGUOUS_PHASE_BOUNDARY` when multiple `phaseEntry` boundaries target the same phase.
- Removed the interim compiled/runtime `scheduleDistance.target.kind === 'phase'` shape from TypeScript and the generated `GameDef.schema.json`.
- Tightened schedule-unit validation so deferred non-card units reject with `SCHEDULE_REF_UNSUPPORTED_UNIT` until `007` lands.

Touched-file scope:

- Planned and touched: `packages/engine/src/cnl/compile-agents.ts`, `packages/engine/src/cnl/compile-phase-boundaries.ts`, `packages/engine/src/cnl/compiler-diagnostic-codes.ts`, `packages/engine/src/kernel/types-core.ts`, `packages/engine/src/kernel/schemas-core.ts`, `packages/engine/schemas/GameDef.schema.json`, `packages/engine/test/unit/agents/schedule-to-phase-alias.test.ts`, `packages/engine/test/unit/cnl/phase-boundary-compile-validation.test.ts`.
- Owned graph/spec fallout: `archive/specs/169-phase-boundary-and-schedule-refs.md`, `archive/tickets/169PHASCHREF-005.md`, `archive/tickets/169PHASCHREF-007.md`.
- Verified-no-edit from original draft: `packages/engine/src/agents/policy-runtime.ts`; alias lowering removes the need for a runtime `phase` branch, and non-card runtime units are deferred.
- Rewritten/deferred from original draft: `schedule-distance-units.test.ts` and `schedule-distance-cross-unit-consistency.test.ts` move to `archive/tickets/169PHASCHREF-007.md`.

Generated/schema fallout:

- `packages/engine/schemas/GameDef.schema.json` changed after `schema:artifacts` because the compiled schedule-distance target union no longer includes `{ kind: "phase", phaseId }`.
- `Trace.schema.json` and `EvalReport.schema.json` were regenerated by the schema command but had no persisted diff.

Deferred sibling/spec scope:

- Non-card distance units (`.microturns`, `.actions`, `.turns`, `.rounds`) are deferred to `archive/tickets/169PHASCHREF-007.md`.
- WASM parity remains `archive/tickets/169PHASCHREF-005.md`; it covers the currently implemented TypeScript schedule refs rather than nonexistent non-card units.
- FITL authoring completed in `archive/tickets/169PHASCHREF-006.md`.

Source-size ledger:

| Path | Before lines | After lines | Crossed cap? | Active growth | Extraction/defer rationale | Successor |
|---|---:|---:|---|---:|---|---|
| `packages/engine/src/cnl/compile-agents.ts` | 4490 | 4500 | No - preexisting oversized | +10 | The alias rewrite belongs beside the existing schedule ref validation branch; extracting this small branch would obscure the compiler validation flow more than it would reduce hub complexity. | None |

Verification:

- Initial expected schema check red: `pnpm -F @ludoforge/engine run schema:artifacts:check` reported `GameDef.schema.json` drift after removing the compiled `phase` target; `pnpm -F @ludoforge/engine run schema:artifacts` regenerated it.
- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine run schema:artifacts:check` — passed after regeneration.
- `pnpm -F @ludoforge/engine test:unit` — passed, 5708 tests.
- `pnpm turbo test --filter=@ludoforge/engine` — passed, 69/69 default engine test files.
- `pnpm turbo typecheck` — passed, 3/3 tasks.
- Focused compiled tests rerun after the broad Turbo gate rebuilt `dist`:
  - `node --test packages/engine/dist/test/unit/cnl/phase-boundary-compile-validation.test.js` — passed, 16 tests.
  - `node --test packages/engine/dist/test/unit/agents/schedule-to-phase-alias.test.js` — passed, 1 test.
- `pnpm run check:ticket-deps` — passed for 4 active tickets and 2325 archived tickets.

Post-review correction:

- `archive/specs/169-phase-boundary-and-schedule-refs.md` was corrected to match the Phase 3a/3b split: non-card distance units are no longer listed as currently supported by `cardDraw`, and the new `SCHEDULE_REF_AMBIGUOUS_PHASE_BOUNDARY` warning is documented.

Late-edit proof validity:

- No-invalidation: the post-review correction is spec/ticket prose only and aligns the durable docs with the already-tested compiler behavior; it does not change source, schema, generated artifacts, tests, acceptance commands, or dependency ownership.
