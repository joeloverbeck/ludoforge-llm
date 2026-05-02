# 149FITLEVNUMVM-021: Phase 4B preview hashing and verification strategy

**Status**: COMPLETED — hash sample reduction landed; Phase 4 gate remains with ticket 022
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

## Outcome

Completed: 2026-05-02

Implemented the narrowest accepted generic hash/canonicalization change: `digestDecisionStackFrame` now memoizes deterministic decision-frame digests in a `WeakMap` keyed by the immutable frame object. This keeps full hash computation and committed-state verification semantics unchanged while avoiding repeated canonicalization/digest work when the same private or committed decision-frame object is hashed more than once in a runtime lifetime.

Preserved invariants:

- `verifyIncrementalHash=true` still performs full committed-state verification.
- `computeFullHash` still includes decision stack frames, unavailable actions, next frame/turn ids, and active decider state.
- The cache is object-lifetime scoped through `WeakMap`; it is not serialized, not game-specific, and does not change canonical hash values.

Rejected candidate:

- A broader attempt to incrementally reconcile decision-stack bookkeeping inside preview microturn helpers passed focused correctness proof but worsened the same-seam profile (`phase4b-hash-current` `elapsedMs=10245.74` versus the pre-candidate reassessment run `elapsedMs=6607.39`). It was removed before closeout because digesting decision-stack frames during every bookkeeping transition cost more than the full-hash canonicalization it replaced.

Measured evidence:

- Reassessment baseline before this accepted change:
  - `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-hash-reassess` — overall Phase 4 gate still RED: `elapsedMs=6607.39`, per-card `elapsedMs=6607.14`, threshold `<=250`.
  - CPU profile command: `timeout 180 env LUDOFORGE_POLICY_VM=on node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-149-021-cpu packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-hash-cpu`.
  - CPU profile artifact: `/tmp/ludoforge-149-021-cpu/CPU.20260502.220555.3.0.001.cpuprofile` (ephemeral).
  - Parser method: grouped V8 self samples by function/file and counted hash-related frames (`zobrist.js`, `zobrist-phase-hash.js`, `stable-fingerprint.js`, plus named hash functions).
  - Hash-related samples: `1928 / 8517 = 22.64%`; named hash-function samples: `1773 / 8517 = 20.82%`.
- Current profile after the accepted digest cache:
  - `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-hash-cache-current` — overall Phase 4 gate still RED: `elapsedMs=6726.48`, per-card `elapsedMs=6726.27`, threshold `<=250`.
  - CPU profile command: `timeout 180 env LUDOFORGE_POLICY_VM=on node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-149-021-cache-cpu packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-hash-cache-cpu`.
  - CPU profile artifact: `/tmp/ludoforge-149-021-cache-cpu/CPU.*.cpuprofile` (ephemeral).
  - Hash-related samples: `1887 / 8980 = 21.01%`; named hash-function samples: `1734 / 8980 = 19.31%`.

Verdict: the ticket-owned hash/canonicalization sample bucket is reduced (`22.64%` -> `21.01%` by the same parser group), but wall time remains noisy and the broader Phase 4 `<=250 ms` gate is still red by the wrong order of magnitude. This ticket does not unblock ticket 016. Ticket 022 remains the final same-seam reprofile gate, and ticket 016 remains the later policy-VM default-flip / closure-tree deletion owner.

Verification:

- `pnpm -F @ludoforge/engine build` — PASS.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/zobrist-hash-updates.test.js` — PASS.
- `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/zobrist-incremental-parity.test.js` — PASS.
- `env LUDOFORGE_POLICY_VM=on pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` — PASS.
- `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-hash-cache-current` — PASS as ticket-owned measurement; RED for the broader Phase 4 `<=250 ms` gate as expected above.
