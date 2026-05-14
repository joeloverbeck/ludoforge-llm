> **Superseded — 2026-05-14.** This external deep-research proposal recommended shipping a broader "Spec 172-R" in place of Spec 172. It was reassessed against the actual codebase (it was authored without repo access). Its central architectural recommendation reinvents the already-existing `GameDefRuntime` runtime-resources owner, and Phases 2/4/5/6 are speculative scope inflation or duplicate existing infrastructure. The valid points (mandate runtime-owned caching, add a constructor-invariant regression guard, cache `buildEncodedState`, witness-first TDD ordering) were folded into an **in-place revision of `specs/172-policy-eval-static-structure-caching.md`**; no separate `172-R` artifact was created. See that spec's **§11 "Reassessment of source proposal"** for the per-recommendation dispositions. This report is retained unmodified below as the historical input to that reassessment.

---

## **Verdict**

Spec 172 is **directionally correct but too narrow**. I would not ship it as “three localized caches” and call the problem solved. The incident exposed a larger architectural seam: policy evaluation has no durable, shared **runtime artifact owner**. As a result, each `PolicyEvaluationContext` is allowed to rebuild static, semi-static, and state-derived structures opportunistically. That is exactly the pattern that will keep biting you as agent profiles evolve.

The fresh proposal should be: **replace ad hoc per-context construction with a `PolicyEvaluationRuntime` / `PolicyRuntimeResources` layer that owns all derived artifacts, separates static from state-dependent caches, exposes deterministic preview work accounting, and adds large-board profile witnesses.** Spec 172 becomes Phase 1 of that larger fix, not the whole fix.

This aligns with FOUNDATIONS.md: the engine must remain game-agnostic, YAML remains the evolution unit, all clients use the same protocol, specs remain data not code, determinism is non-negotiable, bounded computation must be explicit, and architectural properties must be proven by tests.

---

## **What the incident really proves**

The FITL report rules out the obvious wrong explanations. Cube-heavy play itself is not the core problem: with deep preview stripped, seed 1013 finishes in about 5.1 seconds, while the same cube-heavy seed with `preview.inner` enabled fails to finish after 15 minutes. The slow path is overwhelmingly TypeScript-side policy preview work, not WASM, and the profile shows derived-structure construction dominating actual game move enumeration.

The root cause is not just “missing cache A/B/C.” It is that `scoreMicroturnOptionWithContributions` constructs a fresh `PolicyEvaluationContext`, the context constructor can rebuild `encodedStateLayout`, and the per-instance bytecode cache starts empty, causing repeated bytecode recompilation and repeated `buildFeatureTable` scans.

That matters architecturally because the evolved policy selected the strategically sensible `arvn-cubes` Train option, but the system made that policy practically unrepresentable when combined with deep preview. The report is right: this is an implementation inefficiency constraining agent-policy evolution, not a game-rule complexity limit.

---

## **Research takeaways**

General game systems that work well do **not** reason from raw descriptions from scratch at every query. Ludii’s published design frames its advantage around high-level reusable game concepts and efficiency, and reports outperforming a strong GDL propositional-network reasoner across the Tiltyard repository. Regular Boardgames explicitly targets efficient reasoning for complex large-branching board games. The newer Regular Games work makes the same point even harder: keep a universal formalism, but compile/hydrate it into a low-level representation designed for automatic processing, optimization, and fast forward models.

OpenSpiel is not the same product category as LudoForge, but it is useful as a reference point: broad game support and broad algorithm support are paired with common terminology, evaluation tools, and metrics. That argues for making policy-preview performance and signal quality first-class measured outputs, not hidden side effects.

For hidden-information and stochastic games, GDL-II’s lesson is relevant: arbitrary finite games with randomness and incomplete state knowledge can be formalized, but the engine must be disciplined about what each player knows. This reinforces FOUNDATIONS.md’s observer-view rule and preview signal integrity rule: preview evidence must carry observer scope, resolution status, budget outcome, and fallback path; unavailable preview refs must not be silently coerced into numeric signal.

Deep preview is a search/rollout procedure. The MCTS literature treats bounded simulation/search as a central technique, and UCT was introduced to guide Monte Carlo planning in large state spaces. Search systems also routinely use transposition tables to avoid re-searching the same position reached through different move sequences. That does **not** mean LudoForge should bolt on chess-engine tables blindly, but it does mean preview state/result memoization is a normal, principled next layer after static artifact caching.

The database/incremental-computation analogy is also strong: materialized views precompute derived data to make repeated complex queries faster, while differential dataflow automatically updates outputs when inputs change. LudoForge should adopt the concept, not the tech stack: derived views over `GameDef` and `GameState` should be materialized once at the right lifetime, reused, and treated as non-authoritative accelerators.

---

# **Fresh proposal: Spec 172-R — Policy Evaluation Runtime and Preview Work Integrity**

