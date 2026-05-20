# 186ADVTURNPLAN-002A: Plan cap/max-step IR prerequisite

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `cnl` schema/types/compiler artifacts for plan cap metadata
**Deps**: `archive/tickets/186ADVTURNPLAN-001.md`

## Problem

`186ADVTURNPLAN-002` must validate that plan templates have statically named bounded-computation caps and a max step count, but the live `186ADVTURNPLAN-001` IR does not yet expose those fields. Foundation #10 requires named bounded caps, and Foundation #12 requires compile-time validation for spec-derivable constraints. The missing IR surface must land before the validator ticket can truthfully implement those diagnostics.

## Assumption Reassessment (2026-05-20)

1. `GameSpecPlanTemplateDef` currently exposes `traceLabel`, `root`, `roles`, `steps`, `postureHook`, and `fallback`, but no plan cap class or max-step-count field.
2. `CompiledPlanTemplate` likewise lacks the cap/max-step metadata that later proposer/evaluator and validation work need.
3. `186ADVTURNPLAN-002` cannot honestly validate missing or out-of-range plan cap classes until this ticket adds the generic authored and compiled fields.

## Architecture Check

1. The fields are generic plan metadata, not game-specific logic (Foundation #1).
2. The cap fields make bounded computation statically named and compiler-visible (Foundation #10).
3. Adding the IR surface first keeps validation in `002` spec-derivable instead of deferring defects to runtime (Foundation #12).

## What to Change

### 1. Authored and compiled plan cap surface

Add a generic `caps` block to authored plan templates and compiled plan templates. The block must carry a statically named cap class and a max-step count sufficient for `002` to validate required presence, allowed class names, and bounds.

### 2. Compiler lowering and schema artifacts

Lower the new fields deterministically from GameSpecDoc to GameDef, update generated schema artifacts as required, and keep the existing valid plan-template fixture compiling once it declares the new fields.

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify or regenerate)
- `packages/engine/src/cnl/compile-agent-plan-templates.ts` (modify)
- `packages/engine/test/unit/cnl/agent-plan-template-compile.test.ts` (modify)

## Out of Scope

- Full §4.7 validation corpus (`186ADVTURNPLAN-002`).
- `routePairs`/`subset` selector source variants (`186ADVTURNPLAN-003`).
- Runtime plan proposal or execution (`004`-`006`).

## Acceptance Criteria

### Tests That Must Pass

1. A valid plan template with a named cap class and max-step count compiles and records those values in GameDef.
2. Compiling the same doc twice remains byte-identical.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Plan cap metadata is generic and contains no game-specific identifiers.
2. The authored and compiled artifacts expose enough static data for `186ADVTURNPLAN-002` to validate named cap classes and max-step bounds.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/agent-plan-template-compile.test.ts` — extend the valid plan-template compile fixture to assert cap/max-step metadata is lowered deterministically.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/cnl/agent-plan-template-compile.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
