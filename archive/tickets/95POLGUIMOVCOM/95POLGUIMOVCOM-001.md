# 95POLGUIMOVCOM-001: Add explicit completion options for policy-guided move completion

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel playable-candidate, move-completion; agents prepare-playable-moves
**Deps**: None

## Problem

The current gap is real, but the original ticket framed it too narrowly as "just add one more optional positional parameter". `completeMoveDecisionSequence` already accepts a generic `choose` callback, and `completeTemplateMove` already owns the PRNG fallback behavior for template completion. What is missing is a clean, extensible way for higher layers to supply completion policy into `completeTemplateMove` and `evaluatePlayableMoveCandidate` without further degrading those helpers' signatures.

This ticket introduces explicit completion options objects that carry `choose` plus existing completion budgets, and threads those options through `preparePlayableMoves`. The goal is still the same as Spec 95: let a downstream policy-aware caller influence inner decision resolution during template completion. The difference is architectural: we fix the call boundary now instead of appending another optional positional argument.

## Assumption Reassessment (2026-03-30)

1. `evaluatePlayableMoveCandidate` in `playable-candidate.ts` currently takes `(def, state, move, rng, runtime?, budgets?)`. That part of the original ticket is correct, but the missing capability is better modeled as an options object, not another positional argument.
2. `completeTemplateMove` in `move-completion.ts` currently takes `(def, state, templateMove, rng, runtime?, budgets?)` and constructs its own PRNG-backed `choose` closure. This is the correct ownership point for fallback selection behavior.
3. `completeMoveDecisionSequence` already accepts `CompleteMoveDecisionSequenceOptions` with optional `choose` and `chooseStochastic`. Confirmed. This remains the single kernel hook point for decision completion strategies.
4. `completeMoveDecisionSequence` defaults to deterministic first-legal selection when no `choose` is supplied. The PRNG behavior relevant to this ticket lives in `completeTemplateMove`, not in `completeMoveDecisionSequence`. The original ticket blurred those two layers.
5. `preparePlayableMoves` in `prepare-playable-moves.ts` only exposes `pendingTemplateCompletions?: number`. Confirmed. That is the agent-facing boundary that must surface template-completion guidance.
6. Existing unit coverage already lives in:
   - `packages/engine/test/unit/kernel/move-completion.test.ts`
   - `packages/engine/test/unit/kernel/playable-candidate.test.ts`
   - `packages/engine/test/unit/prepare-playable-moves.test.ts`
   The original ticket's plan to add three new test files is unnecessary duplication.
7. `packages/engine/package.json` uses Node's test runner lanes and does not define a `choose`-scoped script. The original targeted test command is not aligned with the repo's actual test entrypoints.

## Architecture Check

1. The original ticket's direct-positional-threading plan would work, but it is not the cleanest long-term boundary. Both `completeTemplateMove` and `evaluatePlayableMoveCandidate` already carry optional completion configuration (`budgets`) positionally. Spec 95 adds more completion policy knobs. Continuing to append optional parameters would make the APIs increasingly brittle.
2. The better architecture is to introduce explicit completion options objects:
   - `TemplateMoveCompletionOptions` for `completeTemplateMove`
   - `PlayableMoveCandidateOptions` for `evaluatePlayableMoveCandidate`
   Each object should group `budgets` and optional `choose`.
3. Engine agnosticism remains preserved: `choose` stays a generic `(ChoicePendingRequest) => MoveParamValue | undefined`. The kernel owns fallback completion behavior and remains unaware of any policy implementation.
4. No aliasing or compatibility shims: update all local call sites and tests in the same change. This repo's foundations explicitly prefer current truth over compatibility wrappers.

## What to Change

### 1. `move-completion.ts` — introduce `TemplateMoveCompletionOptions`

Replace the positional `budgets?: Partial<MoveEnumerationBudgets>` argument with an explicit options object:

- `readonly budgets?: Partial<MoveEnumerationBudgets>`
- `readonly choose?: (request: ChoicePendingRequest) => MoveParamValue | undefined`

`completeTemplateMove` remains responsible for PRNG fallback. If `options.choose` returns `undefined`, fall back to the current random selection logic for that decision instead of treating it as unresolved. This preserves the completion semantics needed by Spec 95 profiles whose guidance applies only to some decisions.

### 2. `playable-candidate.ts` — introduce `PlayableMoveCandidateOptions`

