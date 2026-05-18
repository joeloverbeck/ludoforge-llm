# **1. Executive verdict**

**Recommended solution:** replace any narrow Spec 179 opponent-margin patch with a **generic multi-seat standing-vector preview model**, plus **status-aware opponent/threat aggregates** and a **candidate × seat preview evidence matrix**. This is the root-cause fix. It should expose projected standing evidence for every relevant seat, preserve per-seat preview status/provenance, and give policy authors/evolution reusable bounded primitives such as “hurt current leader,” “reduce nearest threat,” “improve own rank,” and “prefer opponent reduction when own margin is flat.”

**Spec 179 disposition:** **replace/amend, not accept as-is.** I could not find non-archive files matching `reports/fitl-arvn-preview-opponent-margin*` or `specs/179-action-selection-preview*` on `main`, branches, PRs, or commits through the Git connector despite searching the requested exact and fuzzy terms. So I cannot honestly perform a literal line-by-line critique of the missing file text. But the current repo, campaign lessons, Spec 15, and implementation make the important answer clear: **adding opponent refs or widening action-selection preview alone is not enough.** Direct per-seat preview refs and `seatAgg` already exist in relevant paths; the failure is that the current scoring/evolution surface is self-scalar, depth-limited, status-poor for multi-seat evidence, and ergonomically hostile to defensive utility authoring.

The proposed replacement spec should be called something like **Spec 179R: Standing-Vector Preview and Status-Aware Opponent Utility Aggregates**.

---

# **2. Problem diagnosis**

The reported failure mode is real, but the likely root cause is subtler than “opponent margin refs are missing.”

The current FITL ARVN profile heavily scores **own projected margin/rank** and a few ARVN-specific strategic priors. In `data/games/fire-in-the-lake/92-agents.md`, ARVN’s profile uses `selfMargin`, `selfRank`, `projectedSelfMargin`, `projectedSelfRank`, normalized self margin, Govern/Train boosts, and a microturn `preview.option.delta.victory.currentMargin.self` consumer. It does **not** contain a first-class opponent standing/threat utility model.

The campaign lessons are the strongest repo witness. They record that ARVN opponent-denial experiments failed in three ways: a before/after delta formulation was structurally zero-effect; bare current-surface opponent refs were constant across candidates; and even the correct absolute `preview.victory.currentMargin.<opponent>` formulation was zero-effect because ARVN root actions either did not change opponent margins or changed them behind bounded microturn depth. The same lessons say rank-aware scoring was accepted because `preview.victory.currentRank.self` captures relative improvement driven by ARVN’s own previewable margin.

So the missing capability is **not simply one of these**:

| Hypothesis | Verdict |
| ----- | ----- |
| Missing direct opponent preview refs | Mostly false. Spec 15 and current parser support `preview.victory.currentMargin.<seat>` and `$seat`-style refs. |
| Missing `seatAgg` | False. `seatAgg` exists, validates `$seat`, and has FITL integration tests. |
| Lost `$seat` inside preview | Mostly false. The runtime provider and evaluator pass `seatContext`; preview resolution accepts it. |
| Preview driver intrinsically optimizes self-margin only | False at engine level, true at profile level. The driver just completes bounded synthetic microturns; current ARVN microturn scoring consumes self-margin option refs. |
| Action-selection preview does not drive far enough | Sometimes true, by design. Depth caps, same-seat boundaries, stochastic nodes, and unresolved inner decisions are explicit outcomes. |
| Score profile ignores opponent deltas | True. Current FITL ARVN authoring surface is self-projection dominated. |
| Preview signal integrity turns unavailable into zero | The core is mostly guarded, but `seatAgg` can obscure per-seat unavailable cells by skipping nonnumeric values and returning partial aggregates. That is exactly why a richer status-aware matrix is needed. |

**Root cause:** the engine has pieces of the needed substrate, but not the right **generic standing-evidence abstraction**. Current policy authors can hack together opponent refs and aggregates, but they cannot robustly express and debug “this action hurt the current leader,” “this reduced the nearest threat,” “this improved my rank though my own margin stayed flat,” or “this opponent signal was depth-capped, not zero.” The result is a crippled defensive/adversarial action space.

---

# **3. Repo evidence**

## **Foundations constraints**

The proposal must preserve these load-bearing foundations:

* **No game-specific engine logic.** The engine/compiler/runtime cannot contain Fire in the Lake special cases. Game-specific semantics belong in GameSpec data.  
* **One rules protocol and constructibility.** Agents must choose from the same concrete legal microturn/action protocol as clients; no second legality protocol or action-template search.  
* **Visibility safety.** Agents consume observer projections; non-omniscient agents must not inspect full hidden state.  
* **Determinism and bounded computation.** No ambient nondeterminism, no unbounded recursion/search, and all caps must be named/recorded.  
* **Preview signal integrity.** Preview output is advisory evidence with observer scope, status, budget, and fallback provenance. Hidden, unknown, stochastic, failed, depth-capped, partial, and ready are distinct. Unavailable preview refs must not silently become numeric contributions.

Foundation #20 is the decisive one: a standing-vector fix must **increase** preview-status fidelity, not hide uncertainty under a scalar.

## **Spec 15 already anticipated per-seat preview refs**

