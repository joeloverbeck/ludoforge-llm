# Spec 200 — Plan-Proposal Trace Completeness

**Status**: PROPOSED
**Priority**: Medium — Spec 199 added `compoundAvailability` to per-alternative plan traces with the canonical Foundation-#20 status shape (`ready | provisional | unavailable`). The remaining proposal-trace surface still records role binding, microturn execution, and role-constraint verdicts as success-or-silent — there is no contrastive trace evidence when a candidate fails a `locatedIn` / `distinctOriginDestination` / `reachable` / `adjacent` / `postState` constraint, when a role target is unbindable, or when a controller microturn falls back due to hidden / partial / depth-capped observer state. This is the second-iteration audit's only codebase-verified gap that survives critical reassessment; the audit's broader DIPT-C reframe is rejected (see §10).
**Complexity**: M — extends existing trace type unions with optional status fields; adds emission sites at five existing evaluator/controller seams. No new authority, no kernel primitives, no profile rewrite.
**Date**: 2026-05-27
**Dependencies**:
- `archive/specs/186-advisory-turn-plan-architecture-core.md` (COMPLETED — plan-template IR, role selectors, controller fallback ladder)
- `archive/specs/190-plan-primary-root-selection.md` (COMPLETED — plan-root authority; the trace this spec extends originates here)
- `archive/specs/191-plan-role-semantic-integrity.md` (COMPLETED — `targetKind` and role-constraint registry this spec annotates with status)
- `archive/specs/196-generic-role-constraints-and-authored-route-semantics.md` (COMPLETED — `locatedIn` / `distinctOriginDestination` / `reachable` / `adjacent` / `postState` constraint kinds whose verdicts this spec exposes)
- `archive/specs/199-compound-availability-at-root-proposal.md` (COMPLETED — established the canonical `CompoundAvailability` status shape this spec generalises across other plan-trace surfaces)

**Trigger report**: `reports/ludoforge-ai-overhaul-second-iteration.md` §5 ("Compound availability … should generalize into a **plan feasibility certificate** containing root availability, compound availability, required role availability, expected decision surfaces, preview/probe status, hidden/unavailable reasons, and fallback policy") and §10 ("Trace golden tests for doctrine, intent, target binding, feasibility, and deviation"). This spec adopts the *codebase-verified concrete trace-field gaps* and rejects the certificate-as-new-abstraction framing.

**Ticket namespace**: `200PLNPRPTRC` (proposed)

---

## 1. Goal

Surface five plan-proposal trace surfaces with explicit Foundation-#20-style provenance so a replay reader can answer "why did this candidate fail / fall back / become unavailable?" without re-running the kernel:

1. **Role-target availability** — when a `roleBindings` entry is unbindable (no candidates matched the selector under the current observer scope or constraint stack), the trace records `unavailable` with reason (`noSelectorMatch` / `allConstraintsFailed` / `hiddenScope`). Today the binding is silently absent from `PolicyPlanTrace.roleBindings`; trace consumers cannot distinguish "role not declared" from "role declared but no target found".

2. **Decision-surface expectation match (at proposal time)** — per-alternative annotation of whether the proposed first step's `decisionKind` matches the published frontier's decision kind at the time of proposal. Today this is observable only post-hoc through `PolicyPlanMicroturnTrace.match: 'fallback'` + `fallbackReason`; the *proposal-time* mismatch is not recorded as a structured field, so a `'noRootMatch'` outcome with otherwise-eligible candidates emits no contrastive evidence.

3. **Route/path reachability status** (Spec 196 `reachable` / `adjacent` constraints) — when a role-constraint evaluator rejects a candidate because `RouteGraphProvider.reachable(from, to, ...)` or `RouteGraphProvider.adjacent(a, b)` returned `false`, the rejection is recorded as `{kind: 'unavailable', reason: 'unreachable' | 'nonAdjacent', via?: routeClass}` on the candidate's rejection record. Today the constraint silently fails the candidate.

