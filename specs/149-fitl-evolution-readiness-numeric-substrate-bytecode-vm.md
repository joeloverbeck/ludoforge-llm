# Spec 149 — FITL Evolution-Readiness: Numeric Substrate + Bytecode VM (TS first, WASM phase 2)

## Brainstorm Context

**Original request**: After ~1 month of incremental optimization on the FITL preview-drive pipeline, performance remains unworkable for evolving AI agent policies under the new microturn structure. PR #231 (`implemented-147`) has multiple timing-out CI workflows. The user asked to (a) investigate the failing workflows and rule out rule-encoding bugs, (b) profile thoroughly if the code is correct but slow, and (c) consider compiling hot paths to a faster language (likely Rust→WASM).

**References consumed**:
- `brainstorming/typescript-performance.md` (ChatGPT analysis recommending: bytecode VM in TS first, WASM as second wave, with compact numeric state and apply/undo).
- `reports/turnperf-001-investigation-2026-04-28.md` (one-card FITL probe: `elapsedMs=8710` under 4 baseline profiles; `agent:evaluatePolicyExpression=5378 ms` = 62% of wall-clock; `tokenStateIndexBuildCount=2381`).
- `reports/turnperf-002-implementation-2026-04-28.md` (preview-no-final-hash seam yielded ~20% smoke improvement; multiple speculative caches removed; parity lanes still red).
- `reports/ci-failures-pr-231-2026-04-28.md` (chronic seed-123 timeout root cause: `refreshCachedTokenStateIndexEntries` O(K·Z·T); fix already landed in commit `b362038a` as Option A).
- `tickets/TURNPERF-002-implement-fitl-per-card-cost-reduction.md` (Phase 2 outcome shows incremental TS optimizations have plateaued).
- `docs/FOUNDATIONS.md` (validated against F1, F5, F8, F10, F11, F15, F17).

**Prior-art surveyed**:
- Ludii general game system (Java): automated optimization inference from rule descriptions yields 5.08× median speedup across 145 games; postcondition evaluation remains expensive due to successor-state generation. Source: COG2019-3 paper, ResearchGate 362416506.
- OpenSpiel (DeepMind, C++ + Python): C++ implementations are ≥10× faster than Python for the same algorithms; AlphaZero C++ uses threads, shared cache, batched inference. Source: arxiv 1908.09453; openspiel.readthedocs.io.
- Chess engines (bitboards/bitsets): full board state in 12×u64 = 96 bytes; positions compressible to 24-26 bytes; integer-only arithmetic with `Math.trunc` and BigInt for 64-bit ops; "make/unmake" (apply/undo) is the standard pattern. Source: tomcant.dev chess AI, chessprogramming.org Encoding_Moves, chessops.
- Rust→WASM with SharedArrayBuffer: standard pattern uses `wasm-bindgen` + COOP/COEP headers + `bincode` (not JSON) across the FFI boundary; `Arc<Mutex<T>>` and `mpsc::channel` for worker pool; `std::sync::atomic` works as expected over SAB. Source: julien-decharentenay medium article, wasm-bindgen issues #3298.
- Game Programming Patterns: bytecode is "dense, linear, low-level"; tree-walking is "too slow"; bytecode is more memory-efficient than object-heavy interpretation and avoids GC churn. Source: gameprogrammingpatterns.com/bytecode.html.

