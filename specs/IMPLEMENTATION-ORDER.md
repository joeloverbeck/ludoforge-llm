# Implementation Order — AI Agent Architecture Overhaul (Second Iteration)

**Status**: PROPOSED
**Date**: 2026-05-26
**Source report**: `reports/ai-agent-policy-overhaul-second-iteration.md`
**Prior triage**: `archive/specs/191-plan-role-semantic-integrity.md` §11 (triaged the first iteration; this index continues from where that left off)

This series operationalizes the load-bearing concrete gaps the second-iteration ChatGPT-Pro audit named, after critical reassessment against `docs/FOUNDATIONS.md` and the prior Spec 191 triage. The audit's broader "DPRT-P" architectural reframe is **rejected** as Foundation #14 churn (Spec 186 §11 + Spec 191 §11 already settled this); the smaller, targeted, concrete-need-driven additions are this series.

The four specs are **mutually independent** — each owns a distinct architectural seam. The user explicitly requested this ordering index, which records the independence verdict and per-spec scope so future implementers and `/spec-to-tickets` consumers can navigate forward without re-deriving the slicing.

## Prerequisites (already landed)

- **Spec 186** — Advisory Turn Plan Architecture Core (COMPLETED) — plan-template IR, role selectors, execution controller, fallback ladder.
- **Spec 187** — Whole-Turn Posture and Ally-Rival Metadata (COMPLETED) — posture evaluators, relationship metadata.
- **Spec 190** — Plan-Primary Root Selection (COMPLETED 2026-05-23) — plan root authority; doctrine gating (Spec 197) and compound probing (Spec 199) are meaningful only with this in place.
- **Spec 191** — Plan/Role Semantic Integrity (COMPLETED 2026-05-23) — `SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS` registry (extended by Spec 196), `targetKind` validation (extended by Spec 196 + Spec 198 negatives), compound metadata witness (extended by Spec 199).
- **Spec 144** — Publication Probe and Fallback Pass (COMPLETED) — Foundation #18 publication-probe pattern reused by Spec 199.
- **Spec 170** — Partial Visibility Observer Policy (COMPLETED) — observer scope machinery exercised by Spec 198.

## Order

The four specs are **mutually independent** — no required ordering. Their owned seams do not interact at the architectural level:

- **Spec 196** owns the role-constraint registry extension and the authored `routeGraph` data-asset machinery.
- **Spec 197** owns the `StrategyModuleDef` schema extension and the plan-proposer eligibility filter pass.
- **Spec 198** owns the cross-game conformance corpus, observer-safety architectural invariants, and authoring-error negative tests.
- **Spec 199** owns the compound-availability probe primitive and its proposer/trace wiring.

Each spec carries its own replay-identity and determinism proof obligations independently. Specs can be picked up by independent sessions, decomposed via `/spec-to-tickets` in parallel, and implemented without cross-spec coordination.

### Per-spec scope (one-line rationale)

1. **Spec 196 — Generic Role Constraints and Authored Route/Map Semantics** (COMPLETED 2026-05-26)
   (`archive/specs/196-generic-role-constraints-and-authored-route-semantics.md`)
   Extends `SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS` with `locatedIn`, `distinctOriginDestination`, `reachable`, `adjacent`; introduces engine-generic authored `routeGraph` data-asset reader; migrates FITL ARVN Transport as the architectural exemplar. Closes the constraint-expressiveness gap Spec 191 §2 explicitly deferred until a concrete authoring need surfaced — that need is now supplied by the FITL competence requirements (ARVN Transport origin-control, NVA route logistics).

