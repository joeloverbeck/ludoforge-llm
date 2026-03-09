# ENG-222: Replace String-Suffix Control Flow in Sequence-Context Scope Consumers

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel control-flow metadata shape for sequence-context scope consumers
**Deps**: packages/engine/src/kernel/effect-sequence-context-scope.ts, packages/engine/src/kernel/effect-grant-sequence-context-paths.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts, archive/tickets/ENG/ENG-221-effect-sequence-context-scope-matrix-coverage.md, archive/tickets/ENG/ENG-219-reject-nested-sequence-context-grants-in-evaluate-subset-compute.md

## Problem

The new shared scope helper removed one major duplication, but `effect-grant-sequence-context-paths.ts` still interprets returned children by matching string suffixes like `.if.then`, `.if.else`, `.forEach.effects`, and `.forEach.in`. That leaves control-flow semantics partially encoded in consumer-side string matching rather than fully owned by the shared helper. The result is cleaner than before, but still more brittle than it should be.

## Assumption Reassessment (2026-03-09)

1. `getNestedEffectSequenceContextScopes` currently returns `{ effects, pathSuffix, scope }` entries and is shared by validator and linkage traversal.
2. `effect-grant-sequence-context-paths.ts` still branches on specific `pathSuffix` strings for `if` and `forEach` to recover branch-vs-continuation semantics.
3. `validate-gamedef-behavior.ts` is not part of that semantic mismatch today; it consumes the helper generically for traversal and diagnostic path construction only.
4. Mismatch: control-flow ownership is shared only partially. Correction: make the helper expose typed child-plan metadata so consumers no longer infer semantics from string suffix values.

## Architecture Check

1. Typed child-plan metadata is cleaner and more extensible than stringly suffix matching because semantics stay attached to structure, not to serialized path fragments.
2. This preserves the `GameSpecDoc` vs agnostic engine boundary: the change is generic `EffectAST` control-flow infrastructure with no game-specific branching or schema specialization.
3. No backwards-compatibility layer is needed; consumers should move directly to the new canonical helper output and delete suffix-driven branching.

## What to Change

### 1. Introduce typed nested-child descriptors

Refine `effect-sequence-context-scope.ts` so it returns explicit child descriptors for control-flow semantics, for example child kind/role and path contribution, rather than only raw `pathSuffix` strings.

### 2. Migrate consumers off suffix matching

Update `effect-grant-sequence-context-paths.ts` to consume the typed descriptors directly for branch and continuation behavior, and keep `validate-gamedef-behavior.ts` aligned on the same helper output shape for generic traversal/path construction.

### 3. Add architecture guards

Extend focused tests so future edits cannot reintroduce string-suffix branching in the sequence-context scope consumers.

## Files to Touch

- `packages/engine/src/kernel/effect-sequence-context-scope.ts` (modify)
- `packages/engine/src/kernel/effect-grant-sequence-context-paths.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify only if helper shape changes require it)
- `packages/engine/test/unit/kernel/effect-sequence-context-scope.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-grant-sequence-context-paths-policy.test.ts` (new or equivalent focused guard)

## Out of Scope

- Changing runtime behavior of `if`, `forEach`, or `evaluateSubset`
- Broad generic walker refactors unrelated to sequence-context scope ownership
- Any `GameSpecDoc`, data asset, runner, or `visual-config.yaml` changes

## Acceptance Criteria

### Tests That Must Pass

1. Sequence-context scope consumers no longer branch on hardcoded child suffix strings to recover control-flow meaning.
2. The helper remains the single canonical owner of nested effect sequence-context scope semantics.
3. `validate-gamedef-behavior.ts` may continue using serialized suffix text for diagnostic path assembly, but not for control-flow semantics.
4. Existing suite: `node --test packages/engine/dist/test/unit/kernel/effect-sequence-context-scope.test.js`

### Invariants

1. Control-flow metadata for sequence-context persistence is represented structurally, not inferred from serialized path strings.
2. `GameDef` validation and linkage traversal remain fully game-agnostic and introduce no compatibility aliases.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-sequence-context-scope.test.ts` — add assertions that typed child descriptors drive consumer behavior without suffix-based control-flow recovery.
2. `packages/engine/test/unit/kernel/effect-grant-sequence-context-paths-policy.test.ts` — add a source-level regression guard that forbids `.find(...pathSuffix === ...)` style semantic branching in the linkage walker.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-sequence-context-scope.test.js`
3. `node --test packages/engine/dist/test/unit/lint/effect-grant-sequence-context-paths-policy.test.js`
4. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-09
- What actually changed: `getNestedEffectSequenceContextScopes` now returns helper-owned traversal metadata in addition to `pathSuffix`; `effect-grant-sequence-context-paths.ts` consumes that metadata instead of inferring `if`/`forEach` semantics from suffix strings; focused behavior and policy tests were strengthened.
- Deviations from original plan: `validate-gamedef-behavior.ts` did not require modification because it was already using the helper generically for traversal/path construction rather than suffix-based semantic branching. The regression guard was added under `packages/engine/test/unit/lint/` as the fitting location for source-policy enforcement.
- Verification results: `pnpm -F @ludoforge/engine build`, `pnpm -F @ludoforge/engine lint`, `node --test packages/engine/dist/test/unit/kernel/effect-sequence-context-scope.test.js`, `node --test packages/engine/dist/test/unit/lint/effect-grant-sequence-context-paths-policy.test.js`, and `pnpm -F @ludoforge/engine test` all passed.