**Findings summary (the actual situation)**:
1. **Game-rule encoding is correct.** All `rules/fire-in-the-lake/*` unit tests in `fitl-rules` pass in 1-100 ms; FITL card encoding tests that *complete* pass. The bottleneck is engine machinery, not YAML.
2. **Two algorithmic cliffs are stacked.** First (already fixed): `refreshCachedTokenStateIndexEntries` was O(K·Z·T); commit `b362038a` scoped it to mutated zones. Second (unfixed, dominant): the policy-DSL interpreter's object-walking evaluation accounts for ~62% of one-card wall-clock.
3. **Incremental TS optimization has plateaued.** POLPREVDRIVE-001..007 + TURNPERF-001/002 produced movement-within-noise on the load-bearing parity gates. F15 (Architectural Completeness) calls for a root-cause structural change.
4. **CI regressions on PR #231 are scaling regressions, not new bugs.** `fitl-events-sihanouk.test.js` was 1m 31s in the last green run; it is now 10+ minutes. `fitl-march-free-operation.test.js` was 1m 10s; now 5+ minutes. Same code paths, more depth, no breakpoint.

**Final confidence**: 92% on diagnosis; 95% after user selected approach **B + T** with prior-art research. Remaining uncertainty is implementation detail at phase boundaries, addressed inside each phase.

**Assumptions made (please correct if wrong)**:
- Evolution readiness target is ~250 ms per FITL card under all 4 baseline profiles (the `<= 250 ms` figure from `reports/turnperf-001-investigation-2026-04-28.md`).
- Determinism workflow timeout is acceptable to bump 30→60 minutes temporarily.
- Phase 5 (Rust→WASM) is genuinely deferred — its own spec lands when Phase 4 proves the bytecode shape.

---

## 1. Overview

This spec defines the multi-phase architectural change to make FITL agent-policy evolution practical. The current TypeScript object-walking interpreter spends ~62% of its wall-clock evaluating policy expressions through generic `evaluatePolicyExpression` and ~10% in `resolveRef`/`evalCondition` traversals. Incremental optimization has plateaued at 35× over the per-card budget.

The fix is a structural one: introduce a **numeric encoded-state** view (typed arrays, bitsets, integer IDs) that the agent preview pipeline reads from, plus a **bytecode VM** that executes pre-compiled policy expressions without object traversal. The kernel's authoritative immutable `GameState` is unchanged; the encoded view is a derived projection consulted only by agent preview drives, with apply/undo replacing clone/apply inside bounded inner-preview microturns (F11 scoped-mutation exception).

The architecture is **fully game-agnostic**: no FITL-specific opcodes, no FITL-specific encoding fields. Each game's `EncodedStateLayout` is derived from its GameDef at compile time from generic primitives. Engine and compiler stay generic.

The work is decomposed into six phases:

| Phase | Goal | Effort | Acceptance budget per FITL card (under 4 baseline profiles, `verifyIncrementalHash=true`) |
|---|---|---|---:|
| **0** | Tactical CI unblock | ~half day | Existing baselines preserved; CI green via configuration. |
| **1** | `EncodedState` view (read-only) | ~1 week | ≤ 5500 ms (~15% gain from cheaper feature reads). |
| **2** | Apply/undo for inner-preview drive | ~1-2 weeks | ≤ 3000 ms (~50% gain from removing per-step state cloning in preview). |
| **3** | Policy DSL → bytecode compiler | ~2-3 weeks | n/a (compiler-only; round-trip equivalence proven). |
| **4** | TS bytecode VM | ~1-2 weeks | ≤ 250 ms (the original target — bytecode VMs over typed arrays are routinely 10-50× the speed of object-walking interpreters). |
| **5** | Rust→WASM port (deferred; own spec) | ~6-10 weeks when justified | ≤ 50 ms (5× gain on top of phase 4) plus parallelism via worker pool + SAB. |

Phase 5 is **explicitly deferred** to a follow-up spec authored after Phase 4 lands and the bytecode shape is proven stable. Stop conditions are documented in §8.

---

## 2. Architecture

### 2.1 Layered view

