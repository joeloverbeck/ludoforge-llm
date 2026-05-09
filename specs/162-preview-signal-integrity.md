# Spec 162 — Preview Signal Integrity

**Status**: Draft
**Date**: 2026-05-09
**Predecessors**: Spec 160 (per-option preview at inner microturns), Spec 161 (chooseNStep inner preview integration), Spec 156 (preview observability and utility metrics)
**Follow-up specs**: Spec 163 (generic microturn state-feature lookups), Spec 164 (continued inner preview deepening)
**Trigger reports**: `reports/preview-inner-choosenstep-deep-nesting-2026-05-08.md` (codebase-grounded gap report), `reports/preview-signal-integrity.md` (external deep-research proposal — reassessed against the codebase by this spec)

---

## 1. Goal

Make policy-preview output an honest signal. After this spec lands, an `unavailable` preview ref MUST NOT silently coerce into a numeric score contribution; the trace MUST record that no signal was available and that selection fell through to a non-preview path; and the consideration author MUST have explicit YAML control over what happens when a preview ref is unavailable.

The integrity fix lives entirely under the existing `INNER_PREVIEW_HARD_CAP = 256`. Raising the cap, adding new cost classes, or adding new ref families are explicitly out of scope and deferred to follow-up specs (see §11).

## 2. Context (verified against codebase)

After Spec 161 wired `preview.inner.chooseNStep: true` into the runtime, the per-root-option drive runs at every chooseNStep frontier. For deeply nested chooseN ladders the drive exits at `depthCap` before reaching a state where the requested `preview.option.delta.victory.currentMargin.self` ref can resolve. The cookbook recipe `preferOptionProjectedMargin` then misbehaves:

| Path | File:Line | Behavior |
|---|---|---|
| Drive exits at depthCap | `packages/engine/src/agents/policy-preview-inner.ts:358-359` | `finish(state, depth, 'depthCap')` |
| `resolveRefs` for delta-margin under depthCap state | `policy-preview-inner.ts:449-459` | Surface refs evaluated against post-state; if unavailable, ref is **omitted** from the resolved map (no entry, no failure) |
| Consideration value resolution | `policy-evaluation-core.ts:1193-1199` | `resolvedRefs.get(key)` returns `undefined` when ref absent |
| Silent coercion | `policy-evaluation-core.ts:504-507` | `if (typeof value !== 'number') { contribution = consideration.unknownAs ?? 0; }` — i.e. unknown preview value becomes the same fallback as any other unknown ref |
| Trace surface | `policy-agent.ts:86, 299` | `unknownPreviewRefs: []` is **hardcoded empty** for chooseN frontier candidates, even though the broader engine (1459-1528 in policy-evaluation-core.ts) already tracks `unknownPreviewRefs: Map<string, PolicyPreviewUnavailabilityReason>` for outer policy evaluation |
| Apparent score | `policy-agent.ts:104-107` | `chooseNStepProgressBias` returns `1` for every `add` candidate. With every consideration contribution at 0, every candidate ties at score 1 and `stableMoveKey` (alphabetical) breaks the tie |

The infrastructure to track unavailability per-ref already exists (`PolicyEvaluationCandidate.unknownPreviewRefs`, `PolicyPreviewUnavailabilityReason`); the chooseNStep frontier path simply does not propagate it into the candidate trace. The minimum-correct fix is to wire what already exists, then add explicit YAML semantics so authors can declare what an unavailable preview ref means for their scoring.

In ARVN seed 1000 (FITL, post-Spec-161) this affects 4 of 12 chooseNStep decisions (≈33%); reshuffling `(maxOptions, depthCap)` within the cap does not unblock them.

## 3. Non-goals

- **Raising or restructuring the cap.** No `deep1024` class. No two-pass continued deepening. Spec 164 covers that work; this spec must remain honest under the existing 256 cap.
- **New ref families.** No option-value-keyed state lookups (`lookup.surface: policyState`). Spec 163 covers that.
- **Partial-state delta refs.** Margin-style delta refs MUST NOT resolve from depth-cap partial state. Quiescence-search horizon-effect argument applies; partial values would be wrong-direction in the general case.
- **Cookbook rewrite beyond the integrity claim.** The cookbook update is scoped to retracting "differentiates the same way as chooseOne" and documenting the new explicit-fallback YAML.

