# Spec 141: Runtime Cache Ownership and Run Boundaries

**Status**: Draft  
**Priority**: P1  
**Complexity**: M  
**Dependencies**: Spec 03 [deterministic-primitives] (archived), Spec 78 [draft-state-for-effect-execution] (archived), Spec 80 [incremental-zobrist-hashing] (archived), Spec 140 [microturn-native-decision-protocol] (archived)  
**Estimated effort**: 2-4 days  
**Source**: `archive/tickets/FITLDETBOUND-001.md`, `archive/tickets/MICROPERFBOUND-001.md`, post-Spec-140 boundedness investigation on 2026-04-21 and repeated-run boundedness follow-through on 2026-04-22

## Overview

Define a first-class architectural contract for `GameDefRuntime` ownership, helper-owned run state, and repeated-run entry boundaries.

The current codebase correctly treats some runtime data as immutable compiled structure and some as per-run memo state, but that boundary is mostly implicit. This spec makes the boundary explicit and enforceable:

- structural runtime artifacts are shareable across runs
- per-run memo/cache state is isolated to one simulation or replay run
- helper-owned mutable state participating in run-like workflows is either classified as run-local or removed from the shared boundary entirely
- callers may safely reuse compiled runtime structure without inheriting retained state from prior runs

This is a Foundations issue, not a harness preference. Shared-runtime reuse must not change determinism, boundedness, legality publication, turn-flow progression, or memory growth behavior.

## Problem

`FITLDETBOUND-001` exposed that `GameDefRuntime` currently spans two different ownership classes:

1. immutable or effectively immutable compiled/runtime structure
2. mutable per-run memo state used for acceleration

The first concrete failure was shared-runtime retention across determinism/property sweeps. Reusing one runtime across many runs allowed memo state such as Zobrist key caches to accumulate across the suite. The production fix introduced `forkGameDefRuntimeForRun(...)`, which is the correct direction, but the architecture is still underspecified:

- which runtime members are allowed to retain state across runs?
- which caches are run-local?
- what is the supported caller contract for passing a runtime into `runGame(...)` or custom simulation helpers?
- when is cache reset required, and when is structural sharing required?

`MICROPERFBOUND-001` added a second lesson: not every repeated-run boundedness failure that appears under shared-runtime reuse is a pure cache-growth bug. The remaining FITL repeated-run pathology was ultimately in shared microturn / turn-flow behavior rather than in `GameDefRuntime` cache retention. That does not narrow this spec; it sharpens it. The run-boundary contract must make two things explicit:

1. runtime-owned mutable state must be isolated per run
2. run-like entry points and helper paths must be equivalence-preserving with respect to the shared authoritative protocol, so repeated-run investigations do not silently depend on helper-local state or drifted entry behavior

Without an explicit contract, boundedness depends on harness reuse shape instead of on the engine architecture. That violates Foundations `#5`, `#8`, `#10`, and `#15`.

## Goals

- Define `GameDefRuntime` as a two-layer object: shared structural runtime plus run-local state.
- Extend the contract to any helper-owned mutable state that participates in run-like workflows, even when it is not physically stored on `GameDefRuntime`.
- Make runtime reuse deterministic and bounded by construction.
- Eliminate ambiguity about which caches are shareable and which must be forked/reset at run start.
- Require custom simulation helpers to honor the same run-boundary rules as `runGame(...)`.
- Require repeated-run helper entry points to preserve the same authoritative legality / publication / turn-flow behavior as the canonical run path.
- Preserve performance benefits from shared compilation/runtime structure.

## Non-Goals

- Replacing every cache with a purely functional structure.
- Removing all runtime memoization.
- Rewriting the simulator API around a completely different runtime type unless necessary.
- Game-specific cache behavior.

## Foundations Alignment

- **Foundation 5**: one rules protocol, many clients. Shared-runtime callers and `runGame(...)` must observe the same authoritative behavior.
- **Foundation 8**: runtime reuse must not alter determinism.
- **Foundation 10**: retained work must stay bounded across repeated runs.
- **Foundation 15**: the design gap is fixed architecturally, not by relying on specific test harness patterns.
- **Foundation 16**: the run-boundary contract must be proven with automated tests.

## Design

### 1. Runtime ownership classes are explicit

Every `GameDefRuntime` member must be classified into one of:

- `sharedStructural`
- `runLocal`

`sharedStructural` members are immutable after creation and may be reused across arbitrarily many runs.

`runLocal` members may mutate during a run, but must begin from a clean state for every new run.

This classification is documented next to the runtime type and enforced in tests.

Any mutable helper-owned state that materially affects legality publication, turn advancement, repeated-run boundedness, or replay behavior must follow the same classification discipline even if it is not stored directly on `GameDefRuntime`. The architecture must not rely on “it is technically outside the runtime object” as a reason to leave ownership implicit.

### 2. Run-local state must be isolated by API contract

Any public helper that accepts a runtime and executes a run-like workflow must either:

- fork the runtime into a run-local instance before execution, or
- require a run-local runtime explicitly and document that ownership contract

The default safe contract is:

- callers may pass a shared runtime
- the engine internally derives an isolated run runtime

This applies to:

- `runGame(...)`
- determinism/property helper loops (the current concrete instance is `runVerifiedGame` in `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts`, which advances turns by calling `publishMicroturn` + `applyPublishedDecision` directly)
- future replay/profiling helpers that simulate many turns or full games
- repeated-run focused witnesses that reuse compiled runtime structure while probing boundedness, publication, or turn-flow behavior