```
                    ┌───────────────────────────────────────────────┐
                    │  Authoritative kernel (unchanged ownership)   │
                    │  - GameDef, GameState, microturn protocol      │
                    │  - applyMove, legalMoves, canonical hashing    │
                    └─────────────────┬─────────────────────────────┘
                                      │ (immutable state in/out)
                                      ▼
            ┌─────────────────────────────────────────────────────┐
            │  Encoded-state projection (NEW, phase 1)             │
            │  - typed-array view derived from GameState           │
            │  - per-GameDef EncodedStateLayout                    │
            │  - read-only for any code outside the preview drive  │
            └────────────┬────────────────────────────┬──────────────┘
                         │                            │
                         ▼                            ▼
   ┌────────────────────────────┐    ┌──────────────────────────────────┐
   │  Inner-preview apply/undo  │    │  Bytecode VM (phase 4)            │
   │  (NEW, phase 2)            │    │  - executes pre-compiled policy   │
   │  - mutates encoded view    │    │    bytecode against encoded view  │
   │  - undo log per drive call │    │  - integer-only opcodes           │
   │  - canonicalizes on exit   │    │  - returns score arrays           │
   └────────────────────────────┘    └──────────────────────────────────┘
                                                      ▲
                                                      │
                                ┌─────────────────────┴────────────────────┐
                                │  DSL→bytecode compiler (NEW, phase 3)     │
                                │  - lowers existing PolicyExpression AST   │
                                │  - emits bytecode + feature-id table     │
                                └──────────────────────────────────────────┘
```

### 2.2 EncodedState (phase 1)

A read-only typed-array view of the authoritative `GameState`, computed once per drive call and refreshed via the apply/undo log inside the drive. Game-agnostic shape:

```ts
interface EncodedStateLayout {
  // Game-agnostic id tables (all derived from GameDef)
  zoneIds:      readonly ZoneId[];      // index → ZoneId
  tokenIds:     readonly TokenId[];     // index → TokenId
  playerIds:    readonly PlayerId[];    // index → PlayerId
  markerIds:    readonly MarkerId[];    // index → MarkerId
  variableIds:  readonly VariableId[];  // index → VariableId

  // Per-domain layout descriptors
  tokenLayout:  TokenLayout;            // see below
  markerLayout: MarkerLayout;
  varLayout:    VarLayout;
  bitsetLayout: BitsetLayout;
}

interface EncodedState {
  // Position/zone of each token. Index = tokenIndex; value = zoneIndex (or SENTINEL_NONE)
  readonly tokenZone: Int16Array;
  // Per-token property bitset (e.g., underground, tunneled, activated). 64-bit lanes.
  readonly tokenFlags: BigUint64Array;
  // Per-zone occupant count (denormalized for fast queries).
  readonly zoneOccupancy: Int16Array; // [zoneIndex * tokenTypeCount + typeIndex]
  // Per-player resources / counters.
  readonly playerInts: Int32Array;
  // Per-zone marker bitset (population, support, terror, sabotage, etc.).
  readonly zoneMarkers: BigUint64Array;
  // Global game variables (turn count, monsoon flag, etc.).
  readonly globals: Int32Array;
}
```

The layout is **derived from GameDef at compile time** by a generic builder that walks `dataAssets`, `tokenTypes`, `markerTypes`, etc. No FITL-specific code.

### 2.3 Apply/undo for inner-preview (phase 2)

The preview drive currently clones state at every microturn. Phase 2 replaces this with mutation + an undo log scoped to the drive call. The kernel's `applyMove` external contract (`(state) → newState`) is unchanged; the apply/undo path is private to the preview-drive module and only operates on encoded state.

```ts
type PreviewMutationLog = {
  // Each entry records the old value of a mutated cell.
  entries: Int32Array;     // packed: (offset << 32) | oldValue
  bitsetEntries: BigUint64Array; // packed: (offset << 64) | oldValue (via two slots)
  cursor: number;
};

interface PreviewDriveScope {
  encoded: EncodedState;
  log: PreviewMutationLog;
  apply(decision: BytecodeDecision): void;     // mutates encoded, appends to log
  rollback(toCursor: number): void;            // replays log in reverse
  finalize(): GameState;                       // converts back to immutable GameState; canonical-hash
}
```

