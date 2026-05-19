# Spec 183 — Evolution-Loop Overhaul: Composite Acceptance, Weight-Soup Lint, and Quality-Diversity Archive

**Status**: PROPOSED
**Priority**: Medium-High — turns the engine-layer surfaces shipped in Specs 181 and (forthcoming) 182 into evolution-pipeline signal, closes the proposal-documented "tournament margin too sparse and too terminal" failure mode in `reports/ai-agent-overhaul-proposal.md` §2 and §11, and prevents the "Govern with a slightly different patronage coefficient" convergence the May-17 ARVN report (`archive/reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md`) exposed.
**Complexity**: M–L — three independently mergeable phases. Phase A (composite acceptance) is M and lands first because Phases B and C consume the per-decision metric surface it standardizes. Phase B (weight-soup lint diagnostics + per-mutation rationale tracking) is S–M. Phase C (MAP-Elites-style quality-diversity archive over behavior descriptors) is M–L.
**Date**: 2026-05-18
**Dependencies**:
- `archive/specs/181-structured-strategy-policy-layer-probes-and-selectors.md` (audit probe harness as the validation surface for new acceptance metrics; selector trace surface as one input to behavior descriptors)
- `archive/specs/182-structured-strategy-policy-layer-modules-guardrails-and-turn-shape.md` (module trace, guardrail fired-counts, and turn-shape `minimumImpactSatisfied` surfaces feed multiple acceptance penalties and behavior descriptors; lint warnings extend Spec 182's profile-quality warning set)
- `archive/specs/180-standing-vector-observability-and-outer-preview-signal-integrity.md` (per-seat trace matrix feeds leader-denial-rate and self-improvement-rate behavior descriptors)
- `archive/specs/164-continued-inner-preview-deepening.md` (cap-class registry — performance-penalty acceptance term inspects which cap class was active)

**Trigger reports**:
- `reports/ai-agent-overhaul-proposal.md` (external ChatGPT-Pro deep-research proposal — §11 Evolution-loop changes, §11.1 Acceptance criteria composite, §11.2 Weight-soup lint, §11.3 Quality-diversity archive, §13 Performance model and benchmark gates, §17 Stage 8 evolution-loop overhaul)
- `archive/reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md` (original witness that triggered the structured-strategy work — uniform preview without acceptance penalty for low-information signal is exactly the gap composite acceptance must close)

**Ticket namespace**: `183EVOLOOP` (proposed; finalize during ticket decomposition)

---

## 1. Goal

Three campaign-runner changes that turn Specs 181 and 182's per-decision engine surfaces into evolution-pipeline signal and prevent the failure modes the trigger reports documented:

1. **Composite acceptance metric (Phase A).** Replace the current "average margin + win-rate bonus" acceptance check with a deterministic composite over per-decision and per-game evidence: tournament margin, win rate, audit-probe pass rate, blunder count, no-signal count, fallback rate, profile complexity, runtime overhead, and explanation coverage. Each term has a documented derivation path that consumes existing trace fields; no new engine instrumentation is required beyond what Specs 181 and 182 ship.

2. **Weight-soup lint diagnostics + per-mutation rationale tracking (Phase B).** Profile-quality lint warnings that fire when authoring shape regresses toward flat utility sludge: too many ungrouped considerations, modules never active in the probe corpus, selectors never selected, guardrails always unknown, dead refs, suspicious weight scale, low explanation coverage, profile-LOC growth without probe / tournament improvement. Each accepted mutation MUST carry a structured rationale entry (what strategic failure was observed, which module / selector / guardrail addresses it, which probes should improve, which tournament metric should improve, expected performance cost, rollback condition) so the evolution log becomes auditable instead of opaque.

3. **MAP-Elites-style quality-diversity archive (Phase C).** Maintain an elite archive across behavior descriptors (action-family mix, module-activation mix, target-selector pass rate, guardrail-warning rate, self-gain-vs-opponent-denial ratio, leader-help rate, preview-readiness profile, complexity bucket, runtime-cost bucket) so evolution discovers qualitatively different strategies rather than converging on a single global winner. The archive lives alongside the existing campaign-state files in `campaigns/<campaign>/`; it is consumed by the improve-loop skill's selection step.

Performance rollback gates (proposal §13.7 — 5% wall-clock regression, 10% heap, 2× trace bytes) are operationalized as composite-acceptance terms in Phase A, so a mutation that breaks any gate is auto-rejected.

## 2. Non-Goals

- **No engine changes.** This spec lives entirely outside `packages/engine/`. All inputs are pre-existing engine outputs: `PolicyAgentDecisionTrace` fields, probe harness results (Spec 181 §4), module / guardrail / turn-shape trace surfaces (Spec 182), and standard tournament outputs. No new kernel primitives, no new compiler diagnostics, no new IR. If a needed signal is missing from the trace, the work is to either extend the relevant engine spec (181 or 182) or restate the acceptance term in terms of available signal.
- **No CLI / runner UI changes.** This spec touches `campaigns/<campaign>/program.md`, the corresponding `*.mjs` orchestration scripts, the `.claude/skills/improve-loop/` skill body, and any campaign-state JSONL files those consume. It does NOT modify the React runner, PixiJS layer, evaluation report templates beyond what is required for the new rationale entries, or any runtime-rendered UI.
- **No runtime planner.** MAP-Elites is offline archive bookkeeping over completed evaluation runs. Quality-diversity selection happens before the next mutation, not during agent execution.
- **No back-port to existing campaigns' historical archives.** When Phase C lands, only forward-going mutations populate the archive. Existing campaign history (the `.jsonl` files under `campaigns/<campaign>/`) is left untouched per Foundation #13's reproducibility commitment — historical runs remain meaningful via their pinned engine version / spec hash; they do not retroactively gain behavior-descriptor coverage.
- **No FOUNDATIONS.md amendment.** Foundation #13 (Artifact Identity and Reproducibility) is the relevant principle and is already worded to cover this work. The composite acceptance metric, lint warnings, and quality-diversity archive are all deterministic over pinned inputs.
- **No mandatory adoption by all campaigns.** Existing campaigns (`fitl-arvn-agent-evolution`, `fitl-vc-agent-evolution`, `texas-agent-evolution`, etc.) opt in per-campaign. Phase A acceptance requires only one campaign migrated as conformance proof; the rest can migrate incrementally outside this spec's scope.

## 3. Context (verified against codebase)

### 3.1 Current state of the evolution loop

`campaigns/` contains the campaign families (`fitl-arvn-agent-evolution`, `fitl-vc-agent-evolution`, `texas-agent-evolution`, `fitl-perf-optimization`, `fitl-preview-perf`, `texas-perf-optimization`, `phase3-microturn`, `phase4-probe-recover`). The ARVN campaign's `program.md` and accompanying `.mjs` scripts (`diagnose-*.mjs`, `harness.sh`, `checkpoints.jsonl`, `lessons.jsonl`) implement the current loop:

- Run a 15-seed tournament with the candidate profile against baselines.
- Compute average victory margin and win rate.
- Accept if both improve over the rolling baseline by a configured threshold.
- Append a checkpoint entry to `checkpoints.jsonl` and a lesson entry to `lessons.jsonl`.

`.claude/skills/improve-loop/SKILL.md` orchestrates the mutate → evaluate → accept-or-rollback iterations. The skill already mutates YAML structure (conditions, pruning rules, aggregates) per Spec 181 §3.4's correction of the proposal's stale "weights only" framing.

The verified gap: there is no place for per-decision signal (probe pass rate, no-signal selection count, guardrail-warn count, module activation mix, selector pass rate) to influence acceptance. Tournament margin can be flat across all candidates while preview is uniformly low-information — exactly the May-17 ARVN witness — and the acceptance check has nothing to penalize that with.

### 3.2 What Spec 181 and Spec 182 surface

- Spec 181 ships per-probe pass / fail / regression-warning counts (`POLICY_PROFILE_QUALITY_REGRESSION` summary entries) and per-decision selector trace (`selector.<id>.selected.*` refs and the `selectors` field on `PolicyAgentDecisionTrace`).
- Spec 182 will ship module activation trace (`modules.active`, `modules.inactiveTopReasons`), guardrail fired / not-fired counts with severity (`guardrails.fired`, `guardrails.notFiredTop`, `allPrunedFallback`), and turn-shape evaluator `minimumImpactSatisfied` per-decision.
- Spec 180 already ships per-seat trace matrix consumable for leader-denial-rate and self-improvement-rate behavior descriptors.
- Existing trace fields (Spec 121, Spec 162, Spec 164) already expose: pruning counts, `tiebreakAfterPreviewNoSignal` reason, preview ref status (`ready / partial / unavailable`), inner-preview cap-class identity.

The acceptance composite and behavior descriptors are computed from already-existing trace fields plus the Spec 182 additions. No new instrumentation is needed.

### 3.3 What the May-17 witness demonstrated

`archive/reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md` showed ARVN selecting Govern 75% of decisions across 15 seeds with NVA projected margin 100% uniform. Tournament margin barely shifted across candidates because the policy could not discriminate. Under the current acceptance check, a mutation that produces uniform low-information preview is indistinguishable from a mutation that produces honest differentiating preview — both pass if tournament margin holds. The composite acceptance metric closes this gap by adding `no-signal selected count` and `preview uniformity rate` as explicit penalties, both available from existing trace fields.

## 4. Architecture — Phase A: Composite Acceptance Metric

### 4.1 Acceptance formula

```
acceptance = tournamentMarginScore
           + winRateScore
           + auditProbeScore
           − blunderPenalty
           − noSignalPenalty
           − fallbackPenalty
           − complexityPenalty
           − performancePenalty
           + explanationCoverageScore
```

Each term has a documented per-trace derivation; each derivation lives as a small TypeScript module under `campaigns/<campaign>/acceptance/` so unit tests can pin the math.

| Term | Derivation source | Sign | Notes |
| --- | --- | --- | --- |
| `tournamentMarginScore` | Existing tournament aggregator (mean margin across the configured seed set; existing field) | + | Unchanged from current loop — this term is the baseline. |
| `winRateScore` | Existing tournament aggregator (win-rate; existing field) | + | Unchanged. |
| `auditProbeScore` | Spec 181 probe harness pass count / total | + | New. Profile-quality probe pass counts as +1 per pass; architectural-invariant probe failure short-circuits the entire acceptance check (per Spec 181 §4.4 hard-gate semantics). |
| `blunderPenalty` | Spec 182 guardrail-fired count, weighted by severity (`prune` × 0 because pruned candidates can't be selected; `demote` × 1; `warn` × 0.25; `auditOnly` × 0) | − | New. |
| `noSignalPenalty` | Existing `tiebreakAfterPreviewNoSignal` selection count (Spec 162 / Foundation #20) | − | Decisions selected by no-signal fall-back are evidence the policy is flying blind. Each such selection deducts one penalty point. |
| `fallbackPenalty` | Sum of (a) preview-ref `unavailableWithFallback` selection contribution counts; (b) Spec 182 module `ifSelectorEmpty: demoteAndTrace` fires; (c) Spec 182 guardrail `onAllPruned` fallback frame counts | − | Fallback is legitimate but lossy; the penalty steers evolution toward profiles that minimize it. |
| `complexityPenalty` | Profile LOC / term count vs configured cap (the cap is per-campaign in `program.md`) | − | New. |
| `performancePenalty` | Wall-clock and heap deltas vs rolling baseline; trace-bytes delta vs rolling baseline | − | Each axis has a hard threshold (proposal §13.7: 5% wall-clock, 10% heap, 2× trace bytes for `summary` mode); exceeding any one threshold makes the penalty term infinite (acceptance check fails). Cap-class identity from Spec 164 is recorded in the per-mutation rationale so a performance regression can be attributed to a cap-class change. |
| `explanationCoverageScore` | Fraction of selected decisions whose trace includes at least one named active module (Spec 182 `modules.active` non-empty) | + | A profile that selects via strategy rather than tiebreak / no-signal earns this term. |

### 4.2 Per-campaign acceptance configuration

Each campaign's `program.md` declares acceptance weights, complexity cap, performance baselines, and rollback thresholds in a structured frontmatter block. The `.claude/skills/improve-loop` skill reads this block per evaluation cycle.

```yaml
acceptance:
  weights:
    tournamentMargin: 1.0
    winRate: 0.5
    auditProbe: 0.25
    blunder: -1.0
    noSignal: -0.5
    fallback: -0.5
    complexity: -0.25
    performance: -1.0
    explanationCoverage: 0.5
  complexity:
    profileLocCap: 800            # per-campaign override
    termCountCap: 200
  performance:
    wallClockBaselineMs: <number>
    heapBaselineBytes: <number>
    summaryTraceBytesBaseline: <number>
    wallClockRegressionThreshold: 0.05
    heapRegressionThreshold: 0.10
    traceBytesRegressionThreshold: 2.0
  hardGates:
    architecturalProbeFailure: true   # any arch-invariant probe failure rejects regardless of composite score
    performanceThresholdExceeded: true
```

Acceptance weights and thresholds are version-pinned per campaign per Foundation #13; changing them creates a new acceptance epoch the rationale log records.

### 4.3 Determinism contract

Composite acceptance MUST be deterministic over the pinned inputs (engine version, GameDef hash, profile YAML hash, scenario id, seed set, acceptance configuration). A unit test in `campaigns/<campaign>/__tests__/composite-acceptance.test.ts` asserts that computing acceptance twice over the same inputs yields the same numeric result and the same accept / reject verdict.

## 5. Architecture — Phase B: Weight-Soup Lint + Per-Mutation Rationale Tracking

### 5.1 Profile-quality lint warnings

Lint warnings live in a new `campaigns/<campaign>/lint/` directory and emit `POLICY_PROFILE_QUALITY_LINT_<NAME>` summary entries consistent with the existing `POLICY_PROFILE_QUALITY_REGRESSION` mechanism Spec 181 §4.4 introduced. They are NON-BLOCKING by default; each campaign can elevate specific warnings to acceptance penalties via the `acceptance.weights.lint.<NAME>` configuration entry.

Initial lint set (per proposal §11.2):

| Lint code | Trigger |
| --- | --- |
| `POLICY_PROFILE_QUALITY_LINT_UNGROUPED_CONSIDERATIONS` | Count of considerations not assigned to any Spec 182 module exceeds a configured threshold |
| `POLICY_PROFILE_QUALITY_LINT_ACTION_TAG_WEIGHT_WITHOUT_SELECTOR` | A consideration carries an action-tag weight but reads no Spec 181 selector ref |
| `POLICY_PROFILE_QUALITY_LINT_LARGE_ABSOLUTE_WEIGHT` | A consideration's weight exceeds a configured magnitude threshold (the proposal's "very large absolute weights" lint) |
| `POLICY_PROFILE_QUALITY_LINT_DUPLICATE_OR_NEAR_DUPLICATE_TERM` | Two considerations have structurally identical (or near-identical) NumericExpr trees |
| `POLICY_PROFILE_QUALITY_LINT_MODULE_NEVER_ACTIVE` | A Spec 182 module's `when` clause never evaluated true across the probe corpus |
| `POLICY_PROFILE_QUALITY_LINT_SELECTOR_NEVER_SELECTED` | A Spec 181 selector's `selected.matches` was never true across the probe corpus |
| `POLICY_PROFILE_QUALITY_LINT_PREVIEW_REF_UNIFORM` | A preview ref's value distribution across candidates falls below a configured variance threshold for ≥ N decisions (the May-17 ARVN witness pattern) |
| `POLICY_PROFILE_QUALITY_LINT_TIEBREAK_OR_NOSIGNAL_DOMINATES` | Selected-by-tiebreak / no-signal rate exceeds a configured threshold |
| `POLICY_PROFILE_QUALITY_LINT_SCORE_DOMINATED_BY_SINGLE_SCALAR` | One score-group contribution accounts for > N% of the selected candidate's score across decisions |
| `POLICY_PROFILE_QUALITY_LINT_PROFILE_LOC_EXCEEDS_CAP` | Profile LOC / term count exceeds the per-campaign cap |
| `POLICY_PROFILE_QUALITY_LINT_COMPLEXITY_GROWTH_WITHOUT_IMPROVEMENT` | Per-mutation rationale entry shows complexity grew but neither probe pass rate nor tournament margin improved |

Lint runs as part of each evaluation cycle; warnings are summarized in the campaign's per-cycle report.

### 5.2 Per-mutation rationale schema

Each accepted mutation appends a structured rationale entry to `campaigns/<campaign>/rationale.jsonl`. Schema (illustrative):

```json
{
  "schemaVersion": 1,
  "mutationId": "...",
  "engineVersion": "...",
  "specHashes": {
    "gameDef": "...",
    "profile": "..."
  },
  "observedFailure": "ARVN selecting Govern 75% across 15 seeds; uniform NVA preview",
  "addresses": {
    "modules": ["build-political-engine"],
    "selectors": ["politically-valuable-location"],
    "guardrails": ["political-action-while-board-collapsing"],
    "turnShapeEvaluators": []
  },
  "expectedProbeImprovements": ["arvn-action-distribution-not-dominated"],
  "expectedTournamentMetricImprovements": ["meanMargin", "winRate"],
  "expectedPerformanceCost": {
    "wallClockMsDelta": 12,
    "heapBytesDelta": 4096,
    "summaryTraceBytesDelta": 64
  },
  "rollbackCondition": "If meanMargin regresses > 2% over rolling 20-evaluation window without probe pass-rate gain ≥ 5%",
  "compositeAcceptance": {
    "value": ...,
    "termBreakdown": { ... }
  }
}
```

A mutation MUST NOT be accepted without a rationale entry. The compiler-equivalent here is a campaign-runner pre-acceptance check; the rationale entry's schema is validated by a Zod schema at `campaigns/<campaign>/rationale-schema.ts`.

### 5.3 Acceptance integration

The improve-loop skill reads the rationale entry's `rollbackCondition` field on each subsequent evaluation cycle. When the condition fires, the mutation is rolled back automatically and a rollback entry is appended to `rationale.jsonl` documenting the trigger.

## 6. Architecture — Phase C: Quality-Diversity Archive (MAP-Elites)

### 6.1 Behavior descriptors

Each accepted mutation produces a behavior-descriptor tuple from the per-decision and per-game trace evidence. Initial descriptor set (per proposal §11.3):

| Descriptor | Derivation source | Bucketing |
| --- | --- | --- |
| `actionFamilyMix` | Per-decision action-tag distribution (existing) | Top-3 dominant action-families bucketed by relative share (0-20% / 20-40% / 40-60% / 60-80% / 80-100%) |
| `moduleActivationMix` | Spec 182 `modules.active` across decisions | Top-3 most-activated modules bucketed by activation rate |
| `targetSelectorPassRate` | Spec 181 `selector.<id>.impactSatisfied` true rate | 0-25% / 25-50% / 50-75% / 75-100% |
| `guardrailWarningRate` | Spec 182 `guardrails.fired` warn count / decisions | 0-5% / 5-15% / 15-30% / 30%+ |
| `selfGainVsOpponentDenialRatio` | Spec 180 per-seat trace matrix self-delta vs leader-delta ratio | < 0.5 / 0.5-1.0 / 1.0-2.0 / > 2.0 |
| `leaderHelpRate` | Spec 180 per-seat trace where selected candidate increased current leader's standing | 0-5% / 5-15% / 15-30% / 30%+ |
| `previewReadinessProfile` | Distribution of preview ref `ready` vs `unavailableWithFallback` vs `partial` | Modal bucket |
| `complexityBucket` | Profile LOC | Quartile relative to per-campaign cap |
| `runtimeCostBucket` | Wall-clock per decision | Quartile relative to per-campaign baseline |

### 6.2 Archive shape

The archive lives at `campaigns/<campaign>/quality-diversity-archive.jsonl`. Each line is one elite entry:

```json
{
  "schemaVersion": 1,
  "behaviorDescriptor": { ... },                 // tuple of bucket values per §6.1
  "compositeAcceptance": ...,                    // numeric score for the elite
  "mutationId": "...",
  "specHashes": { "gameDef": "...", "profile": "..." },
  "engineVersion": "...",
  "createdAt": "<ISO8601>"
}
```

Each behavior-descriptor cell holds at most one elite (the highest-acceptance mutation observed for that cell). When a new mutation lands in an occupied cell, the higher-acceptance entry wins; ties break by `(specHashes.profile asc)` for determinism.

### 6.3 Selection integration

The improve-loop skill's mutation-selection step can target elites from underrepresented archive cells, biasing exploration toward diverse strategies. The selection algorithm is a per-campaign configuration; an initial implementation samples uniformly across non-empty cells with a configurable explore / exploit tradeoff.

### 6.4 Determinism contract

Archive insertion MUST be deterministic over pinned inputs. A unit test asserts that re-deriving behavior descriptors for an existing elite produces the same bucket tuple; archive mutation operations are pure functions over the existing archive state plus the new mutation's evidence.

## 7. Edge cases

- **Probe failure during evaluation**: Architectural-invariant probe failures short-circuit acceptance (hard gate, per §4.2 `acceptance.hardGates.architecturalProbeFailure: true`). Profile-quality probe failures contribute to `auditProbeScore` (each failure deducts; each pass adds).
- **Performance baseline drift**: When a campaign's performance baseline (`wallClockBaselineMs`, `heapBaselineBytes`, `summaryTraceBytesBaseline`) is updated, the improve-loop skill MUST also record an "acceptance epoch" entry in `rationale.jsonl` documenting the new baseline and the rationale for the rebaseline.
- **Lint warning escalated to penalty**: When a campaign's `acceptance.weights.lint.<NAME>` is non-zero, the lint warning contributes to `complexityPenalty` (or another configured penalty term). The rationale entry MUST disclose which lint warnings contributed to its acceptance score.
- **Behavior descriptor missing data**: If a descriptor's derivation source is unavailable (e.g., Spec 182 hasn't landed yet for module-activation mix), the descriptor bucket is `unknown` and the archive cell key includes the `unknown` marker. Future mutations that DO produce the data live in different cells; the `unknown` cells are not retroactively reassigned (Foundation #14 — no compatibility shim).
- **Quality-diversity archive cell collision with identical acceptance**: Tie-break by `(specHashes.profile asc)` for determinism. The losing mutation is still recorded in `rationale.jsonl` for audit.
- **Rollback condition fires after multiple subsequent mutations**: The improve-loop skill rolls back to the mutation's pre-state and re-applies the subsequent mutations on top, validating each via the composite acceptance check. If any subsequent mutation now fails acceptance, it is dropped and a rollback entry is appended.
- **Acceptance epoch change during in-flight evaluation**: A mutation that started evaluation under acceptance epoch N MUST complete under epoch N regardless of when the change to N+1 commits; the rationale entry records the epoch.

## 8. Phases & acceptance criteria

| Phase | Deliverable | Acceptance criteria | Effort |
| --- | --- | --- | --- |
| **Phase A** — Composite acceptance metric | `campaigns/<campaign>/acceptance/` derivation modules + per-term unit tests; per-campaign acceptance configuration block in `program.md`; improve-loop skill integration; one campaign migrated as conformance proof | (a) Each composite term has a unit test that derives the term from a pinned trace fixture; (b) `composite-acceptance.test.ts` asserts determinism: same inputs → same numeric result and same accept / reject verdict; (c) `fitl-arvn-agent-evolution` campaign migrated to composite acceptance; the May-17 witness scenario (ARVN selecting Govern 75% with uniform NVA preview) now produces a non-zero `noSignalPenalty` that rejects the candidate where the prior acceptance check accepted it; (d) hard gates (architectural probe failure, performance threshold exceeded) verified via unit tests asserting acceptance returns `reject` with the named gate as the reason. | M |
| **Phase B** — Weight-soup lint + per-mutation rationale tracking | `campaigns/<campaign>/lint/` lint detectors + per-detector unit tests; `rationale-schema.ts` Zod schema; improve-loop skill integration; rationale-required pre-acceptance check | (a) Each lint detector from §5.1 has a unit test using pinned trace fixtures; (b) `rationale-schema.ts` rejects entries missing any required field; (c) improve-loop skill's pre-acceptance check refuses to accept a mutation without a valid rationale entry; (d) `fitl-arvn-agent-evolution` campaign generates at least one rationale entry per accepted mutation, validated by an integration test that runs one mutate-evaluate-accept cycle end-to-end on a fixture seed set; (e) automatic rollback fires when a rationale entry's `rollbackCondition` evaluates true on a subsequent evaluation cycle, verified by a fixture test. | S–M |
| **Phase C** — Quality-diversity archive | `campaigns/<campaign>/quality-diversity-archive.jsonl` + archive insertion + selection logic; behavior descriptor derivation modules; improve-loop selection-step integration | (a) Each behavior descriptor from §6.1 has a unit test that derives the descriptor tuple from pinned trace fixtures; (b) archive insertion is a pure function: given the same existing archive and the same new mutation, insertion produces the same archive (determinism); (c) improve-loop selection algorithm test asserts that, given an archive with multiple non-empty cells, the selection step can be configured to sample from underrepresented cells; (d) `fitl-arvn-agent-evolution` campaign archive populated by an integration test that runs N mutate-evaluate-accept cycles and asserts the archive contains at least M distinct cells; (e) `unknown` bucket handling verified by a fixture test where one descriptor's derivation source is intentionally absent. | M–L |

Phase A lands first because Phases B and C consume the standardized per-decision metric surface it produces. Phase B and Phase C are independently mergeable after Phase A; Phase C's archive can be empty until both Phase B's rationale-tracking and Phase A's composite acceptance are in place.

## 9. Test plan

- **Per-term unit tests for composite acceptance**: Each of `tournamentMarginScore`, `winRateScore`, `auditProbeScore`, `blunderPenalty`, `noSignalPenalty`, `fallbackPenalty`, `complexityPenalty`, `performancePenalty`, `explanationCoverageScore` derives from a pinned `PolicyAgentDecisionTrace` + tournament-output fixture.
- **Determinism tests**: Both `composite-acceptance.test.ts` and archive-insertion tests assert bit-identical outputs across two runs over pinned inputs.
- **May-17 witness regression test**: A pinned ARVN trace fixture reproducing the 75%-Govern + uniform NVA preview pattern; the composite acceptance check MUST return `reject` because `noSignalPenalty` is high enough to overwhelm `tournamentMarginScore`.
- **Lint detector tests**: Each of the §5.1 lint codes has a positive-trigger test (pinned fixture where the lint should fire) and a negative test (pinned fixture where it should not).
- **Rationale schema tests**: `rationale-schema.ts` Zod schema rejects entries missing required fields and accepts a canonical valid entry.
- **Rollback condition tests**: Fixture where a rationale entry's `rollbackCondition` evaluates true on a subsequent cycle MUST trigger automatic rollback; the rollback MUST be recorded as a separate rationale-log entry.
- **Behavior descriptor derivation tests**: Each of the §6.1 descriptors derives from pinned trace fixtures.
- **Archive insertion tests**: Pure-function tests over `(existing archive, new mutation) → new archive` covering: empty cell insertion, occupied cell with higher acceptance, occupied cell with lower acceptance, occupied cell with tie-break.
- **Archive selection tests**: Given an archive with N cells of varying acceptance, the selection step's explore / exploit tradeoff is observably configurable.
- **End-to-end integration test**: One full mutate → evaluate → accept cycle on `fitl-arvn-agent-evolution` using pinned engine version + scenario, asserting the rationale entry shape, composite acceptance value, and archive insertion.

## 10. Foundation alignment

| Foundation | How the design respects it |
| --- | --- |
| **#1 Engine Agnosticism** | This spec touches `campaigns/` and `.claude/skills/improve-loop/` only; no engine code. The acceptance metric is computed from per-decision trace surfaces the engine already publishes. |
| **#2 Evolution-First Design** | Composite acceptance, lint detectors, and quality-diversity archive are the evolution pipeline itself — this spec makes evolution's signal richer by consuming engine surfaces that already exist or are shipping in Specs 181 and 182. |
| **#9 Replay, Telemetry, and Auditability** | Every composite acceptance term derives from generic trace fields per Foundation #9. The rationale.jsonl and quality-diversity-archive.jsonl files are structured event records suitable for replay, debugging, and analytics. |
| **#13 Artifact Identity and Reproducibility** | Per-mutation rationale entries record engine version + GameDef hash + profile hash + scenario id + seed set + acceptance configuration. Archive entries carry the same identity fields. Acceptance epochs are recorded so historical runs remain interpretable. |
| **#14 No Backwards Compatibility** | Phase A acceptance migration is per-campaign opt-in (not a global engine change); when a campaign migrates, its acceptance epoch increments. Historical archives are NOT retroactively populated; `unknown` bucket handling is explicit rather than a compatibility shim. |
| **#16 Testing as Proof** | Composite acceptance determinism is proven by `composite-acceptance.test.ts`. Archive insertion determinism is proven by unit tests over pure functions. Lint detector behavior is proven by per-detector positive + negative tests. |

**No FOUNDATIONS.md amendment proposed.** Foundation #13 already covers reproducibility for the rationale and archive files; Foundation #9 covers telemetry; Foundation #16 covers proof-by-test.

## 11. Out of scope (named follow-on work, not new specs)

- **Migration of remaining campaigns to composite acceptance**: Per §2, only one campaign (`fitl-arvn-agent-evolution`) migrates as Phase A conformance proof. The other campaigns (`fitl-vc-agent-evolution`, `texas-agent-evolution`, etc.) migrate incrementally outside this spec's mandatory scope; each migration is a separate ticket.
- **Acceptance weight tuning per campaign**: Initial weights in §4.2 are defaults. Per-campaign tuning happens after Phase A lands; each tuning change creates a new acceptance epoch with a rationale entry.
- **Probe corpus expansion**: New probes (Spec 181 §4) that strengthen the `auditProbeScore` term land outside this spec; this spec consumes whatever probes the audit harness ships.

## 12. Reassessment of source proposal

Per-recommendation disposition table for `reports/ai-agent-overhaul-proposal.md` sections that Spec 181 §11 deferred to this spec. Sections already covered by Spec 181 or Spec 182 are not repeated.

| Proposal section / recommendation | Disposition | Notes |
| --- | --- | --- |
| §11 Evolution-loop changes — structure-first mutation order | **Adopted as guidance, not enforced ordering** — Spec 181 §3.4 already corrected the proposal's stale "weights only" framing: `.claude/skills/improve-loop` already mutates structure. The structure-first ordering is encoded as a recommended priority in per-campaign `program.md` rather than as a hard rule, because some authoring tasks legitimately tune a single weight. |
| §11.1 Acceptance criteria composite | **Adopted as Phase A** — see §4. |
| §11.2 Detect weight soup (lint warnings) | **Adopted as Phase B** — see §5.1. All proposal-listed lint codes are encoded. |
| §11.3 Use quality diversity (MAP-Elites archive) | **Adopted as Phase C** — see §6. Initial behavior descriptors match the proposal's list. |
| §13 Performance model and benchmark gates | **Adopted as Phase A composite-acceptance terms** — performance gates (5% wall-clock, 10% heap, 2× trace bytes for `summary` mode) operationalize as hard-gate composite terms (§4.2 `acceptance.hardGates.performanceThresholdExceeded: true`). |
| §13.7 Rollback criteria | **Adopted as Phase A hard gates + Phase B per-mutation rollback conditions** — the proposal's rollback criteria split between automatic hard-gate rejection (Phase A) and per-mutation rollback triggers tracked in the rationale schema (Phase B). |
| §17 Stage 8 Evolution-loop overhaul | **Adopted as this spec's full scope** — Phases A / B / C cover the three Stage 8 deliverables (structured mutation mutation surface already exists per Spec 181 §3.4; composite acceptance is Phase A; quality diversity is Phase C; complexity penalty is part of Phase A composite + Phase B lint; performance gates are Phase A hard-gate terms). |
| **FOUNDATIONS.md amendments** | **None proposed** — Foundation #13 (reproducibility) and #9 (telemetry) already cover this spec's artifact requirements. |

---

## Notes for ticket decomposition

- Phase A should decompose into: per-term derivation modules (one ticket per term, or two grouped tickets for closely-related terms), `composite-acceptance.test.ts` determinism test (one ticket), per-campaign acceptance configuration schema + improve-loop skill integration (one ticket), `fitl-arvn-agent-evolution` migration + May-17 witness regression test (one ticket), hard-gate test coverage (one ticket).
- Phase B should decompose into: lint detector framework + first three detectors (one ticket), remaining lint detectors (one or two tickets grouped by related signal), `rationale-schema.ts` + improve-loop pre-acceptance check (one ticket), automatic rollback integration (one ticket), end-to-end mutate-evaluate-accept fixture test (one ticket).
- Phase C should decompose into: behavior descriptor derivation modules (one ticket per descriptor, or grouped by signal source), archive insertion logic + determinism test (one ticket), archive selection-step integration (one ticket), `unknown` bucket handling test (one ticket), end-to-end multi-cycle archive-population integration test (one ticket).
- Phase A tickets land before Phase B begins; Phase B's rationale schema is a hard prerequisite for Phase C's archive entries (the archive entry's `mutationId` references a rationale entry).
- Each phase's tickets follow the namespace `183EVOLOOP-XXX` (proposed; finalize during decomposition).
