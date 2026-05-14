# Spec 172 — Cache Static/Derived Structures Across `PolicyEvaluationContext` Instances

**Status**: PROPOSED
**Priority**: High — unblocks the `fitl-arvn-agent-evolution` campaign, which is paused per `reports/fitl-arvn-policy-eval-context-rebuild-scaling-2026-05-14.md`. A deep continued-deepening preview combined with realistic cube-heavy ARVN play is currently infeasible to simulate (one FITL seed: >15 min, never completes) purely because the policy-evaluation preview path rebuilds static structures per microturn-option evaluation.
**Complexity**: S–M — three localized caching/threading changes, all pure-perf (no kernel semantics change), gated by existing determinism tests. No new types, no schema changes, no new ref families.
**Date**: 2026-05-14
**Predecessors**: `archive/tickets/POLPREVDRIVE-001.md`…`POLPREVDRIVE-007.md` — a completed ticket series that cached two other rebuild seams in the same preview path (`buildTokenStateIndex`, `resolveRef`). This spec covers three residual rebuild seams of the same class that that series did not reach.
**Trigger report**: `reports/fitl-arvn-policy-eval-context-rebuild-scaling-2026-05-14.md` — establishes the empirical evidence (CPU profile: 87.7% TS-engine self-time, ~30% in `build*` functions; per-seed timings; the 5.1 s shallow-preview isolation control) and the code trace.

---

## 1. Goal

The synthetic-completion preview drive (`policy-preview.ts` `driveSyntheticCompletion`) evaluates many inner microturn options. **Each inner microturn-option evaluation constructs a fresh `PolicyEvaluationContext`**, and that construction currently rebuilds three structures that are either static for the life of a game or pure functions of static inputs:

1. **`encodedStateLayout`** — pure function of `GameDef`; rebuilt per `PolicyEvaluationContext` because the constructor calls `buildEncodedStateLayout(input.def)` directly instead of consulting the existing per-`GameDef` `WeakMap` cache.
2. **`featureTable`** — `buildFeatureTable(def, layout)` is a pure function of `(GameDef, EncodedStateLayout)` that full-scans every compiled policy expression; it has **no cache** and is rebuilt inside every `compilePolicyBytecode` call.
3. **Compiled per-consideration bytecode** — `PolicyEvaluationContext.compiledExprBytecodeCache` is a per-*instance* `WeakMap`, so it is empty on every construction and every consideration's bytecode is recompiled per microturn-option evaluation.

