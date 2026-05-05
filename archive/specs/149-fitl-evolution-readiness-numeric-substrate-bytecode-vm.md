# Spec 149 — FITL Evolution-Readiness: Numeric Substrate + Bytecode VM (TS first, WASM phase 2)

**Status**: COMPLETED
**Priority**: P0 — blocks evolution-readiness; PR #231 (`implemented-147`) determinism + integration CI lanes red.
**Complexity**: XL — multi-phase architectural change spanning kernel encoded-state projection, agent preview-drive apply/undo, compiler bytecode lowering, runtime VM, and CI workflow rebalancing.
**Dependencies**:
- `archive/tickets/TURNPERF-002-implement-fitl-per-card-cost-reduction.md` (deferred/superseded 2026-05-01) — provides the "incremental TS optimization plateaued" evidence that motivates a structural change.
- `archive/specs/147-aot-consideration-ast-compilation.md` (archived 2026-04-26) — predecessor that landed AOT closure-tree compilation. This spec's bytecode VM lowers from the same compile-time IR (`AgentPolicyExpr`) and replaces the closure-tree runtime path on Phase 4 default-flip.
- `reports/turnperf-001-investigation-2026-04-28.md`, `reports/turnperf-002-implementation-2026-04-28.md`, `reports/ci-failures-pr-231-2026-04-28.md` — measurement and CI-failure evidence consumed by §1 and §Phase 0.

## Brainstorm Context

**Original request**: After ~1 month of incremental optimization on the FITL preview-drive pipeline, performance remains unworkable for evolving AI agent policies under the new microturn structure. PR #231 (`implemented-147`) has multiple timing-out CI workflows. The user asked to (a) investigate the failing workflows and rule out rule-encoding bugs, (b) profile thoroughly if the code is correct but slow, and (c) consider compiling hot paths to a faster language (likely Rust→WASM).

**References consumed**:
- `brainstorming/typescript-performance.md` (ChatGPT analysis recommending: bytecode VM in TS first, WASM as second wave, with compact numeric state and apply/undo).
- `reports/turnperf-001-investigation-2026-04-28.md` (one-card FITL probe: `elapsedMs=8710` under 4 baseline profiles; `agent:evaluatePolicyExpression=5378 ms` = 62% of wall-clock; `tokenStateIndexBuildCount=2381`).
- `reports/turnperf-002-implementation-2026-04-28.md` (preview-no-final-hash seam yielded ~20% smoke improvement; multiple speculative caches removed; parity lanes still red).
- `reports/ci-failures-pr-231-2026-04-28.md` (chronic seed-123 timeout root cause: `refreshCachedTokenStateIndexEntries` O(K·Z·T); fix already landed in commit `b362038a` as Option A).
- `archive/tickets/TURNPERF-002-implement-fitl-per-card-cost-reduction.md` (Phase 2 outcome shows incremental TS optimizations have plateaued).
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

**Final confidence**: 92% on diagnosis; 95% after user selected approach **B + T** (Bytecode VM + Typed-array encoded state) with prior-art research. Remaining uncertainty is implementation detail at phase boundaries, addressed inside each phase.

**Assumptions made (please correct if wrong)**:
- Evolution readiness target is ~250 ms per FITL card under all 4 baseline profiles (the `<= 250 ms` figure from `reports/turnperf-001-investigation-2026-04-28.md`).
- Determinism workflow timeout is acceptable to bump 30→60 minutes temporarily.
- Phase 5 (Rust→WASM) was originally deferred; it was promoted to `archive/specs/150-fitl-policy-vm-wasm-port.md` on 2026-05-02 after Phase 4B remained red. On 2026-05-04, after Spec 150 also proved the original `<=250 ms` target infeasible for the current same-seam architecture, the user approved resetting the active blocker to `<=1800 ms`.

---

## 1. Overview

This spec defines the multi-phase architectural change to make FITL agent-policy evolution practical. The current runtime — `evaluatePolicyMove` (telemetered as the `agent:evaluatePolicyExpression` perf bucket) walking the `CompiledPolicyExpr` discriminated-union IR through closure trees built by `buildPolicyExprClosure` in `packages/engine/src/agents/compiled-policy-runtime.ts` — spends ~62% of one-card wall-clock on policy evaluation, with `resolveRef`/`evalCondition` traversals plus decision-stack hashing dominating self-time inside that bucket. Spec 147 (archived 2026-04-26) already replaced the original interpretive AST evaluator with this AOT-compiled closure-tree runtime; the closure-tree gain is real but insufficient — incremental optimization has plateaued at 35× over the per-card budget.

The fix is a structural one: introduce a **numeric encoded-state** view (typed arrays, bitsets, integer IDs) that the agent preview pipeline reads from, plus a **bytecode VM** that executes pre-compiled policy expressions without object traversal or closure dispatch. The kernel's authoritative immutable `GameState` is unchanged; the encoded view is a derived projection consulted only by agent preview drives, with apply/undo replacing clone/apply inside bounded inner-preview microturns (F11 scoped-mutation exception).

The architecture is **fully game-agnostic**: no FITL-specific opcodes, no FITL-specific encoding fields. Each game's `EncodedStateLayout` is derived from its GameDef at compile time from generic primitives. Engine and compiler stay generic.

The work is decomposed into six phases:

