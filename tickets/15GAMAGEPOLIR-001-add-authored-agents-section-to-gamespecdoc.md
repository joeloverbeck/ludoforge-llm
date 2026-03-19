# 15GAMAGEPOLIR-001: Add Authored `agents` Section to `GameSpecDoc`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — CNL authoring schema and validation surface only
**Deps**: specs/15-gamespec-agent-policy-ir.md, specs/14-evolution-pipeline.md

## Problem

`GameSpecDoc` cannot currently author first-class policy data. Until the authoring surface exists as a bounded typed section, every later compiler/runtime task would be forced to invent ad hoc shapes or leak game-specific policy logic outside authored game data.

## Assumption Reassessment (2026-03-19)

1. The current repo has `packages/engine/src/cnl/game-spec-doc.ts` and validation layers, but no authored `agents` section in the public `GameSpecDoc` contract.
2. Spec 15 requires maps keyed by ids, not array-heavy authoring, and explicitly separates authoring data from compiled runtime IR.
3. Corrected scope: this ticket should only add the authoring model and structural validation. It must not lower policies into runtime IR or implement evaluation behavior.

## Architecture Check

1. Adding a dedicated `agents` authoring section is cleaner than smuggling policy knobs into existing metadata or scenario sections because it keeps the mutation surface explicit and isolated.
2. This preserves the agnostic-engine boundary by keeping game-specific policy declarations inside `GameSpecDoc` instead of runtime code branches.
3. No backwards-compatibility alias path should be added for older ad hoc bot configuration names.

## What to Change

### 1. Extend the public `GameSpecDoc` authoring types

Add the new top-level `agents` section and the Spec 15 authoring types for:

- parameter definitions
- library collections
- flat profile definitions
- seat-to-profile bindings
- policy-expression authoring nodes

### 2. Add structural validation for the new section

Validate shape-level rules that do not require full lowering yet:

- collections are maps keyed by ids
- profiles contain only `params` and ordered `use` lists
- bindings are `seatId -> profileId`
- inline anonymous logic inside profiles is rejected at the authoring-validation boundary

### 3. Add fixture coverage for valid and invalid authored shapes

Introduce minimal fixtures that prove the parser/compiler entrypoint accepts a valid `agents` block and rejects malformed top-level structure before deeper compilation starts.

## File List

- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/cnl/validate-spec-core.ts` (modify)
- `packages/engine/src/cnl/validate-spec.ts` (modify if needed)
- `packages/engine/test/unit/cnl/compile-agents-authoring.test.ts` (new)
- `packages/engine/test/fixtures/cnl/compiler/compile-agents-authoring-valid.md` (new)
- `packages/engine/test/fixtures/cnl/compiler/compile-agents-authoring-invalid.md` (new)

## Out of Scope

- lowering `agents` into `GameDef.agents`
- expression type-checking or dependency analysis
- policy runtime, preview, traces, runner, or CLI changes
- authored FITL or Texas Hold'em policy content

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/cnl/compile-agents-authoring.test.ts` proves a minimal valid `agents` section parses and reaches compilation.
2. `packages/engine/test/unit/cnl/compile-agents-authoring.test.ts` rejects malformed collection shapes, inline anonymous profile logic, and non-map bindings with explicit diagnostics.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `GameSpecDoc` remains the only place where game-specific authored policy data is introduced.
2. No runtime-only containers or executable policy behavior are added to authoring types.
3. Existing non-agent game specs continue compiling unchanged when `agents` is absent.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-agents-authoring.test.ts` — authoring-shape acceptance and rejection coverage.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm run check:ticket-deps`