Every one of these structures iterates over board tokens, so their per-rebuild cost scales with board token count. Under cube-heavy play the token count climbs and the rebuilds dominate runtime (the trigger report's profile: only ~3% of self-time is actual game move-enumeration).

This spec makes all three cache or thread their static/derived results **across `PolicyEvaluationContext` instances**, so the deep preview's per-microturn-option cost no longer carries a full layout + feature-table + bytecode rebuild. The drive's bounded *tree* (`depthCap`, `maxOptions`, `capClass`) is unchanged; only the per-node constant factor shrinks.

After this spec lands, a deep preview can be combined with realistic high-token-count play (e.g. FITL ARVN Train placing cubes) without the simulation becoming infeasible — i.e. the inefficiency no longer constrains which agent policies are representable (Foundation #10).

## 2. Context (verified against the codebase)

### 2.1 The deep preview constructs a `PolicyEvaluationContext` per microturn-option

`packages/engine/src/agents/microturn-option-eval.ts:113` — `scoreMicroturnOptionWithContributions` constructs `new PolicyEvaluationContext({ def, state, playerId, seatId, catalog, parameterValues, trustedMoveIndex, completion, … }, [])`. The input object has **no `encodedStateLayout` and no `encodedState` field**. `driveSyntheticCompletion` (`policy-preview.ts:864`) with `strategy: continuedDeepening`, `depthCap: 16`, `maxOptions: 8` invokes this many times per previewed candidate.

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

`compiledExprBytecodeCache` (`policy-evaluation-core.ts:354`) is `private readonly … = new WeakMap<…>()` — an **instance field**, empty on every construction. `compilePolicyBytecode` (`packages/engine/src/cnl/policy-bytecode/compile.ts:37`) calls `buildExpressionFeatureTable(def, layout, expr)` (`compile.ts:43`), which calls `buildFeatureTable(def, layout)` (`compile.ts:64`). `buildFeatureTable` (`packages/engine/src/cnl/policy-bytecode/feature-table.ts:156`) is a pure function of `(def, layout)` that does `forEachCompiledPolicyExpr(def, …)` (`feature-table.ts:165`) — a full scan of every compiled policy expression in the GameDef — and has **no cache**. So for D microturn-option evaluations × C considerations, the full GameDef-wide feature table is rebuilt D×C times, identically each time.

### 2.4 The WASM preview-drive route does not relieve this

`packages/engine/src/agents/policy-wasm-score-routing.ts` "fails closed → `unsupported`" for complex preview configs (the `arvn-evolved` profile's `continuedDeepening`/`deep1024` `inner` config). The CPU profile in the trigger report confirms 0.9% WASM self-time — the deep preview runs entirely through the TS `driveSyntheticCompletion` path. Extending the WASM route to cover complex previews is a much larger, separate effort and is **out of scope** here (§9).

### 2.5 These are pure-perf changes — determinism is the load-bearing invariant

None of the three structures' *contents* change; only *when and how often they are built* changes. The cached/threaded result must be byte-identical to the freshly-built result. The existing replay-identity and Zobrist-parity tests are the gates (Foundation #8).

## 3. Non-goals

- **No change to the preview drive's bounds.** `depthCap`, `maxOptions`, `chooseNBeamWidth`, `capClass` are unchanged. This spec does not retune `continuedDeepening`.
- **No WASM preview-drive coverage extension.** The WASM route continuing to fail-closed for complex previews is unchanged (§2.4, §9).
- **No new caches for state-dependent structures.** `buildEncodedState(state, layout)` depends on `state` and legitimately rebuilds per state; it is not cached by this spec (its cost is already addressed in part by `tokenStateIndexCache` from `POLPREVDRIVE-002/007`; further `buildEncodedState` work, if any, is a separate ticket).
- **No semantics change.** Foundation #8: replay identity and Zobrist parity must be byte-identical before and after.

## 4. Architecture

### 4.1 Encoded-state layout — use the existing per-`GameDef` cache

`PolicyEvaluationContext`'s constructor resolves the layout through a per-`GameDef` `WeakMap` cache rather than calling `buildEncodedStateLayout` directly. Two equivalent shapes; pick one in implementation:

- (a) The constructor calls the existing `getPolicyEncodedStateLayout(input.def)` accessor (move it to a location both `policy-eval.ts` and `policy-evaluation-core.ts` can import, or export it) instead of `buildEncodedStateLayout(input.def)`. `input.encodedStateLayout`, when supplied, still wins.
- (b) Every construction site that omits `encodedStateLayout` (notably `microturn-option-eval.ts:113`) threads in a layout obtained once via the cache.

(a) is preferred — it fixes every current and future construction site at once and keeps the cache authoritative.

### 4.2 Feature table — add a `WeakMap<GameDef, FeatureTable>` cache

`buildFeatureTable(def, layout)` is memoized. Because `layout` is itself derived from `def` (and, after §4.1, is the cached singleton per `GameDef`), keying the cache on `GameDef` is sound; if defensiveness against multiple layouts per def is wanted, key on `EncodedStateLayout` identity. The cache lives in `packages/engine/src/cnl/policy-bytecode/feature-table.ts` next to `buildFeatureTable`, exposed via a `getFeatureTable(def, layout)` accessor; `buildExpressionFeatureTable` and any other caller switch to the accessor.

### 4.3 Compiled bytecode — share the cache across `PolicyEvaluationContext` instances

The per-consideration compiled bytecode is a pure function of `(CompiledPolicyExpr, GameDef, EncodedStateLayout)`. Replace the per-instance `compiledExprBytecodeCache` with a cache shared across instances for the same `(GameDef, layout)`. Two shapes; pick one:

- (a) A module-level `WeakMap<GameDef, WeakMap<CompiledPolicyExpr, Bytecode>>` in `policy-evaluation-core.ts`.
- (b) A cache owned by the runtime-resources / `GameDefRuntime` object and threaded through, mirroring how `POLPREVDRIVE-002` threaded `tokenStateIndexCache`.

(b) is more consistent with the existing `POLPREVDRIVE` pattern and avoids module-level mutable state; (a) is simpler. The implementer chooses, but the cache key must include the `EncodedStateLayout` (or `GameDef`, post-§4.1, since layout is then a per-`def` singleton) so a bytecode built against one layout is never reused against another.

### 4.4 Combined effect

After §4.1–§4.3: constructing a `PolicyEvaluationContext` for an inner microturn-option evaluation does **zero** layout rebuilds (cache hit), **zero** feature-table rebuilds (cache hit), and **zero** bytecode recompiles for considerations already compiled this game (cache hit). The only per-construction cost that remains is `buildEncodedState(state, layout)` — which is genuinely state-dependent — plus the actual scoring work.

## 5. Phases and acceptance criteria

| Phase | Scope | Acceptance |
|---|---|---|
| **0** | §4.1 layout cache: route `PolicyEvaluationContext` layout resolution through the per-`GameDef` `WeakMap`. | Replay-identity + FITL Zobrist-parity shards byte-identical. `buildEncodedStateLayout` self-time on the perf witness (§6) drops to ~0 outside first-touch. |
| **1** | §4.2 `buildFeatureTable` `WeakMap<GameDef, FeatureTable>` cache + `getFeatureTable` accessor; switch callers. | Replay-identity + Zobrist-parity byte-identical. `buildFeatureTable` self-time on the perf witness drops to ~0 outside first-touch. |
| **2** | §4.3 shared bytecode cache. | Replay-identity + Zobrist-parity byte-identical. `policy-bytecode-equivalence-*` tests pass. `compilePolicyBytecode` / `buildExpressionFeatureTable` self-time on the perf witness drops to ~0 outside first-touch. |
| **3** | Perf witness extension (§6) — a large-board / cube-heavy preview-drive case so this seam stays gated. | The new witness completes within budget and reports the post-fix `build*` self-time below the gate. |

Phases 0–2 are independently shippable and independently determinism-gated; they can land in one PR or three.

## 6. Test plan

Per `.claude/rules/testing.md`, each test file declares its class.

### 6.1 Determinism gates (the load-bearing invariant — these must stay byte-identical)

- `packages/engine/test/determinism/spec-140-replay-identity.test.js` — kernel replay identity.
- `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.ts` / `-seed-123.test.ts` — FITL Zobrist incremental parity.
- `packages/engine/test/integration/policy-bytecode-equivalence*.test.ts` — WASM/TS bytecode score-row equivalence (Phase 2 especially).
- `pnpm -F @ludoforge/engine test:integration:fitl-rules` — no behavioural drift.

### 6.2 New correctness tests

- **`feature-table-cache.test.ts`** (architectural-invariant) — `getFeatureTable(def, layout)` returns a value deep-equal to a fresh `buildFeatureTable(def, layout)`, and returns the same reference on repeat calls for the same `def`.
- **Layout-cache invariant** — `PolicyEvaluationContext` constructed twice for the same `def` observes the same `encodedStateLayout` reference (extend an existing `policy-evaluation-core` test rather than a new file if one fits).
- **Bytecode-cache invariant** — a consideration's compiled bytecode is reused across two `PolicyEvaluationContext` instances for the same `(def, layout)`; and is *not* reused across different layouts.

### 6.3 Perf witness (Phase 3)

Extend `packages/engine/scripts/profile-fitl-preview-drive.mjs` (or add a sibling) with a **large-board / cube-heavy** case — e.g. a FITL profile with the deep `inner` preview config driven on a seed where ARVN piece count is high — and a self-time check that `buildEncodedStateLayout` + `buildFeatureTable` + `buildExpressionFeatureTable` together stay below a small threshold (first-touch only). Without this, §4.6 of the trigger report recurs: the existing `--maxTurns 10` small-board witness never reaches the regime where this seam bites.

## 7. Foundation alignment

| Foundation | How this spec respects it |
|---|---|
| #1 Engine Agnosticism | All three caches key on `GameDef` / `CompiledPolicyExpr` / `EncodedStateLayout` — generic engine structures. No game-specific branching. |
| #8 Determinism | Pure-perf changes. The cached/threaded result is byte-identical to the freshly-built result. Replay-identity + Zobrist-parity are the gates (§6.1) and must stay byte-identical. |
| #10 Bounded Computation | The preview drive's tree bound (`depthCap`/`maxOptions`/`capClass`) is unchanged. This spec removes a per-node constant factor that scaled with board state size — restoring the intent that a bounded preview is *feasibly* bounded regardless of board size. |
| #11 Immutability | The caches store frozen, immutable derived structures (`buildFeatureTable` already returns `Object.freeze`d output; `buildEncodedStateLayout` likewise). No caller-visible state is mutated; no stale immutable state observes newer contents (the keyed structures are static for the life of a `GameDef`). |
| #14 No Backwards Compatibility | No parallel old/new code paths. The per-instance `compiledExprBytecodeCache` is replaced, not aliased; `buildEncodedStateLayout` direct calls in `PolicyEvaluationContext` are replaced by the cached accessor; all owned callers migrate in the same change. |
| #16 Testing as Proof | §6.3 adds the large-board perf witness the prior `POLPREVDRIVE` gate lacked, so the seam is proven against the regime that exposed it, not just the small-board regime. |

## 8. Code anchors for implementers

- **Layout cache**: `packages/engine/src/agents/policy-evaluation-core.ts:369-392` (constructor), `:354` (`compiledExprBytecodeCache`), `:928-936` (`evaluateCompiledExprWithVm`). `packages/engine/src/agents/policy-eval.ts:68` (`encodedStateLayoutCache`), `:320` (`getPolicyEncodedStateLayout`). `packages/engine/src/agents/microturn-option-eval.ts:113` (construction site missing the layout). `packages/engine/src/kernel/encoded-state/layout.ts:66` (`buildEncodedStateLayout`).
- **Feature-table cache**: `packages/engine/src/cnl/policy-bytecode/feature-table.ts:156` (`buildFeatureTable`), `:165` (`forEachCompiledPolicyExpr` full scan). `packages/engine/src/cnl/policy-bytecode/compile.ts:37` (`compilePolicyBytecode`), `:43` (`buildExpressionFeatureTable`), `:64` (`buildFeatureTable` call site).
- **Bytecode cache**: `packages/engine/src/agents/policy-evaluation-core.ts:354,928-936`; `packages/engine/src/agents/policy-wasm-score-bytecode-cache.ts` (an existing sibling bytecode cache to mirror the ownership pattern).
- **Perf witness**: `packages/engine/scripts/profile-fitl-preview-drive.mjs`. Repro driver from the trigger report: `campaigns/fitl-arvn-agent-evolution/diagnose-trainchoice-perf.mjs`.

## 9. Out of scope

- Extending the WASM production-preview-drive route to handle complex `continuedDeepening`/`deep1024` previews instead of failing closed (§2.4). That is a larger separate effort; if pursued it would supersede much of the TS-path cost, but this spec's three caches are still correct and useful regardless.
- Caching `buildEncodedState(state, layout)` — state-dependent, addressed elsewhere.
- Retuning the `arvn-evolved` (or any) preview config — a campaign decision, not an engine change.
- Any change to the FITL game spec or agent profiles.

## 10. Tickets

Decompose via `/spec-to-tickets`. Suggested split mirrors the phases: one ticket per cache (Phase 0 layout, Phase 1 feature-table, Phase 2 bytecode), each independently determinism-gated, plus Phase 3 (perf witness) folded into the last ticket or its own.

## Outcome

_(to be filled on completion)_
