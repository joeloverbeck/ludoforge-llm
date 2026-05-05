# Spec 150 — FITL Policy VM WASM Port

**Status**: COMPLETED — terminal budget reset recorded 2026-05-04
**Priority**: P0 — successor owner after Spec 149 Phase 4B missed the original evolution-readiness budget; no longer blocks on the retired `<=250 ms` target.
**Complexity**: XL — Rust/WASM runtime, deterministic FFI boundary, TS/WASM equivalence, and eventual default-flip integration.
**Dependencies**:
- `archive/specs/149-fitl-evolution-readiness-numeric-substrate-bytecode-vm.md`
- `archive/tickets/149FITLEVNUMVM-022.md`

## 1. Context

Spec 149 landed the TypeScript policy bytecode VM and several generic Phase 4B runtime-closure slices. The final same-seam gate still missed the original Phase 4 target by the wrong order of magnitude:

- `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-final`
- Result: RED, per-card `elapsedMs=6702.65` versus the `<=250 ms` target, with `verifyIncrementalHash=true`.

The TypeScript VM path is correct but insufficient as the architectural answer. This spec owns the next-stage Rust to WASM policy/preview runtime needed to make the original budget truthful without weakening it.

2026-05-04 budget reset: after tickets `150FITLWASM-001` through
`150FITLWASM-034`, the same-seam route is clean but still far above the
original `<=250 ms` target. The final retained `033` samples were
`1355.26 ms` and `1383.35 ms`; fresh `034` confirmation recorded
`elapsedMs=1512.38` with clean active-route diagnostics. The user approved
retiring `<=250 ms` as a blocker for the current same-seam architecture and
replacing it with a measured `<=1800 ms` successor-runtime gate for ticket
`149FITLEVNUMVM-016`.

## 2. Goals

1. Preserve the reset Spec 149 `<=1800 ms` one-card target under all 4 FITL baseline profiles with `verifyIncrementalHash=true`; the original `<=250 ms` target is retained only as historical context, not as a blocker for the current architecture.
2. Move the remaining hot preview-drive scoring/runtime work behind a deterministic Rust/WASM batch interface.
3. Keep the engine generic: no FITL-specific opcodes, schemas, rule branches, identifiers, or hardcoded card/action knowledge.
4. Prove TS VM to WASM VM equivalence before any default flip.
5. Unblock ticket `149FITLEVNUMVM-016` under the measured `<=1800 ms` successor-runtime gate; only after that confirmation may it perform the F14 closure-tree deletion cut.

## 3. Architecture

The WASM runtime is a compiled execution backend for generic policy bytecode plus encoded state buffers. GameSpecDoc remains the authoring surface; GameDef, PolicyBytecode, FeatureTable, and EncodedState-derived buffers remain compiler/runtime artifacts.

Planned package boundary:

- Rust crate: `packages/engine-wasm/policy-vm` or the repo-approved equivalent workspace path.
- TypeScript bridge: `packages/engine/src/agents/policy-wasm-runtime.ts`.
- Existing TS fallback remains only during staged proof. Once the WASM path is defaulted by a later F14 cut, no compatibility fallback is retained.

WASM API shape:

```text
evaluate_policy_batch(
  encoded_state_ptr,
  encoded_state_len,
  actions_ptr,
  action_count,
  bytecode_ptr,
  bytecode_len,
  out_scores_ptr
) -> status_code
```

The exact ABI may change during ticket 001, but the contract must stay batch-oriented, deterministic, and game-agnostic. JSON is not acceptable on the hot FFI path; use a compact integer/binary buffer format with explicit version and layout identity.

## 4. Determinism Contract

1. Integer-only arithmetic. Division semantics match `Math.trunc`.
2. No wall-clock, locale, random host APIs, hash-map iteration dependence, or non-canonical ordering.
3. Buffer serialization includes enough identity to reject mismatched GameDef, EncodedStateLayout, PolicyBytecode, and FeatureTable artifacts.
4. Equivalence tests compare TS VM and WASM VM outputs on the same corpus before any performance claim is accepted. Phase 2 proves supported expression values; later phases must prove batch score outputs before the same-seam performance gate is accepted.
5. Replay identity remains owned by the TypeScript kernel until a later ticket explicitly moves more preview application into WASM.

## 5. Phases

### Phase 1 — WASM architecture and ABI skeleton

Owns the Rust crate/workspace shape, wasm-bindgen or equivalent build path, deterministic integer ABI, and a no-op or minimal opcode smoke through Node.

Ticket `150FITLWASM-001` selected the initial repo layout:

