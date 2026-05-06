# Spec 156: Preview Observability and Utility Metrics

**Status**: DRAFT
**Priority**: P1 (gates Specs 157–160 — every subsequent change to the preview pipeline ships blind without these diagnostics; closes the diagnostic half of Gaps 3 and 6 in `reports/microturn-preview-architectural-gaps-2026-05-06.md`)
**Complexity**: M (trace schema additions + emitters at three call sites; no behavior changes; new exported types and a verbose-trace tier; FOUNDATIONS-aligned trace expansion only)
**Dependencies**:
- Spec 145 [bounded-synthetic-completion-preview] (archived) — establishes the `PreviewOutcome.kind` and `previewUsage` payloads this spec extends.
- Spec 109 [agent-preview-audit] (archived) — original audit framework; this spec layers utility metrics over the same trace boundary.
- Foundation 9 (Replay, Telemetry, and Auditability) — the spec is a direct execution of the principle: every state transition must produce structured deterministic event records suitable for replay, debugging, and analytics.
- Foundation 16 (Testing as Proof) — utility classification is the diagnostic that makes Spec 157 / 159's behavior changes provable.

**Source**:
- `reports/microturn-preview-architectural-gaps-2026-05-06.md` Gap 3 (uniform projected margins hidden behind `previewOutcome: ready`), Gap 6 (chooseOne/chooseNStep candidates always have `scoreContributions: []`).
- `reports/preview-policy-corrections.md` §6 (preview success metrics: `ready` is not enough), §7 (synthetic-decision trace), §8 (fix inner-frontier trace contributions), Phase 1 of recommended sequence.
- Code anchors:
  - `packages/engine/src/agents/policy-agent.ts:62-75` — `traceCandidatesForFrontier` always emits `scoreContributions: []` for inner-microturn frontiers.
  - `packages/engine/src/agents/policy-agent.ts:118,136-152` — `emptyPreviewUsage()` shape and inner-frontier wiring.
  - `packages/engine/src/agents/policy-eval.ts:594-608` — `previewGatedCount` accounting today.
  - `packages/engine/schemas/Trace.schema.json:3484-3935,3777-3909` — `previewUsage` and per-candidate trace fields.

## Brainstorm Context

**Original framing.** Post-Spec-145 the agent-side preview pipeline reports `previewOutcome: ready` as the success signal. Empirically (`exp-002` in the source report) `ready` rates of 75% can coexist with **8/24 decisions** whose ready candidates all project to identical margin values, because greedy completion in `policyGuided`'s absence picks alphabetical inner options that don't move margin-affecting variables. Operators see "preview is ready" and don't see "preview is degenerate." The diagnostic gap is what made Gap 3 invisible until trace inspection in the campaign restart.

A parallel diagnostic gap exists at inner microturns: `chooseOne` / `chooseNStep` decisions always emit `scoreContributions: []` even when a completion-scope consideration (e.g., `preferPatronageMode`) fired and produced a non-zero score. The action-selection trace was raised to verbose by Spec 145; the inner-frontier trace was not.

**Motivation.** Two interlocking reasons this is the first spec in the sequence:

1. **Specs 157–160 are policy-quality changes, and policy quality is invisible without these diagnostics.** Spec 157's "balanced coverage replaces topK" cannot be A/B-tested against today's `topK=4` baseline if the only metric is `ready` rate. A `ready`-rate parity result is consistent with both "the new allocator is no better than topK" and "the new allocator allocates differently but greedy still produces uniform margins." `readyDifferentiatingDecisionRate` (the proposed headline metric) distinguishes them.
2. **Specs 159 and 160 add new behaviors that fail in subtly different ways.** `policyGuided` falling back to `greedy` should be loud; per-option preview returning `unknownHidden` for hidden-info reasons should be distinguishable from `unknownDepthCap`. Without the synthetic-decision trace and `selectionReason`, a regression introduced by either spec lands as "agent score went down" with no trace path back to the cause.

**Prior art surveyed.**
- **Spec 145 §"Trace surface"** (archived) — established the existing `previewUsage.outcomeBreakdown` shape this spec extends.
- **TAG / OpenSpiel** (cited in `reports/preview-policy-corrections.md` §1, §7) — both tabletop AI frameworks separate "rollout completed" from "rollout was discriminating." TAG's tournament logger records per-rollout depth, return value distribution, and the action chain that produced it. OpenSpiel's MCTS instrumentation distinguishes "evaluated `n` rollouts at this node" from "`n` distinct values observed."
- **Existing repo: `packages/engine/test/agents/policy-trace-shape.test.ts`** (assumed pattern based on archive history) — trace shape regression tests are an established discipline. New fields land with parity tests that lock the shape.

