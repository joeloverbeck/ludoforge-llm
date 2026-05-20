# **Proposal: ARVN Agent Evolution, Opponent Preview Integrity, and Structured Policy Direction**

**Status**: ✅ EXPLOITED — archived 2026-05-20.

## **1. Executive verdict**

Pause ARVN evolution. Do **not** merge `arvn-evolved` into the production baseline yet.

The live repository has already moved past the May-20 report’s original “implement post-grant continuation” framing: `outcomeGrantContinuation` exists, is compiled/validated, is wired through runtime providers, is summarized in preview usage, and `arvn-evolved` enables it with `extraDepthCap: 4` and `capClass: postGrant16`. That contradicts the report’s strongest obsolete claim that the mechanism is simply missing.

But the current mechanism is still not good enough. Code inspection shows that it can advance an `outcomeGrantResolve` frame by marking a pending free-operation grant from `ready` to `offered`, then stop with a “completed/ready” preview before any offered free operation is selected or executed. The existing architecture test proves exactly that narrow behavior: opt-out leaves the grant `ready`; opt-in marks it `offered`; it does **not** prove that opponent-affecting FITL operation effects execute or that NVA/VC margins differentiate.

So the strongest recommendation is:

1. **Block Spec 183 as an evolution-loop spec until the engine preview evidence gate passes.**  
2. **Generalize preview continuation from “post-`outcomeGrantResolve` only” to “bounded grant/free-operation continuation.”**  
3. **Add honest partial/unavailable/depth-capped/free-operation-capped status propagation so ready-uniform can no longer mean “the engine stopped before the relevant effects.”**  
4. **Only after that, replace the obsolete `arvn-baseline` with a structured ARVN baseline seeded from `arvn-evolved`; then resume evolution.**

The previous direction optimized around symptoms: flat-weight soup, no-signal penalties, and profile-quality lints. Those are real problems, but they are downstream. If `preview.victory.currentMargin.nva`, `.vc`, `currentLeader`, and `nearestThreat` are being scored against a pre-effect or grant-offered-only state, no amount of selector/module polish will make ARVN’s opponent-denial reasoning honest.

I did not execute code or tests. This proposal is based on targeted current-repo inspection plus supporting research. The proof work below must be run in a real repo session.

---

## **2. Verified current-state facts**

### **Still true**

| Claim | Verdict |
| ----- | ----- |
| The ARVN policy has grown beyond flat considerations into selectors, strategy modules, guardrails, and turn-shape evaluators. | True. `92-agents.md` defines structured candidate features, standing-role aggregates, selectors/modules/guardrails, `currentTurnImpact`, and opponent-denial considerations. |
| `arvn-baseline` and `arvn-evolved` both exist, and `arvn-evolved` is the richer profile. | True. `arvn-baseline` is much thinner; `arvn-evolved` has broader preview budget, inner preview, continued deepening, post-grant continuation, structured module usage, guardrail, turn-shape evaluator, and opponent refs. The ARVN binding points to `arvn-evolved`. |
| The structured-over-flat direction in `archive/reports/ai-agent-overhaul-proposal.md` is directionally right. | True. The proposal correctly identifies flat action scoring as “numeric sludge” and recommends structured selectors/modules/guardrails/turn-shape/evolution of structure, not just weights. |
| Foundation #20 requires preview surfaces to distinguish ready, unknown, hidden, stochastic, unresolved, failed, depth-capped, partial, etc., instead of silently pretending a bounded preview is complete. | True and central. |
| Campaign docs treat evolved profiles as temporary campaign state until deliberately promoted, and promotion should rename repository-owned refs rather than preserve compatibility aliases. | True; this aligns with Foundation #14. |

### **Contradicted by current non-archive repo state**

| Claim | Contradiction |
| ----- | ----- |
| The engine lacks an opt-in continuation past `outcomeGrantResolve`. | Contradicted. `policy-preview.ts` accepts `outcomeGrantContinuation`, `driveSyntheticCompletion` has explicit `outcomeGrantResolve` handling, compiler/validator lower and validate the block, runtime providers pass it through, and `arvn-evolved` enables it. |
| The live mission is simply “implement Direction A / post-grant continuation.” | Contradicted. The mechanism exists; the live mission is whether it reaches FITL’s actual opponent-effect path. |
| Spec 183 can proceed as “no engine changes.” | Contradicted by its own reassessment note and by live code. Spec 183 says the May-17 witness is an engine coverage gap, but its body still says “No engine changes” and preserves profile-quality/no-signal framing. |

### **Partially true but incomplete**

| Claim | What is true | What is incomplete |
| ----- | ----- | ----- |
| Opponent-preview refs looked ready-uniform/dead in the May-17 witness. | The May-20 report records that `preview.victory.currentMargin.nva`, `.vc`, leader-denial refs, and opponent-tied `preview.feature.*` refs were uniform/dead. | The report does not account for the current implementation of `outcomeGrantContinuation`, nor does it prove whether current ready-uniform is caused by no continuation, too-shallow continuation, a free-operation path, pruning, WASM, or true no-op candidates. |
| `noSignalPenalty` / `PREVIEW_REF_UNIFORM` can catch the issue. | They can catch a profile receiving no useful differentiated signal. | They are the wrong primary fix if the engine reports `ready` before semantically relevant effects. Foundation #20 requires status/provenance integrity before profile-quality punishment. |
| `currentTurnImpact` helps express strategic turn shape. | It exists and uses `source: currentPreviewDrive`, objectives over self margin and `currentLeader`, with bounds. | It does not independently prove preview integrity. It consumes the candidate preview state only if that preview was materialized and within bounds. |
| `arvn-evolved` is closer to the intended production baseline than `arvn-baseline`. | Yes, it is materially richer and currently bound to ARVN. | It should not be promoted until its preview evidence is trustworthy. Otherwise the repo will bless a profile that may have learned against a dishonest/no-op surface. |

