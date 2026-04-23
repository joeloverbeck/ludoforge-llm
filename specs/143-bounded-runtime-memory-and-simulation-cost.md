# Spec 143: Bounded Runtime Memory and Simulation Cost

**Status**: Draft  
**Priority**: P1  
**Complexity**: L  
**Dependencies**: Spec 140, Spec 141 (builds on them; no forced implementation order beyond Foundations alignment)  
**Estimated effort**: 5-8 days  
**Source**: post-Spec-140 FITL boundedness/memory investigation on 2026-04-23. The investigation was surfaced during work on `tickets/ENG-230-required-free-operation-admissibility-parity.md`; ENG-230 is the origin ticket, not a functional dependency — it addresses a distinct legality-contract parity gap at seed 1006, and its fix is not on the critical path for this spec.

## Overview

Define an explicit engine contract for bounded live runtime memory and bounded per-decision simulation cost.

The current engine already enforces bounded legality publication, atomic microturn decisions, and run-boundary cache ownership. That is necessary, but not sufficient. The live FITL policy witness exposed a second architectural requirement:

- a long simulation must not retain decision-local serialization, preview payloads, or cache entries in ways that make heap usage climb with play length
- the same retained surfaces must not silently degrade per-decision runtime as games get longer

This spec formalizes that requirement as an engine property rather than a FITL-specific optimization project. FITL is the motivating witness because it is the first live corpus that drives the engine hard enough to expose the gap, but the contract is generic to any large game with many decisions, previews, and chooseN interactions.

## Problem

The current Spec 140 FITL policy witness (`profiles=us-baseline,arvn-baseline,nva-baseline,vc-baseline seed=1002`) still OOMs in the engine after the already-landed run-boundary fixes from Spec 141 and after several local memory reductions discovered during this investigation.

What the investigation established:

- the remaining failure is not located in the ENG-230 admissibility code path (ENG-230 is still PENDING; this is a scope claim about where the memory issue lives, not a prediction about what its eventual fix will accomplish)
- repeated-run shared-runtime cache retention was a real issue and already belongs to Spec 141, but the isolated single-run witness still OOMs after those protections
- decision-local serialization and preview/caching surfaces can still accumulate enough live state to drive the process to the heap limit during one long game
- when memory rises through a long self-play run, simulation cost also tends to rise because the engine is carrying and revisiting larger live structures

Concrete evidence from the current investigation:

- `decisionStackFrame` Zobrist features were previously interning oversized serialized frame strings; replacing them with bounded digests removed real waste but did not solve the OOM
- token-state-index churn was real and was reduced, but the isolated witness still OOMed
- child decision-stack frames were redundantly copying root `accumulatedBindings`; removing that duplication helped but did not solve the OOM
- a heap snapshot of the isolated witness showed that the strongest remaining live suspect is not one giant static authored string or one repeated-run runtime cache, but active retained execution/context surfaces during a long policy run. The top-N retainer breakdown from that snapshot is load-bearing evidence for this spec and should be checked in as `reports/spec-143-heap-snapshot.md` during the first implementation ticket, so follow-on tickets have concrete per-structure targets rather than a qualitative description
- a causal toggle showed that chooseN `probeCache` is not the primary remaining driver

The architectural gap is now clearer:

the engine lacks an explicit contract for which decision-local and preview-local structures may remain live across a long run, how they are keyed, and how their memory footprint and evaluation cost stay bounded as turn count increases.

Without that contract, Foundations `#8`, `#10`, and `#15` are only partially enforced. The engine may remain deterministic and microturn-correct while still violating bounded execution in practice through retained transient state.

## Goals

- Define bounded-memory rules for live simulation state, decision contexts, preview helpers, and chooseN/policy support structures.
- Require decision-local transient data to have explicit ownership and lifetime.
- Prevent large serialized payloads from being retained as live execution identity when a smaller canonical representation exists.
- Make long-run memory growth and long-run per-decision slowdown part of the same architectural surface.
- Add proof-oriented regression coverage for both boundedness and runtime-cost stability on long simulations.

## Non-Goals

- FITL-specific engine branches or special-case memory heuristics.
- Eliminating all caches or all preview support.
- Replacing deterministic exact behavior with approximate or time-based cutoffs.
- Defining runner/UI memory policy. This spec is engine/runtime only.

## Foundations Alignment