4. **Post-state expectation verdict** (Spec 196 `postState` constraints) — when `probeRoleBoundPostState` returns `null` (probe budget exhausted, observer scope insufficient) the candidate is silently excluded; when the materialised post-state evaluates the inner predicate to `false`, the same. This spec records the three outcomes distinctly: `{kind: 'unavailable', reason: 'postStateProbeExhausted'}` (budget) / `{kind: 'unavailable', reason: 'postStatePredicateFailed'}` (predicate) / `{kind: 'unavailable', reason: 'postStateObserverInsufficient'}` (hidden state past observer scope).

5. **Hidden / partial unavailable reasons on controller microturns** — when `PolicyPlanMicroturnTrace.match === 'fallback'` the existing `fallbackReason: string` field is a free-form string. This spec promotes it to a discriminated union with cases including `hiddenStatePrecludedMatch` / `partialObserverScope` / `depthCapped`, mirroring Foundation #20's preview-ref vocabulary.

All five extensions reuse the canonical status shape Spec 199 introduced at `kernel/microturn/compound-availability-probe.ts` — no new abstraction layer; no "feasibility certificate" wrapper that bundles them. Each lives on the trace surface where the verdict is produced.

## 2. Non-Goals

- **No new ranking authority.** Trace fields are evidence; ranking remains owned by `compareAlternatives` (Spec 199 §4.2) — `compoundAvailability` is the only availability key in the lex order, and that stays. The new statuses are observability, not selection inputs.
- **No "feasibility certificate" abstraction.** The audit proposed bundling these five plus `compoundAvailability` plus root frontier membership plus fallback readiness into one new typed object. This spec keeps the verdicts on the trace surface where they are produced — generalising the shape, not the container.
- **No deeper trace coverage than the existing emission points.** Each new field lands at an *existing* evaluator/controller seam; no new probing, no new kernel primitives.
- **No FITL profile changes.** Authored YAML is unchanged; the spec changes trace emission only.
- **No FOUNDATIONS amendment.** Foundation #20's preview-signal-integrity vocabulary already covers status-with-provenance; this spec applies the existing principle to additional surfaces. Per the audit-triage disposition (§10), the proposed Foundation #21 is rejected.
- **No structured target identity replacing pipe-strings.** `selectedId` remains an opaque stable serialization key. Per IMPLEMENTATION-ORDER-2026-05-27 disposition #2, structured composite identity remains deferred until a concrete trace-explainability requirement separate from this spec surfaces.
- **No replacement of the controller fallback ladder.** Foundation #18 mandates it; this spec annotates fallback reasons, it does not narrow when they fire.

## 3. Context (verified against codebase, 2026-05-27)

### 3.1 Current trace types

`packages/engine/src/kernel/types-plan-trace.ts` defines the trace surface:

- `PolicyPlanTrace` (lines 72–93) — top-level with `status: 'selected' | 'noTemplate' | 'noEligibleTemplate' | 'noRootMatch' | 'noRoleBinding'`, `roleBindings: readonly PolicyPlanTraceRoleBinding[]`, `alternatives: readonly PolicyPlanTraceAlternative[]`, `microturns?: readonly PolicyPlanMicroturnTrace[]`. The top-level `status` is the only place a `noRoleBinding` outcome is named; no per-role record exists.
- `PolicyPlanTraceRoleBinding` (lines 3–9) — `role`, `selectedId`, `quality`, `rank`, `components`. Only emitted when a binding succeeded; an unbound role produces *no entry*, so trace consumers cannot distinguish "role not declared on template" from "role declared but no target found".
- `PolicyPlanTraceAlternative` (lines 11–18) — `templateId`, `rootStableMoveKey`, `score`, `priorityTier`, `stableKey`, optional `compoundAvailability` (added by Spec 199). No `decisionSurfaceMatch` field; no per-alternative rejection record.
- `PolicyPlanMicroturnTrace` (lines 63–70) — `expectedStep`, `matchedRole`, `selectedLegalOption`, `match: 'exact' | 'reselected' | 'fallback'`, optional `deviation`, optional free-form `fallbackReason: string`. The free-form string is the gap the §1.5 promotion fixes.

