# 149FITLEVNUMVM-021: Phase 4B preview hashing and verification strategy

**Status**: PENDING — Phase 4B runtime-closure prerequisite
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — preview-drive hash/canonicalization/verification strategy
**Deps**: `archive/tickets/149FITLEVNUMVM-015.md`, `archive/tickets/149FITLEVNUMVM-018.md`

## Problem

Ticket 016's VM-enabled one-card CPU profile classified hashing/canonicalization as a major remaining non-policy-VM cost bucket: about 21.8% of samples under `fnv1a64`, `zobristKey`, `computeFullHash`, `canonicalizeHashValue`, and `digestDecisionStackFrame`.

The one-card Phase 4 gate intentionally runs with `verifyIncrementalHash=true`, so determinism proof cannot be weakened. The question is whether preview simulation is doing more hash/canonicalization work than the proof requires, especially for speculative preview states that are not externally published.

## What to Change

1. Reprofile or inspect the Phase 4B one-card path and identify where preview simulation triggers full hash/canonicalization work.
2. Classify each hash/canonicalization call as:
   - externally observable determinism proof;
   - internal preview-only guard;
   - duplicate verification;
   - avoidable canonicalization of an unobserved speculative state.
3. Implement the narrowest generic strategy that reduces duplicate or preview-only hashing while preserving:
   - replay identity;
   - incremental hash verification for externally committed transitions;
   - canonical serialized state as the source of truth.
4. Add focused tests proving replay identity and hash verification still catch real divergence on committed states.
5. Record baseline/current profile evidence in this ticket's Outcome.

## Files to Touch

- Hashing and state-finalization modules under `packages/engine/src/kernel/`
- Preview-drive or simulator options under `packages/engine/src/agents/` or `packages/engine/src/sim/`
- Focused determinism/hash tests
- `tickets/149FITLEVNUMVM-021.md`

## Out of Scope

- Disabling determinism proof globally.
- Weakening `verifyIncrementalHash=true` acceptance for the final Phase 4 gate.
- Kernel expression/query AOT; ticket 019 owns that.
- Preview token-index lifetime; ticket 020 owns that.
- Policy VM default flip and closure-tree deletion; ticket 016 owns that.

## Acceptance Criteria

1. Focused hash/determinism tests pass.
2. The one-card profile shows a measured reduction in hash/canonicalization samples or wall time, or the Outcome records why this bucket is no longer the active owner.
3. `verifyIncrementalHash=true` remains meaningful for committed kernel transitions.
4. No nondeterministic or approximate hashing behavior is introduced.

## Test Plan

1. `pnpm -F @ludoforge/engine build`.
2. Focused determinism/hash verification tests.
3. `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-hash`.
