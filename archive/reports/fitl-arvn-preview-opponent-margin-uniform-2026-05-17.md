# FITL ARVN — Action-Selection Preview Surfaces Opponent-Margin Refs at Uniform Values

**Status**: ✅ EXPLOITED — archived 2026-05-19.

**Date**: 2026-05-17
**Status**: discovery report; no spec yet.
**Surfaced by**: `campaigns/fitl-arvn-agent-evolution` improve-loop, exp-002 (`arch-gap-003` row in `results.tsv`).
**Confirms**: prior-session lessons from exp-004/005/006 (2026-05-14, `campaigns/fitl-arvn-agent-evolution/lessons.jsonl`) post Spec 178.

## Question

The FITL ARVN improve-loop has now run two suspended sessions where the operator's stated worry was that the evolved agent overuses Govern and Train and never picks Patrol, Sweep, or Assault — the actions whose game value is removing/activating VC and NVA pieces (opponent denial). Prior sessions concluded with a verbal lesson saying opponent-margin signals at action-selection scope are "blocked by preview depth limits." This report verifies that conclusion with 427 decisions × 15 seeds of post-Spec-178 trace evidence, attributes the gap to specific code sites, and proposes scoped fix directions.

## Symptom

`arvn-evolved` profile, post-Spec-178 baseline at tier 15: across 15 seeds (159 main-phase decisions), the action distribution is **Govern 75% / Train 14% / Event 6% / Transport 4% / Patrol-Sweep-Assault 0%**. The flat `preferGovernWeighted:1000` cannot be the sole cause, because all five `preferProjectedSelfMargin` / `preferProjectedRank` / `preferStrongNormalizedMargin` / `trainWhenControlLow` / `preferOptionProjectedMargin` considerations carry weights in the 300–800 range that should be able to argue *for* Patrol/Sweep/Assault when their game-theoretic value is high. They cannot — because at the action-selection scope, the signal those considerations would need (the opponent's projected margin after ARVN's candidate action resolves) is structurally uniform across candidates.

### Empirical evidence

A diagnostic experiment (exp-002) added the following to `data/games/fire-in-the-lake/92-agents.md` `arvn-evolved`:

- `stateFeatures.nvaMargin = { ref: victory.currentMargin.nva }` and `stateFeatures.vcMargin = { ref: victory.currentMargin.vc }`
- `candidateFeatures.projectedNvaMargin = coalesce(preview.victory.currentMargin.nva, feature.nvaMargin)` and the equivalent for VC, mirroring the proven `projectedSelfRank` pattern (which delivers a healthy signal — exp-003 prior session).
- `considerations.penalizeOpponentMargin = { scopes: [move], weight: -200, value: add(feature.projectedNvaMargin, feature.projectedVcMargin) }`

`compositeScore` was identical to the baseline (`-3.2`, byte-identical action distribution). The interesting evidence is in the trace `previewUsage.readyRefStats` aggregated across the 427 main-phase actionSelection decisions of 15 seeds:

| Preview ref | Decisions reporting stats | Ready / candidate ratio | Decisions with `distinct=1` (uniform) | Decisions with `distinct>1` (differentiating) | Avg range |
|---|---:|---:|---:|---:|---:|
| `victoryCurrentMargin.currentMargin.nva` | 359 / 427 (84.1%) | 75.3% | **359 (100%)** | **0 (0.0%)** | 0.00 |
| `victoryCurrentMargin.currentMargin.vc`  | 359 / 427 (84.1%) | 75.3% | 343 (95.5%) | 16 (4.5%) | 0.13 |
| `victoryCurrentMargin.currentMargin.self` (control) | 359 / 427 (84.1%) | 75.3% | 116 (32.3%) | 243 (67.7%) | 1.26 |
| `victoryCurrentRank.currentRank.self` (control) | 359 / 427 (84.1%) | 75.3% | 288 (80.2%) | 71 (19.8%) | 0.20 |

