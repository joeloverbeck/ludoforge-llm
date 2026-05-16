# FITL — Policy-Evaluation Preview Path Rebuilds Static Structures Per Microturn-Option, Scaling With Board Token Count

**Status**: ✅ EXPLOITED — referenced during spec 174 implementation (archived 2026-05-16).

**Author**: Claude Opus 4.7 (`/improve-loop` skill on `campaigns/fitl-arvn-agent-evolution`)
**Date**: 2026-05-14
**Status**: Architectural-gap report per directive #3 of the campaign invocation ("if you encounter genuine code issues or architectural gaps, report the matter in detail"). The campaign loop is paused pending direction on this finding.
**Audience**: Project maintainer (codebase access assumed).
**Predecessor context**: `archive/tickets/POLPREVDRIVE-001.md` … `POLPREVDRIVE-007.md` — a completed ticket series that optimized other rebuild seams in the same preview path (`buildTokenStateIndex`, `resolveRef`). This report identifies a **residual rebuild seam not covered by that series**.

---

## 1. TL;DR

During the `fitl-arvn-agent-evolution` campaign, an experiment (`exp-007`) made the ARVN agent choose `arvn-cubes` over `rangers` on the FITL Train micro-decision — the rules-correct, strategically-realistic choice (cubes place up to 6 ARVN pieces; rangers place 1-2). The 15-seed harness then ran **59+ minutes with zero seeds completing**, while the identical run with `rangers` finishes in a few minutes.

Investigation (CPU profile + code trace):

- **It is not WASMified.** A CPU profile of the slow path is **87.7% TypeScript-kernel self-time, 0.9% WASM**. The WASM production-preview-drive route (`policy-wasm-score-routing.ts`) "fails closed → unsupported" for the `arvn-evolved` profile's complex preview config, so the synthetic-completion preview runs entirely through the TS kernel (`driveSyntheticCompletion` in `policy-preview.ts`).
- **The dominant cost is rebuilding static / derived structures, not game logic.** ~30% of self-time is in `build*` functions: `buildEncodedState`, `buildEncodedStateLayout`, `indexByString`, `collectTokenScalarStringValues` (`kernel/encoded-state/*`); `buildFeatureTable`, `buildExpressionFeatureTable`, `canonicalKey`, `sortObjectKeys` (`cnl/policy-bytecode/*`). Actual game move-enumeration (`eval-query` token counting) is only ~3%.
- **Root cause**: the deep "continued-deepening" preview drives many inner microturns; **each inner microturn-option evaluation constructs a fresh `PolicyEvaluationContext`** (`microturn-option-eval.ts:113`), and that constructor **rebuilds the encoded-state layout from scratch** (`policy-evaluation-core.ts:375` — bypassing the existing `getPolicyEncodedStateLayout` WeakMap cache) and **starts with an empty per-instance bytecode cache**, so every consideration's bytecode is **recompiled**, and each recompile **rebuilds the entire GameDef-wide feature table** (`buildFeatureTable`, which has no cache and full-scans every compiled policy expression).
- Every one of those rebuilt structures scales with **board token count**. `arvn-cubes` Train multiplies the ARVN piece count, so each rebuild gets slower *and* there are more of them (longer games) — a multiplicative blowup.

**This is a removable performance inefficiency, not inherent game complexity.** The same realistic Train behavior runs a full game in **5.1 s** when the `arvn-evolved` deep-preview `inner` config is stripped (shallow preview). The fix is the same class as POLPREVDRIVE-002/004/007: cache the static/derived structures across `PolicyEvaluationContext` instances instead of rebuilding them per instance.

**Severity**: Architectural — Foundation #10 (Bounded Computation). The preview's *tree* is bounded (`depthCap`, `maxOptions`, `capClass: deep1024`), but the *per-unit constant factor* scales with board state size because static structures are rebuilt per unit. The practical effect is that a legitimate, valuable AI-policy configuration (deep preview) becomes infeasible on larger boards — i.e., it constrains which agent policies are representable.

---

## 2. Symptom and Reproduction

The `arvn-evolved` PolicyAgent profile (`data/games/fire-in-the-lake/92-agents.md`) declares an aggressive preview:

```yaml
preview:
  mode: exactWorld
  budget: { strategy: balancedCoverage, fullCandidateCap: 10, minPerGroup: 1 }
  inner:
    chooseOne: true
    chooseNStep: true
    maxOptions: 8
    chooseNBeamWidth: 1
    depthCap: 4
    strategy: continuedDeepening
    capClass: deep1024
    continuedDeepening:
      broad: { depthCap: 4 }
      deep:  { depthCap: 16, trigger: [allRequestedRefsDepthCapped, allReadyValuesUniform], rootPolicy: allRootsWithinCap }
```

