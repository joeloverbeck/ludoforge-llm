# 93COMMOVPOLEVA-004: Close remaining unit-test gaps for trusted index fast-path

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — test-only ticket after reassessment
**Deps**: `archive/tickets/93COMMOVPOLEVA-002.md`

## Problem

93COMMOVPOLEVA-002 already landed the trusted index fast-path in production code, but its unit-test coverage is incomplete. The remaining gap is not architecture delivery; it is proof coverage for the fast-path invariants that still lack direct tests.

The missing proof points are:
1. A trusted indexed move that consumes RNG is masked as `{ kind: 'unknown', reason: 'random' }`
2. The fast-path result is cached, so repeated preview resolution does not re-apply the move
3. An explicitly empty `trustedMoveIndex` still falls back to `classifyPlayableMoveCandidate`

## Assumption Reassessment (2026-03-29)

1. `packages/engine/test/unit/agents/policy-preview.test.ts` exists and already exercises `createPolicyPreviewRuntime` through injected `PolicyPreviewDependencies`. Confirmed.
2. `TrustedExecutableMove` has fields `move: Move`, `sourceStateHash: bigint`, `provenance: TrustedMoveProvenance`. Confirmed.
3. `PolicyPreviewCandidate` is `{ move: Move; stableMoveKey: string }`. Confirmed.
4. After 93COMMOVPOLEVA-002, `createPolicyPreviewRuntime` accepts `trustedMoveIndex` and `getPreviewOutcome` checks it before calling `classifyPlayableMoveCandidate`. Confirmed.
5. The code already contains two dedicated trusted-index tests:
   - trusted move bypasses classification and resolves preview state
   - `sourceStateHash` mismatch is rejected before application
6. The ticket's original proposed engine/API changes are stale because `policy-agent.ts`, `policy-eval.ts`, `policy-runtime.ts`, and `policy-preview.ts` already thread and consume `trustedMoveIndex`. Confirmed.

## Architecture Check

1. **Current architecture is the right one**: Index-injection by `stableMoveKey` keeps candidate types unchanged and localizes trusted-move knowledge to preview-runtime construction. That is cleaner and more extensible than threading optional trusted-move payloads through every candidate structure.
2. **Test isolation remains strong**: The preview runtime already exposes dependency injection for `classifyPlayableMoveCandidate`, `applyMove`, and `derivePlayerObservation`, so the remaining gaps can be covered without touching production code.
3. **Determinism proof (F5/F11)**: The existing `sourceStateHash` mismatch test already proves the state-hash safety guard. The missing trusted-index RNG test is still needed to prove that the fast-path preserves the stochasticity guard.
4. **No game-specific logic**: Tests continue to use synthetic `GameDef`/`GameState`/`Move` fixtures only.

## What to Change

### 1. Extend the existing trusted-index coverage in `policy-preview.test.ts`

**Already present and should remain passing**
- trusted indexed move bypasses `classifyPlayableMoveCandidate` and resolves a `ready` preview
- mismatched `sourceStateHash` returns failed/unknown without calling `applyMove`

**Add: "masks trusted indexed moves that consume rng"**
- Create a trusted move with matching `sourceStateHash`
- Mock `applyMove` to return a state with DIFFERENT RNG (simulating RNG consumption)
- Call `resolveSurface`
- Assert preview returns `undefined` (unknown/random)
- Assert `classifyPlayableMoveCandidate` was NOT called

**Add: "caches trusted indexed preview application"**
- Create a trusted move with matching hash
- Call `resolveSurface` twice with the same candidate
- Assert `applyMove` was called exactly once (second call uses cache)

### 2. Add an explicit fallback test for the no-index path

**Add: "empty trustedMoveIndex falls through to classifyPlayableMoveCandidate"**
- Pass `trustedMoveIndex: new Map()`
- Call `resolveSurface`
- Assert `classifyPlayableMoveCandidate` WAS called (original path)

## Files to Touch

- `packages/engine/test/unit/agents/policy-preview.test.ts` (modify — add new test group)

## Out of Scope

- Integration tests with FITL (that's 93COMMOVPOLEVA-005)
- Changes to production source files
- Golden fixture updates
- Performance benchmarks
- Tests for `PolicyAgent.chooseMove` integration (that's covered by 005)

## Acceptance Criteria

### Tests That Must Pass

1. Existing test: trusted indexed move bypasses classification and resolves preview still passes
2. Existing test: mismatched `sourceStateHash` is rejected before apply still passes
3. New test: trusted indexed move that consumes RNG resolves to unknown still passes
4. New test: trusted indexed preview result is cached still passes
5. New test: empty `trustedMoveIndex` falls through to classification still passes
6. All existing tests in the file still pass
7. Relevant engine and workspace test suites pass

### Invariants

1. No production source files modified in this ticket
2. Tests use synthetic fixtures only — no game-specific imports
3. Mock assertions prove both branches: fast-path bypasses classification when indexed, and empty index falls back to classification
4. Existing `sourceStateHash` guard coverage continues to prove the F5 safety invariant
5. New trusted-index RNG coverage proves the fast-path preserves the stochasticity invariant

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview.test.ts` — add 3 tests; preserve and re-verify the 2 existing trusted-index tests

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/agents/policy-preview.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test`

## Outcome

- **Completion date**: 2026-03-29
- **What actually changed**:
  - Corrected the ticket scope to match the current codebase: the trusted index architecture and two dedicated fast-path tests were already implemented before this ticket.
  - Added the remaining three unit tests in `packages/engine/test/unit/agents/policy-preview.test.ts` covering trusted-index RNG masking, trusted-index caching, and explicit empty-index fallback to classification.
- **Deviations from original plan**:
  - No production or API work was needed. The original ticket described architecture and test additions that were already partially or fully present.
  - The implemented work narrowed to proof coverage only, which is the architecturally correct scope after reassessment.
- **Verification results**:
  - `pnpm turbo build` passed
  - `node --test packages/engine/dist/test/unit/agents/policy-preview.test.js` passed
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm turbo test` passed
  - `pnpm turbo lint` passed