Reading: the preview engine **does** request and resolve `preview.victory.currentMargin.<nva|vc>` (the new opponent-margin refs appear in `previewUsage.refIds` at 84.1% of decisions, with the same 75.3% ready-candidate ratio as `.self`). It is *not* a depth-cap failure — these refs are "ready" for ~9 of ~10.6 candidates per decision. But the resolved values are **100% uniform for NVA** and **95.5% uniform for VC** across the candidates of any given decision. The 4.5% of VC decisions that do differentiate carry an average range of `0.13` — well below the `-200` weight scale of `penalizeOpponentMargin`, so any nudge it produces is dominated by the ±1000-class self-margin / Govern signals.

For comparison, the self-margin control ref differentiates on 67.7% of decisions with an average range of `1.26`. The preview machinery is healthy. The asymmetry is real, not instrumental.

### Why uniform across candidates

The action-selection preview's job is to compute, for each legal candidate move, a hypothetical post-resolution state so that `preview.*` refs can read projected values. For ARVN candidates such as `assault` and `patrol`, the post-resolution NVA/VC margins should differ from those of `govern` (Assault removes VC pieces from a target space; Govern does not). Self-margin differs because ARVN's own resolutions modify Patronage and control. The trace says opponent-margin does not.

Mechanism: in FITL the opponent-margin-modifying portion of an ARVN candidate action runs in resolution effects that occur *after* the action-selection preview's `driveSyntheticCompletion` exits. The preview's exit conditions are written to bound the depth of synthetic resolution; one of those bounds — exit on `outcomeGrantResolve` — fires before the piece-removal/activation effects of operations such as Assault land in state.

## Source-Code Citations

All paths relative to repo root.

### Action-selection preview driver

`packages/engine/src/agents/policy-preview.ts:864-1074` — `driveSyntheticCompletion(trustedMove)`. This is the bounded driver that resolves one candidate's hypothetical state. Line 933 applies the candidate move (`deps.applyMove(...)`). The loop at lines 969-1066 iterates the immediate seat's remaining microturns. Exit conditions (lines 986-993):

```ts
if (
  ctxKind === 'actionSelection'
  || ctxKind === 'outcomeGrantResolve'        // <-- relevant exit
  || ctxKind === 'turnRetirement'
  || topSeatId !== origin.seatId
  || top.turnId !== origin.turnId
) {
  return finish({ kind: 'completed', state: canonicalizeForExit(), depth });
}
```

The driver exits as soon as the resolution stack reaches an `outcomeGrantResolve` frame, with no per-frame opt-in for actions whose game-theoretic value lives inside that resolution.

### Preview ref resolution path

`packages/engine/src/agents/policy-preview.ts:658-720` — `resolveSurface(candidate, ref, seatContext)` reads `preview.*.<seat>` refs against the post-drive `preview.state`. There is no per-ref override that could distinguish "ready but constant" from "ready and differentiating"; the readyRefStats counters in the trace just summarise whatever values the preview state happens to expose.

### Seat-token acceptance

`packages/engine/src/agents/policy-surface.ts:207-222` — `victory.currentMargin.<seatToken>` accepts *any* seat token, not just `self`. The engine has no restriction here; the runtime treats `nva` and `vc` exactly like `self`. So this is not a doc-only gap where the engine "would reject" opponent refs — it accepts them and returns the (uniform) preview value.

### Self-margin works because of where it changes

`packages/engine/src/kernel/apply-move.ts` (and the FITL game-data effect chains under `data/games/fire-in-the-lake/`) — ARVN's Govern action changes support markers and Patronage variables during the action-and-microturn body that *is* inside the drive's loop. Self-margin is computed from those changes via `victory.currentMargin.self`, so the post-drive state correctly reflects ARVN's own delta. Opponent margins depend on VC/NVA piece counts (and capabilities) that are mutated by `outcomeGrantResolve`-context frames the drive exits on.

### What Spec 178 fixed and didn't