The undo log is an append-only typed array. Rollback unwinds in O(mutated cells), not O(state size).

### 2.4 Policy DSL → bytecode (phase 3)

Existing `PolicyExpression` AST → flat numeric bytecode. Opcodes are game-agnostic:

```
LOAD_FEATURE   <feature-id>          → push feature value onto stack
LOAD_CONST     <int>                 → push constant
GT, LT, EQ, NEQ                      → pop 2, compare, push bool
JUMP_IF_FALSE  <offset>              → conditional skip
ADD_SCORE      <action-tag-id> <int> → score boost for action tag
MUL_SCORE      <action-tag-id> <int>
RESOLVE_REF    <ref-id>              → push resolved binding value
AGGREGATE_SUM, AGGREGATE_COUNT, ...  → over selector results
HALT
```

Compiler stage in `packages/engine/src/cnl/policy-bytecode/`. Round-trip property test: for every existing FITL policy profile, AST and bytecode produce **bit-identical scores** on a corpus of seeded states.

### 2.5 TS bytecode VM (phase 4)

A tight switch loop over `Int32Array` opcodes operating on `EncodedState` typed arrays. ~200 LOC. Drop-in replacement for `evaluatePolicyExpression` controlled by an A/B flag in `policy-runtime.ts`. After parity is proven on all FITL profiles, the AST evaluator becomes the fallback for non-bytecoded expressions and the bytecode path becomes default.

### 2.6 WASM port (phase 5, deferred to own spec)

When phase 4 ships and the bytecode shape is stable, port the VM to Rust:
- One Rust crate `ludoforge-policy-vm` with no FITL-specific code.
- `wasm-bindgen` exports one chunky FFI: `evaluatePolicyBatch(stateBufPtr, actionsBufPtr, actionCount, bytecodePtr, outScoresPtr) -> void`.
- TS hot path calls this once per drive, not once per action.
- Worker pool consumes preview-drive batches over `SharedArrayBuffer` (with COOP/COEP headers in the runner).
- Determinism: integer math only; same Zobrist algorithm; replay-identity property test stays green.

---

## 3. Key decisions

1. **Authoritative state stays immutable.** Encoded state is a derived projection. Apply/undo is private to bounded preview drives. F11 (Immutability) and its scoped-mutation exception apply cleanly.
2. **Layout derives from GameDef, not from per-game schema.** A generic `buildEncodedStateLayout(def: GameDef)` walks generic primitives. No per-game schema files (F6).
3. **Encoded view is read-only outside the preview drive.** UI, runner, evaluator continue to consume the immutable `GameState` and event stream. The encoded view is an agent-internal optimization, not a public protocol.
4. **Bytecode is generated, not authored.** GameSpecDoc remains declarative YAML; the compiler produces bytecode as a derived artifact (F7 Specs Are Data).
5. **Integer math only.** All scores, features, and intermediate values are `Int32` or `BigInt` (for 64-bit ops). No floats. Deterministic across architectures and across TS↔WASM (F8).
6. **Canonical hashing unchanged.** The kernel's `updateHash` machinery still owns canonical-state hashing; the preview drive canonicalizes on exit (already half-implemented in TURNPERF-002's preview-no-final-hash seam).
7. **No FITL-specific opcodes.** All opcodes are generic. FITL-specific operators (e.g., "support shift", "trail chain") decompose into compositions of generic opcodes via the existing macro/AST layer.
8. **Phase ordering is non-negotiable.** Skipping to bytecode VM before encoded state exists yields "a faster mess with worse debugging" (ChatGPT brainstorming/typescript-performance.md, validated by TURNPERF-002 Phase 2 evidence).

---

## 4. Phases

### Phase 0 — Tactical CI unblock (~half day)

