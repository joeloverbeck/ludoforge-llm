# Spec 157: Balanced-Coverage Preview Budget Allocator

**Status**: DRAFT
**Priority**: P1 (closes the load-bearing Gap 2 — circular gating — from `reports/microturn-preview-architectural-gaps-2026-05-06.md`; eliminates the structural pathology where preview-needed candidates are systematically gated out before preview runs)
**Complexity**: L (replaces the `topK` gate with a multi-pass deterministic allocator; introduces a compiler-side conservative effect-footprint analysis for the structural-impact prior; deletes `pickTopKByMoveOnlyScore`; phased delivery in three waves)
**Dependencies**:
- Spec 156 [preview-observability-and-utility-metrics] (DRAFT) — `selectionReason` enum and `previewUsage.utility` are populated by this spec; `widenOnUniformProjection` reads `utility === 'constant'` as its trigger.
- Spec 145 [bounded-synthetic-completion-preview] (archived) — establishes the candidate-set and per-candidate preview drive this spec re-budgets.
- Spec 146 [scoped-draft-state-for-preview-drive] (archived) — bounded copy-on-write draft state per preview drive; this spec preserves Spec 146's isolation contract.
- Foundation 8 (Determinism Is Sacred) — the allocator is deterministic and stable across `Math.trunc`-exact comparisons; no `localeCompare`, no shuffle.
- Foundation 10 (Bounded Computation) — the allocator caps total preview drives by `fullCandidateCap`; widening is bounded by `widenCap`.
- Foundation 14 (No Backwards Compatibility) — `preview.topK` is deleted in the same change as `preview.budget` lands.
- Foundation 15 (Architectural Completeness) — replaces the circular dependency at its root rather than tuning around it.

**Source**:
- `reports/microturn-preview-architectural-gaps-2026-05-06.md` Gap 1 (default `topK = 4` is too tight), Gap 2 (top-K gating is circular).
- `reports/preview-policy-corrections.md` §2 (progressive widening as the better mental model), §3 (priors as bias not exclusion gate), §4 (root selection ≈ best-arm identification), Recommendations A, B, C; Phase 2 of recommended sequence.
- Code anchors:
  - `packages/engine/src/agents/policy-eval.ts:586` — `Math.min(profile.preview.topK ?? 4, activeCandidates.length)` — the hardcoded default.
  - `packages/engine/src/agents/policy-eval.ts:581-583` — the `costClass !== 'preview'` filter that excludes preview-derived considerations from the gate.
  - `packages/engine/src/agents/policy-eval.ts:1020-1048` — `pickTopKByMoveOnlyScore` — the circular-dependency site.
  - `packages/engine/src/agents/policy-eval.ts:917` — `selectRepresentativeCandidatesByActionId` — existing actionId-grouping infrastructure that lifts onto the gating side.
  - `packages/engine/src/agents/policy-eval.ts:189` — `selectionGrouping?: 'none' | 'actionId'` — the existing grouping switch on the selection side.
  - `packages/engine/src/cnl/compile-agents.ts:765-790` (assumed location of `lowerPreviewConfig`) — preview config compilation.
- Empirical evidence: `topK=4` baseline → 36% ready rate; `topK=10` → 75% ready rate but 8/24 decisions still uniform. Bumping the cap is a band-aid; the gate selection mechanism is the structural defect.

## Brainstorm Context

**Original framing.** The current preview budget gate is a single static top-K rank by *move-only* score. By construction, the score function used at the gate excludes preview-derived signals (`costClass: 'preview'` considerations are filtered out at `policy-eval.ts:581-583` before `pickTopKByMoveOnlyScore` runs). This is correct in isolation — preview hasn't run yet — but it creates a circular dependency at the system level: any candidate whose only differentiation comes from preview cannot be ranked above its peers at the gate, so it never gets preview, so its differentiation is never observable.

The empirical fingerprint is exactly what `reports/microturn-preview-architectural-gaps-2026-05-06.md` Gap 2 describes: in ARVN's profile, `preferGovernWeighted` adds +1000 (move-only) to govern, so govern survives the gate; train, sweep, patrol, assault, raid all tie at 0 in move-only and the gate cuts them by alphabetical tiebreak. For a profile whose entire scoring strategy is "let preview decide," `topK=4` selects the alphabetically-first 4 candidates and ignores the rest — preview-driven scoring doesn't survive the gate.

