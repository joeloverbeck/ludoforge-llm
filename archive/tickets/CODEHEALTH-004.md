# CODEHEALTH-004: Split compile-conditions.ts into cohesive lowering modules

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — CNL compiler refactor
**Deps**: specs/59-codebase-health-audit.md

## Problem

[packages/engine/src/cnl/compile-conditions.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/cnl/compile-conditions.ts) has grown to 2045 lines and currently owns condition lowering, value lowering, numeric lowering, query lowering, token-filter lowering, reference lowering, selector lowering, diagnostics helpers, and local capability registries in one file.

That size is now an architectural liability:

1. It is harder to reason about ownership and safe edit boundaries.
2. Seemingly small changes to one lowering family force editing a file that also owns unrelated logic.
3. The file’s internal recursion graph is non-trivial, so future “simple splits” risk creating circular imports or brittle utility dumping.

Spec 59 already identifies this file as a critical size violation, but there is no active ticket tracking a concrete decomposition plan.

## Assumption Reassessment (2026-03-14)

1. The file is currently 2045 lines, not the 1837 lines recorded when Spec 59 was written.
2. The stable public surface consumed elsewhere in the repo is broader than the original draft implied. Current direct downstream imports include:
   - `lowerConditionNode`
   - `lowerValueNode`
   - `lowerNumericValueNode`
   - `lowerQueryNode`
   - `lowerTokenFilterExpr`
   - `lowerScopedVarNameExpr`
   - `ConditionLoweringContext`
   - `ConditionLoweringResult`
3. The downstream import graph is broader than the original test-focused scope:
   - `compile-effects-choice.ts`, `compile-effects-core.ts`, `compile-effects-flow.ts`, `compile-effects-free-op.ts`, `compile-effects-token.ts`, `compile-effects-utils.ts`, `compile-effects-var.ts`, `compile-event-cards.ts`, `compile-lowering.ts`, `compile-victory.ts`, and `cnl/index.ts` all depend directly on `./compile-conditions.js`.
   - `compile-effects.test.ts`, `compile-conditions.test.ts`, and `compile-victory.test.ts` also import the same entrypoint directly.
4. The current implementation has meaningful mutual recursion:
   - `lowerConditionNode()` calls value and selector lowerers.
   - `lowerValueNode()` calls `lowerConditionNode()` for `if.when` and `lowerQueryNode()` through aggregate lowering.
   - `lowerQueryNode()` calls both `lowerConditionNode()` and `lowerValueNode()`.
   - `lowerNumericValueNode()` delegates back into value lowering.
   - token-filter and query helpers also depend on value lowering and shared diagnostics helpers.
5. Because of that recursion, a naive “one file per function family” split would likely create circular imports unless the split introduces an explicit internal wiring layer.
6. The original module plan in this ticket was internally inconsistent: it asked for `compile-conditions.ts` to become a thin composition root, but it did not provide a destination module for `lowerConditionNode()`. That must be corrected before implementation.
7. The active `CONOPESURREG` tickets do not handle this problem:
   - [tickets/CONOPESURREG-004.md](/home/joeloverbeck/projects/ludoforge-llm/tickets/CONOPESURREG-004.md) is about `zone-selector-aliases.ts`.
   - [tickets/CONOPESURREG-005.md](/home/joeloverbeck/projects/ludoforge-llm/tickets/CONOPESURREG-005.md) is about `validate-conditions.ts`.

## Architecture Check

1. The current architecture is serviceable but no longer clean. A 2045-line mutually recursive lowering module is now too large to preserve clear ownership or low-risk edit boundaries, even though its runtime behavior is currently correct.
2. The cleanest long-term design is not a flat utility split. The mutually recursive lowerers should be grouped into cohesive internal modules with an explicit thin wiring/facade layer that owns recursion and exports the stable public API.
3. Keeping `compile-conditions.ts` as a thin composition root is acceptable and cleaner than rewriting every internal import site. That file should become an entrypoint, not a second implementation home or compatibility shim.
4. To make that architecture honest, condition lowering itself must move into an internal module rather than remaining in the entrypoint.
5. This refactor is worthwhile relative to the current architecture because it improves edit isolation and maintainability without adding compatibility layers, alternate codepaths, or semantic churn. The split is beneficial only if it reduces coupling in implementation while preserving a single canonical export surface.
6. The split must preserve the agnostic-engine rule. This is strictly compiler-internal structure work; it must not introduce any game-specific branching or move behavior out of `GameSpecDoc`.
7. No alias operators, compatibility branches, or duplicate lowering paths should be introduced. There should be exactly one lowering implementation per construct after the split.

## What to Change

### 1. Introduce internal module boundaries around lowering families

Refactor `compile-conditions.ts` into a small set of cohesive sibling modules under `packages/engine/src/cnl/`:

1. `compile-conditions-shared.ts`
   - `ConditionLoweringContext`
   - `ConditionLoweringResult`
   - `ConditionLoweringRuntime`
   - shared small helpers such as `missingCapability()` and `isRecord()`
   - local constant registries that still belong to this subsystem, such as query/reference kind lists
2. `compile-conditions-conditions.ts`
   - `lowerConditionNode()`
   - condition-array / boolean-arity helpers
   - condition-only helpers such as zone relation parsing
3. `compile-conditions-values.ts`
   - value and numeric lowering
   - reference lowering
   - zone selector / zone ref lowering
   - scoped-var and aggregate helpers
4. `compile-conditions-token-filters.ts`
   - token-filter lowering and asset-row predicate helpers
   - named-set-related helpers used only by token-filter / query lowering
5. `compile-conditions-queries.ts`
   - `lowerQueryNode()`
   - query-specific helpers
6. `compile-conditions.ts`
   - thin composition root that wires the mutually recursive lowerers and re-exports the existing public API