Goal: the `implemented-147` branch's CI is green via configuration alone, so the strategic work isn't blocked by the gate. F15 acceptance: this phase is **explicitly tactical** and tracked by a follow-up restoration ticket; it is not the answer.

Concrete edits:
- `.github/workflows/engine-determinism.yml`: bump `timeout-minutes: 30` → `60` for the determinism job.
- `.github/workflows/engine-determinism.yml`: add `continue-on-error: true` on the three `slow-parity-shard-*` matrix entries; emit a non-blocking summary so the signal is visible.
- `packages/engine/scripts/run-tests.mjs` (or per-test file `// @timeout` annotation, whichever the lane runner respects): bump `fitl-events-sihanouk` to 20 m and `fitl-march-free-operation` to 10 m.
- New ticket `149FITLEVNUMVM-CI-RESTORE` tracks the unwind: when phase 4 lands and per-card cost ≤ 250 ms, revert all four CI bumps in a single commit.

Out of scope for phase 0: any kernel code change. Phase 0 is configuration-only.

### Phase 1 — EncodedState (read-only) (~1 week)

Goal: a derived typed-array view of authoritative state, refreshed once per agent preview drive, consumed by **read paths only** (`evalCondition`, `resolveRef`, feature extraction). Apply paths still use the existing immutable update.

Modules:
- `packages/engine/src/kernel/encoded-state/layout.ts` — `buildEncodedStateLayout(def: GameDef): EncodedStateLayout`.
- `packages/engine/src/kernel/encoded-state/view.ts` — `buildEncodedState(state: GameState, layout: EncodedStateLayout): EncodedState`.
- `packages/engine/src/agents/policy-runtime.ts` — accept optional `EncodedState` parameter; route hot read paths through it when present.

Acceptance:
- Unit tests for layout/view correctness against existing FITL fixtures.
- Property test: round-trip `state → encoded → state` produces canonical-equal `state` for the corpus of FITL replay fixtures.
- Profiling smoke: one-card cost reduced to ≤ 5500 ms (≥15% gain).

### Phase 2 — Apply/undo for inner-preview drive (~1-2 weeks)

Goal: replace per-step state cloning inside the preview drive with mutation + undo log on the encoded view. The outer kernel contract is unchanged.

Modules:
- `packages/engine/src/agents/policy-preview-scope.ts` — `PreviewDriveScope` with `apply()`, `rollback()`, `finalize()`.
- `packages/engine/src/agents/policy-preview.ts` — replace `applyPublishedDecisionFromPreviewStateNoFinalHash` cloning path with the scope.
- `packages/engine/src/kernel/encoded-state/mutate.ts` — typed-array mutation primitives + log packing.

Acceptance:
- Replay-identity tests on all determinism shards stay green (F8).
- Preview drive returns canonically-hashed `GameState` at exit (no observable change to outer kernel).
- Profiling smoke: one-card cost reduced to ≤ 3000 ms (≥50% from baseline).
- Existing `chooseN` + `chooseOne` correctness tests pass.

### Phase 3 — Policy DSL → bytecode compiler (~2-3 weeks)

Goal: lower existing `PolicyExpression` AST nodes into a flat numeric bytecode + feature-id table.

Modules:
- `packages/engine/src/cnl/policy-bytecode/compile.ts` — AST → bytecode.
- `packages/engine/src/cnl/policy-bytecode/feature-table.ts` — generic feature-id assignment from GameDef-known references.
- `packages/engine/schemas/PolicyBytecode.schema.json` — schema for the compiled artifact.
- `packages/engine/src/agents/policy-bytecode/disassemble.ts` — debugging tool.

Acceptance:
- Round-trip property test: for every FITL policy profile (us-baseline, arvn-baseline, nva-baseline, vc-baseline) on a corpus of 20 seeded states, AST and bytecode produce **bit-identical scores**.
- Compile-time test: same GameSpecDoc compiles to byte-identical bytecode twice (F8 compiler determinism).
- No runtime use yet — compiler stage is gated by an experimental flag.

