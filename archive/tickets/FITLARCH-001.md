# FITLARCH-001: Explicit Internal-Zone Contract for Game-Agnostic Runner Isolation

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes
**Deps**: None

## Problem

Runner behavior and tests depended on `__scenario_deck_*` prefix conventions to identify compiler-internal zones. This was brittle and not extensible for a generic `GameSpecDoc -> GameDef -> simulator` architecture where game-specific content should remain in data and engine/runner logic should consume explicit contracts, not naming heuristics.

## Assumption Reassessment (2026-02-24)

1. Prior assumption in this ticket was runner-only; this was incorrect.
2. Codebase discrepancy: internal-zone handling was encoded by string prefix checks in runner paths and tests, rather than a schema/type-level contract.
3. Corrected assumption: zone internality must be declared in shared game-agnostic contracts (`GameSpecDoc`/compiled `GameDef`) and consumed consistently by runner layout/render/validation paths.
4. Existing tests covered prefix behavior but under-covered explicit internal-zone invariants.

## Architecture Decision

1. Introduce explicit `zone.isInternal?: boolean` in engine core + CNL schema/types.
2. Mark compiler-synthesized scenario-deck zones as `isInternal: true` at materialization source.
3. Update runner invariants and runtime paths to filter by `isInternal` rather than prefix naming.
4. Keep simulator/runner game-agnostic: no per-game aliasing, no backwards-compat shims, no reliance on string naming conventions.

## What Changed

### Engine/CNL Contract

- Added `isInternal?: boolean` to:
  - `packages/engine/src/kernel/types-core.ts`
  - `packages/engine/src/kernel/schemas-core.ts`
  - `packages/engine/src/cnl/game-spec-doc.ts`
- Validation updates:
  - `packages/engine/src/cnl/validate-spec-shared.ts` allows `isInternal` in zone keys.
  - `packages/engine/src/cnl/validate-zones.ts` validates `isInternal` is boolean.
- Compilation updates:
  - `packages/engine/src/cnl/compile-zones.ts` preserves `isInternal`.
  - `packages/engine/src/cnl/compiler-core.ts` sets `isInternal: true` on synthetic scenario-deck zones.

### Runner Isolation Behavior

- Internal zones excluded from presentation-facing flows in:
  - `packages/runner/src/config/validate-visual-config-refs.ts`
  - `packages/runner/src/layout/build-layout-graph.ts`
  - `packages/runner/src/layout/layout-helpers.ts`
  - `packages/runner/src/model/derive-render-model.ts`
- Bootstrap fixture regenerated:
  - `packages/runner/src/bootstrap/fitl-game-def.json` now carries explicit `isInternal` on synthetic zones.

### Out of Scope (Still Unchanged)

- FITL gameplay/rules behavior.
- Per-game simulator branching.

## Acceptance Criteria (Final)

1. Internal-zone isolation is based on explicit contract (`isInternal`) rather than prefix aliases.
2. Presentation/layout/render logic ignores internal zones unless explicitly required.
3. Runner and engine tests validate explicit-internal semantics.
4. Lint and relevant test suites pass.

## Test Plan (Executed)

### New/Modified Tests

1. `packages/engine/test/unit/compile-zones.test.ts` (modified)
2. `packages/engine/test/unit/scenario-deck-composition-materialization.test.ts` (modified)
3. `packages/engine/test/unit/validate-spec.test.ts` (modified)
4. `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` (modified)
5. `packages/runner/test/config/validate-visual-config-refs.test.ts` (modified)
6. `packages/runner/test/config/visual-config-files.test.ts` (modified)
7. `packages/runner/test/layout/build-layout-graph.test.ts` (modified)
8. `packages/runner/test/model/derive-render-model-zones.test.ts` (modified)

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compile-zones.test.js packages/engine/dist/test/unit/scenario-deck-composition-materialization.test.js packages/engine/dist/test/unit/validate-spec.test.js`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm turbo lint`
5. `pnpm turbo test`

## Outcome

- Completed on: 2026-02-24
- What was actually changed vs originally planned:
  - Originally planned: runner-test-only scoping of internal scenario-deck zones by prefix.
  - Actually changed: elevated internal-zone isolation into explicit engine/CNL contract (`isInternal`) and migrated runner/runtime/tests to consume the contract directly.
- Deviations from original plan:
  - Scope expanded from runner-only to engine + runner to remove brittle naming heuristics and support long-term game-agnostic extensibility.
  - Kept no backwards compatibility aliasing for prefix-based semantics.
- Verification:
  - Focused engine unit tests and full runner test suite passed.
  - Workspace lint and workspace test gates passed.
