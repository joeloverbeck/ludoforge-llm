# 93COMMOVPOLEVA-004: Unit tests for trusted index fast-path

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test-only
**Deps**: `tickets/93COMMOVPOLEVA-002.md`

## Problem

The trusted index fast-path added in 93COMMOVPOLEVA-002 needs dedicated unit tests proving:
1. A completed move in the index produces a `ready` preview outcome (bypassing `classifyPlayableMoveCandidate`)
2. A `sourceStateHash` mismatch returns `{ kind: 'unknown', reason: 'failed' }`
3. Stochastic moves in the index that consume RNG return `{ kind: 'unknown', reason: 'random' }`
4. The cache is populated on the fast-path (second call returns cached result)

## Assumption Reassessment (2026-03-29)

1. `policy-preview.test.ts` exists with ~6 `createPolicyPreviewRuntime` callsites. Tests use injected `PolicyPreviewDependencies` to mock `applyMove`, `classifyPlayableMoveCandidate`, and `derivePlayerObservation`. Confirmed.
2. `TrustedExecutableMove` has fields `move: Move`, `sourceStateHash: bigint`, `provenance: TrustedMoveProvenance`. Confirmed.
3. `PolicyPreviewCandidate` is `{ move: Move; stableMoveKey: string }`. Confirmed.
4. After 93COMMOVPOLEVA-002, `createPolicyPreviewRuntime` accepts `trustedMoveIndex` on input and `getPreviewOutcome` checks it before calling `classifyPlayableMoveCandidate`.

## Architecture Check

1. **Test isolation**: Tests inject mock dependencies — `applyMove`, `classifyPlayableMoveCandidate`, `derivePlayerObservation` are all controllable. The trusted index fast-path bypasses `classifyPlayableMoveCandidate`, so tests verify the mock is NOT called when a trusted move is in the index.
2. **Determinism proof (F5/F11)**: The `sourceStateHash` mismatch test proves the F5 safety guard works. The RNG-changed test proves stochastic moves are correctly rejected.
3. **No game-specific logic**: Tests use synthetic `GameDef`/`GameState`/`Move` fixtures — no FITL or Texas Hold'em imports.

## What to Change

### 1. New test group in `policy-preview.test.ts`: "trusted index fast-path"

**Test: "produces ready outcome for trusted move with matching state hash"**
- Create a `TrustedExecutableMove` with `sourceStateHash` matching the input state's `stateHash`
- Put it in the `trustedMoveIndex` keyed by a known `stableMoveKey`
- Mock `applyMove` to return a state with unchanged RNG
- Mock `derivePlayerObservation` to return `{ requiresHiddenSampling: false }`
- Call `resolveSurface` with a candidate whose `stableMoveKey` matches the index key
- Assert the preview resolves to a numeric value (not `undefined`/fallback)
- Assert `classifyPlayableMoveCandidate` was NOT called (spy check)

**Test: "returns failed for sourceStateHash mismatch"**
- Create a `TrustedExecutableMove` with `sourceStateHash` that does NOT match `input.state.stateHash`
- Put it in the index
- Call `resolveSurface` with a matching candidate
- Assert the preview returns `undefined` (indicating `unknown` outcome)
- Assert `applyMove` was NOT called (spy check — the guard short-circuits before apply)

**Test: "returns random for stochastic trusted move"**
- Create a trusted move with matching `sourceStateHash`
- Mock `applyMove` to return a state with DIFFERENT RNG (simulating RNG consumption)
- Call `resolveSurface`
- Assert preview returns `undefined` (unknown/random)
- Assert `classifyPlayableMoveCandidate` was NOT called

**Test: "caches fast-path result"**
- Create a trusted move with matching hash
- Call `resolveSurface` twice with the same candidate
- Assert `applyMove` was called exactly once (second call uses cache)

### 2. New test group: "trusted index with empty map (existing behavior)"

**Test: "empty trustedMoveIndex falls through to classifyPlayableMoveCandidate"**
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

1. New test: "produces ready outcome for trusted move with matching state hash" passes
2. New test: "returns failed for sourceStateHash mismatch" passes
3. New test: "returns random for stochastic trusted move" passes
4. New test: "caches fast-path result" passes
5. New test: "empty trustedMoveIndex falls through to classifyPlayableMoveCandidate" passes
6. All existing tests in the file still pass
7. Full suite: `pnpm turbo test`

### Invariants

1. No production source files modified in this ticket
2. Tests use synthetic fixtures only — no game-specific imports
3. Mock spy assertions prove the fast-path bypasses `classifyPlayableMoveCandidate`
4. The `sourceStateHash` guard test proves F5 safety

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview.test.ts` — 5 new tests in "trusted index fast-path" group

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "trusted index"` (targeted — if supported by node --test)
2. `pnpm -F @ludoforge/engine test` (full engine suite)
3. `pnpm turbo test` (workspace-wide)