Spec 15 defines policy-agent IR with visibility-safe, bounded, concrete-action scoring. It explicitly includes current and preview victory refs such as `victory.currentMargin.<seat>`, `victory.currentRank.<seat>`, `preview.victory.currentMargin.<seat>`, and `preview.victory.currentRank.<seat>`. It also says preview is bounded one-ply concrete-move evidence, with hidden/random/unresolved values treated as unknown rather than omnisciently inspected.

That means Option A, “add `preview.victory.currentMargin.<seat>`,” is not a root solution. The concept is already in the IR.

## **The current surface internally builds a victory vector**

`policy-surface.ts` defines `PolicyVictorySurface` as maps of `marginBySeat` and `rankBySeat`, parses `victory.currentMargin.<seatToken>` and `victory.currentRank.<seatToken>`, resolves role selectors including `self`, `active`, `$seat`, and named seats, and builds the victory surface from `def.terminal.margins` and terminal ranking/tie-break order.

The terminal system similarly has generic margin/ranking definitions: victory margin defs are per-seat numeric expressions, ranking order can be ascending or descending, and final victory ranking evaluates all margin rows and sorts them with tie-breaks.

This is exactly the right base for a generic standing-vector model. The engine already knows how to compute the vector; it just does not expose it as a first-class preview-evidence object.

## **`seatAgg` exists, but it is too low-level and status-poor**

`seatAgg` is present in the expression analyzer and supports `over: opponents`, `over: all`, or explicit seat arrays, with `$seat` allowed only inside the aggregate expression. It supports `sum`, `count`, `min`, and `max`.

The tests prove this is not theoretical. There is an end-to-end FITL test defining `maxOpponentMargin` as a `seatAgg` over opponents reading `victory.currentMargin.$seat`, and unit tests validate `$seat` inside `seatAgg`, including preview-margin syntax.

But runtime evaluation makes `seatAgg` a poor Foundation #20 carrier. It iterates seats and evaluates the inner expression under a `currentSeatContext`, then aggregates numeric values. Nonnumeric/unavailable values are effectively skipped; `sum` with no values returns `0`, while `min/max` with no values returns `undefined`. That behavior is acceptable for some current-state scalar use, but it is not a sufficient model for preview opponent evidence because it loses the per-seat status trail.

## **Preview resolution is status-aware, but scalar/candidate-centric**

`policy-preview.ts` has explicit preview outcomes: `ready`, `stochastic`, `random`, `hidden`, `unresolved`, `failed`, `depthCap`, `noPreviewDecision`, and `gated`. It resolves preview surface refs by applying the candidate, driving bounded synthetic completion, checking surface visibility and hidden sampling, then resolving refs against the projected state.

The synthetic completion driver stops at action-selection, outcome-grant, turn-retirement, seat/turn boundary, stochastic resolve, or depth cap. That is the right bounded-computation behavior, but it also explains why defensive opponent effects behind deeper FITL microturns can be unavailable or constant.

`policy-eval.ts` tracks preview usage via candidate metadata, ready-ref stats, outcome breakdowns, and selection reasons such as `tiebreakAfterPreviewNoSignal`, but it does not have a candidate × seat standing matrix or derived role diagnostics.

## **Inner preview is self-only for victory option deltas**

`policy-preview-inner.ts` supports `preview.option.victory.currentMargin.self`, `preview.option.victory.currentRank.self`, and `preview.option.delta.victory.currentMargin.self`, but not opponent option deltas. It maps these option refs to `self` surface refs and computes delta only for self margin.

So even though root action-selection preview can technically read opponent projected margins, the deeper microturn-choice scoring surface that ARVN relies on is still self-victory centered.

## **Budgeting and deepening are bounded and should remain so**

Preview budget allocation is deliberately capped by candidate groups, prior scores, effect footprints, widening only on uniform projections, and a fixed full-candidate cap.

Compiler preview caps also enforce bounded inner preview: `standard256`, `deep1024`, hard limits, and validated cost formulas.

Deepening improves microturn choice quality in ARVN, but the campaign lesson says action-selection distribution did not change; the gains came from inner target/option selection, not from solving root opponent-denial.

## **Reports/specs requested but not found**

The exact target report/spec slugs were not discoverable through the Git connector on non-archive paths. I searched exact and fuzzy terms including `fitl-arvn-preview-opponent-margin`, `opponent margin`, `opponent margins`, `action-selection-preview`, `Spec 179`, `tiebreakAfterPreviewNoSignal`, `POLICY_PREVIEW_SIGNAL_UNAVAILABLE`, `preview opponent margin`, `ARVN opponent margin`, and `half of the action space`, including branches, PRs, and commits. The visible non-archive repo evidence that most directly matches the described issue is in `campaigns/lessons-global.jsonl`, especially the ARVN opponent-denial lessons.

---

# **4. Research synthesis**

## **Multiplayer game AI: score vectors, not one scalar**

Classic two-player minimax relies on a single zero-sum value. The MaxN paper explicitly states that once there are more than two players, “one value will no longer suffice” and outcomes require vectors; MaxN backs up a payoff vector and selects by the moving player’s component.

That maps directly to LudoForge: a FITL policy agent should not only see “my projected margin.” It needs a **standing vector**: each seat’s projected margin/rank/status, then a declared utility function over that vector.

Paranoid search is the contrasting model: it collapses all opponents into a coalition against the focal player. That can be computationally useful, but it is strategically crude for non-zero-sum multiplayer games because opponents do not always share interests. For LudoForge, paranoid-style “hurt max opponent” is useful as a **bounded authored aggregate**, not as the engine’s universal evaluation semantics.

