# 95POLGUIMOVCOM-001: Thread optional `choose` callback through kernel move-completion chain

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel playable-candidate, move-completion; agents prepare-playable-moves
**Deps**: None (pure plumbing, no new types consumed)

## Problem

`evaluatePlayableMoveCandidate` and `preparePlayableMoves` do not accept or forward a `choose` callback to `completeMoveDecisionSequence`, even though the latter already supports one via `CompleteMoveDecisionSequenceOptions`. Inner decisions are always resolved by PRNG. This ticket threads the existing `choose` parameter through the call chain so that downstream callers (PolicyAgent) can supply a policy-guided callback.

## Assumption Reassessment (2026-03-30)

1. `evaluatePlayableMoveCandidate` in `playable-candidate.ts` currently takes `(def, state, move, rng, runtime?, budgets?)` — no `choose` param. Confirmed.
2. `completeTemplateMove` in `move-completion.ts` currently takes `(def, state, templateMove, rng, runtime?, budgets?)` — no `choose` param. Internally it creates its own `choose` closure using `selectChoiceOptionValuesByLegalityPrecedence` + PRNG. Confirmed.
3. `completeMoveDecisionSequence` already accepts `CompleteMoveDecisionSequenceOptions` with optional `choose`. Confirmed — this is the existing hook point.
4. `preparePlayableMoves` in `prepare-playable-moves.ts` has `PreparePlayableMovesOptions { pendingTemplateCompletions?: number }` — no `choose` param. Confirmed.
5. `attemptTemplateCompletion` helper calls `evaluatePlayableMoveCandidate` without `choose`. Confirmed.

## Architecture Check

1. This is the cleanest approach: the `choose` callback pattern already exists at the bottom of the chain (`CompleteMoveDecisionSequenceOptions`). We are simply surfacing it through 3 intermediate call sites. No new abstraction needed.
2. Engine agnosticism preserved: the `choose` callback is a generic `(ChoicePendingRequest) => MoveParamValue | undefined`. The kernel doesn't know or care what builds it.
3. No backwards-compatibility shims: all new parameters are optional. Omitting them preserves identical PRNG-based behavior.

## What to Change

### 1. `playable-candidate.ts` — add optional `choose` to `evaluatePlayableMoveCandidate`

Add an optional `choose` parameter (same type as `CompleteMoveDecisionSequenceOptions.choose`) to the function signature. Thread it to `completeTemplateMove`.

### 2. `move-completion.ts` — add optional `choose` to `completeTemplateMove`

Add an optional `choose` parameter. When provided, pass it into the `CompleteMoveDecisionSequenceOptions` for `completeMoveDecisionSequence`. When absent, use the existing internal PRNG-based `choose` closure (no behavior change).

### 3. `prepare-playable-moves.ts` — add optional `choose` to `PreparePlayableMovesOptions` and thread

Extend `PreparePlayableMovesOptions` with `readonly choose?: (request: ChoicePendingRequest) => MoveParamValue | undefined`. Thread it through `attemptTemplateCompletion` → `evaluatePlayableMoveCandidate`.

## Files to Touch

- `packages/engine/src/kernel/playable-candidate.ts` (modify)
- `packages/engine/src/kernel/move-completion.ts` (modify)
- `packages/engine/src/agents/prepare-playable-moves.ts` (modify)

## Out of Scope

- PolicyAgent changes (ticket 008)
- New types for `completionGuidance` or `completionScoreTerms` (ticket 002)
- Any changes to `legalMoves()` enumeration
- `chooseStochastic` callback threading (not needed for v1 — stochastic decisions remain PRNG-based)
- Behavioral changes — when `choose` is not provided, behavior must be identical to current

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: calling `evaluatePlayableMoveCandidate` with a custom `choose` callback that returns a specific value → inner decisions resolve to that value (not PRNG)
2. New unit test: calling `evaluatePlayableMoveCandidate` WITHOUT `choose` → behavior identical to before (PRNG-based resolution)
3. New unit test: calling `preparePlayableMoves` with `choose` in options → callback reaches `completeMoveDecisionSequence`
4. Existing suite: `pnpm -F @ludoforge/engine test` — all existing tests pass unchanged
5. Existing suite: `pnpm turbo typecheck` — no type errors

### Invariants

1. When `choose` is `undefined` or not provided, the entire call chain behaves identically to the current implementation (PRNG-based resolution).
2. The `choose` callback is never called for moves that have no pending decisions.
3. No new exports are added to the kernel's public API beyond the extended signatures.
4. Foundation #1 (Engine Agnosticism): `choose` callback type is generic — no game-specific types.
5. Foundation #5 (Determinism): same `choose` + same state = same result.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/playable-candidate-choose.test.ts` — verifies custom `choose` is called and its return value is used
2. `packages/engine/test/unit/kernel/move-completion-choose.test.ts` — verifies `completeTemplateMove` threads `choose` to `completeMoveDecisionSequence`
3. `packages/engine/test/unit/agents/prepare-playable-moves-choose.test.ts` — verifies `choose` option is forwarded

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "choose"` (targeted)
2. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` (full suite)
