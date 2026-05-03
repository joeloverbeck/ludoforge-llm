# Spec 150 — FITL Policy VM WASM Port

**Status**: DRAFT
**Priority**: P0 — successor owner after Spec 149 Phase 4B missed the original evolution-readiness budget.
**Complexity**: XL — Rust/WASM runtime, deterministic FFI boundary, TS/WASM equivalence, and eventual default-flip integration.
**Dependencies**:
- `specs/149-fitl-evolution-readiness-numeric-substrate-bytecode-vm.md`
- `tickets/149FITLEVNUMVM-022.md`

## 1. Context

Spec 149 landed the TypeScript policy bytecode VM and several generic Phase 4B runtime-closure slices. The final same-seam gate still missed the original Phase 4 target by the wrong order of magnitude:

- `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-final`
- Result: RED, per-card `elapsedMs=6702.65` versus the `<=250 ms` target, with `verifyIncrementalHash=true`.

The TypeScript VM path is correct but insufficient as the architectural answer. This spec owns the next-stage Rust to WASM policy/preview runtime needed to make the original budget truthful without weakening it.

## 2. Goals

1. Preserve the Spec 149 `<=250 ms` one-card target under all 4 FITL baseline profiles with `verifyIncrementalHash=true`.
2. Move the remaining hot preview-drive scoring/runtime work behind a deterministic Rust/WASM batch interface.
3. Keep the engine generic: no FITL-specific opcodes, schemas, rule branches, identifiers, or hardcoded card/action knowledge.
4. Prove TS VM to WASM VM equivalence before any default flip.
5. Keep ticket `149FITLEVNUMVM-016` blocked until the WASM path makes the Phase 4 budget truthful; only then may it perform the F14 closure-tree deletion cut.

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
`2898.06 ms`. Ticket `150FITLWASM-018` is the residual active-route
preview-apply hash/digest, token-index lifetime, eval, and encoding successor.

### Phase 4 — Same-seam performance gate

Runs the Spec 149 one-card command on the WASM path and adds or updates `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` only when it can truthfully assert `<=250 ms`.

### Phase 5 — Default flip handoff

Once the WASM path is correct and the budget is green, ticket `149FITLEVNUMVM-016` owns the F14 default flip and closure-tree deletion. This spec does not delete closure-tree code directly.

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
2. The one-card same-seam gate is `<=250 ms` under all 4 baseline profiles with `verifyIncrementalHash=true`.
3. No FITL-specific code appears in Rust, TypeScript bridge code, schemas, or buffer encoders.
4. Any temporary A/B switch is removed by the later default-flip ticket, not retained as a compatibility path.
5. Ticket `149FITLEVNUMVM-016` remains blocked until the gate is green.

## 8. Initial Tickets

- [`archive/tickets/150FITLWASM-001.md`](../archive/tickets/150FITLWASM-001.md) — Phase 5 WASM architecture and ABI skeleton.
- [`archive/tickets/150FITLWASM-002.md`](../archive/tickets/150FITLWASM-002.md) — WASM policy bytecode execution parity.
- [`archive/tickets/150FITLWASM-003.md`](../archive/tickets/150FITLWASM-003.md) — Encoded-state action batch bridge.
- [`archive/tickets/150FITLWASM-004.md`](../archive/tickets/150FITLWASM-004.md) — Candidate-dependent WASM batch scoring integration.
- [`archive/tickets/150FITLWASM-005.md`](../archive/tickets/150FITLWASM-005.md) — Non-preview policy score-row WASM handoff and preview prerequisite split.
- [`archive/tickets/150FITLWASM-006.md`](../archive/tickets/150FITLWASM-006.md) — Preview-backed WASM score-row handoff and perf gate preflight.
- [`archive/tickets/150FITLWASM-007.md`](../archive/tickets/150FITLWASM-007.md) — Production WASM score-row integration and perf gate closure.
- [`archive/tickets/150FITLWASM-008.md`](../archive/tickets/150FITLWASM-008.md) — Production preview row materialization WASM handoff.
- [`archive/tickets/150FITLWASM-009.md`](../archive/tickets/150FITLWASM-009.md) — Preview-state surface row materialization WASM ABI.
- [`archive/tickets/150FITLWASM-011.md`](../archive/tickets/150FITLWASM-011.md) — Generic encoded preview-drive substrate prerequisite.
- [`archive/tickets/150FITLWASM-012.md`](../archive/tickets/150FITLWASM-012.md) — FITL-current encoded preview-drive class expansion.
- [`archive/tickets/150FITLWASM-013.md`](../archive/tickets/150FITLWASM-013.md) — Completed encoded preview-state slot inventory substrate prerequisite.
- [`archive/tickets/150FITLWASM-014.md`](../archive/tickets/150FITLWASM-014.md) — Implemented generic production preview-drive substrate prerequisite.
- [`archive/tickets/150FITLWASM-010.md`](../archive/tickets/150FITLWASM-010.md) — Completed preview-drive production routing and fail-closed-clean active route.
- [`archive/tickets/150FITLWASM-015.md`](../archive/tickets/150FITLWASM-015.md) — Completed route-local literal fast path with red measured gate successor.
- [`archive/tickets/150FITLWASM-016.md`](../archive/tickets/150FITLWASM-016.md) — Completed residual active-route hash-cache slice with red measured gate successor.
- [`archive/tickets/150FITLWASM-017.md`](../archive/tickets/150FITLWASM-017.md) — Completed active-route query-materialization runtime reuse with red measured gate successor.
- [`tickets/150FITLWASM-018.md`](../tickets/150FITLWASM-018.md) — Residual active-route preview-apply hash/digest and token-index closure.