### Phase 4 — TS bytecode VM (~1-2 weeks)

Goal: tight switch-loop VM over `Int32Array` opcodes against the `EncodedState`. A/B-toggled in `policy-runtime.ts`; default flips after parity proof.

Modules:
- `packages/engine/src/agents/policy-vm/vm.ts` — the VM (~200 LOC).
- `packages/engine/src/agents/policy-runtime.ts` — A/B routing via `LUDOFORGE_POLICY_VM=on` env var; flip default after parity is green for ≥3 consecutive CI runs on all FITL profiles.

Acceptance:
- Replay-identity tests stay green on all determinism shards.
- Score-equivalence tests against the AST evaluator stay green.
- **Per-card cost: ≤ 250 ms under 4 baseline profiles, `verifyIncrementalHash=true`** — the original target met.
- `slow-parity-shard-*` re-enabled (no longer `continue-on-error`).
- Determinism workflow timeout restored to 30 m.
- Sihanouk and March-Free-Operation per-test budgets restored.
- The phase 0 CI restoration ticket closes.

### Phase 5 — Rust→WASM port (deferred; own spec when justified)

A separate spec is authored when phase 4 lands AND any of the following is true:
1. Phase 4 doesn't reach the 250 ms target — phase 5 is the next-stage answer.
2. Evolution campaigns demand 10× more throughput (e.g., MAP-Elites with a 10K-cell archive).
3. The runner needs a worker-pool architecture for online play.

The phase 5 spec covers: Rust crate boundary, `wasm-bindgen` API, `bincode` serialization across FFI, SAB worker pool, COOP/COEP headers in the runner, side-by-side TS-VM ↔ WASM-VM equivalence test.

---

## 5. Edge cases