### **Unverified without execution**

| Claim | Status |
| ----- | ----- |
| Current `arvn-evolved` opponent refs differentiate across actual FITL action-selection candidates. | Unverified. Requires a FITL witness trace. |
| The current post-grant continuation runs on the relevant May-17-equivalent ARVN candidates. | Unverified. Code shows it can run if an `outcomeGrantResolve` frame is reached; it does not prove the witness reaches such frames. |
| The current continuation reaches NVA/VC margin-changing, guerrilla activation, piece removal, leader-denial, or nearest-threat effects. | Very doubtful from code inspection, but still needs a fixture/trace. |
| WASM and TS preview materialization agree for post-grant/free-operation continuation. | Unverified. Current WASM preview statuses/outcomes do not include `postGrantCap` or any free-operation-specific continuation status. |

---

## **3. Evidence-gate analysis**

### **1. Does the current engine already implement an opt-in continuation past `outcomeGrantResolve`?**

Yes. `CreatePolicyPreviewRuntimeInput` includes `outcomeGrantContinuation`; `driveSyntheticCompletion` checks for `context.kind === 'outcomeGrantResolve'`; if continuation is enabled and `postGrantDepth` is below `extraDepthCap`, it publishes the microturn, requires an `outcomeGrantResolve` legal action, applies it, increments post-grant depth, and continues.

### **2. Is it compiled, validated, wired into runtime providers, reflected in preview traces, and enabled by `arvn-evolved`?**

Mostly yes.

The compiler lowers `preview.outcomeGrantContinuation`, validates `enabled`, `extraDepthCap`, `capClass`, and requires `extraDepthCap` to match the cap-class budget. Current `postGrant16` maps to `4`.

The validator checks the same block and emits diagnostics for invalid shape, enabled flag, cap, and cap class.

Runtime providers pass the active profile’s preview config to `createPolicyPreviewRuntime`, including `outcomeGrantContinuation`, and expose `getOutcomeGrantContinuationDepth`.

Evaluation usage includes `outcomeGrantContinuation` summary with `enabled`, `extraDepthCap`, `capClass`, `extraDepthReached`, and exit counts for `completed`, `postGrantCap`, and `stochastic`.

`arvn-evolved` enables it:

outcomeGrantContinuation:  
 enabled: true  
 extraDepthCap: 4  
 capClass: postGrant16

Caveat: the usage summary is not yet good enough. `summarizePreviewOutcomes` collapses `postGrantCap` into `unknownDepthCap`, which loses cause specificity.

### **3. Does that mechanism actually execute for FITL ARVN action-selection candidate previews?**

Not proven.

The mechanism is eligible for `arvn-evolved`, but it only executes when a candidate preview reaches a top decision-stack frame whose context is `outcomeGrantResolve`. Code search did not reveal a production proof that FITL’s May-17-equivalent ARVN candidates reach such a frame; the current architecture test stubs `applyMove()` to fabricate a post-grant state with manually constructed `outcomeGrantResolve` frames.

The exact proof must be a FITL witness trace that records, per candidate:

* root action id and stable move key,  
* whether `outcomeGrantResolve` was published,  
* whether a pending free-operation grant existed,  
* whether the offered free operation was surfaced as an action-selection move,  
* whether it was executed,  
* final preview ref values and statuses.

### **4. Does it reach the opponent-effect microturns that change NVA/VC margins, activate guerrillas, remove pieces, or affect leader/nearest-threat standings?**

Current code inspection says: probably not, if those effects are behind offered free operations.

`applyDecision` for `outcomeGrantResolve` marks the grant `offered` and pops the outcome-grant frame. It does not execute the granted operation.

The actual free-operation execution path is elsewhere: `legalMoves` enumerates pending free-operation grants into `move.freeOperation: true` action moves, and `applyMoveCore` consumes the authorized grant and executes the action effects.

The current preview continuation can therefore stop at an “offered grant” state. That may be after the grant is acknowledged but before the free operation changes the board. If `preview.victory.currentMargin.nva` or `.vc` is resolved on that state, ready-uniform is exactly what I would expect.

### **5. Does FITL use a different free-operation/free-use grant path that bypasses or is not represented by `outcomeGrantResolve` in the preview drive?**

FITL production docs confirm that current FITL event authoring uses free-operation grants heavily: per-space grants, ordered grant surfacing, isolated grant helpers, Monsoon-sensitive grants, `effectTiming: afterGrants`, and global-variable windows that persist until grant resolution.

The generic kernel has a first-class pending free-operation grant model: `TurnFlowPendingFreeOperationGrant`, `pendingFreeOperationGrants`, `freeOperationActionIds`, grant authorization, outcome policy, legal-move enumeration, and grant consumption.

So the suspicion is well-founded: FITL opponent effects may live behind a grant/free-operation path that is not covered by simply resolving `outcomeGrantResolve`.

### **6. Why are `preview.victory.currentMargin.nva` / `.vc` and standing-role refs ready-uniform?**

The live repo rules out one explanation and makes one explanation much more likely.

Not likely anymore:

* “The continuation is absent.” It is present and enabled for `arvn-evolved`.

Most likely:

* “The continuation runs but exits too early.” Specifically, it can mark grants offered, then return completed when the decision stack is empty, before the offered free operation is published and executed.  
* “The effect is behind a different grant path.” FITL uses free-operation grants; actual operation effects occur via `move.freeOperation: true`, not merely via `outcomeGrantResolve`.  
* “Preview state is evaluated before the relevant effects.” That follows from the two points above.