`archive/specs/178-*.md` (PR #264, commit `be5ce3801`) — the spec landed two related improvements:

1. **`POLWASMPERF`** (POLWASMPERF-001 to -005): caching for the policy-evaluation context rebuild (the prior `arch-gap-002` perf pathology). The 15-seed tournament now runs in ~2.5 min wall-clock with `arvn-evolved`'s `deep1024 / depthCap:16 / maxOptions:8 / fullCandidateCap:10` config, instead of hanging at 59+ min. *This report independently confirms the perf fix held: baseline plus exp-001/002 all completed without truncation or timeout.*
2. **`CONTDEEPINNER`** (CONTDEEPINNER-001 to -004): continued-deepening for the **inner** chooseN/chooseNStep frontiers within a microturn. This increases the depth at which inner-frontier references can resolve.

Crucially, CONTDEEPINNER targets the inner-frontier preview; it does **not** lift `outcomeGrantResolve` as a drive-exit condition, and it does not deepen the outer action-selection preview's resolution past the post-microturn boundary where opponent-effect grants live. The exit at `policy-preview.ts:988` remains unconditional. This is consistent with the lesson in `campaigns/fitl-arvn-agent-evolution/lessons.jsonl` from 2026-05-14 ("the action-selection preview does not capture opponent-margin changes — Assault removal sits behind microturn-preview depth"). The opponent-margin gap survives Spec 178.

## Documentation Surface

`docs/agent-dsl-cookbook.md:108-122` — the "Preview Refs" table documents `preview.victory.currentMargin.self` and `preview.victory.currentRank.self` only. It does not list `preview.victory.currentMargin.<opp>` (despite the engine accepting it per `policy-surface.ts:207-222`), and it does not warn that opponent-margin previews will be uniform across candidates whose effects on opponent state live behind `outcomeGrantResolve`. A profile author reading the cookbook today has two reasonable reads of the omission:

- "Per-seat opponent refs exist but were left undocumented." (this is what the runtime supports)
- "Per-seat opponent refs don't exist; only `.self` is meaningful." (the cookbook does not contradict this read)

Either way, the silent partial coverage is a real footgun. Spec 51's "cross-game primitive elevation" and Spec 50's "event interactive choice protocol" both wired primitive seat refs across the engine without producing a cookbook-level warning, so the gap is pre-existing.

## Adjacent Concerns

These are worth flagging but are not the primary symptom:

1. **`preview.feature.X` for opponent-tied features.** The same uniformity argument should apply to `preview.feature.vcGuerrillaCount`, `preview.feature.vcBaseCount`, and `preview.feature.vcFriendlyCapCount` after any ARVN candidate. The prior session's `valueCapabilityGain` consideration was already documented as dead-weight at `depthCap=4` ([`lessons.jsonl` entry from 2026-05-11](../campaigns/fitl-arvn-agent-evolution/lessons.jsonl) — `valueCapabilityGain` dead weight). If `depthCap=16` (deep1024) doesn't lift this, the root cause is probably the same drive-exit boundary, not a depth-budget shortage. Any fix to the opponent-margin gap should be verified to also lift opponent-feature signals so the fix is structural, not symptomatic.

2. **The 4.5% / range-0.13 VC differentiating cases.** A small fraction of VC margins do differentiate. They likely correspond to ARVN candidates whose chooseN microturns include picks that *do* land before the drive exits — perhaps `transport` or `event` candidates whose effects fire on the microturn body rather than a post-microturn grant. A targeted look at which 16 decisions differentiate would clarify whether the boundary is exactly `outcomeGrantResolve` or a narrower condition. This is a small follow-up, not a primary investigation.

3. **`fullCandidateCap:10` vs `legalMoveCount`.** Several trace decisions have `legalMoveCount: 10` and `candidates.length: 9-10`, so the candidate cap is mostly not active on Govern-heavy decisions but may prune fringe candidates in busier ones. If Patrol/Sweep/Assault are sometimes pruned before scoring (rather than being scored and losing), a denial-aware fix needs to verify they reach the scoring stage in the first place. Spot-check shows Assault candidates DO appear in the candidate list (exp-002 trace, seed 1005 decisions), so this is not the primary cause — but worth confirming on multi-seed.

4. **WASM route routing.** The WASM policy runtime (per Spec 176/178) has its own preview surface. Verification probe was WASM-on. The 75.3% ready/cand ratio held with WASM enabled; if the TS-only fallback exhibits the same uniformity, the gap is the drive's exit condition, not a route-specific issue. (The 178 reports indicate the WASM preview-drive route fails closed on complex previews and falls back to TS, so most of our decisions are TS anyway — unifying behavior across routes is expected.)

5. **Foundation 10 vs Foundation 15.** Foundation 10 (Bounded Computation) explicitly motivates the drive's depth bound; Foundation 15 (Architectural Completeness) explicitly disfavours silent no-op gaps. The opponent-margin gap is exactly where these two foundations rub against each other — any fix has to lift the gap without unbounding the drive.

## Ticket Archaeology

No deferred ticket was found that explicitly promised opponent-margin preview signals. The prior `POLPREVDRIVE-*` (Spec 175/176) and `POLWASMPERF-*` / `CONTDEEPINNER-*` (Spec 178) ticket bodies focus on rebuild caching and inner-frontier depth; they do not include "post-grant state visible at action scope" as out-of-scope. The closest archived spec is Spec 164 (`archive/specs/164-*.md`) introducing the `continuedDeepening / deep1024` cap-class — that work targeted the *inner* frontiers, and its own ticket archaeology should be re-checked for whether outer-preview opponent visibility was an out-of-scope item.

Recommendation: when triaging this report, grep `archive/tickets/178*.md` and `archive/tickets/176*.md` for "outcomeGrant", "opponent", and "post-resolution" to confirm no prior deferral exists; if one does, this report should cite it.

## Proposed Fix Directions

Three directions, ordered by scope. Each is sketched only; a follow-up spec or two specs should pick one and detail.

### Direction A — Add an `outcomeGrantResolve` opt-in to the drive

Smallest change. Add an optional `previewUsage.completionPolicy` (or per-profile) opt-in that allows `driveSyntheticCompletion` to continue past the first `outcomeGrantResolve` frame, up to some depth additional to `completionDepthCap`. Profiles that opt in get opponent-effect visibility; profiles that don't keep current behaviour. Pros: keeps Foundation 10 by retaining an explicit depth cap. Cons: increases per-candidate preview cost (the cost-scaling concern from arch-gap-002, which Spec 178 only just resolved). Needs profiling before / after.

### Direction B — Resolve opponent-margin via a separate "effect-projection" surface

Bigger change. Add a parallel surface (e.g., `previewEffect.victory.currentMargin.<seat>`) that drives a *focused* simulation of just the candidate action's outcome grants, distinct from the full drive. The focused simulation runs the action's declared effects (`removeToken`, `flipMarker`, `setVar`) and recomputes victory metrics without iterating subsequent microturns. Pros: bounded by the action's declared effects rather than depth. Cons: requires the engine to know which effects to apply in the focused projection — overlaps with the kernel's existing effect-resolver code.

### Direction C — DSL change: candidate effect annotations

Largest change. Extend the action declarations in `data/games/<game>/` to carry a static "what does this action change?" annotation (e.g., `effectSummary: { removesEnemyAt: [target] }`). The preview surface exposes the *declared* effect to the agent at action scope. Pros: cheap at runtime; no extra simulation cost; works regardless of resolution depth. Cons: declarations and runtime resolution can drift; not actually a projected-state read; would not generalise to derived metrics that depend on board topology. Probably not the right answer for this gap.

Direction A is the lowest-cost fix that preserves the engine model (post-resolution projected state). Direction B is the more thorough fix if Direction A's perf cost proves prohibitive. The choice depends on how often profile authors will want opponent-effect visibility — if rarely, A's opt-in pays only when used; if commonly, B's focused projection has the better cost profile.

In all three directions, the cookbook update is mandatory: `docs/agent-dsl-cookbook.md` should document the per-seat seat-token surface for `preview.victory.currentMargin.*` and explicitly state the post-resolution visibility contract for whatever direction lands.

## Recommendation

Author a follow-up implementation spec exploring **Direction A** first (smallest scope, preserves engine model). Pre-register a profiling gate: if opting into the deeper drive on `arvn-evolved` adds more than `5%` to slow-tier wall time, fall back to **Direction B**. Either way, ship the cookbook addendum.

The campaign should NOT continue micro-optimising the `arvn-evolved` profile against the current preview surface — exp-002 (this discovery) confirms the prior-session lesson that opponent-denial considerations are structurally dead-weight at action-selection scope. Three prior-session experiments (exp-004/005/006) and this session's exp-002 have now demonstrated the same gap; a fifth restatement would not add evidence.

Suggested next step for the operator: halt the `fitl-arvn-agent-evolution` campaign at this report, convert this report's Direction A into a small spec, land the spec, then resume the campaign at a STATE-EVOLVED restart with new opponent-denial considerations enabled by the post-spec preview.