## **General game playing: generic rules, per-role utility**

General Game Playing’s GDL exposes generic `role`, `legal`, `next`, `terminal`, and `goal(role, value)` concepts; it avoids game-specific agent code by letting the game description define per-role terminal utility.

OpenSpiel follows the same general lesson in a modern implementation: it supports n-player, zero-sum, cooperative, general-sum, simultaneous/turn-taking, perfect/imperfect-information games, and exposes returns as one value per player.

The applicable lesson is not “adopt GDL” or “adopt OpenSpiel.” The lesson is: **generic game agents reason over player/seat-indexed utility vectors**. LudoForge already has terminal margins and rank vectors; the policy DSL should expose them as such.

## **Utility AI / behavior-tree practice: bounded, modular scoring is good**

Behavior trees grew out of game AI partly because flat finite-state logic scaled poorly; their value is modular, reusable, inspectable decision logic. Utility AI similarly works when designers can combine named, bounded considerations rather than arbitrary opaque code. Behavior-tree research emphasizes modularity, reactivity, and analyzability—properties LudoForge’s policy DSL also needs.

The applicable lesson: make opponent-aware scoring a library of named, traceable, evolvable utilities—not arbitrary expression mutation and not hidden search.

## **MARL / coevolution: opponents and exploitability matter**

AlphaStar’s Nature paper is relevant by analogy, not by implementation. It used a diverse league of strategies and counter-strategies, and the paper’s extended data discusses population performance, exploitability, and non-transitive payoff cycles.

The applicable lesson is that optimizing only “my immediate improvement” is weak in multi-agent strategic domains. Good training/scoring surfaces need opponent pressure, exploitability, and relative standing signals. The non-applicable part is the machinery: LudoForge should not import unbounded neural self-play or rollout search into the policy runtime.

## **COIN / asymmetric board-game bots**

COIN games are asymmetric multiplayer conflict games with distinct faction goals and non-player rules; public descriptions note that COIN games support up to four factions with unique winning conditions and that non-player systems use deterministic procedures such as flowcharts or bot decks.

The applicable lesson is that COIN bots need faction-specific priorities and threat checks, but LudoForge must encode these through declarative generic surfaces. A FITL ARVN bot may target a leader or nearest threat, but the engine must not know what ARVN, VC, NVA, or US “mean.”

---

# **5. Design alternatives**

| Option | Verdict | Benefits | Risks / why insufficient | Foundation alignment |
| ----- | ----- | ----- | ----- | ----- |
| **A. Patch direct opponent-margin refs** | Reject as root fix | Low implementation cost; current refs almost already there | Does not solve constant/depth-capped opponent signal; no rank/threat roles; no per-seat status matrix; already exists in Spec 15/current parser | Safe but too narrow |
| **B. Expand/fix `seatAgg`** | Keep as compatibility, not main solution | Existing syntax; tests already cover FITL/current-state use | Aggregates lose cell identity/status; `sum` no-values → `0`; awkward for leader/nearest-threat/rank delta | Needs status rewrite to satisfy #20 for preview |
| **C. Standing-vector preview** | **Adopt as core** | Matches MaxN/GGP/OpenSpiel vector lesson; generic across games; exposes all seats with status/provenance | Moderate schema/runtime/trace work | Strong alignment if status is explicit |
| **D. Generic opponent-threat aggregates** | **Adopt on top of C** | Gives authors/evolution named bounded concepts: leader, nearest threat, closest ahead, opponent reduction | Needs precise role semantics and ranking-order normalization | Strong; declarative and bounded |
| **E. Candidate × seat preview matrix** | **Adopt for trace/cache** | Makes root cause visible: which seat changed, which was depth-capped, which was hidden | Some memory/trace volume; must be requested/lazy | Strong if capped by candidates × seats |
| **F. Utility-vector / multi-objective scoring** | Adopt constrained version | Lets profiles combine own delta, opponent delta, rank delta, threshold prevention | Dangerous if arbitrary expression evolution is allowed | Safe if exposed as named library items/IR nodes |
| **G. Profile-only fix** | Reject as sufficient | Current DSL can express some opponent refs manually | Campaign already tried correct preview-ref opponent formulations with zero effect; diagnostics poor; microturn option surface self-only | Does not solve architecture |
| **H. Search/rollout planning** | Reject as primary | Could in principle find delayed defensive effects | Violates boundedness/perf lessons unless severely capped; reintroduces FITL explosion risk | Weak unless only existing preview caps are used |

---

# **6. Recommended architecture**

## **6.1 Model: standing evidence, not scalar preview**

Introduce a generic **Standing Vector** derived from the existing terminal margin/ranking machinery.

type StandingMetricStatus =

 | { kind: 'ready'; value: number; provenance: StandingProvenance }

 | { kind: 'hidden'; provenance: StandingProvenance }

 | { kind: 'stochastic'; provenance: StandingProvenance }

 | { kind: 'unresolved'; provenance: StandingProvenance }

 | { kind: 'failed'; provenance: StandingProvenance }

 | { kind: 'depthCap'; provenance: StandingProvenance }

 | { kind: 'gated'; provenance: StandingProvenance }

 | { kind: 'partial'; readySeats: readonly string[]; unavailableSeats: readonly StandingUnavailableCell[] };

interface StandingCell {

 seatId: string;

 currentMargin: StandingMetricStatus;

