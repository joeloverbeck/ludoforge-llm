# Implementation Order — Plan-Primary Decision Authority + Semantic Integrity

**Status**: PROPOSED
**Date**: 2026-05-22

This series finishes the advisory turn-plan architecture (Specs 186–188, all COMPLETED 2026-05-22) by closing the two gaps that the ChatGPT-Pro audit `reports/ludoforge-ai-overhaul-first-iteration.md` verified as genuinely unaddressed: (1) the selected plan does not yet choose the action-selection **root**, and (2) compiled plan/role metadata is **accepted but not enforced**. It is the reassessed, de-duplicated form of that audit — the audit's broader "second major architectural iteration" was largely already landed (186–188) or already rejected on Foundations merits (Spec 186 §11). See each spec's §11 Reassessment for per-recommendation dispositions.

## Prerequisites (already landed)

- **Spec 185** — Grant-Flow Preview Integrity (COMPLETED 2026-05-20).
- **Spec 186** — Advisory Turn-Plan Architecture Core (COMPLETED 2026-05-20): plan IR, role selectors, `PlanExecutionState`, proposer/evaluator, execution controller, fallback ladder, plan trace, compiler validation. **§4.6 specified plan-primary root selection; the implementation realized plan-driven tail execution + advisory root, leaving root authority unrealized — Spec 190 closes this.**
- **Spec 187** — Whole-Turn Posture + Ally-as-Rival Metadata (COMPLETED 2026-05-21).
- **Spec 188** — FITL Four-Faction Plan Migration + Sequencing Library (COMPLETED 2026-05-22): the four competence-report personalities authored as plan structures with demoted leaf scorers.

## Order

1. **Spec 191 — Plan/Role Semantic Integrity** (`specs/191-plan-role-semantic-integrity.md`).
   Enforce or compile-reject every piece of compiled plan/role metadata: role-constraint runtime/compile parity (`locatedIn`), step-match `decisionPath`/`stageIndex`/`targetKind` validation + use, compound-sequencing witness validation, semantic golden traces. **Lands first** — it is non-behaviour-changing correctness hardening, and trustworthy step matching + enforced role constraints make the plan a safe root authority for Spec 190.

2. **Spec 190 — Plan-Primary Root Selection** (`specs/190-plan-primary-root-selection.md`).
   Make the selected plan/root pair authoritative at the action-selection microturn; demote the scalar `evaluatePolicyMove` path to the no-template fallback (Spec 186 §4.6). **Behaviour-changing** — requires profile-quality re-validation and a root-override witness Spec 186 lacked. Depends on Spec 191's enforced matching landing first.

**Dependency direction:** 191 → 190. They are independently mergeable and independently testable (Foundations #8/#16 proofs hold at each step), but 190 is sequenced after 191 so that its root-authoritative plans execute against semantically-validated step matching rather than the current kind/tag-only matching.

## Deferred (named follow-ups, not in this series)

- **`docs/agent-dsl-cookbook.md` rewrite** — recenter on the realized plan-primary framing (audit claim #8). Run the `reassess-agent-dsl-cookbook` skill **after Spec 190 lands**, so the cookbook describes shipped behaviour rather than intent.
- **Relationship-matrix strengthening** (audit §12) — Spec 187 landed conditional ally-rival weighting; multiple-active-relationships-per-role is uncommitted until a concrete competence requirement needs it.
- **Evolution-loop revival** (audit §15) — mutating doctrine/plan/role structure instead of flat weights remains the deferred Spec 183 reassessment, to be revisited once authored competence (188) plus root authority (190) provide a stable baseline to *tune*.

## Rejected (with rationale)

- **New doctrine layer replacing strategy modules** (audit §6 Layer 2, §17.2) — Spec 186 §11 already decided doctrine reuses Spec 182 modules as carriers; a new layer is churn against a settled, Foundations-justified decision (#14).
- **"Weights have failed / abolish considerations"** (audit §3, §18) — Spec 186 §11 corrected this; considerations are demoted to leaf scorers, and Spec 190 (not a profile rewrite) relocates them to that subordinate role.
- **Formal hidden-info 4-mode enum** (audit §13) — Foundations #4 + #20 already mandate observer discipline and preview provenance; FITL is near-fully public; speculative (YAGNI) until the conformance hidden-info card game exercises it.
- **Game-specific engine target kinds** such as `lineOfCommunication` (audit §10) — Foundation #1 keeps game semantics in authored data; only generic target kinds belong in the engine.
- **Audit claim #7** (`noPreviewDecision` in the normal root path) — refuted by verification; `noPreviewDecision` is plan-posture-only (`plan-proposal.ts:505`). No work warranted.

## Why this scope, not the audit's "replace everything"

The audit re-derived the Doctrine–Plan–Role–Target shape that Specs 186–188 already landed, under new vocabulary, and re-proposed two things the completed series had already rejected on their merits (doctrine-as-new-layer, weights-abolished). Verification against current `main` showed the genuinely unaddressed residue is exactly two clusters: root authority (190) and metadata enforcement (191). Scoping to those avoids duplicating the just-completed 186–188 work and re-litigating settled decisions, while still closing the real Foundation #12/#15 gaps the audit correctly identified.