### 3.2 Existing emission seams

- **Role binding** — `packages/engine/src/agents/plan-proposal.ts` produces `PolicyPlanTraceRoleBinding` records during candidate evaluation. The "no candidates for role" branch silently omits the role and propagates upward as the top-level `status: 'noRoleBinding'` (currently emitted at line 172). The §1.1 extension lands at the omission seam: emit an `unavailable`-kind record instead of omitting.
- **Decision-surface match** — `plan-proposal.ts` already computes which root candidates pass the published frontier in the candidate-iteration loop (`for (const templateId...` at line 125, inner `for (const root...` at line 135, candidates pushed through line 162). The §1.2 extension records the per-alternative match outcome at proposal time, not just post-hoc via the microturn trace.
- **Route constraints** — `packages/engine/src/agents/plan-role-constraint-eval.ts` evaluates `reachable` (`evaluateReachable` at lines 466–476) and `adjacent` (`evaluateAdjacent` at lines 478–488) by calling `routeGraph.reachable(...)` / `routeGraph.adjacent(...)`. Today the evaluator returns `false`; the rejection reason is discarded. The §1.3 extension threads a rejection-reason channel back to the candidate's trace entry.
- **Post-state constraints** — `plan-role-constraint-eval.ts:96–115` (`evaluatePostState`) calls `probeRoleBoundPostState` (declared at line 149; called at line 103). `probeRoleBoundPostState` returns `GameState | null` — the `null` value collapses three distinct failure modes (probe budget exhausted via `maxSteps`, observer scope insufficient, step/role mismatch). When `null` is returned the candidate is silently excluded; when the materialised post-state evaluates the inner predicate to `false` (`evaluatePostStateCondition` at line 117), the same. The §1.4 extension re-splits the `null` return into the three explicit reasons and threads them to the trace.
- **Microturn fallback** — `packages/engine/src/agents/plan-controller.ts` produces `PolicyPlanMicroturnTrace` records via the `microturnTraceFor` helper (signature at lines 180–192; fallback-reason callers at lines 66 and 73 pass free-form `reason` strings). The §1.5 promotion replaces the free-form string with a discriminated union; existing callers pass canonical reason strings, so the change is structural rather than additive at most call sites.

### 3.3 Canonical status shape (precedent: Spec 199)

The shape used at `packages/engine/src/kernel/microturn/compound-availability-probe.ts`:

```ts
type CompoundAvailability =
  | { kind: 'ready' }
  | { kind: 'provisional', reason: 'depth-capped' | 'partial-grant' }
  | { kind: 'unavailable', reason: 'no-continuation' | 'no-grant-predicate' };
```

This is the exact shape Foundation #20 prescribes for preview-ref status (the binary `PreviewOptionRefStatus` at `policy-preview-inner.ts:50` plus Spec 199's third arm for depth-capped outcomes). This spec applies the *same* shape to five additional verdict surfaces, with surface-specific `reason` vocabularies.

## 4. Architecture

### 4.1 Role-target availability records

Extend `PolicyPlanTrace` with a new field at the same level as `roleBindings`:

```ts
type PolicyPlanTraceRoleBindingStatus =
  | { kind: 'ready', binding: PolicyPlanTraceRoleBinding }
  | { kind: 'unavailable', reason: 'noSelectorMatch' | 'allConstraintsFailed' | 'hiddenScope' };

interface PolicyPlanTrace {
  // ... existing fields ...
  readonly roleBindingStatuses: readonly { readonly role: string; readonly status: PolicyPlanTraceRoleBindingStatus }[];
}
```