 currentRank: StandingMetricStatus;

 projectedMargin?: StandingMetricStatus;

 projectedRank?: StandingMetricStatus;

 deltaMargin?: StandingMetricStatus;

 deltaRank?: StandingMetricStatus;

}

interface CandidateStandingEvidence {

 candidateStableMoveKey: string;

 previewOutcome: PolicyPreviewTraceOutcome;

 driveDepth: number;

 completionPolicy: string;

 capClass?: string;

 cells: readonly StandingCell[];

 derivedRoles: readonly StandingDerivedRoleTrace[];

}

This model should be built from `buildPolicyVictorySurface` for current state and projected preview state. It must not duplicate victory semantics. It should cache current standing once per decision and projected standing once per previewed candidate.

## **6.2 Authoring surface**

Keep existing refs as aliases, but add a clearer standing namespace:

# scalar refs

standing.margin.self

standing.rank.self

standing.margin.<seat>

standing.rank.<seat>

preview.standing.margin.self

preview.standing.rank.self

preview.standing.margin.<seat>

preview.standing.rank.<seat>

preview.standing.delta.margin.self

preview.standing.delta.rank.self

preview.standing.delta.margin.<seat>

preview.standing.delta.rank.<seat>

preview.standing.delta.margin.$seat

preview.standing.delta.rank.$seat

Add role selectors:

standing.role.currentLeader

standing.role.projectedLeader

standing.role.nearestThreat

standing.role.closestAhead

standing.role.closestBehind

Role semantics:

* `currentLeader`: opponent with best current standing under `terminal.ranking.order` and tie-break order.  
* `projectedLeader`: opponent with best projected standing among ready projected cells.  
* `nearestThreat`: opponent closest to winning / best margin after excluding self; if a game defines `ranking.order: asc`, normalize comparisons so “threat” means “better terminal standing,” not numerically larger margin.  
* `closestAhead`: opponent immediately ahead of self by current rank/margin.  
* `closestBehind`: opponent immediately behind self.

Add status-aware aggregate syntax:

standingAgg:

 source: preview          # current | preview

 metric: margin           # margin | rank

 transform: delta         # value | delta

 over: opponents          # self | opponents | all | [seat ids]

 role: currentLeader      # optional

 aggOp: min               # min | max | sum | count

 availability: selfAndTargetReady

 tieBreak: terminalRanking

Availability modes must be explicit:

availability:

 - requireAllReady        # any unavailable cell => aggregate unavailable

 - requireAnyReady        # use ready cells; trace skipped cells

 - selfAndTargetReady     # self and selected role/target must be ready

 - skipUnavailable        # allowed, but never silent: trace skipped cells

No aggregate should silently invent `0` for missing preview evidence. If an aggregate has no usable ready cells, it returns unavailable and the existing preview fallback machinery decides contribution. This preserves the compiler’s existing explicit-preview-fallback contract.

## **6.3 Compiled IR shape**

Add new compiled expression nodes rather than lowering everything to `seatAgg`:

interface CompiledStandingRef {

 kind: 'standingRef';

 scope: 'current' | 'preview';

 metric: 'margin' | 'rank';

 transform: 'value' | 'delta';

 seat:

   | { kind: 'self' }

   | { kind: 'literal'; seatId: string }

   | { kind: 'placeholder' }      // $seat

   | { kind: 'role'; role: StandingRole };

 availability: StandingAvailability;

}

interface CompiledStandingAgg {

 kind: 'standingAgg';

 source: 'current' | 'preview';

 metric: 'margin' | 'rank';

 transform: 'value' | 'delta';

 over: 'self' | 'opponents' | 'all' | readonly string[];

 role?: StandingRole;

 aggOp: 'min' | 'max' | 'sum' | 'count';

 availability: StandingAvailability;

 tieBreak: 'terminalRanking' | 'stableSeatId';

}

`seatAgg` remains valid and backward-compatible. But preview standing aggregates should use dedicated evaluators so per-seat statuses and skipped cells are retained in traces.

## **6.4 Runtime semantics**

At candidate scoring time:

1. Build current standing vector from current observed state.  
2. If a standing preview ref/aggregate is requested and candidate is budget-allowed, run existing preview drive.  
3. Build projected standing vector from preview state if preview outcome and visibility allow it.  
4. Compute deltas cell-by-cell only when both current and projected cells are ready.  
5. Resolve roles from current or projected vector as declared.  
6. Evaluate aggregates under explicit availability mode.  
7. If unavailable, invoke the authored preview fallback. If all root candidates have no usable preview signal, keep the existing `tiebreakAfterPreviewNoSignal` path.

No new search, no new legality protocol, no FITL-specific branches.

## **6.5 Preview status/provenance**

Every standing cell should include:

provenance:

 scope: preview

 observerSeat: arvn

 source: terminal.margins

 candidateStableMoveKey: ...

 previewOutcome: depthCap

 driveDepth: 4

 completionPolicy: policyGuided

 capClass: standard256

 visibility: public|self|hidden

Derived aggregates should trace their input cells:

standingAggregateTrace:

 id: hurtCurrentLeader

 role:

   kind: currentLeader

   selectedSeat: vc

   basis: current.margin

   status: ready

 inputs:

   - seat: vc

     deltaMargin: { status: ready, value: -2 }

   - seat: nva

     deltaMargin: { status: ready, value: 0, skipped: roleNotSelected }

 result:

   status: ready

   value: 2