Still possible and must be tested:

* Candidate pruning/budgeting prevents effectful candidates from materializing.  
* WASM scoring bypasses or disagrees with TS preview materialization.  
* Candidates truly do not affect those margins.  
* The path never produces an `outcomeGrantResolve` frame and instead goes directly through pending grants/actionSelection.

### **7. Does `turnShape.currentTurnImpact` see the same projected state as raw `preview.*` refs?**

It uses the same candidate preview runtime state when preview has already been materialized. It does **not** independently guarantee a deeper or more complete projection.

`resolveTurnShapeProjection` returns a projected state only after candidate preview metadata exists and the outcome is usable; otherwise it returns unavailable/partial-style results. `turnShapePreviewStatus` maps `postGrantCap` and `depthCap` to `partial`, and objectives are skipped if projected state is absent or the drive exceeds `maxSyntheticDecisions`.

So `turnShape.currentTurnImpact` is stricter than raw numeric refs in some cases, but it is not a cure. If the underlying preview stops at grant-offered-before-effect, both surfaces can still be semantically incomplete.

### **8. Does Spec 183 still contain body text / acceptance criteria that misclassify the May-17 witness?**

Yes.

Spec 183 has a reassessment note saying the May-17 witness is an engine coverage gap, not a profile-quality failure. But the body still retains “No engine changes,” a `noSignalPenalty`, `PREVIEW_REF_UNIFORM` profile-quality lint framing, and an acceptance criterion that expects the May-17 witness to produce a non-zero `noSignalPenalty`. That is internally inconsistent.

### **9. What exact test, fixture, trace, or command would prove the answer?**

Blocking proof should be in three layers.

First, an engine fixture:

packages/engine/test/architecture/preview-post-grant/post-grant-free-operation-continuation.test.ts

It should build a tiny card-driven game where root action creates a pending free-operation grant, `outcomeGrantResolve` marks it offered, and the only effectful state change occurs when the offered `freeOperation: true` operation executes. Assertions:

* old/current behavior stops with grant `offered` and target victory/global value unchanged;  
* generalized behavior executes the granted operation and changes the projected value;  
* trace records `outcomeGrantResolve`, `freeOperationActionSelection`, `grantConsumed`, and final exit reason;  
* if cap prevents completion, raw preview refs are not `ready`.

Second, a FITL-like fixture:

packages/engine/test/architecture/preview-post-grant/fitl-like-free-operation-preview.test.ts

It should use generic engine objects but mimic FITL’s ordered/free-operation event pattern: pending grants, optional sequence, zone filter, and an operation that removes/activates pieces or changes a victory-relevant value. Assertions should verify that `preview.victory.currentMargin.<opponent>` differentiates only after the granted operation executes.

Third, a real FITL witness:

packages/engine/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts

or the existing probe lane referenced by `campaigns/README.md`:

pnpm -F @ludoforge/engine test:policy-profile-quality

The witness should assert:

* `preview.victory.currentMargin.nva` and/or `.vc` differentiate when candidate effects should change those standings;  
* `currentLeader` / `nearestThreat` refs differentiate when relevant;  
* trace says whether post-grant/free-operation continuation ran;  
* exit reason is completion, depth cap, post-grant cap, free-operation cap, stochastic, failure, or true no-op;  
* ready refs are not ready merely because the preview stopped early.

Campaign docs identify the policy-profile-quality lane but do not provide this witness.

---

## **4. The FITL grant/free-operation issue**

This is the central bug risk.

### **Current path from candidate preview to preview refs**

1. **Policy evaluation creates providers and preview runtime.**  
    `policy-eval.ts` builds `PolicyEvaluationContext`, creates runtime providers, allocates preview budget, optionally tries WASM, and then scores with TS. Preview provider methods delegate to `PolicyPreviewRuntime`.  
2. **The candidate root move is applied.**  
    `policy-preview.ts` resolves the trusted move for the candidate, applies it through `dependencies.applyMove`, then calls `driveSyntheticCompletion`.  
3. **Synthetic completion inspects the decision stack.**  
    If the stack is empty, or the top decision context is a fresh `actionSelection`, or a non-origin-seat/non-origin-turn frame, the current preview drive returns `completed`. This is sensible for ordinary turn boundaries, but dangerous for “grant has just been offered; now the grant operation should be selected” cases.  
4. **`outcomeGrantResolve` continuation is narrow.**  
    When the stack top is `outcomeGrantResolve`, the opt-in path publishes the microturn, applies the first legal `outcomeGrantResolve` action, increments post-grant depth, and loops.  
5. **Applying `outcomeGrantResolve` does not execute the free operation.**  
    The microturn decision implementation finds the grant, marks it offered, and pops the frame. It does not call operation effects.  
6. **Actual free-operation moves are generated elsewhere.**  
    `legalMoves` enumerates pending free-operation grants, checks authorization, constructs moves with `freeOperation: true`, and admits those moves into legal action selection.  
7. **Actual free-operation effects are applied elsewhere.**  
    `applyMoveCore` consumes the authorized pending grant, executes the action effects, handles post-resolution turn flow, releases deferred effects, applies boundary expiry, and may advance to a decision point.  
8. **Preview refs resolve against whatever state the preview runtime finalized.**  
    `preview.victory.currentMargin.$seat` is ultimately resolved by the policy surface on the preview state. Standing roles like `currentLeader` and `nearestThreat` are resolved from the same surface.

### **Why current post-grant continuation is insufficient**

The existing continuation resolves the grant-offer acknowledgment, not the grant’s gameplay effect.

