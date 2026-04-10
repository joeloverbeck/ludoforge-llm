# Architectural Abstraction Recovery: zobrist

**Status**: COMPLETED
**Date**: 2026-04-10
**Input**: `packages/engine/test/determinism/zobrist*` (4 test files)
**Engine modules analyzed**: ~25 direct + ~80 transitive (kernel core, effects, phase-advance, sim, agents, cnl)
**Prior reports consulted**: none

## Executive Summary

The zobrist determinism test suite exercises a well-structured hash maintenance protocol across 4 kernel subsystems (zobrist modules, effect handlers, phase-advance, apply-move). **No high-severity cross-subsystem fractures were found.** The architecture shows deliberate layering: zobrist modules own hash computation, effect handlers own per-mutation incremental updates, and `reconcileRunningHash` acts as a comprehensive safety-net for immutable code paths. One medium-severity projection drift candidate was identified (feature encoding duplication between `computeFullHash` and `reconcileRunningHash`), one low-severity concept aliasing observation (`stateHash` vs `_runningHash`), and one conditional finding around the two-strategy hash reconciliation pattern. The system is primarily an example of **acceptable complexity** — the distributed hash maintenance is intentional and well-tested.

## Scenario Families

| Family | Tests | Domain Concepts | Key Assertions |
|--------|-------|----------------|----------------|
| Full parity verification | 7 (5 Texas seeds, 2 FITL seeds) | Incremental hash, full recompute, production games | Every move: `_runningHash === computeFullHash()` |
| Interval parity verification | 1 (Texas seed=42, interval=5) | Sampled verification, execution options | Every 5th move: hash matches full recompute |
| Property-based Texas sweep | 2 (25 sequential + 10 diverse seeds) | Broad seed coverage, move count | >250/100 total moves, no HASH_DRIFT |
| Property-based FITL short sweep | 1 (8 diverse seeds) | FITL random play, short runs | >80 total moves, no HASH_DRIFT |
| Property-based FITL medium sweep | 1 (6 diverse seeds) | FITL random play, medium runs | >60 total moves, no HASH_DRIFT |

## Traceability Summary

| Module Cluster | Scenario Families | Confidence | Strategy |
|----------------|------------------|------------|----------|
| zobrist.ts, zobrist-var-hash.ts, zobrist-token-hash.ts, zobrist-phase-hash.ts | All | High | Import + temporal coupling |
| effects-token.ts, effects-var.ts, effects-resource.ts, effects-markers.ts, effects-turn-flow.ts | All (indirect) | High | Import (call zobrist update functions) |
| apply-move.ts | All | High | Import (verification + reconciliation) |
| phase-advance.ts | All (indirect) | High | Import (reconcileRunningHash calls) |
| initial-state.ts | All | High | Import (computeFullHash for initial hash) |
| sim/simulator.ts | All | High | Import (runGame orchestration) |
| serde.ts | Parity families | Medium | Import (_runningHash stripping/restoring) |
| gamedef-runtime.ts | All | High | Import (ZobristTable caching) |

Phase 3 satisfied by Phase 1 outputs — import analysis + temporal coupling achieve high confidence for all exercised modules. No registry/dispatch indirection or barrel-heavy ambiguity was found in the zobrist-specific code paths.

## Fracture Summary

| # | Fracture Type | Location | Evidence Sources | Severity |
|---|--------------|----------|-----------------|----------|
| 1 | Projection drift (conditional) | `computeFullHash` vs `reconcileRunningHash` | Import analysis + code structure | MEDIUM |
| 2 | Concept aliasing | `stateHash` vs `_runningHash` across kernel | Import analysis + serde behavior | LOW |

## Candidate Abstractions

### 1. Hash Feature Encoding Protocol

**Kind**: Protocol
**Scope**: zobrist.ts, zobrist-phase-hash.ts
**Fractures addressed**: #1 (Projection drift)

**Owned truth**: The canonical encoding of each `ZobristFeature` variant into XOR-key material.

**Invariants**:
- `computeFullHash` and `reconcileRunningHash` must iterate the same feature categories with identical encoding.
- Any new `ZobristFeature` kind added to `encodeFeature` must also be handled in `reconcileRunningHash`.

**Owner boundary**: Already correctly owned by the `zobrist*.ts` module family.

