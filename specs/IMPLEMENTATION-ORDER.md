# Implementation Order — FITL Base-Game AI Agent Competence Encoding

**Status**: PROPOSED
**Date**: 2026-05-27
**Source report**: `reports/fitl-ai-encoding-first-iteration.md` (ChatGPT-Pro first iteration of FITL AI encoding)
**Prior context**: `archive/specs/IMPLEMENTATION-ORDER-2026-05-27.md` (closed the four-faction AI architecture overhaul: Specs 196–199 landed 2026-05-27). The current series follows that one and operationalizes the *encoding* phase the architecture work was the prerequisite for.

This series operationalizes the load-bearing concrete gaps identified in the first-iteration FITL AI encoding audit, after critical reassessment against `docs/FOUNDATIONS.md`, `reports/fitl-competent-agent-ai.md`, and direct codebase verification (current 92-agents.md inventory, DSL surface, witness coverage, and Spec 196/197/199 deliverables).

The audit's macro thesis — "architecture is good enough; the remaining work is authored agent-library completion, not generic engine overhaul" — is **adopted**. The specific recommendations are sliced into five mutually-independent specs that mirror the proven 196–199 pattern: each owns a disjoint slice of the FITL YAML library; tickets decompose in parallel; soft dependency from Spec 201 (shared scaffolding) to Specs 202–204 is acknowledged but does not block parallel authoring.

## Prerequisites (already landed)

- **Spec 186** — Advisory Turn Plan Architecture Core (COMPLETED) — plan-template IR, role selectors, execution controller, fallback ladder.
- **Spec 187** — Whole-Turn Posture and Ally-Rival Metadata (COMPLETED) — posture evaluators, relationship metadata (the four ally/rival pairs FITL needs are already declared).
- **Spec 190** — Plan-Primary Root Selection (COMPLETED) — plan root authority.
- **Spec 191** — Plan/Role Semantic Integrity (COMPLETED) — `SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS` registry.
- **Spec 196** — Generic Role Constraints + Authored Route/Map Semantics (COMPLETED 2026-05-26) — `reachable`, `adjacent`, `distinctOriginDestination`, `locatedIn`, `postState` predicates; FITL `routeGraph` reader.
- **Spec 197** — Doctrine-Gated Plan-Template Eligibility (COMPLETED 2026-05-26) — `enablesPlanTemplates` / `suppressesPlanTemplates`.
- **Spec 198** — Cross-Game Conformance Corpus + Observer-Safety Proofs (COMPLETED 2026-05-26).
- **Spec 199** — Compound Availability at Root Proposal (COMPLETED 2026-05-26) — bounded compound-availability probe.

The Spec 196–199 series confirms that no engine work is required for FITL competence completion. The audit's §7 "Required generic architecture changes — none should be proposed now" is correct.

## Order

The five specs decompose into:

- **Spec 201** owns the shared doctrine library + monsoon/coup/event lifecycle features (foundation for the four-faction parity completions).
- **Spec 202** owns US baseline completion to ARVN-parity.
- **Spec 203** owns NVA baseline completion to ARVN-parity.
- **Spec 204** owns VC baseline completion to ARVN-parity.
- **Spec 205** owns ARVN selector quality cleanup and placeholder replacement.

### Soft dependency direction

The five specs are **NOT fully independent** (unlike 196–199, which were mutually orthogonal). Spec 201 introduces `shared.*` strategy modules that Specs 202, 203, 204 reference in their `*-baseline` bindings. This is the only cross-spec coupling.

**Recommended authoring sequence: 201 → (202 ‖ 203 ‖ 204 ‖ 205)**. After Spec 201 lands, the four downstream specs become mutually independent and can decompose into tickets in parallel.

**Independent-of-201 authoring path** (acceptable if needed): Specs 202–205 may be authored against stub references to the planned `shared.*` modules; their P5 acceptance gate (replay-identity reattestation against Spec 201) closes only after both 201 and the downstream spec have landed. Spec 205 (ARVN cleanup) is *fully independent* of Spec 201 — no soft dependency.

### Per-spec scope (one-line rationale)