Exact filenames may vary if implementation reveals a cleaner split, but the ticket should preserve the same architectural idea: small cohesive modules plus a thin entrypoint.

### 2. Use explicit wiring for mutual recursion

Do not solve recursion with ad hoc cross-imports.

Recommended approach:

1. Define an internal `ConditionLoweringRuntime` interface in a shared module describing the lowerers that other modules may call.
2. Implement module-local builder functions that accept the needed runtime callbacks.
3. Have the thin `compile-conditions.ts` entrypoint assemble those builders once and export the resulting top-level functions.
4. Do not leave a second copy of condition logic in the entrypoint after introducing runtime wiring.

This keeps dependencies directional and makes recursion explicit instead of hidden in import cycles.

### 3. Preserve the current public API and behavior

The split is structural, not semantic. After refactoring:

1. Existing imports from `./compile-conditions.js` inside the repo should continue to work.
2. All currently imported exports listed above remain available from `./compile-conditions.js`; no new public entrypoint should be required for internal consumers.
3. Diagnostics, warning ordering, and lowering semantics must remain unchanged.
4. The condition operator registry work from Spec 62 stays intact; this ticket must not reintroduce duplicate operator identity ownership.

### 4. Keep the scope bounded

Do not bundle unrelated cleanup into this ticket. In particular:

1. No semantic rewrites of token-filter behavior.
2. No changes to `ConditionAST`, `OptionsQuery`, or other kernel contracts.
3. No spillover refactors into `compile-effects-*`, `compile-victory.ts`, or `compile-lowering.ts` beyond import adjustments if required.

## Files to Touch

- `packages/engine/src/cnl/compile-conditions.ts` (modify into thin composition root)
- `packages/engine/src/cnl/compile-conditions-shared.ts` (new)
- `packages/engine/src/cnl/compile-conditions-conditions.ts` (new)
- `packages/engine/src/cnl/compile-conditions-values.ts` (new)
- `packages/engine/src/cnl/compile-conditions-token-filters.ts` (new)
- `packages/engine/src/cnl/compile-conditions-queries.ts` (new)
- `packages/engine/src/cnl/index.ts` (modify only if re-export wiring requires it)
- `packages/engine/test/unit/compile-conditions.test.ts` (modify only if coverage needs to pin recursion/order invariants)
- `packages/engine/test/unit/compile-effects.test.ts` (modify only if imports or coverage need adjustment)
- `packages/engine/test/unit/compile-victory.test.ts` (modify only if imports or coverage need adjustment)

## Out of Scope

- Changing condition/query/value semantics
- Refactoring `zone-selector-aliases.ts` or `validate-conditions.ts`
- Replacing the existing `compile-conditions.ts` public entrypoint with a new public module path
- Any game-specific compiler behavior
- Large adjacent refactors in other oversized files from Spec 59

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/src/cnl/compile-conditions.ts` is reduced to a thin entrypoint/composition layer and no longer contains the subsystem’s full implementation.
2. `lowerConditionNode()` no longer lives in the entrypoint; it is produced from an internal lowering module wired by the entrypoint.
3. Existing condition/value/query lowering behavior remains unchanged across the current unit suite.
4. Existing downstream consumers compiling effects, victory clauses, event cards, and top-level lowering continue to pass unchanged.
5. `pnpm -F @ludoforge/engine test` passes.
6. `pnpm turbo typecheck` passes.
7. `pnpm turbo lint` passes.

### Invariants

1. Lowering ownership remains single-path: each construct is lowered in exactly one implementation location.
2. The recursion between condition, value, and query lowering is explicit in wiring code, not hidden behind circular imports.
3. `compile-conditions.ts` remains the stable entrypoint for this subsystem, but not a second implementation dump.
4. No duplicate condition operator identity lists, no alias operators, and no backwards-compatibility branches are introduced.
5. The public export surface from `./compile-conditions.js` remains canonical; internal modules are implementation details, not alternate entrypoints for callers.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — preserve end-to-end lowering behavior and add targeted coverage for any explicit runtime-wiring/recursion invariant the split exposes.
2. `packages/engine/test/unit/compile-effects.test.ts` — verify downstream effect lowering still consumes the same public lowerers after the split.
3. `packages/engine/test/unit/compile-victory.test.ts` — verify another independent consumer still compiles through the unchanged entrypoint surface.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm turbo test`

## Outcome

- Completion date: 2026-03-14
- What actually changed:
  - Split the old `compile-conditions.ts` implementation into five modules:
    - `compile-conditions.ts` as a thin composition root
    - `compile-conditions-shared.ts`
    - `compile-conditions-conditions.ts`
    - `compile-conditions-values.ts`
    - `compile-conditions-token-filters.ts`
    - `compile-conditions-queries.ts`
  - Preserved the canonical public export surface from `./compile-conditions.js`.
  - Added a focused recursion/wiring regression test covering value -> condition -> query -> token-filter interactions.
  - Updated the predicate-shape lint-policy test to target the new canonical token-filter lowering module rather than the old monolithic file.
- Deviations from original plan:
  - The original ticket did not include a dedicated destination module for `lowerConditionNode()`. Implementation added `compile-conditions-conditions.ts` to keep the entrypoint genuinely thin.
  - The original `Files to Touch` list did not include the predicate-shape lint-policy test, but that policy was coupled to the old file location and needed to move with the canonical implementation.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/engine lint`
  - `node --test packages/engine/dist/test/unit/compile-conditions.test.js packages/engine/dist/test/unit/compile-effects.test.js packages/engine/dist/test/unit/compile-victory.test.js`
  - `node --test packages/engine/dist/test/unit/lint/cnl-predicate-shape-policy.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm turbo test`