Raising `topK` to 10 (verified empirically in `exp-002`) widens coverage but doesn't break the circularity: the gate still ranks by a scoring function that excludes preview, so candidates that would have benefited most from preview are still gated out unless they happen to win on a non-preview term. The fix has to change the *shape* of the gate, not just its width.

**Motivation.**

1. **F#15 (Architectural Completeness) demands a root-cause fix.** `topK` widening is the textbook "tune around the bug" anti-pattern. The bug is that the gate's selection function is uncorrelated with the candidates' eventual preview-derived score. A correct gate must guarantee that preview signal can reach every candidate family, not just the move-only top-K.
2. **F#10 (Bounded Computation) constrains the solution shape.** POLPREVDRIVE-001 documents `driveSyntheticCompletion` at 51% of sampled time even at `topK=4`. Unbounded preview is not on the table. The solution must ration budget intelligently — coverage first, prior-driven fill second, widening only on demand.
3. **The repo already has the primitive.** `selectRepresentativeCandidatesByActionId` (policy-eval.ts:917) and `selectionGrouping: 'actionId'` (policy-eval.ts:189) implement actionId-grouping on the *selection* side (post-scoring representative pick). Lifting that primitive to the *gating* side (pre-preview group coverage) is a small, well-typed change that reuses already-validated machinery.

**Prior art surveyed.**

- **Progressive widening / progressive unpruning (MCTS literature, cited in `reports/preview-policy-corrections.md` §2).** Standard MCTS pattern: start with a reduced branching factor, widen as evidence accumulates. Direct mapping: minimum group coverage = "guarantee some coverage across action families"; structural-impact prior = "bias additional preview budget toward promising candidates"; widen-on-uniform = "widen if the first batch is low-information."
- **PUCT / OpenSpiel priors (`reports/preview-policy-corrections.md` §3).** Priors bias allocation; they don't exclude. PUCT combines action priors with search statistics rather than discarding low-prior actions. Mapped to LudoForge: the prior pass biases additional slots after group coverage is satisfied, but every group keeps its guaranteed slot regardless of prior.
- **Sequential Halving / best-arm identification at root (`reports/preview-policy-corrections.md` §4).** Cited but not adopted: full sequential halving requires an interruptible budget allocator, which is over-scoped for this iteration. The simpler "coverage + prior + bounded widening" allocator captures the core insight without the implementation surface.
- **Existing in-repo: `selectRepresentativeCandidatesByActionId`.** Already groups candidates by actionId for representative selection. Already deterministic. Already covered by tests. The new allocator generalizes its grouping function from `actionId` alone to a richer `previewGroupKey`.

**Synthesis.** Replace `pickTopKByMoveOnlyScore` with a three-phase allocator, delivered in three ticket waves:

- **Phase A — Coverage + cap.** Group candidates by `previewGroupKey = (actionId, decisionKind, parameterShapeSignature, sideTag?)` — engine-generic, no game-specific identifiers. Allocate `minPerGroup` slots round-robin across groups (default `1`), then fill remaining `fullCandidateCap` slots by a stable-key tie-broken move-only-score prior. Same cost ceiling as today's `topK`, structurally different selection.
- **Phase B — Structural-impact prior.** Compiler-side conservative read/write footprint extraction (`EffectFootprint = { writes, reads, mayTouchTokens, mayTouchZones, mayTouchVariables, mayTouchScores }`) per action / microturn-branch. Preview refs gain a parallel `readFootprint`. Allocator computes `structuralImpactScore = |writes ∩ previewRef.readFootprint|` and uses it (multiplicatively combined with prior) to fill remaining slots after coverage. Conservative under-approximation only — false positives waste preview time, false negatives recreate Gap 2.
- **Phase C — Widen-on-uniform.** When the previous decision's `previewUsage.utility === 'constant'` and a `widenCap` slack remains in the budget, the next call to the allocator increases `fullCandidateCap` by `widenStep` for that decision-class signature only (one decision in advance, then revert). Bounded one-step adaptive response to constant-projection traps without unbounded budget growth.

