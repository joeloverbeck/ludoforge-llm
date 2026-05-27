# Triage — `reports/ludoforge-ai-overhaul-second-iteration.md` (ChatGPT-Pro audit)

**Status**: COMPLETED
**Date**: 2026-05-27
**Source report**: `reports/ludoforge-ai-overhaul-second-iteration.md` (audit of HEAD `92247448b`, post-Spec-199)
**Prior triage**: `archive/specs/IMPLEMENTATION-ORDER-2026-05-27.md` (triage of the first-iteration audit `reports/ai-agent-policy-overhaul-second-iteration.md`, which yielded Specs 196–199; this memo continues the dispositional record forward)
**Resulting spec(s)**: `specs/200-plan-proposal-trace-completeness.md`
**No `specs/IMPLEMENTATION-ORDER.md`**: only one spec warranted on critical reassessment; cross-spec ordering index not needed.

## Summary verdict

ChatGPT-Pro's "DIPT-C" (Doctrine–Intent–Plan–Target Contracts) proposal is **80% a repeat** of the first iteration's "DPRT-P" reframe, which IMPLEMENTATION-ORDER-2026-05-27 already rejected as Foundation #14 churn. The marginal "new" idea — promoting Intent to an explicit typed layer between Doctrine and Plan — turns out, on verification, to already exist implicitly (`SelectedPlanProposal.intent: string` at `plan-proposal.ts:190`).

After critical reassessment against `docs/FOUNDATIONS.md` and three parallel codebase-verification investigations, **exactly one concrete trace-observability gap survives**: five distinct plan-trace surfaces emit silent or free-form rejections where Foundation #20 prescribes status-with-provenance. Spec 200 closes that gap by generalising the Spec 199 `CompoundAvailability` shape to five additional surfaces.

The audit's broader DIPT-C reframe, the proposed Foundation #21 amendment, and the proposed "feasibility certificate" container abstraction are all **rejected** as architectural over-design.

## Verification methodology

Three parallel Explore-agent investigations, dispatched in a single message, scoped to non-overlapping claim clusters:

1. **Target algebra / pipe-string identities** (audit §5, §7.5). Findings: pipe-strings exist (`policy-selector-eval.ts:162, 177, 225`) as stable serialization keys; zero code parses them (`grep` for `.split('|')` on `selectedId` returned no matches); the real missing abstraction is structured payload on `PlanRoleBinding`, not pipe-string parsing. Already deferred (IMPLEMENTATION-ORDER-2026-05-27 disposition #2); no new evidence to revive.
2. **`postState` + feasibility certificate** (audit §5, §7.6). Findings: `postState` (Spec 196) is bounded by per-constraint `maxSteps`, applies `applyMove` + `resolveDecisionContinuation` on a single bound role, parallels Foundation #18's publication probe (Spec 144) — *validating* probe, not enumerative planner. Of the 9 fields the audit proposes for a feasibility certificate, 4 are already traced (root frontier membership, compound availability via Spec 199, preview/probe budget status, fallback readiness); 5 are not (role-target availability, decision-surface match, route reachability status, post-state verdict, hidden/partial unavailable reasons). The 5 missing fields are the Spec 200 scope.
3. **Strategy modules / Intent / Foundation #21** (audit §5, §7.2, §12). Findings: Spec 197 §3 verification on record found ~69% of FITL modules carry conditional `when:` predicates (contradicting the audit's "weighted preferences with constant values" framing); `enablesPlanTemplates`/`suppressesPlanTemplates` apply as a pre-scoring filter (`plan-proposal.ts:102–107` before `120–164`); `intent` already exists as an implicit field (`SelectedPlanProposal.intent: string` set to `templateId` at `plan-proposal.ts:190`, `PlanExecutionState.intent` at `plan-execution.ts:12–21`); Foundations #8/#9/#16/#20 + the Appendix's profile-quality vs. determinism split already cover the "alien optimizer" concern.

The audit also does not acknowledge commit `3936e434a` (2026-05-27) which capped the Spec 199 compound-availability probe budget to `{ maxDecisionProbeSteps: 4, maxParamExpansions: 64, maxDeferredPredicates: 16 }` and memoized per-call — its critique of "compound availability as another local patch" overlooks this stabilisation.

## Per-proposal disposition table

The audit numbers its proposals in §14 ("smallest coherent next architectural direction") and elaborates throughout §5–§12. Mapping each load-bearing recommendation to a disposition:

| Audit element | Verbatim summary | Disposition | Owner |
|---|---|---|---|
| §1 / §7 — DIPT-C reframe (Doctrine–Intent–Plan–Target Contracts) | "Replace the authoring abstraction above [the microturn kernel] with Doctrine–Intent–Plan–Target Contracts" | **Rejected** — same reframe IMPLEMENTATION-ORDER-2026-05-27 rejected; Foundation #14 churn; Specs 186/187/190/191/197 already realise the load-bearing shape | — |
| §7.2 — First-class Doctrine layer | "A doctrine is a named strategic stance, not a score group" | **Rejected as reframe** (settled by Spec 197); doctrine-shape decoupling already landed via `enablesPlanTemplates`/`suppressesPlanTemplates` | — |
| §7.3 — First-class Intent layer | "An intent is the selected reason for the turn. It is a typed object, not just a template id" | **Rejected** — `SelectedPlanProposal.intent` already exists; promoting it to a structured object is observability refinement deferred until a witness need surfaces | — |
| §7.4 — Plan-family decomposition | "Plan templates remain, but become plan families with explicit decomposition" | **Rejected as reframe** — current `CompiledPlanTemplate` already carries the load-bearing decomposition (root + role bindings + steps + compound + fallback) | — |
| §7.5 — Typed target algebra | "Replace string-key target semantics with typed target contracts: `ZoneTarget`, `TokenTarget`, …, `OriginDestinationTarget`, `RoutePathTarget`, …" | **Deferred** — IMPLEMENTATION-ORDER-2026-05-27 disposition #2 already deferred this; verification confirms no code parses pipe-strings; deferral stands | — |
| §7.6 — Feasibility certificate layer | "Replace ad hoc feasibility fragments with a single advisory certificate" containing 9 fields | **Adopted with adjustment** — 5 of the 9 fields are real trace gaps; reject the certificate-as-container framing; surface each verdict on its own trace surface using the Spec 199 status shape | **Spec 200** |
| §7.7 — Execution monitor | "Keep the current plan controller" | **Adopted (already landed)** — Spec 186 controller + Spec 199 status-shape; no change needed beyond Spec 200's §4.5 promotion of `fallbackReason` to a discriminated union | **Spec 200 P3** |
| §10 — Trace golden tests | "Add trace-golden tests for doctrine, intent, target binding, feasibility, and deviation" | **Adopted in scope** — Spec 200 §8 test plan operationalises this for the five surfaces; doctrine/intent additions remain deferred per Rejected elements above | **Spec 200 §8** |
| §11 — Migration strategy | "Keep / Reframe / Replace" lists | **Mixed** — "Keep" list aligns with current state; "Reframe `strategyModules` as doctrines" is rejected (settled by Spec 197); "Promote `planTemplates` into plan families" is already realised; "Replace pipe-delimited semantic target identities" is deferred | — |
| §12 — Foundation #21 amendment | "Advisory Intent Traceability and Human-Plausible Agent Quality" as new Foundation | **Rejected** — Foundations #8/#9/#16/#20 + Appendix already cover; no concrete missing guarantee named | — |
| §10 — Validation expansion: cross-game corpus | "Perfect-info board game with plan/target roles; hidden-info card game with nontrivial policy traces; stochastic game with fallback/provenance; asymmetric phase-heavy FITL; heavy target-selection synthetic game" | **Adopted (already landed)** — Spec 198 conformance corpus; the five-axis taxonomy was reduced to Foundation #16's four axes by Spec 198 (IMPLEMENTATION-ORDER-2026-05-27 framing correction) | — |
| §10 — Human-plausibility witnesses | "Witnesses for ARVN refuses Transport that loses origin control, ARVN Train/Govern, US Air Strike caution, NVA protects Trail, VC avoids conventional Attack, posture under Monsoon" | **Adopted (already landed)** — FITL `packages/engine/test/policy-profile-quality/` corpus per the manifest, referenced by the audit itself | — |
| §11 — Migration: cookbook conceptual rewrite | "`docs/agent-dsl-cookbook.md` should be rewritten" | **Deferred to `reassess-agent-dsl-cookbook` skill** — IMPLEMENTATION-ORDER-2026-05-27 disposition #9; not a spec | — |

## Cross-cutting framing corrections

These are corrections to the audit's framing that the implementer should be aware of when reading the source report:

1. **DIPT-C is a repeat of DPRT-P with one cosmetic addition.** The first-iteration audit (`reports/ai-agent-policy-overhaul-second-iteration.md`, audited at HEAD `8d526b206`) proposed DPRT-P (Doctrine–Plan–Role–Target–Posture). The new audit (`reports/ludoforge-ai-overhaul-second-iteration.md`, audited at HEAD `92247448b`) proposes DIPT-C (Doctrine–Intent–Plan–Target Contracts). The only structural difference is the explicit Intent layer between Doctrine and Plan — which already exists implicitly. The "second iteration architecture" framing is symmetric to the first iteration's rejected framing.

2. **"DPRT-P / DIPT-C is already realised" is the central correction.** Specs 186 (plan-template IR), 187 (posture + ally-rival), 190 (plan-primary root authority), 191 (role semantic integrity), 196 (richer constraints + authored route semantics), 197 (doctrine-gated eligibility), 198 (conformance + observer safety), 199 (compound availability) collectively realise the Doctrine → Plan-Family → Role → Target → Posture shape the audits propose. The "second architectural iteration" is *enforcement-level additions to a built architecture*, not architectural replacement.

3. **`postState` is not a "second rules engine".** The audit's framing as "dangerously close to synthetic rule execution as a substitute for typed plan expectations" is theoretically valid but practically inaccurate. Verified: the probe is bounded by per-constraint `maxSteps`, evaluates a single bound role's projected state, parallels Foundation #18's publication probe (Spec 144). It is a *validating* probe, not an enumerative planner. The "second rules engine" risk is speculative; Spec 200 records the probe's verdict (§4.4) rather than narrowing the probe itself.

4. **Foundation #20 already covers the "Foundation #21" gap.** The audit proposes Foundation #21 ("Advisory Intent Traceability and Human-Plausible Agent Quality") claiming Foundations #9/#16/#20 are insufficient against "alien optimizer" failure modes. Verified: Foundation #20 ("Preview Signal Integrity") explicitly forbids silent coercion of unavailable preview into numeric contribution; Foundation #16 + the Appendix's profile-quality-vs-determinism split frames profile witnesses as quality signals distinct from engine invariants; `packages/engine/test/policy-profile-quality/` operationalises this. The audit names no concrete missing guarantee. Spec 200's trace extensions are explicit *applications* of Foundation #20 to additional surfaces — not a new Foundation.

5. **Spec 199 compound-availability stabilisation is unacknowledged.** Commit `3936e434a` (2026-05-27) capped the probe budget and memoized per-call. The audit's critique of "compound availability as another local patch" overlooks this; Spec 200 §3.3 + §10 record the canonical status shape this stabilised version established.

## Stop criterion

This triage closes when:

1. **Spec 200** (`specs/200-plan-proposal-trace-completeness.md`) is approved and decomposed via `/spec-to-tickets`.
2. The cookbook reassessment (`reassess-agent-dsl-cookbook` skill, deferred from IMPLEMENTATION-ORDER-2026-05-27) is invoked at the user's discretion. Not blocked on Spec 200.
3. The follow-up breadcrumb is appended to `reports/ludoforge-ai-overhaul-second-iteration.md` (done — see that file's closing section).

When Spec 200 completes, this memo can stay in `reports/` as a historical decision record (no archival convention applies to triage memos that did not produce an `IMPLEMENTATION-ORDER` file).
