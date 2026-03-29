# 93COMMOVPOLEVA-001: Use trusted completed moves for preview evaluation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-agent.ts`, `policy-eval.ts`, `policy-runtime.ts`, `policy-preview.ts`
**Deps**: None

## Problem

The original ticket proposed extracting `tryApplyPreview` from `classifyPreviewOutcome` as a small internal refactor. After reassessing the current code, that split is too narrow to be architecturally valuable on its own.

The real defect is that preview evaluation discards trusted completion context:

1. `preparePlayableMoves` returns `TrustedExecutableMove[]` for completed/stochastic candidates.
2. `PolicyAgent.chooseMove` strips those wrappers and passes only `move` into `evaluatePolicyMove`.
3. `createPolicyPreviewRuntime` re-runs `classifyPlayableMoveCandidate` for every candidate.
4. For pre-completed multi-step moves, re-probing can still report `rejected: notDecisionComplete`, so preview-backed refs degrade to `unknown`.

That means the architecture already knows which moves are trusted and executable, but the preview path does not consume that fact. A pure helper extraction does not fix this and is not more robust than the current architecture by itself.

## Assumption Reassessment (2026-03-29)

1. `classifyPreviewOutcome` exists in `packages/engine/src/agents/policy-preview.ts` and currently mixes classification and trusted-move application. Confirmed.
2. `policy-preview.ts` already depends on `applyTrustedMove` via `defaultDependencies.applyMove`; there is no separate preview-application abstraction yet. Confirmed.
3. `CreatePolicyPreviewRuntimeInput`, `CreatePolicyRuntimeProvidersInput`, and `EvaluatePolicyMoveInput` do **not** currently carry any trusted-move context. Confirmed.
4. `PolicyAgent.chooseMove` already has the trusted candidates available after `preparePlayableMoves`, so the missing piece is threading that information into evaluation instead of recomputing it later. Confirmed.
5. The current tests do **not** prove the missing invariant. We need explicit coverage for:
   - trusted preview bypassing re-classification when a trusted move is already known
   - mismatched `sourceStateHash` being rejected in the trusted preview path
   - policy evaluation honoring preview values for already-completed trusted moves

## Architecture Check

1. **Why this approach**: Make trusted completion context a first-class runtime input. Preview should consume the already-validated `TrustedExecutableMove` when available instead of re-deriving it.
2. **Why not extract-only**: Extraction without wiring the trusted path is churn without a durable architectural win. The helper is still useful, but only as an implementation detail of the real fix.
3. **Why index injection**: A `ReadonlyMap<string, TrustedExecutableMove>` keyed by `stableMoveKey` keeps candidate types unchanged and avoids alias fields or dual representations on every candidate object.
4. **No backwards compatibility**: `trustedMoveIndex` is required wherever preview evaluation is constructed. All callsites and tests are updated in the same change.
5. **Determinism and safety**: Trusted preview application must validate `sourceStateHash` against the current state before applying. Preview must still reject RNG-consuming outcomes and hidden-sampling-restricted refs exactly as before.

## What to Change

### 1. Add `trustedMoveIndex` to preview/evaluation/runtime inputs

Make `trustedMoveIndex: ReadonlyMap<string, TrustedExecutableMove>` a required field on:

- `CreatePolicyPreviewRuntimeInput`
- `CreatePolicyRuntimeProvidersInput`
- `EvaluatePolicyMoveInput`

Thread it through without introducing optional compatibility branches.

### 2. Build the trusted index in `PolicyAgent.chooseMove`

After `preparePlayableMoves`, build a `Map<string, TrustedExecutableMove>` from the selected trusted candidate set (`completedMoves` or `stochasticMoves`) using `toMoveIdentityKey(input.def, trusted.move)`.

Pass:

- `legalMoves: playableMoves.map((trusted) => trusted.move)`
- `trustedMoveIndex`

