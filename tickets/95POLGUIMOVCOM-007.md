# 95POLGUIMOVCOM-007: Extract reusable policy-expression evaluation for completion guidance scoring

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents evaluator architecture, new completion-guidance scorer
**Deps**: archive/tickets/95POLGUIMOVCOM-002.md, archive/tickets/95POLGUIMOVCOM/95POLGUIMOVCOM-005.md

## Problem

The codebase still lacks a component that can score individual `ChoicePendingRequest` options against compiled `completionScoreTerms`. More importantly, the current ticket text incorrectly assumes that policy expression evaluation is already extracted into a reusable helper. It is not.

Today:

- `policy-eval.ts` contains an internal `EvaluationContext` class with the expression evaluator embedded inside it
- completion-context refs are now available through `PolicyRuntimeProviders.completion`
- no reusable scoring entry point exists for completion guidance

If ticket `007` is implemented as originally written, it will either duplicate the evaluator logic from `policy-eval.ts` or force an awkward partial wrapper around a class that still owns move-evaluation-specific concerns. Neither is a durable architecture.

## Assumption Reassessment (2026-03-30)

1. `policy-eval.ts` evaluates completed moves against `scoreTerms` using `PolicyRuntimeProviders`. Confirmed.
2. `CompiledAgentScoreTerm` already has the right contract for completion scoring: `when`, `weight`, `value`, `unknownAs`, `clamp`, `dependencies`. Confirmed.
3. Ticket `005` now provides completion-context runtime resolution through `PolicyRuntimeProviders.completion`. Confirmed.
4. The original ticket assumption that "the expression evaluator already exists and is reusable" is false. The evaluator currently lives inside the private `EvaluationContext` class in `policy-eval.ts` and is tightly coupled to candidate-set scoring, aggregate caches, and move-evaluation metadata. Confirmed.
5. Ticket `006` is not a real dependency for this work anymore. Compiler/lowering support for completion score terms and completion refs already landed in archived ticket `002`. Confirmed.
6. The real architectural need is twofold:
   - extract a reusable policy-expression scoring/evaluation core from `policy-eval.ts`
   - use that extracted core to implement completion-option scoring without duplicating logic

## Architecture Check

1. Cleanest approach: first extract the reusable policy-expression evaluation machinery out of `policy-eval.ts` into a focused internal module, then build `scoreCompletionOption(...)` on top of that extracted core.
2. The extracted evaluator should own:
   - expression evaluation
   - score-term application (`when`, `weight`, `value`, `unknownAs`, `clamp`)
   - runtime-provider access
   - cache behavior needed for state/candidate/aggregate evaluation
3. The move-ranking concerns in `policy-eval.ts` should remain there:
   - candidate pruning
   - candidate metadata accumulation
   - tie-break chains
   - preview-usage reporting
4. This architecture is materially better than adding a second evaluator just for completion guidance because it creates one policy-evaluation core instead of parallel implementations that will drift.
5. No backwards-compatibility shims: extract the real evaluator and update `policy-eval.ts` to use it. Do not leave a legacy copy behind.

## Scope Correction

This ticket owns both the extraction and the new completion scorer.

- In scope here:
  - extract reusable policy-expression/score-term evaluation from `policy-eval.ts`
  - introduce a completion-guidance scoring API built on that shared evaluator core
  - prove completion refs and dynamic `zoneTokenAgg.zone` work through the shared path
- Out of scope here:
  - wiring the scorer into `PolicyAgent.chooseMove` (ticket `008`)
  - choose-callback fallback policy (`random` vs `first`)
  - correlated `chooseN` subset optimization

## What to Change

### 1. Extract a reusable evaluator core from `policy-eval.ts`

Create a focused internal evaluator module, for example:

- `packages/engine/src/agents/policy-evaluation-core.ts`

This module should expose reusable primitives for:

- evaluating `AgentPolicyExpr` against `PolicyRuntimeProviders`
- evaluating score terms against that expression engine
- supporting the caches and aggregate evaluation needed by the existing authored policy surface

Do not duplicate the current `EvaluationContext` logic. Move the reusable parts into the new module and have `policy-eval.ts` consume that module.

### 2. Add `completion-guidance-eval.ts`

Create:

- `packages/engine/src/agents/completion-guidance-eval.ts`

Export:

```typescript
export function scoreCompletionOption(
  state: GameState,
  def: GameDef,
  catalog: AgentPolicyCatalog,
  playerId: PlayerId,
  seatId: string,
  request: ChoicePendingRequest,
  optionValue: MoveParamValue,
  scoreTermIds: readonly string[],
  runtime?: GameDefRuntime,
): number
```

Implementation:

1. Build `PolicyRuntimeProviders` with completion context from ticket `005`
2. Reuse the extracted evaluator core
3. Resolve score terms from `catalog.library.completionScoreTerms`
4. Evaluate and sum contributions exactly as regular score terms do

### 3. Update `policy-eval.ts` to use the extracted evaluator

Refactor `policy-eval.ts` so move scoring still behaves exactly as before, but it now consumes the shared evaluator core instead of owning a private duplicate implementation.

This is required to keep one source of truth for policy expression semantics.

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (new)
- `packages/engine/src/agents/completion-guidance-eval.ts` (new)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify if needed)
- `packages/engine/test/unit/agents/completion-guidance-eval.test.ts` (new)

## Out of Scope

- `PolicyAgent` chooser construction and threading
- `prepare-playable-moves.ts` fallback logic
- Spec/compiler/schema changes already completed
- Policy contract centralization across validator/compiler/schema ownership (ticket `010`)
- Broader policy-contract cleanup beyond what the extraction requires

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: single completion score term with `when: true`, `weight: 2`, `value: 3` -> score is 6
2. New unit test: completion score term with `when: false` -> score is 0
3. New unit test: completion score term using `{ ref: decision.targetKind }` filters correctly
4. New unit test: completion score term using `{ ref: option.value }` with dynamic `zoneTokenAgg.zone` resolves correctly
5. New unit test: `unknownAs` is applied when the value expression resolves to `undefined`
6. New unit test: clamp behavior matches regular score-term semantics
7. New unit test: multiple completion score terms accumulate correctly
8. New unit test: empty `scoreTermIds` -> score is 0
9. Existing `policy-eval` unit coverage still passes after extraction
10. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. There is one shared policy expression evaluation core, not separate duplicated evaluators for move scoring and completion scoring.
2. Completion scoring is pure and deterministic.
3. Foundation #5 (Determinism): same state + same request + same option value + same profile inputs = same score.
4. Foundation #10 (Architectural Completeness): the extracted evaluator eliminates the current architectural blockage instead of building another parallel scorer.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/completion-guidance-eval.test.ts` — completion scoring coverage
2. `packages/engine/test/unit/agents/policy-eval.test.ts` — regression coverage proving the extracted evaluator preserves existing move-scoring behavior

### Commands

1. Focused engine unit tests for `policy-eval` and `completion-guidance-eval`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine typecheck`
4. `pnpm -F @ludoforge/engine lint`