**Alternatives explicitly considered (and rejected).**

- **Just raise the default `topK` to 10 or 12.** Empirically improves but doesn't fix the circularity. Rejected — F#15 root-cause fix.
- **Diversity gating only (one representative per actionId, ignore everything else).** Solves Gap 2 but loses within-group ranking entirely — every Govern candidate is treated as a single equivalence class, which is wrong because different Govern targets project to different margins. Rejected — over-coarse.
- **Two-pass shallow + full preview (Recommendation C).** Cheap depth-1 pass over all candidates first, then full bounded synthetic completion only for the top of the shallow pass. Architecturally the strongest answer to "how do you rank without running preview?", but cost is ~2× when the shallow pass doesn't disambiguate. Folded into the structural-impact prior in Phase B, which captures the same signal (ref-write intersection) without an extra simulation pass. If empirics show the structural prior is too coarse, shallow-pass becomes Spec 161.
- **Resurrect closure-tree-style "preview every candidate at very low depth."** Equivalent to setting `topK = ∞` with a tighter `previewCompletionDepthCap`. Cost-prohibitive at FITL scale. Rejected — F#10.
- **Replace topK with a learned prior (no engine, small ML model).** Out of scope for a deterministic, YAML-authored profile system. Rejected — F#7 (specs are data, not code), F#8 (determinism).

**User constraints reflected.** F#1 (engine-agnostic — `previewGroupKey` and `EffectFootprint` are generic over GameDef shapes), F#7 (no eval, no scripts — footprints derived from compiled IR statically), F#8 (deterministic across phases — explicit stable tie-breaks, integer-only arithmetic, no `localeCompare`), F#10 (bounded — every phase has a hard cap), F#11 (immutable — allocator returns a new ReadonlySet, no in-place mutation), F#14 (delete `topK` and `pickTopKByMoveOnlyScore` in the same change as `preview.budget` lands; migrate every repo-owned profile YAML), F#15 (root-cause fix), F#16 (testing as proof — direct invariant tests for circularity-elimination).

## Overview

Replace `preview: { topK: number }` with `preview: { budget: { strategy, fullCandidateCap, minPerGroup, widenOnUniformProjection?, widenCap?, widenStep? } }`. Wire a new `allocatePreviewBudget` function into `policy-eval.ts` that replaces `pickTopKByMoveOnlyScore`. Compile-time validate that `fullCandidateCap >= minPerGroup × estimatedMaxGroupCount` (when statically derivable) to catch underspecified profiles.

The allocator has three passes:

1. **Coverage pass.** Group active candidates by `previewGroupKey`. Round-robin across groups by `(group priority desc, group key asc)`, taking up to `minPerGroup` candidates from each group, until `fullCandidateCap` is exhausted or all groups have contributed their minimum.
2. **Prior pass.** Fill remaining slots using `priorScore + structuralImpactScore` (Phase B; until B lands, just `priorScore` from move-only considerations as a placeholder, with `selectionReason: 'prior'`).
3. **Widening pass (Phase C, conditional).** If `widenOnUniformProjection: true` and the previous decision's `utility === 'constant'`, allow `fullCandidateCap + widenStep` for the matching decision class. One-step bounded adaptation; widenCap caps cumulative widening over a turn.

`previewGroupKey` (engine-generic):
- Component 1: `actionId` for action-selection candidates; `decisionKind:decisionKey` for inner-microturn candidates (when allocator is reused under Spec 160).
- Component 2: `parameterShapeSignature` — a stable hash over the candidate's bound-parameter shape (zone-set cardinality, token-count, side tag if present). Computed at gate time from already-resolved candidate metadata.
- Component 3: `sideTag` (if present in candidate metadata) — distinguishes event-card sides for FITL-shape games without naming "event card" or "side" in the engine.

Stable tie-breaking inside a group: `priorScore desc, structuralImpactScore desc, stableMoveKey asc`. No `localeCompare`; explicit codepoint compare via `<` / `>`.

## Phase Acceptance Budget