Replace the positional `budgets?: Partial<MoveEnumerationBudgets>` argument with an explicit options object and thread it to `completeTemplateMove`.

### 3. `prepare-playable-moves.ts` — extend `PreparePlayableMovesOptions`

Extend `PreparePlayableMovesOptions` with:

- `readonly pendingTemplateCompletions?: number`
- `readonly choose?: (request: ChoicePendingRequest) => MoveParamValue | undefined`

Thread `choose` through `attemptTemplateCompletion` into the new `evaluatePlayableMoveCandidate(..., runtime, options)` shape.

### 4. Keep `completeMoveDecisionSequence` unchanged

Do not create a parallel completion hook or new kernel-specific strategy interface. `completeMoveDecisionSequence` already exposes the correct low-level abstraction. This ticket is about fixing the call boundaries above it.

## Files to Touch

- `packages/engine/src/kernel/playable-candidate.ts` (modify)
- `packages/engine/src/kernel/move-completion.ts` (modify)
- `packages/engine/src/agents/prepare-playable-moves.ts` (modify)
- `packages/engine/test/unit/kernel/playable-candidate.test.ts` (modify)
- `packages/engine/test/unit/kernel/move-completion.test.ts` (modify)
- `packages/engine/test/unit/prepare-playable-moves.test.ts` (modify)

## Out of Scope

- PolicyAgent changes (ticket 008)
- New types for `completionGuidance` or `completionScoreTerms` (ticket 002)
- Any changes to `legalMoves()` enumeration
- `chooseStochastic` callback threading (not needed for v1 — stochastic decisions remain PRNG-based)
- Any change to `completeMoveDecisionSequence` semantics outside the template-completion caller path

## Acceptance Criteria

### Tests That Must Pass

1. `completeTemplateMove` accepts an explicit options object containing `choose` and `budgets`.
2. `evaluatePlayableMoveCandidate` accepts an explicit options object containing `choose` and `budgets`.
3. `preparePlayableMoves` accepts and forwards `choose` through template completion.
4. When `choose` is not provided, template completion behavior remains identical to the current PRNG-based path.
5. When `choose` is provided and returns a value, template completion uses that value.
6. When `choose` is provided but returns `undefined`, template completion falls back to the current PRNG-based selection logic for that decision.
7. Existing engine tests pass after the signature updates, plus targeted coverage for the new forwarding/fallback behavior.
8. `pnpm turbo typecheck` and `pnpm turbo lint` pass.

### Invariants

1. When `choose` is `undefined` or not provided, the entire call chain behaves identically to the current implementation.
2. The `choose` callback is never called for moves that have no pending decisions.
3. `completeTemplateMove` remains the sole owner of random fallback for template completion.
4. Foundation #1 (Engine Agnosticism): `choose` stays generic and game-agnostic.
5. Foundation #5 (Determinism): same state + same `choose` behavior + same seed yields the same result.
6. Foundation #10 (Architectural Completeness): no new positional optional-parameter chain is introduced.

## Test Plan

### New/Modified Tests

1. Extend `packages/engine/test/unit/kernel/move-completion.test.ts`
   - custom `choose` result is used
   - `choose` returning `undefined` falls back to PRNG
   - existing budget behavior still works through the new options object
2. Extend `packages/engine/test/unit/kernel/playable-candidate.test.ts`
   - `evaluatePlayableMoveCandidate` forwards `choose`
3. Extend `packages/engine/test/unit/prepare-playable-moves.test.ts`
   - `preparePlayableMoves` forwards `choose` across repeated template completions

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/unit/kernel/move-completion.test.js dist/test/unit/kernel/playable-candidate.test.js dist/test/unit/prepare-playable-moves.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-30
- What actually changed:
  - Replaced positional completion-budget plumbing with explicit completion options objects in `completeTemplateMove` and `evaluatePlayableMoveCandidate`
  - Added optional `choose` threading through `preparePlayableMoves`
  - Preserved PRNG completion as the fallback owned by `completeTemplateMove`
  - Extended the existing unit test files to cover guided selection, fallback-to-PRNG behavior, and forwarding through repeated template completions
- Deviations from original plan:
  - Did not add three new test files; extended the existing focused unit files instead
  - Did not append a new positional `choose` argument; used explicit options objects to keep the API boundary extensible
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test dist/test/unit/kernel/move-completion.test.js dist/test/unit/kernel/playable-candidate.test.js dist/test/unit/prepare-playable-moves.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
