# FITLEVENTARCH-001: Event Target Application Semantics for Multi-Select Targets

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — event target contracts, event execution lowering, FITL card-41 migration, target-lowering tests
**Deps**: specs/29-fitl-event-card-encoding.md, reports/fire-in-the-lake-rules-section-5.md

## Problem

Event cards with multi-select targets currently bind selected values as arrays, but scalar effects consume single-zone selectors. This forces manual YAML `forEach` wrappers in event content for behavior that should be represented by canonical engine target semantics.

## Assumption Reassessment (2026-03-07)

1. `synthesizeEventTargetEffects` in `packages/engine/src/kernel/event-execution.ts` currently emits `chooseN` for multi-select targets and binds arrays to target IDs.
2. Scalar zone-consuming effects (for example `setMarker`) resolve a single zone. Passing an array binding directly fails runtime selector resolution unless author data adds explicit iteration.
3. FITL `card-41` currently carries this workaround (`forEach` over `$targetSpace`) and tests assert that workaround shape, confirming the architectural gap.
4. The previous ticket draft was underspecified for mixed side effects (`per-target` + `single-run`) because naive global wrapping would incorrectly repeat non-target effects.

## Architecture Check

1. Target application must be explicit and target-local. Add `application` and `effects` to target definitions so per-target execution ownership is declared at the target itself.
2. Keep event semantics engine-agnostic: kernel lowers target execution; game YAML declares intent only.
3. Canonical contract only: no aliases for target application modes.

## What to Change

### 1. Extend event target contract

Add fields to event targets:
- `application`: `each | aggregate`
- `effects` (optional): effect list owned by that target

Contract behavior:
- `aggregate`: run `target.effects` once after selection (binding can be collection-valued)
- `each`: for multi-select targets, run `target.effects` per selected item in deterministic order, rebinding the target ID to the scalar item for each iteration

### 2. Implement target-local lowering in event execution

Lower targets in deterministic order:
1. target selection (`chooseOne` / `chooseN`)
2. target-owned effects according to `application`

Retain existing side/branch `effects` execution order after target lowering.

### 3. Add validation for target contract coherence

Validate target definitions so invalid target contract combinations fail fast with deterministic diagnostics, including:
- unsupported `application` mode values
- `each` targets with no executable `effects` payload

### 4. Migrate Bombing Pause to canonical target semantics

Move card-41 per-target marker mutation into target-owned effects with `application: each`; keep patronage and momentum effects single-run in side effects/lasting effects.

## Files to Touch

- `packages/engine/src/kernel/types-events.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/event-execution.ts` (modify)
- `packages/engine/test/unit/kernel/event-execution-targets.test.ts` (modify)
- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/test/integration/fitl-events-bombing-pause.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-1968-nva.test.ts` (modify)

## Out of Scope

- Runner UI or visual-config changes
- Non-event action DSL redesign
- Broad refactors unrelated to event target lowering

## Acceptance Criteria

### Tests That Must Pass

1. Multi-select event targets with `application: each` execute target-owned scalar effects once per selected target without authored `forEach` wrappers.
2. Target contract misconfigurations fail validation with clear diagnostics.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Event target application semantics are engine-defined, deterministic, and game-agnostic.
2. `GameSpecDoc` does not require per-card manual iteration for generic target-application behavior.

## Tests

1. Add/modify unit tests for deterministic target lowering and `each`/`aggregate` execution behavior.
2. Update Bombing Pause integration tests for canonical card shape + behavior parity.
3. Re-run engine test/lint/typecheck gates.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/event-execution-targets.test.ts` — target-local lowering and `each` semantics.
2. `packages/engine/test/integration/fitl-events-bombing-pause.test.ts` — canonical Bombing Pause behavior assertions.
3. `packages/engine/test/integration/fitl-events-1968-nva.test.ts` — canonical card-41 schema assertions.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/event-execution-targets.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-bombing-pause.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-events-1968-nva.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`
7. `pnpm -F @ludoforge/engine typecheck`

## Outcome

- Completion date: 2026-03-07
- What changed:
  - Added canonical event-target contract fields (`application`, `effects`) in event target types/schema.
  - Implemented target-local lowering in `event-execution`:
    - target selection is synthesized first.
    - target-owned effects are synthesized next with deterministic `each` fan-out via generated `forEach`, or single-run `aggregate`.
  - Migrated FITL Bombing Pause (`card-41`) from authored manual `forEach` workaround to target-owned `effects` with `application: each`.
  - Added `application: aggregate` to existing authored FITL event targets for explicit canonical contract.
  - Updated/expanded unit and integration tests for target lowering and canonical Bombing Pause shape.
  - Regenerated schema artifacts (`packages/engine/schemas/GameDef.schema.json` and companion artifacts).
- Deviations from original plan:
  - Ticket scope was refined before implementation to avoid ambiguous mixed-effect behavior; architecture was tightened to target-local effects ownership.
  - Validation coverage for target coherence is currently schema-level (`each` requires non-empty target `effects`) rather than adding a separate behavior-validator pass.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/event-execution-targets.test.js` passed.
  - `node --test packages/engine/dist/test/integration/fitl-events-bombing-pause.test.js` passed.
  - `node --test packages/engine/dist/test/integration/fitl-events-1968-nva.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (435/435).
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm -F @ludoforge/engine typecheck` passed.