| Phase | Goal | Effort | Acceptance budget per FITL card (under 4 baseline profiles, `verifyIncrementalHash=true`) |
|---|---|---|---:|
| **0** | Tactical CI unblock | ~half day | Existing baselines preserved; CI green via configuration. |
| **1** | `EncodedState` view (read-only) | ~1 week | ≤ 5500 ms (~15% gain from cheaper feature reads). |
| **2** | Apply/undo for inner-preview drive | Deferred after Phase 1 stop condition | Not on the active path; revisit only if later profiling proves preview cloning/apply cost is the next generic bottleneck. |
| **3** | Policy DSL → bytecode compiler | ~2-3 weeks | n/a (compiler-only; round-trip equivalence proven). |
| **4** | TS bytecode VM | ~1-2 weeks | Original target was ≤ 250 ms; reset to ≤ 1800 ms on 2026-05-04 after measured successor evidence. |
| **5** | Rust→WASM port (Spec 150) | ~6-10 weeks when justified | Original target was to restore ≤ 250 ms; current same-seam blocker is ≤ 1800 ms. Future work may revisit a stricter target only through a new spec-level decision. |

Phase 5 was originally deferred to a follow-up spec. The Phase 4B final gate fired that stop condition on 2026-05-02; the active follow-up is `archive/specs/150-fitl-policy-vm-wasm-port.md`.

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
                                │  - lowers AgentPolicyExpr IR             │
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
  // Effective token table for this state. Starts with layout.tokenIds, then
  // appends runtime-created token ids absent from the layout in canonical order.
  readonly tokenIds: readonly TokenId[];
  readonly tokenIndexById: Readonly<Record<string, number>>;
  // Position/zone of each token. Index = tokenIndex; value = zoneIndex (or SENTINEL_NONE)
  readonly tokenZone: Int16Array;
  // Duplicate-token metadata. Offset is SENTINEL_NONE for absent or single-occurrence tokens.
  readonly tokenOccurrenceOffset: Int32Array;
  readonly tokenOccurrenceCount: Int16Array;
  readonly tokenOccurrenceZones: Int16Array;
  // Per-token property bitset (e.g., underground, tunneled, activated). 64-bit lanes.
  readonly tokenFlags: BigUint64Array;
  // Per-token scalar property ids and values, derived from GameDef.tokenTypes.
  // Used by aggregate/filter reads without walking GameState token objects.
  readonly tokenScalarPropIds: readonly string[];
  readonly tokenScalarPropValues: Int32Array;
  readonly tokenScalarPropPresent: Uint8Array;
  // Per-zone occupant count (denormalized for fast queries).
  readonly zoneOccupancy: Int16Array; // [zoneIndex * tokenTypeCount + typeIndex]
  // Per-player resources / counters.
  readonly playerInts: Int32Array;
  // Per-zone variable values.
  readonly zoneInts: Int32Array;
  // Per-zone marker-state bitset (population, support, terror, sabotage, etc.).
  readonly zoneMarkers: BigUint64Array;
  // Global marker-state bitset.
  readonly globalMarkers: BigUint64Array;
  // Global game variables (turn count, monsoon flag, etc.).
  readonly globals: Int32Array;
}
```

Scalar token-property descriptors are generic and GameDef-derived. Numeric props
are stored directly, booleans as `0`/`1`, and string props through deterministic
view-local per-property value tables derived from the current `GameState`.
`GameDef.tokenTypes` declares string-valued props but does not enumerate every
legal string value, so the string dictionaries are not rule-authoritative data;
they are an implementation detail of the read-only encoded view.

Phase 1 proves parity only for this encoded read surface. It does not reconstruct
canonical `GameState`; later apply/undo/finalize work owns any conversion from
mutated encoded state back to authoritative immutable state.

The layout is **derived from GameDef at compile time** by a generic builder that walks compiled GameDef surfaces such as `zones`, `tokenTypes`, marker lattices, variable definitions, and asset-derived runtime surfaces when a descriptor needs them. Raw `dataAssets` remain a GameSpecDoc/CNL input and do not become a separate kernel contract. No FITL-specific code.

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

Lowering source is the compile-time `AgentPolicyExpr` IR (defined in `packages/engine/src/kernel/types.ts` and consumed by Spec 147's AOT compiler to produce `CompiledPolicyExpr`). Bytecode lowering bypasses the closure-tree intermediate (`buildPolicyExprClosure`) entirely — once the bytecode VM is the runtime path (Phase 4 default-flip), the closure-tree machinery becomes dead code and is deleted per F14. Opcodes are game-agnostic:

```
LOAD_FEATURE   <feature-id>          → push feature value onto stack
LOAD_CONST     <int>                 → push constant
GT, LT, GTE, LTE, EQ, NEQ            → pop 2, compare, push bool
JUMP_IF_FALSE  <offset>              → conditional skip
ADD_SCORE, SUB_SCORE                 → pop 2, exact integer arithmetic
MUL_SCORE, DIV_SCORE                 → pop 2, multiply or Math.trunc division
NEG, ABS, MIN, MAX                   → generic score helpers
AND, OR, NOT, COALESCE               → generic boolean/null helpers
BOOL_TO_NUMBER, IN                   → policy DSL helper lowering
RESOLVE_REF    <ref-id>              → push resolved binding value
AGGREGATE_SUM, AGGREGATE_COUNT, ...  → over selector results
HALT
```

Compiler stage in `packages/engine/src/cnl/policy-bytecode/`. Round-trip property test: for every existing FITL policy profile, the closure-tree evaluator (Spec 147 AOT artifact) and the bytecode VM produce **bit-identical scores** on a corpus of seeded states.

### 2.5 TS bytecode VM (phase 4)

A tight switch loop over `Int32Array` opcodes operating on `EncodedState` typed arrays. ~200 LOC. Drop-in replacement for `evaluatePolicyMove` (the function telemetered as `agent:evaluatePolicyExpression`) controlled by an A/B flag in `policy-runtime.ts`. After parity is proven on all FITL profiles for ≥3 consecutive CI runs, the bytecode path becomes default and the closure-tree evaluation path (`compiled-policy-runtime.ts:buildPolicyExprClosure` and downstream callees in `policy-evaluation-core.ts`) is deleted per F14 — no fallback retained.

### 2.6 WASM port (phase 5, Spec 150)

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

The slow tests live in two different workflow files. Phase 0 touches both:

**Workflow target A — `.github/workflows/engine-determinism.yml`** (determinism shards, including timing-out `fitl-parity-zobrist-seed-{42,123}` per TURNPERF-002 evidence):
- Bump job-level `timeout-minutes: 30 → 60` on the `determinism` job (applies to all 10 determinism shards under that job).

**Workflow target B — `.github/workflows/engine-tests.yml`** (integration matrix, including the live lanes that run the slow integration tests):
- First deliverable: confirm via `packages/engine/scripts/test-lane-manifest.mjs` which matrix lane contains `fitl-events-sihanouk.test.ts` and which contains `fitl-march-free-operation.test.ts`. Live reassessment on 2026-04-28 found `fitl-events-sihanouk.test.ts` in `fitl-events-shard-c` and `fitl-march-free-operation.test.ts` in `fitl-rules`. Cite the lane mapping in the ticket.
- Historical Phase 0 relief used matrix-driven step-level `continue-on-error: true` on the affected matrix entries. On 2026-05-02, that relief was reverted early after it masked a real stale golden failure in `fitl-rules`; the affected engine-test lanes are blocking again at `timeout: 30`.

**Per-test budgets**: the spec's earlier draft proposed `// @timeout` annotations; that mechanism does not exist in `run-tests.mjs` (lane-level only). If per-test relief is still required after the workflow-level bumps, options are: (a) extend the lane-manifest to support per-test timeout overrides; (b) carve sihanouk and march-free-operation into a dedicated lane with a longer lane-level timeout; (c) override at runtime via env vars (`ENGINE_DETERMINISM_TEST_TIMEOUT_MS`, `ENGINE_FITL_RULES_TEST_TIMEOUT_MS`). Default lean: option (a) is the F15-aligned answer; option (c) is acceptable as a further temporary unblock.

