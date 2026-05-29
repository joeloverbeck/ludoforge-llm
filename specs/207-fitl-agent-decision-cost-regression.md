# Spec 207 — FITL Agent Decision / Preview Hot-Path Regression

**Status**: PROPOSED
**Priority**: High — a real agent decision/preview hot-path regression hidden for an unknown period because the `policy-profile-quality` lane ran non-blocking and only a curated 6-file subset (fixed in the same change that filed this spec). Making the lane blocking surfaced **four** failing witnesses sharing this one root cause.
**Complexity**: M–L (diagnosis-first; fix scope unknown until the accumulation source is found)
**Dependencies**: None (the implemented specs 196–202 and 206 are *suspected sources* of the regression, not blocking prerequisites — see §3)
**Ticket namespace**: 207AGEDECCOS
**Date**: 2026-05-29

> **Scope (broadened 2026-05-29):** the regression manifests two ways, both on the agent decision/preview hot path: (1) **within-game per-decision cost drift** (§1), and (2) **preview-cap exhaustion** — when preview is materially slower it hits its grant-flow / post-grant / free-operation budget caps, marking opponent-margin refs `unknown` instead of `ready`. Both are almost certainly the same growing structure on the decision path. All four affected witnesses (§5) are quarantined under this one spec with a single un-skip acceptance gate.

## ⚠ Re-scope (2026-05-29, during 207AGEDECCOS-002 implementation)

Implementing Phase 2 surfaced two findings that **invalidate the original four-witness single-gate framing**. Recorded here; §5/§6/§8 are corrected below.

1. **The cost is volume-bound, not a retained-state leak.** Phase 1 already established it is not a leaked cache. Phase 2 measurement localizes the cost to the **broad** `chooseNStep` enumeration over the *full* selectable add-option set (ARVN fills to ~32 add-options vs the compiler-validated `maxOptions: 8`). Empirically, with the deep pass made free (`deep.depthCap` 16→4) but **full breadth**, the seed-1002 diagnostic drift is still **23.45×** — the deep pass is only ~19% of the cost; the broad enumeration over ~32 options is ~81% and is **irreducible without reducing the option set**. A pure wall-time speedup (e.g. skipping per-step zobrist hashing, ~33% of per-apply cost) therefore **cannot** reach the 1.75× ceiling; only reducing the enumerated option count can — and that changes outcomes (next point).

2. **The `chooseNStep` inner preview feeds `actionSelection` candidate scoring.** ARVN's action-selection previews drive each candidate action's `chooseNStep` completion; bounding/reducing that enumeration changes the projected refs → the action scores → ARVN's action distribution. So the originally-prescribed "bound the enumeration" fix is **not** the cost-only, outcome-preserving fix the spec assumed (it was byte-identical on seed 1002 only coincidentally — ARVN's margin refs are uniform there → tie-break). Confirmed: enforcing `maxOptions=8` (let alone reducing it) changes ARVN behavior on the probe seeds.

3. **Two of the four quarantined witnesses fail for a *pre-existing, non-cost* reason (§5 mis-attribution).** On the **unmodified branch baseline** (no fix), `arvn-action-distribution-not-dominated` fails with *"action family rate 1.000 ≥ 0.600"* (ARVN's **plan controller** selects `arvn.patrolGovern` 100% of the time — a plan-policy behavior, 0 preview refs requested), and `turn-shape-minimum-impact-observed` fails with *"turn-shape evaluator currentTurnImpact never ready"*. Neither is a preview-cost/overhead failure; fixing the cost cannot un-skip them. These two are split to **`specs/208-fitl-arvn-plan-controller-action-domination.md`** (pre-existing plan-controller behavioral failures, likely Spec 190/191 era; consistent with this branch's other stale baseline witnesses).

**Decision taken (user, 2026-05-29):** revert the budget-reduction approach (it violates Foundation 20 — it *reduces* preview signal instead of *restoring preview speed*; it also breaks `may-17`, dropping opponent-margin readiness to 0 by making the preview too shallow to reach the NVA/VC margins). Pursue an outcome-preserving pure speedup of the full-richness preview, accepting it may not alone reach 1.75×, and **defer `spec-143` + `may-17` to this re-scoped spec** (their Phase-2 fix is now: pure speedup + a still-open decision on whether the 1.75× drift ceiling is compatible with the legitimate full-breadth `deep1024` ARVN preview, or must be re-evaluated now that the "retained-state leak" premise the ceiling rested on is disproven). **Open question for the next implementer / user:** the only ways to reach the *existing* 1.75× ceiling are (a) reduce the ARVN preview budget (behavior change → re-bless canaries) or (b) re-evaluate the ceiling for the legitimate `deep1024` config (the Non-Goals below were premised on a retained-state leak that does not exist). Pick one before completing Phase 2.