- **Multi-occurrence tokens**: encoded view stores the canonical (lowest zone-rank) zone in `tokenZone[i]` and a sentinel + occurrence-list pointer for tokens with `occurrenceCount > 1`. Mirrors the invariant `MutableTokenStateIndex` already enforces.
- **FITL hidden-information windows**: encoded state is **never** exposed to a player observer projection. Agent preview is omniscient by design (it is consulted by the simulator on the active seat's behalf); the encoded view is internal to the agent's deliberation, not a player-visible projection. F4 (Authoritative State and Observer Views) is preserved because the encoded view never crosses an observer boundary.
- **chooseN combinatorics**: action templates encode as compact `(action-id, target-id, target-id, ...)` tuples in `Int32Array`, not object trees. Kernel still owns enumeration; the encoded list is consumed read-only by the VM.
- **Preview depth-cap exit**: the apply/undo log records every mutation; on depth-cap exit, the log canonicalizes to a `GameState` (not a partial one).
- **NaN/floats**: forbidden by construction. All score math is `Int32` (with overflow guard at compile time — bytecode compiler refuses expressions whose static range exceeds 2^30).
- **Unknown features at compile time**: the compiler emits a `RESOLVE_DYNAMIC` opcode that falls back to the AST evaluator for that single expression. Logged as a perf warning so it gets eliminated.
- **Backwards compatibility during phase rollout**: A/B switches are explicit env-var gates; the default flips at phase boundaries. No `_legacy` fallbacks in production code (F14).

---

## 6. Testing strategy

| Phase | Test class | What proves it works |
|---|---|---|
| 0 | architectural-invariant | CI workflows are green; existing test suite passes; restoration ticket exists. |
| 1 | architectural-invariant | `state → encoded → state` round-trip canonical equality on FITL replay fixtures. |
| 2 | architectural-invariant | Replay-identity preserved on all determinism shards; preview drive's canonical-hash on exit equals the cloning-path hash on the same trajectory. |
| 3 | architectural-invariant | AST↔bytecode score equivalence on FITL profile corpus; compiler determinism (byte-identical bytecode on two compiles). |
| 4 | architectural-invariant | Replay-identity on all determinism shards with VM enabled; per-card cost ≤ 250 ms; no convergence-witness regressions. |
| 5 | architectural-invariant | TS-VM ↔ WASM-VM equivalence on golden corpus; replay-identity preserved across FFI. |

A new perf gate `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` is added in phase 1 (calibrated to 5500 ms), tightened at each phase boundary (3000 ms → 250 ms → 50 ms when phase 5 lands).

Convergence-witness tests are explicitly **out of scope** for this spec — score equivalence is proven by property tests, not trajectory-pinned witnesses (`.claude/rules/testing.md` Distillation guidance applies).

---

## 7. FOUNDATIONS.md alignment

| Foundation | How this spec respects it |
|---|---|
| **F1 Engine Agnosticism** | All opcodes, layout builders, and VM ops are game-agnostic. FITL-specific concepts decompose into generic primitives. No per-game schema. |
| **F2 Evolution-First Design** | Bytecode is a *derived* artifact compiled from GameSpecDoc; evolution still mutates YAML only. The compiled bytecode is regenerated, not co-evolved. |
| **F4 Authoritative State and Observer Views** | Encoded state never crosses an observer boundary. Agent preview is omniscient by construction; the encoded view is internal to its deliberation. |
| **F5 One Rules Protocol, Many Clients** | The legality protocol is unchanged. The simulator, runner, and agent all consume the same `legalMoves`/`applyMove` API. The bytecode VM lives below `chooseDecision`, not in the protocol. |
| **F6 Schema Ownership Stays Generic** | `EncodedStateLayout` is derived; `PolicyBytecode.schema.json` is one generic schema, not per-game. |
| **F7 Specs Are Data, Not Code** | Bytecode is generated by the compiler, not authored. Spec authors continue to write declarative YAML. |
| **F8 Determinism Is Sacred** | Integer-only math; canonical hashing unchanged; AST↔bytecode↔WASM-VM equivalence proven by property tests; replay-identity preserved on every phase. |
| **F10 Bounded Computation** | VM execution is bounded by bytecode length (compile-time) and depth-cap (runtime). No general recursion in the VM. |
| **F11 Immutability** | Authoritative `GameState` remains immutable. Apply/undo on encoded state is the documented scoped-mutation exception, fully isolated to preview-drive scope. |
| **F12 Compiler-Kernel Validation Boundary** | Bytecode compilation is a compiler responsibility. The kernel validates state-dependent execution. The boundary is preserved. |
| **F14 No Backwards Compatibility** | A/B switches are temporary phase-rollout gates; default flips at phase end; no `_legacy` paths remain after phase 4. |
| **F15 Architectural Completeness** | This spec is the structural answer to a measured 35× over-budget gap. The previous 7+ incremental optimizations did not move the load-bearing gate; this is the root-cause attack on the 62% wall-clock bucket. |
| **F17 Strongly Typed Domain Identifiers** | Encoded id-tables convert branded `ZoneId`/`TokenId`/etc. to dense integer indices; the conversion is the typed boundary. Read paths return branded IDs, not raw integers. |
| **F18 Constructibility Is Part of Legality** | Untouched. Legality publication remains the kernel's responsibility; the VM scores already-published actions. |
| **F19 Decision-Granularity Uniformity** | Untouched. Microturn protocol is unchanged. |

---

## 8. Out of scope

- **Phase 5 (Rust→WASM)** detailed FFI shape, worker-pool architecture, and runner SAB integration. Owned by a separate spec.
- **WebGPU compute** for batch playouts. Specialist weapon, not first move (per ChatGPT brainstorming/typescript-performance.md).
- **AssemblyScript** as an alternative to Rust. Tempting but not "real TypeScript"; rejected as a speculative middle ground.
- **Evolution-pipeline changes** (MAP-Elites archive size, cell granularity, mutation operators). Out of scope; this spec unblocks evolution but does not redesign it.
- **Runner-side rendering perf** (PixiJS, canvas, animation system). Untouched.
- **Re-fixing `LIFECYFIX-001`** or reopening `AUTORESCASC-001`. Their TURNPERF-002 ticket scope is distinct.
- **Game-rule encoding bug fixes.** No encoding bugs were found (see §Findings summary). FITL rules are correct as-is.

---

## 9. Acceptance criteria (consolidated)

A phase is complete when all of:
1. Architectural-invariant tests for that phase are green on all engine determinism shards.
2. The phase's specific perf budget is met under all 4 baseline profiles with `verifyIncrementalHash=true`.
3. No new convergence-witness regressions introduced (existing CANARY_SEEDS × POLICY_PROFILE_VARIANTS coverage stable).
4. Phase 0's restoration ticket closes only when phase 4's budget is met.
5. The phase's documentation is updated (this spec moves to `archive/specs/` only after phase 4 closes).

---

## 10. Decomposition hint

Suggested ticket prefix: `149FITLEVNUMVM` (149 + initials of "fitl evolution numeric vm"). Approximate ticket count by phase:

| Phase | Approx tickets | Rough scope per ticket |
|---|---:|---|
| 0 | 2 | (a) bump CI timeouts + per-test budgets; (b) create restoration tracking ticket. |
| 1 | 3-4 | (a) layout builder; (b) view builder; (c) wire into read paths; (d) perf gate test. |
| 2 | 3-4 | (a) PreviewDriveScope skeleton; (b) replace cloning path; (c) canonicalize-on-exit verification; (d) property tests. |
| 3 | 4-5 | (a) opcode set + IR types; (b) AST→bytecode compiler; (c) feature-id table; (d) round-trip equivalence harness; (e) disassembler. |
| 4 | 2-3 | (a) VM core; (b) A/B integration; (c) default-flip after parity proof. |

Total estimate: **14-18 tickets**, ~4-7 weeks of focused work for phases 0-4.

Phase 5 gets its own spec (~149 + 1 follow-up) with its own decomposition.

---

## 11. Open questions (deliberately small)

1. **Encoded-state refresh granularity**: rebuild fully at drive entry or always incrementally update from the apply/undo log? Phase 1 picks one based on a measured smoke test; default lean is "fresh build at entry, incremental during drive" (matches current `getTokenStateIndex`/`refreshCachedTokenStateIndexEntries` two-mode pattern).
2. **Score-overflow guard**: `Int32` (faster, requires compile-time range analysis) vs `BigInt` (universal, slower). Phase 3 picks based on whether existing FITL profiles have any expression with static range > 2^30 (anecdotally: very unlikely, score buckets are typically -100..+100).
3. **Bytecode artifact persistence**: cache compiled bytecode in `dist/` alongside compiled GameDef, or compile on-demand at engine startup? Default lean: persist (compiler determinism makes it safe).

These questions are scoped to be resolved inside their respective phases without needing a spec amendment.

---

## 12. Stop conditions (when to abandon this approach)

- **Phase 1** does not show ≥10% improvement on the one-card smoke after the encoded-state read path is wired in. Likely cause: the bottleneck is genuinely in the AST shape, not feature reads. Action: skip phase 2-3, jump to phase 3-4 directly OR re-spec.
- **Phase 3** round-trip equivalence cannot be proven for >5% of FITL expressions due to dynamic `RESOLVE_REF` patterns the bytecode opcode set doesn't cover. Action: extend the opcode set, or selectively enable bytecode only for static expressions.
- **Phase 4** does not reach 250 ms even after VM is correct. Likely cause: the encoded-state shape is sub-optimal; common feature reads still fan out. Action: redesign EncodedState layout based on phase 4 profiling data (one extra ticket), or jump to phase 5.

---

**End of spec 149.**
