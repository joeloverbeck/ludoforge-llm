# Spec 186 — Advisory Turn-Plan Architecture (Core): Composed-Turn Evaluation Over the Atomic Microturn Frontier

**Status**: PROPOSED
**Priority**: High — this is the architectural replacement of the primary agent decision paradigm. It is the prerequisite for Specs 187 (posture preview + ally-rival metadata) and 188 (FITL four-faction migration).
**Complexity**: L — three mergeable phases. Phase 1 (plan IR + compiler) is M. Phase 2 (plan runtime + cross-microturn execution) is the substantive M–L engine change. Phase 3 (ARVN Train+Govern proof slice + witnesses) is M.
**Date**: 2026-05-20
**Dependencies**:
- `archive/specs/181-structured-strategy-policy-layer-probes-and-selectors.md` (first-class selectors — extended here with role-binding and cross-role constraints; not rebuilt)
- `archive/specs/182-structured-strategy-policy-layer-modules-guardrails-and-turn-shape.md` (strategy modules / guardrails / turn-shape evaluators — reused as leaf machinery inside plan evaluation; modules become doctrine carriers, not a parallel layer)
- `archive/specs/185-grant-flow-preview-integrity.md` (honest, effect-complete grant-flow preview — the substrate posture evaluation consumes in Spec 187; this spec only requires its `ready`/non-`ready` status contract, not new preview depth)
- `archive/specs/180-standing-vector-observability-and-outer-preview-signal-integrity.md` (`currentLeader`/`nearestThreat` standing roles — the relationship substrate Spec 187 extends)