This makes impossible states visible: “opponent denial did nothing” versus “opponent denial was depth-capped” versus “opponent evidence hidden.”

## **6.6 Diagnostics**

Add to candidate metadata:

previewStanding:

 requestedMetrics:

   - preview.standing.delta.margin.opponents

   - preview.standing.delta.rank.self

 matrix:

   candidateKey:

     arvn:

       projectedMargin: { status: ready, value: 4 }

       deltaMargin: { status: ready, value: 1 }

       projectedRank: { status: ready, value: 2 }

     vc:

       projectedMargin: { status: depthCap }

       deltaMargin: { status: depthCap }

 derivedRoles:

   currentLeader:

     seat: vc

     status: ready

     tieBreak: terminalRanking

Also add `previewUsage.standingReadyStats`:

standingReadyStats:

 byMetric:

   preview.standing.delta.margin.opponents:

     readyCells: 18

     hiddenCells: 0

     depthCappedCells: 7

     unresolvedCells: 2

     differentiatingCandidates: 4

This directly addresses the current trace observability gap noted in campaign lessons.

## **6.7 Evolution implications**

Evolution should mutate only:

* inclusion/exclusion of named standing library items,  
* integer weights within bounded ranges,  
* thresholds,  
* availability mode from an allowed enum,  
* target role from an allowed enum,  
* tie-break order from allowed enum.

It should **not** mutate arbitrary expression trees. This preserves Spec 15’s bounded mutation model.

Library items:

preferOwnProjectedMarginDelta

preferOwnRankGain

hurtCurrentLeader

reduceNearestThreat

avoidHelpingCurrentLeader

avoidHelpingNearestThreat

bestOpponentMarginReduction

preferDefensiveWhenOwnFlat

preferRankImprovementWhenMarginFlat

---

# **7. Concrete FITL examples**

These are generic policy YAML patterns. They do not require FITL-specific engine code.

## **7.1 Hurt the current leader**

candidateFeatures:

 leaderProjectedMarginDelta:

   type: number

   costClass: preview

   expr:

     standingAgg:

       source: preview

       metric: margin

       transform: delta

       over: opponents

       role: currentLeader

       aggOp: min

       availability: selfAndTargetReady

       tieBreak: terminalRanking

considerations:

 hurtCurrentLeader:

   scopes: [move]

   costClass: preview

   weight: { param: hurtLeaderWeight }

   value:

     max:

       - 0

       - { neg: { ref: feature.leaderProjectedMarginDelta } }

   previewFallback:

     onUnavailable:

       kind: noContribution

Interpretation: if the selected leader’s margin delta is `-2`, this yields `+2` before weighting. If the leader cell is depth-capped, the contribution is unavailable and falls through explicit fallback.

## **7.2 Reduce nearest threat**

candidateFeatures:

 nearestThreatMarginDelta:

   type: number

   costClass: preview

   expr:

     standingAgg:

       source: preview

       metric: margin

       transform: delta

       over: opponents

       role: nearestThreat

       aggOp: min

       availability: selfAndTargetReady

       tieBreak: terminalRanking

considerations:

 reduceNearestThreat:

   scopes: [move]

   costClass: preview

   weight: { param: reduceThreatWeight }

   value:

     max:

       - 0

       - { neg: { ref: feature.nearestThreatMarginDelta } }

   previewFallback:

     onUnavailable:

       kind: noContribution

This does not assume VC/NVA/US identity. It asks the generic terminal standing model which opponent is the nearest threat.

## **7.3 Prefer opponent-margin reduction when own margin is unchanged**

candidateFeatures:

 ownMarginDelta:

   type: number

   costClass: preview

   expr:

     ref: preview.standing.delta.margin.self

 bestOpponentMarginReduction:

   type: number

   costClass: preview

   expr:

     standingAgg:

       source: preview

       metric: margin

       transform: delta

       over: opponents

       aggOp: min

       availability: requireAnyReady

       tieBreak: terminalRanking

considerations:

 defensiveWhenOwnFlat:

   scopes: [move]

   costClass: preview

   weight: { param: defensiveWhenOwnFlatWeight }

   when:

     eq:

       - { ref: feature.ownMarginDelta }

       - 0

   value:

     max:

       - 0

       - { neg: { ref: feature.bestOpponentMarginReduction } }

   previewFallback:

     onUnavailable:

       kind: noContribution

This captures the missing half of the action space: actions whose value is adversarial rather than self-improving.

## **7.4 Improve rank even when own raw margin is unchanged**

candidateFeatures:

 ownRankDelta:

   type: number

   costClass: preview

   expr:

     ref: preview.standing.delta.rank.self

considerations:

 preferRankGain:

   scopes: [move]

   costClass: preview

   weight: { param: rankGainWeight }

   value:

     max:

       - 0

       - { neg: { ref: feature.ownRankDelta } } # rank 3 -> 2 is -1, desirable

   previewFallback:

     onUnavailable:

       kind: noContribution

This generalizes the campaign’s successful rank-aware direction rather than treating rank as an ARVN special case.

---

# **8. Compatibility with other games**

**Texas Hold’em / hidden information.** The current integration test shows a neutral shared-seat model where `opponents` can be empty. A standing-vector model should gracefully return empty opponent sets and no contribution unless the game declares actual competitive seats. In hidden-info games, standing cells must use observer visibility. If terminal utility depends on hidden cards, preview standings become `hidden` or `unresolved`, never omniscient values.

