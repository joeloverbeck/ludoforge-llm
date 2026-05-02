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

### Phase 4 — Same-seam performance gate

Runs the Spec 149 one-card command on the WASM path and adds or updates `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` only when it can truthfully assert `<=250 ms`.

### Phase 5 — Default flip handoff

Once the WASM path is correct and the budget is green, ticket `149FITLEVNUMVM-016` owns the F14 default flip and closure-tree deletion. This spec does not delete closure-tree code directly.

## 6. FOUNDATIONS.md Alignment

| Foundation | Alignment |
|---|---|
| F1 Engine Agnosticism | The WASM backend executes generic bytecode and generic encoded buffers only. |
| F2 Evolution-First Design | Evolution still mutates GameSpecDoc YAML; WASM consumes compiled artifacts. |
| F5 One Rules Protocol | Legal action publication and application remain kernel-owned until a later ticket proves an equivalent generic WASM seam. |
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
- [`tickets/150FITLWASM-003.md`](../tickets/150FITLWASM-003.md) — Encoded-state action batch bridge.
