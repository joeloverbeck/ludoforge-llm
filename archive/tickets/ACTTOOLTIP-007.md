# ACTTOOLTIP-007: Split reduce binder provenance to eliminate ambiguous macro-origin semantics

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — AST/core contracts, macro expansion, lowering, runtime trace plumbing, display, validation, and targeted tests
**Deps**: ACTTOOLTIP-005, ACTTOOLTIP-006

## Problem

`reduce` currently stores a single `macroOrigin` at effect level while having multiple binders (`itemBind`, `accBind`, `resultBind`).

Current annotation sets `reduce.macroOrigin` from `resultBind` provenance (`expand-effect-macros.ts`), but display and trace consumers read that same metadata for other binder roles. This makes binder provenance ambiguous and can render misleading binder labels.

## Assumption Reassessment (2026-02-27)

1. `expand-effect-macros.ts` currently annotates reduce with `['reduce', ['resultBind']]` only — confirmed.
2. `ast-to-display.ts` renders the reduce item binder using `effect.reduce.macroOrigin?.stem ?? effect.reduce.itemBind` — confirmed.
3. Current tests in `expand-effect-macros`, `compile-effects`, `ast-to-display`, `validate-spec`, and `execution-trace` encode the single-field reduce provenance contract — confirmed.
4. Runtime trace surfaces (`effects-control.ts`, `control-flow-trace.ts`, `types-core.ts`, `schemas-core.ts`) also model reduce provenance as one optional field; this was missing from previous ticket scope and must be included for architectural consistency — discrepancy corrected.

## Architecture Check

1. Per-binder provenance is cleaner and more extensible than a shared field for a multi-binder effect; each binder role has independent semantics and should carry independent origin metadata.
2. The change remains compiler/kernel internal and game-agnostic.
3. No compatibility aliasing/shims: remove `reduce.macroOrigin` and migrate to explicit per-binder fields across AST, lowering, execution trace, schemas, and tests.

## What to Change

### 1. Replace ambiguous `reduce.macroOrigin` with explicit binder-level fields

Use explicit optional fields on reduce:
- `itemMacroOrigin`
- `accMacroOrigin`
- `resultMacroOrigin`

Macro expansion must annotate each field independently from its corresponding binder binding.

### 2. Update lowering/validation/display/runtime trace to consume explicit reduce provenance

- `compile-effects.ts`: parse and validate the new fields; remove legacy `reduce.macroOrigin` handling.
- `validate-actions.ts`: reject authored `reduce.itemMacroOrigin`, `reduce.accMacroOrigin`, and `reduce.resultMacroOrigin` as compiler-owned metadata.
- `ast-to-display.ts`: item binder display must use only `itemMacroOrigin`.
- Runtime trace plumbing (`effects-control.ts`, `control-flow-trace.ts`, core trace types/schemas): carry and emit per-binder reduce provenance fields.
- Remove obsolete single-field reduce provenance logic/tests.

## Files to Touch

- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-ast.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/expand-effect-macros.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/cnl/validate-actions.ts` (modify)
- `packages/engine/src/kernel/ast-to-display.ts` (modify)
- `packages/engine/src/kernel/effects-control.ts` (modify)
- `packages/engine/src/kernel/control-flow-trace.ts` (modify)
- `packages/engine/test/unit/expand-effect-macros.test.ts` (modify)
- `packages/engine/test/unit/kernel/ast-to-display.test.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)
- `packages/engine/test/unit/validate-spec.test.ts` (modify)
- `packages/engine/test/unit/control-flow-trace.test.ts` (modify)
- `packages/engine/test/unit/execution-trace.test.ts` (modify)

## Out of Scope

- `removeByPriority` parent-origin canonicalization semantics (covered by ACTTOOLTIP-005)
- visual styling/layout behavior
- game-specific content YAML changes

## Acceptance Criteria

### Tests That Must Pass

1. `reduce` display uses binder-role-specific provenance (`itemMacroOrigin`) with no reuse from other reduce binders.
2. Macro expansion emits trusted per-binder reduce provenance metadata (`item/acc/result`).
3. Lowering, validation, and runtime trace contracts accept only the new reduce provenance fields.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Multi-binder effects must not share a single provenance field when binder roles can diverge.
2. Provenance metadata remains compiler-owned and forbidden in authored GameSpecDoc.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/expand-effect-macros.test.ts` — assert reduce emits distinct per-binder provenance fields.
2. `packages/engine/test/unit/kernel/ast-to-display.test.ts` — assert reduce item display uses only item provenance.
3. `packages/engine/test/unit/compile-effects.test.ts` — migrate provenance contract assertions to reduce per-binder fields.
4. `packages/engine/test/unit/validate-spec.test.ts` — assert authored reduce binder provenance fields are rejected.
5. `packages/engine/test/unit/control-flow-trace.test.ts` — assert reduce trace builder preserves per-binder provenance fields.
6. `packages/engine/test/unit/execution-trace.test.ts` — assert runtime trace emits reduce per-binder provenance fields.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo lint`
4. `pnpm turbo test`

## Outcome

Implemented as planned, with one scope correction applied first:

1. Replaced ambiguous `reduce.macroOrigin` with explicit per-binder provenance fields (`itemMacroOrigin`, `accMacroOrigin`, `resultMacroOrigin`) across AST + compile/validate/display surfaces.
2. Extended the migration through runtime trace contracts/plumbing (`effects-control`, `control-flow-trace`, core trace types/schemas), which was missing from the original ticket scope and required for end-to-end contract consistency.
3. Updated and strengthened unit/integration coverage for expansion, compile, validation, display, and trace behavior; all required test/lint gates pass.