- Workspace package: `packages/engine-wasm`.
- Rust crate: `packages/engine-wasm/policy-vm`.
- TypeScript bridge: `packages/engine/src/agents/policy-wasm-runtime.ts`.
- Build command: `pnpm -F @ludoforge/engine-wasm build`.

The first smoke ABI uses raw `wasm32-unknown-unknown` exports rather than
`wasm-bindgen`. The caller writes a little-endian `i32` buffer:

```text
[magic, version, layout_id, opcode, lhs, rhs]
```

The WASM module rejects mismatched magic, version, layout identity, opcode, and
overflow before returning a deterministic integer score. This is a skeleton ABI
only; later tickets still own the batch-oriented policy-bytecode and
encoded-state/action buffers described below.

### Phase 2 — Policy bytecode execution parity

Ports the supported generic policy bytecode VM core to Rust/WASM and proves
value equivalence against the existing TypeScript VM on supported expressions
from the current corpus. Dynamic or unsupported bytecode remains a fail-closed
handoff surface until a later ticket explicitly moves the required fallback,
preview, or application semantics across the FFI boundary.

### Phase 3 — Encoded-state and action batch bridge

Moves the profile-driving encoded state/action batch across the FFI boundary without JSON or object walking on the hot path.

Ticket `150FITLWASM-003` delivered the deterministic batch ABI for supported
encoded-state bytecode rows. The batch buffer validates ABI magic, version,
layout identity, program length, and compact action identity words, and the
corpus parity test proves supported rows over current action batches.

Ticket `150FITLWASM-004` delivered candidate-dependent batch score rows for the
supported scalar subset: action/stable-key intrinsics, scalar candidate params,
action tag membership, profile-parameter materialization, and supported
move-consideration scores.

