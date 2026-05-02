# 149FITLEVNUMVM-014: Round-trip equivalence harness (closure-tree↔bytecode)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new test file
**Deps**: `archive/tickets/149FITLEVNUMVM-013.md`

## Problem

Phase 3's correctness proof: for every FITL policy profile (us-baseline, arvn-baseline, nva-baseline, vc-baseline) on a corpus of 20 seeded states, the closure-tree evaluator (current production runtime per Spec 147) and the bytecode VM produce **bit-identical scores**. This ticket lands the harness; ticket 015 lands the VM, and this harness exercises both immediately upon 015 landing.

(Note on dependency direction: this ticket builds the harness skeleton + closure-tree score capture. The actual bytecode-side score capture activates when ticket 015 lands the VM. The harness is checked in here so that ticket 015's acceptance trivially flips it from skipped → green.)

## Assumption Reassessment (2026-04-28)

1. The closure-tree evaluator is `evaluatePolicyMove` (`packages/engine/src/agents/policy-eval.ts:804`) consuming the compiled closure DAG built by `buildPolicyExprClosure`. This is the canonical-score reference for parity.
2. The bytecode compiler (ticket 013) is the mechanism for producing bytecode; the VM (ticket 015) is the mechanism for executing it.
3. The 20-seed corpus is the seed set used by existing FITL property tests (search `CANARY_SEEDS` in `packages/engine/test/integration/spec-140-bounded-termination.test.ts` — extend with 14 additional seeds if needed for breadth).

## Architecture Check

1. Property test (`@test-class: architectural-invariant`) — assertion holds across any legitimate trajectory in the corpus, not a witness pin.
2. Bit-identical score equivalence is the strongest correctness guarantee. F8 (Determinism) preserved.
3. No game-specific test scaffolding — the harness is generic over the seed × profile-variant matrix.
4. Per spec §6, "Convergence-witness tests are explicitly out of scope... score equivalence is proven by property tests, not trajectory-pinned witnesses".

## What to Change

### 1. `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` (new)

`@test-class: architectural-invariant` — for each `(seed, profile)` in `CORPUS_SEEDS × POLICY_PROFILE_VARIANTS`:
- Generate a candidate state at a representative microturn (e.g., turn 5, ply 20).
- Build the FITL GameDef + run `evaluatePolicyMove` (closure-tree path) — capture the per-candidate score array.
- Compile the same `AgentPolicyExpr` to bytecode via ticket 013's `compilePolicyBytecode`.
- Until ticket 015 lands: skip the bytecode-side execution (mark test pending). On ticket 015 landing: execute via the VM and compare scores.
- Assert: the VM's score array equals the closure-tree score array element-wise (Int32 bit-identical).

### 2. Corpus seed list

Define `CORPUS_SEEDS = [...]` — 20 seeds chosen for trajectory diversity. Reuse existing FITL canary seeds (1002, 1005, 1010, 1012, 1013, 1040 per `spec-140-bounded-termination.test.ts`) and extend with 14 additional seeds drawn from `zobrist-incremental-property-fitl-medium-diverse.test.ts` and `fitl-march-dead-end-recovery.test.ts` (or new seeds if those don't surface 14 diverse trajectories).

### 3. Compiler-determinism cross-check

Reuse ticket 013's compiler-determinism test — assert `compilePolicyBytecode` produces byte-identical output across two invocations on the same `AgentPolicyExpr` (this is part of Phase 3 acceptance per spec §Phase 3).

### 4. Activation flag

Until ticket 015 lands, the bytecode-side execution is gated behind the live Phase 4 runtime flag `LUDOFORGE_POLICY_VM=on` (the sibling VM ticket owns this flag). The harness reads the env var; if unset, the test asserts closure-tree score capture and compile-side determinism, then marks the equivalence assertion as deferred with a clear pending message.

## Files to Touch

- `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` (new)
- `packages/engine/test/fixtures/bytecode-equivalence-corpus.json` (new — pinned corpus state for reproducibility)

## Out of Scope

- VM core implementation (ticket 015).
- Default-flip (ticket 016).
- Performance assertions — equivalence is correctness, not timing.

## Acceptance Criteria

### Tests That Must Pass

1. New test: closure-tree score capture works on all 4 FITL baseline profiles × 20 seeds (the closure-tree side, even before VM lands).
2. New test (gated, activates with ticket 015): bytecode VM scores match closure-tree scores bit-identically.
3. New test: compiler determinism — `compilePolicyBytecode` byte-identical across two invocations.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. No FITL-specific test scaffolding (other than loading FITL GameDef as data).
2. Equivalence is bit-identical, not approximate.
3. F8 preserved.
4. Per `.claude/rules/testing.md`: this is `architectural-invariant`, not `convergence-witness`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` — `architectural-invariant`.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` (closure-tree side only at this ticket's scope).
3. After ticket 015 lands: re-run with `LUDOFORGE_POLICY_VM=on` to validate equivalence.
4. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`.

## Closeout Notes (2026-04-30)

Implemented the Phase 3 equivalence harness skeleton and pinned corpus fixture. The harness derives 20 deterministic FITL action-selection corpus states, captures closure-tree score rows for all four baseline profiles, verifies byte-identical bytecode compiler output across repeated compilations, and defers VM score execution until ticket 015 provides `packages/engine/src/agents/policy-vm`.

Correction ledger:
- Replaced the stale draft activation flag `LUDOFORGE_BYTECODE_VM=on` with the live sibling/spec flag `LUDOFORGE_POLICY_VM=on`.
- The checked-in corpus fixture pins the seed set and deterministic capture policy instead of storing full serialized `GameState` payloads; state hashes are asserted at runtime through canonical serialization.

## Outcome

Completed: 2026-04-30

What changed:
- Added `packages/engine/test/integration/policy-bytecode-equivalence.test.ts`.
- Added `packages/engine/test/fixtures/bytecode-equivalence-corpus.json`.
- The new focused test passes in default closure-tree mode and reports the VM branch as skipped until Phase 4 lands.

Verification:
- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js`
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo build`
- `pnpm turbo lint`
- `pnpm turbo typecheck`