## 4. Foundation #20 — Preview Signal Integrity

Add to `docs/FOUNDATIONS.md` immediately after Foundation #19 and before the Appendix.

> ## 20. Preview Signal Integrity
>
> **Policy-preview output is advisory evidence with explicit provenance, not an implicit scalar.**
>
> Every preview-derived ref MUST expose its observer scope, resolution status, budget outcome, and fallback path. Ready, unknown, hidden, stochastic, unresolved, failed, depth-capped, and partial results are distinct semantic outcomes. Unavailable preview refs (any non-`ready` status) MUST NOT be silently coerced into numeric contributions; any consideration that converts an unavailable preview ref into a contribution MUST declare that fallback explicitly in profile YAML, and the chosen fallback MUST be visible in deterministic trace output. When all root-option drives at a microturn yield no usable signal for the requested refs, the runtime MUST mark the resulting selection as `tiebreakAfterPreviewNoSignal` and emit a `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory.
>
> Preview signal integrity is enforced at the engine layer; profile-quality witness claims about preview behavior live alongside other policy-quality regression signals (see Appendix). This Foundation operates jointly with Foundations #9 (replay), #10 (bounded computation), #15 (architectural completeness), and #16 (testing as proof): bounded preview remains bounded; the integrity guarantee is that bounded preview cannot pretend to be unbounded preview.

### Appendix update

Append to the existing Appendix paragraph that lists Spec amendments to Foundations:

> Spec 162 added Foundation #20 (Preview Signal Integrity) to formalize the contract that bounded preview output cannot masquerade as ready evidence.

## 5. Architecture

Three pillars, each independently testable.

### 5.1 Availability-aware tracking through the chooseN frontier path

`buildMicroturnChooseCallback` and `selectBestMicroturnChooseOneValue` (`microturn-option-evaluator.ts`) currently consume `previewOptionResolvedRefsByOptionKey: ReadonlyMap<string, ReadonlyMap<string, PolicyValue>>`. The caller (`chooseFrontierDecision` in `policy-agent.ts`) populates this from `runChooseNStepInnerPreview` / `runChooseOneInnerPreview` outputs.

We extend the resolution-handoff shape to carry per-ref availability:

```ts
type PreviewOptionRefStatus =
  | { kind: 'ready'; value: PolicyValue }
  | { kind: 'unavailable'; reason: PolicyPreviewUnavailabilityReason };

readonly previewOptionResolvedRefsByOptionKey:
  ReadonlyMap<string, ReadonlyMap<string, PreviewOptionRefStatus>>;
```

Important constraints:
- **No new union surface in the policy-evaluation-core consumer.** `resolvePreviewOptionRef` continues to return `PolicyValue` (the existing pre-coercion path). The new piece is that when the status is `unavailable`, the resolver registers the ref into `candidate.unknownPreviewRefs` (using the existing tracking infrastructure) **before** returning `undefined`. This mirrors `resolveSurfaceRef` for `previewSurface` (line 1469).
- **Status entries cover requested refs exhaustively.** For every ref the consideration set asked for, the inner-preview driver records either `ready` or `unavailable` (with reason: `depthCap`, `hidden`, `stochastic`, `unresolved`, `noPreviewDecision`, `failed`). No "ref absent from map" case remains.
- **Reason mapping** when the drive ends at `depthCap`: surface refs that fail to resolve get reason `depthCap`. Surface refs that resolve but have no pre-state baseline (the deltaVictoryCurrentMarginSelf branch) get reason `unresolved`. Hidden visibility produces `hidden`. The `outcome`-typed and `driveDepth`-typed refs always resolve (those are drive-intrinsic), so they remain `ready`.

### 5.2 Explicit consideration-level fallback semantics

Today's compiled consideration carries `unknownAs?: number` (see line 505). It is a generic per-consideration default for any unknown value-expression result. This spec adds a preview-specific axis:

```yaml
preferOptionProjectedMargin:
  scopes: [microturn]
  costClass: preview
  weight: 300
  value:
    ref: preview.option.delta.victory.currentMargin.self
  previewFallback:                     # NEW
    onUnavailable: noContribution      # default — contribution is OMITTED, not 0
    # alternatives:
    # onUnavailable: { constant: 0 }
    # onUnavailable: { constant: -100 }