`exp-007` added a one-line microturn tiebreaker, `preferArvnCubesTrainChoice` (`scopes: [microturn]`, weight 50), so the FITL Train micro-decision picks the `arvn-cubes` enum option instead of `rangers`. (Train's `arvn-cubes` branch places up to 6 ARVN cube tokens per Train; the `rangers` branch places 1-2. See `data/games/fire-in-the-lake/30-rules-actions.md` `train-arvn-profile`.)

Per-seed wall-clock with `arvn-cubes` active, `--max-turns 200`, serial (`campaigns/fitl-arvn-agent-evolution/diagnose-trainchoice-perf.mjs`):

```
seed 1000: 22-24s   seed 1004: 113s   seed 1008: 146s   seed 1012: 65s
seed 1001: 63s      seed 1005: 132s   seed 1009: 65s    seed 1013: >15 min — never completed
seed 1002: 29s      seed 1006: 19s    seed 1010: 37s
seed 1003: 33s      seed 1007: 19s    seed 1011: 22s
```

Baseline (with `rangers`, no `preferArvnCubesTrainChoice`) completes the whole 15-seed tournament in a few minutes.

**Isolation probe (decisive)** — seed 1013, `arvn-cubes` active:
- `arvn-evolved` deep preview (the `inner` block above): **>15 min, never completed**.
- `arvn-evolved` with the `preview.inner` block **stripped** (shallow preview): **5.1 s** for a full terminal game (248 decisions).

So the kernel handles cube-heavy play and large boards fine. The cost is entirely in the deep-preview synthetic-completion path.

---

## 3. The Cost Is in TypeScript, Not WASM

CPU profile of seed 1000 with `arvn-cubes` active (`node --cpu-prof` on `diagnose-trainchoice-perf.mjs --only 1000`, ~24 s run, 22 783 samples):

```
self-time classification:
  WASM:          0.9%
  TS engine:    87.7%
  node builtin:  0.6%   (GC counted under "other")
  other:        10.7%   (6.2% is the garbage collector)
```

Top self-time functions:

| % self | ms | Function | Source |
|---|---|---|---|
| 6.62% | 1613 | `buildEncodedState` | `kernel/encoded-state/view.ts` |
| 6.22% | 1516 | (garbage collector) | — |
| 4.29% | 1046 | `indexByString` | `kernel/encoded-state/layout.ts` |
| 3.25% | 791 | `canonicalKey` | `cnl/policy-bytecode/feature-table.ts` |
| 2.85% | 695 | `zobristKey` | `kernel/zobrist.ts` |
| 2.38% | 579 | `indexByString` | `kernel/encoded-state/view.ts` |
| 1.95% | 475 | `compareStrings` | `kernel/encoded-state/layout.ts` |
| 1.88% | 458 | `buildFeatureTable` | `cnl/policy-bytecode/feature-table.ts` |
| 1.70% | 414 | `buildExpressionFeatureTable` | `cnl/policy-bytecode/compile.ts` |
| 1.64% | 400 | `collectTokenScalarStringValues` | `kernel/encoded-state/view.ts` |
| 1.43% | 347 | `buildEncodedStateLayout` | `kernel/encoded-state/layout.ts` |
| 1.36% | 330 | `compareStrings` | `cnl/policy-bytecode/feature-table.ts` |
| 1.08% | 264 | `canonicalizeFingerprintValue` | `kernel/stable-fingerprint.ts` |
| 1.05% | 256 | `add` (feature-table builder) | `cnl/policy-bytecode/feature-table.ts` |
| 0.97% | 235 | `sortObjectKeys` | `cnl/policy-bytecode/feature-table.ts` |
| 0.92% | 223 | `collectTokenOccurrences` | `kernel/encoded-state/view.ts` |
| 0.86% | 210 | `collectSetupTokenIds` | `kernel/encoded-state/layout.ts` |

Grouping by subsystem:
- **`kernel/encoded-state/*` construction** (`buildEncodedState`, `buildEncodedStateLayout`, `indexByString` ×2, `compareStrings`, `collectTokenScalarStringValues`, `collectTokenOccurrences`, `collectSetupTokenIds`): **~20% of total self-time.**
- **`cnl/policy-bytecode/*` feature-table construction** (`canonicalKey`, `buildFeatureTable`, `buildExpressionFeatureTable`, `compareStrings`, `add`, `sortObjectKeys`): **~10% of total self-time.**
- Actual game move-enumeration (`eval-query` `countMatchingTokens` 1.41%, `countTokensInZoneQuery` 1.28%): **~3%.**

The work is overwhelmingly *constructing* derived data structures, not running game logic.

---

## 4. Root Cause

### 4.1 The deep preview drives many inner microturn-option evaluations

`driveSyntheticCompletion` (`policy-preview.ts:864`) runs the inner microturn drive for each previewed candidate. With `strategy: continuedDeepening`, `depthCap: 16` (deep pass), `maxOptions: 8`, it drives a bounded but large tree of inner microturns. Each inner microturn option is scored by `scoreMicroturnOptionWithContributions` (`microturn-option-eval.ts`).

### 4.2 Each microturn-option evaluation constructs a fresh `PolicyEvaluationContext`

`microturn-option-eval.ts:113`:

```ts
const evaluation = new PolicyEvaluationContext({
  def, state, playerId, seatId, catalog, parameterValues,
  trustedMoveIndex: EMPTY_TRUSTED_MOVE_INDEX,
  completion: { request, optionValue, optionIndex },
  /* previewOption?, lookupOption, scheduleOption, candidateParamOption, runtime? */
}, []);
```

The input object **does not include `encodedStateLayout` or `encodedState`** — there is no field threading the cached layout down this path.

### 4.3 The constructor rebuilds the static encoded-state layout

`policy-evaluation-core.ts:369-392` (`PolicyEvaluationContext` constructor):

```ts
this.encodedStateLayout = input.encodedStateLayout ?? buildEncodedStateLayout(input.def);
this.encodedState = input.encodedState ?? tryBuildEncodedState(input.state, this.encodedStateLayout);
```

`buildEncodedStateLayout(def)` is a **pure function of the `GameDef`** — the layout is static for the life of a game. `policy-eval.ts:320` even maintains a `WeakMap<GameDef, …>` cache (`getPolicyEncodedStateLayout`). But the `PolicyEvaluationContext` constructor calls `buildEncodedStateLayout(input.def)` directly, **bypassing that cache**, so the microturn path rebuilds the full layout for every inner option evaluation. (`buildEncodedStateLayout` self-time 1.43%, plus its helpers `indexByString` 4.29% and `compareStrings` 1.95% and `collectSetupTokenIds` 0.86% — most of which is the layout rebuild.)

### 4.4 The per-instance bytecode cache is empty on every construction → full feature-table rebuild per consideration

`policy-evaluation-core.ts:354`:

```ts
private readonly compiledExprBytecodeCache = new WeakMap<CompiledPolicyExpr, ReturnType<typeof compilePolicyBytecode>>();
```

This cache is an **instance field** — it is empty for every freshly-constructed `PolicyEvaluationContext`. `evaluateCompiledExprWithVm` (`policy-evaluation-core.ts:928-936`):

```ts
let bytecode = this.compiledExprBytecodeCache.get(expr);
if (bytecode === undefined) {
  bytecode = compilePolicyBytecode(expr, this.input.def, this.encodedStateLayout);
  this.compiledExprBytecodeCache.set(expr, bytecode);
}
```

Because the cache starts empty, **every consideration's bytecode is recompiled on every microturn-option evaluation.** And `compilePolicyBytecode` → `buildExpressionFeatureTable(def, layout, expr)` (`compile.ts:43`) → `buildFeatureTable(def, layout)` (`compile.ts:64`):

```ts
const refsByKey = new Map(buildFeatureTable(def, layout).refs.map((ref) => [canonicalKey(ref), ref]));
```

`buildFeatureTable(def, layout)` (`feature-table.ts:156`) is a **pure function of the static `(def, layout)`** and **has no cache at all**. It `forEachCompiledPolicyExpr(def, …)` (`feature-table.ts:165`) — a **full scan of every compiled policy expression in the entire GameDef** — on every call. So for D microturn-option evaluations × C considerations, the full GameDef-wide feature table is rebuilt D×C times, each rebuild identical.

### 4.5 Why `arvn-cubes` triggers the blowup

`buildEncodedState`, `buildEncodedStateLayout`, and the feature-table builders all iterate over **tokens** (`collectTokenScalarStringValues`, `collectTokenOccurrences`, `collectSetupTokenIds`, token-keyed string indexing). `arvn-cubes` Train places up to 6 ARVN cube tokens per Train (vs 1-2 rangers). Over a 200-turn game with repeated Trains, the ARVN piece count climbs steeply. So:

- each rebuilt structure gets slower (more tokens to scan), **and**
- the games run longer (more decisions to terminal — a known effect of richer preview state, per POLPREVDRIVE-001's "game-length amplification"),

multiplying together into the observed >15-minute, never-completing seed 1013. With `rangers`, the token count stays low, so the same per-instance rebuilds are cheap enough to be invisible.

### 4.6 Why no existing gate caught it

The POLPREVDRIVE series added a preview-perf gate (`POLPREVDRIVE-006`) and the `profile-fitl-preview-drive.mjs` harness, but those exercise the **baseline** FITL profiles at `--maxTurns 10` on small early-game boards. They never reach the large-board regime where the per-instance rebuild constant factor dominates. The POLPREVDRIVE series fixed the `buildTokenStateIndex` and `resolveRef` rebuild seams; `buildEncodedStateLayout`, `buildFeatureTable`, and the per-instance bytecode cache are residual seams of the same class that the series did not cover.

---

## 5. Proposed Fix

All three are the same pattern POLPREVDRIVE-002/004/007 used: **cache the static/derived structure across `PolicyEvaluationContext` instances instead of rebuilding it per instance.** None changes any kernel semantics — they are pure perf changes, gated by the existing replay-identity / Zobrist-parity tests (Foundation #8).

1. **Encoded-state layout** — make the `PolicyEvaluationContext` constructor resolve the layout through the existing per-`GameDef` `WeakMap` cache (`getPolicyEncodedStateLayout`) instead of calling `buildEncodedStateLayout(input.def)` directly; or thread `encodedStateLayout` through the `microturn-option-eval.ts` construction site (and any other site that omits it). File: `packages/engine/src/agents/policy-evaluation-core.ts` (and `microturn-option-eval.ts` if threading).

2. **Feature table** — add a `WeakMap<GameDef, FeatureTable>` (or keyed on the `EncodedStateLayout`) cache around `buildFeatureTable(def, layout)`. It is a pure function of static inputs. File: `packages/engine/src/cnl/policy-bytecode/feature-table.ts`.

3. **Compiled bytecode** — promote `compiledExprBytecodeCache` from a per-`PolicyEvaluationContext`-instance `WeakMap` to a cache shared across instances for the same `(GameDef, layout)` — e.g. a module-level `WeakMap<GameDef, WeakMap<CompiledPolicyExpr, Bytecode>>`, or a cache threaded through the runtime-resources object the way POLPREVDRIVE-002 threaded the token-state-index cache. Files: `packages/engine/src/agents/policy-evaluation-core.ts` (+ wherever the shared cache is owned).

**Caveat — campaign mutable boundary**: the `fitl-arvn-agent-evolution` campaign's mutable surface (Tier 2) covers `packages/engine/src/agents/**` but **not** `packages/engine/src/cnl/policy-bytecode/**` or `packages/engine/src/kernel/encoded-state/**`. Fix #2 touches `cnl/policy-bytecode/`. So this is reported rather than applied inside the campaign loop; it warrants its own spec/ticket with the standard replay-identity + Zobrist-parity verification.

**Verification for the fix**: re-run `diagnose-trainchoice-perf.mjs` with `arvn-cubes` active across all 15 seeds — seed 1013 must complete, and the per-seed times should approach the shallow-preview regime. Existing gates: `spec-140-replay-identity.test.js`, the `zobrist-incremental-parity-fitl-*` shards, `pnpm -F @ludoforge/engine test:integration:fitl-rules`, and the `profile-fitl-preview-drive.mjs` perf witness (which should be extended with a large-board / cube-heavy case so this seam stays gated — see §4.6).

---

## 6. Impact on Agent-Policy Representability

This is why it matters beyond one experiment. The campaign's job is to evolve a *realistic, strong* ARVN agent. Two of the most natural, rules-correct moves a real ARVN player makes —

- placing **ARVN cubes** (not rangers) when Training, to build COIN-controlled population, and
- using a **deep preview** to evaluate moves well —

are individually fine but **cannot currently be combined**: the deep preview's per-microturn-option rebuilds make cube-heavy play infeasibly slow to simulate. The agent is effectively forced to either play a weak Train (rangers only) or use a shallow preview. That is a representability constraint imposed by an implementation inefficiency, not by the game or by any bounded-computation principle — exactly the class of issue the campaign directive asked to surface.

---

## 7. Reproduction Recipe

1. In `data/games/fire-in-the-lake/92-agents.md`, add to `library.considerations`:
   ```yaml
   preferArvnCubesTrainChoice:
     scopes: [microturn]
     weight: 50
     value: { boolToNumber: { eq: [ { ref: microturn.option.value }, { const: arvn-cubes } ] } }
   ```
   and append `preferArvnCubesTrainChoice` to `profiles.arvn-evolved.use.considerations`.
2. `pnpm -F @ludoforge/engine build`.
3. Per-seed timing: `node campaigns/fitl-arvn-agent-evolution/diagnose-trainchoice-perf.mjs --only 1013 --max-turns 200` → does not complete in 15 min.
4. Isolation: strip the `preview.inner` block from `arvn-evolved`, repeat step 3 → completes in ~5 s.
5. CPU profile: `node --cpu-prof --cpu-prof-dir=/tmp/p campaigns/fitl-arvn-agent-evolution/diagnose-trainchoice-perf.mjs --only 1000 --max-turns 200`, then aggregate `.cpuprofile` self-time by `callFrame` — `build*` functions dominate, WASM ≈ 1%.

`diagnose-trainchoice-perf.mjs` is committed on the campaign branch (`infra: add diagnose-trainchoice-perf.mjs`).