| Phase | Deliverable | Acceptance Criterion | Effort |
|-------|-------------|----------------------|--------|
| Phase A | Group coverage + cap; delete `topK`; migrate every repo-owned profile to `preview.budget` | On the FITL canary fixture: `previewUsage.utility === 'differentiating'` rate ≥ 60% (vs ~33% at `topK=4`); every actionId in the candidate set has at least one previewed candidate when `minPerGroup ≥ 1`; every shipped profile uses `preview.budget`; `pickTopKByMoveOnlyScore` is deleted. | M |
| Phase B | Compiler-side `EffectFootprint`; allocator uses `priorScore × structuralImpactScore` in the prior pass | On a constructed test fixture where one candidate's effect demonstrably writes to the preview ref's read footprint and others don't: that candidate is selected by the prior pass even when its move-only score is below median; conservative-footprint property test holds (no false-negatives over the FITL action corpus). | L |
| Phase C | Widen-on-uniform | `widenOnUniformProjection: true` with `utility === 'constant'` on decision N triggers `fullCandidateCap + widenStep` on decision N+1; widening is bounded by `widenCap`; trace records `widenedBecauseUniform: true`. | S |

## Architecture Check

1. **Why this approach is cleaner than alternatives.** The bug is shape, not scale. A wider `topK` doesn't fix selection-by-uncorrelated-score. Group-coverage breaks the circularity at its root: every candidate family is guaranteed at least one preview, so preview signal can reach the candidates that need it most. The prior pass then biases additional slots toward likely-impactful candidates without excluding any family. Compared to the alternatives (diversity-only, two-pass shallow, learned priors), this preserves within-family ranking, stays deterministic and bounded, and reuses existing repo primitives (`selectRepresentativeCandidatesByActionId`).
2. **GameSpecDoc vs runtime boundary.** `previewGroupKey` and `EffectFootprint` are derived from compiled IR — actionId, parameter shapes, ref names — all generic. No engine code interprets game-specific tokens, zones, or actions. Profile YAML gains `preview.budget` config knobs that the compiler validates. GameSpecDoc itself is unaffected.
3. **No backwards-compatibility shims.** `preview.topK` is deleted from the schema, the compiler, the runtime types, every repo-owned profile YAML, and every fixture. No alias, no deprecation warning, no `_legacy` field. F#14 strict.

## What to Change

### 1. Profile schema — `preview.topK` → `preview.budget`

`GameDef.schema.json` and the compile-time profile validator: replace the `topK: number` field on `preview` with a `budget: BudgetConfig` object. `BudgetConfig` validates `strategy: 'balancedCoverage'`, `fullCandidateCap: integer >= 1`, `minPerGroup: integer >= 0`, `widenOnUniformProjection?: boolean`, `widenCap?: integer >= 0`, `widenStep?: integer >= 1`. Compile-time error if `widenOnUniformProjection: true` and (`widenCap` or `widenStep`) is missing.

### 2. Allocator — `packages/engine/src/agents/policy-eval.ts`

Add `allocatePreviewBudget(input: AllocatorInput): AllocatorOutput`. Input: candidates, profile.preview.budget, evaluation context, considerations, prior-decision utility (Phase C). Output: `{ allowedKeys: ReadonlySet<StableMoveKey>, selectionReason: Map<StableMoveKey, SelectionReason>, widenedBecauseUniform: boolean }`. Delete `pickTopKByMoveOnlyScore`.

Pseudocode (Phase A, no prior pass yet):

```
groups = group(candidates, candidate => previewGroupKey(catalog, candidate))
sortedGroups = sort(groups, (a, b) => (a.priority - b.priority) || compareStrings(a.key, b.key))
allowed = new Set()
quota = fullCandidateCap
slot = 0
while quota > 0 and slot < minPerGroup:
  for group in sortedGroups:
    if quota <= 0: break
    candidate = sortedGroupCandidates(group)[slot]
    if candidate is undefined: continue
    allowed.add(candidate.stableMoveKey)
    quota -= 1
  slot += 1
remaining = candidates filtered by !allowed
priorRanked = sort(remaining, by priorScore desc, stableMoveKey asc)
for c in priorRanked: if quota <= 0: break; allowed.add(c.stableMoveKey); quota -= 1
return allowed
```

Phase B inserts `structuralImpactScore` multiplicatively into the prior pass. Phase C reads the prior decision's `utility` and conditionally bumps `fullCandidateCap`.