**Modules affected**: `zobrist.ts` (owns `computeFullHash`, `encodeFeature`), `zobrist-phase-hash.ts` (owns `reconcileRunningHash`)

**Tests explained**: All 5 scenario families — they verify that incremental and full-recompute produce identical hashes.

**Expected simplification**: Currently, `computeFullHash` (zobrist.ts:246-416) and `reconcileRunningHash` (zobrist-phase-hash.ts:229-442) both enumerate all ~14 feature categories. They use different iteration strategies (full enumeration vs diff-based), which is **correct by design** — full recompute iterates state exhaustively while reconciliation diffs two states. The risk is that adding a new feature category to one but not the other causes silent drift. However, the existing test suite with `verifyIncrementalHash: true` already serves as the protocol enforcement mechanism.

**FOUNDATIONS alignment**:
- Foundation #8 (Determinism): Aligned — both functions preserve deterministic hashing
- Foundation #11 (Immutability): Aligned — `computeFullHash` is pure, `reconcileRunningHash` operates on immutable state pairs
- Foundation #16 (Testing as Proof): Aligned — the parity tests ARE the proof that the protocol holds

**Confidence**: Medium
**Counter-evidence**: If no `ZobristFeature` kind has ever been added to one function but not the other (verified by examining git history of both functions), then the "drift risk" is theoretical, not evidenced. The test suite's property-based coverage across two games with diverse seeds makes silent drift extremely unlikely to survive.

### 2. Hash Identity Pair (stateHash / _runningHash)

**Kind**: Authority boundary
**Scope**: types-core.ts, serde.ts, apply-move.ts, initial-state.ts
**Fractures addressed**: #2 (Concept aliasing)

**Owned truth**: The relationship between `stateHash` (the canonical, serialized hash for external consumers) and `_runningHash` (the internal incremental accumulator).

**Invariants**:
- At every public state boundary (after `applyMove` returns), `stateHash === _runningHash`.
- `_runningHash` is stripped during serialization (serde.ts:30) and restored from `stateHash` during deserialization (serde.ts:52).
- Only `apply-move.ts` and `initial-state.ts` are authorized to set `stateHash`.

**Owner boundary**: `apply-move.ts` (line 1491-1495) and `initial-state.ts` (line 118-119) — both correctly synchronize the pair.

**Modules affected**: types-core.ts (defines both fields), serde.ts (strips/restores), apply-move.ts (synchronizes), initial-state.ts (initializes)

**Tests explained**: Full parity and interval parity families — they verify `_runningHash === computeFullHash()` after reconciliation.

**Expected simplification**: The two-field design is intentional: `stateHash` is the public, serializable hash; `_runningHash` is the internal mutable accumulator that effect handlers update incrementally. Merging them would break the immutability contract (effects need a mutable accumulator, but external state must be immutable). No simplification warranted.

**FOUNDATIONS alignment**:
- Foundation #8 (Determinism): Aligned — the pair ensures hash correctness
- Foundation #11 (Immutability): Aligned — `_runningHash` exists precisely to enable scoped internal mutation (Foundation #11 exception)
- Foundation #9 (Replay/Auditability): Aligned — `stateHash` in serialized traces enables replay verification

**Confidence**: Low (this is acceptable architecture, not a fracture)
**Counter-evidence**: If `stateHash !== _runningHash` at any public boundary, the `verifyIncrementalHash` mechanism would catch it. The existing tests prove this invariant holds.

## Acceptable Architecture

### Distributed Hash Maintenance (effects-*.ts)

The pattern where each effect handler (`effects-token.ts`, `effects-var.ts`, `effects-resource.ts`, `effects-markers.ts`, `effects-turn-flow.ts`) calls zobrist update functions at mutation sites is **correctly architected**. Each effect handler owns the domain knowledge of what state it mutates and calls the appropriate zobrist helper. This is not a "split protocol" — it's proper separation of concerns:

- **Effect handlers** know WHAT changes (tokens moved, vars updated, markers set)
- **Zobrist helpers** know HOW to hash changes (XOR in/out features)
- **reconcileRunningHash** provides a comprehensive safety net for immutable code paths that can't call incremental helpers

The alternative (centralizing all hash updates in one place) would require that central module to understand every effect type — a worse coupling.

