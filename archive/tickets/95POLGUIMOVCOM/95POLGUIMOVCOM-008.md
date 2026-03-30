# 95POLGUIMOVCOM-008: PolicyAgent builds and threads completion guidance chooser from profile

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agents policy-agent, completion guidance chooser helper, tests
**Deps**: archive/tickets/95POLGUIMOVCOM/95POLGUIMOVCOM-001.md, archive/tickets/95POLGUIMOVCOM-007.md

## Problem

The PolicyAgent still ignores its profile's compiled `completionGuidance` config and `completionScoreTerms` when completing template moves. The lower layers already support guided completion, and the completion scorer already exists, but `PolicyAgent.chooseMove` never builds the chooser that would let authored policy profiles influence template completion. As a result, profile guidance is effectively dead configuration.

## Assumption Reassessment (2026-03-30)

1. `preparePlayableMoves` already accepts `choose` and already forwards it into `evaluatePlayableMoveCandidate`, which already threads it into `completeTemplateMove`. The kernel plumbing discussed in Spec 95 is already landed. Ticket scope should not claim pending kernel-threading work.
2. `scoreCompletionOption` already exists in `packages/engine/src/agents/completion-guidance-eval.ts`, with unit coverage for decision intrinsics, option intrinsics, dynamic `zoneTokenAgg.zone`, parameterized terms, and score accumulation. This ticket should reuse that scorer instead of reintroducing evaluation logic inside `policy-agent.ts`.
3. `PolicyAgent` already resolves the bound/overridden profile inside `evaluatePolicyMove`, but today it does not resolve the profile early enough to influence template completion. This ticket must add that earlier profile lookup on the policy-agent side without changing seat-binding semantics.
4. `input.state` is still the immutable pre-move snapshot. The completion chooser should close over that snapshot and the compiled profile params. This matches Spec 95 and Foundation #7.
5. Fallback handling belongs inside the policy-built chooser, not inside `preparePlayableMoves`. The lower layers should remain generic and unaware of authored `completionGuidance.fallback`.
6. Existing tests already cover `preparePlayableMoves` choose-threading and completion scoring in isolation. Missing coverage is policy-agent wiring and end-to-end guided completion behavior.

## Architecture Check

1. Cleanest architecture: build the chooser in a small dedicated helper module, not inline inside `policy-agent.ts`. The scorer already lives in its own module; the chooser factory should do the same so the policy agent stays orchestration-only and the guidance logic remains pure and directly unit-testable.
2. The helper should accept snapshot state, def, catalog, seat/player context, profile params, and `completionGuidance` config, then return `((ChoicePendingRequest) => MoveParamValue | undefined) | undefined`.
3. Engine agnosticism is preserved because the chooser is built entirely from compiled YAML policy data plus generic kernel choice requests.
4. No backwards-compatibility shims: profiles without enabled guidance still yield `undefined`, preserving current PRNG completion behavior. Profiles with `fallback: 'first'` should implement deterministic first-legal fallback in the chooser itself.
5. This is materially better than the current architecture because it removes dead authored configuration and restores the intended single-source-of-truth design: compiled policy data should drive both move scoring and move completion, not only the final ranking stage.

## What to Change

### 1. Add a pure completion-guidance chooser factory

Create a small helper module that:

1. Resolves whether guidance is enabled and whether any `completionScoreTerms` are configured
2. Scores the kernel's legality-precedence selectable options (`legal`, otherwise `unknown`) with `scoreCompletionOption`
3. Returns the best-scoring legal option when the best score is positive
4. Returns the first selectable option when scores do not produce a winner and `fallback === 'first'`
5. Returns `undefined` when scores do not produce a winner and `fallback === 'random'`
6. Leaves `chooseN` handling greedy-per-step, matching Spec 95 and the existing kernel contract

The helper should be pure and directly unit-testable.

### 2. `policy-agent.ts` — resolve profile earlier and pass chooser into `preparePlayableMoves`

Before calling `preparePlayableMoves`, `PolicyAgent.chooseMove` should:

1. Resolve the acting seat id and the effective profile id using the same authored binding semantics as policy evaluation
2. Look up the compiled profile and catalog
3. Build the completion chooser from the helper module when possible
4. Pass the chooser into `preparePlayableMoves`
5. Continue to let `evaluatePolicyMove` remain the authority for final move ranking and error/fallback metadata