Ticket `150FITLWASM-005` delivered generic precomputed state-feature,
candidate-feature, and candidate-aggregate score rows and proved full
non-preview score-row parity against the TypeScript reference. Preview-backed
score rows remain fail-closed because a full-profile attempt proved that static
root/precomputed values do not preserve preview materialization semantics.
Ticket `150FITLWASM-006` delivered preview-materialized candidate-feature rows
and full-profile score-row parity, including preview-backed considerations. The
same-seam preflight remained red at `6539.22 ms` per card because the production
policy-driving path still does not route supported score batches through WASM.
Ticket `150FITLWASM-007` delivered production score-row WASM integration and
proved the score-row route active in the same-seam performance gate, but the gate
remained red because TypeScript preview row materialization still dominated the
production path. Ticket `150FITLWASM-008` removed repeated score-row bytecode
materialization/compilation from the production WASM handoff and proved the gate
still red at `6593.68 ms` per card. Ticket `150FITLWASM-009` delivered generic
preview-state/surface candidate-feature row materialization through the
production WASM route and proved the gate still red at `6632.26 ms` per card.
Live reassessment of ticket `150FITLWASM-010` proved that production routing
cannot truthfully claim a WASM preview-drive handoff until a generic encoded
preview-drive substrate exists. Ticket `150FITLWASM-011` delivered the first
generic encoded preview-drive ABI and supported synthetic greedy-subset parity.
Ticket `150FITLWASM-012` expanded that ABI to the current FITL same-seam
inventory classes: `initialMoveApplication`, `decisionStackPublication`, and
`completionExits` now report `supportedByEncodedPreviewDriveAbi=true`. A later
reassessment of ticket `150FITLWASM-010` proved that this was still an
inventory/replay witness: production preview routing still needed a generic
encoded preview-state/effect/publication substrate before it could stop using
the TypeScript preview drive to materialize preview state. Ticket
`150FITLWASM-013` delivered encoded preview-state slot outputs to the encoded
preview-drive ABI and proved current FITL inventory rows with
`previewStateSubstrateSupported=true`. Reassessment of ticket
`150FITLWASM-010` later on 2026-05-03 found that this slot substrate still does
not make WASM the owner of generic production preview application,
publication, bounded completion, or full preview-state materialization. Ticket
`150FITLWASM-014` delivered that generic production preview-drive substrate,
including current FITL production application/publication inventory support.
Ticket `150FITLWASM-010` delivered production routing and fail-closed-clean
preview-drive row activation, but the same-seam gate remained red at
`4124.29 ms` with `wasmScoreRowUnsupportedCount=0` and
`wasmPreviewCandidateFeatureRowUnsupportedCount=0`. Ticket
`150FITLWASM-015` delivered a route-local literal fast path and active
preview-drive batch counter, reducing score-row bytecode compiles from `47` to
`35`, but the same-seam gate remained red at `3958.91 ms`. Ticket
`150FITLWASM-016` delivered a generic bounded-feature Zobrist key cache and
hash-counter profiling surface, but the same-seam gate remained red at
`4018.94 ms`. Ticket `150FITLWASM-017` delivered active-route
query-materialization runtime reuse, but the same-seam gate remained red at
`2898.06 ms`. Ticket `150FITLWASM-018` delivered active-route token-index COW
sharing and bounded decision-frame digest caching, but the same-seam gate
remained red at `2761.91 ms`. Ticket `150FITLWASM-019` delivered exact shared
FNV hashing and kept the active route clean, but the same-seam gate remained
red at `2460.65 ms`. Ticket `150FITLWASM-020` delivered unchanged
token-placement hash elision plus encoded bytecode input caching and kept the
active route clean, but the same-seam gate remained red around `2.5 s`. Ticket
`150FITLWASM-021` delivered a generic initial-state setup hash reduction and
kept the active route clean, but the same-seam gate remained red around
`2.5 s`. Ticket `150FITLWASM-022` delivered bounded dynamic Zobrist
feature-key memoization and kept the active route clean, but the same-seam gate
remained red at `2539.8 ms`. Ticket `150FITLWASM-023` delivered reconciled
apply-move token-placement hash deferral and kept the active route clean, but
the same-seam gate remained red at `2557.17 ms`. Ticket `150FITLWASM-024`
delivered run-local initial full-hash Zobrist table cache reuse and kept the
active route clean, but the same-seam gate remained red at `2467.29 ms`.
Ticket `150FITLWASM-025` delivered generic FNV prefix-state reuse for Zobrist
feature keys and decision-stack digest salts, kept the active route clean, and
left the same-seam gate red at `2375.99 ms`. Ticket `150FITLWASM-026`
delivered a run-local pending-request fingerprint cache in generic
decision-sequence analysis, kept the active route clean, and left the same-seam
gate red at `2408.84 ms`. Ticket `150FITLWASM-027` delivered a generic
namespace-prefix stable-fingerprint hasher for decision-sequence pending
requests, removed the direct `stableFingerprintHex` / `fnv1a64` CPU bucket,
kept the active route clean, and left the same-seam gate red at `2477.81 ms`.
Ticket `150FITLWASM-028` delivered generic query/spatial allocation reductions
and cached WASM layout encoding, kept the active route clean, and reduced the
same-seam gate into the low `~2.1 s` range while leaving it red. Ticket
`150FITLWASM-029` landed generic encoding, reference-cache, token-index
refresh, decision-sequence fingerprint, query/map-space allocation reductions,
static binding-name shortcuts, token-index scan allocation reduction, and a
versioned per-context `resolveRef` cache, kept the active route clean, and left
the decisive same-seam gate red at `2046.48 ms`. Ticket `150FITLWASM-030`
landed generic connected-zone allocation reductions and boolean connected
condition traversal, kept the active route clean, and left the decisive
same-seam gate red at `1910.21 ms`. Ticket `150FITLWASM-031` landed generic
microturn continuation-binding allocation cleanup, a `tokenZones`
token-state-index allocation cleanup, and a compiled `zoneVar` dynamic-selector
parity fix, kept the active route clean, and left the confirmed same-seam gate
red at `1773.64 ms` with a retained repeat at `1754.11 ms`. Ticket
`150FITLWASM-032` delivered a larger active-route residual slice: score-row
precompile, diagnostics suppression, hash feature coverage, partial boolean
condition compilation, and generic zone/token count-query materialization
removal. The same-seam gate remained red at per-card `1561.81 ms`, with
active-route unsupported counters still `0`. Ticket `150FITLWASM-033`
landed opt-in hot-path residual buckets, context-independent token-filter count
caching, deterministic schema-order decision-stack frame digest input,
token-index build-loop allocation cleanup, little-endian WASM input word
writes, and selected-move identity lookup. The same-seam gate remains red, but
the final retained solo samples improved from `1561.81 ms` to `1355.26 ms` and
`1383.35 ms`, with active-route unsupported counters still `0`.
Ticket `150FITLWASM-034` executed that next residual pass and retained no code
changes. It recorded a fresh clean `1512.38 ms` same-seam confirmation,
rejected same-seam probes that failed to materially reduce work, and handed the
reset `<=1800 ms` gate to ticket `149FITLEVNUMVM-016`.

### Phase 4 — Same-seam performance gate

Runs the Spec 149 one-card command on the WASM path and adds or updates
`packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` when it can
truthfully assert the reset `<=1800 ms` gate.