**Synthesis.** Add four trace-surface extensions and one verbose-tier expansion, all behind the existing `traceLevel` switch — no behavior change, no new evaluation path:

1. **Decision-level `readyRefStats`.** For each preview ref the decision requested, record `{ readyCount, distinctValueCount, min, max, range, allReadyValuesEqual }` over the `ready` candidates. This is the direct measurement of "preview ran but all ready candidates report the same margin" — Gap 3's symptom.
2. **Decision-level `previewUsage.utility`.** Derived classifier: `none` (no candidates ready), `constant` (all ready candidates produce identical values for every requested ref), `lowInformation` (ready but one of N requested refs is constant), `differentiating` (at least one requested ref has `distinctValueCount > 1` over ready candidates). This is the headline diagnostic Spec 157 / 159 will A/B against.
3. **Candidate-level `selectionReason`.** For every candidate that entered the active set, record why it was picked or gated: `coverage` (group-coverage minimum from Spec 157), `prior` (filled by structural-impact prior), `shallowDelta` (selected by shallow-pass — reserved for future), `widening` (selected by widen-on-uniform), `cache` (reserved for future caching), or `gated` (excluded from preview budget). Spec 157 will populate the non-gated reasons; Spec 156 only adds the field and the `gated` enumerator.
4. **Synthetic-decision trace inside each preview drive.** Under `traceLevel: 'verbose'`, every synthetic inner microturn taken by the preview driver records `{ depth, microturnKind, decisionKey, selectedOptionStableKey, selectionReason, score, scoreContributions, completionPolicy }`. This makes Gap 3 directly observable (greedy fired and picked alphabetical) and makes Spec 159's `policyGuided` trace its own selection rationale.
5. **Inner-frontier `scoreContributions` parity.** Replace `traceCandidatesForFrontier`'s hardcoded `scoreContributions: []` with a populated breakdown when a `microturn`-scope (or, transitionally, `completion`-scope until Spec 158 retires it) consideration fired during `selectBestCompletionChooseOneValue`. This is Gap 6 closed directly.

**Alternatives explicitly considered (and rejected).**

- **Skip the observability spec; add metrics ad hoc inside Specs 157 and 159.** Each later spec then carries its own diagnostic surface and the trace shape diverges. Rejected — F#9 discipline (one structured event record per transition) and ticket-decomposition cleanliness.
- **Add observability only at `traceLevel: 'summary'`.** Cheaper but loses the synthetic-decision trace, which is the highest-signal new datum. Rejected — verbose-tier opt-in is the existing convention and the cost is paid only when verbose is requested.
- **Compute `utility` at consumer time from existing `previewUsage` fields.** Today's fields don't surface per-ref distinct-value counts (only `outcomeBreakdown` totals), so a consumer cannot derive `utility` from the trace. Adding `readyRefStats` is required either way; classifying `utility` once at emit time avoids fan-out duplication across consumers. Rejected — emit-time classification is cheaper and authoritative.
- **Replace `previewOutcome: ready` with a composite enum that includes `readyButConstant`.** Tempting for a single-axis classification, but `previewOutcome` is per-candidate (was the drive successful for THIS candidate?) and `utility` is per-decision (do the ready candidates differentiate as a SET?). They live at different scopes. Rejected — keep them separate.

**User constraints reflected.** F#1 (engine remains agnostic — `readyRefStats` is keyed on generic ref-id strings, not game terms), F#8 (deterministic — utility classifier is a pure derivation of values already in trace), F#9 (replay/telemetry — direct execution of the principle), F#11 (no mutation — new trace fields populated immutably at emit time), F#16 (testing as proof — adds the direct invariant tests Specs 157/159 will cite). Performance: verbose-tier additions cost only when verbose is requested; `traceLevel: 'summary'` paths gain only `readyRefStats` and `utility` (O(candidate-count × ref-count) at emit time, single pass).

## Overview

Five trace-surface extensions across the agent decision trace, all populated at the emitter side (no consumer changes required for replay/regression tests). The trace shape changes are additive; existing fields are preserved bit-for-bit. New fields default to safe-empty values when the data is unavailable (e.g., `readyRefStats: {}` when no preview refs were requested).

