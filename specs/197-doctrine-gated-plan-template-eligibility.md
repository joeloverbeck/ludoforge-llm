# Spec 197 — Doctrine-Gated Plan-Template Eligibility

**Status**: PROPOSED
**Priority**: High — the verified architectural gap is that strategy modules (the "doctrine" carriers per Spec 186 §11) influence the *scoring tier* of plan-template candidates via `highestDoctrineTier`, but they do not *filter* the candidate set. Plan templates and strategy modules are independent arrays in the agent profile; their connection is purely semantic. The second-iteration audit's claim "doctrine is still scalar bias" is overstated (~69% of FITL modules are condition-bearing per verification — 42 of ~61), but its underlying observation — that doctrine does not gate plan-family availability — is correct and architecturally meaningful.
**Complexity**: M — extends `StrategyModuleDef` schema with optional gating fields, adds an eligibility-filter pass to `plan-proposal.ts`, and migrates a representative slice of the FITL ARVN profile to demonstrate doctrine-driven plan-family activation. No new selector sources, no constraint changes, no controller changes. The new fields are additive and optional — existing FITL profile and test fixtures need no migration.
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

1. **Extend `StrategyModuleDef`** with two optional gating fields:
   - `enablesPlanTemplates: [planTemplateId]` — when this module is active, named templates become eligible (default: all templates are eligible regardless of active doctrine).
   - `suppressesPlanTemplates: [planTemplateId]` — when this module is active, named templates are excluded from the candidate set, *even if* another active module enables them.