into `evaluatePolicyMove`.

### 3. Extract `tryApplyPreview` in `policy-preview.ts`

Extract the trusted-move application logic from `classifyPreviewOutcome` into a dedicated local helper:

- validate `trustedMove.sourceStateHash === input.state.stateHash`
- apply via `deps.applyMove`
- reject RNG divergence as `unknown/random`
- derive observation and create the cached `ready` preview payload
- collapse errors to `unknown/failed`

`classifyPreviewOutcome` becomes a thin wrapper around non-complete classifications plus `tryApplyPreview(classification.move)`.

### 4. Use the trusted index before reclassification

In `getPreviewOutcome`, first check `input.trustedMoveIndex.get(candidate.stableMoveKey)`.

- If present, use `tryApplyPreview(trustedMove)`.
- If absent, fall back to the current `classifyPlayableMoveCandidate` path.

Caching by `stableMoveKey` remains unchanged.

### 5. Strengthen tests around the actual bug surface

Update existing callsites to supply `trustedMoveIndex`, and add focused tests that prove:

- preview runtime bypasses reclassification when a trusted move is present
- trusted preview rejects mismatched `sourceStateHash`
- policy evaluation can score an already-completed trusted move via preview surfaces

## Files to Touch

- `packages/engine/src/agents/policy-agent.ts`
- `packages/engine/src/agents/policy-eval.ts`
- `packages/engine/src/agents/policy-runtime.ts`
- `packages/engine/src/agents/policy-preview.ts`
- `packages/engine/test/unit/agents/policy-preview.test.ts`
- `packages/engine/test/unit/agents/policy-eval.test.ts`
- `packages/engine/test/unit/agents/policy-agent.test.ts` if needed for end-to-end coverage
- any additional policy test files that construct these runtimes directly

## Out of Scope

- Kernel changes (`packages/engine/src/kernel/**`)
- Changes to move identity semantics
- Changing `PolicyPreviewCandidate`, `PolicyRuntimeCandidate`, or evaluation candidate shapes
- Multi-ply search, rollouts, or preview caching redesign
- Spec-level YAML surface changes

## Acceptance Criteria

### Tests That Must Pass

1. Relevant agent unit tests covering preview, runtime providers, and policy evaluation
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`

### Invariants

1. Preview uses trusted completed moves when available instead of re-classifying them
2. `sourceStateHash` mismatch on trusted preview inputs is rejected
3. No kernel source files are modified
4. No optional shim fields or alias paths are introduced
5. Existing non-trusted preview behavior remains unchanged

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview.test.ts`
   Verify trusted preview bypass, caching, and `sourceStateHash` rejection.
2. `packages/engine/test/unit/agents/policy-eval.test.ts`
   Verify preview-backed score terms can evaluate an already-completed trusted move through `trustedMoveIndex`.
3. Additional policy runtime/provider callsites
   Mechanical updates for required `trustedMoveIndex` input.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-29
- What actually changed:
  - Added required `trustedMoveIndex` threading through policy agent, policy evaluation, policy runtime, and policy preview construction.
  - Extracted trusted preview application into `tryApplyPreview` and made preview prefer trusted completed moves over reclassification.
  - Added regression coverage for trusted preview bypass, `sourceStateHash` rejection, and preview-backed scoring of trusted completed moves.
  - Updated policy determinism, visibility, and trace tests for the required evaluator input contract.
  - Hardened the FITL runner visual-config regression test so it asserts canonical route topology and resolver behavior instead of stale Map Editor coordinates.
- Deviations from original plan:
  - The ticket was broadened from an extract-only refactor to the root-cause architectural fix because the split refactor was not a durable improvement by itself.
  - Runner test hardening was added even though it was outside the original engine-only scope, because the required full-suite gate exposed a brittle FITL visual-config assertion.
- Verification results:
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/runner test -- test/config/visual-config-files.test.ts` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo test` passed.
