# ACTTOOLTIP-004: Extract binding-origin helpers and remove annotation boilerplate

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/ast-to-display.ts`, `packages/engine/src/cnl/expand-effect-macros.ts`, `packages/engine/test/unit/kernel/ast-to-display.test.ts`, `packages/engine/test/unit/expand-effect-macros.test.ts`
**Deps**: ACTTOOLTIP-002 (bind display behavior for `removeByPriority`)

## Problem

Two DRY violations exist in the current implementation:

### A. Repeated `macroOrigin?.stem ?? bind` display fallback in `ast-to-display.ts`

`effectToDisplayNodes` repeats the same fallback policy across multiple effect renderers. This duplicates a single policy decision (prefer human stem, fallback to hygienic bind) and increases drift risk when new bind-bearing effect renderers are added.

### B. Repeated check-lookup-annotate logic in `expand-effect-macros.ts`

`annotateControlFlowMacroOrigins` contains three structurally similar annotation blocks:
1. single-bind effects (`let`, `bindValue`, `chooseOne`, `chooseN`, `rollRandom`, `transferVar`)
2. `removeByPriority` (`groups[].bind` + `remainingBind` + parent annotation)
3. `evaluateSubset` (first matching bind among multiple bind fields)

The logic is currently correct but duplicated, making future extension harder and increasing regression surface.

## Assumption Reassessment (2026-02-27)

1. `EffectMacroOrigin` type location in this repo is `packages/engine/src/kernel/types-ast.ts`, not `packages/engine/src/cnl/types-ast.ts`.
2. Unit test file location is `packages/engine/test/unit/expand-effect-macros.test.ts`, not `packages/engine/test/unit/cnl/expand-effect-macros.test.ts`.
3. `ast-to-display.ts` still has repeated `macroOrigin?.stem ?? ...` patterns in control-flow and choice renderers.
4. `expand-effect-macros.ts` still has duplicated macro-origin annotation logic, but current line ranges are broader than earlier assumptions.
5. Existing tests do not fully cover macroOrigin annotation parity for all bind-bearing effect variants (notably `bindValue`, `chooseN`, `rollRandom`, `transferVar`, `evaluateSubset`), so relying on existing tests alone is insufficient for this refactor.

## Architecture Reassessment

1. The refactor is beneficial and aligns with long-term architecture: one policy point for bind display; one reusable annotation primitive.
2. A single mega-table that treats `removeByPriority` exactly like simple effects is not ideal. `removeByPriority` has unique nested semantics (`groups[].bind` fallback) and should keep a specialized helper path while still sharing a common low-level primitive.
3. No game-specific behavior is introduced. All changes remain generic compiler/kernel infrastructure.
4. No backward-compatibility shims or aliases should be added.

## What to Change

### 1. Extract `bindDisplay` helper in `ast-to-display.ts`

Add a module-private helper and use it for bind display fallback:

```ts
function bindDisplay(bind: string, macroOrigin?: EffectMacroOrigin): string {
  return macroOrigin?.stem ?? bind;
}
```

Replace repeated inline fallbacks in effect rendering with helper calls.

### 2. Extract reusable annotation primitive(s) in `expand-effect-macros.ts`

Introduce a shared helper for single-node effect annotation logic (check effect record, select first matching bind field from `originByBinding`, compare existing origin + trust marker, annotate if needed).

Then structure `annotateControlFlowMacroOrigins` as:
1. shared helper for simple bind effects (`let`, `bindValue`, `chooseOne`, `chooseN`, `rollRandom`, `transferVar`)
2. specialized helper for `removeByPriority` (group-level annotation + parent fallback semantics)
3. shared helper usage for `evaluateSubset` multi-bind scan

Do not alter annotation semantics.

## Files to Touch

- `packages/engine/src/kernel/ast-to-display.ts` (modify)
- `packages/engine/src/cnl/expand-effect-macros.ts` (modify)
- `packages/engine/test/unit/kernel/ast-to-display.test.ts` (modify)
- `packages/engine/test/unit/expand-effect-macros.test.ts` (modify)

## Out of Scope

- New effect types or changed runtime behavior
- Changing authored-spec validation behavior for `macroOrigin`
- Public API changes

## Acceptance Criteria

### Tests That Must Pass

1. Updated `ast-to-display` unit tests pass.
2. Updated `expand-effect-macros` unit tests pass.
3. Full engine suite passes: `pnpm -F @ludoforge/engine test`.
4. Workspace checks pass for changed code paths: `pnpm turbo lint` and `pnpm turbo test`.

### Invariants

1. Display output remains behaviorally identical except where tests explicitly codify existing intended stem fallback behavior.
2. Macro-origin annotation output structure and trust markers remain semantically identical.
3. Helpers remain module-private.

## Test Plan

### New/Modified Tests

1. Add/extend `ast-to-display` unit tests to assert stem fallback behavior for bind-bearing effect renderers that were previously under-covered.
2. Add/extend `expand-effect-macros` unit tests to cover macroOrigin annotation for under-covered bind-bearing effect variants (`bindValue`, `chooseN`, `rollRandom`, `transferVar`, `evaluateSubset`) and preserve `removeByPriority` semantics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo lint`
4. `pnpm turbo test`

## Completion

When implementation and verification are complete:
1. Mark this ticket status as `COMPLETED`.
2. Add an `Outcome` section describing what changed vs. the original plan.
3. Move this ticket to `archive/tickets/` per `docs/archival-workflow.md`.

## Outcome

- **Completion date**: 2026-02-27
- **What changed**:
  - Extracted module-private `bindDisplay` helper in `packages/engine/src/kernel/ast-to-display.ts` and replaced repeated stem-fallback logic in bind-bearing effect renderers.
  - Refactored `annotateControlFlowMacroOrigins` in `packages/engine/src/cnl/expand-effect-macros.ts` using reusable module-private helpers:
    - generic bind-field origin lookup + annotation primitive
    - shared effect-key annotation helper
    - specialized `removeByPriority` annotation helper preserving nested group/remaining semantics
  - Strengthened tests:
    - `packages/engine/test/unit/kernel/ast-to-display.test.ts`
    - `packages/engine/test/unit/expand-effect-macros.test.ts`
- **Deviations from original plan**:
  - Added/expanded tests instead of relying on existing coverage only; existing tests did not fully cover all bind-bearing effect variants involved in annotation/display fallback behavior.
  - Kept `removeByPriority` in a specialized helper path rather than forcing it into a flat single-table implementation, to preserve clarity around its nested fallback semantics.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo lint` ✅
  - `pnpm turbo test` ✅
