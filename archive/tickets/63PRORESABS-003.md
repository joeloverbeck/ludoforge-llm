# 63PRORESABS-003: Migrate `choose-n-option-resolution.ts` probe catch blocks to `ProbeResult`

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel choose-n-option-resolution refactoring
**Deps**: `archive/tickets/63PRORESABS-001.md`

## Problem

`choose-n-option-resolution.ts` has 4 try/catch blocks that classify probe errors:
- Lines 280, 437: `isChoiceDecisionOwnerMismatchDuringProbe(error)` → return `ambiguous` outcome (2 sites, in `resolveMultiProbeOutcome` and `resolveSingletonProbeOutcome`)
- Lines 307, 455: `isChoiceDecisionOwnerMismatchDuringProbe(error)` → rethrow if not matching (2 sites, in satisfiability classification)

All 4 follow the identical catch-classify-or-rethrow pattern for owner mismatch errors during chooseN option probing.

## Assumption Reassessment (2026-04-07)

1. `choose-n-option-resolution.ts` imports `isChoiceDecisionOwnerMismatchDuringProbe` from `./legal-choices.js` at line 16 — confirmed via Grep.
2. The 4 catch blocks are at lines 280, 307, 437, 455 — confirmed via Grep for `catch.*error` with context.
3. These catch blocks wrap calls to probe evaluation functions (`evaluateProbeMove`, `classifyProbeMoveSatisfiability`) — which are local or imported from `legal-choices.ts`.
4. After ticket 002 refactors `legal-choices.ts`, the probe functions called from this file may already return `ProbeResult`. If so, this ticket's migration is simpler (just read results). If not, local wrappers need the same treatment.

## Architecture Check

1. The migration follows the same pattern as ticket 002: replace catch-and-classify with `ProbeResult` reads.
2. No game-specific logic — chooseN option resolution is a generic kernel concept.
3. No backwards-compatibility shims.

## What to Change

### 1. Replace catch blocks with `ProbeResult` reads

For each of the 4 catch sites, change from:

```typescript
try {
  probed = evaluateProbeMove(probeMove);
} catch (error: unknown) {
  if (isChoiceDecisionOwnerMismatchDuringProbe(error)) {
    return { kind: 'ambiguous' };
  }
  throw error;
}
```

To reading `ProbeResult.outcome`:

```typescript
const probed = evaluateProbeMove(probeMove);
if (probed.outcome === 'inconclusive') {
  return { kind: 'ambiguous' };
}
```

If the called probe functions don't yet return `ProbeResult` (because they're local to this file rather than imported from `legal-choices.ts`), wrap them to catch internally and return `ProbeResult`.

### 2. Remove `isChoiceDecisionOwnerMismatchDuringProbe` import

After all 4 catch blocks are replaced, the import from `./legal-choices.js` is no longer needed. Remove it.

## Files to Touch

- `packages/engine/src/kernel/choose-n-option-resolution.ts` (modify — refactor 4 catch blocks, remove import)

## Out of Scope

- `legal-choices.ts` catch blocks (ticket 002)
- Missing-binding deferral sites (ticket 004)
- Deleting `isChoiceDecisionOwnerMismatchDuringProbe` from `legal-choices.ts` (ticket 005)

## Acceptance Criteria

### Tests That Must Pass

1. `choose-n-option-resolution.ts` has zero try/catch blocks that check `isChoiceDecisionOwnerMismatchDuringProbe(error)`.
2. `choose-n-option-resolution.ts` does not import `isChoiceDecisionOwnerMismatchDuringProbe`.
3. `pnpm -F @ludoforge/engine test` — all existing tests pass.
4. `pnpm -F @ludoforge/engine test:determinism` — determinism canary passes.

### Invariants

1. All chooseN option legality classifications produce the same results before and after.
2. Unknown errors are still rethrown.

## Test Plan

### New/Modified Tests

1. Existing tests exercise chooseN resolution extensively. No new test file needed — behavioral equivalence is the acceptance criterion.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:determinism`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completed: 2026-04-07
- Changed `packages/engine/src/kernel/choose-n-option-resolution.ts` to route choose-N probe evaluation and satisfiability classification through local `ProbeResult` wrappers, removing the ticket-owned owner-mismatch catch classification sites and the `isChoiceDecisionOwnerMismatchDuringProbe` import from this file.
- Deviation from original plan: none. The reassessment-confirmed local-wrapper path was the needed implementation because this file's probe callbacks were not already `ProbeResult`-returning.
- Verification:
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine test:determinism`
