# Architectural Question: Bounded-Computation Cap vs Practical Coverage at Deeply-Nested chooseN Frontiers

**Date**: 2026-05-08
**Codebase**: LudoForge-LLM (TypeScript engine for LLM-evolved board games, deterministic kernel + agent policy DSL)
**Engine state**: post-Spec-161 ("chooseNStep Inner Preview Integration") merged on `main` (PR #248). Spec 161 closed the architectural gap reported in `reports/preview-inner-choosenstep-architectural-gap-2026-05-07.md` — `preview.inner.chooseNStep: true` is no longer a silent no-op; the runtime now correctly invokes the per-root-option preview driver.
**Trigger**: Campaign `fitl-arvn-agent-evolution` post-Spec-161 baseline. With `preview.inner.chooseNStep: true` and a microturn-scope consideration referencing `preview.option.delta.victory.currentMargin.self`, ARVN seed 1000 produces 12 `chooseNStep` decisions in trace, 4 of which (≈33%) report `previewUsage.outcomeBreakdown.unknownDepthCap = legalCount` — i.e., **every** per-option drive abandoned at depth-cap before producing a margin signal. The cookbook frames per-option preview at chooseNStep as a uniform capability, but for these decisions the per-option signal is empty under any (`maxOptions`, `chooseNBeamWidth`, `depthCap`) combination admitted by the `INNER_PREVIEW_HARD_CAP = 256` validation cap.
**Goal**: Help an external deep-research LLM evaluate whether the cap-and-coverage situation is acceptable design (Foundation 10 "Bounded Computation" tradeoff) or a follow-up architectural gap, and propose remediation paths.

---

## TL;DR

After Spec 161 wired the `chooseNStep` per-option preview driver into the agent runtime, the feature works as documented at most chooseN frontiers — `previewUsage.mode = exactWorld`, per-option projected-margin deltas differentiate options, and the chooseN microturn evaluator consumes the per-option refs uniformly with `chooseOne`. **However**, for chooseN target-selection microturns whose effect-tree depth (the count of nested microturns the synthetic-completion drive must traverse before reaching a margin-affecting state) exceeds the validation cap's allowed `depthCap`, every per-option drive returns `outcome: depthCap` with no resolved refs. The microturn-scope consideration `preferOptionProjectedMargin` (the cookbook's recommended pattern) produces a uniform zero contribution across all candidates, and the chooseNStep selection silently falls back to the alphabetical tiebreaker `stableMoveKey`.

In a 4-player FITL game with deep coup-pacification / coup-redeployment / event chooseN ladders, this affects a meaningful fraction of the agent's chooseN decisions (4 of 12, ≈33%, in seed 1000 — different fractions on other seeds). The trace contains the evidence (`outcomeBreakdown.unknownDepthCap > 0`, `utility = "none"`) but no compile-time warning fires. The advertised feature simply does not deliver at this fraction of decisions.

The hard cap exists for good reason — Foundation 10 "Bounded Computation" requires preview validation cost to be bounded by a static formula. The validation formula `maxOptions × (1 + chooseNBeamWidth × maxOptions × max(0, depthCap − 1)) ≤ 256` admits at most `depthCap = 8` (with `maxOptions = 4`, `chooseNBeamWidth = 1`). For some FITL chooseN ladders, even depth 8 is insufficient.

The question this report frames: **is the current cap+coverage situation an acceptable bounded-computation tradeoff, a documentation gap, or an architectural gap warranting a new spec?** Five remediation paths are proposed with trade-offs.

---

## Background: How LudoForge-LLM agent preview works

This section is essential context for an external reviewer.

### 1. Microturn-granularity decisions (Foundation 19)

The kernel publishes exactly one **microturn** at a time. Three kinds:

- `actionSelection` — pick the next ACTION (e.g., FITL ARVN picks between `govern`, `train`, `patrol`, etc.)
- `chooseOne` — pick ONE option from a published value list (e.g., govern-mode chooseOne with options `["aid", "patronage"]`)
- `chooseNStep` — pick the next ADD or CONFIRM step in a multi-pick sequence (e.g., `chooseN{min:1, max:2}` over target spaces, picked one at a time with explicit confirm)

Each microturn has a `decisionContext` with the legal options and a stable identity key.

### 2. PolicyAgent considerations and scope

A profile's `use.considerations` lists scoring terms with `scopes`:

- `scopes: [move]` — fires at `actionSelection` to score outer action candidates
- `scopes: [microturn]` — fires at `chooseOne` / `chooseNStep` to score per-option choices

The cookbook (`docs/agent-dsl-cookbook.md`) documents the worked example for microturn-scope per-option preview:

