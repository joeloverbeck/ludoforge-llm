# 93COMMOVPOLEVA-002: Reassess trustedMoveIndex follow-up scope after implementation landed

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No additional engine changes should be planned from this ticket as currently written
**Deps**: `archive/tickets/93COMMOVPOLEVA-001.md`

## Problem

This ticket assumed there was still a second implementation step outstanding after `93COMMOVPOLEVA-001`. That assumption is false in the current codebase.

The architecture this ticket proposed is already present:

1. `PolicyAgent.chooseMove` builds `trustedMoveIndex` from the trusted candidates returned by `preparePlayableMoves`.
2. `EvaluatePolicyMoveInput`, `CreatePolicyRuntimeProvidersInput`, and `CreatePolicyPreviewRuntimeInput` all require `trustedMoveIndex`.
3. `createPolicyPreviewRuntime` checks the trusted index before re-classifying a candidate.
4. `tryApplyPreview` already validates `sourceStateHash` before applying the trusted move.
5. Policy tests already cover the trusted fast-path and the hash-mismatch guard.

As originally written, this ticket would now duplicate implemented behavior and push the codebase away from clean architecture by re-planning work that already landed.

## Assumption Reassessment (2026-03-29)

1. `CreatePolicyPreviewRuntimeInput` already includes required `trustedMoveIndex`. Confirmed in `packages/engine/src/agents/policy-preview.ts`.
2. `EvaluatePolicyMoveInput` already includes required `trustedMoveIndex`. Confirmed in `packages/engine/src/agents/policy-eval.ts`.
3. `CreatePolicyRuntimeProvidersInput` already includes required `trustedMoveIndex`. Confirmed in `packages/engine/src/agents/policy-runtime.ts`.
4. `PolicyAgent.chooseMove` already builds and forwards `trustedMoveIndex`, so production wiring is not missing. Confirmed in `packages/engine/src/agents/policy-agent.ts`.
5. `tryApplyPreview` already exists and already rejects `TrustedExecutableMove`s whose `sourceStateHash` does not match the current state hash.
6. Existing policy tests are not just mechanical callsite updates anymore. They already include behavioral coverage for trusted preview bypass, trusted preview scoring, and mismatched-hash rejection.
7. The relevant policy tests pass when executed directly from built artifacts, and the full engine/package gates also pass in a clean build-backed run.

## Architecture Check

1. **The architecture decision was correct**: index injection is still cleaner than threading optional trusted-move aliases through candidate shapes. It keeps trusted completion context at runtime-construction boundaries and reuses `stableMoveKey`, which is already the canonical preview cache key.
2. **No aliasing should be added**: any follow-up that adds `trustedMove?` onto `PolicyPreviewCandidate` or `PolicyRuntimeCandidate` would now be a regression against Foundations 9 and 10.
3. **This ticket should not reopen the design**: the trusted-preview design is already more robust than the old architecture because it consumes the validated `TrustedExecutableMove` instead of trying to reconstruct it later.
4. **No follow-up architecture change is justified here**: the current trusted-preview design and the full verification gates both passed, so this ticket should not be used to reopen the policy-preview runtime architecture.

## What to Change

### 1. Do not re-implement trustedMoveIndex plumbing

The production code already has the required plumbing. Repeating those changes would add churn with no architectural value.

### 2. Treat this ticket as verification and cleanup only

This ticket should only:

- document that the proposed architectural change already landed
- confirm the current tests that cover it
- avoid widening scope into unrelated engine build/test infrastructure unless explicitly requested

### 3. Split unrelated test-harness repair into a separate ticket

If we choose to address the failing engine package test gate, that should be a distinct build/test-infrastructure ticket. It is not a justified scope expansion for this already-implemented policy-preview work.

## Files to Touch

- `tickets/93COMMOVPOLEVA-002.md`

## Out of Scope

- Re-adding trusted preview plumbing that already exists
- Changing candidate shapes to carry trusted-move aliases
- Kernel changes (`kernel/`, `cnl/`, `sim/`)
- Repairing unrelated engine build/test infrastructure in the absence of a concrete defect tied to this ticket

## Acceptance Criteria

### Tests That Must Pass

1. Relevant policy tests pass on built artifacts:
   - `packages/engine/dist/test/unit/agents/policy-preview.test.js`
   - `packages/engine/dist/test/unit/agents/policy-eval.test.js`
   - `packages/engine/dist/test/unit/property/policy-determinism.test.js`
   - `packages/engine/dist/test/unit/property/policy-visibility.test.js`
   - `packages/engine/dist/test/unit/trace/policy-trace-events.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm -F @ludoforge/engine test` and `pnpm turbo test`

### Invariants

1. No new policy-engine code is added unless a real gap is found.
2. `PolicyPreviewCandidate`, `PolicyRuntimeCandidate`, and `CandidateEntry` stay unchanged.
3. No backwards-compatibility shims or alias fields are introduced.
4. Ticket text accurately reflects that the trusted-preview architecture is already implemented.
5. Archival/final completion requires the repo-level test gates to be green.

## Test Plan

### New/Modified Tests

No new tests are planned from this ticket revision because the trusted-preview behavior is already covered. Verification should cite the existing coverage instead.

1. `packages/engine/test/unit/agents/policy-preview.test.ts`
   Covers trusted preview bypass and `sourceStateHash` rejection.
2. `packages/engine/test/unit/agents/policy-eval.test.ts`
   Covers preview-backed policy scoring with trusted moves.
3. `packages/engine/test/unit/property/policy-determinism.test.ts`
   Verifies determinism with the required evaluator input contract.
4. `packages/engine/test/unit/property/policy-visibility.test.ts`
   Verifies preview visibility behavior with the required evaluator input contract.
5. `packages/engine/test/unit/trace/policy-trace-events.test.ts`
   Verifies trace behavior with the required evaluator input contract.

### Commands

1. `node --test packages/engine/dist/test/unit/agents/policy-preview.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/property/policy-determinism.test.js packages/engine/dist/test/unit/property/policy-visibility.test.js packages/engine/dist/test/unit/trace/policy-trace-events.test.js`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`

## Current Verification Snapshot

- `node --test packages/engine/dist/test/unit/agents/policy-preview.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/property/policy-determinism.test.js packages/engine/dist/test/unit/property/policy-visibility.test.js packages/engine/dist/test/unit/trace/policy-trace-events.test.js` passed on 2026-03-29.
- `pnpm turbo typecheck` passed on 2026-03-29.
- `pnpm turbo lint` passed on 2026-03-29.
- `pnpm -F @ludoforge/engine test` passed on 2026-03-29 after a clean build-backed run.
- `pnpm turbo test` passed on 2026-03-29.

## Outcome

- Completion date: 2026-03-29
- What actually changed:
  - Reassessed the ticket against the current codebase and confirmed the proposed trusted-preview architecture had already landed.
  - Updated the ticket so its assumptions, scope, and acceptance criteria match the current implementation instead of planning duplicate engine work.
  - Verified the existing policy-preview coverage and the required repo test gates instead of adding redundant code or tests.
- Deviations from original plan:
  - No engine code changes were made because the work described by this ticket was already implemented.
  - No new tests were added because the relevant invariants were already covered by existing policy tests.
- Verification results:
  - `node --test packages/engine/dist/test/unit/agents/policy-preview.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/property/policy-determinism.test.js packages/engine/dist/test/unit/property/policy-visibility.test.js packages/engine/dist/test/unit/trace/policy-trace-events.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