### 3. Group key — `packages/engine/src/agents/policy-eval.ts`

Add `previewGroupKey(catalog, candidate): string`. Engine-generic: concatenate stable string components with `|` separator. Component sources are all in compiled IR (no game-specific text). Add a unit test corpus of 20+ candidate shapes asserting key stability across runs.

### 4. Effect footprint (Phase B) — `packages/engine/src/cnl/compile-effects-*.ts`, new `compile-effect-footprint.ts`

Compiler walks each compiled effect AST and produces `EffectFootprint`. Conservative under-approximation: any branch whose target is dynamic (e.g., zone-by-binding) marks `mayTouchZones: ZoneId[] | 'unknown'`. Preview refs get a parallel `readFootprint` derived from their declared dependencies. The allocator computes intersection cardinality on resolved-known footprints; `'unknown'` is treated as universal-touch (i.e., any candidate with `'unknown'` is considered impactful for any preview ref) to preserve conservatism.

This is the largest sub-deliverable; it ships in Phase B as a separate ticket wave.

### 5. Widen-on-uniform (Phase C) — `packages/engine/src/agents/policy-eval.ts`

Track per-decision-class (`actionSelection at turnId X seatId Y`) a one-step memory: was the prior decision's `utility === 'constant'`? If so and `widenOnUniformProjection`, increase `fullCandidateCap` by `widenStep` for the next call only. Memory cleared on every turn boundary. Trace records `widenedBecauseUniform: boolean` on `previewUsage`.

### 6. Migrate every repo-owned profile

Update every YAML profile under `data/games/**` and every fixture under `packages/engine/test/**` from `preview: { topK: N }` to `preview: { budget: { strategy: balancedCoverage, fullCandidateCap: <derived-from-N>, minPerGroup: 1 } }`. Compile-time error gates any profile still using `topK`. F#14 strict.

### 7. Trace integration with Spec 156

Populate `selectionReason` per Spec 156's enum (`coverage`, `prior`, `widening`) on every candidate the allocator selected. `widenedBecauseUniform: boolean` lands on `previewUsage`. `previewGatedCount` parity-checked against `selectionReason: 'gated'` count — same value, both fields preserved this iteration.

## Files to Touch

- `packages/engine/schemas/GameDef.schema.json` (modify — `preview.topK` removed, `preview.budget` added)
- `packages/engine/src/cnl/compile-agents.ts` (modify — `lowerPreviewConfig` rewrites; profile validator; topK rejected with diagnostic)
- `packages/engine/src/agents/policy-eval.ts` (modify — `allocatePreviewBudget` added; `pickTopKByMoveOnlyScore` deleted; integration with Spec 156 trace)
- `packages/engine/src/cnl/compile-effect-footprint.ts` (new — Phase B)
- `packages/engine/src/agents/preview-group-key.ts` (new — engine-generic group keying)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — types for `BudgetConfig`, `EffectFootprint`, `AllocatorOutput`)
- `data/games/fire-in-the-lake/**/*.yaml` (modify — every profile migrated)
- `data/games/texas-holdem/**/*.yaml` (modify — every profile migrated)
- `packages/engine/test/fixtures/**` (modify — every fixture using `topK` migrated)
- `packages/engine/test/golden/**` (modify — re-bless commit `Re-bless golden trace: <each updated file> — Spec 157 budget allocator`)
- `packages/engine/test/unit/agents/preview-budget-allocator.test.ts` (new)
- `packages/engine/test/unit/agents/preview-group-key.test.ts` (new)
- `packages/engine/test/unit/agents/preview-effect-footprint.test.ts` (new — Phase B)
- `packages/engine/test/unit/agents/preview-widen-on-uniform.test.ts` (new — Phase C)
- `packages/engine/test/unit/cnl/compile-preview-budget.test.ts` (new — compile-time validation)
- `docs/agent-dsl-cookbook.md` (modify — `preview.budget` documented; migration guidance)

## Out of Scope