**Symmetric games.** For chess-like or abstract multiplayer games, the same vector works: all seats get margin/rank cells, and roles are derived from terminal ranking.

**Variable seat counts.** The matrix is bounded by `candidatePreviewCap × activeSeatCount × requestedMetrics`. The compiler should validate explicit seat IDs and use stable seat order from GameDef.

**Teams/allies.** Do not infer alliances. Today, `opponents` should mean “all seats except self.” Future support for `allies`, `nonAllies`, or team scoring should require a declarative team graph in GameSpec.

**Stochastic games.** Existing `exactWorld` versus `tolerateStochastic` behavior remains. Standing cells reached through random/stochastic preview become stochastic/unavailable according to current preview policy, with explicit fallback.

**Games without terminal margins.** If `def.terminal.margins` is absent, standing refs are compiler-invalid or runtime-unavailable with a clear diagnostic. Do not synthesize fake margins.

---

# **9. Implementation plan**

## **Phase 0 — spec and failing tests first**

Write Spec 179R before implementation. Include:

* standing vector data model,  
* authoring refs,  
* compiled IR,  
* availability semantics,  
* trace schema,  
* fallback behavior,  
* compatibility/migration,  
* test corpus.

## **Phase 1 — parser/analyzer/schema**

Likely files:

* `packages/engine/src/agents/policy-expr.ts`  
* `packages/engine/src/kernel/types-core.ts`  
* `packages/engine/src/kernel/schemas-core.ts`  
* `packages/engine/src/cnl/compile-agents.ts`  
* `packages/engine/src/cnl/validate-agents.ts`  
* docs: `docs/agent-dsl-cookbook.md`  
* spec: new `specs/179R-standing-vector-preview.md`

Add authored expression forms for `standingRef` and `standingAgg`. Validate:

* explicit seat IDs exist,  
* `$seat` only allowed inside appropriate aggregate context,  
* preview standing refs require explicit fallback in considerations,  
* availability mode is declared for preview aggregates,  
* rank delta direction is documented.

## **Phase 2 — runtime standing evidence**

Likely files:

* `packages/engine/src/agents/policy-surface.ts`  
* `packages/engine/src/agents/policy-preview.ts`  
* `packages/engine/src/agents/policy-evaluation-core.ts`  
* `packages/engine/src/agents/policy-eval.ts`

Implement:

* current standing vector builder wrapping existing victory surface,  
* preview standing vector builder wrapping existing preview outcome state,  
* delta computation,  
* role derivation,  
* status-aware aggregate evaluator,  
* per-candidate evidence cache.

Do not alter the kernel terminal formula evaluator except to reuse existing outputs.

## **Phase 3 — inner preview support**

Likely files:

* `packages/engine/src/agents/policy-preview-inner.ts`  
* `packages/engine/src/agents/policy-preview-inner-deepening.ts`  
* `packages/engine/src/agents/policy-wasm-preview-drive.ts`

Add standing option refs only if needed and only under existing inner preview caps:

preview.option.standing.margin.<seat>

preview.option.standing.rank.<seat>

preview.option.delta.standing.margin.<seat>

preview.option.delta.standing.rank.<seat>

This is important because ARVN’s actual improvements often happen at microturn target/option choice, not root action selection.

## **Phase 4 — diagnostics and trace**

Likely files:

* `packages/engine/src/agents/policy-eval.ts`  
* `packages/engine/src/agents/policy-evaluation-core.ts`  
* trace/golden test fixtures

Add `previewStanding` and `standingAggregateTrace`. Keep hot-loop lessons in mind: do not add diagnostic objects to kernel hot-path structures or always-on cursors. The lessons file repeatedly warns that extra hot-path object fields and trace construction can cause V8 regressions.

## **Phase 5 — profile/library migration**

Update:

* `docs/agent-dsl-cookbook.md`  
* `data/games/fire-in-the-lake/92-agents.md`  
* `campaigns/fitl-arvn-agent-evolution/**`  
* `campaigns/fitl-vc-agent-evolution/**`

Add named library considerations, but do not delete existing self-margin features. For ARVN, start with low weights and use acceptance tests to prove the new terms are differentiating before evolution tunes them.

---

# **10. Testing strategy**

## **Failing tests to write first**

1. **Opponent denial witness.** Construct a tiny generic four-seat game where a legal action leaves self margin unchanged but reduces the current leader’s projected margin. The old self-margin profile chooses a different action; the new `hurtCurrentLeader` profile chooses the denial action.  
2. **Depth-capped opponent witness.** Construct a candidate whose opponent standing effect is behind the preview depth cap. Assert the aggregate is unavailable/depthCap, not `0`.  
3. **Hidden opponent witness.** In a hidden-info game, make opponent terminal margin depend on hidden data. Assert standing cell status is `hidden` and fallback fires.  
4. **No-signal root witness.** All candidates have only unavailable standing preview evidence. Assert `tiebreakAfterPreviewNoSignal` / `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` behavior remains.

## **Unit tests**

* `policy-expr` parses/validates `standingRef`, `standingAgg`, roles, availability modes.  
* `$seat` allowed only in standing aggregate context.  
* Asc/desc terminal ranking normalization works.  
* `standingAgg requireAllReady` returns unavailable if any cell unavailable.  
* `standingAgg requireAnyReady` traces skipped cells.  
* `standingAgg sum/count` never silently returns numeric zero when no ready preview cells unless an explicit availability mode permits it and trace says so.

