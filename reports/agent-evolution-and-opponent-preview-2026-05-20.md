# Agent Evolution Reliance & the Recurring Opponent-Margin Preview Gap

**Date**: 2026-05-20
**Status**: Decision + findings memo / deep-research brief.
**Audience**: ChatGPT-Pro deep research (primary), and the next implementation session (secondary).
**Author context**: Written after merging the structured-strategy policy layer (Specs 181/182) and the WASM preview-parity fix (Spec 184), while reassessing `specs/183-evolution-loop-overhaul.md` and the stalled `campaigns/fitl-arvn-agent-evolution` campaign.

---

## 1. Purpose & how to use this report

This is a self-contained brief. The operator's standing concern is that **the opponent-margin preview has been a recurring problem** for the FITL ARVN agent: across multiple improve-loop sessions, considerations that try to express opponent denial (a fundamental COIN pattern) turn out to be dead-weight, and the campaign keeps re-discovering the same wall. We have a thorough prior diagnosis (`archive/reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md`) that proposed three fix directions and recommended landing an engine spec — and that recommendation was **not** acted on. Instead the symptom was routed into an evolution-loop acceptance penalty (Spec 183), leaving the underlying engine gap open.

The deep-research ask (Section 7) is: **what is the right engine-level fix for opponent-effect visibility in the action-selection preview**, given everything we've learned and the new architectural constraints since the May-17 report.

Sections 2–6 supply the framing and the verified state of the world so the deep research starts from facts, not from the operator's summary.

## 2. The question being asked

> "Now that we have guardrails and strategies [Specs 181/182], to what extent should we still rely on *evolving* the AI agents — versus authoring them — and are changes to Spec 183 warranted?"

The framing carried an implicit assumption worth correcting up front (Section 3.1): that the new structured layer "does away with the flat considerations" that we'd been knob-tuning. It does not. That correction changes the answer.

## 3. Verified findings

All claims below were verified against the codebase on 2026-05-20.

### 3.1 The structured layer is *additive* to flat considerations, not a replacement — and is barely adopted

Specs 181/182 shipped real engine constructs: **selectors** (`SelectorDef`, ranked finite-collection IR), **strategy modules** (`StrategyModuleDef`, conditional scoring groups that bind selectors and attach guardrails), **guardrails** (`GuardrailDef`, a negative-evidence layer with `prune`/`demote`/`warn`/`auditOnly` severities), and **turn-shape evaluators** (`TurnShapeEvaluatorDef`, bounded chain summaries over the driven inner preview). These exist in `packages/engine/src/agents/policy-*.ts` and `packages/engine/src/kernel/types-core.ts`, are compiled in `compile-agents.ts`, and dispatch in `policy-eval.ts` in order: selectors → modules → guardrails → considerations.

But the flat-consideration model is unchanged and still load-bearing:

- `CompiledPolicyCatalog.considerations` is **non-optional**; `selectors?`/`strategyModules?`/`guardrails?`/`turnShapeEvaluators?` are optional.
- Every profile's `use.considerations` and `use.tieBreakers` are mandatory; modules/guardrails/turn-shape are opt-in.
- Modules feed flat considerations rather than replacing them: `arvn-evolved` reads `module.buildPoliticalEngine.contribution` *through* a flat consideration (`applyBuildPoliticalEngineModule`).

Production adoption is minimal. Across the FITL profiles in `data/games/fire-in-the-lake/92-agents.md`:

| Profile | guardrails | strategyModules | turnShapeEvaluators | considerations |
|---|:--:|:--:|:--:|:--:|
| us-baseline | ✓ | ✓ | — | ✓ (7 flat) |
| arvn-baseline | ✓ | — | — | ✓ (2 flat) |
| arvn-evolved | ✓ | ✓ | ✓ | ✓ (10 flat) |
| nva-baseline | ✓ | — | — | ✓ (8 flat) |
| vc-baseline | ✓ | — | — | ✓ (3 flat) |

Only `arvn-evolved` uses a turn-shape evaluator; only it and `us-baseline` use a module. **In production we have not actually moved off flat considerations** — we've added a thin structured veneer to one profile, whose decisions are still dominated by a flat `+1000` Govern weight.

### 3.2 The architecture and Foundations keep evolution — the intended change is *structure-first mutation*, not abandoning evolution

