# Spec 197 — Doctrine-Gated Plan-Template Eligibility

**Status**: PROPOSED
**Priority**: High — the verified architectural gap is that strategy modules (the "doctrine" carriers per Spec 186 §11) influence the *scoring tier* of plan-template candidates via `highestDoctrineTier`, but they do not *filter* the candidate set. Plan templates and strategy modules are independent arrays in the agent profile; their connection is purely semantic. The second-iteration audit's claim "doctrine is still scalar bias" is overstated (~60% of FITL modules are condition-bearing per verification), but its underlying observation — that doctrine does not gate plan-family availability — is correct and architecturally meaningful.
**Complexity**: M — extends `StrategyModuleDef` schema with optional gating fields, adds an eligibility-filter pass to `plan-proposal.ts`, and migrates a representative slice of the FITL ARVN profile to demonstrate doctrine-driven plan-family activation. No new selector sources, no constraint changes, no controller changes.
**Date**: 2026-05-26
**Dependencies**:
- `archive/specs/186-advisory-turn-plan-architecture-core.md` (COMPLETED — plan-template IR, strategy module activation, `highestDoctrineTier`)
- `archive/specs/187-whole-turn-posture-and-ally-rival-metadata.md` (COMPLETED — posture + relationship metadata that complements doctrine)
- `archive/specs/190-plan-primary-root-selection.md` (COMPLETED — plan root authority; doctrine gating is meaningful only when the plan chooses the root)

**Trigger report**:
- `reports/ai-agent-policy-overhaul-second-iteration.md` (ChatGPT-Pro second iteration, 2026-05-26). This spec adopts the audit's *load-bearing core* of proposal #1 (doctrine should constrain plan families) and rejects the broader reframe (promote `strategyModules` to a separate "doctrine" type), preserving Spec 191 §11's Foundation #14 churn rejection. The work is targeted decoupling-fix, not architectural replacement.

**Ticket namespace**: `197DOCPLANELIG` (proposed)

---

## 1. Goal

Make doctrine activation a *filter* on plan-template candidates, not only a scoring-tier adjustment. Concretely:

1. **Extend `StrategyModuleDef`** with three optional gating fields:
   - `enablesPlanTemplates: [planTemplateId]` — when this module is active, named templates become eligible (default: all templates are eligible regardless of active doctrine).
   - `enablesPlanTemplateTags: [tag]` — when this module is active, templates carrying any named tag become eligible (parallel to `enablesPlanTemplates` but tag-driven, mirroring how `applies.actionTags` already filters root candidates).
   - `suppressesPlanTemplates: [planTemplateId]` — when this module is active, named templates are excluded from the candidate set, *even if* another active module enables them.
