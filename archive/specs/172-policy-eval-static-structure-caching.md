# Spec 172 — Runtime-Owned Caching of Static/Derived Structures in the Policy-Evaluation Preview Path

**Status**: COMPLETED
**Priority**: High — unblocks the `fitl-arvn-agent-evolution` campaign, which is paused per `reports/fitl-arvn-policy-eval-context-rebuild-scaling-2026-05-14.md`. A deep continued-deepening preview combined with realistic cube-heavy ARVN play is currently infeasible to simulate (one FITL seed: >15 min, never completes) purely because the policy-evaluation preview path rebuilds static structures per microturn-option evaluation.
**Complexity**: S–M — four localized caching/threading changes plus one regression-guard test, all pure-perf (no kernel semantics change), gated by existing determinism tests. No new types beyond two `GameDefRuntime` cache fields, no schema changes, no new ref families.
**Date**: 2026-05-14
**Predecessors**: `archive/tickets/POLPREVDRIVE-001.md`…`POLPREVDRIVE-007.md` — a completed ticket series that cached two other rebuild seams in the same preview path (`buildTokenStateIndex`, `resolveRef`). This spec covers the residual rebuild seams of the same class that that series did not reach.
**Trigger report**: `reports/fitl-arvn-policy-eval-context-rebuild-scaling-2026-05-14.md` — establishes the empirical evidence (CPU profile: 87.7% TS-engine self-time, ~30% in `build*` functions; per-seed timings; the 5.1 s shallow-preview isolation control) and the code trace.
**Reassessment basis**: This spec **supersedes the prior PROPOSED Spec 172** ("Cache Static/Derived Structures Across `PolicyEvaluationContext` Instances"), overwritten in place — the original had no in-flight tickets and was never decomposed, so git history is the only retention needed. The revision was driven by an external deep-research critique (`reports/spec-172-remediation.md`, "Spec 172-R"). That critique's codebase claims were reassessed against the actual engine; the valid points are folded in here and the speculative ones are rejected with rationale (see §11).

---

## 1. Goal

The synthetic-completion preview drive (`policy-preview.ts` `driveSyntheticCompletion`) evaluates many inner microturn options. **Each inner microturn-option evaluation constructs a fresh `PolicyEvaluationContext`**, and that construction currently rebuilds four structures that are either static for the life of a `GameDef` or pure functions of static-plus-state inputs that are reused across sibling option evaluations:

1. **`encodedStateLayout`** — pure function of `GameDef`; rebuilt per `PolicyEvaluationContext` because the constructor calls `buildEncodedStateLayout(input.def)` directly instead of consulting the existing per-`GameDef` `WeakMap` cache.
2. **`featureTable`** — `buildFeatureTable(def, layout)` is a pure function of `(GameDef, EncodedStateLayout)` that full-scans every compiled policy expression; it has **no cache** and is rebuilt inside every `compilePolicyBytecode` call.
3. **Compiled per-consideration bytecode** — `PolicyEvaluationContext.compiledExprBytecodeCache` is a per-*instance* `WeakMap`, so it is empty on every construction and every consideration's bytecode is recompiled per microturn-option evaluation.
4. **`encodedState`** — `buildEncodedState(state, layout)` is rebuilt per `PolicyEvaluationContext` construction. It is the single largest named function in the slow profile (`buildEncodedState` 6.62% self-time, the #1 entry). It is genuinely state-dependent, but the sibling option evaluations at one microturn node share the *same* `GameState` object, so the rebuild is redundant within a drive node.

Every one of these structures iterates over board tokens, so their per-rebuild cost scales with board token count. Under cube-heavy play the token count climbs and the rebuilds dominate runtime (the trigger report's profile: only ~3% of self-time is actual game move-enumeration).

This spec makes all four cache or thread their derived results across `PolicyEvaluationContext` instances. The three static structures (1–3) are owned by a deterministic runtime owner, not opportunistically rebuilt in the context constructor; the state-derived structure (4) is memoized for the lifetime of a run, keyed by immutable-`GameState` object identity. A constructor invariant plus an architectural-invariant test guard the fix against silent regression by future construction-site edits. The drive's bounded *tree* (`depthCap`, `maxOptions`, `capClass`) is unchanged; only the per-node constant factor shrinks.

After this spec lands, a deep preview can be combined with realistic high-token-count play (e.g. FITL ARVN Train placing cubes) without the simulation becoming infeasible — i.e. the inefficiency no longer constrains which agent policies are representable (Foundation #10).

## 2. Context (verified against the codebase)

### 2.1 The deep preview constructs a `PolicyEvaluationContext` per microturn-option

`packages/engine/src/agents/microturn-option-eval.ts:113` — `scoreMicroturnOptionWithContributions` constructs `new PolicyEvaluationContext({ def, state, playerId, seatId, catalog, parameterValues, trustedMoveIndex, completion, … runtime? }, [])`. The input object has **no `encodedStateLayout` and no `encodedState` field** threaded in. `driveSyntheticCompletion` (`policy-preview.ts:864`) with `strategy: continuedDeepening`, `depthCap: 16`, `maxOptions: 8` invokes this many times per previewed candidate.

### 2.2 The constructor rebuilds the static encoded-state layout

`packages/engine/src/agents/policy-evaluation-core.ts:369-392` — `PolicyEvaluationContext` constructor:

```ts
this.encodedStateLayout = input.encodedStateLayout ?? buildEncodedStateLayout(input.def);
this.encodedState = input.encodedState ?? tryBuildEncodedState(input.state, this.encodedStateLayout);
```

`buildEncodedStateLayout(def)` (`packages/engine/src/kernel/encoded-state/layout.ts:66`) is a pure function of the `GameDef`. `packages/engine/src/agents/policy-eval.ts:68,320` already maintains `encodedStateLayoutCache = new WeakMap<GameDef, …>()` with the accessor `getPolicyEncodedStateLayout(def)` — but the `PolicyEvaluationContext` constructor does not use it, and the `microturn-option-eval.ts` construction site does not thread a pre-built layout in. So every inner microturn-option evaluation rebuilds the layout from scratch.

### 2.3 `buildFeatureTable` is uncached and full-scans the GameDef per bytecode compile

`packages/engine/src/agents/policy-evaluation-core.ts:928-936` — `evaluateCompiledExprWithVm`:

```ts
let bytecode = this.compiledExprBytecodeCache.get(expr);
if (bytecode === undefined) {
  bytecode = compilePolicyBytecode(expr, this.input.def, this.encodedStateLayout);
  this.compiledExprBytecodeCache.set(expr, bytecode);
}
```

`compiledExprBytecodeCache` (`policy-evaluation-core.ts:354`) is `private readonly … = new WeakMap<…>()` — an **instance field**, empty on every construction. `compilePolicyBytecode` (`packages/engine/src/cnl/policy-bytecode/compile.ts:37`) calls `buildExpressionFeatureTable(def, layout, expr)` (`compile.ts:43`), which calls `buildFeatureTable(def, layout)` (`compile.ts:64`). `buildFeatureTable` (`packages/engine/src/cnl/policy-bytecode/feature-table.ts:156`) is a pure function of `(def, layout)` that does `forEachCompiledPolicyExpr(def, …)` (`feature-table.ts:165`) — a full scan of every compiled policy expression in the GameDef — and has **no cache**. So for D microturn-option evaluations × C considerations, the full GameDef-wide feature table is rebuilt D×C times, identically each time. `buildFeatureTable` returns `Object.freeze`d output (`feature-table.ts:174-176`), so a cached instance is safely immutable.

### 2.4 `GameDefRuntime` already exists as the deterministic runtime-resources owner

`packages/engine/src/kernel/gamedef-runtime.ts` defines `GameDefRuntime` — the engine's established owner for derived runtime artifacts. It already holds eight-plus caches/indexes (`adjacencyGraph`, `runtimeTableIndex`, `alwaysCompleteActionIds`, `ruleCardCache`, `publicationProbeCache`, `tokenStateIndexCache`, `policyWasmBytecodeInputCache`, `compiledQueryPlanCache`, `scheduleIndex`, …), each annotated with an explicit ownership class — **`sharedStructural`** (pure function of `GameDef`, never reset) or **`runLocal`** (reset per run). `createGameDefRuntime(def)` builds it; `forkGameDefRuntimeForRun(runtime)` forks a per-run instance, resetting only the `runLocal` members. `packages/engine/src/kernel/eval-runtime-resources-contract.ts` enforces a strict allowed-key contract on the eval-time resource subset. **The "shared runtime artifact owner" does not need to be invented — it exists and is mature.** This spec adds two fields to it rather than introducing a parallel layer.

### 2.5 The `GameDefRuntime` is already threaded into `PolicyEvaluationContext`

`PolicyEvaluationContext`'s input type already declares `readonly runtime?: GameDefRuntime` (`policy-evaluation-core.ts:169`) and `readonly encodedStateLayout?: EncodedStateLayout` (`:170`). The `microturn-option-eval.ts:113` construction site **already passes `runtime`** (`...(runtime === undefined ? {} : { runtime })`). The plumbing is in place; only the constructor *body* (`:375`) ignores `input.runtime` and calls `buildEncodedStateLayout` directly. The fix is to make the constructor *use* what it already receives, not to add new plumbing.

### 2.6 `buildEncodedState` is the #1 profile entry and is rebuilt per construction

`policy-evaluation-core.ts:376` — `this.encodedState = input.encodedState ?? tryBuildEncodedState(input.state, this.encodedStateLayout)`. `buildEncodedState` (`kernel/encoded-state/view.ts`) is the single largest named self-time function in the trigger report's profile (6.62%, 1613 ms). It is genuinely state-dependent and cannot be a `sharedStructural` artifact — but within one preview-drive microturn node, the sibling option evaluations are scored against the *same* `GameState` object (the option differs, not the state). So the rebuild is redundant across siblings, and the `POLPREVDRIVE` series' state-dependent caches (`tokenStateIndexCache`, `resolveRefCache`) only partially relieve it. The prior Spec 172 deferred this as out of scope; that left the largest profile entry unaddressed (Foundation #15).

### 2.7 The WASM preview-drive route does not relieve this

`packages/engine/src/agents/policy-wasm-score-routing.ts` "fails closed → `unsupported`" for complex preview configs (the `arvn-evolved` profile's `continuedDeepening`/`deep1024` `inner` config). The CPU profile in the trigger report confirms 0.9% WASM self-time — the deep preview runs entirely through the TS `driveSyntheticCompletion` path. Extending the WASM route to cover complex previews is a much larger, separate effort and is **out of scope** here (§9).

### 2.8 These are pure-perf changes — determinism is the load-bearing invariant

None of the four structures' *contents* change; only *when and how often they are built* changes. The cached/threaded result must be byte-identical to the freshly-built result. The existing replay-identity and Zobrist-parity tests are the gates (Foundation #8).

## 3. Non-goals

- **No change to the preview drive's bounds.** `depthCap`, `maxOptions`, `chooseNBeamWidth`, `capClass` are unchanged. This spec does not retune `continuedDeepening`.
- **No WASM preview-drive coverage extension.** The WASM route continuing to fail-closed for complex previews is unchanged (§2.7, §9).
- **No semantics change.** Foundation #8: replay identity and Zobrist parity must be byte-identical before and after. Cache warmth must not change any selected action, preview status, trace content, or score.
- **No new preview-evaluation subsystem.** This spec does **not** adopt `reports/spec-172-remediation.md`'s `PolicyProfilePlan` (Phase 2), preview-result transposition memo (Phase 4), `PreviewWorkBudget` logical-work accounting (Phase 5), or the proposed `workCapped` Foundation #20 amendment. Those are not justified by the incident, and two of them partly duplicate existing infrastructure (see §9, §11).

## 4. Architecture

### 4.1 Encoded-state layout — use the existing per-`GameDef` accessor

`PolicyEvaluationContext`'s constructor resolves the layout through the existing per-`GameDef` `WeakMap` accessor `getPolicyEncodedStateLayout(input.def)` rather than calling `buildEncodedStateLayout(input.def)` directly. `input.encodedStateLayout`, when supplied, still wins. The accessor is moved to (or re-exported from) a location both `policy-eval.ts` and `policy-evaluation-core.ts` can import. This fixes every current and future construction site at once and keeps the cache authoritative.

The `encodedStateLayoutCache` module-level `WeakMap<GameDef, …>` is retained as-is: a layout is a pure static implementation internal, invisible to replay, preview status, and perf witnesses, and the existing module-level `WeakMap` is already GC-correct (entry dies with the `GameDef`). This is the narrow carve-out where a module-level `WeakMap` is acceptable (see §4.3 for why the bytecode cache is *not* in this carve-out).

### 4.2 Feature table — add a `WeakMap<GameDef, FeatureTable>` cache

`buildFeatureTable(def, layout)` is memoized via a `getFeatureTable(def, layout)` accessor backed by a module-level `WeakMap<GameDef, FeatureTable>` living next to `buildFeatureTable` in `packages/engine/src/cnl/policy-bytecode/feature-table.ts`. Because `layout` is itself derived from `def` (and, after §4.1, is the cached singleton per `GameDef`), keying on `GameDef` is sound. `buildExpressionFeatureTable` and any other caller switch to the accessor.

This is the second member of the §4.1 carve-out: the feature table is a pure static internal, and `compilePolicyBytecode` is reached from `cnl/policy-bytecode/compile.ts`, which does not hold a `GameDefRuntime`. Threading a runtime down to it would be a larger, lower-value change than the module-level `WeakMap`; the cached output is `Object.freeze`d (§2.3), so immutability is not at risk.

### 4.3 Compiled bytecode — a runtime-owned `sharedStructural` cache

The prior Spec 172 left the bytecode cache's ownership to the implementer ("module-level `WeakMap` OR runtime-owned"). This spec **mandates runtime ownership** and removes the ambiguity. Compiled per-consideration bytecode is a pure function of `(CompiledPolicyExpr, GameDef, EncodedStateLayout)`, so it is a `sharedStructural` artifact in the §2.4 sense — exactly like the existing `compiledQueryPlanCache`.

Add a `sharedStructural` field to `GameDefRuntime`:

```ts
/** `sharedStructural`: lazily populated compiled policy bytecode keyed by
 *  compiled policy-expression object identity. Bytecode depends only on
 *  GameDef structure (+ the per-def layout singleton); shared across forks. */
readonly policyBytecodeCache: WeakMap<CompiledPolicyExpr, PolicyBytecode>;
```

constructed in `createGameDefRuntime` and carried through `forkGameDefRuntimeForRun` unchanged (mirroring `compiledQueryPlanCache`'s "remains shared structural across forks" treatment). `PolicyEvaluationContext.evaluateCompiledExprWithVm` resolves bytecode through `input.runtime?.policyBytecodeCache` when a runtime is present. When `input.runtime` is absent — non-drive, one-shot evaluation paths that do not exhibit the blowup — the constructor falls back to its existing per-instance `WeakMap`. This is **not** a backwards-compatibility shim (Foundation #14): it is a single cache-lookup expression with a graceful-degradation default, and the cached *value* is byte-identical on both paths. The cache key is keyed by `CompiledPolicyExpr` identity, valid because after §4.1 the layout is a per-`GameDef` singleton; if a future change introduces multiple layouts per `GameDef`, the key must extend to include `EncodedStateLayout` identity (the §6.2 bytecode-cache invariant test guards this — it asserts non-reuse across distinct layouts).

The per-instance `compiledExprBytecodeCache` field is **replaced** by this resolution path, not aliased alongside it.

### 4.4 Encoded state — a `runLocal` object-identity cache

`buildEncodedState(state, layout)` is state-dependent and cannot be a `sharedStructural` artifact. But `GameState` is immutable by contract (Foundation #11 — every transition returns a new object, the previous state is never mutated), so a `WeakMap<GameState, EncodedState>` keyed by `GameState` object identity is **collision-free and GC-correct**: the same `GameState` object always maps to the same `EncodedState`, and the entry dies with the state object.

Add a `runLocal` field to `GameDefRuntime`:

```ts
/** `runLocal`: memoizes encoded-state projections keyed by immutable
 *  GameState object identity; reset for every run via fork. */
readonly policyEncodedStateCache: WeakMap<GameState, EncodedState>;
```

reset in `forkGameDefRuntimeForRun` (a fresh `WeakMap`, like `tokenStateIndexCache`). The `PolicyEvaluationContext` constructor resolves `encodedState` through `input.runtime?.policyEncodedStateCache` when a runtime is present, falling back to `tryBuildEncodedState` directly when it is absent (same graceful-degradation rationale as §4.3).

Object-identity keying is the primary design because it carries **zero collision risk** — strictly safer than the canonical-hash keying the trigger report's `tokenStateIndexCache` uses. It captures the redundancy only if sibling option evaluations at one microturn node receive the *same* `GameState` reference. The implementer MUST confirm this during Phase 4 (it is the expected shape — the option differs, the state does not — but it is a verification step, not an assumption). If sibling options are found to receive distinct-but-equal `GameState` objects, the key upgrades to `(canonical-state-digest)` with an object-identity equality guard before reuse — never Zobrist alone, per Foundation #8 ("canonical serialized state remains the source of truth for equality").

### 4.5 Constructor invariant and regression guard

The prior Spec 172 fixed the symptom but added no guard preventing a future constructor edit from silently reintroducing a direct builder call. This spec adds a **constructor invariant**:

> The `PolicyEvaluationContext` constructor MUST resolve `encodedStateLayout`, `featureTable` (transitively, via `compilePolicyBytecode`), `bytecode`, and `encodedState` through the cached accessors / runtime-owned caches above. It MUST NOT call `buildEncodedStateLayout`, `buildFeatureTable`, `compilePolicyBytecode` (uncached), or `buildEncodedState` in a way that guarantees a cache miss on a warm runtime.

The invariant is enforced by an architectural-invariant test (§6.2): constructing N `PolicyEvaluationContext`s for the same `(GameDef, layout, state)` performs each static/derived build only on first touch — subsequent constructions perform zero `buildEncodedStateLayout`, zero `buildFeatureTable`, zero `compilePolicyBytecode`, and zero `buildEncodedState` calls.

### 4.6 Combined effect

After §4.1–§4.5: constructing a `PolicyEvaluationContext` for an inner microturn-option evaluation does **zero** layout rebuilds, **zero** feature-table rebuilds, **zero** bytecode recompiles for considerations already compiled this `GameDef`, and **zero** `encodedState` rebuilds for a `GameState` already projected this run (cache hits all). The only per-construction cost that remains is the actual scoring work. The §4.5 invariant test ensures it stays that way.

## 5. Phases and acceptance criteria

Per `.claude/rules/testing.md`, each test file declares its class. Phases 1–5 are independently shippable and independently determinism-gated; they can land in one PR or several. Phase 0 lands first (TDD: the failing witness precedes the fix, per Foundation #16).

| Phase | Scope | Acceptance | Effort |
|---|---|---|---|
| **0** | Perf witness (§6.3) — a large-board / cube-heavy preview-drive case added *before* any fix, so the seam is proven against the regime that exposed it. | Pre-fix: the witness exceeds a deterministic `build*` self-time / work threshold (or times out), i.e. it **fails**. Existing determinism gates (§6.1) stay green. | XS — one harness case + threshold. |
| **1** | §4.1 layout accessor: route `PolicyEvaluationContext` layout resolution through `getPolicyEncodedStateLayout`. | Replay-identity + FITL Zobrist-parity shards byte-identical. `buildEncodedStateLayout` self-time on the perf witness drops to ~0 outside first-touch. | XS. |
| **2** | §4.2 `buildFeatureTable` `WeakMap<GameDef, FeatureTable>` cache + `getFeatureTable` accessor; switch callers. | Replay-identity + Zobrist-parity byte-identical. `buildFeatureTable` self-time on the perf witness drops to ~0 outside first-touch. | S. |
| **3** | §4.3 runtime-owned `policyBytecodeCache` field on `GameDefRuntime`; replace the per-instance cache. | Replay-identity + Zobrist-parity byte-identical. `policy-bytecode-equivalence-*` tests pass. `forked-vs-fresh-runtime-parity` passes. `compilePolicyBytecode` / `buildExpressionFeatureTable` self-time on the perf witness drops to ~0 outside first-touch. | S. |
| **4** | §4.4 runtime-owned `policyEncodedStateCache` field on `GameDefRuntime`; resolve `encodedState` through it. Confirm sibling-option `GameState` sharing first. | Replay-identity + Zobrist-parity byte-identical. `buildEncodedState` self-time on the perf witness drops materially (cache-hit on sibling options). | S–M. |
| **5** | §4.5 constructor-invariant architectural test. | The invariant test passes on warm runtimes and fails if a builder is called past first-touch. Live 2026-05-15 proof showed this guard can pass while the Phase 0 witness remains red, so the residual measured witness moved to Phase 6 / `172POLEVASTA-007`. | XS. |
| **6** | Residual preview-drive rebuild elimination after the constructor invariant. | The Phase 0 witness now proves duplicate rebuild elimination on the same workload: static cached structures are first-touch-only, encoded-state duplicate rebuilds are zero, raw unique-state encoded builds remain printed/classified, and the headline ARVN seed 1013 command completes without the historical hang. | M. |

The headline acceptance for the spec as a whole: deep-preview `arvn-cubes` seed 1013 (`campaigns/fitl-arvn-agent-evolution/diagnose-trainchoice-perf.mjs --only 1013 --max-turns 200`) completes, and the per-seed times across all 15 seeds drop sharply toward the shallow-preview regime — without claiming exact parity with the 5.1 s shallow control (deep preview does real work; the target is *feasible*, not *free*).

## 6. Test plan

### 6.1 Determinism gates (the load-bearing invariant — these must stay byte-identical)

- `packages/engine/test/determinism/spec-140-replay-identity.test.ts` — kernel replay identity.
- `packages/engine/test/determinism/forked-vs-fresh-runtime-parity.test.ts` — confirms a forked runtime (with the new `runLocal` `policyEncodedStateCache`) produces results identical to a fresh one. **Especially load-bearing for Phases 3–4** (the new `GameDefRuntime` fields).
- `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.ts` / `-seed-123.test.ts` — FITL Zobrist incremental parity.
- `packages/engine/test/integration/policy-bytecode-equivalence*.test.ts` — WASM/TS bytecode score-row equivalence (Phase 3 especially).
- `pnpm -F @ludoforge/engine test:integration:fitl-rules` — no behavioural drift.

### 6.2 New correctness tests

- **`feature-table-cache.test.ts`** (architectural-invariant) — `getFeatureTable(def, layout)` returns a value deep-equal to a fresh `buildFeatureTable(def, layout)`, and returns the same reference on repeat calls for the same `def`.
- **Layout-cache invariant** — `PolicyEvaluationContext` constructed twice for the same `def` observes the same `encodedStateLayout` reference (extend an existing `policy-evaluation-core` test if one fits).
- **Bytecode-cache invariant** — a consideration's compiled bytecode is reused across two `PolicyEvaluationContext` instances sharing one `GameDefRuntime`; and is *not* reused across distinct `EncodedStateLayout`s (guards the §4.3 keying caveat).
- **Encoded-state-cache invariant** — two `PolicyEvaluationContext` instances constructed with the same `GameState` object and the same `GameDefRuntime` observe the same `encodedState` reference; distinct `GameState` objects do not collide.
- **Constructor-no-direct-build invariant** (architectural-invariant) — the §4.5 guard: constructing N contexts for the same `(GameDef, layout, state)` on a warm `GameDefRuntime` performs each `build*` exactly once (first-touch only). Implementable via spies/counters on the builder functions or a build-counter on the runtime.

### 6.3 Perf witness (Phase 0, extended through Phase 6)

Extend `packages/engine/scripts/profile-fitl-preview-drive.mjs` (or add a sibling) with a **large-board / cube-heavy** case — a FITL profile with the deep `inner` preview config driven on a seed where ARVN piece count is high — and a counter check for duplicate rebuilds. Without this, §4.6 of the trigger report recurs: the existing `--maxTurns 10` small-board witness never reaches the regime where this seam bites. The witness is added in Phase 0 (failing). Phase 5 guards the constructor-level invariant. Phase 6's acceptance is that the same workload preserves the raw `build*` counter output while proving static cached structures are first-touch-only and remaining encoded-state builds are unique preview-state cache misses, not duplicate rebuilds.

## 7. Foundation alignment

| Foundation | How this spec respects it |
|---|---|
| #1 Engine Agnosticism | All four caches key on `GameDef` / `CompiledPolicyExpr` / `EncodedStateLayout` / `GameState` — generic engine structures. The two new `GameDefRuntime` fields sit alongside existing generic caches. No game-specific branching. |
| #8 Determinism | Pure-perf changes. The cached/threaded result is byte-identical to the freshly-built result; cache warmth changes nothing observable. Replay-identity + Zobrist-parity + forked-vs-fresh-runtime-parity are the gates (§6.1) and must stay byte-identical. The §4.4 key never falls back to Zobrist-alone. |
| #10 Bounded Computation | The preview drive's tree bound (`depthCap`/`maxOptions`/`capClass`) is unchanged. This spec removes a per-node constant factor that scaled with board state size — restoring the intent that a bounded preview is *feasibly* bounded regardless of board size. |
| #11 Immutability | The caches store frozen / immutable derived structures (`buildFeatureTable` returns `Object.freeze`d output; `buildEncodedStateLayout` likewise). The §4.4 `WeakMap<GameState, EncodedState>` is sound *because* Foundation #11 guarantees `GameState` is never mutated after construction. No caller-visible state is mutated. |
| #14 No Backwards Compatibility | No parallel old/new code paths. The per-instance `compiledExprBytecodeCache` is replaced, not aliased; direct `buildEncodedStateLayout` calls in the constructor are replaced by the cached accessor; all owned callers migrate in the same change. The `input.runtime`-absent fallback (§4.3, §4.4) is a single graceful-degradation lookup with a byte-identical value, not a compatibility shim. |
| #15 Architectural Completeness | The fix addresses **all four** rebuild seams including `buildEncodedState` — the #1 profile entry the prior Spec 172 deferred — and adds the §4.5 constructor invariant + regression test so the seam cannot silently reopen. It routes ownership through the *existing* `GameDefRuntime` rather than papering a new layer over it. |
| #16 Testing as Proof | §6.3 adds the large-board perf witness *first* (Phase 0, TDD), so the seam is proven against the regime that exposed it. §6.2's constructor-no-direct-build invariant proves the architectural property rather than assuming it. |

## 8. Code anchors for implementers

- **Runtime owner**: `packages/engine/src/kernel/gamedef-runtime.ts` — `GameDefRuntime` interface (`:43-84`), `createGameDefRuntime` (`:106-126`), `forkGameDefRuntimeForRun` (`:143-157`). `compiledQueryPlanCache` is the `sharedStructural`-field precedent for §4.3; `tokenStateIndexCache` is the `runLocal`-field precedent for §4.4. `packages/engine/src/kernel/eval-runtime-resources-contract.ts` is the runtime-resource ownership-contract precedent.
- **Layout cache**: `packages/engine/src/agents/policy-evaluation-core.ts:169-170` (input fields `runtime?`, `encodedStateLayout?`), `:354` (`compiledExprBytecodeCache`), `:369-392` (constructor), `:928-936` (`evaluateCompiledExprWithVm`). `packages/engine/src/agents/policy-eval.ts:68` (`encodedStateLayoutCache`), `:320` (`getPolicyEncodedStateLayout`). `packages/engine/src/agents/microturn-option-eval.ts:113` (construction site — already passes `runtime`). `packages/engine/src/kernel/encoded-state/layout.ts:66` (`buildEncodedStateLayout`).
- **Feature-table cache**: `packages/engine/src/cnl/policy-bytecode/feature-table.ts:156` (`buildFeatureTable`), `:165` (`forEachCompiledPolicyExpr` full scan), `:174-176` (`Object.freeze` output). `packages/engine/src/cnl/policy-bytecode/compile.ts:37` (`compilePolicyBytecode`), `:43` (`buildExpressionFeatureTable`), `:64` (`buildFeatureTable` call site).
- **Bytecode cache**: `packages/engine/src/agents/policy-evaluation-core.ts:354,928-936`; `packages/engine/src/agents/policy-wasm-score-bytecode-cache.ts` (an existing sibling bytecode cache).
- **Encoded-state cache**: `packages/engine/src/agents/policy-evaluation-core.ts:376` (`tryBuildEncodedState` call), `packages/engine/src/kernel/encoded-state/view.ts` (`buildEncodedState`).
- **Perf witness**: `packages/engine/scripts/profile-fitl-preview-drive.mjs`. Repro driver from the trigger report: `campaigns/fitl-arvn-agent-evolution/diagnose-trainchoice-perf.mjs`.

## 9. Out of scope

- Extending the WASM production-preview-drive route to handle complex `continuedDeepening`/`deep1024` previews instead of failing closed (§2.7). That is a larger separate effort; if pursued it would supersede much of the TS-path cost, but this spec's caches are still correct and useful regardless.
- Retuning the `arvn-evolved` (or any) preview config — a campaign decision, not an engine change.
- Any change to the FITL game spec or agent profiles.
- **`PolicyProfilePlan` / profile-level compilation restructuring** (`spec-172-remediation.md` Phase 2) — the engine already compiles profiles into a `catalog.compiled.considerations` structure consumed by every policy-evaluation call site; the incident is a *caching* bug, not a profile-granularity bug. Not justified by the evidence.
- **Preview-result transposition memo** (`spec-172-remediation.md` Phase 4) — a per-position memo across the preview search. It is a legitimate *possible* future layer, but the incident is fully explained by the four rebuild seams above; a transposition cache is a substantial new subsystem with subtle observer-scope / RNG-state / hidden-information key-correctness requirements. Revisit **only if** post-fix profiling of the Phase 0 witness still shows a dominant preview hotspot after §4.1–§4.5 land. Not committed here.
- **`PreviewWorkBudget` logical-work accounting and a `workCapped` status / Foundation #20 amendment** (`spec-172-remediation.md` Phase 5) — the incident proves the per-node *constant factor* was pathological, not that the existing depth/option caps are insufficient. Fixing the constant factor (this spec) makes the already-bounded tree feasible. Amending a Foundation on this evidence is unwarranted.

## 10. Tickets

Decompose via `/spec-to-tickets`. Suggested split mirrors the phases: Phase 0 (perf witness, lands first) → Phase 1 (layout accessor) → Phase 2 (feature-table cache) → Phase 3 (runtime-owned bytecode cache) → Phase 4 (runtime-owned encoded-state cache) → Phase 5 (constructor-invariant test) → Phase 6 (residual preview-drive rebuild elimination if the measured witness remains red after the invariant lands). Phase 0 may be folded into Phase 1's ticket if preferred, but it must be authored and observed failing before the §4.1 change lands. Each of Phases 1–6 is independently determinism-gated.

## 11. Reassessment of source proposal (`reports/spec-172-remediation.md`, "Spec 172-R")

The external deep-research critique was produced without codebase access. Per-recommendation disposition:

| 172-R recommendation | Disposition | Detail |
|---|---|---|
| **Phase 1** — runtime-owned static artifact registry; "make runtime ownership mandatory, not optional"; avoid module-level `WeakMap` ambiguity | **Adopted with adjustment** | The *principle* is adopted (§4.3 mandates `GameDefRuntime` ownership for the bytecode cache, removing the prior spec's "implementer chooses" ambiguity). The *premise* is **corrected**: 172-R proposed inventing a new `PolicyEvaluationRuntime` / `PolicyRuntimeResources` layer because it could not see that `GameDefRuntime` already exists and is mature (§2.4). This spec adds two fields to the existing owner instead. The module-level `WeakMap` is retained only for the two pure-static internals (layout, feature table) that 172-R itself carves out as permissible. |
| **Phase 1** — "context must *receive* a runtime-resources object; add a constructor invariant forcing it" | **Corrected** | `input.runtime?: GameDefRuntime` already exists on the context input and is already passed at the `microturn-option-eval.ts:113` site (§2.5). No new plumbing is needed; the constructor simply must *use* what it receives. The constructor-invariant idea itself is **adopted** (§4.5). |
| **Phase 0** — add a failing large-board/cube-heavy witness *before* changing implementation | **Adopted** | §5 reorders the perf witness to Phase 0 (TDD, Foundation #16). The prior Spec 172 had it as the last phase. |
| **Phase 0** — add a synthetic game-agnostic high-token witness too | **Rejected (low value)** | The four caches key on generic `GameDef` / `CompiledPolicyExpr` / `EncodedStateLayout` / `GameState` structures with no game-specific branching; the FITL witness plus the existing determinism corpus already prove genericity. A synthetic witness is a nice-to-have that does not earn its maintenance cost here. |
| **Phase 3** — safe state-derived projection caching for `buildEncodedState` | **Adopted with adjustment** | The *gap is real and adopted* (§4.4 — `buildEncodedState` is the #1 profile entry the prior Spec 172 wrongly deferred; Foundation #15). The *mechanism is adjusted*: a single `WeakMap<GameState, EncodedState>` keyed by object identity (collision-free, GC-correct, owned as a `runLocal` `GameDefRuntime` field per the established `tokenStateIndexCache` pattern) — not 172-R's two-tier `byObject` + `byObserver` structure, which is unjustified complexity for the observed redundancy. |
| **Phase 2** — promote policy profiles into compiled `PolicyProfilePlan`s | **Rejected** | The engine already compiles profiles into `catalog.compiled.considerations` (§9). 172-R's "appears to compile at the consideration-expression level — too granular" was a guess; the incident is a caching bug, not a profile-granularity bug. |
| **Phase 4** — preview-result memoization / transposition cache | **Deferred (not committed)** | A legitimate possible future layer, but not justified by this incident — the four rebuild seams fully explain it. Recorded in §9 as "revisit only if post-fix profiling still shows a dominant hotspot." |
| **Phase 5** — `PreviewWorkBudget` logical-work accounting + `workCapped` status + Foundation #20 amendment | **Rejected** | The incident proves the constant factor was pathological, not that caps are insufficient (§9). Amending a Foundation on this evidence is unwarranted. |
| **Phase 6** — agent-evolution profile-quality guardrails | **Rejected (already exists)** | `packages/engine/test/policy-profile-quality/` already exists, and FOUNDATIONS.md's Appendix already formalizes the determinism-proof vs profile-quality-witness split. The ARVN-specific regression-suite list is a campaign decision, already out of scope per §9 ("no agent-profile changes"). |
| **Phase 7** — WASM later, not now | **Adopted (already aligned)** | Matches the prior Spec 172 §9 and this spec's §2.7 / §9. No change needed. |

**Net**: 172-R is a valuable critique but not a better *replacement* — its architectural centerpiece reinvents an existing mature abstraction, and four of its phases are speculative scope inflation or duplicate existing infrastructure. Its valid points (mandate runtime ownership, add a regression guard, fix `buildEncodedState`, witness-first ordering) are folded into this in-place revision of Spec 172. No separate `172-R` artifact is created.

## Outcome

Completion date: 2026-05-15.

Phase 6 implementation approved a proof-boundary correction on 2026-05-15: raw `buildEncodedState` counts include legitimate unique preview-state first touches. The final witness therefore gates on duplicate rebuild elimination while preserving raw counter output. Final focused result: `total=401`, `staticOnlyTotal=2`, `duplicateEncodedStateRebuilds=0`, `buildEncodedStateLayout=1`, `buildFeatureTable=1`, `buildExpressionFeatureTable=0`, `buildEncodedState=399`, `policyEncodedStateCacheObjectHit=4626`, `policyEncodedStateCacheHashHit=14`, `policyEncodedStateCacheMiss=399`. The headline seed command completed: `seed 1013: DONE in 74.5s stop=terminal decisions=257`.