2. **Add an eligibility-filter pass to the plan proposer** (`plan-proposal.ts:94-142`): before iterating template candidates for scoring, intersect them with the union of enabled templates and subtract the union of suppressed templates from the active strategy modules.
3. **Compiler validates** that every referenced template id exists; unknown ids fail compile with a module-named diagnostic (Foundation #12).
4. **Migrate a representative ARVN slice** (the existing `buildPoliticalEngine` doctrine → `arvn.trainGovern` / `arvn.patrolGovern` templates while suppressing `arvn.assaultRaid`) to demonstrate doctrine-driven activation and exercise the filter behavior on FITL convergence witnesses.

Tag-driven gating (`enablesPlanTemplateTags`) was considered and explicitly deferred — see §11.

## 2. Non-Goals

- **No `strategyModules` reframe.** Spec 186 §11 already decided doctrine reuses strategy modules as carriers; Spec 191 §11 reaffirmed that reframe is Foundation #14 churn. This spec adds *fields*, not a new type.
- **No removal of scalar within-tier scoring.** `priorityTier` is already the first lexicographic key via `compareAlternatives` (`plan-proposal.ts:599-603`); within-tier summation of `priorityTier + roleScore + considerationScore + posture.scoreDelta` (`plan-proposal.ts:132`) is preserved.
- **No new doctrine concept beyond plan-template gating.** Other source-proposal "doctrine" responsibilities (relationship posture, target priority families, guardrail activation) are either already landed (Spec 187) or remain authored independently per Spec 186 §11.
- **No controller / execution / fallback changes.** Plan-controller behavior (`plan-controller.ts`) is unchanged; this spec affects *which* templates the proposer considers, not how the controller executes the chosen one.
- **No FITL profile rewrite beyond the demonstration slice.** Migrating every ARVN/US/NVA/VC strategy module to use the new gating is out of scope; the P4 deliverable is one ARVN slice as the architectural exemplar.
- **No plan-template `tags` field added.** A `tags` field does not exist on `GameSpecPlanTemplateDef` or `CompiledPlanTemplate` today; this spec does not add one. Tag-driven gating is deferred (§11).

## 3. Context (verified against codebase, 2026-05-26)

- **`GameSpecStrategyModuleDef` schema** — `packages/engine/src/cnl/game-spec-doc.ts:752-783` declares: `traceLabel`, `when`, `applies` (`scopes`, `actionTags`, `decisionKinds`), `priority` (`tier`, optional value expr), `selectors`, `scoreGroups`, `guardrailIds`, `fallback`. The `id` is the record key, not an explicit field. No template-gating fields exist.
- **Compiled IR** — `packages/engine/src/kernel/types-core.ts:828-840` declares `StrategyModuleDef` with all schema fields plus compiled extras (`id`, `costClass`, `dependencies`). This is the type used by `plan-proposal.ts`. A separate `CompiledAgentStrategyModule` exists at `types-core.ts:1279-1288` as a per-profile sub-shape but is not the type the proposer consumes.
- **Active-doctrine evaluation** — `packages/engine/src/agents/plan-proposal.ts:458-465`:
  ```ts
  function activeDoctrineIds(input: PlanProposalInput): readonly string[] {
    return input.profile.plan.strategyModules
      .filter((module) => evaluateBooleanExpr(module.when, ...))
      .map((module) => module.id)
      .sort(compareStable);
  }
  ```
  Active modules are collected via direct `when` evaluation (no `.active` boolean on modules); their IDs propagate to `priorityTier` via `highestDoctrineTier()` (`plan-proposal.ts:485-498`) and to the plan trace's `activeDoctrines` field.
- **Plan-template iteration is independent of active doctrines** — `plan-proposal.ts:94-142` iterates `input.profile.plan.planTemplates` without consulting `activeDoctrineIds()` for candidate filtering. The trace records active doctrines, but the candidate set is the entire `planTemplates` array, gated only by `applies.actionTags` filtering on the root candidate (`moduleAppliesToRoot` at `plan-proposal.ts:500-509`).
- **Verification finding** — "Strategy modules do NOT directly suppress or activate plan templates. Instead: (1) Plan template selection is independent. (2) Strategy modules influence candidate SCORING via the `priorityTier` contribution at `plan-proposal.ts:132`. (3) The link is INDIRECT: Active doctrines affect the priorityTier assigned to plan root candidates." This is the gap this spec closes.
- **FITL doctrine modules (representative sample)** — `data/games/fire-in-the-lake/92-agents.md:1457-1474` shows `buildPoliticalEngine` (simplified — actual YAML uses `{ ref: feature.coinControlPop }` / `{ ref: feature.projectedSelfMargin }` for the numeric refs):
  ```yaml
  buildPoliticalEngine:
    traceLabel: "build political engine"
    when:
      and:
        - { ref: condition.selfPoliticalEngineBehind.satisfied }
        - not: { ref: condition.militaryBoardCollapsing.satisfied }
        - or:
            - gt: [{ ref: feature.coinControlPop }, 20]
            - gte: [{ ref: feature.projectedSelfMargin }, -7]
    applies:
      scopes: [move]
      actionTags: [train]
    priority: { tier: 30 }
  ```
  This module *should* enable templates like `arvn.trainGovern` and `arvn.patrolGovern` (political-engine-building compositions) while *suppressing* templates that don't serve political engine building (e.g., aggressive `arvn.assaultRaid`). Today, all templates remain candidates; the priority tier of 30 only adjusts ranking.
- **`applies.*` family** — `moduleAppliesToRoot` (`plan-proposal.ts:500-509`) checks `applies.scopes` (must include 'move') and `applies.actionTags` (empty → matches all; non-empty → root must carry at least one). `applies.decisionKinds` is declared in `ModuleAppliesSpec` (`types-core.ts:794-798`) but unused in plan-proposal — noted for implementer context.
- **Tag-driven activation was considered and deferred** — A symmetric `enablesPlanTemplateTags` mechanism (mirroring how `applies.actionTags` filters root candidates by tag) would require adding a `tags` field to `GameSpecPlanTemplateDef` and `CompiledPlanTemplate`. Neither type carries `tags` today, and no FITL template authors tags. Per YAGNI (and §10's own discipline), tag-driven gating is deferred until a concrete authoring need surfaces. Id-list gating via `enablesPlanTemplates` covers the architectural intent for the initial slice.

## 4. Architecture

### 4.1 `StrategyModuleDef` schema extension

Extend both the YAML schema in `game-spec-doc.ts` and the compiled IR in `kernel/types-core.ts`:

```ts
interface GameSpecStrategyModuleDef {
  // ... existing fields ...
  readonly enablesPlanTemplates?: readonly string[];
  readonly suppressesPlanTemplates?: readonly string[];
}

interface StrategyModuleDef {        // compiled IR
  // ... existing fields ...
  readonly enablesPlanTemplates: readonly PlanTemplateId[];   // empty when absent in spec
  readonly suppressesPlanTemplates: readonly PlanTemplateId[]; // empty when absent in spec
}
```

Both fields are optional in the schema; the compiled IR normalizes absent to empty arrays. The default (all empty) preserves current behavior: every active module makes every template eligible.

**Implicit semantics**:
- If *no* active module declares any `enablesPlanTemplates`, the candidate set is the full `planTemplates` array (backwards-compatible default).
- If *any* active module declares an enables-set, the eligible set is the *union* of enables-sets across all active modules. Templates not in the union are excluded.
- `suppressesPlanTemplates` is applied last: a template suppressed by *any* active module is removed, regardless of other modules enabling it.

This is deliberately a "default-permissive, opt-in restrictive" model: existing FITL profiles continue working untouched; doctrine authors opt into gating by declaring fields.

### 4.2 Eligibility filter in plan proposer

Add a new step to `plan-proposal.ts` between `activeDoctrineIds()` collection (line 100) and the template iteration loop (line 106):

```ts
function eligiblePlanTemplates(
  input: PlanProposalInput,
  activeDoctrines: readonly ModuleId[],
): readonly PlanTemplateId[] {
  const activeIdSet = new Set(activeDoctrines);
  const activeModules = input.profile.plan.strategyModules.filter((m) =>
    activeIdSet.has(m.id),
  );
  const enables = new Set<PlanTemplateId>();
  const suppresses = new Set<PlanTemplateId>();
  let anyEnablesDeclared = false;
  for (const m of activeModules) {
    if (m.enablesPlanTemplates.length > 0) {
      anyEnablesDeclared = true;
      for (const t of m.enablesPlanTemplates) enables.add(t);
    }
    for (const t of m.suppressesPlanTemplates) suppresses.add(t);
  }
  const candidates = input.profile.plan.planTemplates ?? [];
  return candidates.filter((tpl) => {
    if (suppresses.has(tpl)) return false;
    return !anyEnablesDeclared || enables.has(tpl);
  });
}
```

The filter runs once per microturn, before scoring. Traces record the filtered-out template ids and the gating module ids so the proposal decision is contrastive (per Foundation #20's preview-provenance shape — mirroring the existing `rejectedDoctrines: { doctrineId, reason }` pattern at `types-plan-trace.ts`):

```ts
// additive trace fields on PolicyPlanTrace
readonly filteredOutTemplates: readonly {
  readonly templateId: PlanTemplateId;
  readonly gatedBy: readonly ModuleId[];      // modules whose enable-sets excluded it, or that suppressed it
  readonly reason: 'notEnabled' | 'suppressed';
}[];
```

### 4.3 Compiler validation

Strategy-module validation lives inline in `packages/engine/src/cnl/compile-agent-strategy-modules.ts` today (no dedicated `validate-agent-strategy-modules.ts` file exists; a sibling `validate-agent-plan-templates.ts` does, so authoring a parallel `validate-agent-strategy-modules.ts` is acceptable if symmetry is preferred — implementer choice).

The validation surface gains:

- Every id in `enablesPlanTemplates` / `suppressesPlanTemplates` references an existing template in the same profile's `planTemplates` array. Mismatch fails compile with a module-named diagnostic.
- A single module that declares the same template id in BOTH `enablesPlanTemplates` and `suppressesPlanTemplates` fails compile (authoring inconsistency).
- A single module where every `enablesPlanTemplates` id is also in `suppressesPlanTemplates` (degenerate empty effect) fails compile.
- The compiler does NOT enforce non-empty eligibility sets per module — a module that declares `enablesPlanTemplates: [arvn.trainGovern]` only is valid; its activation simply restricts the candidate set to that one template.

### 4.4 FITL ARVN demonstration slice

Migrate the existing `buildPoliticalEngine` doctrine module (`92-agents.md:1457-1474`) to declare:

```yaml
buildPoliticalEngine:
  traceLabel: "build political engine"
  when: ...                              # unchanged
  applies:
    scopes: [move]
    actionTags: [train]
  priority: { tier: 30 }
  enablesPlanTemplates:
    - arvn.trainGovern
    - arvn.patrolGovern
  suppressesPlanTemplates:
    - arvn.assaultRaid   # aggressive plan family suppressed while building political engine
```

This demonstrates the architecture on the concrete ARVN competence requirement from `reports/fitl-competent-agent-ai.md` §3 (ARVN: "Train + Govern, Patrol + Govern … Avoid simply serving US Support").

A FITL architectural-invariant witness asserts: when `buildPoliticalEngine` is active, `arvn.assaultRaid` is not in the proposer's candidate set; when inactive, it is.

The choice of `buildPoliticalEngine` over alternative ARVN doctrines is implementer judgment; any module whose `when` clause has a tight enough activation footprint to exercise both the active and inactive branches in convergence witnesses is acceptable.

## 5. Determinism and replay (Foundations #8, #16)

- Eligibility filter is pure over `(activeModules, planTemplates)`; deterministic ordered output.
- Plan traces record filtered-out template ids and gating module ids; traces replay byte-identically.
- `pnpm turbo build` twice produces byte-identical GameDef.
- `pnpm turbo schema:artifacts` regenerates `packages/engine/schemas/GameDef.schema.json` cleanly (the JSON-schema mirror at `schemas/GameDef.schema.json` carries `strategyModules` entries that must reflect the new fields).

## 6. Edge cases

- **No active strategy modules** — eligibility filter degenerates to identity; full `planTemplates` candidate set.
- **Active modules with no gating fields** — preserves current behavior (default-permissive).
- **Cyclic suppression** — module A suppresses template X enabled by module B, both active: X is excluded (suppression wins per §4.1). Trace records both module ids as the gating provenance (`gatedBy: [A]`, `reason: 'suppressed'`).
- **Eligibility filter yields empty set** — proposer falls through to the existing `status: 'noTemplate'` path (`plan-proposal.ts:96`, which already returns this status when `templateIds.length === 0`). Implementer choice: reuse `'noTemplate'` (simplest, contributes nothing new to the union) OR add a new `'noEligibleTemplate'` status so traces distinguish "no templates declared in profile" from "all templates filtered by doctrine gating"; the latter is the cleaner trace surface and is recommended. Scalar root selection (Spec 190's fallback floor) takes over either way. No new failure mode introduced.

## 7. Phases & acceptance criteria

| Phase | Deliverable | Acceptance | Effort |
|---|---|---|---|
| **P1** | Schema + compiler validation (§4.1, §4.3) | `GameSpecStrategyModuleDef` + `StrategyModuleDef` (IR) extended; validator (in `compile-agent-strategy-modules.ts` or new sibling `validate-agent-strategy-modules.ts`) rejects unknown template ids, contradictory enables/suppresses, degenerate empty-effect; fixture with each new field compiles; `pnpm turbo schema:artifacts` regenerates `GameDef.schema.json` cleanly; determinism preserved | S–M |
| **P2** | Eligibility filter in proposer (§4.2) | `eligiblePlanTemplates` implemented; trace records filtered-out templates + gating modules in additive `filteredOutTemplates` field; default-permissive behavior preserved on FITL profile pre-migration (proves no regression); replay byte-identical | M |
| **P3** | FITL ARVN demonstration slice (§4.4) | `buildPoliticalEngine` (or implementer-chosen equivalent doctrine) migrated; architectural-invariant witness asserts gating behavior (active → `arvn.assaultRaid` filtered; inactive → unrestricted); FITL convergence witnesses unchanged for unaffected templates | S–M |
| **P4** | Architectural-invariant tests | Cross-profile property test: any active module with `enablesPlanTemplates` field restricts the candidate set; suppress beats enable; empty-eligibility falls through cleanly; trace provenance complete; additive optional fields → no consumer migration needed across the 9 source + 7 test files importing `CompiledPlanTemplate` / `StrategyModuleDef` | S |

## 8. Test plan

- **Compiler error corpus** (architectural-invariant): unknown `enablesPlanTemplates` id; unknown `suppressesPlanTemplates` id; self-contradictory module (enables and suppresses same id); degenerate-empty-effect module (every enables-id also in suppresses-set). Each fails with module-named diagnostic.
- **Proposer architectural-invariant**: synthesized profiles exercise each filter shape (enables-only, suppress-only, enables+suppress union, empty result fallback).
- **FITL convergence witness**: ARVN scenario where `buildPoliticalEngine` is active proves `arvn.assaultRaid` is filtered out of candidates; an inverse scenario (module inactive) proves it returns.
- **Trace correspondence**: golden trace pins the new `filteredOutTemplates` field shape including `gatedBy` and `reason`.
- **Determinism**: build twice byte-identical; plan-trace replay preserved; schema artifacts regen idempotent.

## 9. Foundation alignment

#1 (engine-agnostic — gating is generic over template ids; no game-specific kinds) · #12 (compiler validates everything knowable from spec) · #14 (no compatibility shim — default-permissive behavior is the *defined* semantic for absent fields, not a fallback) · #15 (root-cause: closes the doctrine-template decoupling gap) · #16 (witness-tested across compiler + proposer + FITL slice) · #19 (microturn protocol unchanged; controller behavior unchanged) · #20 (new `filteredOutTemplates` trace field exposes per-template gating provenance with `{ templateId, gatedBy, reason }` shape, mirroring the existing `rejectedDoctrines: { doctrineId, reason }` pattern — gating decisions are contrastive evidence, not silent coercion).

## 10. Reassessment of source proposal (`reports/ai-agent-policy-overhaul-second-iteration.md`)

**Adopted (this spec's slice):**
- §3 (proposal #1's *load-bearing core*: doctrine should constrain plan families) → §4.1 + §4.2.

**Corrected:**
- The audit's framing "doctrine is still not first-class enough" / "modules look like weighted action preferences with constant values" is overstated; verification found 42 of ~61 FITL modules (~69%) carry `when:` conditions. This spec addresses the actual gap (decoupling between doctrine and plan-template candidacy) rather than the framed one (perceived scalar-bias). The fix is *fields on existing modules*, not a new type.
- The audit's framing that this work requires a "DPRT-P" reframe is rejected — this is targeted decoupling, not architectural replacement.
- Tag-driven plan-template gating (parallel to `applies.actionTags`) was scoped *out* per YAGNI: plan templates carry no `tags` field today and FITL authors none, so a tag-gating mechanism would be plumbing without exercise. Id-list gating via `enablesPlanTemplates` covers the architectural intent for the initial slice; tag gating is deferred (§11).

**Deferred (named follow-ups, not in this spec):**
- Lexicographic plan-family selection refinement (proposal #6) — `priorityTier` is already the first lexicographic key; within-tier scalar summation is preserved here. Finer-grained tiering is uncommitted until a concrete witness shows scalar-soup harm post-eligibility-gating.
- Other proposals owned by sibling specs (constraints/route → Spec 196; conformance/observer → Spec 198; compound availability → Spec 199).

**Rejected (with rationale):**
- "Promote `strategyModules` into a separate doctrine type" (proposal #1 reframe) — Spec 186 §11 and Spec 191 §11 already settled this as Foundation #14 churn. The architectural gap that motivated the reframe (decoupling) is addressed by fields, not by retyping.
- "Replace scoreGroups / leaf considerations with lexicographic local target scoring" — Spec 186 §11 already corrected this by demoting considerations to leaf scorers; further removal is unjustified by current evidence.

## 11. Out of scope (named follow-on / sibling)

- **Spec 196** — generic role constraints + authored route/map semantics (COMPLETED 2026-05-26; archived at `archive/specs/196-generic-role-constraints-and-authored-route-semantics.md`).
- **Spec 198** — cross-game conformance corpus + observer-safety proofs (mutually independent).
- **Spec 199** — compound availability at root proposal (mutually independent).
- Migration of US/NVA/VC strategy modules to use eligibility gating — uncommitted; the architectural exemplar lands with ARVN, others migrate as concrete competence-test signals demand.
- Per-target-role doctrine influence (a doctrine restricts which *roles* a template can bind) — uncommitted; current scope is template-level gating only.
- **Tag-driven plan-template gating** (`enablesPlanTemplateTags`) — uncommitted. Would require adding a `tags` field to `GameSpecPlanTemplateDef` and `CompiledPlanTemplate`, plus author-side tag adoption across FITL templates. Promote to a follow-up spec when a concrete authoring need surfaces (e.g., a doctrine that gates a family of templates sharing a semantic axis no single id-list captures cleanly).

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-26:

- [`archive/tickets/197DOCGATPLA-001.md`](../archive/tickets/197DOCGATPLA-001.md) — Strategy-module gating fields + compiler validation (covers §4.1 + §4.3)
- [`archive/tickets/197DOCGATPLA-002.md`](../archive/tickets/197DOCGATPLA-002.md) — Plan-proposer eligibility filter + trace provenance (covers §4.2 + §6 status)
- [`tickets/197DOCGATPLA-003.md`](../tickets/197DOCGATPLA-003.md) — FITL ARVN `buildPoliticalEngine` migration + convergence witness (covers §4.4)
- [`tickets/197DOCGATPLA-004.md`](../tickets/197DOCGATPLA-004.md) — Cross-profile architectural-invariant tests + golden trace (covers §7 P4 + §8)