### Phase 5 — Default flip handoff

Once the WASM path is correct and the reset budget is green, ticket
`149FITLEVNUMVM-016` owns the F14 default flip and closure-tree deletion. This
spec does not delete closure-tree code directly.

## 6. FOUNDATIONS.md Alignment

| Foundation | Alignment |
|---|---|
| F1 Engine Agnosticism | The WASM backend executes generic bytecode and generic encoded buffers only. |
| F2 Evolution-First Design | Evolution still mutates GameSpecDoc YAML; WASM consumes compiled artifacts. |
| F5 One Rules Protocol | Legal action publication and application semantics remain kernel-owned; WASM routing may only claim support where an equivalent generic seam is proven. |
| F6 Schema Ownership | No per-game schemas; any buffer schemas are generic and versioned. |
| F7 Specs Are Data | No executable scripts or callbacks in GameSpecDoc. |
| F8 Determinism | Integer-only arithmetic and canonical buffer ordering are mandatory. |
| F10 Bounded Computation | VM execution is bounded by bytecode length, action count, and configured preview depth. |
| F11 Immutability | Authoritative GameState remains immutable; any WASM mutable buffers are private scoped execution state. |
| F14 No Backwards Compatibility | TS/WASM A/B routing is temporary proof machinery and must be deleted at the default flip. |
| F15 Architectural Completeness | This replaces the failed TypeScript-local tuning path with a root-cause runtime architecture. |
| F16 Testing as Proof | Equivalence, determinism, and perf gates are required before defaulting. |

## 7. Acceptance Criteria

1. WASM and TypeScript policy VM values are equivalent for the supported generic bytecode subset exercised by the existing FITL bytecode corpus, and later batch score parity is proven before any performance claim is accepted.
2. The one-card same-seam gate is `<=1800 ms` under all 4 baseline profiles with `verifyIncrementalHash=true`.
3. No FITL-specific code appears in Rust, TypeScript bridge code, schemas, or buffer encoders.
4. Any temporary A/B switch is removed by the later default-flip ticket, not retained as a compatibility path.
5. Ticket `149FITLEVNUMVM-016` remains blocked until the reset gate is green.

## 8. Initial Tickets

