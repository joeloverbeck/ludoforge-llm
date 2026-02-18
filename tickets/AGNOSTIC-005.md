# AGNOSTIC-005: Resolve `GameDef.factions` Contract (Wire or Remove Dead Field)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes
**Deps**: None

## Problem

`GameDef` now includes optional `factions`, but compilation currently emits `null`/omits it in normal data-asset flows. This leaves an underdefined contract in core schema/types.

Affected paths include:
- `packages/engine/src/kernel/types-core.ts`
- `packages/engine/src/kernel/schemas-core.ts`
- `packages/engine/src/cnl/compiler-core.ts`
- `packages/engine/src/cnl/compile-data-assets.ts`

## What Must Change

1. Choose one explicit architecture direction and implement it end-to-end:
- Option A: fully wire `factions` derivation from canonical data assets/spec sections and validate references.
- Option B: remove `factions` from core GameDef until a complete generic source-of-truth exists.

2. Ensure schema, types, compiler output, and tests align with the chosen direction.

3. Add validation to prevent partial/placeholder faction definitions in compiled output.

## Invariants

1. No dead/placeholder top-level contract exists in `GameDef`.
2. If `factions` exists, it is derived deterministically from game data and passes schema validation.
3. If `factions` does not exist, no runtime path depends on it.
4. Contract remains game-agnostic and data-driven.

## Tests That Should Pass

1. `packages/engine/test/unit/schemas-top-level.test.ts`
- Update expected GameDef top-level schema behavior for chosen direction.

2. `packages/engine/test/unit/compiler-structured-results.test.ts`
- Add assertion that compiler output consistently includes/excludes `factions` per chosen contract.

3. `packages/engine/test/integration/compile-pipeline.test.ts`
- Regression coverage for end-to-end compiled GameDef shape.

4. `pnpm -F @ludoforge/engine test`