That distinction matters because FITL production authoring explicitly uses free-operation grants for events, including ordered grants, per-space grants, Monsoon overrides, and after-grant effects. The current FITL cookbook tells test authors to assert on `pendingFreeOperationGrants`, grant readiness/sequence windows, and resolved board state after execution.

So a candidate preview can be “completed” from the preview driver’s perspective while still being semantically pre-effect from the policy’s perspective. That is exactly the kind of lie Foundation #20 forbids.

### **What the current architecture test proves — and does not prove**

`post-grant-continuation-differentiates.test.ts` proves that opt-in profiles continue from `ready` to `offered`; it does not prove “post-grant opponent effects are visible.” The fixture has empty action effects and fabricates `outcomeGrantResolve` frames in `applyMove()`.

That test should be kept, but renamed mentally: it is a lifecycle-smoke test, not a preview-integrity proof.

### **Required engine-level generalization**

The correct abstraction is not “FITL ARVN deeper preview.” It is:

Continue through bounded, deterministic, kernel-published grant obligations that are semantically part of the origin candidate’s consequence chain.

That means the preview driver must understand, game-agnostically:

* `outcomeGrantResolve` frame: acknowledge/offer the grant.  
* pending grant state: detect whether the origin seat has grant-authorized moves that must/should be resolved for the preview to be semantically complete.  
* grant-authorized `actionSelection`: choose a legal `freeOperation: true` move under the configured preview completion policy.  
* inner `chooseOne` / `chooseNStep`: continue bounded inner completion if the granted operation requires decisions.  
* grant consumption: detect that the pending grant was consumed/skipped/expired.  
* deferred event effects / after-grant effects: continue until the kernel has applied the effect timing that belongs to the grant chain, or surface partial/capped.

No FITL-specific names. No `nva`, `vc`, `airStrike`, `SEALORDS`, `Agent Orange`, or ARVN logic in the engine.

---

## **5. What should happen to Spec 183**

Spec 183 should be blocked and rewritten, not merely amended.

The top reassessment note is correct: the May-17 witness is not primarily a profile-quality failure. But the rest of the spec still wants to handle the witness through `noSignalPenalty`, uniform-ref linting, and profile-quality acceptance. That is backwards.

Recommended treatment:

1. **Split engine preview integrity out of Spec 183.**  
    Create a new blocking spec, for example:

    specs/185-grant-free-operation-preview-integrity.md

    Scope: generalized grant/free-operation continuation, honest partial statuses, trace provenance, TS/WASM parity, FITL witness.

2. **Rewrite Spec 183 as an evolution-loop spec only.**  
    Keep:

   * structured evolution,  
   * probe corpora,  
   * quality-diversity,  
   * profile lifecycle,  
   * campaign reproducibility,  
   * profile-quality diagnostics.  
3. Remove or reframe:

   * “No engine changes.”  
   * `noSignalPenalty` as the May-17 fix.  
   * `POLICY_PROFILE_QUALITY_LINT_PREVIEW_REF_UNIFORM` as proof of engine correctness.  
   * acceptance criterion requiring May-17 to trigger non-zero no-signal penalty.  
4. **Replace Phase A acceptance criterion (c).**

    Proposed replacement text:

    The May-17 ARVN opponent-preview witness is an engine preview-integrity prerequisite, not a profile-quality witness. Until the preview engine proves that relevant post-grant/free-operation effects are either fully driven or honestly surfaced as partial/unavailable/capped, Spec 183 must not use ready-uniform opponent refs as evidence of weak profile quality. After the engine prerequisite passes, the witness must show either differentiated opponent/standing refs for effectful candidates or an explicit trace proving the candidates are true no-ops with respect to those refs.

5. **Keep profile-quality uniform-ref linting, but demote it.**  
    Uniform refs are useful for detecting dead policy terms after the engine is honest. They are dangerous if used before preview integrity is proven.

---

## **6. What should happen to ARVN profiles**

### **`arvn-baseline`**

`arvn-baseline` is obsolete for current ARVN development. It uses a smaller preview cap, no structured strategy module, no turn-shape evaluator, and a much thinner consideration set.

Do not preserve it for sentimental compatibility. Foundation #14 says no backwards compatibility: remove obsolete paths when the new path is accepted.

### **`arvn-evolved`**

`arvn-evolved` is the current active candidate, and the ARVN binding points to it. But it should not be promoted yet, because its most important opponent-denial signals may have evolved against a dishonest preview state.

### **Recommended lifecycle**

1. Keep `arvn-evolved` as a quarantined candidate profile.  
2. Block further ARVN evolution until preview evidence passes.  
3. After engine proof, create a hand-authored structured ARVN production profile seeded from `arvn-evolved`, not a pure numeric winner.  
4. Rename that profile to the production baseline, for example:  
   * `arvn-baseline` becomes the structured production profile, or  
   * `arvn-production` replaces both names if the repo wants clearer lifecycle semantics.  
5. Delete obsolete baseline references in the same change. Do not keep compatibility aliases.  
6. Resume evolution from the structured production profile, mutating structure and weights.

This matches `campaigns/README.md`: evolved profiles are temporary campaign state; promotion is an explicit repo-owned rename/update.

---

## **7. Architecture options**

### **Option 1: Current `outcomeGrantContinuation` is enough; add proof and cleanup**

**Verdict:** Not enough unless the FITL witness unexpectedly proves otherwise.

**Foundation alignment:** Good on bounded computation and determinism; weak on preview signal integrity unless proven.

**Correctness risk:** High. Current test only proves `ready → offered`, not effect execution.

**Performance/boundedness:** Already bounded by `postGrant16 = 4`.

**Trace/explanation quality:** Partial. Summary reports post-grant depth and exit counts, but cap/error taxonomy is lossy.