```

**Default change**: when a consideration's `value` expression resolves through `previewOptionRef` and the ref is `unavailable`, the default is `noContribution` — the consideration contributes nothing AND the candidate is flagged as having an unresolved preview consideration. This differs from the legacy `unknownAs ?? 0` path, which silently produced 0.

**Explicit zero**: an author who *wants* zero (i.e., "treat unavailable preview as 'this option projects a tied margin'") writes `onUnavailable: { constant: 0 }`. The trace records that the explicit fallback fired.

**Compatibility**: existing `unknownAs` continues to work for non-preview unknown refs. When a consideration uses a `previewOptionRef` value AND has `unknownAs` set but no `previewFallback`, the compiler emits the new diagnostic `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK` and rejects compilation — the author must opt into one of the two semantics explicitly. Existing fixtures that hit this MUST be updated as part of this spec (Foundation #14: no backwards-compat shims).

### 5.3 Outcome-honest selectionReason and advisory

Two new selectionReason variants and one advisory.

```ts
type CandidateSelectionReason =
  | 'gated'
  | 'scored'
  | 'tiebreak'
  | 'tiebreakAfterPreviewNoSignal'  // NEW
  | 'fallbackExplicit'              // NEW — explicit previewFallback fired
;
```

Classification rules (applied per candidate at trace-build time):
- `tiebreakAfterPreviewNoSignal` — the selected candidate's preview consideration set requested at least one ref, and every requested ref across every legal candidate at this microturn was `unavailable`. Tie-broken by `stableMoveKey`.
- `fallbackExplicit` — the selected candidate's score includes a contribution that came from an explicit `previewFallback.onUnavailable.constant` path (not the default `noContribution` path).
- `tiebreak` (existing) keeps its current meaning: candidates tied on a non-preview-driven score.

Advisory event, emitted to the deterministic policy-quality stream (NOT to the determinism stream — see Appendix discussion of dual streams):

```ts
type PolicyPreviewSignalUnavailableAdvisory = {
  readonly code: 'POLICY_PREVIEW_SIGNAL_UNAVAILABLE';
  readonly profileId: string;
  readonly seatId: string;
  readonly decisionKind: 'chooseOne' | 'chooseNStep';
  readonly decisionKey: string;
  readonly requestedRefs: readonly string[];
  readonly evaluatedRootOptionCount: number;
  readonly unavailableRootOptionCount: number;
  readonly unavailabilityBreakdown: Readonly<Record<PolicyPreviewUnavailabilityReason, number>>;
  readonly selectedStableMoveKey: string;
  readonly selectionReason: 'tiebreakAfterPreviewNoSignal';
};
```

Trigger condition: a microturn-scope consideration references one or more `preview.option.*` refs AND every requested ref is `unavailable` for every candidate. The advisory fires once per affected microturn, at decision-record time, deterministically ordered with the rest of the policy trace.

### 5.4 Trace schema additions

Extend `previewUsage` (existing type at `policy-preview-inner.ts:81` and the chooseNStep variant in `policy-preview-inner-choosenstep.ts:75,96`) with a `coverage` block:

```ts
type PolicyPreviewCoverage = {
  readonly requestedRefCount: number;
  readonly evaluatedRootOptionCount: number;
  readonly readyRootOptionCount: number;
  readonly unavailableRootOptionCount: number;
  readonly allRootsUnavailable: boolean;
  readonly selectedByTieBreakerBecausePreviewUnavailable: boolean;
};
```

`outcomeBreakdown` (existing) keeps its current shape — it already enumerates `unknownDepthCap`, `unknownHidden`, etc. (see `policy-preview-inner.ts:147,173-174`). The new fields are additive coverage roll-ups derived from the per-ref status map.

Per-candidate trace (`PolicyAgentDecisionTrace.candidates[i]`) gets:
- `unknownPreviewRefs` — populated for chooseN frontier candidates from the new per-ref status map (was hardcoded `[]` at `policy-agent.ts:86,299`).
- `selectionReason` — extended union per §5.3.
- `previewFallbackFired?: { termId: string; kind: 'noContribution' | 'constant'; value?: number }` — present when an explicit `previewFallback` resolved.

## 6. Compiler changes

`packages/engine/src/cnl/compile-agents.ts`:

1. Compile `previewFallback.onUnavailable` into the consideration record. New compiled field `previewFallback?: { onUnavailable: 'noContribution' | { kind: 'constant'; value: number } }`.
2. Detect considerations whose `value` AST contains a `previewOptionRef` and whose `previewFallback` is unset. Emit `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK` (error, not warning). Diagnostic must name the consideration id, the ref id, and the suggested YAML to add.
3. The hard-cap formula at `compile-agents.ts:1018-1019` is **unchanged**. `INNER_PREVIEW_HARD_CAP` remains `256`.

## 7. Runtime changes

Files touched (anchors verified):
- `packages/engine/src/agents/policy-preview-inner.ts` — `resolveRefs` returns `ReadonlyMap<string, PreviewOptionRefStatus>` instead of `ReadonlyMap<string, PolicyValue>`. Caller-side mapping adapts.
- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` — same shape change in lines 262, 477.
- `packages/engine/src/agents/microturn-option-evaluator.ts` — `previewOptionResolvedRefsByOptionKey` map element type updated; `scoreMicroturnOptionWithContributions` receives the new shape and surfaces unavailable refs into `candidate.unknownPreviewRefs` via the same path used by outer `resolveSurfaceRef`.
- `packages/engine/src/agents/policy-evaluation-core.ts` — `resolvePreviewOptionRef` (line 1193) extended to register unavailability into `candidate.unknownPreviewRefs` before returning `undefined`. New branch in `evaluateConsideration` (line 484) that consumes `previewFallback` for compiled-with-preview-ref considerations; the legacy `unknownAs ?? 0` path becomes unreachable for preview-ref considerations (compiler enforces `previewFallback`).
- `packages/engine/src/agents/policy-agent.ts` — `traceCandidatesForFrontier` (line 74) populates `unknownPreviewRefs` from the candidate's tracking map; `selectionReason` derivation extended for the two new variants; advisory emitted into the trace's policy-quality stream.