## **Integration tests**

* FITL-like four-seat fixture: ARVN-like seat can choose a defensive action that reduces leader margin.  
* Existing `seatAgg` tests continue to pass.  
* Existing preview fallback diagnostic tests continue to pass.

## **Policy-profile-quality witnesses**

* Add ARVN traces where:  
  * own projected margin is unchanged,  
  * leader projected margin decreases,  
  * new consideration contributes positively,  
  * trace names the leader seat and source cells.  
* Add a negative witness where opponent margin is constant across candidates and trace says `utility: constant` or equivalent, avoiding false confidence.

## **Determinism/replay tests**

* Same seed, same candidate order, same standing matrix.  
* Tie-breaks use terminal ranking order or stable seat ID.  
* No object key iteration nondeterminism.

## **Hidden-info invariance tests**

* Changing hidden opponent data must not change standing values visible to a non-omniscient agent.  
* Omniscient analysis mode, if explicitly supported elsewhere, must be separate and trace-labeled.

## **Benchmarks**

* Bound overhead as `O(previewedCandidates × seats × requestedStandingMetrics)`.  
* Benchmark FITL ARVN tier profile with standing diagnostics disabled and enabled.  
* Assert no new always-on kernel hot-path fields.

## **Golden trace tests**

Golden trace should include:

selectionReason: previewDifferentiated

previewStanding:

 derivedRoles:

   currentLeader:

     seat: vc

     status: ready

 matrix:

   candidateA:

     vc:

       deltaMargin: { status: ready, value: -2 }

standingAggregateTrace:

 result: { status: ready, value: 2 }

---

# **11. Acceptance criteria**

The implementation is acceptable only if all of these are true:

1. **ARVN can select a defensive action** whose own projected margin is unchanged but whose value is reducing the current leader or nearest threat.  
2. **Trace explains the selection** with candidate × seat standing cells, derived role, aggregate result, and fallback/status provenance.  
3. **Unavailable opponent preview evidence never becomes numeric zero by accident.**  
4. **`seatAgg` remains backward-compatible**, but preview standing logic does not rely on status-losing `seatAgg` behavior.  
5. **No FITL-specific engine branches** are introduced.  
6. **No second legality/action protocol** is introduced; all candidates remain concrete legal moves from the existing rules pipeline.  
7. **Preview remains bounded** by existing budget/depth cap classes.  
8. **Hidden-info safety is preserved** under observer projections.  
9. **Deterministic replay is unchanged** for profiles that do not use standing-vector features.  
10. **Diagnostics distinguish** ready-but-constant, hidden, depth-capped, unresolved, gated, and failed opponent signals.  
11. **Evolution can tune the new logic** through named bounded library items and integer weights, not arbitrary expression generation.  
12. **Existing ARVN self-margin/rank behavior does not regress** unless an explicit profile migration opts into new defensive utilities.

---

# **12. Risks and open questions**

**Risk: opponent-margin signals may still be genuinely unavailable at root action-selection scope.** The campaign lessons suggest many ARVN opponent-denial attempts were constant or depth-capped because the opponent margin changes were not reached by bounded root preview. The standing matrix does not magically create signal; it makes the absence of signal explicit and opens the microturn-scope path where applicable.

**Risk: role semantics can be wrong if margin sign is mishandled.** FITL-like games may use different terminal ranking orders. The spec must define “leader,” “threat,” and “margin improvement” in terms of terminal ranking, not raw numeric larger-is-better assumptions.

**Risk: trace volume and allocation overhead.** The matrix should be materialized only for requested standing refs/aggregates and only on candidate metadata, not kernel hot-path objects.

**Risk: teams/allies.** `opponents` currently means non-self. If future games have alliances, the engine needs declarative team metadata rather than assumptions.

**Open question: should rank deltas be first-class for all seats?** I think yes. The ARVN evidence says rank-aware scoring worked when raw opponent margins did not. Rank is the cleanest generic relative-standing primitive.

**Open question: should `standingAgg` replace `seatAgg`?** No. Keep both. `seatAgg` is a low-level scalar aggregate. `standingAgg` is a status-aware preview evidence aggregate.

**Open question: should preview.option opponent standing refs be included in the first implementation?** I would include at least `preview.option.delta.standing.margin.<seat|$seat>` and `preview.option.delta.standing.rank.<seat|$seat>` because ARVN deepening gains happen at microturn option selection. But gate them behind the same inner-preview opt-in and fallback rules already enforced today.

---

# **13. Spec 179 disposition**

Because the actual `specs/179-action-selection-preview*` file was not discoverable through the Git connector, this is a topic-by-topic disposition against the described candidate solution class rather than a literal line-by-line redline.

## **Keep**

* Any insistence that opponent-preview evidence must be visible in traces.  
* Any test that proves `preview.victory.currentMargin.<opponent>` can be requested and resolved when preview reaches a ready projected state.  
* Any preservation of `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` and `tiebreakAfterPreviewNoSignal`.  
* Any bounded-preview/depth-cap language.

## **Delete or reject**

* Any claim that adding direct opponent refs alone solves ARVN opponent reasoning. Direct refs already exist in Spec 15/current surface.  
* Any fallback that treats missing/depth-capped/hidden opponent preview as numeric `0` without explicit YAML fallback.  
* Any FITL-specific engine logic for ARVN, VC, NVA, US, Govern, Train, Coup, or COIN-specific victory.  
* Any unbounded deeper search, rollout, or MCTS-style solution as the primary fix.  
* Any “self-margin plus opponent tie-break” scalar patch that hides the full standing vector.