`PolicyPlanTrace.roleBindings` is **replaced** by `roleBindingStatuses` — the existing successful-only array is removed in the same change per Foundation #14 (which explicitly mandates that "every repository-owned... fixture, replay, and test is updated in the same change"). Two internal callers migrate in this spec's deliverables: `plan-trace.ts:18-29` (the construction site populating the array from `result.selected.roleBindings`) emits `roleBindingStatuses` instead; `observer-safety-invariants.test.ts:349` (the only test reading `trace.roleBindings`) migrates to assert against `roleBindingStatuses`. The 17+ `policy-profile-quality/*.test.ts` files reading `selected.roleBindings.<role>` access `PlanProposalAlternative.roleBindings` (a `Record<string, PlanRoleBinding>` on the alternative, not the trace) — they are unaffected by this change.

The `'hiddenScope'` reason fires when the role's selector targets a kind that is observer-hidden for the active seat (e.g., a card in another player's hand under partial-visibility games per Foundation #4) — distinct from `'noSelectorMatch'` (selector evaluated but matched nothing) and `'allConstraintsFailed'` (selector found candidates but every candidate was rejected by the role's constraint stack).

### 4.2 Decision-surface match per alternative

Extend `PolicyPlanTraceAlternative` with:

```ts
type DecisionSurfaceMatch =
  | { kind: 'matched' }
  | { kind: 'mismatched', expected: string, observed: string };

interface PolicyPlanTraceAlternative {
  // ... existing fields including compoundAvailability ...
  readonly decisionSurfaceMatch?: DecisionSurfaceMatch;
}
```

`expected` is the `decisionKind` the template's root step declares; `observed` is the `decisionKind` of the published-frontier decision the candidate was matched against. When they differ, the candidate is excluded with an explicit record; today the candidate is silently scored to zero or omitted depending on the proposer path.

The field is optional: alternatives without compound metadata and without explicit decision-surface declarations omit it.

### 4.3 Route reachability rejection reason

Extend the role-constraint rejection record (introduced in §4.4) with route-specific reasons:

```ts
type RouteConstraintRejection =
  | { kind: 'reachable', reason: 'unreachable', via?: string, maxHops?: number, from?: string, to?: string }
  | { kind: 'adjacent', reason: 'nonAdjacent', from?: string, to?: string };
```

These appear inside `RoleConstraintRejectionRecord` from §4.4. The `from`/`to`/`via` fields are populated when the bound roles supply them; observer-scope rules apply (hidden positions render as `undefined`, not a leaked zone id).

### 4.4 Post-state probe verdict + role-constraint rejection record

Replace the silent-rejection seam in `plan-role-constraint-eval.ts:96–115` (the `evaluatePostState` function, calling `probeRoleBoundPostState` at line 103) with an explicit rejection record that captures *which* constraint rejected the candidate:

```ts
type PostStateRejection =
  | { kind: 'postState', reason: 'postStateProbeExhausted' }
  | { kind: 'postState', reason: 'postStatePredicateFailed' }
  | { kind: 'postState', reason: 'postStateObserverInsufficient' };

type RoleConstraintRejection =
  | RouteConstraintRejection
  | PostStateRejection
  | { kind: 'locatedIn', reason: 'tokenNotInContainer' }
  | { kind: 'distinctOriginDestination', reason: 'originEqualsDestination' }
  | { kind: 'notEqual', reason: 'rolesEqual' };

interface RoleConstraintRejectionRecord {
  readonly role: string;
  readonly candidateId: string;
  readonly rejection: RoleConstraintRejection;
}
```

These records propagate up to per-alternative trace under a new optional field:

```ts
interface PolicyPlanTraceAlternative {
  // ... existing fields ...
  readonly rejectedByConstraint?: readonly RoleConstraintRejectionRecord[];
}
```