Do not add authored-policy fallback logic to `preparePlayableMoves` or kernel layers.

## Files to Touch

- `packages/engine/src/agents/policy-agent.ts` (modify)
- `packages/engine/src/agents/completion-guidance-choice.ts` (new helper module)
- `packages/engine/test/unit/agents/policy-agent.test.ts` (modify)
- `packages/engine/test/unit/agents/completion-guidance-choice.test.ts` (new)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` or another focused integration test file (modify/add only if needed for a real end-to-end regression proof)

## Out of Scope

- Kernel threading changes already landed in lower layers
- Changes to `evaluatePolicyMove` (the post-completion scorer) — it continues to score completed moves as before
- Changes to `RandomAgent` or `GreedyAgent` — they don't use guidance
- `completionsPerTemplate` changes — same number of completions, just smarter
- Multi-ply search or lookahead
- Correlated `chooseN` subset optimization
- Performance profiling of guided vs unguided completion
- Policy contract centralization across validator/compiler/schema ownership (ticket `010`)

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: chooser factory returns `undefined` when guidance is disabled or when the profile has no completion score terms
2. New unit test: chooser scores selectable options and returns the highest-scoring one
3. New unit test: chooser ignores illegal options when legal/unknown options are available, and scores `unknown` options when they are the highest-precedence selectable set
4. New unit test: chooser returns first selectable option when no positive score exists and `fallback: 'first'`
5. New unit test: chooser returns `undefined` when no positive score exists and `fallback: 'random'`
6. New unit test: `PolicyAgent` actually uses profile guidance to complete a template move toward the preferred option
7. New unit or integration determinism test: same state + same profile + same seed yields the same guided completion result
8. Existing targeted suites covering `preparePlayableMoves`, `completion-guidance-eval`, and policy-agent still pass
9. `pnpm -F @ludoforge/engine test`
10. `pnpm turbo typecheck`
11. `pnpm turbo lint`

### Invariants

1. Profiles without `completionGuidance` produce identical behavior to pre-spec implementation (no callback, PRNG-based completion).
2. The `choose` callback closes over `input.state` (immutable snapshot) — never sees mid-execution state changes.
3. The callback never selects options outside the kernel's legality-precedence selectable set.
4. Foundation #5 (Determinism): same seed + same policy = same guided completion.
5. Foundation #7 (Immutability): callback works with snapshot state only.
6. Foundation #10 (Architectural Completeness): compiled completion-guidance config is now exercised by the runtime; no dead authored configuration remains in this path.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/completion-guidance-choice.test.ts` — chooser construction, legal-option filtering, and fallback semantics
2. `packages/engine/test/unit/agents/policy-agent.test.ts` — policy-agent wiring and guided template completion
3. `packages/engine/test/integration/fitl-policy-agent.test.ts` or a smaller focused integration test — only if needed to prove end-to-end behavior beyond unit coverage

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-30
- Actual changes:
  - Added a dedicated `completion-guidance-choice` helper that turns compiled `completionGuidance` + `completionScoreTerms` into a pure chooser callback.
  - Updated `PolicyAgent` to resolve the effective authored profile before template completion and pass the chooser into `preparePlayableMoves`.
  - Added a shared policy-profile resolution helper so `PolicyAgent` and policy evaluation use the same seat/profile binding rules.
  - Added direct unit coverage for chooser behavior, including disabled guidance, missing terms, legality-precedence selection, `fallback: first`, `fallback: random`, and unknown-option scoring.
  - Added policy-agent unit coverage proving guided template completion and deterministic guided completion.
- Deviations from original plan:
  - No `prepare-playable-moves` changes were needed; that threading already existed.
  - The chooser had to score the kernel's legality-precedence selectable options (`legal`, otherwise `unknown`) rather than only strictly legal options. The ticket was corrected to reflect the real runtime contract.
  - Profile/seat resolution was extracted into a shared helper for architectural consistency instead of duplicating the lookup logic in `policy-agent.ts`.
- Verification results:
  - `node --test dist/test/unit/agents/completion-guidance-eval.test.js dist/test/unit/prepare-playable-moves.test.js dist/test/integration/fitl-policy-agent.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
