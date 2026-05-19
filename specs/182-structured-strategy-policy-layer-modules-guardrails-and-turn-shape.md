# Spec 182 — Structured Strategy Policy Layer Phase 2/3/4: Modules, Guardrails, and Turn-Shape Evaluators

**Status**: PROPOSED
**Priority**: High — closes the remaining engine-layer authoring gaps documented in `reports/ai-agent-overhaul-proposal.md` after Spec 181 shipped the audit probe harness and first-class selectors. The cookbook migration that Spec 181 declared out-of-scope cannot proceed until profiles have a place to express named strategic intent (modules), tiered negative evidence (guardrails), and bounded chain-summary objectives (turn-shape evaluators).
**Complexity**: L — three phases, each independently mergeable. Phase 2 (modules) is M and unblocks Phases 3 and 4. Phase 3 (guardrails) is M and consumes module activations. Phase 4 (turn-shape evaluators) is M–L and consumes module-declared objectives plus Spec 181's probe harness for validation.
**Date**: 2026-05-18
**Dependencies**:
- `archive/specs/181-structured-strategy-policy-layer-probes-and-selectors.md` (first-class selectors as the primary input surface for modules; audit probe harness as the validation substrate for guardrails and turn-shape evaluators)
- `archive/specs/180-standing-vector-observability-and-outer-preview-signal-integrity.md` (named role primitives consumed by module activation conditions and guardrail predicates; per-seat trace matrix consumed by trace-grouping output)
- `archive/specs/164-continued-inner-preview-deepening.md` (cap-class registry pattern — turn-shape evaluator cost classes reuse the same shape)
- `archive/specs/162-preview-signal-integrity.md` (Foundation #20 — guardrail and turn-shape predicates that read preview refs must declare explicit fallback)
- `archive/specs/144-probe-and-recover-microturn-publication.md` (hard-prune guardrails consume the existing pass-fallback contract Spec 144 introduced via Foundation #18, for `onAllPruned` recovery)
- `archive/specs/121-two-phase-policy-evaluation.md` (phase1/phase2 scoring — module activations evaluate in phase 1; guardrail demotions and turn-shape contributions apply in phase 2)
- `archive/specs/104-unified-decision-context-considerations.md` (consideration scoping — modules and guardrails honor `scopes: [move, microturn]`)

**Trigger reports**:
- `reports/ai-agent-overhaul-proposal.md` (external ChatGPT-Pro deep-research proposal — §6.1 Strategic modules, §6.4 Guardrails, §6.5 Turn-shape evaluators, §7.4 No-impact handling, §7.5 chooseOne metadata, §7.6 chooseNStep set-level primitives, §8 Anti-blunder system, §10 Trace contract per-layer extensions, §14 FITL/ARVN application example, §17 Stage 1 lint + trace grouping)

**Ticket namespace**: `182STRSTRPOL2`

---

## 1. Goal

Three composition layers that sit on top of Spec 181's selectors and probe harness, give profile authors a way to express intent rather than just numeric weights, and make negative evidence and chain-shape evaluation first-class:

1. **Strategic modules (Phase 2).** Named, declarative scoring groups that activate under conditions, bind selectors, contribute grouped score, declare guardrail attachments, and carry trace labels. Modules do not execute actions — they only score, demote, and explain the published legal frontier. The kernel learns no game semantics; modules consume the existing condition, feature, aggregate, standing-role, lookup, preview, and selector refs.

2. **Guardrails with severity tiers (Phase 3).** A separate negative-evidence library bucket with `prune | demote | warn | auditOnly` severities. Hard `prune` requires explicit `safe: true` plus `onAllPruned` per the existing pass-fallback contract (Foundation #18 + Spec 144). Demote and warn apply score penalties or trace markers without removing candidates. AuditOnly produces probe-visible markers and zero runtime cost on the candidate.

3. **Turn-shape evaluators (Phase 4).** Bounded summaries over the *already-driven* inner-preview chain that compare the chain's projected effect against module-declared objectives. They reuse Spec 164's bounded-preview substrate (no new preview drives), declare explicit fallback for unavailable preview refs (Foundation #20), and emit grouped trace entries that explain whether the bounded turn satisfied any declared objective.

Trace contract extensions land per phase so trace output stays in sync with the layer being added. The default trace mode (`summary`) caps active-module / guardrail / objective output at top-K per Spec 181's existing trace convention.

## 2. Non-Goals

- **No runtime planner.** MCTS, HTN, GOAP, and runtime behavior-tree ticking remain out — they would violate Foundation #10 (bounded computation) and Foundation #18 (constructibility). Modules score the published frontier; they never generate or hide actions.
- **No new selector primitives.** Spec 181 Phase 1 ships the selector IR; modules consume `selector.<id>.*` refs but do not add new selector kinds. Set-level chooseNStep primitives (proposal §7.6 — `coverage`, `redundancyPenalty`, `diversity`, `completionValue`, `removeValue`, `marginalGain`) compile to module-declared score groups over existing selector outputs, not new selector kinds.
- **No new game-specific engine logic.** Modules, guardrails, and turn-shape evaluators operate on game-authored tags, conditions, selectors, and standing-role primitives. The engine does not learn "Govern", "Train", "ARVN", "Patronage", "Coup", or any other FITL concept. The cookbook migration covered by this spec moves ARVN authoring shape — it does not change engine behavior.
- **No new cap-class tier.** Module activation, guardrail predicates, and turn-shape evaluators reuse Spec 164's `standard256` / `deep1024` registry when they transitively read preview refs. Preview-free layers compile to `state` / `candidate` / `microturn` cost classes per Spec 181's selector cost-class rules.
- **No new preview drive.** Turn-shape evaluators MUST consume already-driven inner-preview state. A turn-shape evaluator that needs projected evidence outside the current inner-preview chain MUST fail compilation with `TURNSHAPE_REQUIRES_UNREGISTERED_PREVIEW_DRIVE`; authors either add the needed preview drive to the profile or restate the objective in terms of already-driven state.
- **No evolution-loop changes.** Composite acceptance, weight-soup lint, MAP-Elites archive, and per-mutation rationale tracking are evolution-pipeline concerns and live in Spec 183 (campaign runner work). This spec ships the engine-layer surfaces those changes will consume.
- **No influence-field primitives.** Proposal §17 Stage 7 (influence/field maps over finite graphs) is dropped from the deferred-work pipeline. With selectors (Spec 181), modules, guardrails, and turn-shape evaluators in place, influence fields collapse into a niche performance optimization rather than a load-bearing authoring layer. Re-open in a fresh spec only if profile-quality evidence shows the missing primitive blocks a real authoring task.
- **No FOUNDATIONS.md amendment.** §10 documents alignment; existing #1, #2, #5, #7, #10, #16, #18, #20 cover the proposed primitives. Spec 180 already extended #20 for the standing-role substrate and Spec 181 §10 already extended trace-contract integrity for the selector layer.
- **No Texas Hold'em selector adoption.** `data/games/texas-holdem/92-agents.md` declares zero selectors at Spec 182 landing; Spec 181 selector adoption never reached the profile. Phase 2 acceptance therefore covers FITL only. Authoring a Texas Hold'em selector (so a Spec 182 module can bind to it for broader Foundation #16 conformance) is a Spec 181 follow-on, not a Spec 182 deliverable. Re-open as a separate ticket against Spec 181 if the modules-layer corpus expansion becomes load-bearing.
- **No Foundation #16 perfect-information game fixture.** No perfect-information game exists in `data/games/` or any test-fixture directory; the broader Foundation #16 conformance gap (perfect-info + stochastic + asymmetric + hidden-info) is project-wide work, not a Spec 182 deliverable. §10 conformance uses the games currently in the corpus.

## 3. Context (verified against codebase)

### 3.1 What Spec 181 just landed

Spec 181 (PR #266, commit `6b11054a7`, merged 2026-05-18) shipped the audit probe harness (§4) and first-class selectors (§5). Verified:
- `packages/engine/src/contracts/policy-contract.ts:5` shows `selectors` is now an `AGENT_POLICY_LIBRARY_BUCKETS` entry.
- `packages/engine/test/policy-profile-quality/probes/` exists with `define-probe.ts`, `probe-runner.ts`, `probe-types.ts`, `assertions/`, `fixtures/`, `fire-in-the-lake/`, `architectural/`, and the budget + runner test files referenced in Spec 181 §4.
- 17 tickets in the `181STRSTRPOL-*` namespace are archived, including Phase 1 prerequisites (`-014` microturn selector option context, `-015` selector preview planning, `-016` selector component preview fallback trace, `-017` selector-aware preview-inner validation) and `-012` ARVN consideration migration.

### 3.2 The remaining authoring gap

Inspecting `data/games/fire-in-the-lake/92-agents.md` after Spec 181 shows the cookbook migration is partial: one ARVN consideration uses a selector (Phase 1 conformance, §8 acceptance (c) of Spec 181) but the rest of the profile is still flat action-tag-weighted considerations plus scalar conditions. There is no first-class way to say:
- "When `condition.selfPoliticalEngineBehind.satisfied` AND NOT `condition.militaryBoardCollapsing.satisfied`, I am in *build-political-engine* mode; rank zones by the political-target selector; only score political-action candidates; demote candidates that don't improve my standing." Today this requires stacking action-tag weights, scalar conditions, and selector refs across multiple buckets with no named grouping.
- "Spending a scarce resource on a candidate that fails the political-target selector minimum-impact gate is a blunder; demote by 100." Today the only negative-evidence primitive is binary `pruningRules` — there's no severity tier, no warn-and-keep, no audit-only.
- "Did the just-driven inner-preview chain actually improve self-standing or deny the current leader? If neither, this whole microturn-sequence accomplished nothing — demote." Inner preview (Spec 164) produces the substrate; what's missing is the named-objective comparison layer.

`packages/engine/src/agents/policy-eval.ts` and `policy-evaluation-core.ts` confirm: there is no module dispatch, no guardrail bucket with severity, no turn-shape evaluator. The Phase 1 selector IR slots in alongside existing buckets but no consumer composes selector outputs into named intent groups.

### 3.3 Inner-preview substrate available to turn-shape evaluators

`packages/engine/src/agents/policy-preview-inner-deepening.ts` and `policy-preview-inner-choosenstep.ts` (Spec 164) produce bounded chain projections under named cap classes (`standard256`, `deep1024`). The substrate is per-candidate; what's missing is a layer that observes the chain's final projected state, compares it against module-declared objectives (self-standing delta, leader denial, target-quality satisfaction), and emits a trace entry naming which objective was satisfied or violated. This is the gap Phase 4 fills.

### 3.4 Pass-fallback contract for hard prune

`archive/specs/144-probe-and-recover-microturn-publication.md` and Foundation #18 establish that an authored `tags: [pass]` action MUST exist whenever a kernel rollback could otherwise leave the published frontier empty. The existing kernel implementation at `packages/engine/src/kernel/legal-moves.ts:1594-1599` performs the pass-fallback lookup. Hard `prune` guardrails extend this contract: the compiler enforces that a profile declaring any `severity: prune, safe: true` guardrail also provides an `onAllPruned` action declaration that lands on a tagged pass action, and runtime asserts that the resulting fallback frame matches the declared shape. Demote/warn/auditOnly do not invoke this contract because they never empty the frontier.

## 4. Architecture — Phase 2: Strategic Modules

### 4.1 New library bucket

`AGENT_POLICY_LIBRARY_BUCKETS` gains a new entry: `strategyModules`. Compiled module defs live alongside `stateFeatures`, `candidateFeatures`, `candidateAggregates`, `pruningRules`, `considerations`, `tieBreakers`, `strategicConditions`, and `selectors`; they participate in the dependency-cycle check already implemented in `compile-agents.ts`.

### 4.2 Compiled IR shape

```ts
type StrategyModuleDef = {
  readonly id: ModuleId;                         // branded string
  readonly traceLabel: string;                   // human-readable label for trace output
  readonly when: BoolExpr;                       // activation condition
  readonly applies: AppliesSpec;                 // scope filters
  readonly priority: PrioritySpec;
  readonly selectors: ReadonlyArray<ModuleSelectorBinding>;
  readonly scoreGroups: ReadonlyArray<ScoreGroupDef>;
  readonly guardrailIds: ReadonlyArray<GuardrailId>;   // forward refs, resolved at compile time
  readonly fallback: ModuleFallbackSpec;
  readonly costClass: ModuleCostClass;           // derived; recorded for reproducibility
};

type AppliesSpec = {
  readonly scopes: ReadonlyArray<'move' | 'microturn'>;
  readonly actionTags?: ReadonlyArray<ActionTagId>;
  readonly decisionKinds?: ReadonlyArray<DecisionKind>;
};

type PrioritySpec = {
  readonly tier: number;                         // higher tier = stronger activation signal in trace grouping
  readonly value?: NumericExpr;                  // optional dynamic activation strength
};

type ModuleSelectorBinding = {
  readonly role: ModuleSelectorRoleId;           // author-declared role name (e.g. 'primaryTarget')
  readonly selectorId: SelectorId;               // refers to a Spec 181 SelectorDef
};

type ScoreGroupDef = {
  readonly id: ScoreGroupId;                     // 'actionShape' | 'targetQuality' | 'standing' | ... (author-declared)
  readonly terms: ReadonlyArray<ScoreTermDef>;   // each term is a NumericExpr with a weight
  readonly summary: 'sum' | 'product' | 'max';   // grouped reduction
};

type ModuleFallbackSpec = {
  readonly ifInactive: 'noContribution' | 'traceOnly';
  readonly ifSelectorEmpty: 'noContribution' | 'demoteAndTrace';
};

type ModuleCostClass = 'state' | 'candidate' | 'microturn' | 'preview' | 'auditOnly';
```

The compiler derives `costClass` from the deepest dependency in `when`, `priority.value`, `scoreGroups[*].terms[*].value`, and the resolved cost classes of bound selectors. Module activation MUST evaluate at the cheapest scope its `when` clause permits (state-scoped activation evaluates once per decision; candidate-scoped activation evaluates per candidate).

### 4.3 Generic refs exposed by a module

| Ref | Type | Available in scope |
| --- | --- | --- |
| `module.<id>.active` | boolean | any |
| `module.<id>.priority.value` | number | any |
| `module.<id>.contribution` | number | any |
| `module.<id>.scoreGroup.<groupId>.value` | number | any |
| `module.<id>.selector.<role>.id` | string | any |

Refs are resolved by the existing `policy-evaluation-core.ts` ref-resolution pipeline; modules slot in alongside features, aggregates, selectors, and standing roles. A consideration or guardrail can read `module.<id>.active` to gate its own behavior, mirroring the existing `condition.<id>.satisfied` pattern.

### 4.4 Compiler diagnostics (initial set)

| Diagnostic code | Trigger |
| --- | --- |
| `CNL_COMPILER_AGENT_MODULE_REF_UNKNOWN` | `selectorId`, `guardrailId`, or condition ref does not resolve |
| `CNL_COMPILER_AGENT_MODULE_SCORE_GROUP_DUPLICATE_ID` | Two `scoreGroups` entries share an id |
| `CNL_COMPILER_AGENT_MODULE_PRIORITY_TIER_OUT_OF_RANGE` | `priority.tier` outside `[0, MAX_MODULE_PRIORITY_TIER]` (declared in `packages/engine/src/kernel/types-core.ts` alongside `MAX_SELECTOR_PRODUCT_PAIRS` and `MAX_SELECTOR_RESULT_ITEMS`; initial value `100`, consistent with existing trace top-K capping conventions) |
| `CNL_COMPILER_AGENT_MODULE_SELECTOR_ROLE_DUPLICATE` | Two `selectors` bindings share a role name |
| `CNL_COMPILER_AGENT_MODULE_GUARDRAIL_REQUIRES_PRUNE_FALLBACK` | A bound guardrail is `severity: prune, safe: true` and the profile lacks the `onAllPruned` declaration described in §5.4 |
| `CNL_COMPILER_AGENT_MODULE_FALLBACK_DEMOTE_REQUIRES_PENALTY` | `ifSelectorEmpty: demoteAndTrace` without a configured demotion penalty |
| `CNL_COMPILER_AGENT_MODULE_DEPENDENCY_CYCLE` | Module references itself transitively via condition / aggregate / module ref |
| `CNL_COMPILER_AGENT_MODULE_COST_CLASS_EXCEEDS_LIMIT` | Derived cost class exceeds the profile's declared `strategyModules.maxCostClass` |
| `CNL_COMPILER_AGENT_MODULE_TRACE_LABEL_DUPLICATE` | Two modules share a `traceLabel` |

### 4.5 Runtime evaluation

Module activation evaluates per (decision, scope) and caches per Foundation #8 determinism rules. Active modules contribute grouped score to each candidate that matches their `applies` filter; the contribution is recorded in `PolicyAgentDecisionTrace` (top-level, at `packages/engine/src/kernel/types-core.ts:2232`) under a new `modules` field, sibling to the existing `selectors` field (line 2252; Spec 181 §5.6). Grouped score totals are exposed via the `module.<id>.contribution` ref so downstream considerations or tie-breakers can read them.

Module activation lives inside Spec 121's move-scope evaluation phase (action type selection), branching on cost class: state-scope modules evaluate once per decision (mirroring the `selector.costClass === 'state'` branch at `packages/engine/src/agents/policy-eval.ts:669-672`), and candidate-scope modules evaluate per candidate (mirroring `policy-eval.ts:673-675`). The full move-scope dispatch order after this spec lands is `stateFeatures → candidateFeatures → selectors → modules → guardrails → pruning (removed in Phase 3) → considerations → tie-breakers`; modules cannot observe consideration scores, but considerations can observe `module.<id>.contribution`. This is the same dispatch shape Spec 181 §5.6 uses for selector refs.

### 4.6 Trace contract extension (modules)

The trace `selected` block gains:

```
modules:
  active:
    - id: build-political-engine
      traceLabel: "build political engine"
      priorityTier: 30
      activationValue: 0.72            # if priority.value was declared, else null
      contribution: 44
      scoreGroups:
        actionShape: 8
        targetQuality: 24
        standing: 12
  inactiveTopReasons:
    - id: emergency-defense
      reason: conditionFalse
```

`summary` mode caps active modules at top-3 and inactive-with-reason at top-3 (by priority tier). `verbose` mode lifts the caps to top-K of the existing trace-controls budget. `debug` mode emits the full activation matrix. Ordering is deterministic: active modules sort by `(priorityTier desc, id asc)`, inactive sort by `(priorityTier desc, id asc)`.

## 5. Architecture — Phase 3: Guardrails with Severity Tiers

### 5.1 New library bucket

`AGENT_POLICY_LIBRARY_BUCKETS` gains a new entry: `guardrails`. Compiled guardrail defs live alongside the buckets above. During the Phase 2 merge window (after Phase 2 lands and before Phase 3 lands), the existing `pruningRules` bucket remains operational and unchanged — guardrails do not yet exist. Phase 3 lands a single atomic ticket that (a) adds the `guardrails` bucket, (b) migrates every repository-owned `pruningRules` entry to `guardrails` with `severity: prune` (both data-file YAML AND engine test fixtures — see §9 Phase 3 acceptance and §10 migration completeness), and (c) removes the `pruningRules` bucket. Per Foundation #14, no compatibility shim ever lands in main; the two buckets never coexist in a merged snapshot.

#### 5.1.1 `pruningRules` → `guardrails` migration mapping

Every existing `pruningRules` entry has an `onEmpty: 'skipRule' | 'error'` setting. The Phase 3 migration ticket converts these mechanically:

| Existing `pruningRules` shape | Migrated `guardrails` shape | Behavioral note |
| --- | --- | --- |
| `onEmpty: error` (current default) | `severity: prune, safe: true, onAllPruned: <pass-tagged action>` | Current: throws `PRUNING_RULE_EMPTIED_CANDIDATES`. New: publishes pass-fallback frame deterministically. Strictly safer. |
| `onEmpty: skipRule` | `severity: prune, safe: true, onAllPruned: <pass-tagged action>` AND author MUST audit the `when` clause to confirm it cannot evaluate true for every candidate. If soft signaling (no candidate removal, just a flag) is the actual intent, reauthor as `severity: warn`. | Current: reverts the rule on empty-frontier. New: publishes pass-fallback frame. The current `dropPassWhenOtherMovesExist` rule in `data/games/fire-in-the-lake/92-agents.md` satisfies the audit (the `when` clause requires `aggregate.hasNonPassAlternative`, so non-pass candidates always survive); the pass action it drops IS the pass-fallback action. |

The migration ticket includes the audit step per rule and documents the chosen mapping in the ticket body.

### 5.2 Compiled IR shape

```ts
type GuardrailDef = {
  readonly id: GuardrailId;                      // branded string
  readonly traceLabel: string;
  readonly scopes: ReadonlyArray<'move' | 'microturn'>;
  readonly when: BoolExpr;                       // fires when true
  readonly severity: 'prune' | 'demote' | 'warn' | 'auditOnly';
  readonly penalty?: NumericExpr;                // required when severity === 'demote'
  readonly safe?: true;                          // required when severity === 'prune'
  readonly onAllPruned?: PassFallbackSpec;       // required when severity === 'prune'
  readonly onUnavailable: 'warnUnknown' | 'noFire' | 'fire';   // explicit per Foundation #20
  readonly costClass: GuardrailCostClass;
};
```

`onUnavailable` controls what happens when the guardrail's `when` clause transitively reads a preview ref whose status is non-`ready`. The explicit-declaration discipline mirrors Spec 181 §5.5's `CNL_COMPILER_AGENT_SELECTOR_COMPONENT_REQUIRES_FALLBACK` pattern (Foundation #20), but the value enum is intentionally different: selectors declare a contribution-value fallback (`AgentPreviewFallback = { onUnavailable: 'noContribution' | { kind: 'constant'; value: number } }`, `packages/engine/src/kernel/types-core.ts:383-387`), whereas guardrails declare a fire/no-fire/warn-on-unknown decision because they gate candidates rather than contribute score. The compiler emits `CNL_COMPILER_AGENT_GUARDRAIL_PREVIEW_REQUIRES_FALLBACK` when omitted.

### 5.3 Severity semantics

| Severity | Runtime effect | Compiler obligations |
| --- | --- | --- |
| `prune` | Remove candidate from the published frontier | `safe: true` AND `onAllPruned` MUST be present; runtime asserts the post-prune frontier is non-empty OR the `onAllPruned` fallback frame is published |
| `demote` | Apply `penalty` to the candidate's final score | `penalty` MUST resolve to a non-negative integer at evaluation time |
| `warn` | Mark the candidate with a `guardrail-warn` trace entry; do not change score | None beyond `onUnavailable` |
| `auditOnly` | Emit a probe-visible marker for the audit harness (Spec 181 §4); no runtime score effect | None beyond `onUnavailable` |

Hard prune REMAINS rare by design. The compiler emits a profile-quality warning (`POLICY_PROFILE_QUALITY_GUARDRAIL_RARELY_SAFE`) when a `severity: prune` guardrail's `when` clause does not transitively reach any state-scoped feature, indicating the guardrail might fire on most or all candidates and erase the frontier — exactly the failure mode Spec 144's pass-fallback contract handles, but a contract authors should be steered away from invoking lightly.

### 5.4 Pass-fallback integration (`onAllPruned`)

```ts
type PassFallbackSpec = {
  readonly actionId: ActionId;                   // must resolve to an authored action tagged 'pass'
  readonly traceLabel: string;
};
```

The compiler verifies the resolved action carries `tags: [pass]` per Foundation #18 and Spec 144. Runtime publishes the fallback frame using the same pipeline `applyMove` uses for the kernel's existing blacklist-and-rollback recovery; the trace records a `POLICY_GUARDRAIL_ALL_PRUNED_FALLBACK` entry naming the guardrail id and the fallback action.

### 5.5 Compiler diagnostics (initial set)

| Diagnostic code | Trigger |
| --- | --- |
| `CNL_COMPILER_AGENT_GUARDRAIL_REF_UNKNOWN` | `when` clause references an unknown feature / condition / selector / module / standing role |
| `CNL_COMPILER_AGENT_GUARDRAIL_SEVERITY_DEMOTE_REQUIRES_PENALTY` | `severity: demote` without `penalty` |
| `CNL_COMPILER_AGENT_GUARDRAIL_SEVERITY_PRUNE_REQUIRES_SAFE` | `severity: prune` without `safe: true` |
| `CNL_COMPILER_AGENT_GUARDRAIL_SEVERITY_PRUNE_REQUIRES_ON_ALL_PRUNED` | `severity: prune, safe: true` without `onAllPruned` |
| `CNL_COMPILER_AGENT_GUARDRAIL_ON_ALL_PRUNED_ACTION_NOT_PASS_TAGGED` | `onAllPruned.actionId` resolves to an action not tagged `pass` |
| `CNL_COMPILER_AGENT_GUARDRAIL_PREVIEW_REQUIRES_FALLBACK` | `when` reads a preview ref without `onUnavailable` |
| `CNL_COMPILER_AGENT_GUARDRAIL_DEPENDENCY_CYCLE` | Guardrail references itself transitively |
| `CNL_COMPILER_AGENT_GUARDRAIL_COST_CLASS_EXCEEDS_LIMIT` | Derived cost class exceeds the profile's declared `guardrails.maxCostClass` |
| `CNL_COMPILER_AGENT_GUARDRAIL_TRACE_LABEL_DUPLICATE` | Two guardrails share a `traceLabel` |
| `CNL_COMPILER_AGENT_GUARDRAIL_PRUNINGRULES_DEPRECATED` | Profile still declares `pruningRules` after the Phase 3 migration ticket lands; emitted as a hard error to enforce removal per Foundation #14 |

### 5.6 Runtime evaluation

Guardrail dispatch happens after module activation and before consideration scoring (per the order described in §4.5). For each candidate:

1. State-scoped guardrails evaluate once per decision.
2. Candidate / microturn / preview-scoped guardrails evaluate per candidate.
3. `prune` guardrails apply first; if the post-prune frontier is empty AND any `prune` guardrail declared `onAllPruned`, the fallback frame is published instead.
4. `demote` guardrails accumulate their penalties; the candidate's final score subtracts the sum.
5. `warn` and `auditOnly` guardrails record trace markers without altering score.

Caching is per Spec 181 §5.6 (state hash + candidate hash + preview ref status snapshot).

### 5.7 Trace contract extension (guardrails)

```
guardrails:
  fired:
    - id: scarce-resource-low-impact
      traceLabel: "scarce resource without impact"
      severity: demote
      penalty: 100
      status: ready
  notFiredTop:
    - id: helps-leader-without-self-gain
      reason: whenFalse
  allPrunedFallback:
    guardrailId: ...
    actionId: ...
    traceLabel: ...
```

`summary` mode caps fired at top-3 and notFiredTop at top-3 (by deterministic ordering); `allPrunedFallback` is always present when invoked. `verbose` mode lifts the caps; `debug` mode emits the full fired/not-fired matrix.

### 5.8 Generic refs exposed by guardrails

Guardrail refs become available after guardrail dispatch completes and before downstream consideration and tie-breaker scoring. Runtime resolution MUST read the cached dispatch result for the current decision/candidate; it MUST NOT re-evaluate the guardrail predicate.

| Ref | Type | Available in scope |
| --- | --- | --- |
| `guardrail.<id>.fired` | boolean | downstream considerations / tie-breakers / turn-shape predicates after guardrail dispatch |
| `guardrail.<id>.severity` | id/string (`prune` / `demote` / `warn` / `auditOnly`) | downstream trace-facing consumers |
| `guardrail.<id>.status` | id/string (`ready` / `partial` / `unavailable`) | downstream trace-facing consumers |
| `guardrail.<id>.penalty` | number | downstream consumers; zero when unset/not applicable |
| `guardrail.<id>.onUnavailable` | id/string (`warnUnknown` / `noFire` / `fire`) | downstream consumers that need fallback provenance |

## 6. Architecture — Phase 4: Turn-Shape Evaluators

### 6.1 New library bucket

`AGENT_POLICY_LIBRARY_BUCKETS` gains a new entry: `turnShapeEvaluators`. Compiled evaluator defs live alongside the buckets above.

### 6.2 Compiled IR shape

```ts
type TurnShapeEvaluatorDef = {
  readonly id: TurnShapeEvaluatorId;             // branded string
  readonly traceLabel: string;
  readonly source: 'currentPreviewDrive';        // initial value; reserved for future kinds
  readonly bounds: TurnShapeBoundsSpec;
  readonly objectives: ReadonlyArray<ObjectiveDef>;
  readonly minimumImpact: BoolExpr;              // declared satisfaction predicate
  readonly fallback: TurnShapeFallbackSpec;
  readonly costClass: TurnShapeCostClass;        // derived; always preview-class
};

type TurnShapeBoundsSpec = {
  readonly depthCapRef: 'profile.preview.inner.depthCap';   // initial value; reserved
  readonly maxSyntheticDecisions: number;                   // bounded per Foundation #10
};

type ObjectiveDef = {
  readonly id: ObjectiveId;                      // author-declared
  readonly value?: NumericExpr;                  // direct value
  readonly delta?: NumericExpr;                  // delta from start-of-chain to end-of-chain
};

type TurnShapeFallbackSpec = {
  readonly onPreviewUnavailable: 'traceOnly' | 'demote';
  readonly demotePenalty?: NumericExpr;          // required when onPreviewUnavailable === 'demote'
};
```

Evaluators consume the *already-driven* inner-preview chain. `source: 'currentPreviewDrive'` binds to the bounded preview chain Spec 164's `policy-preview-inner-deepening.ts` produces for the current decision. No additional preview drive is triggered.

### 6.3 Generic refs exposed by an evaluator

| Ref | Type | Available in scope |
| --- | --- | --- |
| `turnShape.<id>.objective.<objId>.delta` | number | any consideration / guardrail evaluating after the evaluator |
| `turnShape.<id>.objective.<objId>.value` | number | any |
| `turnShape.<id>.minimumImpactSatisfied` | boolean | any |
| `turnShape.<id>.previewStatus` | `ready` \| `partial` \| `unavailable` | any |

### 6.4 Compiler diagnostics (initial set)

| Diagnostic code | Trigger |
| --- | --- |
| `CNL_COMPILER_AGENT_TURNSHAPE_REF_UNKNOWN` | Objective `value` / `delta` or `minimumImpact` reads an unknown ref |
| `CNL_COMPILER_AGENT_TURNSHAPE_OBJECTIVE_REQUIRES_VALUE_OR_DELTA` | Objective entry has neither `value` nor `delta` |
| `CNL_COMPILER_AGENT_TURNSHAPE_OBJECTIVE_HAS_BOTH_VALUE_AND_DELTA` | Objective entry has both (must choose one) |
| `CNL_COMPILER_AGENT_TURNSHAPE_REQUIRES_UNREGISTERED_PREVIEW_DRIVE` | Objective reads a projected ref the profile's declared inner-preview drives do not produce |
| `CNL_COMPILER_AGENT_TURNSHAPE_FALLBACK_DEMOTE_REQUIRES_PENALTY` | `onPreviewUnavailable: demote` without `demotePenalty` |
| `CNL_COMPILER_AGENT_TURNSHAPE_DEPENDENCY_CYCLE` | Evaluator transitively references itself or a module that depends on this evaluator |
| `CNL_COMPILER_AGENT_TURNSHAPE_OBJECTIVE_ID_DUPLICATE` | Two objectives share an id within one evaluator |
| `CNL_COMPILER_AGENT_TURNSHAPE_TRACE_LABEL_DUPLICATE` | Two evaluators share a `traceLabel` |

### 6.5 Runtime evaluation

Turn-shape evaluators evaluate after inner-preview drives complete and before consideration scoring reads `turnShape.<id>.*` refs. Per-candidate evaluator execution is `O(objectives × evaluators × inner-preview-tail-states)` but bounded by `TurnShapeBoundsSpec.maxSyntheticDecisions` and Spec 164's existing cap-class budget. The runtime asserts no new preview drives are triggered; a separate architectural-invariant test (Spec 181 §4.2 `selectedNotByReason` pattern) gates this.

### 6.6 Trace contract extension (turn-shape)

```
turnShape:
  evaluators:
    - id: current-turn-impact
      traceLabel: "current turn impact"
      minimumImpactSatisfied: true
      previewStatus: ready
      objectives:
        - id: self-standing
          delta: 1
        - id: leader-denial
          delta: -1
        - id: target-quality
          value: 17
```

`summary` mode caps evaluators at top-2 by `minimumImpactSatisfied: true` first, then by ordering of `id`. `verbose` and `debug` modes lift the caps consistent with Phase 2/3 trace conventions.

## 7. Data flow (post-Phase 4)

```
profile YAML
   │
   ▼
compile-agents.ts ─► AgentPolicyLibrary
                          │
                          ▼
              ┌─ selectors  (Spec 181)
              ├─ modules    (Phase 2: activation, score groups, selector bindings, guardrail attachments)
              ├─ guardrails (Phase 3: prune / demote / warn / auditOnly)
              ├─ turnShape  (Phase 4: bounded chain objectives over already-driven inner preview)
              └─ existing buckets (features, aggregates, considerations, tie-breakers, standing roles)
                          │
                          ▼
              PolicyEvaluationCore (existing two-phase pipeline; Spec 121)
                          │
                          ▼
              pickInnerDecision / per-candidate consideration-scoring loop
              (`policy-eval.ts:728-799`)
                          │
                          ▼
              published decision + PolicyAgentDecisionTrace
                          │
                          ▼
              audit probe harness (Spec 181 §4) consumes module / guardrail / turn-shape trace fields
                          │
                          ▼
              evolution loop (Spec 183) consumes per-decision trace + probe results for composite acceptance
```

## 8. Edge cases

- **Module-with-no-active-scope**: If a module's `applies.scopes` excludes the current decision scope, the module evaluates as inactive without firing `when`. `ifInactive` controls trace output (`noContribution` is silent; `traceOnly` emits the inactive-with-reason entry).
- **Guardrail fires on every candidate**: When a `severity: demote` guardrail fires on 100% of candidates, the relative ranking is unaffected and the guardrail effectively constant-shifts every score. The compiler emits a profile-quality warning (`POLICY_PROFILE_QUALITY_GUARDRAIL_FIRES_UNIFORM`) when the audit harness observes this pattern across a probe corpus.
- **Turn-shape evaluator with all objectives unavailable**: `turnShape.<id>.previewStatus` resolves to `unavailable`; `minimumImpactSatisfied` resolves to `false`; downstream consumers fall back to whatever they declared in their own `onUnavailable` clause (consistent with Foundation #20).
- **Hard prune empties the frontier despite `onAllPruned`**: Runtime asserts the fallback action is constructible at the current scope; if not (this should be caught by the compiler), the runtime emits `POLICY_GUARDRAIL_FALLBACK_NOT_CONSTRUCTIBLE` and the kernel falls through to the existing blacklist-and-rollback recovery per Foundation #18. This is treated as a profile-quality regression, not a determinism failure.
- **Module's bound selector returns empty under `where`**: `ifSelectorEmpty: noContribution` zeroes the module's contribution; `ifSelectorEmpty: demoteAndTrace` applies the configured penalty and emits a `POLICY_MODULE_SELECTOR_EMPTY` trace entry.
- **Two modules contribute to the same score group on the same candidate**: Contributions sum (the existing scoring pipeline's accumulator); trace emits both module ids with their contributions separated.
- **`chooseNStep` set-level scoring across multiple modules**: Set-level primitives (proposal §7.6 — `coverage`, `redundancyPenalty`, `diversity`, `completionValue`, `removeValue`, `marginalGain`) compile to module score-group terms over the currently-selected option set; each term references `selector.<id>.selected.*` for items already in the set and `selector.<id>.candidate.<key>.*` for the option being considered. No new IR primitive is introduced — these are module-authored terms over existing selector outputs.
- **Trace ordering with float-equal contributions**: Per Foundation #8, contributions are integer-weighted sums; ties break by `(priorityTier desc, id asc)` for modules, `(severity, id asc)` for guardrails, `(minimumImpactSatisfied: true first, id asc)` for turn-shape evaluators.

## 9. Phases & acceptance criteria

| Phase | Deliverable | Acceptance criteria | Effort |
| --- | --- | --- | --- |
| **Phase 2** — Strategic Modules | New `strategyModules` library bucket; compiled IR §4.2; runtime evaluation §4.5; compiler diagnostics §4.4; trace integration §4.6; cookbook entry in `docs/agent-dsl-cookbook.md`; one ARVN module migration as conformance proof | (a) All §4.4 diagnostic codes have at least one positive-trigger test in `packages/engine/test/unit/cnl/agent-module-diagnostics.test.ts` (sibling to the existing `agent-selector-diagnostics.test.ts`); (b) conformance: one module bound to a Spec 181 selector for FITL (per-game Foundation #16 coverage for the modules layer is partial in this spec; Texas Hold'em conformance is gated on a Spec 181 selector being authored for that profile — see §2 Out of scope); (c) one ARVN top-level action grouping (`build-political-engine` per proposal §14.1) is authored as a new module + selector binding + grouped score (this is net-new authoring rather than a refactor of an existing consideration — `data/games/fire-in-the-lake/92-agents.md` does not currently declare such a grouping); the Spec 181 ARVN action-distribution probe still passes (or improves); (d) trace top-K and ordering tests cover `modules.active` and `modules.inactiveTopReasons`; (e) module evaluation overhead stays within the Spec 181 §8 Phase 0 acceptance (e) per-probe budget (< 200 ms) and the campaign-runner per-decision soft budget; module activation caching test asserts state-scoped activation evaluates exactly once per decision. | M |
| **Phase 3** — Guardrails with severity tiers | New `guardrails` library bucket; severity semantics §5.3; pass-fallback integration §5.4; compiler diagnostics §5.5; migration of all repository-owned `pruningRules` entries — both data-file YAML (`data/games/**/*.md`) AND engine test fixtures (`packages/engine/test/**`) — to `guardrails` with `severity: prune` per §5.1.1 mapping; removal of `pruningRules` bucket; trace integration §5.7 | (a) All §5.5 diagnostic codes covered by tests; (b) one `severity: prune, safe: true` guardrail conformance test against FITL (asserting `onAllPruned` fires and the published fallback frame matches the declared action); (c) one `severity: demote` guardrail conformance test (asserting score penalty and trace marker); (d) one `severity: warn` and one `severity: auditOnly` guardrail conformance test (asserting trace markers and zero score effect); (e) `pruningRules` migration ticket converts every repository entry (data files AND test fixtures) and the compiler error `CNL_COMPILER_AGENT_GUARDRAIL_PRUNINGRULES_DEPRECATED` fires on any reintroduction; (f) replay determinism test asserts that a profile using guardrails produces bit-identical decisions across two runs; (g) post-migration architectural test asserts no engine test file references the deprecated `pruningRules` bucket. | M |
| **Phase 4** — Turn-shape evaluators | New `turnShapeEvaluators` library bucket; compiled IR §6.2; runtime evaluation §6.5; compiler diagnostics §6.4; trace integration §6.6; cookbook entry | (a) All §6.4 diagnostic codes covered by tests; (b) architectural-invariant test asserts no turn-shape evaluator triggers an additional preview drive (new probe modeled on Spec 181 §4.2's `selectedNotByReason` assertion at `packages/engine/test/policy-profile-quality/probes/assertions/selected-not-by-reason.ts`, extended for this scope); (c) conformance: one turn-shape evaluator against FITL declaring `self-standing` + `leader-denial` objectives, validated by an audit probe that observes `minimumImpactSatisfied` true/false trajectories across a 15-seed scenario; (d) one new probe modeled on the existing Spec 181 harness pattern asserts `turnShape.<id>.minimumImpactSatisfied` across a 15-seed scenario, proving the new layer is testable through the established harness (this is a net-new probe, not a modification of an existing Spec 181 probe); (e) replay determinism test for evaluator-using profile. | M–L |

Each phase is independently mergeable. Phase 2 lands first because Phases 3 and 4 read `module.<id>.*` refs (guardrails for activation gating, turn-shape evaluators for objective-comparison gating).

## 10. Test plan

- **Compiler diagnostic coverage**: One test per diagnostic code in §4.4, §5.5, §6.4 under `packages/engine/test/unit/cnl/` (matching the established convention for compiled-IR diagnostic tests; cf. `agent-selector-diagnostics.test.ts`).
- **Runtime determinism**: Per-phase replay tests in `packages/engine/test/determinism/` asserting bit-identical decision streams for module-, guardrail-, and turn-shape-using profiles across two runs at the same seed.
- **Conformance corpus per Foundation #16**: Module, guardrail, and turn-shape evaluator usage tested across the games currently in the conformance corpus that have adopted the relevant prerequisite layers — at landing, FITL (asymmetric, area-control, hidden-info) is the only such game. Texas Hold'em conformance for the modules layer is gated on a Spec 181 selector being authored for that profile (see §2 Out of scope). Broader Foundation #16 corpus expansion (e.g., adding a perfect-information fixture game) is project-wide work outside this spec's scope.
- **Pass-fallback integration**: Test that `severity: prune, safe: true, onAllPruned: <pass-tagged action>` correctly publishes the fallback frame when the post-prune frontier is empty, and that the trace records `POLICY_GUARDRAIL_ALL_PRUNED_FALLBACK`.
- **Trace ordering**: Tests for top-K caps and deterministic ordering across `modules.active`, `modules.inactiveTopReasons`, `guardrails.fired`, `guardrails.notFiredTop`, `turnShape.evaluators`.
- **Module → guardrail integration**: Test that a guardrail reading `module.<id>.active` correctly gates its `when` clause without circular dependency (compiler check `CNL_COMPILER_AGENT_GUARDRAIL_DEPENDENCY_CYCLE` should still pass; runtime should evaluate modules before guardrails).
- **Turn-shape → probe integration**: A new probe modeled on the existing Spec 181 harness pattern asserts `turnShape.<id>.minimumImpactSatisfied` and correctly observes both true and false trajectories from the existing inner-preview substrate; no new preview drive fires (architectural-invariant probe).
- **Migration completeness**: After Phase 3 lands, an architectural test asserts that no `pruningRules` entries remain in any repository-owned GameSpecDoc, profile YAML, OR engine test fixture (per Phase 3 acceptance (g)); `CNL_COMPILER_AGENT_GUARDRAIL_PRUNINGRULES_DEPRECATED` fires on intentional reintroduction.
- **Profile-quality lint warnings**: Tests for `POLICY_PROFILE_QUALITY_GUARDRAIL_RARELY_SAFE` (uniform-firing prune guardrail), `POLICY_PROFILE_QUALITY_GUARDRAIL_FIRES_UNIFORM` (constant-shift demote guardrail). Additional weight-soup lint warnings (proposal §11.2) belong in Spec 183 and are NOT covered here.

## 11. Foundation alignment

| Foundation | How the design respects it |
| --- | --- |
| **#1 Engine Agnosticism** | Modules, guardrails, and turn-shape evaluators operate on game-authored tags, conditions, selectors (Spec 181), and standing-role primitives (Spec 180). The kernel learns no game semantics. The ARVN cookbook migration moves authoring shape; the engine sees only generic refs. |
| **#2 Evolution-First Design** | New library buckets are YAML-authorable inside GameSpecDoc agent definitions. Module / guardrail / turn-shape defs are part of evolution's mutation surface; no new artifact outside YAML carries configuration. |
| **#5 One Rules Protocol** | Modules score the existing published legal frontier; they never create or hide actions. Hard-prune guardrails consume the existing pass-fallback contract Spec 144 introduced via Foundation #18 (see `archive/specs/144-probe-and-recover-microturn-publication.md`) for `onAllPruned`. Microturn-bound modules and guardrails operate on `microturn.options` produced by the same kernel pipeline. |
| **#7 Specs Are Data** | All IR is declarative. No `eval`, no embedded scripts, no runtime callbacks. Expressions are NumericExpr / BoolExpr nodes validated by the compiler. |
| **#8 Determinism Is Sacred** | Module activation, guardrail evaluation, and turn-shape evaluation are pure; integer arithmetic; deterministic ordering; cache keys are state / preview-status snapshots. Replay tests assert bit-identical outcomes per phase. |
| **#10 Bounded Computation** | Module activation evaluates at the cheapest scope its `when` clause permits; guardrail evaluation reuses existing scope cost classes; turn-shape evaluators are bounded by `TurnShapeBoundsSpec.maxSyntheticDecisions` and consume only already-driven preview drives (no implicit expansion). Cap-class enforcement reuses Spec 164's registry. |
| **#14 No Backwards Compatibility** | Phase 3 migration converts all `pruningRules` to `guardrails` in the same change; the `pruningRules` bucket is removed; compiler error gates reintroduction. No compatibility shim. |
| **#16 Testing as Proof** | Conformance corpus spans three game families per Phase 2 acceptance (b) and Phase 3 acceptance criteria. Probe harness (Spec 181 §4) validates module / guardrail / turn-shape behavior; per-phase replay tests prove determinism. |
| **#18 Constructibility Is Part of Legality** | Hard-prune guardrails MUST declare `onAllPruned` resolving to a `tags: [pass]` action; runtime asserts the fallback frame is constructible (mirroring the existing `legal-moves.ts:1594-1599` pass-fallback path Spec 144 introduced); compiler verifies the tag at compile time. Modules and turn-shape evaluators never alter the published frontier; they only score. |
| **#20 Preview Signal Integrity** | Guardrail predicates reading preview refs MUST declare `onUnavailable`; the compiler enforces. Turn-shape evaluator objectives reading preview refs inherit Foundation #20 via the explicit `onPreviewUnavailable` clause. No layer can pretend bounded preview is ready preview. |

**No FOUNDATIONS.md amendment proposed.** The existing principles cover the new primitives.

## 12. Out of scope (named follow-on spec)

- **Spec 183 — Evolution-loop overhaul**. Composite acceptance metric (margin + win-rate + audit-probe score − blunder / no-signal / fallback / complexity / performance penalties), weight-soup lint diagnostics (proposal §11.2), MAP-Elites-style quality-diversity archive over behavior descriptors, per-mutation rationale tracking, structure-first mutation ordering. Lives in `campaigns/` + `.claude/skills/improve-loop`, not engine. Depends on this spec's probe-validated module / guardrail / turn-shape trace surfaces.

## 13. Reassessment of source proposal

Per-recommendation disposition table for `reports/ai-agent-overhaul-proposal.md` sections that Spec 181 §11 deferred to this spec. Sections already covered by Spec 181 are not repeated. Sections deferred to Spec 183 are noted.

| Proposal section / recommendation | Disposition | Notes |
| --- | --- | --- |
| §6.1 Strategic modules | **Adopted as Phase 2** — see §4 of this spec. The ARVN cookbook migration (§14.1, §14.2, §14.3) is partially adopted: one top-level module conformance lands here (Phase 2 acceptance (c)); broader migration follows in subsequent ticket work outside this spec's mandatory scope. |
| §6.4 Guardrails | **Adopted as Phase 3** — see §5 of this spec. Severity tiers, `safe: true` + `onAllPruned` for hard prune, and demote-as-default-over-prune all encoded. |
| §6.5 Turn-shape evaluators | **Adopted as Phase 4** — see §6 of this spec. Bounded summaries reuse Spec 164's inner-preview substrate; no new search introduced. |
| §7.4 No-impact handling (`minImpact` / `ifNoImpact: demote/warn/allowWithTrace`) | **Adopted across Phases 2-3** — module `ifSelectorEmpty: demoteAndTrace` plus guardrail `severity: demote/warn/auditOnly` together cover the no-impact handling tiers. |
| §7.5 chooseOne option metadata | **Already covered by Spec 181's selector trace surface** (§5.3 `selector.<id>.selected.*` refs); this spec adds module-level grouping of those refs (§4.6 trace). |
| §7.6 chooseNStep set-level primitives (`coverage`, `redundancyPenalty`, `diversity`, `completionValue`, `removeValue`, `marginalGain`) | **Adopted as module score-group terms** — §8 edge cases describes how set-level primitives compile to module-authored terms over Spec 181 selector outputs. No new IR primitive introduced. |
| §8 Guardrails and anti-blunder system | **Adopted as Phase 3** — see §5. The example generic guardrail list in proposal §8 maps onto authored guardrail YAML; no engine-specific guardrail catalog. |
| §10 Strategy trace and explanation contract | **Adopted incrementally** — Phase 2 ships module trace surface (§4.6), Phase 3 ships guardrail trace surface (§5.7), Phase 4 ships turn-shape trace surface (§6.6). Top-K caps and interned-id discipline honor the proposal's defaults. |
| §11 Evolution-loop changes (structure-first mutation order, composite acceptance, quality-diversity archive, profile complexity penalties) | **Deferred to Spec 183** — lives outside the engine in the campaign runner. |
| §13 Performance model and benchmark gates | **Adopted as per-phase acceptance budgets** — module activation overhead bounded by Phase 2 acceptance (e); guardrail and turn-shape overhead bounded by Spec 181's probe-budget pattern. Per-mutation perf gates (5%/10%/2× thresholds from proposal §13.7) are operationalized in Spec 183. |
| §14 FITL/ARVN application example | **Adopted as conformance work** — Phase 2 acceptance (c) requires one ARVN module migration matching the `build-political-engine` shape in proposal §14.1. Phase 3 conformance includes one anti-overfit guardrail similar to proposal §14.5. Full ARVN cookbook migration deferred to subsequent ticket work (not part of this spec's mandatory acceptance). |
| §17 Stage 1 (lint + trace grouping) | **Adopted across Phases 2-3** — module trace grouping is the lint-equivalent for the module layer; guardrail severity tiers replace the proposal's "audit-only warning" framing. Additional profile-quality lint warnings beyond `GUARDRAIL_RARELY_SAFE` / `GUARDRAIL_FIRES_UNIFORM` (the proposal's "weight soup" lint set in §11.2) belong to Spec 183 because they're evolution-loop signals, not engine diagnostics. |
| §17 Stage 7 (Optional influence fields) | **Dropped** — see §2. With selectors / modules / guardrails / turn-shape evaluators in place, influence fields collapse into niche perf optimization. Re-open in a fresh spec only if profile-quality evidence shows the missing primitive blocks real authoring. |
| Proposal-wide claim that evolution loop "mutates numeric weights only" | **Already corrected by Spec 181 §3.4 / §12** — `.claude/skills/improve-loop` + `campaigns/fitl-arvn-agent-evolution/program.md` already mutate YAML structure. Re-ordering and rationale tracking are Spec 183 concerns. |
| **FOUNDATIONS.md amendments** | **None proposed** — existing #1, #2, #5, #7, #8, #10, #14, #16, #18, #20 cover the new primitives. Spec 180 already extended #20 for the standing-role substrate and Spec 181 §10 already extended trace-contract integrity for the selector layer. |

## 14. Follow-On Tickets

**Namespace**: `182STRSTRPOL2`

Anticipated decomposition (finalized by `/spec-to-tickets`):

- **Phase 2 — Strategic Modules**: compiler bucket + diagnostics (one or two tickets), runtime evaluator + activation caching (one ticket), trace integration (one ticket), FITL conformance test (one ticket), ARVN `build-political-engine` module + selector binding + cookbook entry (one ticket).
- **Phase 3 — Guardrails with severity tiers**: compiler bucket + diagnostics (one or two tickets), runtime evaluator + severity dispatch (one ticket), trace integration (one ticket), `pruningRules` → `guardrails` migration + bucket removal — single atomic ticket per §5.1 + §5.1.1, covering both data files AND engine test fixtures (this is the Foundation #14 cleanup), conformance tests per severity tier (one ticket each).
- **Phase 4 — Turn-shape evaluators**: compiler bucket + diagnostics (one ticket), runtime evaluator + bounded chain consumption (one ticket), trace integration (one ticket), no-additional-preview-drive architectural-invariant probe (one ticket), conformance test (one ticket).

**Ordering**: Phase 2 tickets land before Phase 3 begins; Phase 3 tickets land before Phase 4 begins (because Phase 4 evaluators may attach to modules whose guardrails handle the no-impact fallback).

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-18 (namespace `182STRSTRPOL` — user-supplied; differs from spec's self-suggested `182STRSTRPOL2`):

- [`archive/tickets/182STRSTRPOL-001.md`](../archive/tickets/182STRSTRPOL-001.md) — Phase 2 — Strategic modules library bucket + compiled IR + compiler diagnostics
- [`archive/tickets/182STRSTRPOL-002.md`](../archive/tickets/182STRSTRPOL-002.md) — Phase 2 — Strategic modules runtime evaluator + activation caching + dispatch insertion
- [`archive/tickets/182STRSTRPOL-003.md`](../archive/tickets/182STRSTRPOL-003.md) — Phase 2 — Strategic modules trace contract extension
- [`archive/tickets/182STRSTRPOL-004.md`](../archive/tickets/182STRSTRPOL-004.md) — Phase 2 — FITL strategic module conformance test
- [`archive/tickets/182STRSTRPOL-005.md`](../archive/tickets/182STRSTRPOL-005.md) — Phase 2 — ARVN `build-political-engine` module authoring + cookbook entry
- [`archive/tickets/182STRSTRPOL-006.md`](../archive/tickets/182STRSTRPOL-006.md) — Phase 3 — Guardrails library bucket + compiled IR + compiler diagnostics
- [`archive/tickets/182STRSTRPOL-007.md`](../archive/tickets/182STRSTRPOL-007.md) — Phase 3 — Guardrails runtime evaluator + severity dispatch + basic trace population
- [`archive/tickets/182STRSTRPOL-008.md`](../archive/tickets/182STRSTRPOL-008.md) — Phase 3 — Pass-fallback runtime integration (`onAllPruned`) + `allPrunedFallback` trace
- [`archive/tickets/182STRSTRPOL-009.md`](../archive/tickets/182STRSTRPOL-009.md) — Phase 3 — Guardrail trace formatting (top-K caps + deterministic ordering)
- [`archive/tickets/182STRSTRPOL-010.md`](../archive/tickets/182STRSTRPOL-010.md) — Phase 3 — Migration atomic: `pruningRules` → `guardrails` (data + tests + bucket removal)
- [`archive/tickets/182STRSTRPOL-011.md`](../archive/tickets/182STRSTRPOL-011.md) — Phase 3 — Guardrail conformance tests (4 severity tiers)
- [`archive/tickets/182STRSTRPOL-012.md`](../archive/tickets/182STRSTRPOL-012.md) — Phase 3 — Guardrail profile-quality lint warnings (`RARELY_SAFE` + `FIRES_UNIFORM`)
- [`archive/tickets/182STRSTRPOL-018.md`](../archive/tickets/182STRSTRPOL-018.md) — Phase 3 — Define and implement guardrail ref contract
- [`archive/tickets/182STRSTRPOL-013.md`](../archive/tickets/182STRSTRPOL-013.md) — Phase 4 — Turn-shape evaluators library bucket + compiled IR + compiler diagnostics
- [`archive/tickets/182STRSTRPOL-014.md`](../archive/tickets/182STRSTRPOL-014.md) — Phase 4 — Turn-shape evaluator runtime + bounded chain consumption
- [`archive/tickets/182STRSTRPOL-015.md`](../archive/tickets/182STRSTRPOL-015.md) — Phase 4 — Turn-shape evaluator trace contract extension
- [`archive/tickets/182STRSTRPOL-016.md`](../archive/tickets/182STRSTRPOL-016.md) — Phase 4 — Architectural-invariant probe (no additional preview drive)
- [`tickets/182STRSTRPOL-017.md`](../tickets/182STRSTRPOL-017.md) — Phase 4 — FITL turn-shape evaluator authoring + `minimumImpactSatisfied` conformance probe