**Restoration tracking**: Ticket `149FITLEVNUMVM-003` tracks the remaining unwind — when phase 4 lands and per-card cost is green at the reset `<=1800 ms` gate, revert the remaining determinism timeout bump. The engine-test matrix entries were restored to blocking semantics early on 2026-05-02 after the non-blocking relief masked a stale golden failure. On 2026-05-05, the user rejected requiring 3+ consecutive CI confirmations for the non-flaky CI lanes and authorized closing the unwind on merged green PR #239 CI evidence plus the repaired local reset-gate evidence from `149FITLEVNUMVM-023`.

Out of scope for phase 0: any kernel code change. Phase 0 is configuration-only.

### Phase 1 — EncodedState (read-only) (~1 week)

Goal: a derived typed-array view of authoritative state, refreshed once per agent preview drive, consumed by **read paths only** (`evalCondition`, `resolveRef`, feature extraction). Apply paths still use the existing immutable update.

Modules:
- `packages/engine/src/kernel/encoded-state/layout.ts` — `buildEncodedStateLayout(def: GameDef): EncodedStateLayout`.
- `packages/engine/src/kernel/encoded-state/view.ts` — `buildEncodedState(state: GameState, layout: EncodedStateLayout): EncodedState`.
- `packages/engine/src/agents/policy-runtime.ts` / `policy-evaluation-core.ts` — build or accept an optional `EncodedState`; route hot current-state read paths, including token aggregate/filter scalar prop reads, through it when present.

Acceptance:
- Unit tests for layout/view correctness against existing FITL fixtures.
- Property test: `state → encoded` preserves every Phase 1 encoded read surface for the corpus of FITL replay fixtures. Full `encoded → state` reconstruction is deferred to the Phase 2 apply/undo/finalize scope.
- Profiling smoke: one-card cost reduced to ≤ 5500 ms (≥15% gain).

### Phase 2 — Apply/undo for inner-preview drive (deferred)

**Status (2026-04-30)**: Deferred by the Phase 1 stop-condition reassessment.
Phase 1 encoded reads are correct and active, but the measured one-card smoke did
not reach the 5500 ms gate. The decisive 2026-04-30 profile showed the remaining
hot samples in preview application/hashing and closure/interpreter-adjacent
runtime work rather than encoded-state construction or provider setup. Per §12,
this phase is not the next active implementation path. Keep the old phase design
as a possible future branch only if later VM profiling proves clone/apply cost is
the next generic bottleneck.

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