2. **Spec 197 — Doctrine-Gated Plan-Template Eligibility**
   (`specs/197-doctrine-gated-plan-template-eligibility.md`)
   Extends `StrategyModuleDef` with optional `enablesPlanTemplates` / `enablesPlanTemplateTags` / `suppressesPlanTemplates`; adds an eligibility-filter pass in the plan proposer before scoring. Closes the verified decoupling gap (strategy modules adjust scoring tier but do not gate plan-template candidacy) without retyping strategy modules into a new "doctrine" concept (Spec 186 §11 / Spec 191 §11 settled that this is Foundation #14 churn).

3. **Spec 198 — Cross-Game Conformance Corpus and Observer-Safety Proofs**
   (`specs/198-cross-game-conformance-corpus-and-observer-safety-proofs.md`)
   Authors one minimal perfect-information board game spec; builds the cross-family architectural-invariant test surface across FITL / Texas Hold'em / new game; promotes observer-safety from informal expectation to enforced architectural invariant; adds authoring-error negative-test infrastructure. Operationalizes Foundation #16's literal corpus mandate.

4. **Spec 199 — Compound Availability at Root Proposal**
   (`specs/199-compound-availability-at-root-proposal.md`)
   Adds a bounded compound-availability probe at the kernel-publication seam; the proposer consults it for compound-bearing root candidates; trace surfaces availability status with Foundation-#20-style provenance. Closes the proposal-trace integrity gap where the proposer overstates compound coherence the runtime fallback later corrects. Promoted from ticket-sized to standalone spec at user request.

**Dependency direction:** none — the four specs are mutually independent. Per-spec acceptance is recoverable in any sequence. A natural authoring sequence (196 → 197 → 198 → 199) is suggested by complexity ordering rather than required by architectural dependency.

## Why no required ordering

Each spec owns a disjoint architectural seam:

- Spec 196 touches the constraint registry + `dataAssets` reader + FITL ARVN Transport profile.
- Spec 197 touches the strategy-module schema + the plan-proposer's pre-scoring filter.
- Spec 198 touches `data/games/<new>/` + new test files under `packages/engine/test/architecture/`.
- Spec 199 touches a new kernel probe primitive + the plan-proposer's post-scoring tiebreaker + trace type extension.

The only soft coupling is that Spec 198's authoring-error negative-test infrastructure benefits from Spec 196's extended constraint registry (more kinds to negative-test) and Spec 197's new schema fields (more validation surfaces). But Spec 198 can author its negative-test scaffolding against the *pre-196/197* surface first, then extend as 196 and 197 land — no hard ordering required. The Spec 198 P4 acceptance row explicitly enumerates "each Spec-191/196/197 surface has at least one negative-test entry"; if 196 or 197 land later, the Spec 198 P4 deliverable expands in-place.

## Deferred (named follow-ups, not in this series)

Per the second-iteration audit's 11 DPRT-P proposals, items deferred out of this series with rationale:

- **Structured composite target identity** (audit proposal #2) — pipe-delimited route-pair / subset identities (`origin|destination`) remain stable. The audit's concern is trace explainability rather than legality; defer until a concrete explainability requirement surfaces.
- **Lexicographic plan-family selection refinement** (audit proposal #6) — `priorityTier` is *already* the first lexicographic key via `plan-proposal.ts:588-592`. Within-tier scalar summation is preserved by Spec 197. Finer-grained tiering is uncommitted until concrete witness shows post-eligibility-gating scalar-soup harm.
- **Cookbook conceptual rewrite** (audit proposal #9) — NOT a spec. Routed to the `reassess-agent-dsl-cookbook` skill, per Spec 191 §11's deferral ("deferred to the `reassess-agent-dsl-cookbook` skill *after* Spec 190 lands"). Spec 190 has landed; the skill is now triggered.
- **Tactical / target-heavy as a separate corpus axis** (audit's five-axis taxonomy) — Foundation #16's authoritative four-axis taxonomy is adopted by Spec 198; FITL already proves tactical/target-heavy as a property, not a separate axis.

## Stop criterion

The series closes when:

1. All four specs (196, 197, 198, 199) have landed.
2. The `reassess-agent-dsl-cookbook` skill has run against `docs/agent-dsl-cookbook.md` post-landing.
3. The Spec 198 conformance harness passes on FITL + Texas Hold'em + the new perfect-info board game.

When this implementation-order file's series completes, it is archived to `archive/specs/IMPLEMENTATION-ORDER-2026-MM-DD.md` per the convention visible in `archive/specs/IMPLEMENTATION-ORDER-2026-05-25.md`.

## Source proposal disposition reference

This series is the operationalization of the second-iteration audit's proposals. The per-spec Reassessment sections record adoptions/corrections/deferrals/rejections at fine granularity. This index records the cross-spec slicing rationale so the per-spec Reassessment sections need not duplicate cross-cutting context.

| Audit proposal | Disposition | Owner |
|---|---|---|
| #1 — Promote doctrine to first-class (reframe) | Rejected as reframe (Spec 191 §11 churn); load-bearing core adopted | Spec 197 |
| #2 — Structured composite target identity | Deferred (trace-quality, no concrete need) | — |
| #3 — Typed target-role schemas | Partially landed (Spec 191); extended for new constraints | Spec 196 |
| #4 — Richer role constraints | Adopted | Spec 196 |
| #5 — Authored route/map semantics | Adopted | Spec 196 |
| #6 — Lexicographic plan-family selection | Deferred (already lex at primary tier; finer-grained YAGNI) | — |
| #7 — Compound availability at root proposal | Adopted (promoted at user request) | Spec 199 |
| #8 — Observer-safe target/preview proofs | Adopted | Spec 198 |
| #9 — Cookbook conceptual rewrite | Not a spec → `reassess-agent-dsl-cookbook` skill | (skill) |
| #10 — Cross-game conformance corpus | Adopted | Spec 198 |
| #11 — Authoring-error negative tests | Adopted (folded into Spec 198) | Spec 198 |