### 3. Structural sharing remains the performance baseline

The engine must continue sharing expensive compiled/runtime structure across runs, including examples such as:

- adjacency graphs
- runtime table indexes
- compiled card metadata indexes
- other immutable compiled lookups

The fix is not “make everything per-run”. The fix is “share only what is architecturally shareable”.

### 4. Cache policy must be declared, not accidental

Each runtime cache must define:

- owner class: `sharedStructural` or `runLocal`
- cache key domain
- expected growth boundary
- reset/fork semantics

Examples:

- Zobrist key memoization (`zobristTable.keyCache`) is `runLocal` unless a stronger proof establishes a bounded structural key universe. This is the only runtime member currently reset by `forkGameDefRuntimeForRun(...)`.
- Compiled metadata lookup tables (`adjacencyGraph`, `runtimeTableIndex`, `alwaysCompleteActionIds`, `firstDecisionDomains`, `compiledLifecycleEffects`) are `sharedStructural`.
- `ruleCardCache` is a worked example of the "bounded structural key universe" path: its keys `(actionId, eventCard.id)` are compile-time finite under a given GameDef, and its values are pure functions of the GameDef. The audit must either formalize that proof and classify it `sharedStructural`, or reclassify it `runLocal` and extend `forkGameDefRuntimeForRun(...)` to reset it. Either outcome is acceptable; leaving it implicitly mutable is not.

### 5. Determinism helpers cannot bypass the boundary

Helpers that avoid `runGame(...)` for performance reasons must still honor the same run-local runtime policy. A direct helper loop is not allowed to silently weaken the runtime-boundary contract. `runVerifiedGame` is the current canonical example: it bypasses `runGame(...)` for Zobrist-incremental property coverage and today honors the fork contract by calling `forkGameDefRuntimeForRun(runtime)` at the run boundary. The contract must remain explicit so future helpers inherit the same discipline by rule, not by imitation.

### 6. Entry-point equivalence is part of the boundary

Resetting or forking caches is necessary but not sufficient.

Any run-like helper that claims to exercise the authoritative runtime behavior must preserve the same observable semantics as the canonical run path for:

- legality publication
- microturn progression
- turn-flow / lifecycle advancement
- repeated-run boundedness surfaces

The contract is not “shared runtime plus helper-specific shortcuts happen to be fast enough.” The contract is “shared runtime reuse does not change what protocol is being exercised.”

## Required Changes

### Runtime contract

- Document the runtime ownership split in the kernel architecture/type docs.
- Annotate or otherwise encode the ownership class of each runtime member.

### API surface

- Audit all run-like helpers and simulation entry points for runtime-boundary compliance. The concrete audit target in the codebase today is `runVerifiedGame` in `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts`; any new helper added in the same class must inherit the same contract.
- Normalize them onto one safe contract for shared runtime inputs.
- Audit helper-local mutable state that can survive across repeated runs or change which authoritative path is exercised.

### Verification

- Extend the existing baseline (`packages/engine/test/unit/sim/simulator.test.ts::'treats shared runtime zobrist caches as per-run state'`) into per-member classification assertions for every mutable runtime member, proving that repeated runs with one shared runtime do not accumulate run-local cache state beyond the declared ownership class. The current test covers `zobristTable.keyCache` only; the classification audit defines the remaining assertions.
- Add determinism/property witnesses proving that forked runtime use yields the same observable results as fresh runtime creation.
- Add regression coverage for at least one custom helper path that does not call `runGame(...)` — `runVerifiedGame` is the current instance.
- Add at least one repeated-run witness that compares a focused helper path against the canonical run path on the same corpus and asserts equivalent stop-surface behavior, not just “no cache growth.”

## Acceptance Criteria

1. `GameDefRuntime` ownership classes are explicitly documented and reflected in code structure.
2. Shared-runtime repeated runs do not retain run-local cache state across runs.
3. Reusing a shared runtime versus creating a fresh runtime produces identical observable outcomes for the same corpus.
4. No determinism/property/helper path bypasses the run-boundary contract through undeclared helper-local mutable state or drifted entry semantics.
5. Focused repeated-run witnesses and canonical run paths agree on the owned boundedness / stop-surface contract for the same corpus.
6. The final design preserves structural sharing for immutable runtime artifacts.

## Testing Requirements

- Unit test: shared runtime remains structurally reusable while run-local caches reset/fork between runs.
- Determinism/property regression: repeated shared-runtime corpus stays bounded and deterministic.
- Helper-path regression: direct helper loops and `runGame(...)` both respect the same runtime-boundary behavior.
- Helper-equivalence regression: a focused repeated-run helper and the canonical run path agree on the same owned stop/boundedness surface for a representative corpus.

## Follow-On Tickets

- Runtime member ownership audit and annotation sweep
- Shared-runtime API contract cleanup across simulator and helper surfaces
- Optional cache-specific hardening where a `runLocal` cache still needs tighter internal bounds

## Tickets

Decomposed on 2026-04-22:

- `tickets/141RUNCACHE-001.md` — Runtime member ownership classification and per-member cache tests
- `tickets/141RUNCACHE-002.md` — Run-like helper API surface audit and contract normalization
- `tickets/141RUNCACHE-003.md` — Forked-vs-fresh runtime parity witness
- `tickets/141RUNCACHE-004.md` — Helper path vs canonical run path equivalence witness