**Trigger reports**:
- `reports/ai-agent-policy-overhaul-first-iteration.md` (external ChatGPT-Pro "Doctrine–Plan–Selector Architecture / DPSA" proposal — reassessed in §11; this spec keeps DPSA's load-bearing idea, corrects its framing, and de-duplicates it against Specs 181/182)
- `reports/fitl-competent-agent-ai.md` (the competence target this architecture is evaluated against — see §3.4)

**Ticket namespace**: `ADVTURNPLAN` (proposed; finalize during ticket decomposition)

---

## 1. Goal

Replace the agent's **primary decision paradigm**.

Today the policy scores each kernel-published atomic microturn **independently** and hopes a coherent compound turn emerges downstream. Competent Fire in the Lake play — as specified in `reports/fitl-competent-agent-ai.md` — requires the opposite: a turn must be evaluated as a **composed candidate object** (`operation + optional special activity + timing + selected spaces + selected pieces + expected resulting posture`), because many strong turns are strong *only* because of sequencing (Train→Govern, Sweep→Raid, March→Infiltrate, Assault→Transport→Assault).

This spec introduces the **`AdvisoryTurnPlan`** as the primary policy object, with:

1. a declarative **plan-template IR** (`schemaVersion: 3`) describing composed-turn shapes generically;
2. **role selectors** that bind typed plan roles (spaces, pieces, origin/destination, subsets) and persist across microturns;
3. a **`PlanExecutionState`** that survives across the microturns of a single `turnId`;
4. a **bounded plan proposer/evaluator** that enumerates and ranks candidate plans under named caps (Foundation #10);
5. a **microturn execution controller** that matches each kernel-published legal frontier to the next plan role and adapts via a bounded fallback ladder;
6. a **deterministic plan trace**.

The plan is **advisory only**. The kernel still publishes atomic microturns; the plan never becomes a published compound action; every microturn re-validates against the live frontier (Foundations #5, #18, #19).

**Reuse, not rebuild.** Spec 181 selectors and Spec 182 modules/guardrails/turn-shape evaluators are not replaced by a parallel "doctrine" layer. They are extended (selectors gain role binding) and re-homed (modules become doctrine carriers that *propose* plan templates; guardrails attach at plan/role scope; turn-shape evaluators become posture inputs in Spec 187). Flat `considerations` are **demoted to leaf/primitive scorers**, not deleted (Foundation #14 migration in the same change).

**Correction to the source proposal.** DPSA frames the problem as "weights have failed." That framing is wrong: the competence report is itself a weighted-scoring model (`score(candidate_turn) = own_victory_margin_delta + … − ally_rival_risk − …`). Weights are not the disease. The disease is the **unit** being scored — independent atomic microturns instead of composed candidate turns. This spec changes the unit; weighted scoring remains, relocated to plan/posture scope.

## 2. Non-Goals

- **No kernel-published compound actions.** No plan template, timing, or sequencing ever becomes a kernel `Decision` variant or a published legal action. Compound turns remain emergent from atomic decision sequences grouped by `turnId` (Foundation #19). The plan lives entirely in the agent layer.
- **No runtime planner / search.** No MCTS, HTN decomposition search, GOAP regression, or behavior-tree ticking as the runtime core. Plan enumeration is bounded, finite, and statically capped (Foundation #10). "HTN-like" and "BT-like" in the source proposal are authoring metaphors, not runtime algorithms.
- **No game-specific engine logic.** No FITL/ARVN/`train`/`govern`/Patronage/COIN/Coup/Monsoon identifiers or branches in `packages/engine/`. Plan templates operate on generic concepts: root action match, optional companion action, timing, ordered/partial role steps, role selectors, frontier-match patterns. FITL words live only in `data/games/fire-in-the-lake/*.md` (Foundation #1).
- **Considerations are demoted, not deleted.** Flat considerations remain expressible as leaf scorers usable inside role-selector quality, plan posture, and the primitive fallback policy. They simply stop being the top-level decision object.
- **No deep posture/preview work here.** Posture evaluation that scores the *expected resulting board state* via Spec 185's grant-flow preview, and ally-as-rival relationship metadata, are specified in Spec 187. This spec defines the posture *hook* (where a posture score plugs into plan ranking) but uses only existing current-state and `ready`/non-`ready` preview status.
- **No multi-faction authoring.** Only the ARVN Train+Govern proof slice is authored here (§8 Phase 3). US/NVA/VC and the full sequencing library are Spec 188.
- **No evolution-loop changes.** Structure-first mutation, plausibility gates, and the revival of the rejected Spec 183 are deferred. This spec does not touch `campaigns/` or the improve-loop skill.
- **No removal of the existing `schemaVersion: 2` capability set as expressible primitives.** `schemaVersion: 3` is a superset reachable by migration; the v2 *primary flow* (top-level consideration scoring) is retired, but stateFeatures/candidateFeatures/selectors/modules/guardrails/turn-shape/tieBreakers survive as components.

## 3. Context (verified against codebase, 2026-05-20)

All claims verified by source inspection.

### 3.1 What Specs 181/182 actually shipped — and why it collapses to scalar

Spec 181 added first-class **selectors** (`packages/engine/src/cnl/compile-agents.ts`; `CompiledAgentSelector` in `kernel/types-core.ts`): a ranked finite collection over `collection` (`zones|tokens|cards|players|authoredFinite`), `product`, `microturnOptions`, or `candidateParams`, exposing `selector.<id>.selected.{quality,rank,components}` refs. Selectors **rank items; they do not bind roles** — `CompiledAgentSelector` has no role field.

Spec 182 added **strategy modules**, **guardrails** (severity tiers `prune|demote|warn|auditOnly`), and **turn-shape evaluators**. A module (`GameSpecStrategyModuleDef`) has `when` activation, `applies` scope/action-tag filters, `priority.tier`, a `selectors: [{ role, selectorId }]` binding, and `scoreGroups`. Its **output is a summed weighted contribution** — verified in the FITL ARVN profile, where `buildPoliticalEngine.scoreGroups` is literally `[{ id: targetQuality, terms: [{ weight: 325, value: 1 }] }, { id: standing, terms: [{ weight: 325, value: 1 }] }]` (`data/games/fire-in-the-lake/92-agents.md`).

**Conclusion:** 181/182 are an *organization layer over the same scalar-scoring paradigm*. Module roles exist but are scoped to a single decision's candidate-scoring pass; they do not persist, and there is no composed-turn object. The current `arvn-evolved` profile is ~65% flat considerations by scoring weight; the structured layer gates *when/how to score* but still emits a scalar that competes in one summation.

### 3.2 The verified cross-microturn runtime gap

`PolicyAgent.chooseDecision` (`packages/engine/src/agents/policy-agent.ts`) is invoked once per microturn. The **only** state that persists across microturns within a turn is `previewWideningState: PreviewWideningState` (`policy-agent.ts:578`; `preview-budget-allocator.ts`), keyed by `turnId+seatId`, holding preview-budget memory. There is **no persistent plan, no role binding, and no committed intent** carried between consecutive microturns. The `plan` field on `CompiledAgentProfile` (`types-core.ts`) is a *profile-scoped dependency manifest* (which features/modules/considerations are active), computed once at compile time — not a per-turn execution plan. This is the gap DPSA's "runtime gap" names, and it is real.

### 3.3 Legality discipline already correct (preserve verbatim)

`PolicyAgent` chooses from `input.microturn.legalActions`, delegates action scoring to `evaluatePolicyMove`, and for `chooseOne`/`chooseNStep` matches guided selections back against the published legal actions (returning `null` on no match). This is the contract the execution controller (§4.5) must preserve exactly: the controller selects *which* published legal option satisfies the current role; it never constructs an option.

### 3.4 The competence target

`reports/fitl-competent-agent-ai.md` §"Core shared model" mandates evaluating a candidate turn as a composed object and explicitly forbids scoring operation and special activity independently. §6.1 ("Candidate turn generation") requires the DSL to generate candidate turns with operation type, special-activity type, before/during/after timing, target spaces, target pieces, origin spaces, legality constraints, and expected resulting board state, including interruption/sequencing. §6.8 wants weighted personality defaults overridden by victory/block emergencies. This spec supplies the structural unit (the plan); Specs 187/188 supply posture-over-preview, relationship weighting, and the authored personalities.

### 3.5 Substrate readiness

Spec 185 (archived 2026-05-20) made grant-flow / free-operation preview honest and effect-complete: `preview.victory.currentMargin.$seat`, `currentLeader`, and `nearestThreat` now differentiate across candidates whose granted effects change those standings, and non-`ready` statuses are no longer silently coerced (Foundation #20). The cookbook's prior warning against "multi-step speculative execution" was written against a *dishonest* preview; bounded, status-honest whole-turn posture preview is now reconcilable (consumed in Spec 187). This spec depends only on the honest `ready`/non-`ready` status contract.

### 3.6 File-level areas likely to change

- Schema/compiler: `packages/engine/src/cnl/game-spec-doc.ts`, `compile-agents.ts`, `validate-agents.ts`; new `compile-agent-plan-templates.ts`, `compile-agent-role-selectors.ts`.
- Runtime: `packages/engine/src/agents/policy-agent.ts`, `policy-eval.ts`, `policy-evaluation-core.ts`, `policy-selector-eval.ts`; new `plan-proposal.ts`, `plan-execution.ts`, `plan-trace.ts`.
- Types: agent IR/trace types in `packages/engine/src/kernel/types-core.ts` and adjacent.
- Tests: `packages/engine/test/unit/agents/`, `unit/cnl/`, `integration/agents/`, `policy-profile-quality/`, plan-trace determinism under `determinism/`.
- Docs: `docs/agent-dsl-cookbook.md` (Agent v3 mental model).

## 4. Architecture

### 4.1 Plan-template IR (`schemaVersion: 3`)

A new library bucket `planTemplates`. Each template is a generic composed-turn shape:

- `root`: match against kernel-published legal root actions by generic `actionTags` and/or action ids; optional `compound: { specialTags, timing: before|during|after|interruptAfterStage:N }`.
- `roles`: a map of named typed roles, each `{ selector: <roleSelectorId>, required: bool, constraints: [...] }`. Constraints reference previously bound (or explicitly forward-declared) roles, e.g. `notEqual: role.trainSpace`, `locatedIn: role.sweepSpace`.
- `steps`: ordered (or partially ordered) list, each `{ label, role, match: { decisionKind, targetKind, decisionPath, actionTag?, stageIndex? } }`. The `match` is a **frontier-match pattern**, not a constructor.
- `postureHook`: optional reference to a posture evaluator (defined in Spec 187); in this spec the hook accepts only current-state and `ready`/non-`ready` preview status.
- `fallback`: per-condition redirections (`ifSpecialUnavailable`, `ifRoleTargetUnavailable`, `ifPreviewUnavailable`) into alternate templates or the primitive policy.

Templates are generic: the engine never knows "Train" or "Govern". FITL meaning is supplied by action tags, selector filters, and labels in YAML.

### 4.2 Role selectors (extend Spec 181)

Extend the existing selector IR with **role-binding semantics** and the source kinds the composed-turn unit needs:

- existing `collection` / `product` / `microturnOptions` / `candidateParams` sources are retained;
- add `routePairs` (origin selector × destination selector, capped) and `subset` (bounded `min`/`max` with `beamWidth`) sources;
- a selector used as a role binder fills a typed role slot and exposes `role.<name>` refs (id, quality, components) consumable by constraints, posture, and downstream role selectors.

Selectors remain generic engine machinery; game meaning comes from authored filters/vetoes/priority-tiers/quality-components (unchanged from Spec 181).

The `routePairs` and `subset` sources are **engine prerequisites for Spec 188** (Transport origin/destination pairs; VC terror subsets). They must land in this engine spec because Spec 188 is YAML-only and cannot add compiler/runtime support. The Phase 3 proof slice (Train+Govern) does not exercise them — they are sequenced as Phase 1b (§8) so the paradigm proof can be decomposed and landed first.

### 4.3 `PlanExecutionState` (cross-microturn)

A serializable, deterministic runtime object held by `PolicyAgent` and keyed by `turnId`+`seatId` (alongside `previewWideningState`):

- `selectedTemplate`, `intent`, committed `roleBindings`, `nextStepIndex`, `fallbackHistory`, `deviations`.
- Created at the turn's `actionSelection` frame; cleared at `turnRetirement` or `turnId` change. MUST round-trip canonically (Foundation #8) and MUST be reconstructable on replay.

### 4.4 Bounded plan proposer/evaluator

At a player's `actionSelection` frame:

1. evaluate active doctrine carriers (re-homed Spec 182 modules) to gather candidate templates;
2. match each template's `root` against the published legal root actions;
3. bind role selectors with bounded top-K expansion;
4. score each candidate plan via leaf scorers (selector quality, demoted considerations) and the posture hook;
5. select by priority tier, guardrails, posture, then deterministic stable key;
6. record `PlanExecutionState`.

All enumeration is bounded by **named cap classes** (Foundation #10), statically declared and recorded in reproducibility metadata: `maxActiveDoctrines`, `maxTemplatesPerDoctrine`, `maxRootCandidates`, `maxBindingsPerRole`, `maxPlanInstances`, `maxPlanSteps`. Cap-class names follow the Spec 164 registry pattern.

### 4.5 Microturn execution controller + fallback ladder

At each subsequent microturn:

1. read `input.microturn.legalActions` (the live frontier);
2. identify the next expected step / open role from `PlanExecutionState`;
3. match published legal options to the role's `match` pattern; if an exact match exists, select it;
4. if not, re-run the role selector over the actual legal options;
5. if still none, descend the bounded fallback ladder: rebind uncommitted role → next-best selector candidate → skip optional step → alternate template (same doctrine) → fallback doctrine → primitive consideration policy → deterministic stable tie-break / authored `pass` (Foundation #18 — never `noLegalMoves` when a `pass` fallback exists);
6. emit a deterministic trace entry (expected step, actual frontier, selected option, match quality, deviation, fallback reason).

The controller **never constructs a move outside `legalActions`** and never asserts legality. The fallback ladder is bounded by a max-attempts cap (no unbounded loop).

### 4.6 Demotion of flat considerations

The v2 top-level consideration-scoring pass is retired as the *primary* selector of the microturn. Considerations remain compilable and are reachable as: (a) quality components inside role selectors, (b) leaf terms inside the posture hook, and (c) the **primitive policy** that the fallback ladder bottoms out in. The migration deletes the v2 primary path; it does not keep a compatibility shim (Foundation #14).

Crucially, this is **behavior-preserving for profiles that do not adopt `planTemplates`**: such a profile matches no template at the `actionSelection` frame and falls through to the primitive consideration policy (§4.5 ladder, §7), which scores the published frontier exactly as the v2 primary pass did. The migration is therefore additive — only profiles that gain plans change behavior. The single source-code driver being re-homed is the consideration-reduction loop in `evaluatePolicyMoveCore` (`policy-eval.ts`), reached through the single action-selection entry point `evaluatePolicyMove`; there is no second scoring path to migrate.

### 4.7 Compiler validation (Foundation #12)

The compiler validates everything statically knowable: unique doctrine/template ids; every role references an existing selector; every role constraint references a bound or forward-declared role; every selector source is finite and capped; every subset/product/routePairs selector has max bounds; every template has a max step count; every fallback target exists; no fallback cycle unless bounded by explicit max attempts; every deterministic order has a stable tie-breaker; all cap classes named and within allowed values; all trace labels are deterministic strings; no game-specific engine schema (Foundation #6). Compiler error messages name the offending role/template (e.g. "`roles.governSpace` references role `trainSpace`, but `trainSpace` is not bound before this constraint"), per the source proposal §5.8.

### 4.8 Trace contract (plan section)

The agent decision trace gains a top-level `plan` section: selected/active/rejected doctrines (with reasons), selected template + intent, role bindings, alternatives, the per-microturn `{ expectedStep, matchedRole, selectedLegalOption, match: exact|reselected|fallback, deviation }`, and posture status. Trace is deterministic and replay-stable.

## 5. Data flow

`actionSelection` frame → plan proposer (§4.4) commits a `PlanExecutionState` → each microturn the execution controller (§4.5) maps the live frontier to the next role/step, selecting one published legal option → trace accrues per microturn → state cleared at `turnId` boundary.

## 6. Determinism and replay (Foundations #8, #16)

Same GameDef + state + seed + policy fingerprint yields a byte-identical plan trace: plan proposal order, selector rankings, role bindings, and fallback decisions are all finite, sorted, capped, and replayable. `PlanExecutionState` serialization is canonical. New determinism tests for plan state and role binding live under `packages/engine/test/determinism/`; profile-specific witnesses live under `policy-profile-quality/` (Appendix distinction preserved).

## 7. Edge cases

- **Frontier diverges from plan** (state-dependent branch the proposer did not foresee): controller re-selects via the role selector, then the fallback ladder; deviation traced.
- **No template matches the published roots**: fall through to the primitive consideration policy (which is guaranteed to score the published frontier exactly as v2 did).
- **Fallback exhaustion**: deterministic stable tie-break, else authored `tags:[pass]` fallback (Foundation #18); never a client-visible `noLegalMoves` when a pass exists.
- **Preview unavailable for posture hook**: treated as a non-`ready` status; the hook contributes its declared fallback (Foundation #20); never silently coerced.
- **Plan spans a microturn whose decision is chance/kernel-owned**: controller does not consult; `PlanExecutionState` advances when the player frame returns.

## 8. Phases & acceptance criteria

**Phase 1 — Plan IR + compiler (`schemaVersion: 3`).** Acceptance: (a) `planTemplates` and role-binding selectors compile (over the existing `collection`/`product`/`microturnOptions`/`candidateParams` sources); (b) all §4.7 diagnostics fire on crafted invalid specs with role/template-named messages; (c) compiling the same doc twice yields byte-identical GameDef.

**Phase 1b — `routePairs` and `subset` selector sources.** The two new selector-source kinds (§4.2), separable because the Phase 3 proof slice does not need them and Spec 188 (YAML-only) depends on them. Acceptance: (a) `routePairs` and `subset` sources compile with mandatory max bounds (`maxPairs`, `min`/`max`/`beamWidth`); (b) the §4.7 cap-bounds diagnostics fire when bounds are absent; (c) deterministic, capped enumeration.

**Phase 2 — Plan runtime + cross-microturn execution.** Acceptance: (a) `PlanExecutionState` persists across microturns within a `turnId` and clears at the boundary; (b) every selected microturn decision is in the published `legalActions`; (c) the fallback ladder terminates within its cap and bottoms out at stable tie-break / authored pass; (d) plan trace is emitted and replay-identical; (e) **v2-equivalence**: a profile with only `considerations` (no `planTemplates`) produces byte-identical decisions to current v2 behavior, proving the demotion/migration is non-breaking (Foundations #14, #16).

**Phase 3 — ARVN Train+Govern proof slice.** Acceptance: (a) one ARVN `arvn.trainGovern` template with `trainSpace`/`governSpace` role selectors and a `notEqual` cross-role constraint; (b) a constructed scenario witness asserting Train and Govern bind different spaces; (c) a witness asserting graceful fallback when the Govern frontier is unavailable; (d) determinism + legality-frontier compliance witnesses. "If this slice cannot be implemented cleanly, the architecture is wrong" (source proposal §11.5).

## 9. Test plan

- Compiler: golden GameDef + determinism (compile-twice) + the §4.7 authoring-error corpus.
- Runtime: legality-frontier invariant (selected ∈ `legalActions`) as an architectural-invariant test; `PlanExecutionState` lifecycle; fallback-ladder termination; plan-trace determinism/replay.
- Profile-quality (warning-class, `policy-profile-quality/`): the ARVN Train+Govern separation witness and fallback witness (Appendix: these are quality signals, not engine determinism proofs).
- Migration scope: the v2-path retirement adds *only* net-new plan/role-binding tests. Existing consideration-only profiles — and the ~20 test files referencing `considerations`/`strategyModules`/`selectors` — require no migration, because they exercise the unchanged primitive fallback (§4.6); the Phase 2(e) v2-equivalence witness proves this. Test-migration scope is therefore additive, not a rewrite of the existing agent test corpus.

## 10. Foundation alignment

#1 (generic plan IR, no game words in engine) · #4 (plan consumes observer-safe projection; omniscient only in marked analysis profiles) · #5/#18/#19 (advisory plan, atomic execution, no published compound shape, pass fallback) · #8/#16 (deterministic, replay-proven plan state) · #10 (named, statically-declared cap classes; bounded fallback) · #12 (full static validation) · #14 (v2 primary path deleted, no shim) · #15 (root-cause: fix the evaluation unit, not a preview band-aid) · #20 (preview status honesty in the posture hook).

## 11. Reassessment of the external proposal (`reports/ai-agent-policy-overhaul-first-iteration.md`)

**Kept:** the `AdvisoryTurnPlan`-as-primary-object thesis; plan templates with timing/role-steps; role selectors; cross-microturn `PlanExecutionState`; bounded fallback ladder; advisory-only execution through the atomic frontier; the ARVN Train+Govern smallest coherent slice.

**Corrected:** (1) the "weights have failed" diagnosis — the competence report is itself weight-based; the unit, not weights, is the defect, so considerations are demoted not abolished. (2) the "doctrine modules are a new layer" framing — they reuse Spec 182 modules as doctrine carriers; selectors reuse Spec 181, gaining role binding. (3) `schemaVersion` is `2` today, not "v2 sidecar" — v3 is a migration, no `agentsV3` shim (Foundation #14). (4) the proposal omitted that the campaign's actual blocker was the Spec 185 preview gap, now fixed; this spec does not relitigate that.

**Rejected / deferred:** runtime HTN/GOAP/MCTS search (Non-Goals); deep posture-preview and ally-rival metadata → Spec 187; multi-faction migration and sequencing library → Spec 188; evolution-loop overhaul (the rejected Spec 183) → deferred until the architecture is proven.

## 12. Out of scope (named follow-on specs)

- **Spec 187** — whole-turn posture evaluation over Spec 185's honest preview; ally-as-rival relationship metadata (competence report §5/§6.5).
- **Spec 188** — FITL four-faction plan migration + sequencing template library (YAML-only; consumes this spec's `routePairs`/`subset` selector sources, which therefore must land here — see §4.2 and Phase 1b).
- **Deferred** — structure-first evolution loop (reassess the rejected `archive/specs/183`).

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-20:

- [`archive/tickets/186ADVTURNPLAN-001.md`](../archive/tickets/186ADVTURNPLAN-001.md) — Plan-template & role-binding selector IR + compilation (covers §4.1, §4.2, Phase 1)
- [`archive/tickets/186ADVTURNPLAN-002A.md`](../archive/tickets/186ADVTURNPLAN-002A.md) — Plan cap/max-step IR prerequisite for static validation (covers §4.4 cap metadata needed by §4.7)
- [`archive/tickets/186ADVTURNPLAN-002.md`](../archive/tickets/186ADVTURNPLAN-002.md) — Compiler validation diagnostics (covers §4.7)
- [`archive/tickets/186ADVTURNPLAN-003.md`](../archive/tickets/186ADVTURNPLAN-003.md) — `routePairs` + `subset` selector sources (covers §4.2, Phase 1b)
- [`archive/tickets/186ADVTURNPLAN-004.md`](../archive/tickets/186ADVTURNPLAN-004.md) — `PlanExecutionState` cross-microturn lifecycle (covers §4.3)
- [`archive/tickets/186ADVTURNPLAN-005.md`](../archive/tickets/186ADVTURNPLAN-005.md) — Bounded plan proposer/evaluator + plan trace (covers §4.4, §4.8)
- [`tickets/186ADVTURNPLAN-006.md`](../tickets/186ADVTURNPLAN-006.md) — Execution controller + fallback ladder + consideration demotion (covers §4.5, §4.6, Phase 2)
- [`tickets/186ADVTURNPLAN-007.md`](../tickets/186ADVTURNPLAN-007.md) — ARVN Train+Govern proof slice (covers §8 Phase 3)

Infrastructure (engine/compiler) commits split from any policy-YAML commits.

## Outcome

In progress:
- `186ADVTURNPLAN-001` completed and archived on 2026-05-20. It landed the plan-template/role-binding IR, schemaVersion 3 migration, compiler lowering, schema artifact update, and regression coverage for deterministic compilation.
- `186ADVTURNPLAN-002A` completed and archived on 2026-05-20. It landed the generic authored/compiled cap/max-step IR prerequisite before `186ADVTURNPLAN-002` validates the cap-class and max-step diagnostics required by Foundations #10/#12.
- `186ADVTURNPLAN-002` completed and archived on 2026-05-20. It landed compiler validation diagnostics for plan-template role references, cap classes/max steps, fallback targets/cycles, stable ordering, and deterministic diagnostic replay coverage.
- `186ADVTURNPLAN-003` completed and archived on 2026-05-20. It landed bounded `routePairs` and `subset` selector-source support, cap diagnostics, deterministic runtime enumeration, schema artifact regeneration, and focused architectural-invariant coverage.
- `186ADVTURNPLAN-004` completed and archived on 2026-05-20. It landed the advisory `PlanExecutionState` lifecycle substrate, agent-owned state map, canonical serialization helpers, and focused lifecycle coverage.
- `186ADVTURNPLAN-005` completed and archived on 2026-05-20. It landed the advisory plan proposer, proposal-side plan trace, selected-plan `PlanExecutionState` commit, deterministic cap coverage, and focused replay witnesses.
- Remaining active tickets cover execution controller/v2 retirement and FITL authoring.