## 1. Problem

`packages/engine/test/policy-profile-quality/fitl-spec-143-cost-stability.test.ts` measures per-decision agent cost drift across a single FITL game (seed 1002, `maxTurns=3`, four `*-baseline` policy agents): the trimmed last-decile average decision time divided by the trimmed first-decile average, with a calibrated ceiling of **1.75×**.

It was calibrated on 2026-04-24 at **ratio ≈ 1.108×** (first-decile ≈ 13.2ms, last-decile ≈ 14.7ms). As of 2026-05-29 on branch `implemented-spec-206` it measures **ratio ≈ 19–21×** (first-decile ≈ 20ms, last-decile ≈ 400–446ms), consistently across repeated runs. The run still reaches `stopReason=terminal` (209 decisions), so this is **not** a correctness or termination failure — it is a within-game *cost accumulation*: later decisions in the same game are ~20× slower than early ones.

This is a genuine regression, not timing noise:
- The drift is a within-run ratio (last decile vs first decile of the *same* process), so machine load affects both deciles roughly equally and cannot explain a 20× ratio.
- It reproduces across runs (~19.6× then ~20.8×).
- It predates Spec 202 (it fails on the clean baseline before any Spec 202 change), though the additional `us-baseline` constructs bound by Spec 202 may amplify it. **(Diagnosis update — 207AGEDECCOS-001, 2026-05-29: the drift is now localized to Spec 191, well before the 196–206 window originally suspected. See §3 for the bisect and the named growing structure.)**

## 2. Evidence

```
seed 1002: cost drift ratio 19.649 exceeded ceiling 1.75 |
  firstDecileAvg=20.160ms | lastDecileAvg=396.127ms |
  firstDecileSamples=18 | lastDecileSamples=21 |
  playerDecisions=206 | totalDecisions=209 | stopReason=terminal
```

## 3. Root cause (localized 2026-05-29 by 207AGEDECCOS-001)

**Diagnosis is complete (Phase 1).** The reproducible diagnostic
`campaigns/fitl-arvn-agent-evolution/diagnose-decision-cost-accumulation.mjs`
replays the witness configuration (seed 1002, `maxTurns=3`, four `*-baseline`
agents) and a commit-bisect drift probe localized the regression precisely. The
original "Suspected area" hypothesis below was **partially wrong**: the drift is
*not* a retained/leaked unbounded cache, and it was *not* introduced within the
196–206 window. The corrected findings:

1. **Segment — confirmed the AGENT decision path, not the kernel apply path.**
   The ~20–30× drift lives entirely in `PolicyAgent.chooseDecision`. On seed
   1002 the last-decile agent segment ≈ 569–609ms vs the kernel `applyMove`
   segment ≈ 1.5ms (kernel apply stays flat, ≈1.4× first→last). (§3.1 satisfied.)

2. **Growing structure (file + symbol).** The `chooseNStep` inner-preview drive:
   `packages/engine/src/agents/policy-agent-inner-preview.ts` →
   `createPolicyAgentChooseNStepInnerPreview` → `runChooseNStepInnerPreview`
   (broad pass) + `runDeepPass` (deep pass) — hot-path keys
   `policyInnerPreview:chooseNStepBroadRun` / `:chooseNStepDeepPass`. It is *not*
   a monotonically-retained structure; it is **per-decision work bounded only by
   `capClass`** whose realized cost scales with the number of selectable
   chooseN values at the microturn, which grows as the FITL board fills. The
   `advanceToDecisionPoint` iteration count (`adp:iterations`) explodes to
   ~3200–3400 per ARVN `chooseNStep` decision in the last decile; the largest
   ARVN `chooseNStep` decisions cost 2000–4900ms each. The
   `arvn-baseline` profile (`data/games/fire-in-the-lake/92-agents.md`) opts into
   `inner.chooseNStep: true`, `strategy: continuedDeepening`,
   `capClass: deep1024`, `deep.depthCap: 16`.

