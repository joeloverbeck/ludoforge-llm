# 149FITLEVNUMVM-020: Phase 4B preview state and token-index lifetime

**Status**: PENDING — Phase 4B runtime-closure prerequisite
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — preview-drive state/index lifetime and token-state-index copy behavior
**Deps**: `archive/tickets/149FITLEVNUMVM-015.md`, `archive/tickets/149FITLEVNUMVM-018.md`

## Problem

Ticket 016's VM-enabled one-card CPU profile classified token-index copy/lifetime work as a remaining non-policy-VM cost bucket. `copyCachedTokenStateIndex` plus token-state-index build/attach/refresh accounted for about 4.8% of CPU samples, and adjacent profile buckets still show preview application and state churn dominate the wall clock after the policy VM is enabled.

This is not a bytecode problem. It is a state/index lifetime problem in the preview-drive path.

## What to Change

1. Reprofile or inspect the Phase 4B one-card path and identify the exact preview state/index copy sites.
2. Implement the narrowest generic lifetime improvement, such as:
   - copy-on-write token-state-index snapshots;
   - scoped mutable preview state with undo log;
   - avoiding index copies when the preview branch does not mutate indexed fields;
   - another generic design proven by the profile.
3. Preserve Foundation 11:
   - caller-visible `GameState` remains immutable;
   - any mutation is scoped to one synchronous preview execution;
   - no shared mutable descendants leak outside the preview scope.
4. Preserve Foundation 8:
   - deterministic replay identity;
   - canonical state hash semantics;
   - identical legal/action publication behavior.
5. Add regression tests that prove input state is not mutated and preview results remain equivalent.
6. Record baseline/current profile evidence in this ticket's Outcome.

## Files to Touch

- Preview-drive modules under `packages/engine/src/agents/`
- Token-state-index modules under `packages/engine/src/kernel/`
- Focused tests under `packages/engine/test/unit/` or `packages/engine/test/integration/`
- `tickets/149FITLEVNUMVM-020.md`

## Out of Scope

- Kernel expression/query AOT; ticket 019 owns that.
- Hash/verification strategy; ticket 021 owns that.
- Policy VM default flip and closure-tree deletion; ticket 016 owns that.
- Weakening the `<=250 ms` Phase 4 budget.

## Acceptance Criteria

1. Focused immutability and equivalence tests pass.
2. The one-card profile shows a measured reduction in token-index copy/lifetime samples or wall time, or the Outcome records why this bucket is no longer the active owner.
3. No caller-visible mutable state leaks from the preview path.
4. No game-specific fast paths are introduced.

## Test Plan

1. `pnpm -F @ludoforge/engine build`.
2. Focused immutability/equivalence tests for preview state/index behavior.
3. `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-preview-index`.
