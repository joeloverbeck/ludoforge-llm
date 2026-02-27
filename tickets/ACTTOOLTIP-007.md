# ACTTOOLTIP-007: Split reduce binder provenance to eliminate ambiguous macroOrigin display semantics

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/types-ast.ts`, `packages/engine/src/cnl/expand-effect-macros.ts`, `packages/engine/src/kernel/ast-to-display.ts`, compile/validate/schema + tests
**Deps**: ACTTOOLTIP-005, ACTTOOLTIP-006

## Problem

`reduce` currently stores a single `macroOrigin` at effect level while having multiple binders (`itemBind`, `accBind`, `resultBind`).

Current annotation sets `reduce.macroOrigin` using `resultBind` provenance, but rendering uses that same metadata when displaying `itemBind`. This can produce misleading binder names in tooltip/display text and weakens provenance correctness.

## Assumption Reassessment (2026-02-27)

1. `expand-effect-macros.ts` currently annotates `reduce` provenance using `resultBind` (`BINDING_ORIGIN_EFFECT_SPECS` includes `['reduce', ['resultBind']]`) — confirmed.
2. `ast-to-display.ts` currently renders the first reduce binder (`itemBind`) with `effect.reduce.macroOrigin?.stem ?? effect.reduce.itemBind` semantics (now via `bindDisplay`) — confirmed.
3. Existing active tickets (`ACTTOOLTIP-005`, `ACTTOOLTIP-006`) focus on `removeByPriority` canonicalization and compile/validate regression coverage; they do not address `reduce` multi-binder provenance ambiguity — confirmed.

## Architecture Check

1. Per-binder provenance is cleaner and more robust than a single shared provenance field for a multi-binder effect; it prevents semantic drift and ambiguous display output.
2. This remains compiler-owned metadata in generic engine AST/contracts. It does not introduce game-specific behavior into GameDef/runtime/simulation.
3. No backwards-compatibility aliasing/shims: replace ambiguous `reduce.macroOrigin` contract with explicit binder-level contract and update all call sites.

## What to Change

### 1. Replace ambiguous `reduce.macroOrigin` with explicit per-binder provenance fields

Introduce explicit provenance fields on reduce AST/core schema (for example: `itemMacroOrigin`, `accMacroOrigin`, `resultMacroOrigin`) or an equivalent typed map keyed by binder role.

Annotation in `expand-effect-macros.ts` must resolve provenance independently per reduce binder and mark each trusted provenance payload.

### 2. Update display/compile/validate to consume explicit binder provenance

- `ast-to-display.ts`: item binder display must use only item-binder provenance; never reuse result provenance.
- compile/validate/schemas: enforce compiler-owned metadata rules for each new reduce provenance field.
- remove obsolete single-field logic and tests that encode ambiguous semantics.

## Files to Touch

- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/expand-effect-macros.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/cnl/validate-actions.ts` (modify)
- `packages/engine/src/kernel/ast-to-display.ts` (modify)
- `packages/engine/test/unit/expand-effect-macros.test.ts` (modify)
- `packages/engine/test/unit/kernel/ast-to-display.test.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)
- `packages/engine/test/unit/validate-spec.test.ts` (modify)

## Out of Scope

- `removeByPriority` parent-origin canonicalization semantics (covered by ACTTOOLTIP-005)
- visual styling/layout behavior
- game-specific content YAML changes

## Acceptance Criteria

### Tests That Must Pass

1. `reduce` display uses the correct binder-specific provenance for each rendered binder.
2. Macro expansion emits trusted per-binder reduce provenance metadata with no ambiguity.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Multi-binder effects must not share a single provenance field when binder roles can diverge.
2. Provenance metadata remains compiler-owned and forbidden in authored GameSpecDoc.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/expand-effect-macros.test.ts` — add reduce case with distinct binder stems and assert per-binder provenance correctness.
2. `packages/engine/test/unit/kernel/ast-to-display.test.ts` — add reduce case proving item binder display does not consume result binder provenance.
3. `packages/engine/test/unit/compile-effects.test.ts` — update macroOrigin contract assertions for new reduce provenance fields.
4. `packages/engine/test/unit/validate-spec.test.ts` — verify authored reduce provenance fields are rejected across setup/turn/actions surfaces.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo lint`
4. `pnpm turbo test`