3. **Introducing spec — Spec 191 (plan-role-semantic-integrity / 191PLAROLSEM),
   NOT 196–201.** A commit bisect of the drift ratio (same config) shows:

   | commit | spec boundary | drift ratio | decisions |
   |---|---|---|---|
   | `39dc4f288` | pre-191 (promoted-arvn-evolved, 2026-05-22) | **1.00×** (flat) | 163 |
   | `421bd2ef5` | spec-191 merge (2026-05-23) | **41.5×** | 218 |
   | `dbff70f36` | spec-192 merge | 38.2× | 218 |
   | `8d526b206` | spec-195 merge (pre-196 branch point) | 26.3× | 218 |
   | `81bbc93b3` | spec-196 merge | 27.2× | 218 |
   | `847ff3b6b` | spec-197 merge | 33.0× | 218 |
   | `92247448b` | spec-199 merge | 16.1× | 218 |
   | `HEAD` | implemented-spec-206 | ~28–30× | 206 |

   Pre-191 the per-decision cost is uniformly ~190ms (flat: `deep1024`
   continuedDeepening is already enabled there — added 2026-05-12 by a Spec 164
   ARVN-campaign tuning commit — so absolute cost is already high but **does not
   drift**). Spec 191 reworked the plan-root / plan-proposal path
   (`policy-agent-plan-root.ts` +89, `policy-agent.ts`, `plan-controller.ts`,
   `plan-proposal.ts`) so early decisions became much cheaper (~190ms → ~11ms)
   while late decisions exploded (~190ms → ~465ms) and the ARVN trajectory
   lengthened (163 → 218 decisions). **The `deep1024` continuedDeepening config
   is a necessary cost-multiplier precondition, not the drift cause; the drift
   cause is Spec 191's plan-root/proposal change.** (Spec 202's `us-baseline`
   constructs are *not* implicated — the hotspot is ARVN, consistent with §1's
   "predates Spec 202".)