`reports/ai-agent-overhaul-proposal.md` (the external proposal that motivated Specs 181–183) lays out an 8-stage roadmap. Stages 1–7 build the structured layer (now merged). **Stage 8 *is* Spec 183** — the evolution-loop overhaul. The proposal explicitly *hard-rejects* hand-authoring game-specific logic and rejects "improve tooling only," and it frames the fix as: evolution should "mutate **structure first**, then numbers," so it "discovers strategies rather than tuning sludge." Foundation #2 (Evolution-First Design) reinforces this — the system exists to evolve YAML through optimization.

So nothing in the design says "stop evolving agents." It says "stop *knob-tuning*; start *structure-mutating*." That is exactly the pain the operator described, and the answer to "should we keep evolving?" is **yes — but the mutation surface changes from weights to structure.** What's genuinely open is whether agent evolution should run *before* or *after* a hand-authored/bootstrapped structured baseline (Section 6).

### 3.3 The real blocker is an unfixed engine preview-cascade gap

The ARVN campaign halted at `arch-gap-003` (`campaigns/fitl-arvn-agent-evolution/results.tsv`, `lessons.jsonl`): the action-selection preview's synthetic completion **does not cascade opponent-margin effects**. With 427 actionSelection decisions × 15 seeds of evidence, `preview.victory.currentMargin.nva` is **100% uniform across candidates** (0 differentiating decisions of 359) and `.vc` is 95.5% uniform — while the `.self` control differentiates on 67.7% of decisions. The preview reports these refs `ready` ~75% of the time; the values are simply constant across ARVN candidates, because the opponent-piece-removing microturns (Assault removes VC pieces; Patrol/Sweep activate guerrillas) fire **after** the drive exits.

Source: `driveSyntheticCompletion` in `packages/engine/src/agents/policy-preview.ts` exits as soon as the resolution stack reaches an `outcomeGrantResolve` frame (the exit guard around lines 986–993). `policy-surface.ts:207-222` accepts any seat token for `victory.currentMargin.<seat>`, so the engine returns the (uniform) post-drive value rather than rejecting opponent refs. The full diagnosis with code citations is in `archive/reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md`.

**This is a TS-engine coverage gap.** It is not a depth-budget shortage (the refs are `ready`), not a candidate-pruning artifact (Assault candidates do reach scoring), and not specific to WASM.

### 3.4 Spec 184 fixed WASM/TS *parity*, not the preview gap

Spec 184 (`archive/specs/184-wasm-preview-drive-aggregate-coverage.md`, COMPLETED 2026-05-19) addressed a different problem: the WASM production preview drive returned `undefined` for preview refs feeding aggregates, diverging from TS. Its non-goals are explicit — "TS evaluator behavior is the oracle; WASM must match it." So 184 makes WASM agree with TS; it does **not** change what TS computes. The opponent-margin uniformity is present in the TS oracle itself and survives 184 untouched.

### 3.5 Spec 183 conflates the engine gap with a profile-quality problem

`specs/183-evolution-loop-overhaul.md` (PROPOSED) treats the May-17 uniform-preview witness as a **profile-quality failure to penalize**:

- §3.3 and §4: adds `noSignalPenalty` and a "preview uniformity rate" penalty; Phase A acceptance criterion (c) makes the flagship test "the May-17 witness (ARVN selecting Govern 75% with uniform NVA preview) now produces a non-zero `noSignalPenalty` that rejects the candidate."
- §5.1: `POLICY_PROFILE_QUALITY_LINT_PREVIEW_REF_UNIFORM`.

Two problems with this framing:

1. **Mis-attribution.** The uniformity is caused by an engine-coverage gap, not by the profile flying blind. Penalizing profiles for it steers evolution *away* from opponent-denial considerations — which are *correct* COIN play that simply can't be measured on the current surface. The acceptance metric would reward avoiding the very strategies the agent should learn.
2. **The penalty wouldn't even fire as designed.** `noSignalPenalty` keys off `tiebreakAfterPreviewNoSignal` (Foundation #20). But this gap does *not* produce a no-signal state — the preview returns `ready` values ~75% of the time; they're just uniform. So the flagship Phase A regression test rests on a mechanism that doesn't match the witness it cites.

Spec 183's *direction* (composite acceptance, structure-first mutation, quality-diversity archive) remains sound and aligned with Foundations #2/#9/#13/#16. But its load-bearing witness is an unfixed engine bug, and at least the witness, the `noSignalPenalty` derivation, and Phase A acceptance criterion (c) need rework — ideally after the engine gap is fixed so the witness can be re-grounded on genuine no-signal decisions.

## 4. Why this keeps recurring

The same wall has been hit and re-diagnosed repeatedly:

