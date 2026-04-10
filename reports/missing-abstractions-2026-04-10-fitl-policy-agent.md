# Missing Abstraction Analysis: fitl-policy-agent

**Date**: 2026-04-10
**Input**: packages/engine/test/integration/fitl-policy-agent.test.ts
**Engine modules analyzed**: ~288 (22 agents/ + 254 kernel/ + 12 sim/ — short-circuit rule applied)
**Prior reports consulted**: none

## Executive Summary

Analysis of the FITL policy agent integration test suite (19 tests, 1426 lines) produced **2 findings** (1 Medium, 1 High), **5 acceptable architecture areas**, and **2 items needing investigation**. The dominant structural signal is duplicated surface reference resolution logic between `policy-preview.ts` and `policy-runtime.ts` (Lens A scatter reinforced by Lens B split-protocol fracture). The secondary finding concerns move-type taxonomy fragmentation across the agents↔kernel boundary. The overall architecture is well-factored — the agents subsystem has clear layering and the kernel maintains strong separation.

## Scenario Families

| Family | Tests | Domain Concepts | Key Assertions |
|--------|-------|----------------|----------------|
| Aggregation compilation & evaluation | 5 (#1-5) | globalTokenAgg, globalZoneAgg, adjacentTokenAgg, threshold activation | Compiled expressions match manual board counts; conditional consideration activates at correct thresholds |
| Production profile compilation | 2 (#6-7) | seat bindings, preview config, consideration scopes | All 4 seats bound; preview modes compile correctly from YAML |
| Preview evaluation pipeline | 3 (#8, 10, 12) | stochastic preview, margin evaluation, hidden sampling, differentiation | Preview outcomes are classified correctly; non-event candidates retain differentiated scores |
| Template completion & deduplication | 2 (#9, 11) | incomplete templates, stableMoveKey, duplicate removal | Templates concretized before evaluation; duplicates removed (exactly 10 on seed-6 reproducer) |
| Completion guidance independence | 2 (#15-16) | guided vs unguided, phase-1 ranking stability | Adding completion guidance doesn't perturb phase-1 action ranking; both produce viable moves |
| Granted operation preview | 1 (#17) | post-event grants, margin delta, non-event score invariance | Grant preview produces metadata; non-event scores unchanged with/without grant evaluation |
| Deterministic self-play & immutability | 4 (#13-14, 18-19) | seed replay, no fallback, no mutation, multi-seed | Self-play deterministic across seeds; no state mutation; no emergency fallback |

## Traceability Summary

| Module Cluster | Scenario Families | Confidence | Strategy |
|----------------|------------------|------------|----------|
| agents/policy-agent, policy-eval, policy-evaluation-core | All families | High | Import + test call sites |
| agents/prepare-playable-moves | Template completion, Dedup, Completion guidance | High | Import + direct assertion |
| agents/policy-preview, policy-runtime | Preview evaluation, Granted operation | High | Import + assertion on preview outcomes |
| agents/policy-surface | Preview evaluation, Aggregation | High | Import + margin assertions |
| agents/policy-profile-resolution | Production compilation, Completion guidance | High | Import + profile ID assertions |
| agents/completion-guidance-choice, completion-guidance-eval | Completion guidance, Template completion | High | Import + guided/unguided comparison |
| kernel/ (full subsystem via short-circuit) | Deterministic self-play, Template completion | High | Short-circuit (runGame loop) |
| sim/simulator | Deterministic self-play | High | Import (runGame) |

Phase 3 satisfied by Phase 1 outputs — import analysis + temporal coupling achieve high confidence for all exercised modules.

## Findings

### F1: Duplicated Surface Reference Resolution Between Preview and Current-State Resolvers — MEDIUM

**Detection**: Cross-lens reinforced (Lens A: scattered dispatch + duplicated helpers; Lens B: split protocol)
**Kind**: Projection owner
**Scope**: agents/policy-preview.ts, agents/policy-runtime.ts, agents/policy-surface.ts

**Owned truth**: The mapping from a compiled surface reference (`ref.family` + `ref.id` + `ref.selector`) to a concrete numeric value, given a game state and visibility rules.

**Invariants**:
- For the same `(ref, state, seatId, playerId)` tuple, the current-state and preview resolvers must return identical values (or preview returns `unknown` with a reason when the state is uncertain).
- Visibility checks always precede value resolution.
- Per-player variable resolution always resolves seat selectors through `resolvePolicyRoleSelector`.

**Owner boundary**: A shared `resolveSurfaceRefValue(state, ref, context)` function in `policy-surface.ts`, called by both `policy-runtime.ts` (current-state provider) and `policy-preview.ts` (preview provider), with the preview wrapper adding outcome classification (`ready`/`stochastic`/`unknown`).

**Evidence**:
- `policy-preview.ts:152-250` — `resolveSurface()` implementation with 8 `ref.family` if-chains (Lens A: scattered dispatch)
- `policy-runtime.ts:222-315` — `resolveSurface()` implementation with 8 parallel `ref.family` if-chains (Lens A: scattered dispatch)
- `policy-preview.ts:436-492` — `resolvePerPlayerTargetIndex()` + `resolveSeatVarRef()` private helper definitions (Lens A: duplicated code)
- `policy-runtime.ts:380-410` — Near-identical `resolvePerPlayerTargetIndex()` + `resolveSeatVarRef()` private helpers (Lens A: duplicated code)
- `policy-preview.ts:456-479` — `resolveActiveCardEntryFromState()` + `resolveActiveCardFamilyValue()` (Lens A: duplicated code)
- `policy-runtime.ts:412-430` — `resolveActiveCardEntry()` + `resolveActiveCardFamily()` — same logic, different names (Lens A: concept aliasing within single subsystem)
- Temporal coupling cluster: `policy-evaluation-core.ts`, `policy-preview.ts`, `policy-runtime.ts` co-changed in 2 commits (Lens B: hidden seam)

**Scenario families explained**: Preview evaluation pipeline, Granted operation preview, Aggregation compilation & evaluation
**Modules affected**: policy-preview.ts (consumers move to shared resolver), policy-runtime.ts (consumers move to shared resolver), policy-surface.ts (gains shared resolver)
**Expected simplification**: ~120 lines of duplicated dispatch + helpers consolidated. New surface families (e.g., `globalMarker` which exists only in runtime) would be added in one place. Visibility + resolution testing surface is halved.

**FOUNDATIONS alignment**:
- Section 1 (Engine Agnosticism): aligned — no game-specific logic in either resolver
- Section 5 (One Rules Protocol): aligned — both resolvers consume kernel state identically
- Section 11 (Immutability): aligned — all resolution is read-only projection
- Section 15 (Architectural Completeness): strained — duplicated resolution logic is an incomplete abstraction

**Confidence**: High
**Counter-evidence**: The preview resolver wraps results in `{ kind: 'value' | 'unknown' | 'unavailable' }` while the current-state resolver returns `number | undefined`. This wrapper difference may justify separate dispatch chains if the wrapping logic is tightly coupled to family-specific resolution. However, inspection shows the wrapping is uniform across all families — it's applied after resolution, not during.

---

### F2: Move Lifecycle Type Fragmentation Across Agents↔Kernel Boundary — HIGH

**Detection**: Cross-lens reinforced (Lens A: trustedMoveIndex threading through 6 files; Lens B: concept aliasing + boundary inversion)
**Kind**: Lifecycle carrier
**Scope**: kernel/types-core.ts, kernel/playable-candidate.ts, kernel/legal-moves.ts, agents/prepare-playable-moves.ts, agents/policy-agent.ts, agents/policy-eval.ts

**Owned truth**: The lifecycle state of a move from enumeration through evaluation to execution: `enumerated → classified (viability probed) → playable (template completed) → trusted (hash-anchored, execution-safe) → selected (agent-chosen)`.

**Invariants**:
- A `TrustedExecutableMove` is always backed by a valid viability probe for its source state.
- A `ClassifiedMove` with `trustedMove !== undefined` carries the same identity as its wrapper.
- The `trustedMoveIndex` maps stableMoveKeys to `TrustedExecutableMove` instances bijectively within a single evaluation cycle.
- Template completion produces either `playableComplete` or `playableStochastic` — rejected candidates never enter the trusted index.

**Owner boundary**: The kernel owns the definition of move lifecycle stages (types). The agents subsystem owns the evaluation pipeline that advances moves through stages. Currently, the stage definitions are split: `ClassifiedMove` and `TrustedExecutableMove` in kernel, `PlayableCandidateClassification` in kernel/playable-candidate.ts, `PreparedPlayableMoves` in agents/prepare-playable-moves.ts. A unified move lifecycle type with explicit stage discrimination would clarify ownership.

**Evidence**:
- `kernel/types-core.ts` — Defines `TrustedExecutableMove` (line ~1119) and `ClassifiedMove` (line ~1126) as separate interfaces without lifecycle relationship (Lens B: concept aliasing)
- `kernel/playable-candidate.ts` — Defines `PlayableCandidateClassification` with `kind: 'playableComplete' | 'playableStochastic' | 'rejected'` wrapping `TrustedExecutableMove` (Lens B: concept aliasing — third type for same domain)
- `agents/prepare-playable-moves.ts:34-51` — `isZoneFilterMismatchOnFreeOpTemplate()` injects agent-specific viability heuristic into kernel's classification flow (Lens B: boundary inversion)
- `agents/policy-agent.ts:91-93` — Builds `trustedMoveIndex` from prepared moves (Lens A: index construction)
- `agents/policy-eval.ts:143,423,679` — Receives `trustedMoveIndex` as input, passes through to evaluation core, creates EMPTY_TRUSTED_MOVE_INDEX for edge cases (Lens A: index threading through 6 files)
- `agents/policy-preview.ts:68,278,294` — Receives `trustedMoveIndex`, uses it for candidate resolution (Lens A: index threading)
- `agents/policy-runtime.ts:103,124` — Receives and passes `trustedMoveIndex` (Lens A: index threading)

**Scenario families explained**: Template completion & deduplication, Completion guidance independence, Deterministic self-play
**Modules affected**: kernel/types-core.ts (lifecycle type clarification), kernel/playable-candidate.ts (alignment with lifecycle), agents/prepare-playable-moves.ts (boundary clarification), agents/policy-agent.ts (index construction)
**Expected simplification**: The `trustedMoveIndex` threading would become a property of the move lifecycle container rather than a separate artifact passed through 6 files. The agent-specific viability heuristic (`isZoneFilterMismatchOnFreeOpTemplate`) would have a clear extension point rather than being an inline override.

**FOUNDATIONS alignment**:
- Section 1 (Engine Agnosticism): aligned — all types are generic
- Section 5 (One Rules Protocol): strained — multiple move representations fragment the protocol; agents re-validates kernel viability decisions
- Section 12 (Compiler-Kernel Validation Boundary): strained — agents injects viability logic that arguably belongs in kernel
- Section 15 (Architectural Completeness): strained — overlapping types suggest incomplete lifecycle model
- Section 17 (Strongly Typed Domain Identifiers): aligned — types are nominally distinct (but lifecycle stages are implicit rather than discriminated)

**Confidence**: Medium
**Counter-evidence**: The type fragmentation may be intentional layering rather than accidental aliasing. `ClassifiedMove` represents kernel's view (raw viability probe), while `TrustedExecutableMove` represents a hash-anchored execution contract, and `PreparedPlayableMoves` represents the agent's filtered output. These serve different consumers. The `isZoneFilterMismatchOnFreeOpTemplate` heuristic may legitimately belong in agents as a policy decision about which kernel rejections to retry. If these consumer-specific views are genuinely needed, consolidating them into a single lifecycle type could create an over-coupled god-type.

---

## Acceptable Architecture

**1. Policy profile resolution pipeline** (`policy-profile-resolution.ts`): Clean, focused module with single responsibility. Resolves seat → binding → profile with null-safe early returns at each step. No scatter, no duplication. 2 exported functions, no cross-module state.

**2. Token filter matching** (`policy-evaluation-core.ts:matchesTokenFilter`): Single implementation, single call site. The `matchesTokenFilter`, `matchesZoneScope`, and `matchesZoneFilter` functions are cleanly colocated with `PolicyEvaluationContext` which is their sole consumer.

**3. Agent factory and descriptor parsing** (`factory.ts`): Clean dispatch from descriptor kind to agent constructor. No duplicate validation, no scattered guards.

**4. Completion guidance subsystem** (`completion-guidance-choice.ts` + `completion-guidance-eval.ts`): Well-separated from move-level evaluation. `buildCompletionChooseCallback` returns an optional callback consumed by `preparePlayableMoves` — clean dependency injection pattern. The test demonstrates guidance independence (scenario family 5) through the two-file separation.

**5. Victory surface calculation** (`policy-surface.ts:buildPolicyVictorySurface`): Single authoritative implementation. Both `policy-preview.ts` and `policy-runtime.ts` call into it (rather than duplicating margin calculation). Caching strategies differ between callers (preview: per-outcome object; runtime: by stateHash map) but the computation itself is centralized.

## Needs Investigation

**1. PolicyEvaluationContext dual lifecycle (move + completion)**

Single signal: Lens B identifies that `PolicyEvaluationContext` carries move-level caches, completion-level context, and state-level read contexts as a single class (policy-evaluation-core.ts:219-258). Cache invalidation in `setCurrentCandidates()` couples move-level and completion-level evaluation.

Second signal to look for: Check whether completion-level evaluation ever uses move-level caches (stateFeatureCacheByState, candidateFeatureCache) or vice versa. If caches are truly shared across scopes, the dual lifecycle is justified. If they're disjoint, separation would reduce coupling.

Lens: Lens B (overloaded abstraction)
Falsification: If move-level and completion-level evaluations share aggregate caches (which appears likely since both evaluate considerations against the same state features), then the single context is the correct abstraction and splitting would duplicate cache management.

**2. agents↔kernel type coupling frequency**

Single signal: Git temporal coupling shows `policy-evaluation-core.ts` co-changes with `kernel/types-core.ts` and `kernel/schemas-core.ts` in 3 commits (cluster #2-3 from git analysis).

Second signal to look for: Check whether the coupling is purely type-level (import changes when kernel types evolve) or behavioral (agents logic changes when kernel semantics change). Type-level coupling is expected and healthy; behavioral coupling would indicate a missing adapter boundary.

Lens: Lens B (hidden seam)
Falsification: If all 3 co-change commits involve only type import additions (new fields, new union members) without behavioral logic changes in agents, then this is normal type evolution, not a fracture.

## Recommendations

- **Spec-worthy**: F1 (Surface resolution dispatch duplication) — concrete consolidation target with ~120 lines of measurable reduction and clear owned truth.
- **Conditional**: F2 (Move lifecycle type fragmentation) — verify whether the `isZoneFilterMismatchOnFreeOpTemplate` heuristic could be expressed as a kernel-level retry policy before proposing type unification. If kernel can own the retry semantics, promote to spec-worthy. If the retry is inherently agent-policy (varies by agent configuration), then the current boundary is correct and F2 should be deferred.
- **Acceptable**: Profile resolution, token filter matching, agent factory, completion guidance, victory surface calculation.
- **Needs investigation**: PolicyEvaluationContext dual lifecycle, agents↔kernel type coupling frequency.

## Triage Coverage (2026-04-10)

| Item | Report Rating | Verified | Disposition | Artifact |
|------|--------------|----------|-------------|----------|
| F1: Surface resolution duplication | MEDIUM | Confirmed (~100-110 lines) | **Spec-worthy** | `specs/125-surface-resolution-consolidation.md` |
| F2: Move lifecycle type fragmentation | HIGH | Partially disconfirmed | **Dismissed** | — |
| NI-1: PolicyEvaluationContext dual lifecycle | Needs investigation | Resolved (caches don't cross scopes) | **Dismissed** | — |
| NI-2: agents↔kernel type coupling | Needs investigation | Resolved (type-level only, 0 behavioral) | **Dismissed** | — |

**F2 dismissal rationale**: Investigation showed `isZoneFilterMismatchOnFreeOpTemplate` is a legitimate kernel deferred-evaluation pattern (exists in both `legal-moves.ts` and `prepare-playable-moves.ts`). Type layering (`ClassifiedMove` → `PlayableCandidateClassification` → `TrustedExecutableMove`) is intentional for different consumers. The remaining narrow issue (optional `trustedMove` field vs discriminated union) does not rise to a FOUNDATIONS violation — F17 (Strongly Typed Domain Identifiers) concerns domain identifiers, not internal pipeline types.

**NI-1 dismissal rationale**: `stateFeatureCacheByState` (state-level), `candidateFeatureCache` (move-level), and `aggregateCache` (completion-level) serve disjoint scopes. `setCurrentCandidates()` correctly invalidates only `aggregateCache`. No separation warranted.

**NI-2 dismissal rationale**: All 3 co-change commits (`f00eedec`, `18ce7663`, `233bf316`) involve type extensions (new union variants, data carrier fields, trace schema updates) with zero behavioral coupling in agents.