1. **Spec 201 — FITL Shared Doctrine Library and Lifecycle Awareness**
   (`archive/specs/201-fitl-shared-doctrine-and-lifecycle.md`)
   Introduces `shared.*` strategy modules (immediateWin, blockCurrentLeader, nearCoupConcreteSwing, resourceLogistics, eventDirectSwing, allyRivalThrottle, monsoonOperationalRestriction); adds monsoon/coup/event lifecycle features as YAML primitives; replaces the three per-faction `blockImmediateWin` duplicates (ARVN, US, NVA — VC's `vc.denyNvaIfNearWin` is preserved as faction-specific nuance per Spec 201 §2). Foundation for four-faction parity; removes duplicated doctrine and gives the per-faction completions a consistent base. Completed and archived on 2026-05-28.

2. **Spec 202 — FITL US Baseline Completion to ARVN-Parity**
   (`specs/202-fitl-us-completion.md`)
   Authors `us.trainPacify`, `us.patrolAdvise`, `us.airLiftAssault`, `us.airLiftControlOrWithdrawal`, `us.assaultHighValueInfrastructure`, `us.eventDirectSwing` plan templates; adds `us.buildSupport`, `us.preserveAvailability`, `us.protectAidEcon`, `us.avoidArvnKingmaking` modules; explicit `us.airLiftTrain` decision (defaults to excluded with documented rationale). 10 profile-quality witnesses.

3. **Spec 203 — FITL NVA Baseline Completion to ARVN-Parity**
   (`specs/203-fitl-nva-completion.md`)
   Authors NVA `rallyTrail`, `marchControl`, `marchInfiltrateControl`, `infiltrateVcOnlyWhenRational`, `marchAmbush`, `attackAmbush`, `bombardCoinStack`, `terrorSupportReduction`, `eventLogisticsOrControlSwing` templates; adds `baseNetwork`, `takeControl`, `conventionalPressure`, `vcRivalRisk` modules; closes the VC-rival filter gap (Infiltrate only when rational). 10 witnesses.

4. **Spec 204 — FITL VC Baseline Completion to ARVN-Parity**
   (`specs/204-fitl-vc-completion.md`)
   Authors VC `rallyBaseNetwork`, `rallyTax`, `terrorTax`, `terrorSubvert`, `marchSpread`, `attackAmbush`, `agitationPrep`, `eventOppositionOrResourceSwing` templates; adds `oppositionEngine`, `baseNetwork`, `subvertPatronage`, `agitationReadiness`, `nvaRivalRisk` modules; closes the Coup-Agitation-preparation gap. 10 witnesses.

5. **Spec 205 — FITL ARVN Selector Cleanup and Placeholder Replacement**
   (`specs/205-fitl-arvn-selector-cleanup.md`)
   Replaces five verified placeholder selectors (constant `value: 1`) with item-local `zoneProp`-derived features; adds `postState` origin-control constraint to Transport; strengthens Govern Active-vs-Passive distinction; strengthens Sweep+Raid composition. Preserves all 10 existing ARVN witnesses; adds 3 regression witnesses.

**Dependency direction**: 201 → (202 ‖ 203 ‖ 204); 205 is independent.

## Why not strictly independent

Unlike the 196–199 series (orthogonal architectural seams), the 201–204 series shares a vocabulary surface — `shared.*` modules consumed by the per-faction bindings. The alternative shapes considered (one umbrella phased spec; four specs that each duplicate shared scaffolding) were rejected:

- **One umbrella phased spec**: XL specs historically churn in this repo (the 196-199 series was sliced for exactly this reason); parallel ticket decomposition becomes harder.
- **Four independent per-faction specs with each duplicating shared scaffolding**: would require 4× authoring effort for the shared modules and would scatter their tuning across four files, making the four-faction convergence canary harder to reason about.

The chosen shape (Spec 201 owns the shared seam; Specs 202–204 consume) matches the proven decomposition pattern *within* a coupled domain.

## Stop criterion

The series closes when:

1. All five specs (201, 202, 203, 204, 205) have landed.
2. `pnpm turbo build` produces byte-identical GameDef across all four FITL `*-baseline` profiles.
3. All existing FITL convergence canaries (ARVN seed 1000, FITL seed 2057, march dead-end recovery, four-profile convergence, guardrail uniformity, preview opponent-margin, plan selected-root authority, compound availability correspondence) replay byte-identically.
4. Each `*-baseline` profile has ≥ 9 profile-quality witnesses covering its competence report section.

When this series completes, this implementation-order file is archived to `archive/specs/IMPLEMENTATION-ORDER-2026-MM-DD.md` per the convention in `archive/specs/IMPLEMENTATION-ORDER-2026-05-27.md`.

## Deferred (named follow-ups, not in this series)

Per the audit's enumerated proposals, items deferred out of this series with rationale:

- **§4 Event-handling card-by-card valuation taxonomy** — the audit explicitly defers this; the spec series adopts generic `shared.eventDirectSwing` reading `activeCard.hasTag.*` and active-card annotation refs, with per-faction binding shape. A card-by-card valuation taxonomy is uncommitted until a witness shows the generic shape cannot differentiate.
- **`grantFlow32` cap class adoption** — the audit recommends *not* adopting it; this series preserves that recommendation.
- **`us.airLiftTrain` enablement** — deferred to a follow-up ticket post-Spec 202 if a P3 authoring experiment proves safe construction.
- **Multi-game shared doctrine generalization** (e.g., shared scaffolding for Texas Hold'em) — uncommitted; FITL is the proving ground.
- **Compiler-level enforcement of "no `value: 1` standalone constants"** — uncommitted; the Spec 205 fixture-driven scan covers spot-check enforcement.
- **Evolution-pipeline integration of the new tunable surfaces** — owned by future evolution specs (Spec 14 and successors).

## Source proposal disposition reference

The audit's macro recommendations and per-section findings are operationalized as follows:

| Audit section | Disposition | Owner |
|---|---|---|
| §1 Executive verdict ("architecture good enough; complete library") | Adopted | series macro |
| §3 Architecture summary | Adopted (no engine changes) | none — reaffirms 196–199 outcomes |
| §4 Universal stack rows (immediate win, block leader, near-Coup, resources, ally-rival, event, Monsoon, Coup) | Adopted | Spec 201 |
| §5 US faction-by-faction | Adopted | Spec 202 |
| §5 ARVN faction-by-faction (cleanup focus) | Adopted | Spec 205 |
| §5 NVA faction-by-faction | Adopted | Spec 203 |
| §5 VC faction-by-faction | Adopted | Spec 204 |
| §6.1 Preserve list | Adopted (preserved by all specs) | all |
| §6.2 Replace / clean up | Adopted | Spec 205 (ARVN) + Spec 202 §4.2 (US placeholders) |
| §6.3 Shared state features | Adopted | Spec 201 |
| §6.4 Shared candidate features | Adopted | Spec 201 |
| §6.5 Strategic conditions | Adopted (syntax-corrected: `activeCard.hasTag.monsoon`) | Spec 201 |
| §6.6 Relationships | Corrected — relationships already complete; consumption added | Spec 201 (`shared.allyRivalThrottle`) |
| §6.7 Strategy modules — shared | Adopted | Spec 201 |
| §6.7 Strategy modules — per-faction | Adopted | Specs 202/203/204 |
| §6.8 Plan templates | Adopted | Specs 202/203/204 |
| §6.9 Posture evaluators | Adopted | Specs 202/203/204 (+ Spec 205 for ARVN posture strengthening) |
| §6.10 Guardrails | Adopted | Specs 202/203/204 (+ Spec 205 preserves existing ARVN guardrails) |
| §6.11 Preview/profile settings | Adopted (no `grantFlow32`) | none — preserved |
| §7 Architecture changes — none now | Adopted | series macro |
| §8 Done standard + witness plan | Adopted (allocated per-spec) | all |
| §9 Risks, sequencing, implementation order | Adopted (this index operationalizes it) | this file |
| §10 Non-goals and exclusions | Adopted | all |
| §11 Final recommendation | Adopted | this file |

## Outcome

(Status: PROPOSED. Outcome section to be filled in upon completion.)