- 2026-05-14 (exp-004/005/006): lesson recorded that opponent-margin signals are blocked at action-selection scope.
- 2026-05-17 (exp-002 → `arch-gap-003`): verified with 427×15 trace evidence; produced the detailed archived report with **three fix directions** (see Section 7) and a clear recommendation: *halt the campaign, convert Direction A into a small engine spec, land it, resume*.
- 2026-05-18: Spec 183 written. Rather than fixing the engine, it reframed the symptom as an acceptance penalty. The archived report was marked "EXPLOITED" and archived.
- 2026-05-19/20: WASM parity (184) landed; structured layer (181/182) merged; the **engine opponent-effect gap remains open**, and the campaign remains blocked.

The pattern: downstream specs keep building on top of an unfixed preview surface, while the engine fix is repeatedly deferred. This report exists to break that cycle by sending the engine question to deep research directly.

## 5. Implications for Spec 183 (changes warranted)

Recommended changes, conditional on the engine fix:

1. **Reclassify the May-17 witness** as an *engine-coverage* witness, not a profile-quality witness. Move it out of Phase A acceptance criterion (c).
2. **Re-ground `noSignalPenalty`** on genuine `tiebreakAfterPreviewNoSignal` decisions, with a fixture that actually produces no-signal — not a uniform-but-ready surface.
3. **Decide the dependency direction**: Spec 183 should declare the engine preview-cascade fix as a hard prerequisite, OR explicitly scope its preview-related terms to the post-fix world. Today it silently assumes the surface is honest.
4. **Keep** composite acceptance, weight-soup lint, structure-first mutation, and the MAP-Elites archive — these are independent of the gap and remain valuable.

These are corrections, not a teardown. Spec 183's spine survives; its preview-witness premise does not.

## 6. The strategic fork (open question for deep research)