```yaml
preferOptionProjectedMargin:
  scopes: [microturn]
  costClass: preview
  weight: 300
  value:
    ref: preview.option.delta.victory.currentMargin.self
```

This consideration scores each option by the projected change in the acting seat's victory margin if that option were selected.

### 3. Per-option preview drive (the relevant feature)

Specs 160 and 161 added an opt-in capability:

```yaml
preview:
  mode: exactWorld
  budget:
    strategy: balancedCoverage
    fullCandidateCap: 10
    minPerGroup: 1
  inner:
    chooseOne: true       # spec 160
    chooseNStep: true     # spec 161
    maxOptions: 8
    chooseNBeamWidth: 1
    depthCap: 4
```

For each legal option at an inner microturn, the runtime constructs a Spec 146 draft state, applies the option, and runs a bounded synthetic-completion drive forward through the kernel to a "decision boundary" (next actionSelection / outcomeGrant / turnRetirement / different seat / different turn / `stochasticResolve` / `depthCap`). At the boundary, the drive resolves `preview.option.*` refs against the post-state. The per-option resolved refs are mapped by the chooseN microturn evaluator (`microturn-option-evaluator.ts:154`) onto each ADD candidate.

The drive is deterministic. The `completion` policy controls how the drive picks SUBSEQUENT inner microturns it traverses (default `policyGuided` — recursively scores them with the same profile's microturn-scope considerations; alternatively `greedy` — alphabetical pick).

### 4. The bounded-computation cap (Foundation 10)

The compiler enforces:

```typescript
// packages/engine/src/cnl/compile-agents.ts:81
const INNER_PREVIEW_HARD_CAP = 256;

// packages/engine/src/cnl/compile-agents.ts:1017-1019
const cost = chooseNStep === true
    ? loweredMaxOptions * (1 + loweredChooseNBeamWidth * loweredMaxOptions * Math.max(0, loweredDepthCap - 1))
    : loweredMaxOptions * loweredChooseNBeamWidth * loweredDepthCap;
if (!Number.isSafeInteger(cost) || cost > INNER_PREVIEW_HARD_CAP) {
    diagnostics.push({
      code: CNL_COMPILER_AGENT_PREVIEW_INNER_COST_EXCEEDS_HARD_CAP,
      ...
    });
    return undefined;
}
```

For `chooseNStep: true`, the validation cost is `maxOptions × (1 + chooseNBeamWidth × maxOptions × max(0, depthCap − 1))`. The cap permits these (maxOptions, depthCap) combinations with `chooseNBeamWidth = 1`:

| maxOptions | depthCap | cost = maxOptions × (1 + maxOptions × (depthCap − 1)) |
|---:|---:|---:|
| 8 | 4 | 200 ≤ 256 ✓ |
| 8 | 5 | **264** > 256 ✗ |
| 6 | 6 | 186 ≤ 256 ✓ |
| 6 | 7 | 222 ≤ 256 ✓ |
| 6 | 8 | **258** > 256 ✗ |
| 4 | 8 | 116 ≤ 256 ✓ |
| 4 | 9 | 132 ≤ 256 ✓ |
| 4 | 10 | 148 ≤ 256 ✓ |
| 4 | 12 | 180 ≤ 256 ✓ |
| 4 | 16 | 244 ≤ 256 ✓ |
| 4 | 17 | **260** > 256 ✗ |
| 2 | 32 | 126 ≤ 256 ✓ |
| 2 | 64 | 254 ≤ 256 ✓ |

(For completeness: at `maxOptions = 1`, `chooseNBeamWidth = 1`, the formula becomes `1 × (1 + 1 × (depthCap − 1)) = depthCap`, which would admit `depthCap ≤ 256` — but `maxOptions = 1` means the per-option drive evaluates only ONE option, defeating the entire purpose of per-option preview. The minimum useful `maxOptions` for differentiation is 2.)

So the practical maximum useful depth is around `depthCap = 16` at `maxOptions = 4`, or `depthCap = 7` at `maxOptions = 6`, etc.

The cap is justified by Foundation 10 (Bounded Computation). The static cost upper-bounds the total synthetic-microturn work per chooseNStep frontier, ensuring the agent's preview pipeline cannot exceed a known computational budget.

---

## Empirical evidence: the practical coverage gap

### FITL game and ARVN's profile

**Game**: Fire in the Lake (FITL) is a 4-player COIN-series board wargame. ARVN's victory formula is `controlledPopulationPlusGlobalVar(coin, patronage)`, threshold 50 — i.e., COIN-controlled population + the `patronage` global variable must exceed 50.

**Profile** (post-spec-161 `arvn-evolved`, mutable surface of the campaign):

```yaml
arvn-evolved:
  observer: currentPlayer
  preview:
    mode: exactWorld
    budget:
      strategy: balancedCoverage
      fullCandidateCap: 10
      minPerGroup: 1
    inner:
      chooseOne: true
      chooseNStep: true
      maxOptions: 8
      chooseNBeamWidth: 1
      depthCap: 4
  params:
    projectedMarginWeight: 300
    governWeight: 1000
    trainWeight: 300
  use:
    pruningRules:
      - dropPassWhenOtherMovesExist
    considerations:
      - preferProjectedSelfMargin       # scopes: [move]
      - preferStrongNormalizedMargin
      - preferGovernWeighted
      - preferTrainWeighted
      - governWhenPatronageLow
      - trainWhenControlLow
      - preferOptionProjectedMargin     # scopes: [microturn], the cookbook pattern
    tieBreakers:
      - stableMoveKey
```

### Trace data for ARVN seed 1000 (single-game run)

The harness ran one FITL simulation (4 players, seed 1000, max 200 turns). The game terminated normally (`stopReason: "terminal"`, VC won the first Coup). ARVN played 57 decisions across 5 outer operations + Coup pacification/redeployment.

Decision-kind breakdown:

| decisionKind | count | utility = differentiating | utility = constant (range = 0) | utility = none |
|---|---:|---:|---:|---:|
| actionSelection | 20 | 1 | 18 | 1 |
| chooseOne | 25 | 4 | 21 | 0 |
| **chooseNStep** | **12** | **1** | **5** | **6** |
| total | 57 | 6 | 44 | 7 |

For chooseNStep specifically, the per-decision breakdown:

| chooseNStep # | legal options | evaluatedCandidateCount | utility | outcomeBreakdown |
|---:|---:|---:|---|---|
| 1 | 8 | 64 | none | unknownDepthCap = 8 |
| 2 | 9 | 28 | constant | ready = 7 (range = 0) |
| 3 | 7 | 49 | none | unknownDepthCap = 7 |
| 4 | 8 | 24 | constant | ready = 6 (range = 0) |
| 5 | 5 | 25 | none | unknownDepthCap = 5 |
| 6 | 6 | 16 | constant | ready = 4 (range = 0) |
| 7 | 4 | 16 | none | unknownDepthCap = 4 |
| 8 | 5 | 12 | constant | ready = 3 (range = 0) |
| 9 | 26 | 104 | **differentiating** | ready = 26 (range = 2) |
| 10 | 2 | 0 | none | (zero candidates evaluated) |
| 11 | 2 | 3 | constant | ready = 1 (range = 0) |
| 12 | 2 | 0 | none | (zero candidates evaluated) |

The four `unknownDepthCap` rows (#1, #3, #5, #7) are the structural ones for this report. The per-root-option drive's `outcomeBreakdown.unknownDepthCap` equals the legal-option count — i.e., **every** per-option drive abandoned at the configured `depthCap = 4` before reaching a state that produces a margin signal. The `readyRefStats` for `preview.option.delta.victory.currentMargin.self` on these decisions is empty (`readyCount = 0`). The microturn-scope consideration `preferOptionProjectedMargin` produces a zero contribution across all candidates, and the chooseN selection falls back to alphabetical `stableMoveKey`.

These four decisions correspond to **outer chooseN target-selection microturns inside FITL action effect trees that nest several layers of inner chooseNs**. For example, in FITL coup pacification, an outer chooseN `over $targetSpaces` for the pacify action contains nested chooseN-driven sub-effects (per-space pacification options, per-space unit selection, per-space marker shifts, etc.). The synthetic-completion drive must traverse multiple inner microturns before reaching a state where the post-action margin formula evaluates differently across the original outer candidates.

### Reshuffling (maxOptions, depthCap) within the cap does not unblock these decisions

Campaign experiment exp-001 reshuffled to `maxOptions = 6, depthCap = 6` (cost 186 ≤ 256). Result: actionSelection's `differentiating` count rose from 1 to 12 (deeper drives produced more diverse projected margins per outer action candidate), but the four chooseNStep `unknownDepthCap` decisions remained at `unknownDepthCap`. Increasing depth from 4 to 6 was insufficient to break out of the inner-chooseN ladder for those specific frontiers.

Campaign experiment exp-003 (same change at tier 2, multi-seed) confirmed the pattern across seeds 1000 and 1001. compositeScore unchanged across all three NEAR_MISS experiments at `-6` (tier 1 single seed) or `-5.5` (tier 2 two seeds).

The math: under the cap, no `(maxOptions ≥ 2, depthCap)` combination admits `depthCap > 16`. For these four FITL chooseNStep decisions, even depth 16 may or may not suffice — the empirical depth requirement has not been measured beyond the cap-allowed range.

### Documentation: the cookbook does not warn

The cookbook section "Inner Preview" (`docs/agent-dsl-cookbook.md` lines 251–375) frames per-option preview as a uniform capability across `chooseOne` and `chooseNStep`. The section "Per-option Preview at chooseNStep" (line 341) reads:

> For `chooseNStep`, use the same microturn-scoped consideration. Spec 161 makes the per-option projected refs available for each legal ADD option, so the consideration differentiates the currently published add choices the same way it differentiates `chooseOne` options.

The cookbook documents the cost formula (line 375) but does NOT warn that:

- For deeply-nested chooseN ladders, every per-option drive may abandon at depth-cap and produce no resolved refs.
- In that case, the microturn-scope `preferOptionProjectedMargin` consideration produces uniform zero contributions and the selection falls back to alphabetical `stableMoveKey`.
- The trace contains the evidence (`outcomeBreakdown.unknownDepthCap > 0`, `utility = "none"`, all candidates' `selectionReason: gated`, `previewOutcome: depthCap`) but no runtime warning fires.

An operator who follows the cookbook recipe and sets `preview.inner.chooseNStep: true` reasonably expects per-option signal to differentiate options at chooseNStep frontiers in the same way it differentiates chooseOne. For a meaningful fraction of FITL's chooseN decisions, the recipe silently does not deliver.

---

## Foundations and design intent

To evaluate whether the situation is a gap or a tradeoff, the relevant Foundations from `docs/FOUNDATIONS.md`:

- **Foundation 10 (Bounded Computation)**: "Every preview pipeline must be bounded by a static cost formula computable at compile time. No agent can incur unbounded synthetic-completion work." The 256 hard cap is the operationalization; the squared-cost formula `maxOptions × (1 + chooseNBeamWidth × maxOptions × max(0, depthCap − 1))` is the static bound. This Foundation is *the* design driver for the cap.
- **Foundation 15 (Architectural Completeness)**: "When a feature is documented and the compiler accepts its configuration, the runtime must deliver the documented behavior. Silent no-ops violate this principle." Spec 161 closed one such gap (the runtime did not invoke the chooseNStep driver at all). This report asks whether the *partial* delivery — the driver runs but produces no signal at deeply-nested decisions — is itself a Foundation 15 violation, or a documented bounded-computation tradeoff.
- **Foundation 19 (Decision-Granularity Uniformity)**: "Per-option preview at chooseNStep is the per-published-decision analog of per-option preview at chooseOne." Spec 161 honored this for the wiring; for the practical signal, the analogy holds where depth permits but breaks where it does not.

Spec 161's rationale (`archive/specs/161-choosenstep-inner-preview-integration.md`) explicitly derived the squared-cost formula from Foundation 10:

> Foundation 10 (Bounded Computation) — squared-cost formula `maxOptions × (1 + chooseNBeamWidth × maxOptions × max(0, depthCap − 1)) ≤ INNER_PREVIEW_HARD_CAP` is the corrected static bound; existing per-microturn cost cap remains 256.

The cap value (256) was inherited from Spec 160 (`archive/specs/160-per-option-preview-inner-microturns.md`). The choice does not appear in any spec to have been validated against the actual chooseN nesting depths of FITL or any other shipped game.

---

## The architectural question

**Is the current state acceptable design or a follow-up gap?**

Arguments for "acceptable design (Foundation 10 tradeoff)":

1. The cap exists for principled reasons. Without it, preview cost can grow unboundedly, violating a load-bearing Foundation.
2. The trace contains the evidence (`outcomeBreakdown.unknownDepthCap > 0`, `utility = "none"`). An attentive operator can detect the no-signal condition.
3. Microturn-scope considerations not depending on preview (e.g., `microturn.option.value`-based scoring) work at deeply-nested frontiers and provide an authoring escape hatch.
4. Bounded preview is fundamentally myopic; the operator should not expect it to "see through" arbitrary depth.

Arguments for "follow-up architectural gap":

1. **The cookbook does not warn.** The recipe is presented as universal. Operators authoring against the cookbook are surprised silently.
2. **No compile-time or runtime warning fires.** Setting `preview.inner.chooseNStep: true` and authoring `preferOptionProjectedMargin` produces no diagnostic at any layer when the practical signal is empty for some decisions.
3. **The cap was not sized against shipped games.** No spec or commit message documents an analysis of FITL's chooseN nesting depths against the cap's permissible `depthCap`.
4. **Foundation 15 says "the runtime must deliver the documented behavior."** For the affected fraction of decisions, the runtime delivers `mode = exactWorld` (the wiring works) but no resolved per-option refs (the *behavior* the operator is opting in for). It is partially a delivery and partially a no-op.
5. **The same pattern produced Spec 161.** The original chooseNStep "silent no-op" was structurally similar (compiler accepts, runtime fails to deliver). Spec 161 closed that. The current cap-coverage situation has the same shape but at a finer-grained layer.
6. **The campaign cannot reliably evolve agent policy at affected decisions.** Microturn-scope per-option considerations referencing `preview.option.*` produce uniform zero contributions when all per-option drives abandon at depth-cap, leaving the selection to a lexical tiebreaker. Authoring richer microturn-scope policy for those decisions is contraindicated until alternate signal sources are in place.

The question is genuinely contested. The codebase's current Foundation set supports either interpretation; the choice depends on (a) whether the cap value (256) was deliberately chosen against real workload depth, and (b) what fraction of decisions the gap affects across the games the engine targets.

---

## Remediation options (with trade-offs)

### Option A — Document the limitation, add a runtime warning, accept the tradeoff

**Mechanism**: Update the cookbook section "Per-option Preview at chooseNStep" to warn that for deeply-nested chooseN ladders, the per-option drive may abandon at depth-cap and produce no signal. Recommend authoring non-preview microturn-scope considerations (e.g., `microturn.option.value`-based equality scoring) for known-deep frontiers. Add a runtime trace-time advisory or compile-time warning when a profile opts into `preview.inner.chooseNStep: true` with a `preview.option.*` consideration but cannot guarantee depth budget will reach margin-affecting state — though detecting this statically is hard; a profile-time warning would be heuristic.

**Trade-offs**:
- **Pro**: Lightweight; preserves Foundation 10 unchanged; aligns with the actual current behavior.
- **Pro**: Adding a runtime advisory ("this profile produced 4/12 chooseNStep `unknownDepthCap` decisions; consider non-preview considerations for these frontiers") gives operators a feedback loop.
- **Con**: Does not actually deliver per-option signal at the affected decisions. The operator is left to author workaround considerations.
- **Con**: For game decisions where the *structure* of the right answer is "compare projected margin across options" (e.g., "target the highest-population space"), the workaround consideration must encode game-specific knowledge that preview was supposed to derive automatically.

### Option B — Raise the validation cap

**Mechanism**: Increase `INNER_PREVIEW_HARD_CAP` from 256 to a value (e.g., 512, 1024) that admits `depthCap` adequate for shipped games' chooseN nesting depths. Validate that preview runtime stays acceptable under the new cap by benchmarking on representative games.

**Trade-offs**:
- **Pro**: Direct fix. Honors Foundation 10 with a tighter justified bound.
- **Pro**: Existing profiles and tests continue to compile (the cap is a *upper* bound; raising it strictly admits more configurations).
- **Con**: Requires runtime cost validation. Doubling the cap potentially doubles preview work per chooseNStep frontier in worst cases, which can compound across decisions.
- **Con**: The right value depends on workload depth, which is currently unmeasured. Picking 512 vs 1024 vs 2048 without analysis is arbitrary.
- **Con**: Even at a higher cap, sufficiently deep ladders will still hit the limit. This is a "buy more headroom" move, not an architectural fix.

### Option C — Add a partial-progress fallback at depth-cap

**Mechanism**: When the per-option drive abandons at `depthCap`, instead of marking `outcome: depthCap` with no resolved refs, produce a *partial* signal: e.g., resolve `preview.option.var.global.<id>` and `preview.option.metric.<id>` against the depth-cap state (which has had partial action effects applied), and only mark `currentMargin.self` as `unknownDepthCap` if the margin-affecting effects have not yet executed. The drive would continue to apply the option's effects up to depth-cap; whatever vars were updated within that depth become available, even if the full margin formula has not yet converged.

**Trade-offs**:
- **Pro**: Recovers some signal at affected decisions without raising the cap.
- **Pro**: Honors Foundation 10 unchanged.
- **Pro**: Trace becomes richer at depth-cap-bounded decisions — operators can see "patronage var increased by 3, but margin has not yet stabilized" instead of "no signal".
- **Con**: Designing the partial-resolution rule is non-trivial. Refs that depend on full state convergence (e.g., margin formula dependent on derived metrics that update at end-of-effect) may produce *misleading* partial values.
- **Con**: Determinism must be maintained — the partial-state values must be a deterministic function of (option, depth, completion policy).
- **Con**: Existing trace consumers may rely on the current "all-or-nothing" semantics.

### Option D — First-class state-feature lookups at microturn scope

**Mechanism**: Extend microturn-scope considerations with non-preview state-feature lookups keyed on `microturn.option.value`. For example, for FITL chooseN target-selection where `microturn.option.value` is a space ID, allow the consideration to resolve `zoneProp.<space-id-from-option-value>.population` directly from the *current* state (no synthetic-completion drive). This sidesteps the depth limit entirely for these decisions: the operator authors a domain-specific consideration that scores by static space properties, and the agent picks high-value targets without needing forward simulation.

The DSL-level shape might look like:

```yaml
preferHighPopulationTarget:
  scopes: [microturn]
  when:
    eq: [{ ref: microturn.kind }, chooseNStep]
  weight: 50
  value:
    # New ref form: resolve a state surface using the current option's value as a key
    ref:
      lookup: zone
      keyExpr: { ref: microturn.option.value }
      property: population
```

**Trade-offs**:
- **Pro**: Architecturally clean — adds a new declarative ref family rather than tweaking preview internals.
- **Pro**: Sidesteps depth limits entirely.
- **Pro**: Generalizes — useful for any microturn-scope domain-knowledge scoring, not just chooseN target selection.
- **Pro**: Honors Foundation 10 (state lookups are O(1) per option, no synthetic-completion cost).
- **Con**: Introduces a new ref family — needs design (key resolution semantics, type safety, hidden-info routing for player-scoped state, etc.).
- **Con**: Game-agnostic engine code cannot know what `microturn.option.value` *means* (it could be a string like `"an-loc:none"`, a token reference, an enum value, etc.). The lookup form must be game-agnostic and let the DSL author specify the resolution path.
- **Con**: Does not improve preview itself — it adds a parallel signal source that operators must learn.

### Option E — Compile-time depth analysis with per-decision coverage warning

**Mechanism**: At compile time, statically analyze each game's chooseN microturn nesting depth (the `chooseN`-within-`chooseN` path lengths in compiled action effect trees). Emit a compile warning when a profile opts into `preview.inner.chooseNStep: true` with a `preview.option.*` consideration AND the game has chooseN frontiers whose worst-case depth exceeds the configured `depthCap`. The warning would name the affected decisions (by stable decision key) so the operator can author workaround considerations.

**Trade-offs**:
- **Pro**: Closes the silent-no-op symptom: operators no longer get zero feedback when authoring against an under-budgeted cap.
- **Pro**: Static analysis aligns with engine philosophy (compile-time guarantees).
- **Pro**: Lightweight runtime change (only the compiler is touched).
- **Con**: Static depth analysis of chooseN nesting is complex — the compile-time effect tree may include `if`/`forEach`/`bind` branches whose chooseN frontier emergence depends on runtime state. The analysis must be conservative (over-warn) or it misses cases.
- **Con**: Does not deliver signal — only documents the absence of signal.
- **Con**: The depth analysis is per-game-spec, not per-profile; the profile may have authored alternate considerations that handle the affected decisions, and the warning would be a false positive.

---

## Recommended investigation venues

Before committing to a remediation path, the following questions should be answered:

1. **What was the empirical depth-budget analysis behind the 256 cap?** Search Spec 160 archaeology, original ticket discussions, and any Foundation documentation. If the cap was chosen without analysis, raising it (Option B) becomes more defensible.

2. **Across LudoForge's shipped games (FITL, Texas Hold'em), what fraction of chooseN frontiers have per-option drives that abandon at depth-cap under (`maxOptions = 6, depthCap = 6`)?** Run an instrumented harness that aggregates `outcomeBreakdown.unknownDepthCap` counts across a corpus of seeds and profiles. If FITL is the only affected game and the affected fraction is small, Option A may be sufficient. If multiple games are affected and the fraction is large, Option C or D becomes more attractive.

3. **For the four affected ARVN chooseNStep decisions in seed 1000, what is the actual minimum depth at which a per-option drive would produce non-uniform `currentMargin.self` projections?** Manually trace through the FITL action effect trees for the relevant chooseN frontiers (`coup pacification`, `coup redeployment`, `event resolution`) and count nested microturn levels. This gives the empirical depth requirement and tells us whether the cap is "off by 2x" or "off by 100x".

4. **Would Option C's partial-progress fallback produce useful or misleading signals?** Construct a synthetic test: a chooseN with three options where each modifies a different global var, the margin formula depends on all three, and the per-option drive abandons after one var update. Does `preview.option.var.global.<id>` differentiate the three options usefully? Does any `preview.option.delta.*` ref produce wrong-direction signal?

5. **How would Option D's `microturn.option.value`-keyed state lookup interact with hidden-information policy (Foundation 4)?** Spec 160's preview-surface plumbing routes through `policy-surface.ts:104` and applies observer-view filtering. A new ref family must replicate this routing.

6. **Is there a compositional Foundation-10-compliant alternative to raising the cap?** For example, a "two-pass" preview where the first pass enumerates options at low depth (broad coverage) and the second pass does full depth-resolution only on the top-K options from the first pass. Total cost stays bounded; effective depth at top options increases.

---

## Code anchors for further investigation

For an external LLM proposing concrete designs, the following files and functions are central:

- `packages/engine/src/cnl/compile-agents.ts:81` — `INNER_PREVIEW_HARD_CAP = 256` constant.
- `packages/engine/src/cnl/compile-agents.ts:1017–1030` — cost formula and validation diagnostic emission.
- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts` — the chooseNStep per-root-option preview driver introduced by Spec 161 (591 lines).
- `packages/engine/src/agents/policy-preview-inner.ts:313–417` — `driveOption` synthetic-completion drive (the loop that hits `if (depth >= depthCap) return finish(state, depth, 'depthCap');` at line 358).
- `packages/engine/src/agents/policy-preview-inner.ts:419–462` — `resolveRefs` helper that resolves `preview.option.*` refs against post-drive state (returns empty map when drive ended at `depthCap` and no per-option refs were recorded).
- `packages/engine/src/agents/microturn-option-evaluator.ts:42` — `scoreContributionsKeyForChooseNStepAdd` keying convention.
- `packages/engine/src/agents/microturn-option-evaluator.ts:154` — chooseN evaluator's consumption of `previewOptionResolvedRefsByOptionKey`.
- `packages/engine/src/agents/policy-agent.ts:266` — `chooseFrontierDecision` dispatch (post-Spec-161 invokes both chooseOne and chooseNStep adapters).
- `docs/agent-dsl-cookbook.md:251–375` — "Inner Preview" section, the operator-facing documentation.
- `docs/FOUNDATIONS.md` — Foundation 10, 15, 19 statements (read for the design intent the cap operationalizes).
- `archive/specs/161-choosenstep-inner-preview-integration.md` — Spec 161's full design rationale, alternatives considered (Y, Z, W), and corrected cost formula derivation.
- `archive/specs/160-per-option-preview-inner-microturns.md` — Spec 160's introduction of `INNER_PREVIEW_HARD_CAP`, the original cost formula, and the deferral that produced the original gap.
- `reports/preview-inner-choosenstep-architectural-gap-2026-05-07.md` — prior report describing the silent-no-op gap that Spec 161 closed.
- `reports/preview-inner-choosenstep-proposal.md` — external deep-research proposal that informed Spec 161.

For trace-data inspection, the relevant fields on each `agentDecision` in a verbose trace:

```typescript
type PolicyAgentDecisionTrace = {
  // ...
  previewUsage: {
    mode: 'exactWorld' | 'tolerateStochastic' | 'disabled';
    evaluatedCandidateCount: number;
    completionPolicyFallbackCount: number;
    refIds: readonly string[];
    unknownRefs: readonly string[];
    readyRefStats: Record<string, {
      readyCount: number;
      distinctValueCount: number;
      min: number | null;
      max: number | null;
      range: number | null;
      allReadyValuesEqual: boolean;
    }>;
    utility: 'differentiating' | 'constant' | 'none';
    widenedBecauseUniform: boolean;
    outcomeBreakdown: {
      ready: number;
      stochastic: number;
      unknownRandom: number;
      unknownHidden: number;
      unknownUnresolved: number;
      unknownDepthCap: number;     // <-- the field that flags this report's symptom
      unknownNoPreviewDecision: number;
      unknownGated: number;
      unknownFailed: number;
    };
  };
  candidates: readonly {
    actionId: string;
    stableMoveKey: string;
    score: number;
    prunedBy: readonly { ruleId: string }[];
    scoreContributions: readonly { termId: string; contribution: number }[];
    previewRefIds: readonly string[];
    unknownPreviewRefs: readonly string[];
    selectionReason: 'gated' | 'scored' | 'tiebreak';
    previewOutcome: 'ready' | 'stochastic' | 'depthCap' | 'hidden' | /* ... */ ;
    previewDrive?: {
      depth: number;
      completionPolicy: 'policyGuided' | 'greedy';
      syntheticDecisions: readonly {
        depth: number;
        microturnKind: 'chooseOne' | 'chooseNStep';
        decisionKey: string;
        selectedOptionStableKey: string;
        selectionReason: 'microturnPolicy' | 'greedyAlphabetical' | 'fallback';
        score: number;
        scoreContributions: readonly { termId: string; contribution: number }[];
        completionPolicy: 'policyGuided' | 'greedy';
      }[];
    };
  }[];
  selectedStableMoveKey: string;
};
```

---

## Sample concrete trace excerpt (chooseNStep #1 from ARVN seed 1000)

The first chooseNStep `unknownDepthCap` decision from the trace, abridged:

```json
{
  "decisionKind": "chooseNStep",
  "actionId": "chooseNStep",
  "legalMoveCount": 8,
  "agentDecision": {
    "kind": "policy",
    "agent": { "kind": "policy", "profileId": "arvn-evolved" },
    "seatId": "arvn",
    "selectedStableMoveKey": "chooseNStep:decision:doc.actionPipelines.20.stages[0].effects.0.if.else.0.if.else.0.chooseN::$targetSpaces:add:\"an-loc:none\"",
    "finalScore": 1,
    "previewUsage": {
      "mode": "exactWorld",
      "evaluatedCandidateCount": 64,
      "refIds": ["preview.option.delta.victory.currentMargin.self"],
      "unknownRefs": [],
      "readyRefStats": {
        "preview.option.delta.victory.currentMargin.self": {
          "readyCount": 0,
          "distinctValueCount": 0,
          "min": null,
          "max": null,
          "range": null,
          "allReadyValuesEqual": true
        }
      },
      "utility": "none",
      "outcomeBreakdown": { "unknownDepthCap": 8, /* others 0 */ }
    },
    "candidates": [
      {
        "actionId": "chooseNStep",
        "stableMoveKey": "...add:\"an-loc:none\"",
        "score": 1,
        "scoreContributions": [],
        "previewRefIds": ["preview.option.delta.victory.currentMargin.self"],
        "unknownPreviewRefs": [],
        "selectionReason": "gated",
        "previewOutcome": "depthCap",
        "previewDrive": {
          "depth": 2,
          "completionPolicy": "policyGuided",
          "syntheticDecisions": [
            {
              "depth": 1,
              "microturnKind": "chooseNStep",
              "decisionKey": "decision:doc.actionPipelines.20.stages[0].effects.0.if.else.0.if.else.0.chooseN::$targetSpaces",
              "selectedOptionStableKey": "...add:\"ba-xuyen:none\"",
              "selectionReason": "microturnPolicy",
              "score": 0,
              "scoreContributions": [],
              "completionPolicy": "policyGuided"
            }
          ]
        }
      }
      /* 7 more candidates, all with previewOutcome=depthCap, score=1, empty scoreContributions */
    ]
  }
}
```

Note that:
- All 8 candidates have `previewOutcome: "depthCap"`.
- All 8 have `score: 1` (a baseline score from `preferOptionProjectedMargin` × 1, which is the consideration's value resolving to undefined and falling back to a default — the actual contribution would be 0 if the ref were unknown, but the trace shows `unknownPreviewRefs: []` meaning the ref is "known but undefined" rather than "unknown" — a subtle observability nuance).
- The synthetic drive reached `depth: 2` (one inner chooseNStep `add` was applied via `microturnPolicy`) before abandoning at `depthCap` (configured 4, but only 2 levels of microturns were emitted, possibly because the third microturn published was already terminal-kinded — outcomeGrant or similar — and the drive returned `ready` for some candidates while others hit the cap; needs deeper inspection to confirm).
- The `selectedStableMoveKey` ends in `add:"an-loc:none"`, the alphabetically-first `add` value, confirming the lexical fallback when scores are uniform.

---

## Out of scope for this report

- The `completionPolicyFallbackCount` co-existing with `previewOutcome: ready` semantics that Spec 161 deferred. (Mentioned in `reports/preview-inner-choosenstep-proposal.md` as "orthogonal to the chooseNStep integration".) If the deep-research LLM's analysis surfaces interactions, note them but do not assume they are part of this gap.
- The Tier 1 single-seed metric ceiling observation from the campaign (compositeScore unchanged across baseline + exp-001 + exp-002). That is a methodological observation about evaluation harness design, not an architecture question.
- Whether the cap value 256 should be parameterized per-game or per-profile. That is a derivative design question only relevant if Option B is chosen.

---

## Closing note

This report frames a contested architectural question. The current behavior is internally consistent (Foundation 10 enforced via a static cap) and externally surprising (the cookbook's universal framing does not warn about depth-bounded coverage gaps). Both descriptions are accurate; the question is whether the engine team treats "internally consistent but operator-surprising" as a Foundation 15 violation or as documentation work.

The campaign that surfaced this finding (`fitl-arvn-agent-evolution`) is paused at compositeScore = -5.5 (tier 2 baseline) pending the engine team's decision on whether/how to remediate. Per the user's directive, "we don't want to evolve any AI agent policy until we're sure the entire architecture works as expected." This report supplies the evidence and options needed for that decision.