**Blast radius:** Low.

**Tests required:** FITL May-17-equivalent witness; regular post-grant effect fixture.

**Unblocks ARVN:** Only if the witness passes. I expect it will not.

---

### **Option 2: Generalize continuation to cover FITL free-operation/free-use grants**

**Verdict:** Preferred engine fix.

**Foundation alignment:** Strong if implemented through generic kernel surfaces:

* #1 Engine Agnosticism: no FITL-specific logic.  
* #5 One Rules Protocol: use real kernel `legalMoves` and `applyMove`.  
* #8 Determinism: use deterministic policy-guided/greedy selection.  
* #10 Bounded Computation: named cap classes.  
* #20 Preview Signal Integrity: no pre-effect ready lie.

**Correctness risk:** Medium. The hard part is defining exactly which grant/free-operation action-selection frames belong to the origin candidate’s consequence chain.

**Performance/boundedness:** Must be capped separately from ordinary inner preview. Recommended cap classes:

* `postGrant16`: legacy/ack frames.  
* `grantFlow16` or `grantFlow32`: full grant/free-operation continuation budget.  
* Trace every cap class and exit.

Do not let the old 5% performance gate veto correctness. Measure it, bound it, then optimize.

**Trace/explanation quality:** High if trace includes:

* `outcomeGrantResolve`,  
* `grantOffered`,  
* `freeOperationActionSelection`,  
* selected `freeOperation` move,  
* inner choices,  
* `grantConsumed` / `grantSkipped` / `grantExpired`,  
* deferred effects released,  
* exit reason.

**Blast radius:** Medium to high. Touches preview runtime, evaluation summaries, trace schema/usage, WASM parity, and tests.

**Tests required:** Blocking engine fixture, FITL-like fixture, FITL witness, cap/determinism tests, TS/WASM parity.

**Unblocks ARVN:** Yes, after witness passes.

---

### **Option 3: Add honest partial/unavailable/depth-capped preview statuses for refs behind un-driven continuation**

**Verdict:** Required immediately, even if Option 2 takes longer.

**Foundation alignment:** Extremely strong for #20.

**Correctness risk:** Low to medium. It is safer to be conservative and return partial/unavailable than to return false-ready.

**Performance/boundedness:** No major performance risk.

**Trace/explanation quality:** High. This directly solves the “ready but semantically not ready” integrity problem.

**Blast radius:** Medium. Raw preview ref evaluation currently records numeric ready values when `previewOutcome === 'ready'`; this must not happen if the driver stopped at unresolved grant/free-operation obligations.

**Tests required:** Status propagation tests:

* stopped at unresolved pending grant → ref unavailable/partial;  
* postGrantCap stays distinct from ordinary depthCap;  
* turnShape sees partial;  
* ready-ref stats exclude partial refs.

**Unblocks ARVN:** Not alone. It prevents lying but does not give ARVN opponent-denial signal.

---

### **Option 4: Add focused effect projection**

**Verdict:** Later, with strict constraints.

A focused projection surface could compute action/outcome effects and victory deltas without driving the whole synthetic microturn chain. That is tempting because it may be faster and easier to audit.

But static effect declarations are dangerous. They drift. FITL event authoring is already complex: replacement, sourcing, posture, ordered grants, Monsoon overrides, deferred after-grant effects, and mutable selectors all matter.

Acceptable version:

* Projection must execute real kernel effects on a scoped cloned/draft state, or derive effect footprints from kernel execution.  
* It must never be a hand-authored FITL-specific declaration table.  
* It must emit the same status/provenance taxonomy as preview drive.  
* It must be tested for drift against full kernel execution.

**Unblocks ARVN:** Not as the first fix.

---

### **Option 5: Express opponent denial mainly through structured selectors/modules/turn-shape**

**Verdict:** Necessary for policy clarity; invalid as a substitute for preview integrity.

`arvn-evolved` already expresses opponent denial through `penalizeOpponentMargin`, `hurtCurrentLeader`, `reduceNearestThreat`, and `currentTurnImpact`.

That is the right authoring shape. But if the projected board state is wrong or incomplete, these modules are just cleaner wrappers around bad evidence.

**Unblocks ARVN:** Only after engine evidence is honest.

---

### **Option 6: Bootstrap structured baseline first, then evolve**

**Verdict:** Yes, but after engine proof.

The overhaul report is right that pure flat evolution produces weight soup and brittle policy.

But bootstrapping before preview integrity would bake in a broken signal surface. The correct order is:

1. preview integrity,  
2. structured baseline,  
3. quality-diversity evolution.

**Unblocks ARVN:** Yes, after Options 2 and 3.

---

## **8. Recommended path**

### **Step 1 — Immediate evidence/proof work**

Write the minimal failing engine fixture for grant/free-operation continuation. Do not touch ARVN first.

Expected current failure:

* preview continuation marks grant offered;  
* preview reports completed/ready;  
* granted operation effect has not executed;  
* opponent/victory delta remains unchanged.

This proves the real bug without FITL noise.

### **Step 2 — Integrity patch**

Add a conservative status fix:

* If preview exits with pending/offered grant obligations that were not driven to effect resolution, mark preview as `partial` or `unavailable`, not `ready`.  
* Distinguish `postGrantCap`, `freeOperationCap`, ordinary `depthCap`, `stochastic`, and `failed`.  
* Exclude partial refs from `readyRefStats`.

This is non-negotiable Foundation #20 work.

### **Step 3 — Generalized grant/free-operation continuation**

Extend preview drive to continue through grant-authorized free-operation action selection and inner choices under bounded deterministic policy.

Do it using generic kernel metadata:

* pending grants,  
* legal moves,  
* `move.freeOperation`,  
* grant authorization/consumption,  
* decision context kinds.

No FITL-specific engine branch.

### **Step 4 — Trace/provenance upgrade**

Trace must show:

candidate stableMoveKey  
root actionId  
preview mode  
completion policy  
grant continuation enabled/capClass/cap  
segments:  
 outcomeGrantResolve  
 grantOffered  
 freeOperationActionSelection  
 selectedFreeOperation  
 innerChoice  
 grantConsumed/grantSkipped/grantExpired  
 deferredEffectsReleased  
exitReason  
final status

### **Step 5 — FITL May-17-equivalent witness**

Only now run/build the ARVN witness. It must prove the user’s stated threshold:

* NVA/VC margin refs differentiate when effects should affect margins;  
* leader/nearest-threat refs differentiate when standings should change;  
* trace shows whether continuation ran and how it exited;  
* no ref is ready merely because the engine stopped too early.

### **Step 6 — Spec 183 cleanup**

Split/rewrite as described above. Remove the no-signal acceptance criterion as a May-17 proof.

### **Step 7 — ARVN profile lifecycle cleanup**

Replace obsolete baseline only after proof:

* promote a structured profile,  
* remove old baseline aliases,  
* update bindings,  
* record artifact identity/fingerprint,  
* resume evolution from the structured baseline.

### **Step 8 — Later performance work**

After correctness:

* measure preview runtime impact;  
* tune cap classes;  
* consider effect projection;  
* consider WASM acceleration for the new continuation path.

---

## **9. File-by-file change requirements**

### **`packages/engine/src/agents/policy-preview.ts`**

Requirements:

1. Rename or generalize `outcomeGrantContinuation` conceptually to grant-flow continuation. Avoid preserving obsolete compatibility if the config shape changes; Foundation #14 allows a clean rename.  
2. Continue not only through `outcomeGrantResolve`, but also through grant-authorized `freeOperation: true` action-selection frames that are consequences of the origin candidate.  
3. Use real kernel publication and application:  
   * publish microturn,  
   * choose deterministic legal grant move,  
   * apply trusted/free-operation move,  
   * continue inner choices if needed,  
   * stop at cap/stochastic/failure/non-origin decision.  
4. Add explicit result kinds:  
   * `completed`,  
   * `stochastic`,  
   * `depthCap`,  
   * `postGrantCap`,  
   * `freeOperationCap`,  
   * `grantFlowPartial`,  
   * `failed`.  
5. Do not finalize `ready` when pending/offered grant obligations remain unresolved and could affect post-candidate state.  
6. Preserve deterministic bounded behavior.

### **`packages/engine/src/agents/policy-runtime.ts`**

Requirements:

1. Pass new continuation config through providers.  
2. Expose richer trace/depth getters:  
   * grant continuation depth,  
   * free-operation continuation depth,  
   * cap class,  
   * exit reason,  
   * selected granted operation/free operation metadata.  
3. Keep provider API game-agnostic.

### **`packages/engine/src/agents/policy-eval.ts`**

Requirements:

1. Stop collapsing `postGrantCap` into `unknownDepthCap`; preserve cause.  
2. Add free-operation continuation usage summary.  
3. `readyRefStats` must exclude partial/unavailable/capped refs.  
4. `allReadyValuesUniform` must not trigger deepening or no-signal classification if refs are not genuinely ready.  
5. If WASM path cannot support the new statuses, force TS fallback and mark WASM unsupported for that candidate batch.

### **`packages/engine/src/agents/policy-evaluation-core.ts`**

Requirements:

1. `syncPreviewMetadata` must carry the richer status/exit taxonomy.  
2. `evaluatePreviewSurfaceRef` must not record numeric ready values from partial grant-flow states.  
3. Seat-matrix recording must include status per seat/ref if some role resolution is unavailable due to partial projection.

### **`packages/engine/src/agents/policy-surface.ts`**

Requirements:

1. Keep `victory.currentMargin.$seat`, `currentLeader`, and `nearestThreat` game-agnostic.  
2. Do not solve this by special-casing NVA/VC/ARVN.  
3. Add/propagate preview-status metadata where raw numeric refs are resolved against incomplete preview states.

### **`packages/engine/src/agents/turn-shape-eval.ts`**

Requirements:

1. Continue mapping capped/incomplete preview to `partial`.  
2. Add new grant/free-operation statuses.  
3. Ensure `currentPreviewDrive` cannot silently evaluate objectives against grant-offered-before-effect state.  
4. Surface fallback/demote behavior in trace.

### **`packages/engine/src/cnl/compile-agents.ts`**

Requirements:

1. If config is generalized, lower the new block and cap classes.  
2. Ensure cap values equal named cap-class budgets.  
3. Do not keep old aliases unless there is a deliberate migration policy; Foundation #14 favors clean replacement.

### **`packages/engine/src/cnl/validate-agents.ts`**

Requirements:

1. Validate new config shape and cap classes.  
2. Warn if a profile uses opponent-denial preview refs while grant-flow continuation is disabled or capped too shallow for configured witness requirements.  
3. Keep warnings advisory; engine status integrity is the blocker.

### **`packages/engine/src/kernel/microturn/*`**

Requirements:

1. No FITL-specific changes.  
2. Ensure published action-selection states expose enough metadata to identify grant-authorized `freeOperation: true` moves.  
3. If current publication hides needed grant metadata, add generic metadata to published legal actions.  
4. Keep decision-stack identity deterministic.

### **`packages/engine/src/kernel/legal-moves.ts`**

Requirements:

1. Preserve existing free-operation legality and authorization.  
2. Add helper APIs only if preview runtime currently has to duplicate grant-auth logic.  
3. Helpers should answer generic questions:  
   * is this move grant-authorized?  
   * which grant is canonical?  
   * is this grant required?  
   * would executing this move consume/advance a grant sequence?

### **`packages/engine/src/kernel/apply-move.ts`**

Requirements:

1. No special preview-only behavior.  
2. Preview must apply the same real move path as runtime.  
3. Ensure trace identifies grant consumption and post-resolution turn-flow behavior.

### **`packages/engine/src/agents/policy-wasm-preview-drive.ts`**

Requirements:

1. Add statuses/outcomes for `postGrantCap`, `freeOperationCap`, and `partial`, or force unsupported fallback when such continuation is needed.  
2. Add parity tests. Current WASM status set lacks these distinctions.  
3. Do not allow WASM to report `ready` where TS reports partial.

### **`data/games/fire-in-the-lake/92-agents.md`**

Requirements:

1. Do not promote `arvn-evolved` yet.  
2. After engine proof:  
   * replace obsolete `arvn-baseline` with a structured profile;  
   * update `bindings` to the promoted profile;  
   * remove obsolete profile references instead of preserving aliases.  
3. Keep opponent-denial refs, but only after the witness proves they are honest.

### **`specs/183-evolution-loop-overhaul.md`**

Requirements:

1. Rewrite or split.  
2. Remove “No engine changes.”  
3. Replace May-17 no-signal acceptance criterion.  
4. Move engine preview-integrity proof to a prerequisite spec.

### **`campaigns/`**

Requirements:

1. Document that ARVN evolution is paused until preview evidence passes.  
2. Add a campaign gate requiring the May-17-equivalent witness before ARVN profile promotion.  
3. Preserve artifact identity/fingerprint in campaign outputs.

### **Policy-profile-quality tests**

Requirements:

1. Separate engine correctness witnesses from profile-quality probes.  
2. Uniform ready refs should fail profile quality only after engine readiness is trusted.  
3. Add explanation assertions:  
   * self-gain,  
   * opponent denial,  
   * target quality,  
   * module activation,  
   * guardrail effect,  
   * turn-shape satisfaction,  
   * fallback/tiebreak.

---

## **10. Test plan**

### **Blocking engine correctness tests**

#### **1. Regular `outcomeGrantResolve` fixture**

File:

packages/engine/test/architecture/preview-post-grant/post-grant-continuation-differentiates.test.ts

Extend or complement existing test.

Assertions:

* opt-out stops at `ready`;  
* opt-in marks grant `offered`;  
* trace records `outcomeGrantResolve`;  
* cap class and depth appear in usage summary;  
* no claim is made that operation effects executed.

#### **2. Free-operation continuation fixture**

File:

packages/engine/test/architecture/preview-post-grant/post-grant-free-operation-continuation.test.ts

Fixture:

* root action creates pending free-operation grant;  
* granted operation modifies a global variable or victory-relevant surface;  
* `outcomeGrantResolve` only marks grant offered;  
* offered free operation executes the effect.

Expected current behavior:

* preview returns ready/completed too early, or returns unchanged value.

Expected fixed behavior:

* preview executes grant-authorized operation;  
* projected value changes;  
* trace includes grant flow;  
* unresolved grant flow is partial, not ready.

#### **3. FITL-like ordered grant fixture**

File:

packages/engine/test/architecture/preview-post-grant/fitl-like-ordered-free-operation-preview.test.ts

Fixture:

* card-driven turn flow;  
* ordered grants;  
* only first step active initially;  
* operation changes opponent margin surrogate;  
* optional after-grant effect.

Assertions:

* sequence is deterministic;  
* cap stops are explicit;  
* board/victory surrogate updates only after grant execution.

#### **4. Preview signal integrity tests**

File:

packages/engine/test/architecture/preview-signal-integrity/grant-flow-status.test.ts

Assertions:

* stopped-before-grant-effect → `partial` or `unavailable`;  
* `postGrantCap` distinct from `depthCap`;  
* `freeOperationCap` distinct from both;  
* `readyRefStats` excludes partial refs;  
* `allReadyValuesUniform` does not fire on partial refs.

#### **5. Trace/provenance tests**

File:

packages/engine/test/architecture/preview-trace/grant-flow-trace.test.ts

Assertions:

* trace shows cap class;  
* trace shows depth;  
* trace shows selected grant/free-operation action;  
* trace shows exit reason:  
  * completion,  
  * depth cap,  
  * post-grant cap,  
  * free-operation cap,  
  * stochastic,  
  * failure.

#### **6. TS/WASM parity tests**

File:

packages/engine/test/unit/agents/policy-wasm-preview-grant-flow-parity.test.ts

Assertions:

* WASM unsupported fallback when grant-flow continuation requires unsupported statuses;  
* TS and WASM agree on status where WASM supports the path;  
* no WASM row reports `ready` when TS reports partial.

#### **7. Determinism tests**

Assertions:

* repeated preview runs choose same grant/free-operation move;  
* same candidate stable key yields same trace;  
* RNG state unchanged except where stochastic handling is explicitly tolerated.

#### **8. Boundedness/cap-class tests**

Assertions:

* each cap class has a fixed budget;  
* cap exit is deterministic;  
* cap exit is surfaced as cap, not failure or ready.

### **Blocking FITL witness**

File:

packages/engine/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts

or a neighboring integration fixture.

Assertions:

* ARVN candidate set contains at least two candidates whose granted/free-operation effects should differ for NVA and/or VC margin.  
* `preview.victory.currentMargin.nva` and/or `.vc` differentiates.  
* `currentLeader` and `nearestThreat` role refs differentiate when expected.  
* Trace proves whether grant-flow continuation ran and where it exited.  
* If a candidate is partial/capped, its opponent refs are not counted as ready.  
* The selected action explanation identifies whether selection came from self-gain, opponent denial, target quality, module activation, guardrail, turn-shape, or fallback/tiebreak.

### **Non-blocking profile-quality witnesses**

After engine proof:

* uniform opponent refs can become profile-quality warnings/failures;  
* no-signal penalties can be reintroduced as profile diagnostics;  
* campaign fitness can include opponent-denial reward only when the relevant preview statuses are ready.

---

## **11. Research synthesis**

Utility AI is a good scoring substrate, but it naturally pushes behavior into numeric formulas over many action attributes; the repo’s “weight soup” diagnosis matches the known shape of utility systems, where actions are rated by formulas/scores and the highest utility wins. The repo decision: keep utility scoring, but stop treating a flat list of weights as the primary authored policy structure. Use selectors/modules/guardrails/turn-shape to name intent and make traces auditable.

Behavior trees are useful here as an authoring metaphor, not as a runtime replacement. The relevant research value is modularity, hierarchy, and reactivity; that maps directly to structured selectors and strategy modules, with guardrails acting like safety gates. The repo decision: keep the existing structured layer and make it evolvable, but do not hide broken preview evidence behind it.

HTN planning is also a useful decomposition metaphor: high-level tasks decompose into subtasks until executable actions. The repo decision: use HTN-like structure for profile authoring and evolution descriptors, not as an unbounded runtime planner inside action selection.

GOAP’s appeal is runtime planning over goals/actions, but that is precisely why it is a poor fit for this production selection loop unless heavily bounded. The repo foundations require deterministic bounded computation and auditability; therefore GOAP belongs in the “do not adopt as runtime planner” bucket.

MAP-Elites is highly relevant because it archives high-performing solutions across chosen behavior dimensions rather than returning one champion. The repo decision: evolve ARVN across descriptors such as opponent-denial intensity, pacification bias, training bias, resource-engine bias, and grant-flow reliance; do not collapse evolution into one opaque winner.

OpenSpiel and Ludii reinforce the engine-agnostic direction. OpenSpiel frames game AI around general game environments and algorithms; Ludii’s game-description research emphasizes representing broad classes of games in a common language. The repo decision: no FITL/ARVN-specific preview engine logic; preview must follow kernel-authored rules and generic grant/free-operation mechanics.

MCTS and rollout-style planning are useful in game AI, but surveys emphasize search, sampling, and often domain-specific modification for complex games. The repo decision: do not introduce unbounded rollout planning for ARVN action selection. Bounded advisory preview is fine; unbounded planning violates the repo’s determinism/boundedness foundations.

Game AI testing research supports agent/test-goal approaches and synthetic playtesters to expose defects, not just optimize win rate. The repo decision: add scenario/probe corpora as first-class proof artifacts: engine fixtures, FITL-like grant fixtures, May-17-equivalent ARVN probes, and campaign gates.

---

## **12. Risks and non-goals**

### **Risks**

1. **Generalized grant-flow continuation can become too broad.**  
    It must not start playing future turns or opponent choices outside the origin candidate’s consequence chain.  
2. **Performance regression is real.**  
    But correctness comes first. Bound it with cap classes; measure after proof.  
3. **Trace schema churn.**  
    Worth it. A vague trace is useless for this failure mode.  
4. **WASM divergence.**  
    The current WASM preview status model lacks post-grant/free-operation distinctions. Either update ABI or force TS fallback.  
5. **Profile churn.**  
    Renaming/removing baseline profiles will disrupt scripts. Foundation #14 says that is acceptable when the old path is obsolete.  
6. **False confidence from the current post-grant test.**  
    The existing test is useful but too shallow. Treating it as proof would be a serious mistake.

### **Non-goals**

Explicitly reject:

* Game-specific ARVN/FITL engine logic.  
* Unbounded runtime planning.  
* Hiding broken preview behind selectors/modules/turn-shape.  
* Static effect declarations as authoritative substitutes for kernel effects.  
* Continuing ARVN evolution against dishonest/no-op preview surfaces.  
* Preserving obsolete profile aliases merely because names already exist.  
* Reclassifying an engine preview-integrity gap as a profile-quality no-signal problem.

---

## **13. Final decision checklist**

* Freeze ARVN evolution until preview integrity proof passes.  
* Add a minimal failing engine fixture for post-grant free-operation continuation.  
* Add honest partial/unavailable/cap statuses for unresolved grant-flow preview states.  
* Generalize `outcomeGrantContinuation` into bounded grant/free-operation continuation.  
* Ensure continuation executes real kernel legal moves and real kernel effects.  
* Add trace segments for grant offer, free-operation action selection, inner choices, grant consumption, deferred effects, cap, and exit reason.  
* Preserve distinct `postGrantCap`, `freeOperationCap`, and ordinary `depthCap`.  
* Update `readyRefStats`, `allReadyValuesUniform`, and preview usage summaries so partial refs cannot masquerade as ready-uniform.  
* Add TS/WASM parity or TS fallback for grant-flow preview paths.  
* Build a May-17-equivalent FITL ARVN witness.  
* Require NVA/VC margin and standing-role differentiation when candidate effects should cause it.  
* Rewrite/split Spec 183; remove the May-17 no-signal acceptance criterion.  
* Keep `arvn-evolved` quarantined until the witness passes.  
* After proof, replace obsolete `arvn-baseline` with a structured production ARVN profile.  
* Remove obsolete aliases/references in the same promotion change.  
* Resume evolution from the structured baseline using scenario probes and quality-diversity descriptors.