A reframing worth deep research: **agents may be instrumental.** The agent-evolution campaigns exist in large part to produce strong-enough opponents for *evaluating evolved games* (Foundation #2's actual target is evolving *games*). If so, two months of knob-tuning a single ARVN profile against a broken preview surface may have been optimizing the wrong thing. Three candidate stances:

- **Evolution-central**: fix the engine gap, then keep evolving agents as the primary mechanism (Spec 183's path). Maximizes "evolution discovers strategy," but slow and only as good as the signal surface.
- **Bootstrap-first**: hand-author a structured ARVN baseline using the now-available modules/guardrails/turn-shape (the repo has a `bootstrap-baseline` skill) to *prove the structured layer can express COIN strategy at all*, then let evolution refine a working baseline rather than discover structure from a flat/broken start.
- **Fix-engine-first, decide-empirically**: land the preview-cascade fix (the unblocking prerequisite either way), then compare bootstrap vs. evolution empirically before committing the loop.

All three require the engine fix first. The deep research should weigh whether evolution should *discover* structured strategy or merely *refine* a hand-authored one, given the cost profile of the preview drive.

## 7. Deep-research brief for ChatGPT-Pro

**Core engine question**: *What is the right way to make opponent-effect outcomes (piece removal/activation that land in `outcomeGrantResolve` frames) visible to the action-selection preview, so that `preview.victory.currentMargin.<opponent>` and opponent-tied `preview.feature.*` refs differentiate across candidates — without unbounding the drive (Foundation #10) and without reintroducing the arch-gap-002 perf pathology?*

The May-17 report already sketched three directions; deep research should pressure-test, refine, or supersede them:

- **Direction A — `outcomeGrantResolve` opt-in.** Allow `driveSyntheticCompletion` to continue past the first `outcomeGrantResolve` frame up to an additional explicit depth cap, per-profile opt-in. Smallest change; preserves the post-resolution projected-state model and Foundation #10's explicit bound. Risk: per-candidate preview cost (the cost that Spec 178's `POLWASMPERF` work only just tamed). Needs before/after profiling; the report pre-registered a 5% slow-tier wall-time gate.
- **Direction B — focused effect-projection surface.** A parallel surface (e.g., `previewEffect.victory.currentMargin.<seat>`) that drives only the candidate action's declared outcome grants and recomputes victory metrics, bounded by the action's declared effects rather than by depth. More thorough; better cost profile if opponent visibility is commonly needed; overlaps the kernel's effect resolver.
- **Direction C — static effect annotations in game data.** Declare "what this action changes" statically; expose the declared effect at action scope. Cheap at runtime, but it's a *declared* value, not a projected-state read; risks declaration/runtime drift and won't generalize to topology-dependent metrics. Likely not the answer.

**New constraints since the May-17 report** (deep research must account for these):

1. The **structured layer now exists** (Specs 181/182). A fix could route opponent-effect visibility through a selector or turn-shape evaluator rather than the raw `preview.*` ref surface. Is there a cleaner design that uses turn-shape evaluators (which already summarize the driven inner preview against module objectives) to express opponent denial, instead of deepening the outer drive?
2. **Spec 184** unified WASM/TS preview-drive behavior for aggregate-feeding refs. Any fix must keep WASM/TS parity (Foundations #8/#20); whichever surface the fix touches needs a parity oracle extension like Spec 175/184.
3. **Foundation tension**: #10 (bounded computation) motivates the drive's depth bound; #15 (architectural completeness) disfavors silent no-op gaps; #20 (preview signal integrity) says a `ready` ref must not lie. The current gap arguably violates #20 in spirit — the ref is `ready` but structurally constant — so deep research should consider whether the fix is "deepen the drive" or "make the surface honestly report opponent effects as unavailable when they live behind the exit boundary."
4. **Perf budget**: the drive runs per-candidate (up to ~10) per decision × 427 decisions × 15 seeds; arch-gap-002 showed how easily this balloons. Any fix needs a bounded, cacheable cost story.

**Specific questions for deep research to answer:**

1. Among A/B/C (or a new direction), which best satisfies Foundations #8/#10/#15/#20 *and* the perf budget?
2. Should opponent-effect visibility be a deeper *outer* drive, a *focused* effect projection, or expressed via the *structured layer* (selectors/turn-shape evaluators) so the agent reasons about declared denial value instead of projected board state?
3. Is the honest short-term fix actually to make the surface report opponent margins as `unavailable`/`partial` when they live behind the exit boundary (Foundation #20 integrity), so profiles stop silently dead-weighting — independent of the larger projection fix?
4. Given the cost profile, is agent evolution worth the investment for opponent-denial strategy, or should a bootstrapped hand-authored structured baseline carry it (Section 6)?

## 8. Source-code anchors & artifact index

**Engine (the gap):**
- `packages/engine/src/agents/policy-preview.ts` — `driveSyntheticCompletion`; `outcomeGrantResolve` exit guard near lines 986–993; `resolveSurface` ref resolution.
- `packages/engine/src/agents/policy-surface.ts:207-222` — `victory.currentMargin.<seatToken>` accepts any seat token.
- `packages/engine/src/agents/policy-eval.ts` (~723–763) — dispatch order selectors → modules → guardrails → considerations.
- `packages/engine/src/kernel/types-core.ts` — `SelectorDef`, `StrategyModuleDef`, `GuardrailDef`, `TurnShapeEvaluatorDef`, `CompiledPolicyCatalog`.

**Specs:**
- `specs/183-evolution-loop-overhaul.md` (PROPOSED; the spec under reassessment).
- `archive/specs/181-structured-strategy-policy-layer-probes-and-selectors.md`, `archive/specs/182-structured-strategy-policy-layer-modules-guardrails-and-turn-shape.md` (the merged structured layer).
- `archive/specs/184-wasm-preview-drive-aggregate-coverage.md` (WASM parity only).

**Reports:**
- `archive/reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md` (the detailed engine diagnosis + Directions A/B/C — primary prior art).
- `reports/ai-agent-overhaul-proposal.md` (the external proposal; §11/§13/§17, 8-stage roadmap).

**Campaign:**
- `campaigns/fitl-arvn-agent-evolution/results.tsv` (`baseline`/`exp-001`/`exp-002`/`arch-gap-003`), `lessons.jsonl`, `program.md`.
- `data/games/fire-in-the-lake/92-agents.md` (`arvn-evolved` and the baseline profiles).

**Skills:**
- `.claude/skills/improve-loop/SKILL.md` (the evolution loop), `.claude/skills/bootstrap-baseline/SKILL.md` (hand-authored baseline bootstrap — relevant to Section 6).

---

### Bottom line

Evolution stays — Foundations and the proposal both insist on it, and Spec 183's structure-first direction is the right answer to the knob-tuning pain. But **Spec 183 is built on a witness that is an unfixed engine bug**, and the recurring opponent-margin preview gap (`policy-preview.ts` `outcomeGrantResolve` exit) is the true prerequisite that has been deferred three times. Fix the engine surface first; then re-ground Spec 183's preview terms; then decide bootstrap-vs-evolution empirically.
