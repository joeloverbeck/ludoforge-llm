# ENG-222: Replace String-Suffix Control Flow in Sequence-Context Scope Consumers

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel control-flow metadata shape for sequence-context scope consumers
**Deps**: packages/engine/src/kernel/effect-sequence-context-scope.ts, packages/engine/src/kernel/effect-grant-sequence-context-paths.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts, archive/tickets/ENG/ENG-221-effect-sequence-context-scope-matrix-coverage.md, archive/tickets/ENG/ENG-219-reject-nested-sequence-context-grants-in-evaluate-subset-compute.md

## Problem

The new shared scope helper removed one major duplication, but `effect-grant-sequence-context-paths.ts` still interprets returned children by matching string suffixes like `.if.then`, `.if.else`, `.forEach.effects`, and `.forEach.in`. That leaves control-flow semantics partially encoded in consumer-side string matching rather than fully owned by the shared helper. The result is cleaner than before, but still more brittle than it should be.

## Assumption Reassessment (2026-03-09)

1. `getNestedEffectSequenceContextScopes` currently returns `{ effects, pathSuffix, scope }` entries and is shared by validator and linkage traversal.
2. `validate-gamedef-behavior.ts` consumes that helper generically, but `effect-grant-sequence-context-paths.ts` still branches on specific `pathSuffix` strings for `if` and `forEach`.
3. Mismatch: control-flow ownership is shared only partially. Correction: make the helper expose typed child-plan metadata so consumers no longer infer semantics from string suffix values.

## Architecture Check

1. Typed child-plan metadata is cleaner and more extensible than stringly suffix matching because semantics stay attached to structure, not to serialized path fragments.
2. This preserves the `GameSpecDoc` vs agnostic engine boundary: the change is generic `EffectAST` control-flow infrastructure with no game-specific branching or schema specialization.
3. No backwards-compatibility layer is needed; consumers should move directly to the new canonical helper output and delete suffix-driven branching.

## What to Change

### 1. Introduce typed nested-child descriptors

Refine `effect-sequence-context-scope.ts` so it returns explicit child descriptors for control-flow semantics, for example child kind/role and path contribution, rather than only raw `pathSuffix` strings.

### 2. Migrate consumers off suffix matching

Update `effect-grant-sequence-context-paths.ts` to consume the typed descriptors directly for branch and continuation behavior, and keep `validate-gamedef-behavior.ts` aligned on the same helper output.

### 3. Add architecture guards

Extend focused tests so future edits cannot reintroduce string-suffix branching in the sequence-context scope consumers.

## Files to Touch

- `packages/engine/src/kernel/effect-sequence-context-scope.ts` (modify)
- `packages/engine/src/kernel/effect-grant-sequence-context-paths.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify if helper shape changes)
- `packages/engine/test/unit/kernel/effect-sequence-context-scope.test.ts` (modify)

## Out of Scope

- Changing runtime behavior of `if`, `forEach`, or `evaluateSubset`
- Broad generic walker refactors unrelated to sequence-context scope ownership
- Any `GameSpecDoc`, data asset, runner, or `visual-config.yaml` changes

## Acceptance Criteria

### Tests That Must Pass

1. Sequence-context scope consumers no longer branch on hardcoded child suffix strings to recover control-flow meaning.
2. The helper remains the single canonical owner of nested effect sequence-context scope semantics.
3. Existing suite: `node --test packages/engine/dist/test/unit/kernel/effect-sequence-context-scope.test.js`

### Invariants

1. Control-flow metadata for sequence-context persistence is represented structurally, not inferred from serialized path strings.
2. `GameDef` validation and linkage traversal remain fully game-agnostic and introduce no compatibility aliases.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-sequence-context-scope.test.ts` — add assertions that typed child descriptors drive consumer behavior without suffix-based control-flow recovery.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-sequence-context-scope.test.js`
3. `pnpm -F @ludoforge/engine test`
