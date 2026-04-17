# 16TEMCOMCON-001: Doc-comment `TemplateCompletionResult` and `completeTemplateMove` at type site

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel/move-completion.ts (doc-comments only; no semantic change)
**Deps**: `specs/16-template-completion-contract.md`

## Problem

Spec 132 landed the four-outcome completion contract (`completed`, `structurallyUnsatisfiable`, `drawDeadEnd`, `stochasticUnresolved`) in `packages/engine/src/kernel/move-completion.ts`. The semantics are correct in code but undocumented at the type site: a reader of `TemplateCompletionResult` sees the union without any indication of which outcomes are retryable, which carry advanced RNG, which may still succeed on another draw, or which permanently signal unsatisfiability. A future refactor could weaken the contract silently because nothing in the type declaration formalizes it.

This ticket formalizes Contract §1 (outcome meanings) at the type declaration — the canonical source of truth consumed by the simulator, agents, and worker.

## Assumption Reassessment (2026-04-17)

1. `packages/engine/src/kernel/move-completion.ts:23-27` — `TemplateCompletionResult` union exists with exactly the four outcomes the spec names. Confirmed during `/reassess-spec` run on 2026-04-17.
2. `packages/engine/src/kernel/move-completion.ts:174-181` — `completeTemplateMove` exists with signature `(def, state, templateMove, rng, runtime?, options?) => TemplateCompletionResult`. Confirmed.
3. No existing doc-comment on either symbol at time of reassessment. No mismatch.

## Architecture Check

1. Doc-comments at the type declaration are the most durable documentation — they travel with the symbol across refactors, surface in every hover/LSP context, and are impossible to miss when modifying the union. Prose in spec files or READMEs would be discoverable only to readers who know to look.
2. Pure documentation change: no impact on engine agnosticism, kernel purity, or the GameSpecDoc/GameDef boundary. The contract being documented is itself engine-agnostic (Foundation 1).
3. No backwards-compatibility shim or alias is introduced. The doc-comment references Spec 16 for the full contract and summarizes each outcome's semantic meaning inline.

## What to Change

### 1. Doc-comment `TemplateCompletionResult`

Add a JSDoc block immediately above the type declaration at `packages/engine/src/kernel/move-completion.ts:23`. The comment MUST enumerate each outcome's semantic meaning, mapping 1:1 to Spec 16 Contract §1:

- `completed` — move is fully bound; can be executed through the normal trusted apply path.
- `structurallyUnsatisfiable` — no valid completion exists under the current state and contract. **Not retryable** by any caller.
- `drawDeadEnd` — the sampled path failed; another valid path MAY exist under a different RNG state. Carries the advanced `rng` consumed by the failed sampled path so callers can deterministically retry.
- `stochasticUnresolved` — all pre-stochastic decisions are bound; unresolved stochastic branches remain. Carries the partially-bound `move` and advanced `rng`.

The comment MUST reference `specs/16-template-completion-contract.md` for the full contract.

### 2. Doc-comment `completeTemplateMove`

Add a brief JSDoc block immediately above the function declaration at `packages/engine/src/kernel/move-completion.ts:174`. The comment MUST point to `TemplateCompletionResult` for outcome semantics and note that the function is engine-agnostic (consumed identically by simulator, agents, and runner worker per Contract §5).

## Files to Touch

- `packages/engine/src/kernel/move-completion.ts` (modify)

## Out of Scope

- No semantic changes to `completeTemplateMove`, `selectFromChooseN`, or any other function in `move-completion.ts`.
- No changes to the `TemplateCompletionResult` union shape (field names, types, kinds).
- No new exports, imports, or re-exports.
- No changes to `packages/engine/src/agents/prepare-playable-moves.ts`, `packages/runner/src/worker/game-worker-api.ts`, or any FITL data.
- Invariant tests (covered by `16TEMCOMCON-002`).

## Acceptance Criteria

### Tests That Must Pass

1. Existing kernel unit suite: `pnpm -F @ludoforge/engine test` — no behavior change, all existing tests must continue to pass byte-identically.
2. Existing seed regression tests for 11, 17, 1009 — no change expected since no semantic edit was made.
3. Root quality gate: `pnpm turbo lint` and `pnpm turbo typecheck` pass.

### Invariants

1. **Contract parity**: The doc-comment's enumeration of outcomes matches the actual union variants in `TemplateCompletionResult` one-for-one. No documented outcome is absent from the union; no variant is undocumented.
2. **No semantic drift**: Byte-identical behavior of `completeTemplateMove` before and after this ticket. Compiled JS output in `packages/engine/dist/kernel/move-completion.js` may differ in source-map positions but not in emitted code.
3. **Foundation 1 preservation**: The doc-comment describes the contract in engine-agnostic terms — no FITL-specific language, no game-specific examples.

## Test Plan

### New/Modified Tests

1. No new tests in this ticket. The doc-comment carries no runtime behavior; `16TEMCOMCON-002` adds the invariant tests that formally prove the documented contract.

### Commands

1. `pnpm -F @ludoforge/engine build` — confirm doc-comments do not break TypeScript compilation.
2. `pnpm -F @ludoforge/engine test` — confirm no existing test regresses.
3. `pnpm turbo lint typecheck` — confirm JSDoc syntax is valid and no lint rule is violated.

## Outcome

- 2026-04-17: Added the required type-site JSDoc for `TemplateCompletionResult` and replaced the `completeTemplateMove` doc-comment with the contract-oriented, engine-agnostic version in `packages/engine/src/kernel/move-completion.ts`.
- Boundary correction from reassessment: `completeTemplateMove` already had a generic doc-comment, so the live work was to replace that stale/broader comment and add the missing union-level contract documentation.
- Follow-up on 2026-04-17: cleared the pre-existing lint blockers that had been preventing ticket closeout by removing unused imports and tightening one existing assertion in the affected engine/test files.
- Verification run:
  - `pnpm -F @ludoforge/engine build` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo lint` ✅
  - `pnpm turbo typecheck` ✅
- Schema/artifact fallout checked: none required for this documentation-only change.
