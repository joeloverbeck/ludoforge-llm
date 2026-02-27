# FITLACTFILT-001: Fix resolveCommitment tautological executor/pre pattern

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small-Medium
**Engine Changes**: None — game spec + tests + bootstrap artifact
**Deps**: None

## Problem

The `resolveCommitment` action in the FITL game spec uses:
- `actor: active`
- `executor: '0'`
- `pre: { op: '==', left: { ref: activePlayer }, right: 0 }`

Because `executor: '0'` forces `ctx.activePlayer = 0` (US) in precondition/effect eval context, the `pre` check is tautological and provides no real faction filter. With `actor: active`, any active faction can legally submit `resolveCommitment` during commitment phase.

This is the same pattern that was fixed for `nvaTransferResources` and `vcTransferResources` where `executor: '2'`/`'3'` made their `pre` checks tautological.

## Assumption Reassessment (2026-02-27)

1. `resolveCommitment` currently uses `actor: active`, `executor: '0'`, and `pre: activePlayer == 0` in `data/games/fire-in-the-lake/30-rules-actions.md`.
2. `packages/runner/src/bootstrap/fitl-game-def.json` currently compiles this to `executor: { id: 0 }` with unchanged tautological precondition.
3. Existing integration test `packages/engine/test/integration/fitl-commitment-executor.test.ts` asserts current behavior:
   - expects explicit US executor (`{ id: 0 }`)
   - expects `resolveCommitment` to remain legal for non-US active factions in commitment phase
4. `resolveCommitment` has no action pipeline profile; legality is controlled by selector + precondition.
5. Commitment effects are US-specific (`coup-process-commitment`) and execute under executor context (US seat), while action submission remains tied to `actor: active`.
6. Attempting to change to `actor: '0'` + `executor: 'actor'` causes commitment flow regressions in existing integration tests (`fitl-commitment-phase`), where card-73 no longer remains in commitment phase as expected.

## Architecture Check

1. For this action, robust behavior is:
   - `actor: active` (current commitment flow authority)
   - `executor: '0'` (US eval/effect context)
   - `pre: null` (remove tautological no-op guard)
2. This keeps existing commitment-phase flow semantics intact while removing misleading dead logic.
3. Change stays data-driven and engine-agnostic (no kernel special-casing).

## What to Change

### 1. Remove tautological precondition on resolveCommitment

In `data/games/fire-in-the-lake/30-rules-actions.md`, keep selectors as-is (`actor: active`, `executor: '0'`) and remove the tautological precondition.

Before:
```yaml
- id: resolveCommitment
  actor: active
  executor: '0'
  phase: [commitment]
  pre: { op: '==', left: { ref: activePlayer }, right: 0 }
```

After:
```yaml
- id: resolveCommitment
  actor: active
  executor: '0'
  phase: [commitment]
  pre: null
```

### 2. Recompile bootstrap JSON

Regenerate `packages/runner/src/bootstrap/fitl-game-def.json` after the spec change.

### 3. Update commitment executor tests to match corrected semantics

Update `packages/engine/test/integration/fitl-commitment-executor.test.ts`:
- assert `actor` remains `active`
- assert executor remains explicit US (`{ id: 0 }`)
- assert `pre` is now `null`
- keep positive non-US commitment resolution assertion (existing flow contract)

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — executor value)
- `packages/runner/src/bootstrap/fitl-game-def.json` (modify — recompile output)
- `packages/engine/test/integration/fitl-commitment-executor.test.ts` (modify — correct expectations)

## Out of Scope

- Adding pipeline profiles for commitment-phase actions
- Auditing/refactoring all other selector patterns outside `resolveCommitment`
- Changing commitment-phase game flow logic

## Acceptance Criteria

### Tests That Must Pass

1. FITL E2E golden suite: `pnpm -F @ludoforge/engine test:e2e`
2. FITL integration tests: `pnpm -F @ludoforge/engine test`
3. Full suite: `pnpm turbo test`

### Invariants

1. `resolveCommitment` no longer contains a tautological precondition.
2. `resolveCommitment` remains legal for active non-US factions during commitment phase (existing flow contract).
3. Commitment-phase effects continue to execute under US context via `executor: '0'`.
4. No engine/kernel code changes.

## Test Plan

### New/Modified Tests

1. Modify `fitl-commitment-executor.test.ts` to remove old assumptions that codify the bug.
2. Add/strengthen assertions for:
   - selector shape (`actor:'active'`, `executor:{id:0}`, `pre:null`)
   - non-US positive path (flow compatibility)

### Commands

1. `pnpm turbo build`
2. `pnpm turbo test --force`
3. `pnpm -F @ludoforge/engine test:e2e`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Removed tautological `pre` from `resolveCommitment` in FITL rules data.
  - Kept `actor: active` and `executor: '0'` to preserve proven commitment flow semantics.
  - Regenerated runner bootstrap fixture JSON.
  - Updated commitment executor integration test to assert no tautological precondition while preserving non-US active resolution coverage.
- Deviations from original plan:
  - Did not switch to `actor: '0'` / `executor: 'actor'` because it regressed commitment-phase behavior in existing production integration coverage.
  - Scope narrowed to tautology removal without changing authority model.
- Verification results:
  - `pnpm turbo build` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine test:e2e` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo test` passed.