- **Foundation 5**: the same kernel protocol used by simulator, runner, and agents must remain executable without accumulating hidden client-specific retained state.
- **Foundation 8**: deterministic execution is not enough if one long deterministic run still exhausts memory through retained transient state.
- **Foundation 10**: the bounded enumeration and bounded microturn-sequence guarantees of Foundation 10 naturally imply bounded live support state for the machinery that produces them; this spec makes that implication explicit at the memory and per-decision runtime-cost boundary. (Foundation 10's literal text covers bounded iteration, recursion, enumeration, and microturn sequences; the live-state and runtime-cost extension is stated here rather than claimed as already written into the Foundation.)
- **Foundation 11**: any scoped internal mutation used to canonicalize, compact, or drop retained support state must remain inside Foundation 11's scoped-mutation exception — no aliasing escaping the scope, no observation before finalization — and must be regression-tested as such.
- **Foundation 13**: canonical-identity compaction for retained decision/preview surfaces must preserve replay and artifact-identity semantics. GameDef hashes, replay fixtures, and zobrist-derived keys must remain stable across the compaction work; any change that would alter a pinned artifact identity is out of scope for this spec and belongs in an explicit migration.
- **Foundation 15**: the fix must target root ownership/representation boundaries, not symptom patches for one FITL witness or one cache.
- **Foundation 16**: long-run boundedness and cost behavior must be proven by automated witnesses.
- **Foundation 19**: atomic decision uniformity implies that live engine state should retain atomic decision context only, not oversized compound reconstruction payloads when a smaller canonical identity suffices.

## Design

### 1. Decision-local state must have explicit lifetime classes

Every runtime structure that participates in a single long simulation must be classified as one of:

- `persistent-authoritative`: part of `GameState` or other authoritative replay-relevant state
- `run-local-structural`: reusable within one run, but bounded independently of decision count
- `decision-local-transient`: valid only for the current publication / preview / witness-search scope and must be discarded once that scope completes

The current gap exists because several execution helpers effectively behave as decision-local-transient state while being retained as if they were run-local-structural.

The following non-binding classification maps the concrete structures surfaced by the current investigation to their intended class. It is a starting point for the audit proposed under Required Changes; each row becomes a concrete per-structure confirmation or correction during the follow-on tickets, not a pre-committed fix.

| Structure | Intended class | Notes |
|---|---|---|
| `GameState` fields used for replay/continuation | `persistent-authoritative` | snapshot source of truth; already bounded |
| `GameDefRuntime` structural tables | `run-local-structural` | bounded by compiled GameDef; already owned by Spec 141's run-boundary contract |
| `zobristTable.keyCache` (`packages/engine/src/kernel/zobrist.ts:218`) | `run-local-structural` | must remain bounded by the feature domain, not by simulation length — audit confirms bound + drop-on-reset |
| Token-state index (`packages/engine/src/kernel/token-state-index.ts`) | `run-local-structural` | bounded by live token count; audit churn and retention |
| Policy preview / evaluation contexts (`packages/engine/src/agents/policy-preview.ts`) | `decision-local-transient` | scope: one publication / preview evaluation; drop at scope exit |
| ChooseN `probeCache`, `legalityCache` (`packages/engine/src/kernel/choose-n-session.ts:292-293`) | `decision-local-transient` (session-scoped) | drop at chooseN session exit |
| `decisionStackFrame` live fields (`packages/engine/src/kernel/microturn/types.ts:205-212`) | split: continuation-required fields → `persistent-authoritative`; transient preview/search fields → `decision-local-transient` | the split is itself audit work |
| Granted-operation / decision-preview helper state | `decision-local-transient` | drop at decision scope exit |

The audit proposed in Required Changes is the process by which this table becomes authoritative.

### 2. Serialized payloads are not acceptable live identities when smaller canonical forms exist

The engine must not use full serialized decision/context/pipeline payloads as long-lived live identities unless the serialization is itself the minimal canonical state artifact.

Examples of acceptable identities:

- compact digests
- stable structural ids plus bounded parameter fingerprints
- immutable indexes into compiled/runtime tables

Examples of unacceptable identities:

- full serialized decision-stack frames retained as cache keys
- preview/session/cache keys that embed large replay-like payloads or whole parameter documents when a smaller canonical projection would uniquely identify the same semantic boundary

This is not a style preference. Oversized serialized identities convert transient semantic context into retained heap growth and extra hashing/comparison cost.

### 3. Preview and witness-search helpers must be scope-bounded

Any helper used for:

- chooseN witness search
- granted-operation preview
- policy candidate preview/evaluation
- legality/constructibility support probing

must declare:

- owner scope
- key shape
- maximum retained population per scope
- drop/reset rule at scope exit

The engine must not rely on “the GC will eventually recover it” as the only boundedness mechanism for these helpers.

### 4. Long-run cost stability is part of the same contract

Memory and runtime cost are linked at this boundary.

If a long simulation keeps more preview state, cache entries, serialized keys, or context payloads alive as the game grows, then later decisions become slower because the engine must:

- allocate more
- hash/compare larger values
- walk larger maps/arrays/contexts
- trigger more GC work

Therefore this spec treats “RAM skyrockets through FITL” and “one FITL game takes too long” as the same architectural class unless proven otherwise. The owned contract is:

- long-run live memory must stay bounded by the intended runtime state model
- later decisions in the same run must not become slower purely because transient support state was retained beyond its intended lifetime

### 5. Boundedness belongs at the ownership boundary, not only at individual caches

The implementation may fix multiple concrete sites, but the design boundary is broader than any one structure such as:

- `zobristTable.keyCache`
- chooseN `probeCache`
- chooseN `legalityCache`
- token-state indexes
- policy preview contexts
- decision-stack frame encodings

The architecture must define which of these are:

- truly persistent for the duration of a run
- shareable only within a tightly bounded scope
- required to compact/canonicalize their keys and values

Any local fix that leaves the ownership class implicit is incomplete.

### 6. Live state should retain atomic reconstruction data only where replay/continuation actually requires it

Atomic microturn execution sometimes needs suspended continuation data, selected bindings, or pending preview context. That is allowed.

But the live retained form must be the minimum data needed to:

- resume deterministic execution
- reconstruct the next atomic decision boundary
- preserve replay/audit correctness

If a field exists only for convenience of intermediate preview/search work and is not required for authoritative continuation, it should not remain embedded in long-lived state objects.

## Required Changes

### Ownership and representation audit

- Audit decision-local, preview-local, and witness-search-local retained structures in the engine.
- Classify each one by lifetime class and document the intended bound.
- Replace oversized serialized identities with bounded canonical identities where possible.

### ChooseN / preview / policy support audit

- Audit chooseN helper caches and session state for retained-population bounds and key compactness.
- Audit policy preview/evaluation contexts for large serialized payload capture.
- Audit granted-operation and decision-preview helper state for decision-local lifetime compliance.

### Runtime-cost proof surface

- Add a focused proof surface for long-run memory boundedness in engine tests. The heap-boundedness witness for the motivating FITL policy seed lives under `packages/engine/test/policy-profile-quality/` (alongside existing policy-profile witnesses such as `fitl-variant-all-baselines-convergence.test.ts`) and uses the `POLICY_PROFILE_QUALITY_REGRESSION` advisory-CI channel defined in FOUNDATIONS.md (Appendix). A blocking determinism-tier test is the wrong home — the boundedness claim is a quality-signal-plus-memory-ceiling, not an engine-level determinism invariant.
- Add an advisory long-run cost witness showing that later-decision runtime does not drift pathologically for the same fixed scenario/profile/seed corpus. Same home and same advisory channel as the heap-boundedness witness.
- Keep these proofs engine-generic even when FITL is the motivating witness.

## Acceptance Criteria

1. The engine defines explicit lifetime classes for long-run simulation support state.
2. No long-lived engine cache or context retains oversized serialized decision/preview payloads when a smaller canonical representation exists.
3. Long simulations cannot OOM purely because decision-local transient support state accumulates without an explicit architectural bound.
4. The owned witness corpus demonstrates that long-run heap growth is materially reduced on the motivating FITL policy run.
5. The owned witness corpus also demonstrates that per-decision runtime does not degrade pathologically over the same run due to retained transient support state.
6. The final design remains engine-agnostic and does not introduce FITL-specific branches.

## Testing Requirements

- Heap-boundedness regression for the isolated long-run FITL policy witness that currently OOMs. Lives under `packages/engine/test/policy-profile-quality/` using the advisory `POLICY_PROFILE_QUALITY_REGRESSION` warning channel (per FOUNDATIONS.md Appendix), modeled on the existing baseline-convergence tests in that directory.
- Focused unit/integration regressions for any canonicalization or lifetime-boundary changes made to support structures.
- At least one engine-generic regression proving a decision-local helper/cache is dropped or compacted at scope exit.
- Advisory long-run performance witness on a fixed corpus showing that decision cost does not climb pathologically with turn count after the fix. Same home and advisory channel as the heap-boundedness witness.

## Follow-On Tickets

Suggested namespace: `143BOUNDMEM-*` (following the pattern of `141RUNCACHE-*`).

- Lifetime-class audit for chooseN, preview, and policy-evaluation support state
- Canonical identity compaction for retained decision/preview surfaces
- Long-run heap witness and advisory simulation-cost witness (home: `packages/engine/test/policy-profile-quality/`, advisory CI channel)
- FITL motivating-corpus proof and non-FITL engine-generic regression hardening
- Check in `reports/spec-143-heap-snapshot.md` summarizing the top-N retainer breakdown that motivates the audit (load-bearing evidence for the contract)

## Notes

- Spec 141 already owns repeated-run runtime cache boundaries. This spec owns the remaining single-run retained-state and long-run-cost boundary.
- The correct completion bar is not “the FITL seed no longer crashes on this machine.” The correct bar is an explicit architectural contract plus regression proof that the engine no longer retains transient support state in a way that makes long simulations blow up or slow down pathologically.

## Tickets

Decomposed 2026-04-23 under namespace `143BOURUNMEM`:

- `tickets/143BOURUNMEM-001.md` — Heap-snapshot evidence report and top-N retainer breakdown
- `tickets/143BOURUNMEM-002.md` — Lifetime-class audit and authoritative classification
- `tickets/143BOURUNMEM-003.md` — Canonical-identity compaction for oversized serialized retained structures
- `tickets/143BOURUNMEM-004.md` — Scope-boundary enforcement for decision-local-transient helpers
- `tickets/143BOURUNMEM-005.md` — Long-run heap-boundedness witness (FITL motivating corpus)
- `tickets/143BOURUNMEM-006.md` — Advisory long-run per-decision cost witness
- `tickets/143BOURUNMEM-007.md` — Engine-generic decision-local-helper drop/compact regression