- [`archive/tickets/150FITLWASM-001.md`](../tickets/150FITLWASM-001.md) — Phase 5 WASM architecture and ABI skeleton.
- [`archive/tickets/150FITLWASM-002.md`](../tickets/150FITLWASM-002.md) — WASM policy bytecode execution parity.
- [`archive/tickets/150FITLWASM-003.md`](../tickets/150FITLWASM-003.md) — Encoded-state action batch bridge.
- [`archive/tickets/150FITLWASM-004.md`](../tickets/150FITLWASM-004.md) — Candidate-dependent WASM batch scoring integration.
- [`archive/tickets/150FITLWASM-005.md`](../tickets/150FITLWASM-005.md) — Non-preview policy score-row WASM handoff and preview prerequisite split.
- [`archive/tickets/150FITLWASM-006.md`](../tickets/150FITLWASM-006.md) — Preview-backed WASM score-row handoff and perf gate preflight.
- [`archive/tickets/150FITLWASM-007.md`](../tickets/150FITLWASM-007.md) — Production WASM score-row integration and perf gate closure.
- [`archive/tickets/150FITLWASM-008.md`](../tickets/150FITLWASM-008.md) — Production preview row materialization WASM handoff.
- [`archive/tickets/150FITLWASM-009.md`](../tickets/150FITLWASM-009.md) — Preview-state surface row materialization WASM ABI.
- [`archive/tickets/150FITLWASM-011.md`](../tickets/150FITLWASM-011.md) — Generic encoded preview-drive substrate prerequisite.
- [`archive/tickets/150FITLWASM-012.md`](../tickets/150FITLWASM-012.md) — FITL-current encoded preview-drive class expansion.
- [`archive/tickets/150FITLWASM-013.md`](../tickets/150FITLWASM-013.md) — Completed encoded preview-state slot inventory substrate prerequisite.
- [`archive/tickets/150FITLWASM-014.md`](../tickets/150FITLWASM-014.md) — Implemented generic production preview-drive substrate prerequisite.
- [`archive/tickets/150FITLWASM-010.md`](../tickets/150FITLWASM-010.md) — Completed preview-drive production routing and fail-closed-clean active route.
- [`archive/tickets/150FITLWASM-015.md`](../tickets/150FITLWASM-015.md) — Completed route-local literal fast path with red measured gate successor.
- [`archive/tickets/150FITLWASM-016.md`](../tickets/150FITLWASM-016.md) — Completed residual active-route hash-cache slice with red measured gate successor.
- [`archive/tickets/150FITLWASM-017.md`](../tickets/150FITLWASM-017.md) — Completed active-route query-materialization runtime reuse with red measured gate successor.
- [`archive/tickets/150FITLWASM-018.md`](../tickets/150FITLWASM-018.md) — Completed active-route token-index/digest cleanup with red measured gate successor.
- [`archive/tickets/150FITLWASM-019.md`](../tickets/150FITLWASM-019.md) — Completed exact shared FNV hashing with red measured gate successor.
- [`archive/tickets/150FITLWASM-020.md`](../tickets/150FITLWASM-020.md) — Completed residual active-route query/eval/encoding slice with red measured gate successor.
- [`archive/tickets/150FITLWASM-021.md`](../tickets/150FITLWASM-021.md) — Completed deeper active-route query/apply/hash residual closure with red measured gate successor.
- [`archive/tickets/150FITLWASM-022.md`](../tickets/150FITLWASM-022.md) — Completed bounded dynamic Zobrist feature-key cache with red measured gate successor.
- [`archive/tickets/150FITLWASM-023.md`](../tickets/150FITLWASM-023.md) — Completed residual apply-move token-hash deferral with red measured gate successor.
- [`archive/tickets/150FITLWASM-024.md`](../tickets/150FITLWASM-024.md) — Completed initial full-hash runtime-table cache reuse with red measured gate successor.
- [`archive/tickets/150FITLWASM-025.md`](../tickets/150FITLWASM-025.md) — Completed generic FNV prefix-state residual closure with red measured gate successor.
- [`archive/tickets/150FITLWASM-026.md`](../tickets/150FITLWASM-026.md) — Completed pending-request fingerprint cache with red measured gate successor.
- [`archive/tickets/150FITLWASM-027.md`](../tickets/150FITLWASM-027.md) — Completed stable-fingerprint prefix-hasher closure with red measured gate successor.
- [`archive/tickets/150FITLWASM-028.md`](../tickets/150FITLWASM-028.md) — Completed query/spatial allocation and layout-encoding residual closure with red measured gate successor.
- [`archive/tickets/150FITLWASM-029.md`](../tickets/150FITLWASM-029.md) — Completed allocation, encoding, query/eval, token-index, digest/hash, and process allocation residual closure after retained reduction slices.
- [`archive/tickets/150FITLWASM-030.md`](../tickets/150FITLWASM-030.md) — Completed connected-zone allocation and connected-condition traversal residual closure with red measured gate successor.
- [`archive/tickets/150FITLWASM-032.md`](../tickets/150FITLWASM-032.md) — Completed larger active-route residual slice: score-row precompile, diagnostics suppression, hash feature coverage, partial boolean compiler, and generic zone/token count-query materialization removal; final gate remains red at per-card `1561.81 ms`.
- [`archive/tickets/150FITLWASM-033.md`](../tickets/150FITLWASM-033.md) — Implemented material post-count residual slice: retained hot-path residual buckets, context-independent token-count cache, schema-order decision-stack frame digest input, token-index build-loop cleanup, little-endian WASM input word writes, and selected-move identity lookup; final gate remains red at best retained solo `1355.26 ms`.
- [`archive/tickets/150FITLWASM-034.md`](../tickets/150FITLWASM-034.md) — Terminal post-033 residual decision: no code retained, original `<=250 ms` blocker retired, reset `<=1800 ms` successor-runtime gate handed to `149FITLEVNUMVM-016`.

## Outcome

Completed on 2026-05-04 as a terminal successor-architecture and budget-reset
spec.

Spec 150 delivered the Rust/WASM package shape, deterministic ABI skeleton,
policy-bytecode parity, encoded-state/action batch bridge, production score-row
and preview-drive routing, fail-closed-clean diagnostics, and a long sequence
of generic active-route runtime reductions through ticket `150FITLWASM-033`.
Ticket `150FITLWASM-034` then proved that the original `<=250 ms` blocker is
not feasible for the current same-seam architecture without changing the amount
of work done per candidate/preview.

The final decision was to stop the Spec 150 residual-ticket chain, retire the
original `<=250 ms` target as a blocker, and hand a measured `<=1800 ms`
successor-runtime gate to `149FITLEVNUMVM-016` for the F14 default-flip /
closure-tree deletion cut. Verification and exact red-gate evidence are
recorded in the archived `150FITLWASM-*` ticket outcomes, especially
`archive/tickets/150FITLWASM-033.md` and
`archive/tickets/150FITLWASM-034.md`.