Goal: lower the compile-time `AgentPolicyExpr` IR (Spec 147's compiler input, defined in `packages/engine/src/kernel/types.ts`) into a flat numeric bytecode + feature-id table. The lowering bypasses the closure-tree intermediate (`buildPolicyExprClosure`) — once Phase 4 default-flips, that intermediate is deleted per F14.

Modules:
- `packages/engine/src/cnl/policy-bytecode/compile.ts` — AST → bytecode.
- `packages/engine/src/cnl/policy-bytecode/feature-table.ts` — generic feature-id assignment from GameDef-known references.
- `packages/engine/schemas/PolicyBytecode.schema.json` — schema for the compiled artifact.
- `packages/engine/src/agents/policy-bytecode/disassemble.ts` — debugging tool.

Acceptance:
- Round-trip property test: for every FITL policy profile (us-baseline, arvn-baseline, nva-baseline, vc-baseline) on a corpus of 20 seeded states, the closure-tree evaluator (current production) and the bytecode VM produce **bit-identical scores**.
- Compile-time test: same GameSpecDoc compiles to byte-identical bytecode twice (F8 compiler determinism).
- No runtime use yet — compiler stage is gated by an experimental flag.

### Phase 4 — TS bytecode VM (~1-2 weeks)

Goal: tight switch-loop VM over `Int32Array` opcodes against the `EncodedState`. A/B-toggled in `policy-runtime.ts`; default flips after parity proof.

Modules:
- `packages/engine/src/agents/policy-vm/vm.ts` — the VM (~200 LOC).
- `packages/engine/src/agents/policy-runtime.ts` — A/B routing via `LUDOFORGE_POLICY_VM=on` env var; flip default after parity is green for ≥3 consecutive CI runs on all FITL profiles.

Acceptance:
- Replay-identity tests stay green on all determinism shards.
- Score-equivalence tests against the closure-tree evaluator stay green.
- **Per-card cost: ≤ 1800 ms under 4 baseline profiles, `verifyIncrementalHash=true`** — the 2026-05-04 reset target met.
- `engine-tests.yml` Phase 0 tactical relief re-enabled as blocking (no longer `continue-on-error`, per-lane `timeout: 30` restored).
- `engine-determinism.yml` job-level `timeout-minutes` restored to 30 m.
- Sihanouk and March-Free-Operation per-test budgets restored (whichever mechanism Phase 0 selected).
- **Closure-tree evaluation path deleted**: `compiled-policy-runtime.ts:buildPolicyExprClosure` and downstream closure callees in `policy-evaluation-core.ts` removed. Per F14, no fallback retained. Spec 147's AOT compile path now produces bytecode directly; the compiled-closure runtime is dead code post-flip.
- The phase 0 CI restoration ticket closes.

### Phase 5 — Rust→WASM port (promoted to Spec 150 on 2026-05-02)

A separate spec is authored when phase 4 lands AND any of the following is true:
1. Phase 4 doesn't reach the original 250 ms target — phase 5 is the next-stage answer.
2. Evolution campaigns demand 10× more throughput (e.g., MAP-Elites with a 10K-cell archive).
3. The runner needs a worker-pool architecture for online play.

The phase 5 spec is now `archive/specs/150-fitl-policy-vm-wasm-port.md`. It covers: Rust crate boundary, `wasm-bindgen` or equivalent API, compact binary serialization across FFI, SAB worker pool when justified, COOP/COEP headers in the runner when needed, and side-by-side TS-VM ↔ WASM-VM equivalence tests.

### Phase 4B — Preview-drive runtime closure (inserted after Phase 4 profiling)

Goal: close the remaining VM-enabled one-card wall-time gap before ticket 016 executes the F14 default-flip/deletion cut.

Phase 4B exists because the current policy bytecode VM proved correct but too narrow for the remaining red gate. The current VM covers policy expression scoring; it does not compile or replace the generic kernel rule/query interpreter, preview state/index lifetime, or preview hashing/canonicalization work exercised while speculative moves are applied.

Measured owner buckets from the 2026-05-02 CPU profile:

- kernel expression/query interpretation (`resolveRef`, `evalCondition`, `evalValue`, `evalQuery`, spatial/filter evaluation): about 22.9% — owned by ticket 019.
- hashing/canonicalization (`fnv1a64`, `zobristKey`, `computeFullHash`, `digestDecisionStackFrame`): about 21.8% — owned by ticket 021.
- token-index copy/lifetime (`copyCachedTokenStateIndex`, token-state-index build/attach/refresh): about 4.8% — owned by ticket 020.
- current policy VM / policy bytecode: about 0.8% — no longer the dominant owner.

Acceptance:

- Tickets 019-021 either land measured generic runtime-closure work or record why their bucket is no longer active.
- Ticket 022 reruns the same-seam one-card profile at the then-current budget under all 4 baseline profiles with `verifyIncrementalHash=true`, or records the red result and hands off to the next architectural owner.
- Ticket 022 remained red on 2026-05-02 and handed off to Spec 150. On 2026-05-04, Spec 150 proved the original `<=250 ms` budget infeasible for the current same-seam architecture; the user approved the reset `<=1800 ms` gate that now unblocks ticket 016 after confirmation.

Phase 4B is still generic engine work. No FITL-specific rule branches, opcodes, schemas, or hardcoded identifiers are allowed.

---

## 5. Edge cases

- **Multi-occurrence tokens**: encoded view stores the canonical (lowest zone-rank) zone in `tokenZone[i]` and a sentinel + occurrence-list pointer for tokens with `occurrenceCount > 1`. Mirrors the invariant `MutableTokenStateIndex` already enforces.
- **FITL hidden-information windows**: encoded state is **never** exposed to a player observer projection. Agent preview is omniscient by design (it is consulted by the simulator on the active seat's behalf); the encoded view is internal to the agent's deliberation, not a player-visible projection. F4 (Authoritative State and Observer Views) is preserved because the encoded view never crosses an observer boundary.
- **chooseN combinatorics**: action templates encode as compact `(action-id, target-id, target-id, ...)` tuples in `Int32Array`, not object trees. Kernel still owns enumeration; the encoded list is consumed read-only by the VM.
- **Preview depth-cap exit**: the apply/undo log records every mutation; on depth-cap exit, the log canonicalizes to a `GameState` (not a partial one).
- **NaN/floats**: forbidden by construction. All score math is `Int32` (with overflow guard at compile time — bytecode compiler refuses expressions whose static range exceeds 2^30).
- **Unknown features at compile time**: during Phases 3-4 rollout, the compiler emits a `RESOLVE_DYNAMIC` opcode that falls back to the closure-tree evaluator (Spec 147's runtime) for that single expression. Logged as a perf warning so it gets eliminated. Per F14, all `RESOLVE_DYNAMIC` cases must be eliminated before the Phase 4 default-flip deletes the closure-tree path; remaining cases are a Phase 4 blocker.
- **Backwards compatibility during phase rollout**: A/B switches are explicit env-var gates; the default flips at phase boundaries. No `_legacy` fallbacks in production code (F14).

---

## 6. Testing strategy

| Phase | Test class | What proves it works |
|---|---|---|
| 0 | architectural-invariant | CI workflows are green; existing test suite passes; restoration ticket exists. |
| 1 | architectural-invariant | `state → encoded` parity for every Phase 1 encoded read surface on FITL replay fixtures. |
| 2 | deferred | Old apply/undo branch retained as a documented fallback, not an active proof lane after the Phase 1 stop condition. |
| 3 | architectural-invariant | Closure-tree↔bytecode score equivalence on FITL profile corpus (closure-tree is current production runtime per Spec 147); compiler determinism (byte-identical bytecode on two compiles). |
| 4 | architectural-invariant | Replay-identity on all determinism shards with VM enabled; per-card cost ≤ 1800 ms; no convergence-witness regressions. |
| 5 | architectural-invariant | TS-VM ↔ WASM-VM equivalence on golden corpus; replay-identity preserved across FFI. |

A new perf gate `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` is no longer added at the false Phase 1 5500 ms calibration. Ticket `149FITLEVNUMVM-007` is superseded by the 2026-04-30 stop-condition decision. The next truthful gate is added or updated when the successor runtime path owns the target, calibrated to the 2026-05-04 reset `<=1800 ms` budget. It may tighten only through a later spec-level decision with fresh evidence. This gate is **additive** to the existing `packages/engine/test/perf/agents/fitl-parity-drive.perf.test.ts`, which gates parity-drive cost on a different metric and continues to run unchanged unless successor-path measurements require recalibration.

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
| **F8 Determinism Is Sacred** | Integer-only math; canonical hashing unchanged; closure-tree↔bytecode↔WASM-VM equivalence proven by property tests; replay-identity preserved on every phase. |
| **F10 Bounded Computation** | VM execution is bounded by bytecode length (compile-time) and depth-cap (runtime). No general recursion in the VM. |
| **F11 Immutability** | Authoritative `GameState` remains immutable. Apply/undo on encoded state is the documented scoped-mutation exception, fully isolated to preview-drive scope. |
| **F12 Compiler-Kernel Validation Boundary** | Bytecode compilation is a compiler responsibility. The kernel validates state-dependent execution. The boundary is preserved. |
| **F14 No Backwards Compatibility** | A/B switches are temporary phase-rollout gates; default flips at phase end; no `_legacy` paths remain after phase 4. |
| **F15 Architectural Completeness** | This spec is the structural answer to a measured 35× over-budget gap. The previous 7+ incremental optimizations did not move the load-bearing gate; this is the root-cause attack on the 62% wall-clock bucket. |
| **F17 Strongly Typed Domain Identifiers** | Encoded id-tables convert the already-branded subset (`ZoneId`, `TokenId`, `PlayerId`, `ActionId`, `PhaseId`, `TriggerId`, `SeatId` per `packages/engine/src/kernel/branded.ts`) to dense integer indices; the conversion is the typed boundary. Read paths return branded IDs, not raw integers. `MarkerId` and `VariableId` are not currently branded types in the codebase; the encoded view treats them uniformly as integer indices over their string-identifier domain. F17 alignment applies to the already-branded subset; introducing brands for `MarkerId`/`VariableId` is out of scope here (a separate F17-completion ticket may follow). |
| **F18 Constructibility Is Part of Legality** | Untouched. Legality publication remains the kernel's responsibility; the VM scores already-published actions. |
| **F19 Decision-Granularity Uniformity** | Untouched. Microturn protocol is unchanged. |

---

## 8. Out of scope

- **Phase 5 (Rust→WASM)** detailed FFI shape, worker-pool architecture, and runner SAB integration. Owned by `archive/specs/150-fitl-policy-vm-wasm-port.md`.
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
| 0 | 3 | (a) `engine-determinism.yml` job-level timeout bump; (b) `engine-tests.yml` affected matrix-lane relief, now restored to blocking semantics after the 2026-05-02 stale-golden discovery; (c) `149FITLEVNUMVM-003` tracking ticket for the remaining determinism-timeout unwind. |
| 1 | 3-4 | (a) layout builder; (b) view builder; (c) wire into read paths; (d) perf gate test. |
| 2 | 3-4 | (a) PreviewDriveScope skeleton; (b) replace cloning path; (c) canonicalize-on-exit verification; (d) property tests. |
| 3 | 4-5 | (a) opcode set + IR types; (b) AST→bytecode compiler; (c) feature-id table; (d) round-trip equivalence harness; (e) disassembler. |
| 4 | 2-3 | (a) VM core; (b) A/B integration; (c) default-flip after parity proof. |

Total estimate: **14-18 tickets**, ~4-7 weeks of focused work for phases 0-4.

Phase 5 has its own archived spec, `archive/specs/150-fitl-policy-vm-wasm-port.md`. Starter ticket `archive/tickets/150FITLWASM-001.md` landed the WASM skeleton, `archive/tickets/150FITLWASM-002.md` landed policy-bytecode execution parity, `archive/tickets/150FITLWASM-003.md` landed the encoded-state action batch bridge, `archive/tickets/150FITLWASM-004.md` landed supported scalar candidate score rows, `archive/tickets/150FITLWASM-005.md` landed non-preview score rows, and `archive/tickets/150FITLWASM-006.md` landed preview-backed score-row handoff and perf gate preflight.

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

### 2026-04-29 Phase 1 gate status

Ticket `149FITLEVNUMVM-006` landed the encoded read-path implementation and score-equivalence proof, but the one-card smoke remained above the 5500 ms Phase 1 calibration (`elapsedMs=5986.48`, `agent:evaluatePolicyExpression=3455.01 ms`; `elapsedMs=5999.65` after layout caching). The correctness slice is retained, but Phase 1's measured gate is blocked pending `149FITLEVNUMVM-017`. Ticket `149FITLEVNUMVM-007` must not author the 5500 ms gate until `017` either resolves the measured miss or updates this spec with a user-approved corrected phase plan. The Phase 2 entry ticket `149FITLEVNUMVM-008` must also wait on `017`, because the corrected plan may re-spec, skip, or reorder apply/undo work under this stop condition.

### 2026-04-30 Phase 1 stop-condition decision

Ticket `149FITLEVNUMVM-017` reran the live one-card smoke and confirmed the gate
remains red: `elapsedMs=5774.89`, `agent:evaluatePolicyExpression=3338.25 ms`,
threshold `<=5500`. A CPU-profile pass showed `buildEncodedState` at only a tiny
sample share while the dominant samples sat under preview application, hashing,
`resolveRef` / `evalCondition`, and token-state-index copy paths inside
`evaluatePolicyMoveCore`. A small generic copy-on-write token-state-index cache
candidate remained red at `elapsedMs=5857.01` and was abandoned.

User-approved resolution on 2026-04-30: the Phase 1 stop condition is fired.
Do not force the false 5500 ms gate and do not proceed into the old Phase 2
apply/undo branch as the next active implementation path. The active path is now
the bytecode/VM branch (`149FITLEVNUMVM-011` through `016`), with the first
truthful per-card gate owned when the VM path can assert the Phase 4 `<=250 ms`
target. The old Phase 2 tickets (`008` through `010`) are deferred/superseded
planning artifacts unless later VM-path profiling proves preview clone/apply cost
is again the next generic bottleneck.

### 2026-05-02 Phase 4 perf-gate reassessment

Ticket `149FITLEVNUMVM-016` is not executable as a direct default-flip/deletion ticket yet; it must first close the measured VM perf gate it now owns.

User confirmation satisfied the ticket's "≥3 consecutive CI runs" VM parity precondition, and local focused proof confirmed the VM path is correct:

- `pnpm -F @ludoforge/engine build` — PASS.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/cnl/policy-bytecode-compile.test.js` — PASS, including zero `RESOLVE_DYNAMIC` for all FITL baseline profile expressions.
- `LUDOFORGE_POLICY_VM=on pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` — PASS.

The Phase 4 performance/restoration premise is still false:

- `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label phase4-preflight-vm` — RED: `elapsedMs=6785.54`, per-card `elapsedMs=6785.31`, threshold `<=250`.

Live workflow evidence also moved the current restoration blocker from the old one-card VM/default-flip story to the actual slow engine-test lanes, especially `fitl-events-shard-c` (`test:integration:fitl-events:shard-c`) and `fitl-rules` (`test:integration:fitl-rules`). Ticket `149FITLEVNUMVM-018` profiled those lanes and found no remaining red runtime hot path after stale golden fallout was repaired: both engine-test lanes are now blocking again and inside their 30-minute workflow budgets. The remaining Phase 4 blocker is again the one-card VM perf gate above.

Initial user-approved revision on 2026-05-02 made ticket `149FITLEVNUMVM-016` absorb the remaining one-card VM perf investigation/optimization work instead of creating another prerequisite ticket. Follow-up profiling later the same day proved the remaining hot path is outside the current policy bytecode VM, so the next boundary reset below supersedes that temporary ownership. Per F14, the closure-tree path still must be deleted once the VM default-flip becomes truthful; the deletion is deferred, not abandoned.

### 2026-05-02 Phase 4B boundary reset

Follow-up profiling classified the VM-enabled one-card profile as still red by the wrong order of magnitude:

- `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4-baseline-codex` — RED: `elapsedMs=7101.08`, per-card `elapsedMs=7100.84`, threshold `<=250`.
- A generic bytecode-cache candidate was rejected because it only moved the same seam to `elapsedMs=7008.38`.
- CPU-profile run: `timeout 180 env LUDOFORGE_POLICY_VM=on node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-149-016-cpu packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4-cpu-after-bytecode-cache` — RED: `elapsedMs=6882.4`, per-card `elapsedMs=6882.17`.

User-approved resolution: ticket 016 returns to being the final F14 default-flip/deletion owner. The remaining non-policy-VM preview-drive runtime work is formalized as Phase 4B:

- `149FITLEVNUMVM-019`: generic kernel expression/query AOT or bytecode.
- `149FITLEVNUMVM-020`: preview state and token-index lifetime redesign.
- `149FITLEVNUMVM-021`: preview hashing and verification strategy.
- `149FITLEVNUMVM-022`: final reprofile gate that remained red and handed off to Spec 150.

### 2026-05-02 Phase 4B final gate and Phase 5 handoff

Ticket `149FITLEVNUMVM-022` ran the final same-seam profile after tickets 019-021 completed:

- `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-final` — RED: per-card `elapsedMs=6702.65`, threshold `<=250`, `verifyIncrementalHash=true`.

User-approved resolution: stop Phase 4B as failed for the original budget and promote Phase 5/WASM as the next architectural owner. Ticket `149FITLEVNUMVM-016` remained the later F14 default-flip/deletion owner while Spec 150 tried to make the original `<=250 ms` gate truthful. The Phase 5 owner is `archive/specs/150-fitl-policy-vm-wasm-port.md`; starter ticket `archive/tickets/150FITLWASM-001.md` landed the WASM skeleton, `archive/tickets/150FITLWASM-002.md` landed policy-bytecode execution parity, `archive/tickets/150FITLWASM-003.md` landed the encoded-state action batch bridge, `archive/tickets/150FITLWASM-004.md` landed supported scalar candidate score rows, archived ticket `archive/tickets/150FITLWASM-005.md` landed non-preview score rows, and the later Spec 150 chain continued through ticket `150FITLWASM-034`.

### 2026-05-04 Spec 150 terminal budget reset

Ticket `150FITLWASM-034` executed the post-033 residual pass and retained no
code changes. Fresh same-seam confirmation recorded `elapsedMs=1512.38` with
clean active-route diagnostics after `150FITLWASM-033` had already recorded
retained clean samples of `1355.26 ms` and `1383.35 ms`.

User-approved resolution: retire the original `<=250 ms` target as a blocker
for the current same-seam architecture and reset the active successor-runtime
gate to `<=1800 ms`. Ticket `149FITLEVNUMVM-016` became the active F14
default-flip/deletion owner after it confirmed that reset gate. Ticket
`149FITLEVNUMVM-003` was then unblocked on 2026-05-05 by merged green PR #239
CI evidence plus the repaired reset-gate evidence, not by the retired
`<=250 ms` target.

### 2026-05-04 reset-gate regression follow-up

During `154POLBCDISP-003` reassessment, the current keep-arm baseline reran
`packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` three times
and found the reset gate red: `2479.77 ms`, `2461.18 ms`, and `2421.83 ms`
against `<=1800 ms`. Ticket `archive/tickets/149FITLEVNUMVM-023.md` owned
revalidating or repairing that reset gate before `149FITLEVNUMVM-003` could
unwind CI budgets or `154POLBCDISP-003` could consume the gate for its
keep-vs-delete measurement.

Archived ticket `149FITLEVNUMVM-023` resolved the contradiction as perf-gate
harness drift. The checked-in test now measures the same successor-runtime
surface as the archived reset evidence: compiled bootstrap GameDef, no
policy-agent trace diagnostics, and pre-timed WASM score-row precompilation.
The repaired compiled gate passed three serial local samples and the Spec 149
subtest was green inside `pnpm -F @ludoforge/engine test:perf`; the broad lane
still has an unrelated Spec 145 preview-pipeline corpus failure. The `<=1800 ms`
ceiling was not changed. On 2026-05-05, the user explicitly rejected requiring
3+ consecutive CI confirmations for this non-flaky CI surface and authorized
`149FITLEVNUMVM-003` to close on merged green PR #239 CI evidence plus the
`149FITLEVNUMVM-023` reset-gate repair evidence; `154POLBCDISP-003` is
unblocked for its own keep-vs-delete measurement.

---

## Tickets

Decomposed via `/spec-to-tickets` on 2026-04-28:
- [`archive/tickets/149FITLEVNUMVM-001.md`](../tickets/149FITLEVNUMVM-001.md) — Bump engine-determinism.yml job-level timeout 30→60 (covers Phase 0)
- [`archive/tickets/149FITLEVNUMVM-002.md`](../tickets/149FITLEVNUMVM-002.md) — Relieve engine-tests.yml lanes for sihanouk + march-free-operation (covers Phase 0)
- [`archive/tickets/149FITLEVNUMVM-003.md`](../tickets/149FITLEVNUMVM-003.md) — CI restoration unwind, post-Phase-4 (covers Phase 0 + Phase 4 closure)
- [`archive/tickets/149FITLEVNUMVM-004.md`](../tickets/149FITLEVNUMVM-004.md) — EncodedStateLayout builder from GameDef (covers Phase 1)
- [`archive/tickets/149FITLEVNUMVM-005.md`](../tickets/149FITLEVNUMVM-005.md) — EncodedState typed-array view builder (covers Phase 1)
- [`archive/tickets/149FITLEVNUMVM-006.md`](../tickets/149FITLEVNUMVM-006.md) — Wire encoded state into policy-runtime hot read paths (covers Phase 1 correctness; measured gate resolved by 017 stop-condition decision)
- [`archive/tickets/149FITLEVNUMVM-017.md`](../tickets/149FITLEVNUMVM-017.md) — Resolve Phase 1 encoded-read measured-gate miss (covers Phase 1 stop-condition decision)
- [`archive/tickets/149FITLEVNUMVM-007.md`](../tickets/149FITLEVNUMVM-007.md) — Superseded 5500 ms Phase 1 perf gate (not truthful after 017)
- [`archive/tickets/149FITLEVNUMVM-008.md`](../tickets/149FITLEVNUMVM-008.md) — Deferred PreviewDriveScope skeleton + apply/undo log primitives (old Phase 2 branch)
- [`archive/tickets/149FITLEVNUMVM-009.md`](../tickets/149FITLEVNUMVM-009.md) — Deferred cloning-path replacement with PreviewDriveScope (old Phase 2 branch)
- [`archive/tickets/149FITLEVNUMVM-010.md`](../tickets/149FITLEVNUMVM-010.md) — Deferred apply/undo equivalence property tests (old Phase 2 branch)
- [`archive/tickets/149FITLEVNUMVM-011.md`](../tickets/149FITLEVNUMVM-011.md) — Bytecode opcode set + IR types + PolicyBytecode schema (covers Phase 3)
- [`archive/tickets/149FITLEVNUMVM-012.md`](../tickets/149FITLEVNUMVM-012.md) — Feature-id table assignment from GameDef (covers Phase 3)
- [`archive/tickets/149FITLEVNUMVM-013.md`](../tickets/149FITLEVNUMVM-013.md) — AgentPolicyExpr → bytecode compiler + disassembler (covers Phase 3)
- [`archive/tickets/149FITLEVNUMVM-014.md`](../tickets/149FITLEVNUMVM-014.md) — Round-trip equivalence harness, closure-tree↔bytecode (covers Phase 3)
- [`archive/tickets/149FITLEVNUMVM-015.md`](../tickets/149FITLEVNUMVM-015.md) — TS bytecode VM core + A/B integration via env var (covers Phase 4)
- [`archive/tickets/149FITLEVNUMVM-018.md`](../tickets/149FITLEVNUMVM-018.md) — Completed live FITL event-card CI lane reassessment; stale golden/workflow masking repaired, no runtime hot path accepted
- [`archive/tickets/149FITLEVNUMVM-019.md`](../tickets/149FITLEVNUMVM-019.md) — Phase 4B generic kernel expression/query AOT or bytecode
- [`archive/tickets/149FITLEVNUMVM-020.md`](../tickets/149FITLEVNUMVM-020.md) — Phase 4B preview state and token-index lifetime redesign
- [`archive/tickets/149FITLEVNUMVM-021.md`](../tickets/149FITLEVNUMVM-021.md) — Phase 4B preview hashing and verification strategy
- [`archive/tickets/149FITLEVNUMVM-022.md`](../tickets/149FITLEVNUMVM-022.md) — Phase 4B final reprofile gate; red, handed off to Spec 150 and later superseded by the 2026-05-04 budget reset
- [`archive/tickets/149FITLEVNUMVM-023.md`](../tickets/149FITLEVNUMVM-023.md) — Revalidate or repair the reset FITL per-card gate
- [`archive/specs/150-fitl-policy-vm-wasm-port.md`](150-fitl-policy-vm-wasm-port.md) — Phase 5 Rust/WASM successor spec
- [`archive/tickets/150FITLWASM-001.md`](../tickets/150FITLWASM-001.md) — Phase 5 WASM architecture and ABI skeleton
- [`archive/tickets/150FITLWASM-002.md`](../tickets/150FITLWASM-002.md) — WASM policy bytecode execution parity
- [`archive/tickets/150FITLWASM-003.md`](../tickets/150FITLWASM-003.md) — Encoded-state action batch bridge
- [`archive/tickets/150FITLWASM-004.md`](../tickets/150FITLWASM-004.md) — Candidate-dependent WASM batch scoring integration
- [`archive/tickets/150FITLWASM-005.md`](../tickets/150FITLWASM-005.md) — Non-preview policy score-row WASM handoff and preview prerequisite split
- [`archive/tickets/150FITLWASM-006.md`](../tickets/150FITLWASM-006.md) — Preview-backed WASM score-row handoff and perf gate preflight
- [`archive/tickets/149FITLEVNUMVM-016.md`](../tickets/149FITLEVNUMVM-016.md) — Final default-flip + closure-tree deletion F14 atomic cut, completed under the reset successor-runtime budget

## Outcome (2026-05-05)

- Spec 149 is complete. Its Phase 0 through Phase 4 and Phase 4B ticket chain
  has been archived, including the final CI restoration unwind
  `archive/tickets/149FITLEVNUMVM-003.md`.
- The original `<=250 ms` evolution-readiness budget was retired as an active
  blocker by user-approved reset evidence. The completed default-flip cut now
  closes on the reset `<=1800 ms` successor-runtime gate, with the repaired
  reset-gate evidence in `archive/tickets/149FITLEVNUMVM-023.md`.
- Phase 5 / WASM ownership moved to archived Spec 150
  `archive/specs/150-fitl-policy-vm-wasm-port.md`; the Spec 150 ticket chain
  is also archived through the budget-reset closeout.
- CI tactical relief is unwound: `engine-tests.yml` affected lanes were
  restored earlier, and `.github/workflows/engine-determinism.yml` is restored
  to a 30-minute determinism job timeout.
- Deviations from original plan: Phase 2 apply/undo was deferred after the
  Phase 1 stop-condition decision, Phase 4B failed the original `<=250 ms`
  target, and the final accepted budget is the user-approved `<=1800 ms`
  reset rather than the original aspirational target.
- Verification carried forward from the final ticket closeout: `pnpm turbo
  build`, `pnpm turbo lint`, `pnpm run check:ticket-deps`, and `git diff
  --check` passed before spec archival.

**End of spec 149.**