The fix (Phase 2) must bound the per-decision `chooseNStep` continuedDeepening
enumeration so its cost no longer scales with the growing selectable-value set /
decision index, without changing decision outcomes (determinism + replay-identity
must hold). It may also reconsider the `deep1024` capClass for `arvn-baseline`.
The bounded-preview integrity contract (Foundation #20) must be preserved —
restore preview *speed*, do not coerce refs.

### Original suspected area (superseded by the findings above; retained for history)

A retained-state / monotonically-growing structure on the agent decision hot path — most likely something introduced or amplified by the proposer / preview / caching work in the implemented specs 196–202 and 206 (e.g. a cache, memo map, accumulated trace, or per-decision allocation that grows with `state.turnCount` / decision index rather than being bounded per decision). The witness was explicitly designed to catch "a retained-state regression that makes later decisions materially slower." *(Correction: the bisect above shows the introduction point is Spec 191, outside the 196–206 window, and the structure is per-decision preview work bounded by `capClass`, not a leaked cache.)*

## 4. Non-Goals

- Relaxing the `1.75×` ceiling. The ceiling is the contract; it must not be softened to accommodate the regression (per `.claude/rules/testing.md`: never adapt tests to bugs).
- Re-calibrating the witness to the regressed numbers.

## 5. Current quarantine

Four `policy-profile-quality` witnesses are **skipped** (node `it(..., { skip })`). **Corrected 2026-05-29 (see Re-scope above): only #1 and #4 belong to this spec; #2 and #3 are pre-existing plan-controller behavioral failures split to `specs/208-fitl-arvn-plan-controller-action-domination.md`.**

1. **[this spec]** `fitl-spec-143-cost-stability.test.ts` — cost-drift ratio (seed 1002): ~20–30× vs the 1.75× ceiling. (Volume-bound; see Re-scope — un-skip gated on the Phase-2 ceiling decision.)
2. **[→ Spec 208]** `probes/probe-budget.test.ts` → probe `arvn-action-distribution-not-dominated` — **NOT a cost/overhead failure**: fails behaviorally on the unmodified baseline with *"action family rate 1.000 ≥ 0.600"* (plan controller selects `arvn.patrolGovern` 100%). Original "~123s overhead" attribution was wrong.
3. **[→ Spec 208]** `probes/probe-budget.test.ts` → probe `turn-shape-minimum-impact-observed` — **NOT a cost/overhead failure**: fails behaviorally on the unmodified baseline with *"turn-shape evaluator currentTurnImpact never ready"*.
4. **[this spec]** `probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts` — 0 ready opponent-preview candidates (expected ≥2): NVA/VC margin refs land `unknown` (preview-cap exhaustion) instead of `ready`. (Needs the full-depth preview to remain rich *and* not exhaust its budget caps — see Re-scope; the budget-reduction approach made this strictly worse.)

## 6. Acceptance criteria

1. Root cause identified and documented (the growing structure + the spec that introduced it). ✔ (Phase 1 + the Re-scope above.)
2. **(Corrected 2026-05-29)** The **two in-scope** witnesses pass **unskipped**: `fitl-spec-143` drift ratio < 1.75× **and** `may-17` sees ≥2 ready opponent-preview candidates (opponent margin refs resolve `ready`, not `unknown`). *(`arvn-action-distribution-not-dominated` and `turn-shape-minimum-impact-observed` moved to Spec 208 — they fail for a pre-existing plan-controller reason, not preview cost.)* Reaching the `spec-143` ceiling requires the open config-vs-ceiling decision recorded in the Re-scope section.
3. No behavioral change: FITL determinism lane + four-profile convergence canaries remain byte-identical; `pnpm turbo build` byte-identical. *(This rules out the budget-reduction approach, which changes ARVN's action distribution.)*
4. Full engine `test:all` + `policy-profile-quality` lanes green with the two in-scope witnesses unskipped.

## 7. Foundation alignment

| Foundation | How |
|---|---|
| #8 | Determinism preserved — the fix must not change decision outcomes, only their cost |
| #15 | Architectural completeness — the fix must address the root growing structure, not relax the `1.75×` ceiling, re-calibrate the witness, or coerce preview refs (per §4 Non-Goals) |
| #16 | A real regression that the quality-witness lane is meant to catch; surfaced (not softened) by making the lane blocking and quarantining only this one test with a tracked reference |
| #20 | Witness #4's opponent-margin refs land `unknown` via preview-cap exhaustion — the correct, integrity-preserving outcome of a slow bounded preview. The fix MUST restore preview speed so the refs resolve `ready`; it MUST NOT coerce `unknown`→`ready` to satisfy the witness |

## 8. Follow-On Tickets

**Ticket namespace**: `207AGEDECCOS`

This is a diagnosis-first spec: Phase 2/3 scope is gated on Phase 1 evidence, so the first `/spec-to-tickets` run should be scoped to Phase 1 only. Anticipated decomposition (informational; finalized by `/spec-to-tickets`):

1. **Phase 1 — Diagnose. ✅ DONE (207AGEDECCOS-001, 2026-05-29).** Confirmed the accumulation is on the agent decision path (`PolicyAgent.chooseDecision`), not the kernel apply path (§3.1). The growing structure is the `chooseNStep` continuedDeepening inner-preview drive (`policy-agent-inner-preview.ts` → `runChooseNStepInnerPreview` + `runDeepPass`), whose per-decision cost scales with the selectable chooseN value set as the board fills; the introducing change is **Spec 191** (bisect in §3 — outside the originally-suspected 196–206 window). Reproducible via `campaigns/fitl-arvn-agent-evolution/diagnose-decision-cost-accumulation.mjs`. Root cause documented (Acceptance #1). ✔
2. **Phase 2 — Fix.** Bound the per-decision `chooseNStep` continuedDeepening enumeration (broad + deep passes) so the drift ratio returns under the `1.75×` ceiling, without changing decision outcomes (determinism + replay-identity must hold). Gated on the Phase 1 findings in §3 (`runChooseNStepInnerPreview` / `runDeepPass`, and the `arvn-baseline` `deep1024` capClass).
3. **Phase 3 — Un-skip gate.** Remove the `Spec 207` `skip`s from all four quarantined witnesses (§5) and confirm they pass unskipped; verify Acceptance #2–#4 (drift ratio, both probe-budget probes, `may-17` ready opponent-preview candidates, byte-identical determinism/build, full `test:all` + `policy-profile-quality` lanes green).

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-29 (Phase 1 first; Phase 2/3 decomposed 2026-05-29 once Phase 1 localized the root cause):

- [`archive/tickets/207AGEDECCOS-001.md`](../archive/tickets/207AGEDECCOS-001.md) — Phase 1 — Diagnose the within-game per-decision cost-accumulation root cause (covers §8 Phase 1, Acceptance #1) — ✅ COMPLETED 2026-05-29 (root cause: Spec 191; see §3)
- [`tickets/207AGEDECCOS-002.md`](../tickets/207AGEDECCOS-002.md) — Phase 2 — Bound the chooseNStep continuedDeepening per-decision enumeration. ⚠ **RE-SCOPED 2026-05-29** during implementation: the "bound the enumeration" approach changes ARVN's action distribution (the preview feeds action scoring) and the cost is volume-bound (pure speedup cannot reach 1.75×). Pending the config-vs-ceiling decision in the Re-scope section. See the ticket's Outcome.
- [`tickets/207AGEDECCOS-003.md`](../tickets/207AGEDECCOS-003.md) — Phase 3 — Un-skip gate. Re-scoped to the **two** in-scope witnesses (`spec-143`, `may-17`); blocked on Phase 2.
- **Split out:** [`specs/208-fitl-arvn-plan-controller-action-domination.md`](208-fitl-arvn-plan-controller-action-domination.md) — the `arvn-action-distribution-not-dominated` + `turn-shape-minimum-impact-observed` witnesses (pre-existing plan-controller behavioral failures, mis-attributed to preview cost in the original §5).
