# FITLEVENTARCH-001: Event Target Application Semantics for Multi-Select Targets

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — event execution target/effect composition, event schema/types, move validation tests
**Deps**: specs/29-fitl-event-card-encoding.md, reports/fire-in-the-lake-rules-section-5.md

## Problem

Event cards with multi-select targets currently bind selected values as arrays, but most effect primitives consume scalar selectors. This forces per-card `forEach` workarounds in game data (`GameSpecDoc`) for behavior that is actually generic event semantics. The result is extra boilerplate, higher authoring risk, and weaker event DSL ergonomics.

## Assumption Reassessment (2026-03-07)

1. `synthesizeEventTargetEffects` in `packages/engine/src/kernel/event-execution.ts` emits `chooseN` for multi-select targets, binding arrays to target IDs.
2. Scalar effects such as `setMarker` resolve zone selectors with single-zone cardinality; passing the raw multi-select binding directly causes selector-cardinality/runtime failures unless wrapped in manual iteration.
3. Current FITL data already carries this workaround burden (for example `card-41` now uses explicit `forEach` around `setMarker`), confirming the issue is architectural, not card-specific.

## Architecture Check

1. Event-target fan-out behavior belongs in game-agnostic event execution semantics, not repeated in game-specific YAML. Centralizing it reduces duplicated logic and authoring defects.
2. This preserves boundaries: `GameSpecDoc` declares *what* targets/effects exist; kernel decides *how* multi-target application is executed. No FITL-specific branching is introduced.
3. No backwards-compatibility shims: define and enforce one canonical contract for event multi-target application and migrate data to it.

## What to Change

### 1. Introduce explicit event target application mode in event contracts

Extend event target definitions with an explicit application mode for bound values:
- `each` (apply target-scoped effects once per selected target value)
- `aggregate` (preserve current array binding semantics for advanced collective effects)

Adopt `each` as the canonical mode for zone-targeting event patterns.

### 2. Implement kernel-level lowering/execution for `each` targets

In event execution, lower `each` targets into deterministic per-target effect application without requiring YAML authors to write explicit `forEach` wrappers. Ensure ordering is stable and deterministic.

### 3. Add strict validation rules for target/effect compatibility

Add behavior validation checks so event definitions using scalar-only effects with aggregate-only target bindings fail fast with clear diagnostics.

## Files to Touch

- `packages/engine/src/kernel/types-events.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/event-execution.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/integration/fitl-events-bombing-pause.test.ts` (modify)
- `packages/engine/test/integration/event-effect-timing.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-1968-nva.test.ts` (modify)

## Out of Scope

- Runner UI or visual-config changes
- Game-specific event balancing/content decisions
- Non-event action DSL redesign

## Acceptance Criteria

### Tests That Must Pass

1. Multi-select event targets configured for `each` can drive scalar effects (`setMarker`, `addVar` where applicable) without manual YAML `forEach` wrappers.
2. Event definitions that violate target application compatibility fail validation with deterministic, actionable diagnostics.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Event target application semantics are engine-defined, deterministic, and game-agnostic.
2. `GameSpecDoc` does not require per-card structural workarounds for generic multi-target event behavior.

## Tests

1. Add/modify integration tests proving `each` target lowering executes exactly once per selected target and in deterministic order.
2. Add validation tests proving invalid target/effect combinations are rejected before runtime.
3. Verify no regressions in existing event timing/decision sequencing.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-bombing-pause.test.ts` — remove workaround expectation and assert canonical `each` behavior.
2. `packages/engine/test/integration/event-effect-timing.test.ts` — verify event target lowering ordering and timing invariants.
3. `packages/engine/test/unit/kernel/validate-gamedef-behavior.test.ts` (or nearest existing validation suite) — add compatibility validation coverage.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-bombing-pause.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`