No changes to the kernel, compiler-kernel boundary, or visibility/observer machinery (Foundations #4, #12 unaffected).

## 8. Phases and acceptance criteria

| Phase | Deliverable | Acceptance criterion | Effort |
|---|---|---|---|
| 0 | Foundation #20 amendment to `docs/FOUNDATIONS.md` and Appendix update | `docs/FOUNDATIONS.md` contains the §20 text; `docs/architecture.md` (if it summarizes Foundations) updated | XS |
| 1 | Trace observability surface: chooseN frontier candidates populate `unknownPreviewRefs`; new `coverage` block on `previewUsage`; new `selectionReason` variants; `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory wired through deterministic trace | Architectural-invariant test: for any chooseN frontier where `outcomeBreakdown.unknownDepthCap == evaluatedRootOptionCount` and at least one consideration requests a `preview.option.*` ref, the selected candidate's `selectionReason == 'tiebreakAfterPreviewNoSignal'` and exactly one advisory fires; chooseNStep candidates' `unknownPreviewRefs` is non-empty whenever the ref status map contains `unavailable` entries | M |
| 2 | Per-ref status type + `previewFallback` YAML + compiler diagnostic + runtime fallback-aware contribution path | (a) Existing `preferOptionProjectedMargin`-style fixtures fail compilation without `previewFallback` and pass with `onUnavailable: noContribution`; (b) Architectural-invariant test: a non-`ready` `previewOptionRef` MUST NOT produce a non-zero contribution unless the consideration declares `previewFallback.onUnavailable: { constant: <n> }` — verified by injecting an unavailable status and asserting `score == chooseNStepProgressBias`; (c) `fallbackExplicit` selectionReason fires only when the explicit constant path is taken | L |
| 3 | Regression fixtures and cookbook update | (a) Convergence-witness `@witness: spec-162-arvn-seed-1000` reproduces the four chooseNStep `unknownDepthCap` decisions and asserts they emit `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` and select via `tiebreakAfterPreviewNoSignal` (NOT silent lexical fallback); (b) `docs/agent-dsl-cookbook.md` "Per-option Preview at chooseNStep" section retracts the universal-capability framing and documents `previewFallback` | S |

## 9. Test plan

Test classification per `.claude/rules/testing.md`. Architectural-invariant tests live under `packages/engine/test/architecture/preview-integrity/`, which is part of the live default blocking engine lane. Convergence-witness tests live under `packages/engine/test/policy-profile-quality/` when they assert profile-quality trajectories rather than engine determinism.

### 9.1 architectural-invariant tests

1. **`preview-unavailable-not-silently-zero.test.ts`** — Construct a synthetic compiled profile whose preview drive will exit at `depthCap` with no resolved surface refs. Assert: every candidate's contribution from the preview consideration is omitted (no entry in `scoreContributions` for that termId), candidate score equals `chooseNStepProgressBias`, and selectionReason is `tiebreakAfterPreviewNoSignal`. This is the core integrity invariant for Foundation #20.

2. **`preview-fallback-explicit-zero-traced.test.ts`** — Same harness with `previewFallback.onUnavailable: { constant: 0 }`. Assert: contribution exists in `scoreContributions` with value 0, candidate's `selectionReason` is `fallbackExplicit` if it is the selected candidate, and `previewFallbackFired` field on the trace records the explicit fallback.

3. **`preview-coverage-rollup.test.ts`** — `previewUsage.coverage` block round-trips: when N root options drove and K of them produced ready refs, `readyRootOptionCount = K`, `unavailableRootOptionCount = N - K`, `allRootsUnavailable = (K == 0)`, `selectedByTieBreakerBecausePreviewUnavailable = (K == 0 && consideration requested at least one preview ref)`.

4. **`preview-advisory-deterministic-order.test.ts`** — Replay-twice harness. Assert: same advisory order, same advisory contents, byte-identical trace serialization. Foundation #8 (Determinism) and #16 (Testing as Proof).

### 9.2 convergence-witness tests

5. **`arvn-seed-1000-deep-chooseN-witness.test.ts`** — `// @test-class: convergence-witness` `// @witness: spec-162-arvn-seed-1000`. Replays ARVN seed 1000 with the post-Spec-161 baseline profile from `reports/preview-inner-choosenstep-deep-nesting-2026-05-08.md`. Asserts: 4 chooseNStep decisions emit `POLICY_PREVIEW_SIGNAL_UNAVAILABLE`; their selectionReason is `tiebreakAfterPreviewNoSignal`; their `unknownPreviewRefs` lists `preview.option.delta.victory.currentMargin.self` with reason `depthCap`. **Distillation evaluation**: this witness guards the trace-shape regression. The architectural property (test 1) covers the underlying invariant; the witness is retained to prove the FITL workload triggers it. If a future kernel evolution makes seed 1000 stop hitting the depth-cap (different drive frontier), retarget the witness; do not soften.

### 9.3 compiler tests

6. **`previewfallback-required-diagnostic.test.ts`** — Authoring a consideration whose `value` ref is `previewOptionRef` without `previewFallback` produces `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK`. Authoring with `previewFallback.onUnavailable: noContribution` compiles. Authoring with both `previewFallback` and legacy `unknownAs` compiles but `unknownAs` is documented as inactive for that consideration's preview-ref path.

7. **`hard-cap-unchanged.test.ts`** — Architectural-invariant: `INNER_PREVIEW_HARD_CAP === 256` and the cost formula at `compile-agents.ts:1018-1019` is unchanged. Guards against scope creep into Spec 164's territory.

### 9.4 fixture migrations

The conformance corpus (FITL, Texas Hold'em, plus any test-only profiles using `previewOptionRef`) must be updated to declare `previewFallback`. Migration is mechanical: the cookbook recipe was `noContribution` semantics, so the migration writes `onUnavailable: noContribution` everywhere. Foundation #14 (no backwards-compat shims) — migrate, don't auto-default.

## 10. Foundation alignment

| Foundation | Alignment |
|---|---|
| #4 (Authoritative state and observer views) | Unaffected — observer-routed surface resolution unchanged |
| #5 (One Rules Protocol, Many Clients) | Unaffected — kernel-published microturns unchanged |
| #8 (Determinism Is Sacred) | Reinforced — advisory ordering and content are deterministic; replay test (9.1.4) proves it |
| #9 (Replay, Telemetry, and Auditability) | Reinforced — trace surface gains honest unavailability records |
| #10 (Bounded Computation) | Unchanged — cap stays at 256; integrity orthogonal to budget |
| #12 (Compiler-Kernel Validation Boundary) | Reinforced — new compiler diagnostic catches a class of authoring bug at compile time |
| #14 (No Backwards Compatibility) | Honored — fixture migration in the same spec; no compatibility shim |
| #15 (Architectural Completeness) | Direct goal — closes the silent-no-op of "preview ref resolves to nothing, contribution is silently zero" |
| #16 (Testing as Proof) | Direct goal — tests in §9 prove the property |
| #18 (Constructibility Is Part of Legality) | Unaffected — selection mechanics changes are post-publication |
| #19 (Decision-Granularity Uniformity) | Reinforced — chooseN per-option preview achieves Foundation-19 parity with chooseOne by being honest about gaps, not by claiming false coverage |
| **#20 (Preview Signal Integrity)** | **Introduced by this spec** |

## 11. Out of scope (follow-up specs)

The integrity fix is deliberately bounded. The following are acknowledged as legitimate work but live in their own specs because each one is its own Foundation-touching design:

- **Spec 163 — Generic microturn state-feature lookups**: introduces `lookup.surface: policyState` with `keyType`-validated option-value lookups, observer-routed via the existing visibility infrastructure. Provides a non-preview signal source at deep frontiers, giving evolved profiles a way to score chooseN target options by visible state properties without forward simulation. Engine-agnostic (Foundation #1) — no game-specific lookup tables.
- **Spec 164 — Continued inner preview deepening**: introduces `preview.inner.strategy: continuedDeepening` with a tighter incremental cost formula `broadCost + R × B × I × max(0, Dd − Db)` and named cap classes (`standard256`, `deep1024`, etc.). Requires benchmarking against FITL and Texas Hold'em before any default change. Foundation #10 is renegotiated under this spec, not 162.
- **Cap-value justification benchmarks**: empirical study of FITL chooseN nesting depths. Inputs to Spec 164's cap-class default selection.
- **`preview.partial.*` ref family**: explicit partial-state refs for authors who want depth-cap-state values. Mentioned by ChatGPT's Section 6; deferred because the integrity guarantee in this spec is sufficient (refs are honest about being unavailable; partial-as-default is rejected). Could land as a small follow-up if authoring demand emerges.

## 12. Rollout sequencing

Phase 0 → Phase 1 → Phase 2 → Phase 3 in order. Phase 1 is independently mergeable (observability without YAML change). Phase 2's compiler diagnostic is gated on Phase 1's selectionReason classification (the diagnostic must reference the integrity contract). Phase 3 closes the regression fixture and cookbook update.

Resume `fitl-arvn-agent-evolution` campaign only after Phase 3 lands and the seed-1000 witness passes. Per the report: silent lexical fallback after preview collapse must be impossible.

## 13. Code anchors for implementers

- `packages/engine/src/cnl/compile-agents.ts:81` — `INNER_PREVIEW_HARD_CAP = 256` (UNCHANGED)
- `packages/engine/src/cnl/compile-agents.ts:1018-1019` — cost formula (UNCHANGED)
- `packages/engine/src/agents/policy-preview-inner.ts:419-462` — `resolveRefs` (shape change)
- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts:262, 477` — chooseNStep per-root-option refs (shape change)
- `packages/engine/src/agents/microturn-option-evaluator.ts:28, 95, 154` — `previewOptionResolvedRefsByOptionKey` consumers
- `packages/engine/src/agents/policy-evaluation-core.ts:484-521` — `evaluateConsideration` (`previewFallback` branch added)
- `packages/engine/src/agents/policy-evaluation-core.ts:1193-1199` — `resolvePreviewOptionRef` (registers unavailability)
- `packages/engine/src/agents/policy-evaluation-core.ts:1459-1528` — existing `unknownPreviewRefs` tracking (reused, not duplicated)
- `packages/engine/src/agents/policy-agent.ts:74-91, 280-310` — `traceCandidatesForFrontier` and chooseNStep frontier dispatch (`unknownPreviewRefs` populated, `selectionReason` extended, advisory emitted)
- `docs/FOUNDATIONS.md` — Foundation #20 added, Appendix updated
- `docs/agent-dsl-cookbook.md:251-375` — "Inner Preview" section retracts universal-capability framing, adds `previewFallback`

## 14. Open questions

1. **Naming**: `previewFallback.onUnavailable` vs `onPreviewUnavailable` at the consideration top level. The former groups future preview-related fallback knobs; the latter is flatter. Decision deferred to Phase 2 implementation; either is acceptable as long as the compiled shape is stable.
2. **Migration of `unknownAs`** when both fields are present: this spec specifies `unknownAs` remains active for non-preview unknown values within the same consideration (e.g., a consideration with a coalesce expression where one branch is preview and another is a non-preview state-feature). Confirm during Phase 2 that no consideration in the conformance corpus relies on `unknownAs` to coerce a preview-ref-undefined into a non-zero contribution; if any do, those are the silent-coercion bugs this spec is closing and they MUST be migrated explicitly.
3. **Advisory placement**: emit into the existing trace `agentDecision.advisories[]` array (creating it if absent) vs a sibling `policyQualityAdvisories[]` array on the run-level trace. Phase 1 implementer decides; the constraint is determinism and auditability.

## 15. Reassessment of ChatGPT's deep-research proposal

For traceability, the deep-research document `reports/preview-signal-integrity.md` was reassessed against the codebase:

- **Diagnosis**: Correct. Cited file:line anchors verified.
- **Foundation #20 concept**: Adopted (this spec §4). Wording adjusted to integrate with existing Foundation #4/#9/#10/#15/#16/#19 vocabulary.
- **`PreviewResolution<T>` discriminated union**: Scope reduced. The infrastructure for tracking unavailability already exists (`PolicyEvaluationCandidate.unknownPreviewRefs`, lines 1459-1528). The frontier-trace path simply doesn't propagate it. This spec wires what exists rather than refactoring all consumers to a 3-variant union.
- **Score-1 attribution**: Corrected. The "1" is `chooseNStepProgressBias` (`policy-agent.ts:104-107`), not a value-default coercion. Spec text reflects this correctly.
- **Continued deepening / `deep1024` cap class**: Deferred to Spec 164. Combining cap renegotiation with the integrity fix would conflate Foundation #10 work with Foundation #15/#20 work. The integrity fix must remain honest under the existing cap.
- **Generic option-keyed state lookups**: Deferred to Spec 163. Architecturally clean primitive that deserves its own design pass — Foundations #1, #4, #6, #17 all touch it.
- **No partial margin refs as default**: Adopted as a non-goal of this spec (§3, §11).
- **Cookbook update**: Scoped to retraction + `previewFallback` documentation; broader rewrite deferred.
- **Compiler diagnostic name**: Adopted (`CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK`).
- **Trace schema additions**: Adopted with codebase-aligned field names; coverage block additive on the existing `previewUsage` shape rather than replacing `outcomeBreakdown`.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-09:

- [`archive/tickets/162PRESIGINT-001.md`](../archive/tickets/162PRESIGINT-001.md) — Foundation #20 — Preview Signal Integrity (FOUNDATIONS amendment) (covers §4, Phase 0)
- [`archive/tickets/162PRESIGINT-002.md`](../archive/tickets/162PRESIGINT-002.md) — Per-ref `PreviewOptionRefStatus` shape + plumbing through inner-preview drivers (covers §5.1, Phase 1 plumbing)
- [`archive/tickets/162PRESIGINT-003.md`](../archive/tickets/162PRESIGINT-003.md) — chooseN frontier trace: `unknownPreviewRefs`, `selectionReason` union, `coverage` block, `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory (covers §5.3, §5.4, Phase 1 trace surface; T3, T4 under `packages/engine/test/architecture/preview-integrity/`)
- [`archive/tickets/162PRESIGINT-004.md`](../archive/tickets/162PRESIGINT-004.md) — Compiler `previewFallback` + `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK` diagnostic + fixture migration (atomic cut) (covers §6, §9.4, Phase 2 compiler; T6, T7 under `packages/engine/test/architecture/preview-integrity/`)
- [`archive/tickets/162PRESIGINT-005.md`](../archive/tickets/162PRESIGINT-005.md) — Runtime `evaluateConsideration` consumes `previewFallback`; `fallbackExplicit` selectionReason (covers §5.2, §7, Phase 2 runtime; T1, T2 under `packages/engine/test/architecture/preview-integrity/`)
- [`tickets/162PRESIGINT-006.md`](../tickets/162PRESIGINT-006.md) — ARVN seed 1000 convergence-witness + cookbook update (covers §9.2, Phase 3; T5 under `packages/engine/test/policy-profile-quality/`)
