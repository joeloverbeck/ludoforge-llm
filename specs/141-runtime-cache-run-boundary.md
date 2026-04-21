# Spec 141: Runtime Cache Ownership and Run Boundaries

**Status**: Draft  
**Priority**: P1  
**Complexity**: M  
**Dependencies**: Spec 03, Spec 78, Spec 80, Spec 140  
**Estimated effort**: 2-4 days  
**Source**: `tickets/FITLDETBOUND-001.md`, post-Spec-140 boundedness investigation on 2026-04-21

## Overview

Define a first-class architectural contract for `GameDefRuntime` ownership and lifetime.

The current codebase correctly treats some runtime data as immutable compiled structure and some as per-run memo state, but that boundary is mostly implicit. This spec makes the boundary explicit and enforceable:

- structural runtime artifacts are shareable across runs
- per-run memo/cache state is isolated to one simulation or replay run
- callers may safely reuse compiled runtime structure without inheriting retained state from prior runs

This is a Foundations issue, not a harness preference. Shared-runtime reuse must not change determinism, boundedness, legality publication, or memory growth behavior.

## Problem

`FITLDETBOUND-001` exposed that `GameDefRuntime` currently spans two different ownership classes:

1. immutable or effectively immutable compiled/runtime structure
2. mutable per-run memo state used for acceleration

The most concrete failure was shared-runtime retention across determinism/property sweeps. Reusing one runtime across many runs allowed memo state such as Zobrist key caches to accumulate across the suite. The production fix introduced `forkGameDefRuntimeForRun(...)`, which is the correct direction, but the architecture is still underspecified:

- which runtime members are allowed to retain state across runs?
- which caches are run-local?
- what is the supported caller contract for passing a runtime into `runGame(...)` or custom simulation helpers?
- when is cache reset required, and when is structural sharing required?

Without an explicit contract, boundedness depends on harness reuse shape instead of on the engine architecture. That violates Foundations `#5`, `#8`, `#10`, and `#15`.

## Goals

- Define `GameDefRuntime` as a two-layer object: shared structural runtime plus run-local state.
- Make runtime reuse deterministic and bounded by construction.
- Eliminate ambiguity about which caches are shareable and which must be forked/reset at run start.
- Require custom simulation helpers to honor the same run-boundary rules as `runGame(...)`.
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

### 2. Run-local state must be isolated by API contract

Any public helper that accepts a runtime and executes a run-like workflow must either:

- fork the runtime into a run-local instance before execution, or
- require a run-local runtime explicitly and document that ownership contract

The default safe contract is:

- callers may pass a shared runtime
- the engine internally derives an isolated run runtime

This applies to:

- `runGame(...)`
- determinism/property helper loops
- future replay/profiling helpers that simulate many turns or full games

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

- Zobrist key memoization is `runLocal` unless a stronger proof establishes a bounded structural key universe.
- compiled metadata lookup tables are `sharedStructural`.

### 5. Determinism helpers cannot bypass the boundary

Helpers that avoid `runGame(...)` for performance reasons must still honor the same run-local runtime policy. A direct helper loop is not allowed to silently weaken the runtime-boundary contract.

## Required Changes

### Runtime contract

- Document the runtime ownership split in the kernel architecture/type docs.
- Annotate or otherwise encode the ownership class of each runtime member.

### API surface

- Audit all run-like helpers and simulation entry points for runtime-boundary compliance.
- Normalize them onto one safe contract for shared runtime inputs.

### Verification

- Add focused unit tests proving that repeated runs with one shared runtime do not accumulate run-local cache state.
- Add determinism/property witnesses proving that forked runtime use yields the same observable results as fresh runtime creation.
- Add regression coverage for at least one custom helper path that does not call `runGame(...)`.

## Acceptance Criteria

1. `GameDefRuntime` ownership classes are explicitly documented and reflected in code structure.
2. Shared-runtime repeated runs do not retain run-local cache state across runs.
3. Reusing a shared runtime versus creating a fresh runtime produces identical observable outcomes for the same corpus.
4. No determinism/property helper bypasses the run-boundary contract.
5. The final design preserves structural sharing for immutable runtime artifacts.

## Testing Requirements

- Unit test: shared runtime remains structurally reusable while run-local caches reset/fork between runs.
- Determinism/property regression: repeated shared-runtime corpus stays bounded and deterministic.
- Helper-path regression: direct helper loops and `runGame(...)` both respect the same runtime-boundary behavior.

## Follow-On Tickets

- Runtime member ownership audit and annotation sweep
- Shared-runtime API contract cleanup across simulator and helper surfaces
- Optional cache-specific hardening where a `runLocal` cache still needs tighter internal bounds