The full set of rejected candidates is bounded by the existing `maxCandidatesPerRole` cap (Foundation #10); the trace inherits the same cap and records `…+N more` when truncated.

`probeRoleBoundPostState` returning `null` is internally re-split: the function (or a sibling) returns one of three explicit failure reasons rather than a `null`/`GameState` union, so the caller can map directly to `PostStateRejection`. Per Foundation #15, the underlying probe distinguishes the three failure modes; the current `null` collapses them.

### 4.5 Discriminated microturn fallback reason

Promote `PolicyPlanMicroturnTrace.fallbackReason` from `string` to a discriminated union:

```ts
type PlanMicroturnFallbackReason =
  | { kind: 'noExactRoleValueMatch' }
  | { kind: 'reselectedWithinRole', from: string, to: string }
  | { kind: 'primitiveConsiderationPolicyFallback' }
  | { kind: 'stableFrontierTieBreakFallback' }
  | { kind: 'hiddenStatePrecludedMatch' }
  | { kind: 'partialObserverScope' }
  | { kind: 'depthCapped' };

interface PolicyPlanMicroturnTrace {
  // ... existing fields ...
  readonly fallbackReason?: PlanMicroturnFallbackReason;
}
```

The first four cases correspond to existing string vocabulary emitted by `plan-controller.ts`; the last three are new cases for observer-scope-driven fallbacks that today fold into the `'primitiveConsiderationPolicyFallback'` bucket. Per Foundation #14, no string-form compatibility layer is added — the trace type changes, and all internal emission sites migrate in the same change.

## 5. Determinism and replay (Foundations #8, #16)

- All new trace fields are deterministic functions of the proposer/controller inputs already covered by Spec 199's replay-identity tests.
- `pnpm turbo build` must remain byte-identical on rebuild.
- Existing plan-trace golden tests are extended to cover the new fields; replay-identity tests for the FITL conformance corpus must continue to pass byte-identically.
- The discriminated `fallbackReason` change is a type-shape change — golden traces require re-blessing per the testing.md update protocol's `golden-trace` rules. Each affected golden trace file gets one `Re-bless golden trace: <test-file> — Spec 200 promotes free-form fallbackReason to discriminated union` line in the commit body; multiple goldens may share one commit when the reason matches. Likely affected goldens (verify during P3 implementation): `packages/engine/test/determinism/plan-trace-replay.test.ts`, `packages/engine/test/determinism/plan-semantic-correspondence-golden.test.ts`, `packages/engine/test/determinism/plan-trace-doctrine-gating-golden.test.ts`. This is the only acceptable re-bless trigger this spec introduces; all other new fields are additive and do not invalidate prior golden traces.

## 6. Edge cases

- **Role with no constraints stack** — no rejection records; `roleBindingStatuses` shows the normal `ready`/`unavailable` outcome based on selector match alone.
- **Multiple constraints reject the same candidate** — record the *first* rejection encountered (matching the evaluator's existing short-circuit semantics; Foundation #10's bounded-iteration guarantee preserved).
- **Hidden state under partial-visibility observer** (Foundation #4) — `'hiddenScope'` (§4.1) and `'partialObserverScope'` (§4.5) are distinct surfaces: the former fires when the *selector* cannot see candidates; the latter when the *controller* cannot match a microturn. Both reasons are observer-safe (do not leak hidden ids).
- **Probe budget exhausted on post-state** — distinguished from predicate-false (§4.4); the kernel-side budget value is recorded in trace for replay reproducibility.
- **Cap-truncated rejection list** — `rejectedByConstraint` is capped at `maxCandidatesPerRole`; `…+N more` recorded.
- **All alternatives `mismatched`** — top-level `status: 'noRootMatch'` (existing); each alternative's `decisionSurfaceMatch` provides the contrastive evidence.

## 7. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P1** | Role-target availability + decision-surface match (§4.1 + §4.2) | `PolicyPlanTrace.roleBindingStatuses` populated for every role declared on the selected template (and for every role that contributed to a `'noRoleBinding'` outcome); `PolicyPlanTrace.roleBindings` removed and the 2 internal callers migrated in the same change (`plan-trace.ts:18-29` construction site; `observer-safety-invariants.test.ts:349` test assertion) per Foundation #14; `PolicyPlanTraceAlternative.decisionSurfaceMatch` populated for every alternative with a declared root-step `decisionKind`; existing replay-identity tests pass; one new architectural-invariant test asserts `roleBindingStatuses` covers all template-declared roles when `status === 'noRoleBinding'` | S |
| **P2** | Route + post-state rejection records (§4.3 + §4.4) | `RoleConstraintRejectionRecord` emitted at every short-circuit in `plan-role-constraint-eval.ts`; `probeRoleBoundPostState` re-split to return the three explicit reasons; per-alternative `rejectedByConstraint` populated; FITL ARVN Transport scenario produces a `'reachable'`/`'unreachable'` trace entry when origin-control preservation rejects a candidate; replay byte-identity preserved | M |
| **P3** | Discriminated microturn fallback reason (§4.5) | `PlanMicroturnFallbackReason` union replaces the `string` type; all internal emission sites in `plan-controller.ts` migrated; one architectural-invariant test asserts no microturn trace has a `fallbackReason` whose `kind` is outside the declared union; golden plan traces re-blessed in one commit with the canonical re-bless message; replay-identity tests for the FITL conformance corpus extended to cover the new union shape | S |
| **P4** | Conformance-corpus extension | Spec 198's cross-game conformance corpus (FITL + Texas Hold'em + the perfect-info board game) has at least one golden-trace test per game family asserting the new fields; observer-safety architectural invariant from Spec 198 extended to cover `'hiddenScope'` / `'partialObserverScope'` (no hidden id leak through the new vocabulary) | S |

## 8. Test plan

- **Architectural invariants** (`packages/engine/test/architecture/plan-trace-completeness-*.test.ts`):
  - `plan-trace-role-binding-status-coverage.test.ts`: every template-declared role has a `roleBindingStatuses` entry.
  - `plan-trace-rejected-by-constraint-bounded.test.ts`: `rejectedByConstraint` length ≤ `maxCandidatesPerRole`; truncation recorded.
  - `plan-trace-fallback-reason-union-closed.test.ts`: no microturn `fallbackReason.kind` outside the declared union.
- **Observer safety** (extending Spec 198): `'hiddenScope'` / `'partialObserverScope'` reasons do not leak hidden zone / token / card ids into the trace.
- **FITL convergence witnesses** (`packages/engine/test/policy-profile-quality/`):
  - ARVN Transport candidate rejected by `reachable` constraint produces a `{kind: 'reachable', reason: 'unreachable', from: 'Province_X', to: 'Province_Y'}` rejection record.
  - VC underground hidden-scope role produces `{kind: 'unavailable', reason: 'hiddenScope'}` under the opposing observer.
- **Replay identity**: existing golden trace tests pass byte-identically except for the single Spec 200 re-bless commit covering the `fallbackReason` union promotion.

## 9. Foundation alignment

- **#1 (Engine Agnosticism)** — new trace fields are generic vocabulary (`hiddenScope`, `unreachable`, `postStateProbeExhausted`); no FITL-specific labels.
- **#4 (Authoritative State and Observer Views)** — `hiddenScope` and `partialObserverScope` make observer-driven unavailability explicit without leaking hidden ids.
- **#10 (Bounded Computation)** — `rejectedByConstraint` inherits `maxCandidatesPerRole`; the new fields add no unbounded surface.
- **#14 (No Backwards Compatibility)** — Both shape changes migrate all internal callers in the same change: `fallbackReason` `string` → discriminated union (no string-form compatibility shim) AND `PolicyPlanTrace.roleBindings` removed in favor of `roleBindingStatuses` (no deferred trace-consumer migration). The 2 internal callers of the dropped `roleBindings` (`plan-trace.ts:18-29`, `observer-safety-invariants.test.ts:349`) migrate in the same commit.
- **#15 (Architectural Completeness)** — root-causes the trace-opacity gap on five surfaces rather than papering each one with a free-form string.
- **#16 (Testing as Proof)** — architectural invariants enforce union closure, status coverage, and bounded rejection lists; conformance corpus per Spec 198 extends to the new fields.
- **#20 (Preview Signal Integrity)** — generalises the established preview-ref + compound-availability status shape to additional plan-trace surfaces. This spec is the explicit, codebase-driven instance of Foundation #20 the audit incorrectly proposed as a "Foundation #21 amendment".

## 10. Reassessment of source proposal (`reports/ludoforge-ai-overhaul-second-iteration.md`)

The source report proposes "DIPT-C" (Doctrine–Intent–Plan–Target Contracts) as a deeper architectural reframe layered above the post-Spec-199 substrate. Verified against the codebase (three parallel Explore-agent investigations on 2026-05-27), the dispositions are:

**Adopted (this spec's slice):**
- §5 / §7.6 (proposal #7 generalised: feasibility-certificate trace fields) → §4.1 + §4.2 + §4.3 + §4.4 + §4.5 — the five codebase-verified trace gaps. The *trace-surface* claim is real; the certificate-as-new-abstraction framing is rejected (see Corrected).
- §10 ("Trace golden tests should verify role bindings and component rationale … guardrail/posture effects … preview ready/unavailable/fallback status … microturn exact/reselected/fallback … contrastive explanation") — operationalised as the §8 test plan additions.

**Corrected:**
- The audit's "feasibility certificate" container framing is rejected. The five trace surfaces share Spec 199's status shape but live on the trace surface where each verdict is produced (`PolicyPlanTrace.roleBindingStatuses`, `PolicyPlanTraceAlternative.decisionSurfaceMatch` / `rejectedByConstraint`, `PolicyPlanMicroturnTrace.fallbackReason`). Wrapping them in one new typed object is Foundation #14 churn without benefit.
- The audit's framing that `postState` is "dangerously close to synthetic rule execution" is corrected. Verified (Spec 196 implementation, 2026-05-27): the probe is bounded by per-constraint `maxSteps`, applies `applyMove` + `resolveDecisionContinuation` with deterministic-choice filling on a single bound role, and parallels Foundation #18's publication probe (Spec 144) — a *validating* probe, not an enumerative planner. The "second rules engine" risk is theoretical; this spec records the verdict (§4.4) rather than re-narrowing the probe.
- The audit's framing that strategy modules "still look like weighted preferences with constant values" is corrected. Spec 197 §3 verification (already on record) found ~69% of FITL modules carry conditional `when:` predicates; Spec 197's `enablesPlanTemplates`/`suppressesPlanTemplates` apply as a pre-scoring filter (`plan-proposal.ts:102–107` before `120–164`). The decoupling gap the audit names is closed in shape, not container — already.
- The audit does not acknowledge commit `3936e434a` (2026-05-27) which capped the Spec 199 compound-availability probe budget to `{ maxDecisionProbeSteps: 4, maxParamExpansions: 64, maxDeferredPredicates: 16 }` and memoized per-call. The audit's critique of "compound availability as another local patch" overlooks this stabilisation.

**Deferred (named follow-ups, not in this spec):**
- Structured composite target identity replacing pipe-strings (audit proposal #2) — already deferred by `archive/specs/IMPLEMENTATION-ORDER-2026-05-27.md` disposition #2. Verified (2026-05-27): no code parses pipe-strings; they are stable serialization keys. The new audit supplies no fresh concrete need; deferral stands.
- "Lexicographic plan-family selection refinement" (audit proposal #6) — already deferred by IMPLEMENTATION-ORDER-2026-05-27 disposition #6. `priorityTier` is the first lex key; finer-grained tiering remains uncommitted until post-eligibility-gating evidence of scalar-soup harm.
- Cookbook conceptual rewrite — routed to the `reassess-agent-dsl-cookbook` skill, already noted in IMPLEMENTATION-ORDER-2026-05-27.

**Rejected (with rationale):**
- The DIPT-C architectural reframe as a whole (rename `strategyModules` → `doctrines`; add `intents` as a typed layer above plan templates). This is the same reframe Spec 186 §11 + Spec 191 §11 + IMPLEMENTATION-ORDER-2026-05-27 rejected as Foundation #14 churn. The marginal "new" idea is the explicit Intent layer; verified (`SelectedPlanProposal.intent: string` at `plan-proposal.ts:190`, `PlanExecutionState.intent` at `plan-execution.ts:12–21`), intent already exists as an implicit field carrying the selected `templateId`. Making it a typed object would be observability refinement deferred until a witness need surfaces — not a load-bearing architectural change.
- The proposed Foundation #21 ("Advisory Intent Traceability and Human-Plausible Agent Quality"). Foundations #8 (Determinism), #9 (Replay/Auditability), #16 (Testing as Proof), #20 (Preview Signal Integrity) plus the Appendix's profile-quality-vs-determinism split already cover the "alien optimizer" concern. The Appendix is the explicit framework for profile-quality witnesses (`packages/engine/test/policy-profile-quality/`) versus engine-invariant proofs (`packages/engine/test/determinism/`). The audit names no concrete missing guarantee.
- Replacing pipe-string identities with structured target objects (audit §7.5) as part of this spec. Deferred per IMPLEMENTATION-ORDER-2026-05-27; this spec inherits that disposition.
- The audit's framing that closure requires a "deeper architecture iteration" — rejected. The closures are Foundation-#20-vocabulary extensions to existing trace surfaces (§4.1–§4.5), not architectural replacement. Foundation #14 forbids the churn the reframe would impose.

**Meta-decision:**
- No `specs/IMPLEMENTATION-ORDER.md` is created — the audit's load-bearing concrete gaps reduce, on critical reassessment, to a single spec. Cross-spec slicing is not needed.

The companion triage memo `reports/ludoforge-ai-overhaul-second-iteration-triage.md` records the full per-proposal disposition table for traceability.

## 11. Out of scope (named follow-on / sibling)

- **Structured composite target identity** — deferred per IMPLEMENTATION-ORDER-2026-05-27 disposition #2; revisit only on concrete trace-explainability witness.
- **Intent as explicit typed object** — deferred per §10 rejection; revisit only when a doctrine-attribution trace witness names a concrete failing case.
- **Cookbook rewrite** — routed to the `reassess-agent-dsl-cookbook` skill, already on the deferred list from IMPLEMENTATION-ORDER-2026-05-27.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-27:

- [`tickets/200PLNPRPTRC-001.md`](../tickets/200PLNPRPTRC-001.md) — Phase 1 — Add `roleBindingStatuses` and `decisionSurfaceMatch` trace fields; remove `roleBindings` (covers §4.1 + §4.2 + §7 P1)
- [`tickets/200PLNPRPTRC-002.md`](../tickets/200PLNPRPTRC-002.md) — Phase 2 — Add `rejectedByConstraint` trace field; re-split `probeRoleBoundPostState` into three explicit failure reasons (covers §4.3 + §4.4 + §7 P2)
- [`tickets/200PLNPRPTRC-003.md`](../tickets/200PLNPRPTRC-003.md) — Phase 3 — Promote `PolicyPlanMicroturnTrace.fallbackReason` to discriminated union; re-bless three golden traces (covers §4.5 + §7 P3)
- [`tickets/200PLNPRPTRC-004.md`](../tickets/200PLNPRPTRC-004.md) — Phase 4 — Extend cross-game conformance corpus with new trace field coverage and observer-safety vocabulary (covers §7 P4 + §8)