## **Objective**

Create a shared, game-agnostic `PolicyEvaluationRuntime` that owns policy-evaluation derived artifacts across all `PolicyEvaluationContext` instances for a given `GameDefRuntime`. A `PolicyEvaluationContext` becomes a cheap immutable view over:

`{ defRuntime, policyRuntime, state, observerScope, seatId, playerId, completion/preview inputs }`

It must not directly build static structures. It may request derived views from `policyRuntime`, which decides whether to return a cached artifact, build it once, or produce a deterministic budget/status outcome.

The core rule: **context construction must be cheap, deterministic, and non-authoritative. All expensive derived artifacts have an explicit owner and lifetime.**

---

## **Phase 0 — Add failing witnesses before changing implementation**

Do not start by adding caches. Start by proving the bug in a way that cannot be missed again.

Add a large-board / cube-heavy preview witness based on the existing reproduction: `arvn-cubes`, deep `preview.inner`, seed 1013, `--max-turns 200`. The current witness suite is too early-game and too small-board; the report explicitly says the existing `--maxTurns 10` style witness never reaches the regime where this seam dominates.

Acceptance:

1. Pre-fix witness either times out or exceeds a deterministic work threshold.
2. Post-fix witness completes.
3. The witness records:
   * logical preview nodes visited,
   * policy contexts constructed,
   * static layout builds,
   * feature table builds,
   * bytecode compiles,
   * encoded-state builds,
   * preview unavailable / depth-capped / work-capped counts,
   * wall-clock as diagnostic only, not as semantic evidence.

Add one synthetic game-agnostic high-token policy-preview witness too. FITL should remain the regression case, but a generated generic high-token GameDef protects engine agnosticism.

---

## **Phase 1 — Replace Spec 172’s ad hoc caches with a runtime-owned static artifact registry**

Spec 172’s three caches are correct, but the ownership should change. Avoid module-level WeakMaps as the main design. They are easy, but they make cache lifetime and test isolation murky. Put the caches under `GameDefRuntime` or a sibling `PolicyRuntimeResources` object.

Recommended shape:

interface PolicyRuntimeResources {

 readonly def: GameDef;

 readonly encodedStateLayout: EncodedStateLayout;

 readonly featureTable: PolicyFeatureTable;

 readonly bytecodeByExpr: WeakMap<CompiledPolicyExpr, PolicyBytecode>;

 readonly profilePlansByProfileId: Map<PolicyProfileId, PolicyProfilePlan>;

}

Construction:

function getPolicyRuntimeResources(defRuntime: GameDefRuntime): PolicyRuntimeResources {

 // One owner. One creation path. No direct static build calls inside contexts.

}

Rules:

1. `PolicyEvaluationContext` constructor must never call `buildEncodedStateLayout`.
2. `compilePolicyBytecode` must not rebuild the full feature table per expression.
3. `buildFeatureTable` should remain available only as a fresh-builder test oracle or internal implementation detail.
4. The cache key must include `EncodedStateLayout` identity or a layout version, not just `GameDef`, unless the runtime guarantees exactly one layout per `GameDefRuntime`.
5. Artifacts are frozen. If not frozen today, freeze them or treat mutation as a test failure.

This is a stricter version of Spec 172. Spec 172 already identifies the three structures and proposes caching them across `PolicyEvaluationContext` instances. It also prefers routing layout resolution through a shared accessor and suggests feature-table and bytecode caches. The amendment is: **make runtime ownership mandatory, not optional.**

Acceptance:

* Constructing two `PolicyEvaluationContext`s for the same `GameDefRuntime` observes the same `encodedStateLayout`.
* Repeated evaluation of the same consideration across contexts compiles bytecode once.
* `buildFeatureTable` happens once per `GameDefRuntime` / layout, not once per consideration.
* Replay identity and Zobrist parity remain byte-identical.
* Static cache hit/miss telemetry is not part of authoritative replay.

---

## **Phase 2 — Promote policy profiles into compiled `PolicyProfilePlan`s**

The current design appears to compile/evaluate at the consideration-expression level. That is too granular for evolved policies. A policy profile should hydrate once into a plan:

interface PolicyProfilePlan {

 readonly profileId: PolicyProfileId;

 readonly profileHash: string;

 readonly considerations: readonly CompiledConsiderationPlan[];

 readonly previewRefs: readonly PreviewRefPlan[];

 readonly requiredObserverScope: ObserverScope;

 readonly usesExactWorldPreview: boolean;

 readonly staticCostEstimate: PolicyStaticCostEstimate;

}

Each `CompiledConsiderationPlan` should point to precompiled bytecode, dependency metadata, fallback behavior for preview refs, and the scope where it can run.

This gives you three wins:

1. Evolution can mutate YAML freely, but runtime sees a stable compiled policy plan.
2. Static policy errors and unsupported preview combinations can be detected before long tournaments.
3. Profile-quality regressions can be reported as profile-quality signals, not mixed into determinism tests, matching the FOUNDATIONS appendix distinction between engine determinism and profile quality.

Do **not** serialize this plan into GameSpec YAML. It is runtime-hydrated from compiled GameDef/profile data. That keeps “specs are data, not code” intact.

---

## **Phase 3 — Add safe state-derived projection caching**

Spec 172 explicitly avoids caching `buildEncodedState(state, layout)` because it is state-dependent. That is too conservative for the long term. It is correct not to cache it as a static artifact, but it should still be cached at the correct lifetime.

Use two tiers:

interface PolicyStateProjectionCache {

 readonly byObject: WeakMap<GameState, EncodedState>;

 readonly byObserver?: WeakMap<GameState, Map<ObserverScopeKey, ObserverProjection>>;

}

Rules:

1. `WeakMap<GameState, EncodedState>` is safe because GameState is immutable by contract. FOUNDATIONS.md requires all state transitions to return new objects and forbids mutation of caller-visible state.
2. Do not key semantic decisions by Zobrist alone. Zobrist/hash values can be diagnostics or accelerators; canonical serialized state remains the source of equality under FOUNDATIONS.md.
3. If you add logical-state transposition beyond object identity, use a collision-safe key:
   * canonical serialized state, or
   * `(zobrist, canonicalStateDigest, equality guard)` where the guard verifies canonical identity before reuse.
4. Include observer scope in any projection that can hide information.
5. Cache eviction must never change policy outcome. If preview budget outcomes depend on cache warmth, the design is wrong.

This phase attacks the remaining top self-time after static caching. In the report, `buildEncodedState` itself is the single largest named function in the slow profile. Static caching removes the stupidest repeated work; projection caching removes the next stupidest repeated work.

---

## **Phase 4 — Add preview-result memoization / transposition cache**

Once static and projection caching are stable, add a preview memo for repeated search states.

Key shape:

interface PreviewMemoKey {

 readonly gameDefHash: string;

 readonly profileHash: string;

 readonly stateKey: CanonicalStateKey;

 readonly seatId: SeatId;

 readonly observerScope: ObserverScopeKey;

 readonly rngStateKey: string;

 readonly requestedRefsKey: string;

 readonly previewBudgetKey: string;

 readonly exactWorldMode: boolean;

}

Value shape:

interface PreviewMemoValue {

 readonly status: "ready" | "hidden" | "stochastic" | "unresolved" | "depthCapped" | "workCapped" | "partial" | "failed";

 readonly contributions: readonly PolicyContribution[];

 readonly previewRefs: readonly PreviewRefTrace[];

 readonly budgetTrace: PreviewBudgetTrace;

}

Rules:

1. Memoization is per preview drive or per game simulation, not global across experiments unless identity is fully explicit.
2. Observer scope and hidden-information mode are mandatory key fields.
3. RNG state is mandatory for stochastic preview.
4. A memo hit must return the exact same trace semantics as a fresh evaluation.
5. Cache hits must not suppress required `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory behavior. The cached value must include the same unavailable-signal semantics.

This is where search practice applies. Transposition tables exist because game search reaches the same positions by different sequences and can reuse prior search results. But LudoForge must be stricter than chess engines: hidden information, stochasticity, observer scope, and preview provenance must be part of the key because FOUNDATIONS.md makes observer views and preview signal provenance semantic.

---

## **Phase 5 — Deterministic preview work accounting**

Depth caps and option caps are necessary but not sufficient. The incident proves that a bounded tree can still be infeasible if every node rebuilds large derived structures. The report says exactly that: the preview tree is bounded, but the per-unit constant factor scales with board state size.

Add deterministic logical work counters to the preview runtime:

interface PreviewWorkBudget {

 readonly capClass: "standard256" | "deep1024" | string;

 readonly maxPreviewNodes: number;

 readonly maxStateProjections: number;

 readonly maxPolicyEvaluations: number;

 readonly maxSyntheticApplications: number;

 readonly maxCanonicalizations: number;

 readonly maxPreviewRefResolutions: number;

}

Important: these counters must count **logical requests**, not cache misses. A warm cache must not allow deeper semantic preview than a cold cache, because cache warmth would then change agent decisions.

When a budget is exceeded, the result is not a numeric zero. It is a preview status such as `workCapped` / `partial`, with explicit fallback behavior according to profile YAML. That is the natural extension of Foundation #20’s “unavailable preview refs are not silently numeric” rule.

This phase may require a small Foundation #20 amendment if `workCapped` is not already represented distinctly enough. I would make that amendment rather than overloading `depthCapped`.

---

## **Phase 6 — Agent-evolution guardrails**

The evolution loop needs to stop treating speed failures as mysterious runtime accidents. Add policy-profile quality metrics that are evaluated every time a profile mutates:

policyQuality:

 previewWork:

   maxMedianPreviewNodesPerDecision: ...

   maxP95PolicyEvaluationsPerDecision: ...

   maxPreviewUnavailableRate: ...

   maxWorkCappedRate: ...

 signal:

   maxTiebreakAfterPreviewNoSignalRate: ...

   requireFallbackTraceForUnavailableRefs: true

These should live as profile-quality witnesses, not determinism blockers, unless they expose an engine invariant failure. FOUNDATIONS.md already makes that distinction.

For the ARVN campaign specifically, the regression suite should include:

1. Baseline `rangers` profile.
2. `preferArvnCubesTrainChoice` profile.
3. Deep preview with `inner` enabled.
4. Shallow preview control.
5. Seed 1013.
6. At least one additional seed where cube counts grow high but game terminates.

The acceptance target should not be “approaches shallow-preview 5.1s exactly.” Deep preview does real work. The target should be: seed 1013 completes, static rebuild counts drop to first-touch, preview statuses remain semantically valid, and policy choice quality is no longer constrained by pathological runtime.

---

## **Phase 7 — WASM later, not now**

Do not make WASM support the remediation. The report shows the slow path is TS because the WASM route fails closed for the complex preview config. Spec 172 correctly keeps WASM preview-drive expansion out of scope.

After Phases 1–6, add WASM support only if:

1. TS and WASM produce byte-identical policy rows and preview statuses.
2. Unsupported WASM paths fall back to the same `PolicyEvaluationRuntime`, not a separate logic path.
3. WASM is a performance backend, never a semantics owner.

That preserves the one-rules-protocol principle.

---

## **Concrete changes to Spec 172**

I would amend Spec 172 as follows.

First, replace “module-level WeakMap is acceptable” with: **the preferred and default implementation is runtime-owned caches under `GameDefRuntime` / `PolicyRuntimeResources`; module-level WeakMaps are permitted only for pure static implementation internals that are invisible to replay, preview status, and performance witnesses.** Spec 172 currently presents module-level and runtime-owned bytecode caches as alternatives. I would remove that ambiguity.

Second, add a mandatory constructor invariant: **`PolicyEvaluationContext` may not directly import or call static artifact builders.** The construction path must receive or resolve a `PolicyRuntimeResources` object. This prevents future construction sites from bypassing the cache again.

Third, make feature-table keying defensive: **key by `(GameDefRuntime, EncodedStateLayout identity/layoutVersion)`, not bare `GameDef`, unless a test proves exactly one layout per runtime.**

Fourth, add state projection caching as a follow-up phase, not an out-of-scope footnote. Spec 172 says no cache for `buildEncodedState(state, layout)` because it is state-dependent. That is fine for Phase 1, but the top profile entry is still `buildEncodedState`; leaving it unaddressed is not architecturally complete.

Fifth, upgrade the perf witness from “large-board FITL case” to “large-board FITL + synthetic game-agnostic high-token case + deterministic logical work counters.” Spec 172 already asks for a large-board/cube-heavy witness. Keep that, but make it harder to regress.

---

## **Acceptance criteria**

This proposal is complete when the following are true:

1. `PolicyEvaluationContext` construction performs zero static layout builds, zero feature-table builds, and zero bytecode compiles after first-touch.
2. `buildFeatureTable` and fresh bytecode compilation remain available as test oracles, not normal per-context operations.
3. `buildEncodedState` is cached at least by immutable `GameState` object identity.
4. Preview-result memoization is either implemented or explicitly deferred behind a ticket with key-shape requirements covering observer scope, RNG state, requested refs, and budget.
5. Cache warmth cannot change preview depth, preview status, selected action, or trace semantics.
6. Deep-preview `arvn-cubes` seed 1013 completes.
7. The shallow-preview control still completes and still produces behaviorally equivalent kernel semantics.
8. Replay identity, Zobrist parity, policy-bytecode equivalence, and FITL rule integration tests pass byte-identically.
9. The new high-token witness proves the fix is engine-generic, not a FITL-specific patch.
10. Profile-quality CI reports preview work and preview signal availability separately from engine determinism failures.

---

## **Strong recommendation**

Ship **Spec 172-R**, not Spec 172 as written.

Spec 172’s three caches are the right first patch, but the best solution is the runtime-resource architecture around them. Otherwise the next agent-evolution campaign will find the next context-local rebuild seam, and you will write Spec 180 for the same class of bug. The real invariant should be:

A policy evaluation context is a cheap observer-scoped view. All derived artifacts are owned by deterministic runtime resources with explicit lifetime, purity tests, and preview work accounting.

That is the design that fits LudoForge’s foundations and the broader GGP/search literature.