2. **Add an eligibility-filter pass to the plan proposer** (`plan-proposal.ts:94-151`): before scoring plan-template candidates, intersect them with the union of enabled templates and subtract the union of suppressed templates from the active strategy modules.
3. **Compiler validates** that every referenced template id / tag exists; unknown ids/tags fail compile with a module-named diagnostic (Foundation #12).
4. **Migrate a representative ARVN slice** (e.g., `arvn.regimePatronageBeforeCoup` doctrine → `arvn.trainGovern` / `arvn.assaultRaid` templates) to demonstrate doctrine-driven activation and exercise the filter behavior on FITL convergence witnesses.

## 2. Non-Goals

- **No `strategyModules` reframe.** Spec 186 §11 already decided doctrine reuses strategy modules as carriers; Spec 191 §11 reaffirmed that reframe is Foundation #14 churn. This spec adds *fields*, not a new type.
- **No removal of scalar within-tier scoring.** `priorityTier` is already the first lexicographic key via `compareAlternatives` (`plan-proposal.ts:588-592`); within-tier summation of `roleScore + considerationScore + posture.scoreDelta` is preserved.
- **No new doctrine concept beyond plan-template gating.** Other source-proposal "doctrine" responsibilities (relationship posture, target priority families, guardrail activation) are either already landed (Spec 187) or remain authored independently per Spec 186 §11.
- **No controller / execution / fallback changes.** Plan-controller behavior (`plan-controller.ts`) is unchanged; this spec affects *which* templates the proposer considers, not how the controller executes the chosen one.
- **No FITL profile rewrite beyond the demonstration slice.** Migrating every ARVN/US/NVA/VC strategy module to use the new gating is out of scope; the P4 deliverable is one ARVN slice as the architectural exemplar.

## 3. Context (verified against codebase, 2026-05-26)

- **`StrategyModuleDef` schema** — `packages/engine/src/cnl/game-spec-doc.ts:752-783` declares: `id`, `traceLabel`, `when`, `applies` (`scopes`, `actionTags`, `decisionKinds`), `priority` (`tier`, optional value expr), `selectors`, `scoreGroups`, `guardrailIds`, `fallback`. No template-gating fields exist.
- **Active-doctrine evaluation** — `packages/engine/src/agents/plan-proposal.ts:447-454`:
  ```ts
  function activeDoctrineIds(input: PlanProposalInput): readonly string[] {
    return input.profile.plan.strategyModules
      .filter((module) => evaluateStrategyModule(input, module).active)
      .map((module) => module.id);
  }
  ```
  Active modules are collected; their IDs propagate to `priorityTier` via `highestDoctrineTier()` (`plan-proposal.ts:474-487`) and to the plan trace's `activeDoctrines` field.
- **Plan-template iteration is independent of active doctrines** — `plan-proposal.ts:94-151` iterates `input.profile.plan.planTemplates` without consulting `activeDoctrineIds()` for candidate filtering. The trace records active doctrines, but the candidate set is the entire `planTemplates` array, gated only by `applies.actionTags` filtering on the root candidate (`moduleAppliesToRoot` at `plan-proposal.ts:489-498`).
- **Verification finding (per parallel agent)** — "Strategy modules do NOT directly suppress or activate plan templates. Instead: (1) Plan template selection is independent. (2) Strategy modules influence candidate SCORING via `scoreGroups` contributions. (3) The link is INDIRECT: Active doctrines affect the priorityTier assigned to plan root candidates." This is the gap this spec closes.
- **FITL doctrine modules (representative sample)** — `data/games/fire-in-the-lake/92-agents.md:1401-1411` shows `buildPoliticalEngine`:
  ```yaml
  buildPoliticalEngine:
    when:
      and:
        - { ref: condition.selfPoliticalEngineBehind.satisfied }
        - not: { ref: condition.militaryBoardCollapsing.satisfied }
        - or: [ { gt: [coinControlPop, 20] }, { gte: [projectedMargin, -7] } ]
    applies:
      scopes: [move]
      actionTags: [train]
    priority: { tier: 30 }
  ```
  This module *should* enable templates like `arvn.trainGovern` and `arvn.trainTransport` (Train-rooted compositions) while *suppressing* templates that don't serve political engine building (e.g., aggressive `arvn.assaultRaid`). Today, all templates remain candidates; the priority tier of 30 only adjusts ranking.
- **Tag-driven activation precedent** — `applies.actionTags` already filters strategy modules by root candidate tag. Adding `enablesPlanTemplateTags` (which filters *templates* by tag) is symmetric and reuses the same authoring vocabulary.
- **Plan-template tag surface** — `packages/engine/src/cnl/compile-agent-plan-templates.ts:19-54` validates plan templates; templates carry a `tags` field today (e.g., `tags: [tactical, political]` is authorable in the schema), though FITL templates author it sparsely. This spec does not introduce template tagging — it consumes the existing field.

## 4. Architecture

### 4.1 `StrategyModuleDef` schema extension

Extend the schema in `game-spec-doc.ts` and the compiled IR in `kernel/types-core.ts`:

```ts
interface StrategyModuleDef {
  // ... existing fields ...
  readonly enablesPlanTemplates?: readonly string[];
  readonly enablesPlanTemplateTags?: readonly string[];
  readonly suppressesPlanTemplates?: readonly string[];
}
```

All three fields are optional. The default (all absent) preserves current behavior: every active module makes every template eligible.

**Implicit semantics**:
- If *no* active module declares any `enablesPlanTemplates` / `enablesPlanTemplateTags`, the candidate set is the full `planTemplates` array (backwards-compatible default).
- If *any* active module declares enables-set, the eligible set is the *union* of enables-sets across all active modules. Templates not in the union are excluded.
- `suppressesPlanTemplates` is applied last: a template suppressed by *any* active module is removed, regardless of other modules enabling it.

This is deliberately a "default-permissive, opt-in restrictive" model: existing FITL profiles continue working untouched; doctrine authors opt into gating by declaring fields.

### 4.2 Eligibility filter in plan proposer

Add a new step to `plan-proposal.ts` between active-module collection and template iteration:

```ts
function eligiblePlanTemplates(
  input: PlanProposalInput,
  activeModules: readonly CompiledStrategyModule[],
): readonly CompiledPlanTemplate[] {
  const enables = collectEnables(activeModules);
  const suppresses = collectSuppresses(activeModules);
  const candidates = input.profile.plan.planTemplates;
  if (enables.templates.size === 0 && enables.tags.size === 0) {
    // default-permissive
    return candidates.filter((tpl) => !suppresses.has(tpl.id));
  }
  return candidates.filter((tpl) =>
    (enables.templates.has(tpl.id) || tpl.tags.some((t) => enables.tags.has(t)))
    && !suppresses.has(tpl.id)
  );
}
```

The filter runs once per microturn, before scoring. Traces record the filtered-out template ids and the gating module ids so the proposal decision is contrastive (per Foundation #20's preview-provenance shape).

### 4.3 Compiler validation

`validate-agent-strategy-modules.ts` (or the closest existing validator surface) gains:

- Every id in `enablesPlanTemplates` / `suppressesPlanTemplates` references an existing template in the same profile's `planTemplates` array. Mismatch fails compile with a module-named diagnostic.
- Every tag in `enablesPlanTemplateTags` references at least one template's `tags` field. (A tag with zero matching templates is an authoring error.)
- A single module that both enables and suppresses the same template id fails compile (authoring inconsistency).
- The compiler does NOT enforce non-empty eligibility sets per module — a module that declares `enablesPlanTemplates: [arvn.trainGovern]` only is valid; its activation simply restricts the candidate set to that one template.

### 4.4 FITL ARVN demonstration slice

Migrate `arvn.regimePatronageBeforeCoup` (or the equivalent representative module — chosen at implementation time based on which slice exercises the filter most cleanly) to declare:

```yaml
arvn.regimePatronageBeforeCoup:
  when: ...
  applies: { scopes: [move], actionTags: [train, govern] }
  priority: { tier: 40 }
  enablesPlanTemplates:
    - arvn.trainGovern
    - arvn.patrolGovern
  suppressesPlanTemplates:
    - arvn.assaultRaid   # aggressive plan family suppressed while building patronage
```

This demonstrates the architecture on the concrete ARVN competence requirement from `reports/fitl-competent-agent-ai.md` §3 (ARVN: "Train + Govern, Patrol + Govern … Avoid simply serving US Support").

A FITL architectural-invariant witness asserts: when `arvn.regimePatronageBeforeCoup` is active, `arvn.assaultRaid` is not in the proposer's candidate set; when inactive, it is.

## 5. Determinism and replay (Foundations #8, #16)

- Eligibility filter is pure over `(activeModules, planTemplates)`; deterministic ordered output.
- Plan traces record filtered-out template ids and gating module ids; traces replay byte-identically.
- `pnpm turbo build` twice produces byte-identical GameDef.

## 6. Edge cases

- **No active strategy modules** — eligibility filter degenerates to identity; full `planTemplates` candidate set.
- **Active modules with no gating fields** — preserves current behavior (default-permissive).
- **Cyclic suppression** — module A suppresses template X enabled by module B, both active: X is excluded (suppression wins per §4.1). Trace records both module ids as the gating provenance.
- **Eligibility filter yields empty set** — proposer falls through to the existing `status: 'no-template-matched'` path; scalar root selection takes over (Spec 190's fallback floor). No new failure mode introduced.
- **Template tag declared by zero templates** — compile-time error per §4.3 (authoring inconsistency).

## 7. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P1** | Schema + compiler validation (§4.1, §4.3) | `StrategyModuleDef` extended in `game-spec-doc.ts` + `kernel/types-core.ts`; validator rejects unknown template/tag refs and self-contradictory modules; fixture with each new field compiles; determinism preserved | S–M |
| **P2** | Eligibility filter in proposer (§4.2) | `eligiblePlanTemplates` implemented; trace records filtered-out templates + gating modules; default-permissive behavior preserved on FITL profile pre-migration (proves no regression); replay byte-identical | M |
| **P3** | FITL ARVN demonstration slice (§4.4) | One representative ARVN module migrated; witness asserts gating behavior (active → restricted; inactive → unrestricted); FITL convergence witnesses unchanged for unaffected templates | S–M |
| **P4** | Architectural-invariant tests | Cross-profile property test: any active module with `enables*` fields restricts the candidate set; suppress beats enable; empty-eligibility falls through to scalar; trace provenance complete | S |

## 8. Test plan

- **Compiler error corpus** (architectural-invariant): unknown `enablesPlanTemplates` id; unknown `enablesPlanTemplateTags` tag (no template carries it); self-contradictory module (enables and suppresses same id). Each fails with module-named diagnostic.
- **Proposer architectural-invariant**: synthesized profiles exercise each filter shape (enables-only, suppress-only, enables+suppress union, empty result fallback).
- **FITL convergence witness**: ARVN scenario where `arvn.regimePatronageBeforeCoup` is active proves `arvn.assaultRaid` is filtered out of candidates; an inverse scenario (module inactive) proves it returns.
- **Trace correspondence**: golden trace pins the new "filtered-out templates" + "gating modules" trace fields.
- **Determinism**: build twice byte-identical; plan-trace replay preserved.

## 9. Foundation alignment

#1 (engine-agnostic — gating is generic over template ids/tags; no game-specific kinds) · #12 (compiler validates everything knowable from spec) · #14 (no compatibility shim — default-permissive behavior is the *defined* semantic for absent fields, not a fallback) · #15 (root-cause: closes the doctrine-template decoupling gap) · #16 (witness-tested across compiler + proposer + FITL slice) · #19 (microturn protocol unchanged; controller behavior unchanged).

## 10. Reassessment of source proposal (`reports/ai-agent-policy-overhaul-second-iteration.md`)

**Adopted (this spec's slice):**
- §3 (proposal #1's *load-bearing core*: doctrine should constrain plan families) → §4.1 + §4.2.

**Corrected:**
- The audit's framing "doctrine is still not first-class enough" / "modules look like weighted action preferences with constant values" is overstated; verification found ~60% of FITL modules are condition-bearing. This spec addresses the actual gap (decoupling between doctrine and plan-template candidacy) rather than the framed one (perceived scalar-bias). The fix is *fields on existing modules*, not a new type.
- The audit's framing that this work requires a "DPRT-P" reframe is rejected — this is targeted decoupling, not architectural replacement.

**Deferred (named follow-ups, not in this spec):**
- Lexicographic plan-family selection refinement (proposal #6) — `priorityTier` is already the first lexicographic key; within-tier scalar summation is preserved here. Finer-grained tiering is uncommitted until a concrete witness shows scalar-soup harm post-eligibility-gating.
- Other proposals owned by sibling specs (constraints/route → Spec 196; conformance/observer → Spec 198; compound availability → Spec 199).

**Rejected (with rationale):**
- "Promote `strategyModules` into a separate doctrine type" (proposal #1 reframe) — Spec 186 §11 and Spec 191 §11 already settled this as Foundation #14 churn. The architectural gap that motivated the reframe (decoupling) is addressed by fields, not by retyping.
- "Replace scoreGroups / leaf considerations with lexicographic local target scoring" — Spec 186 §11 already corrected this by demoting considerations to leaf scorers; further removal is unjustified by current evidence.

## 11. Out of scope (named follow-on / sibling)

- **Spec 196** — generic role constraints + authored route/map semantics (mutually independent).
- **Spec 198** — cross-game conformance corpus + observer-safety proofs (mutually independent).
- **Spec 199** — compound availability at root proposal (mutually independent).
- Migration of US/NVA/VC strategy modules to use eligibility gating — uncommitted; the architectural exemplar lands with ARVN, others migrate as concrete competence-test signals demand.
- Per-target-role doctrine influence (a doctrine restricts which *roles* a template can bind) — uncommitted; current scope is template-level gating only.