The five deliverables:

1. **`previewUsage.readyRefStats: Record<RefId, ReadyRefStats>`** — per-ref, per-decision distribution of `ready` candidates' resolved values.
2. **`previewUsage.utility: 'none' | 'constant' | 'lowInformation' | 'differentiating'`** — derived classifier over `readyRefStats`.
3. **`PolicyEvaluationCandidateMetadata.selectionReason: 'coverage' | 'prior' | 'shallowDelta' | 'widening' | 'cache' | 'gated'`** — populated for every candidate considered for preview budget. Spec 156 only emits `gated` (matching today's `previewGatedCount` accounting); Specs 157 and 159 fill in the other enumerators.
4. **`PolicyPreviewDriveTrace.syntheticDecisions: SyntheticDecisionTraceEntry[]`** — verbose-tier inner-microturn trace per preview drive. This lands with the nested preview-drive migration in ticket 004, not the ticket-001 groundwork, so the repo does not carry parallel flat and nested preview-drive contracts.
5. **Inner-frontier `scoreContributions`** — populated from the matched consideration's term-by-term breakdown via the same `(termId, contribution)` shape used at action-selection.

## Phase Acceptance Budget

| Phase | Deliverable | Acceptance Criterion |
|-------|-------------|----------------------|
| Phase A | (1), (2), (3) — decision/candidate metadata | `readyRefStats` populated for every `actionSelection` decision with at least one preview ref; `utility` classifier matches a hand-computed expected value on a 5-decision golden trace; `selectionReason: 'gated'` count equals legacy `previewGatedCount` over the FITL canary corpus. |
| Phase B | (4) — synthetic-decision trace | Verbose trace for an `exp-002`-shaped run includes one `syntheticDecisions[]` entry per inner microturn taken by the driver; entries are ordered by depth; replay produces byte-identical synthetic-decision arrays across two runs. |
| Phase C | (5) — inner-frontier `scoreContributions` | A chooseOne where `selectBestCompletionChooseOneValue` matched a single completion-scope consideration emits `scoreContributions: [{ termId, contribution }]` matching the matched consideration; matched-multiple case sums to the candidate's final score. |

Each phase ships as its own ticket wave; A is the headline metric, B and C are independent enrichments.

## Architecture Check

1. **Why this approach is cleaner than alternatives.** Co-locating the utility classifier with the existing `previewUsage` payload means consumer code (campaign analyzers, regression tests, trace-replay tooling) reads one path for "did preview help?". Alternatives (compute at consumer time, separate sidecar trace file, ad-hoc per-spec metrics) all fan out work to N consumers without authoritative semantics.
2. **GameSpecDoc vs runtime boundary.** All five additions are runtime trace data only. No GameSpecDoc field changes, no compiler validator changes, no engine kernel changes. The `RefId` keys in `readyRefStats` are the same generic ref strings the existing `previewUsage.refIds` array already carries — no game-specific identifiers leak.
3. **No backwards-compatibility shims.** The trace schema gains new required fields; every repo-owned trace fixture, golden, and regression baseline is updated in the same change. No `_legacy` selectionReason, no optional `utility?: ...`. F#14 strict.

## What to Change

### 1. Trace schema — `packages/engine/schemas/Trace.schema.json`

Extend the `previewUsage` object schema with required `readyRefStats` (object keyed by ref id, each value an object with `readyCount`, `distinctValueCount`, `min`, `max`, `range`, `allReadyValuesEqual`) and required `utility` (enum of the four classifier values). Add `selectionReason` to the per-candidate trace object as a required enum. Add a `scoreContributions` field to the inner-frontier candidate trace shape parallel to the action-selection candidate trace. Update the schema's `required` arrays everywhere these fields are added. The new `syntheticDecisions` array is intentionally deferred to ticket 004, which owns introducing a nested `previewDrive` object as one coherent trace-contract migration.

### 2. Trace TypeScript types — `packages/engine/src/agents/policy-eval.ts`, `policy-agent.ts`, kernel trace types

Mirror the ticket-001 schema groundwork in `PolicyEvaluationMetadata`, `PolicyEvaluationCandidateMetadata`, and the kernel trace types. Export const arrays for downstream enum-parity regression tests (`PREVIEW_UTILITY_VALUES` and `SELECTION_REASONS`). The `SyntheticDecisionTraceEntry` type and nested `previewDrive` contract are deferred to ticket 004 so the repo keeps one authoritative preview-drive shape instead of parallel flat and nested contracts.

### 3. Decision-level emit — `packages/engine/src/agents/policy-eval.ts`

After candidate scoring resolves, before metadata is finalized, compute `readyRefStats` by iterating ready candidates' `previewRefIds × resolvedRefValues` and aggregating min/max/distinct counts. Compute `utility` from the resulting per-ref distinct counts using the four-way classifier:
- `none` if no candidate is `ready`;
- `constant` if every requested ref's `distinctValueCount` is exactly 1;
- `differentiating` if at least one requested ref's `distinctValueCount > 1`;
- `lowInformation` otherwise (some refs distinct, some constant — e.g., a multi-ref decision where only one differentiates).

Populate `selectionReason: 'gated'` on every candidate already marked via `evaluation.markPreviewGated` and `selectionReason: 'prior'` (placeholder until Spec 157) on the rest. Spec 157's allocator will replace the placeholder.

### 4. Synthetic-decision trace — `packages/engine/src/agents/policy-preview.ts`

Inside the preview driver loop (the `pickInnerDecision` path and its per-microturn application), capture `{ depth, microturnKind, decisionKey, selectedOptionStableKey, selectionReason, score, scoreContributions, completionPolicy }` per inner microturn taken. `selectionReason` here is `'greedyAlphabetical'` for the current default, `'microturnPolicy'` when Spec 159 lands `policyGuided`, and `'fallback'` when Spec 159's fallback fires. For Spec 156 only `'greedyAlphabetical'` is emitted; the union is reserved for forward compatibility within the same spec wave.

Threading: the driver returns `syntheticDecisions: SyntheticDecisionTraceEntry[]` alongside the `PreviewOutcome`. The caller in `policy-eval.ts` attaches it to the per-candidate nested `previewDrive` trace under the verbose-tier predicate. Ticket 004 owns this schema/type migration and should migrate the existing flat `previewDriveDepth` / `previewCompletionPolicy` contract atomically if it introduces the nested object.

### 5. Inner-frontier `scoreContributions` — `packages/engine/src/agents/policy-agent.ts`, `completion-guidance-choice.ts`

Change `traceCandidatesForFrontier`'s hardcoded empty array to source contributions from the chooser. `selectBestCompletionChooseOneValue` (and its chooseN equivalent) already evaluate considerations against each option; route the per-consideration contribution out to the trace via a new `scoreContributionsByOption: Map<OptionStableKey, ScoreContribution[]>` returned from the chooser. The frontier trace then maps the chosen-option contributions onto the candidate trace.

This change is in the trace-emit path only; the chooser's selection logic does not change.

## Files to Touch

- `packages/engine/schemas/Trace.schema.json` (modify)
- `packages/engine/src/agents/policy-agent.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — type exports)
- `packages/engine/src/agents/completion-guidance-choice.ts` (modify — return per-option contributions)
- `packages/engine/test/golden/**` (modify — golden trace fixtures gain new required fields; F#14 strict, regenerate in same change)
- `packages/engine/test/unit/agents/preview-utility-classifier.test.ts` (new)
- `packages/engine/test/unit/agents/synthetic-decision-trace.test.ts` (new)
- `packages/engine/test/unit/agents/inner-frontier-score-contributions.test.ts` (new)
- `packages/engine/test/agents/policy-trace-shape.test.ts` (modify — schema parity)
- `docs/agent-dsl-cookbook.md` (modify — document the new diagnostic fields and how to read them)

## Out of Scope

- Behavior changes to preview selection, scoring, or completion. (Specs 157, 159, 160.)
- New consumers of the metrics (campaign harness, evolution loop). Trace-side changes only.
- Replacing `previewOutcome: ready` semantics or renaming existing fields.
- Caching infrastructure (`selectionReason: 'cache'` is reserved but unused).
- Shallow-pass preview (`selectionReason: 'shallowDelta'` is reserved but unused).
- Replacing the existing `previewGatedCount` count field. It coexists with `selectionReason: 'gated'` until a future cleanup spec confirms parity.

## Acceptance Criteria

### Tests That Must Pass

1. New: golden trace test asserts `readyRefStats[refId]` matches a hand-computed expected stats object on a 5-decision FITL fixture covering ready-uniform, ready-differentiated, all-gated, and mixed cases.
2. New: utility classifier returns `differentiating` for the `exp-002` trace's "DIFFERENTIATED decision" excerpt and `constant` for the "IDENTICAL margins decision" excerpt (both quoted in `reports/microturn-preview-architectural-gaps-2026-05-06.md` Appendix).
3. New: synthetic-decision trace contains one entry per inner microturn taken; entry depth matches `previewDriveDepth`; ordering is depth-ascending.
4. New: replay-identity test compiles + runs the same FITL fixture twice; `syntheticDecisions[]` arrays are byte-identical.
5. New: inner-frontier `scoreContributions` test constructs a chooseOne with a single matched microturn-scope consideration and asserts contribution sum equals candidate score.
6. New: schema-parity test asserts every emitted trace conforms to the updated `Trace.schema.json` (Ajv validation).
7. Existing engine suite: `pnpm -F @ludoforge/engine test`.
8. Existing typecheck: `pnpm turbo typecheck`.

### Invariants

1. (architectural-invariant) For any `actionSelection` decision with at least one ready candidate, `previewUsage.utility ∈ {constant, lowInformation, differentiating}`. `none` only when zero candidates are ready.
2. (architectural-invariant) `Σ selectionReason='gated'` over candidates equals `previewGatedCount` for the same decision (parity with the legacy field, until cleanup).
3. (architectural-invariant) `syntheticDecisions[].depth` is strictly increasing within a single preview drive.
4. (architectural-invariant) Inner-frontier `scoreContributions[].contribution` summed across entries equals the candidate's final score (within integer-arithmetic exactness — F#8).
5. (golden-trace) Re-running the FITL canary fixture produces byte-identical trace JSON for the new fields.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/preview-utility-classifier.test.ts` (new) — pure-function classifier over `readyRefStats`. `architectural-invariant`. Covers all four utility values plus zero-ready and zero-ref edge cases.
2. `packages/engine/test/unit/agents/synthetic-decision-trace.test.ts` (new) — driver-loop trace under verbose tier. `architectural-invariant`. Asserts ordering, depth monotonicity, and field presence.
3. `packages/engine/test/unit/agents/inner-frontier-score-contributions.test.ts` (new) — chooseOne with a matched microturn-scope (or transitionally completion-scope) consideration. `architectural-invariant`. Asserts contribution sum invariant.
4. `packages/engine/test/golden/preview-utility-fitl-fixture.test.ts` (new) — `golden-trace` covering the four utility classifications on a frozen FITL fixture.
5. `packages/engine/test/agents/policy-trace-shape.test.ts` (modify) — extend schema parity to include the new fields.
6. `packages/engine/test/golden/**` regenerated with the new fields populated. Re-bless commit body: `Re-bless golden trace: <each updated file> — Spec 156 trace expansion`.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- agents/preview-utility-classifier`
2. `pnpm -F @ludoforge/engine test:unit -- agents/synthetic-decision-trace`
3. `pnpm -F @ludoforge/engine test:unit -- agents/inner-frontier-score-contributions`
4. `pnpm turbo schema:artifacts`
5. `pnpm turbo lint typecheck test`

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-06:

- [`archive/tickets/156PREVOBSUTMET-001.md`](../archive/tickets/156PREVOBSUTMET-001.md) — Trace schema and type plumbing for preview observability (covers schema + types groundwork)
- [`archive/tickets/156PREVOBSUTMET-002.md`](../archive/tickets/156PREVOBSUTMET-002.md) — readyRefStats aggregator and utility classifier (covers Phase A deliverables 1, 2)
- [`archive/tickets/156PREVOBSUTMET-003.md`](../archive/tickets/156PREVOBSUTMET-003.md) — Per-candidate selectionReason field (covers Phase A deliverable 3)
- [`tickets/156PREVOBSUTMET-004.md`](../tickets/156PREVOBSUTMET-004.md) — Synthetic-decision trace per preview drive (covers Phase B deliverable 4)
- [`tickets/156PREVOBSUTMET-005.md`](../tickets/156PREVOBSUTMET-005.md) — Inner-frontier scoreContributions parity (covers Phase C deliverable 5)
- [`tickets/156PREVOBSUTMET-006.md`](../tickets/156PREVOBSUTMET-006.md) — Cookbook documentation for preview observability fields (covers cross-cutting docs)