### Two-Strategy Hash Reconciliation

The kernel uses two hash maintenance strategies:

1. **Mutable-scope incremental updates**: Effect handlers call `updateZoneTokenHash`, `updateVarRunningHash`, `addToRunningHash`, etc. on `MutableGameState._runningHash` during effect execution.
2. **Immutable-scope reconciliation**: `reconcileRunningHash(table, baseline, target)` diffs two `GameState` objects and produces the correct hash for the target. Used by `phase-advance.ts` (6 call sites) and `apply-move.ts` (1 call site) for state transitions that happen outside the mutable effects scope.

This dual strategy is correct: mutable effects are performance-optimized (O(1) per mutation), while immutable transitions use the comprehensive diff (O(changed features)). The `apply-move.ts` pipeline finalizes by running `reconcileRunningHash` on the pre-effects state vs post-lifecycle state, catching any drift from the immutable lifecycle/advance code paths.

### GameDefRuntime Caching

`gamedef-runtime.ts` caches the `ZobristTable` alongside other precomputed data. All callers access the table via `cachedRuntime?.zobristTable` with graceful degradation (undefined falls back to full recompute or no-op). This is clean, correct, and well-tested.

### Test Pyramid Structure

The zobrist test suite forms a proper verification pyramid: unit tests for individual hash operations, integration tests for phase transitions, property tests for broad coverage, and full-parity oracle tests. This is a textbook approach to determinism verification.

## Needs Investigation

### Feature Category Enumeration Synchronization (single signal: code structure)

`computeFullHash` and `reconcileRunningHash` both enumerate ~14 feature categories. They are in different files (`zobrist.ts` vs `zobrist-phase-hash.ts`). A second signal (git history showing one updated without the other, or a test that catches a newly-added feature being missed) would elevate this to a confirmed fracture. 

**What to look for**: `git log --all -p -- packages/engine/src/kernel/zobrist.ts packages/engine/src/kernel/zobrist-phase-hash.ts` — check if any commit adds a feature kind to `computeFullHash` without a corresponding change to `reconcileRunningHash` (or vice versa). If no such commit exists in the project history, this remains theoretical.

### Marker Hash Initialization Gap (single signal: code structure)

In `effects-markers.ts`, when a marker is set for the first time (no previous explicit value), the code uses `addToRunningHash` rather than `updateRunningHash`. This is correct for the first-time case. However, `computeFullHash` iterates all markers in `state.markers` without distinguishing first-set vs updated. The `reconcileRunningHash` similarly handles markers by diffing old/new. The potential gap: if a marker is set, then the zone is removed from state, the marker's hash contribution might not be properly cleaned up. 

**What to look for**: A test that creates a marker, then removes the zone containing it, and verifies hash parity. If such a test exists or if zones are never removed, this is not a concern.

## Recommendations

- **Spec-worthy**: None. The architecture is sound and well-tested.
- **Conditional**: "Hash Feature Encoding Protocol" — promote to spec-worthy ONLY if git history reveals a past incident where `computeFullHash` and `reconcileRunningHash` diverged on a feature category. Run: `git log --all -p -- packages/engine/src/kernel/zobrist.ts packages/engine/src/kernel/zobrist-phase-hash.ts | grep -A5 -B5 "kind:"` to check. If no divergence found, defer.
- **Acceptable**: Distributed hash maintenance, two-strategy reconciliation, GameDefRuntime caching, stateHash/_runningHash pair, test pyramid structure.
- **Needs investigation**: Marker hash initialization gap (low priority — test with zone removal scenario).

## Outcome

- **Completion date**: 2026-04-10
- **What changed**: No code changes. Both "needs investigation" items were verified and falsified:
  1. Feature category enumeration sync — git history shows no commit ever modified `computeFullHash` without also updating `reconcileRunningHash` (post-creation). Risk is theoretical only.
  2. Marker hash initialization gap — zones are never removed at runtime (no `removeZone`/`deleteZone` exists in the engine). The hypothesized gap cannot occur.
- **Deviations from plan**: None. The report's primary conclusion (acceptable architecture, no spec-worthy fractures) was confirmed by verification checks.
- **Verification results**: Both counter-evidence checks ran successfully. Neither warranted specs or tickets.