## **Replace with Spec 179R text**

Spec 179R should specify:

1. **Standing vector:** current/projected/delta margin and rank by seat, derived from existing terminal margin/ranking machinery.  
2. **Per-seat statuses:** ready, hidden, stochastic, unresolved, failed, depthCap, gated, partial.  
3. **Standing refs:** `preview.standing.margin.<seat>`, `preview.standing.rank.<seat>`, `preview.standing.delta.margin.<seat>`, `preview.standing.delta.rank.<seat>`, with `$seat` variants.  
4. **Role selectors:** current leader, projected leader, nearest threat, closest ahead/behind.  
5. **Status-aware aggregates:** `standingAgg` with explicit availability semantics.  
6. **Candidate × seat matrix diagnostics:** trace cells and derived roles.  
7. **Fallback contract:** unavailable standing evidence requires explicit preview fallback; no silent numeric contribution.  
8. **Evolution library:** named defensive utilities with bounded tunable weights.  
9. **Compatibility:** no game-specific engine branches, no second legality protocol, hidden-info safe, deterministic, bounded.  
10. **Tests:** opponent-denial witness, depth-cap witness, hidden-info witness, no-signal witness, FITL ARVN profile-quality witness.

**Bottom line:** Spec 179 should be **replaced or heavily amended** into a standing-vector preview spec. The best fix is not “teach ARVN about VC/NVA margins.” The best fix is to give every policy agent a generic, bounded, visible, status-preserving way to score the whole projected standing vector.

---

# **Reassessment Coverage (2026-05-17)**

This deep-research document was reassessed against the codebase after authoring. ChatGPT-Pro openly noted that it could not access `specs/179-action-selection-preview-outcome-grant-opt-in.md` or `reports/fitl-arvn-preview-opponent-margin-uniform-2026-05-17.md` through its Git connector; its "replace Spec 179 wholesale" verdict was rendered against an imagined candidate-solution-class, not the real Spec 179. Verification of 14 concrete codebase claims confirmed 12, partially confirmed 1, and contradicted 1.

**Disposition summary**:
- **Spec 179** (`archive/specs/179-action-selection-preview-outcome-grant-opt-in.md`) was later deferred/superseded for the production ordinary-operation opponent-margin goal. Its `outcomeGrantContinuation` substrate remains valid for synthetic or future production paths that actually publish `outcomeGrantResolve`, but the FITL ARVN ordinary-operation witness could not close through that contract.
- **Spec 180** (`archive/specs/180-standing-vector-observability-and-outer-preview-signal-integrity.md`) completed as the scoped successor. It captured the durable improvements from this report and closed the production ordinary-operation route through status-aware `seatAgg`, per-candidate seat matrix evidence, named role primitives, and a causal/action ARVN witness.
- **Per-recommendation table**: see `specs/180-*.md` §12 for the full disposition of each ChatGPT-Pro recommendation (adopted / adopted-with-adjustment / corrected / deferred / rejected).

**Key corrections to this report's factual claims**:
- The "Spec 15 already anticipated per-seat preview refs" claim is wrong. Spec 15 is the FITL scope/gaps spec. The per-seat victory IR was introduced in Spec 64 (decomposed victory metrics), exposed on the preview surface by Spec 113, and generalized to arbitrary seats via `$seat` in Spec 122. Future derivative work should reference 64/113/122 for the IR ref shape.
- The "preview surface is scalar/candidate-centric with no status-aware aggregate" framing was correct for *outer-preview*, but Spec 162 (Foundation #20) already established status-aware per-ref tracking for the *inner-preview* chooseN path. Spec 180 extends, not introduces, this contract.

**Items deferred (not currently scoped to Spec 180)**:
- Full standing-vector data model with structured `StandingMetricStatus` / `StandingCell` / `CandidateStandingEvidence` types (§6.1). Deferred — most of the value lands via Spec 180's on-demand trace matrix; adopt the structured types only if downstream tooling shows the matrix is insufficient.
- Inner-preview opponent option refs `preview.option.delta.standing.<seat>` (§9 Phase 3). Real gap (`policy-preview-inner.ts:98-148` is self-only) but a separate, larger architectural change; ARVN's denial selection happens at action selection (outer-preview), not microturn target selection.
- Evolution library migration (`preferOwnProjectedMarginDelta`, `preferOwnRankGain`, `avoidHelpingCurrentLeader`, `bestOpponentMarginReduction`, `preferDefensiveWhenOwnFlat`, `preferRankImprovementWhenMarginFlat`, etc. — §6.7, §7). Substantial cookbook + ARVN/VC profile coordinated edit; lives in its own spec. Spec 180 ships exactly two of these (`hurtCurrentLeader`, `reduceNearestThreat`) to witness the new surface.
- Parallel `standingRef` / `standingAgg` compiled IR (§6.3). Rejected as duplicative; Spec 180 extends `seatAgg` in-place. Promotion to a parallel operator remains an escape valve in Spec 180 Open Question §9.1.

This report is preserved as authored above this section. Future readers researching the standing-vector design should treat the analysis above as ChatGPT-Pro's framing and this section + the linked Specs 179 and 180 as the as-implemented contract.