- New completion-policy semantics. (Spec 159.)
- Microturn-scope considerations. (Spec 158.)
- Per-option preview at inner microturns. (Spec 160.)
- Caching of preview results. (Future.)
- Two-pass shallow + full preview. (Folded into structural-impact prior; promotion to its own spec only if empirics demand it.)
- Sequential-halving / best-arm root selection. (Future research.)
- Replacing `previewGatedCount` field. (Coexists with `selectionReason: 'gated'` until a future cleanup spec.)

## Acceptance Criteria

### Tests That Must Pass

1. New: `allocatePreviewBudget` with `minPerGroup: 1, fullCandidateCap: 4` over 12 candidates spanning 6 actionIds selects at least one candidate from each of the first 4 groups (coverage invariant).
2. New: Allocator output for the FITL canary fixture has `previewUsage.utility === 'differentiating'` rate ≥ 60% (compared to 33% baseline at `topK=4`).
3. New: `previewGroupKey` is stable across two compiles of the same GameSpec (deterministic identity).
4. New (Phase B): On a fixture where candidate X's effect writes to a variable in the preview ref's read footprint and candidate Y's effect doesn't, X is selected by the prior pass when both are out of the coverage minimum.
5. New (Phase B): `EffectFootprint` is conservative — for every action in the FITL action corpus, the footprint marks every variable the action's compiled effect can demonstrably write (no false-negatives in a hand-checked sample).
6. New (Phase C): With `widenOnUniformProjection: true`, decision N+1 has `fullCandidateCap + widenStep` candidates allowed when decision N's `utility === 'constant'`; trace records `widenedBecauseUniform: true`.
7. New: Compile-time rejection of `preview.topK: 4` with a diagnostic naming the migration to `preview.budget`.
8. New: Replay-identity test — same GameDef + seed + actions twice produces byte-identical `selectionReason` map.
9. Existing engine suite: `pnpm -F @ludoforge/engine test`.
10. Existing typecheck: `pnpm turbo typecheck`.

### Invariants

1. (architectural-invariant) For every preview decision, `Σ |selected per group| ≥ min(numGroups, fullCandidateCap)` whenever `minPerGroup ≥ 1`.
2. (architectural-invariant) Allocator output size ≤ `fullCandidateCap + widenStep × widenCap` (hard bound, F#10).
3. (architectural-invariant) Allocator is deterministic across runs (replay-identity over `selectionReason` map).
4. (architectural-invariant) `pickTopKByMoveOnlyScore` is not exported and not referenced anywhere in `packages/engine/src/**` (delete-confirm test).
5. (architectural-invariant) No repo-owned profile YAML or fixture references `preview.topK` (compile-time grep test).
6. (golden-trace) FITL canary trace produces byte-identical `selectionReason` per candidate across runs.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/preview-budget-allocator.test.ts` (new) — `architectural-invariant`. Covers coverage, prior, widening, hard-cap.
2. `packages/engine/test/unit/agents/preview-group-key.test.ts` (new) — `architectural-invariant`. Stability + uniqueness over a 20-candidate corpus.
3. `packages/engine/test/unit/agents/preview-effect-footprint.test.ts` (new — Phase B) — `architectural-invariant`. Conservativeness property test over the FITL action corpus.
4. `packages/engine/test/unit/agents/preview-widen-on-uniform.test.ts` (new — Phase C) — `architectural-invariant`. Trigger + bounded-widening property.
5. `packages/engine/test/unit/cnl/compile-preview-budget.test.ts` (new) — `architectural-invariant`. Compile-time rejection of `topK` and underspecified `widenOnUniformProjection`.
6. `packages/engine/test/golden/balanced-coverage-fitl-canary.test.ts` (new) — `golden-trace`. Pinned FITL canary trace under `preview.budget` defaults.
7. `packages/engine/test/agents/policy-eval-allocator-replay-identity.test.ts` (new) — `architectural-invariant`. Two-run identity over `selectionReason` map.
8. `packages/engine/test/agents/no-topk-references.test.ts` (new) — `architectural-invariant`. Greps `packages/engine/src/**` for `topK` and asserts absence.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- agents/preview-budget-allocator`
2. `pnpm -F @ludoforge/engine test:unit -- agents/preview-group-key`
3. `pnpm -F @ludoforge/engine test:unit -- agents/preview-effect-footprint`
4. `pnpm turbo schema:artifacts`
5. `pnpm turbo lint typecheck test`
