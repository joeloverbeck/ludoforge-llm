# 95POLGUIMOVCOM-007: Implement `CompletionGuidanceEvaluator`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents (new evaluator module)
**Deps**: 95POLGUIMOVCOM-002 (types), 95POLGUIMOVCOM-005 (ref resolution), 95POLGUIMOVCOM-006 (compilation)

## Problem

No component exists that can score individual `ChoicePendingRequest` options against a profile's `completionScoreTerms`. The PolicyAgent needs a evaluator that takes a decision request, an option value, and the profile's compiled completion score terms, and returns a numeric score. This is the core scoring logic that drives policy-guided move completion.

## Assumption Reassessment (2026-03-30)

1. `evaluatePolicyMove` in `policy-eval.ts` evaluates completed moves against `scoreTerms` using `PolicyRuntimeProviders`. The new evaluator follows the same expression-evaluation pattern but with different providers (completion context instead of candidate context). Confirmed.
2. `CompiledAgentScoreTerm` has `when`, `weight`, `value`, `unknownAs`, `clamp`, `dependencies`. The evaluator applies the same logic: check `when` → evaluate `weight` × `value` → clamp → sum. Confirmed.
3. The expression evaluator that resolves `AgentPolicyExpr` trees already exists and is reusable. The new evaluator builds the right `PolicyRuntimeProviders` (with `completion` sub-provider) and feeds expressions through the existing evaluator. Confirmed.
4. The `CompletionGuidanceEvaluator` does not need to be a class — a factory function returning a scoring closure is simpler and more aligned with the functional style used elsewhere. The spec's class example is suggestive, not prescriptive.

## Architecture Check

1. Cleanest approach: a focused module (`completion-guidance-eval.ts`) that exports `scoreCompletionOption(state, def, catalog, playerId, request, optionValue, scoreTermIds): number`. Internally it builds a `PolicyRuntimeProviders` with the `completion` sub-provider and evaluates each score term.
2. Engine agnosticism: the evaluator operates on generic `ChoicePendingRequest` and `AgentPolicyExpr` — no game-specific logic.
3. No backwards-compatibility shims: this is a new module with no existing callers. Integration happens in ticket 008.

## What to Change

### 1. New file: `packages/engine/src/agents/completion-guidance-eval.ts`

Export a scoring function:

```typescript
export function scoreCompletionOption(
  state: GameState,
  def: GameDef,
  catalog: AgentPolicyCatalog,
  playerId: PlayerId,
  request: ChoicePendingRequest,
  optionValue: MoveParamValue,
  scoreTermIds: readonly string[],
): number
```

Implementation:
1. Look up each `scoreTermId` in `catalog.library.completionScoreTerms`
2. Build `PolicyRuntimeProviders` with:
   - Standard `intrinsics` (seat) and `currentSurface` providers (from existing factory)
   - New `completion` sub-provider (from ticket 005's `createCompletionContextProvider`)
3. For each score term:
   - Evaluate `when` condition (if present). Skip term if `false`.
   - Evaluate `weight` expression → number
   - Evaluate `value` expression → number (use `unknownAs` fallback if `undefined`)
   - Apply `clamp` (if present)
   - Accumulate `weight * value`
4. Return total score

### 2. Reuse existing expression evaluator

The function that evaluates `AgentPolicyExpr` against `PolicyRuntimeProviders` is already factored out. Wire the completion sub-provider into it — no duplication of expression evaluation logic.

## Files to Touch

- `packages/engine/src/agents/completion-guidance-eval.ts` (new)

## Out of Scope

- Wiring into PolicyAgent's `chooseMove` (ticket 008)
- Correlated `chooseN` subset scoring (non-goal per spec)
- Performance optimization (caching, short-circuiting) beyond what `when` conditions provide
- Fallback behavior (random vs first) — that's in the callback builder (ticket 008)
- Changes to existing `evaluatePolicyMove` path

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: single score term with `when: true`, `weight: 2`, `value: 3` → score is 6
2. New unit test: single score term with `when: false` → score is 0 (term skipped)
3. New unit test: score term using `{ ref: decision.targetKind }` in `when` → correctly filters by decision type
4. New unit test: score term using `{ ref: option.value }` in `value` with `zoneTokenAgg` → correctly resolves dynamic zone
5. New unit test: score term with `unknownAs: 0` when value expression resolves to `undefined` → uses 0
6. New unit test: score term with `clamp: { min: 0, max: 5 }` → clamps weighted value
7. New unit test: multiple score terms accumulate correctly
8. New unit test: empty `scoreTermIds` → score is 0
9. New unit test: `scoreTermId` not in library → throws or returns 0 (defensive)
10. Existing suite: `pnpm -F @ludoforge/engine test` — all pass

### Invariants

1. The evaluator is a pure function: same inputs = same output. No PRNG consumption, no side effects.
2. Expression evaluation reuses the existing evaluator — no duplicated eval logic.
3. Foundation #5 (Determinism): scoring is deterministic (same state + same profile + same request = same score).
4. Foundation #6 (Bounded Computation): total work is `O(scoreTerms * 1)` per option — each term evaluates constant-time expressions.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/completion-guidance-eval.test.ts` — all unit tests above

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "completion.*guidance"` (targeted)
2. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` (full suite)
