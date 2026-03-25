# 81WHOSEQEFFCOM-006: Compile iteration & reduction effects (forEach-general, reduce, removeByPriority)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — effect-compiler-patterns.ts, effect-compiler-codegen.ts
**Deps**: 81WHOSEQEFFCOM-001 (switch dispatch), 81WHOSEQEFFCOM-002 (let — binding export pattern), 81WHOSEQEFFCOM-005 (token effects — forEach may iterate tokens, removeByPriority synthesizes moveToken)

## Problem

Three iteration/reduction effects (tags 29, 30, 31) fall back to the interpreter. These are high-impact targets: `forEach` (general form iterating over tokens, zones, etc. — not just players) and `reduce` are the core looping constructs used throughout both FITL and Texas Hold'em lifecycle sequences. `removeByPriority` is FITL-specific but extremely complex. All three require decision scope rebasing per iteration, trace emission, and (for reduce) binding export filtering.

## Assumption Reassessment (2026-03-25)

1. `forEach` (tag 29): The players-only variant is already compiled (`compileForEachPlayers`). The general form extends this to handle ALL `OptionsQuery` types (tokens, zones, markers, etc.). Implemented in `effects-control.ts`.
2. `reduce` (tag 30): Accumulator pattern over query result. Has initial value, per-iteration `next` expression, optional continuation block (`in`), and binding export filtering (`$`-prefix only, exclude `resultBind`). Implemented in `effects-control.ts` (lines ~290-331).
3. `removeByPriority` (tag 31): Budget-based removal across priority groups. Synthesizes `moveToken` effects per item removed. Has per-group query scope refresh, `countBind` per group, `remainingBind` export. This is the most complex single effect type. Likely in `effects-token.ts` or `effects-control.ts`.
4. Decision scope rebasing: `withIterationSegment(scope, index)` and `rebaseIterationPath(scope, parentPath)` from `decision-scope.ts`. The existing `compileForEachPlayers` already implements this pattern.
5. Trace emission: `buildForEachTraceEntry` and `buildReduceTraceEntry` from `control-flow-trace.ts`.

## Architecture Check

1. General `forEach` extends the existing `compileForEachPlayers` pattern — same decision scope rebasing, trace emission, `countBind`/`in` continuation. The key difference: query evaluation is over any `OptionsQuery`, not just players.
2. `reduce` follows a similar iteration pattern but accumulates a value across iterations via a `next` expression. Binding export rules mirror `let` (`$`-prefix only, exclude `resultBind`).
3. `removeByPriority` is extremely complex — it has multi-group iteration with per-group budget tracking, query scope refresh, and synthesized moveToken effects. Consider delegating to the existing interpreter helper wrapped in compiled fragment contract to avoid duplicating the logic.
4. The spec explicitly marks `removeByPriority` as "Very High" complexity. A pragmatic approach: compile the outer structure but delegate inner removal logic to existing helpers.

## What to Change

### 1. Add/extend pattern descriptors

In `effect-compiler-patterns.ts`:
- Extend existing `ForEachPlayersPattern` or create `ForEachGeneralPattern` for the general form with full `OptionsQuery` support
- `ReducePattern`: query, item bind, accumulator bind, initial value, next expression, optional result bind, optional continuation body (`in`), optional `countBind`
- `RemoveByPriorityPattern`: priority groups, budget expression, zone targets, removal effects template
- Add `matchForEachGeneral`, `matchReduce`, `matchRemoveByPriority`
- Wire into `classifyEffect` switch for tags 29 (update existing), 30, 31

### 2. Add compiled closure generators

In `effect-compiler-codegen.ts`:
- `compileForEachGeneral(desc, bodyCompiler)` — extend `compileForEachPlayers` to support all `OptionsQuery` types. Same decision scope rebasing, trace emission (`buildForEachTraceEntry`), `countBind`/`in` continuation
- `compileReduce(desc, bodyCompiler)` — accumulator pattern: iterate items, apply next expression per iteration, decision scope rebasing, trace emission (`buildReduceTraceEntry`), binding export filtering (`$`-prefix, exclude `resultBind`)
- `compileRemoveByPriority(desc, bodyCompiler)` — multi-group budget iteration. May delegate inner removal to existing helpers
- Wire into `compilePatternDescriptor` dispatcher

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-patterns.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)

## Out of Scope

- `evaluateSubset` (ticket 008)
- `chooseOne`/`chooseN` (ticket 009)
- Information effects (ticket 007)
- Deleting `createFallbackFragment` (ticket 010)
- Refactoring interpreter helpers in `effects-control.ts`
- Action-context effects

## Acceptance Criteria

### Tests That Must Pass

1. Per-effect-type unit test: `compileForEachGeneral` iterates over tokens, zones, and players with correct binding and decision scope rebasing
2. Per-effect-type unit test: `compileReduce` accumulates correctly with initial value, next expression, and exports only `$`-prefixed bindings (excluding `resultBind`)
3. Per-effect-type unit test: `compileRemoveByPriority` removes tokens across priority groups respecting budget limits
4. Parity test: forEach-general compiled output matches interpreted output for token iteration, zone iteration, player iteration
5. Parity test: reduce compiled output matches interpreted output including final accumulator value and binding exports
6. Parity test: removeByPriority compiled output matches interpreted output including per-group counts
7. Decision scope test: forEach and reduce correctly rebase `iterationPath` per iteration and restore parent path after loop
8. Trace parity test: forEach emits `buildForEachTraceEntry`, reduce emits `buildReduceTraceEntry` — identical to interpreted path
9. Binding export test: reduce with nested `$`-prefixed bindings exports them correctly; `resultBind` and non-`$` bindings are filtered
10. Edge case tests: forEach over empty collection, reduce over single item, removeByPriority with zero budget
11. `countBind`/`in` continuation test: forEach and reduce correctly bind count and execute continuation block
12. Existing suite: `pnpm turbo test`
13. Existing suite: `pnpm turbo typecheck`

### Invariants

1. Decision scope rebasing in compiled loops is identical to interpreted path
2. `reduce` binding export filtering mirrors `applyReduce` (effects-control.ts lines 325-331)
3. `removeByPriority` calls `invalidateTokenStateIndex` after token removals
4. Coverage ratio reaches >= 80% for typical lifecycle sequences after this ticket
5. Verification mode passes for all lifecycle sequences

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — Add tests for forEach-general, reduce, removeByPriority
2. `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` — Add tests for match functions

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
