# Spec 151: Decision-Stack Serialization Canonicality

**Status**: PROPOSED
**Priority**: P2 (corrects a determinism / artifact-identity blind spot exposed by PR #231; not a CI blocker once Spec 150's lifecycle termination lands and stalls become rarer, but the gap is structural and silently affects every decision-stack-bearing artifact)
**Complexity**: S-M (schema-driven recursion through the existing decision-stack types; no public-API change, no GameSpecDoc YAML change, additive Zod schema constraints)
**Dependencies**:
- Foundation 8 (Determinism Is Sacred) — "State serialization round-trips must be canonical and bit-identical." A serialized state with hidden BigInts in nested suspended-frame snapshots is not bit-identical to a re-deserialized version, breaking the canonical-equality contract. F8 is the foundation this spec exists to honor.
- Foundation 11 (Immutability) — the serializer MUST NOT mutate input state. The PR #231 generic walker honored this by copy-on-bigint; the typed recursion this spec proposes does it structurally.
- Foundation 13 (Artifact Identity and Reproducibility) — "Every compiled artifact, replay, and experiment result MUST carry enough identity to reproduce it exactly." If serialization silently drops or mis-encodes nested state, replay reproducibility breaks.
- Foundation 14 (No Backwards Compatibility) — the existing `_runningHash` strip in `serializeGameState` is the precedent: explicit, structural, no shim. This spec extends the same shape rather than retaining a generic walker.
- Foundation 15 (Architectural Completeness) — PR #231's recursive BigInt walker is a generic safety net. This spec replaces it with explicit type-driven recursion that the compiler enforces.
- Spec 150 (lifecycle termination) — once that ships, the simulator stops more cleanly, so suspended-frame states are exposed less often. But artifacts captured mid-decision (debug snapshots, evolution probes that pause mid-resolution) still hit the same gap. Spec 151 closes it independently.

**Source**:
- PR #231 investigation. `spec-140-replay-identity.test.ts` failed with `TypeError: Do not know how to serialize a BigInt` once the simulator started stopping mid-suspended-frame. The `find-bigint.mjs` probe attached to that PR found unconverted BigInts at:
  - `$.decisionStack.1.effectFrame.suspendedFrame.state.rng.state.0`
  - `$.decisionStack.1.effectFrame.suspendedFrame.state.rng.state.1`
  - `$.decisionStack.1.effectFrame.suspendedFrame.state.stateHash`
  - `$.decisionStack.1.effectFrame.suspendedFrame.state._runningHash`
  - `$.decisionStack.1.effectFrame.suspendedFrame.rng.state.state.0`
  - `$.decisionStack.1.effectFrame.suspendedFrame.rng.state.state.1`
- The shipped fix (commit `343912bc`, instrumentation per PR #231): a generic `sanitizeNestedBigInts(value)` recursive walker invoked as a defensive pass at the bottom of `serializeGameState` (`kernel/serde.ts:143`). Functional, but catches BigInts wherever they appear — too permissive and not type-checked.
- The deserializer was subsequently patched with a symmetric walker `restoreNestedSerializedBigInts` (`kernel/serde.ts:73-115`) in commit `147b3521` (Spec 150's implementation), invoked from `deserializeGameState` (line 162). Both walkers form the same generic-walker pattern; this spec deletes them atomically. Removing only one would leave F15 incomplete.
- `kernel/serde.ts` already has explicit conversions for the top-level fields: `state.stateHash`, `state.rng.state[]`, `state._runningHash` (stripped). The nested fields under `decisionStack[i].effectFrame.suspendedFrame.state` are GameState snapshots that recursively contain the same fields. The serialization code was written before the suspended-frame state was fully realized as "another GameState."
- A subtle structural asymmetry to honor in the new serializers: `GameState.rng: RngState` (flat: `{algorithm, version, state: bigint[]}`) but `SuspendedEffectFrameSnapshot.rng: Rng` (wrapper: `{state: RngState}`). This explains the probe's three-level path `suspendedFrame.rng.state.state.0`. Any explicit serializer for the suspended-frame `rng` field must traverse the wrapper.

## Brainstorm Context

**Original framing.** `serializeGameState` exists because GameState contains BigInts that JSON does not natively round-trip. The function strips `_runningHash` and converts `stateHash` and `rng.state` to hex strings. The implementation was correct for top-level state but did not anticipate that `state.decisionStack` could contain nested `effectFrame.suspendedFrame` payloads where `suspendedFrame.state` is itself a GameState — recursively bringing back the same BigInt-bearing fields.

The PR #231 fix added a generic walker, `sanitizeNestedBigInts`, that recursively converts any leftover BigInt to a hex string. It works, but:

1. It hides a schema gap — the serializer no longer needs to know what structures contain nested states.
2. It defeats type-checking — the compiler does not enforce that nested-state fields are explicitly serialized. A future schema addition (e.g., a parallel `interruptStack` snapshot field) silently piggybacks on the walker.
3. It opens the door to false negatives — if a future schema field carries a BigInt that should NOT be hex-encoded (e.g., a count field, a duration field measured in nanoseconds), the walker eagerly stringifies it.

**Motivation.**
1. **F8 canonicality** demands bit-identical round-trip for canonical states. The walker pattern is "convert and hope" — opaque to the canonical-state contract.
2. **F13 reproducibility** depends on knowing exactly what's in the artifact. A walker hides the schema; explicit recursion documents it.
3. **F15 completeness** wants the kernel's serialization protocol to *match* the kernel's state-shape protocol structurally. The protocol should say "every nested GameState reuses `serializeGameState`," not "any BigInt is encoded; assume the rest is JSON-safe."

**Prior art surveyed.**
- **`serializeTrace` already does explicit recursion** for `decisions[i].stateHash` and `probeHoleRecoveries[i].{stateHashBefore,stateHashAfter}`. Same pattern: structurally drive the conversion, not by walking unknown fields. This spec extends that pattern to `decisionStack`.
- **Protobuf / Cap'n Proto serialization** — the encoder follows the schema, not the runtime values. Foreign types fail-fast at compile time. We can't import that machinery, but we can match the discipline.
- **Spec 12 (CLI)** — every CLI artifact roundtrips through `serializeTrace` / `deserializeTrace`. Any consumer downstream of the simulator that pauses execution and snapshots state today is at silent risk if the snapshot lands on a suspended-frame state.

**Synthesis.** Replace BOTH generic walkers (`sanitizeNestedBigInts` and the symmetric deserializer walker `restoreNestedSerializedBigInts`) with explicit recursion driven by the schema:

1. `SuspendedEffectFrameSnapshot` gets a `Serialized*` sibling whose nested-state field is typed as `SerializedGameState`.
2. `serializeSuspendedFrame(frame): SerializedSuspendedEffectFrameSnapshot` calls `serializeGameState(frame.state)` recursively and `serializeRng(frame.rng)` for the wrapped `Rng`. Symmetric `deserializeSuspendedFrame` performs the inverse.
3. The decision-stack serializer iterates frames and applies `serializeSuspendedFrame`/`deserializeSuspendedFrame` per frame.
4. The Zod schema gap is concrete: `EffectExecutionFrameSnapshotSchema.suspendedFrame` is currently `z.unknown().optional()` (`schemas-core.ts:1355`). Replace it with a typed `SerializedSuspendedEffectFrameSnapshotSchema` that references `SerializedGameStateSchema` recursively via `z.lazy`. The outer `decisionStack` is already recursive via `z.lazy(() => DecisionStackFrameSchema)` (line 2158) — reuse that pattern.
5. Delete BOTH `sanitizeNestedBigInts` and `restoreNestedSerializedBigInts`. F14: no compat shim.

**Alternatives explicitly considered (and rejected).**
- **Keep the generic walker.** It works today and is one function. Rejected — F15 (architectural completeness) and the fact that future schema drift is silent.
- **Disallow nested GameState in suspended frames.** Replace `suspendedFrame.state: GameState` with a flatter representation (just enough to resume). Rejected — too invasive, would require refactoring the resume protocol; no clear win because suspended frames legitimately need full state continuity.
- **JSON.stringify replacer with a top-level BigInt encoder.** A custom `JSON.stringify(state, bigIntReplacer)` would handle BigInts during the actual stringify call. Rejected — it changes the semantics of `serializeGameState`'s return type (it would return a `JSON-stringified string` shape, not the structured `SerializedGameState`), breaking `assert.deepEqual(serializeTrace(...), serializeTrace(...))` comparisons used in determinism tests.

**User constraints reflected.**
- F1 ✅: no game-specific code; the protocol is generic over kernel state shape.
- F8 ✅: round-trip canonicality preserved structurally.
- F11 ✅: serialization remains pure, no input mutation.
- F13 ✅: artifacts carry full state without hidden BigInts.
- F14 ✅: deletes the walker in the same change.
- F15 ✅: serializer schema and runtime match exactly.

## Overview

```ts
// kernel/types-core.ts (additions; source type lives in kernel/microturn/types.ts)
export interface SerializedSuspendedEffectFrameSnapshot {
  readonly state: SerializedGameState;                   // recursively serialized (BigInt carrier)
  readonly rng: SerializedRng;                           // wraps SerializedRngState, mirroring Rng/RngState (BigInt carrier)
  readonly actorPlayer: GameState['activePlayer'];       // already JSON-safe
  readonly bindings: Readonly<Record<string, unknown>>;  // see Tests — bindings BigInt-safety check required
  readonly freeOperationOverlay?: FreeOperationExecutionOverlay; // already JSON-safe
  readonly leaf: SuspendedDecisionLeaf;                  // already JSON-safe
  readonly resumeStack: readonly SuspendedResumeFrame[]; // already JSON-safe
}

// kernel/serde.ts (replaces both walkers)
const serializeSuspendedFrame = (frame: SuspendedEffectFrameSnapshot): SerializedSuspendedEffectFrameSnapshot => ({
  ...frame,
  state: serializeGameState(frame.state),
  rng: serializeRng(frame.rng), // Rng is the wrapper; serializeRng descends into rng.state.state[]
});

const serializeDecisionStack = (stack: readonly DecisionStackFrame[]): readonly SerializedDecisionStackFrame[] => {
  return stack.map((frame) => ({
    ...frame,
    effectFrame: serializeEffectFrame(frame.effectFrame),
  }));
};

export const serializeGameState = (state: GameState): SerializedGameState => {
  // existing top-level conversions PLUS:
  //   decisionStack: serializeDecisionStack(state.decisionStack)
  // sanitizeNestedBigInts is DELETED.
};

export const deserializeGameState = (state: SerializedGameState): GameState => {
  // existing top-level conversions PLUS:
  //   decisionStack: deserializeDecisionStack(state.decisionStack)
  // restoreNestedSerializedBigInts is DELETED.
};
```

Symmetric `deserializeSuspendedFrame` / `deserializeDecisionStack` functions in the inverse direction. The Zod schema gap is concrete: `EffectExecutionFrameSnapshotSchema.suspendedFrame` is currently `z.unknown().optional()` and bottoms out the recursion that already exists at the `decisionStack` level (line 2158 references `DecisionStackFrameSchema` via `z.lazy`). Replace it with a typed `SerializedSuspendedEffectFrameSnapshotSchema` that references `SerializedGameStateSchema` via `z.lazy`.

## What to Change

### 1. `kernel/types-core.ts` (and `kernel/microturn/types.ts` for the source type)

- Add `SerializedSuspendedEffectFrameSnapshot` mirroring `SuspendedEffectFrameSnapshot` (`microturn/types.ts:140-148`) with all 7 fields explicitly typed:
  - `state: SerializedGameState` — recursively serialized (BigInt carrier).
  - `rng: SerializedRng` — wraps `SerializedRngState`, matching the `Rng → RngState` shape (BigInt carrier).
  - `actorPlayer: GameState['activePlayer']` — JSON-safe scalar.
  - `bindings: Readonly<Record<string, unknown>>` — JSON-safe in practice today; see Tests for the BigInt-safety lock-in.
  - `freeOperationOverlay?: FreeOperationExecutionOverlay` — already JSON-safe; verify with grep when implementing.
  - `leaf: SuspendedDecisionLeaf` — already JSON-safe; verify with grep when implementing.
  - `resumeStack: readonly SuspendedResumeFrame[]` — already JSON-safe; verify with grep when implementing.
- Add `SerializedDecisionStackFrame` mirroring `DecisionStackFrame` (`microturn/types.ts:205-221`) with `effectFrame: SerializedEffectExecutionFrameSnapshot`.
- Add `SerializedRng` (`{ state: SerializedRngState }`) and confirm `SerializedRngState` exists or add it.

### 2. `kernel/serde.ts`

- Add `serializeSuspendedFrame`, `serializeEffectFrame`, `serializeDecisionStackFrame`, `serializeDecisionStack`, and `serializeRng` (and the symmetric `deserialize*` family).
- Wire `serializeGameState` to call `serializeDecisionStack` on `state.decisionStack`.
- Wire `deserializeGameState` to call `deserializeDecisionStack`.
- **Delete BOTH `sanitizeNestedBigInts` AND `restoreNestedSerializedBigInts`** and remove their invocations from `serializeGameState` (line 143) and `deserializeGameState` (line 162). Both walkers form the same generic-walker pattern; removing only one leaves F15 incomplete.

### 3. `kernel/schemas-core.ts`

- The outer recursion is already in place: `SerializedGameStateSchema` (line 2138) references `DecisionStackFrameSchema` via `z.lazy(() => ...)` at line 2158. The concrete gap is `EffectExecutionFrameSnapshotSchema.suspendedFrame: z.unknown().optional()` at line 1355.
- Replace `z.unknown().optional()` with a typed `SerializedSuspendedEffectFrameSnapshotSchema` that references `SerializedGameStateSchema` recursively via `z.lazy`. The precedent at lines 1308, 1354, and 2158 covers this exact pattern.
- Add `SerializedRngSchema` for the wrapped `Rng` form; reuse the existing flat `rng` schema embedded inside `SerializedGameStateSchema` for the top-level case.

### 4. Audit pass — confirmed scope

Codebase audit (per the references in **Source**) established: today the only nested-`state: GameState` field reachable through serialized artifacts is `decisionStack[i].effectFrame.suspendedFrame.state`. The previously-suspected locations do NOT exist:

- `InterruptPhaseFrame` (`types-core.ts:1203-1206`) has only `phase` and `resumePhase` — no nested state.
- `runtime.snapshotForRollback` — not present in `GameState` or related types (zero grep hits across `packages/engine/src/`).
- `runtime.lastTerminalCheckpoint` — not present (zero grep hits).

Outcome: the explicit `Serialized*` sibling pattern this spec introduces becomes the contract for nested state. Any future state-bearing snapshot type added to the decision stack (or anywhere inside `GameState`) MUST follow the same pattern: a `Serialized*` sibling with explicit `SerializedGameState`/`SerializedRng` typing, plus a `serialize*`/`deserialize*` pair. Once both walkers are deleted, the type system rejects a raw `GameState` field appearing in any `Serialized*` shape, so a missing migration fails compilation rather than silently degrading at runtime.

### 5. Tests

- `test/unit/serialize-decision-stack-roundtrip.test.ts` — new, given a state with a non-empty `decisionStack` containing a `suspendedFrame.state`, serialize → JSON.stringify → JSON.parse → deserialize → `assert.deepEqual` to the original (using a content-equality helper since BigInts compare ok). Co-located under `test/unit/` to match the existing `test/unit/serde.test.ts` convention.
- `test/unit/serialize-suspended-frame.test.ts` — new, exercises nested round-trip on synthetic states. Includes a synthetic-`bindings` BigInt-safety case to lock in the assumption that `bindings: Record<string, unknown>` does not silently carry unconvertible values today.
- Update `test/unit/serde.test.ts` to add the schema-rejection case from Acceptance Criterion 6.
- Update `test/determinism/spec-140-replay-identity.test.ts` to actively assert on traces that would have hit the BigInt issue (use a seed where the simulator stops mid-decision-chain).
- A grep test: `grep -rn 'sanitizeNestedBigInts\|restoreNestedSerializedBigInts' packages/engine/src` → must return zero hits.

## Out of Scope

- The two BigInt walkers (`sanitizeNestedBigInts` and `restoreNestedSerializedBigInts`) stay in place between today and the moment this spec lands. F14 says no shim post-this-spec; both walkers are deleted in the atomic change.
- Changing the trace's `decisions[i]` shape — that's already explicit and correct.
- Reducing the size of suspended-frame snapshots (a separate perf optimization; this spec is correctness-only).

## Acceptance Criteria

### Tests That Must Pass

1. `JSON.stringify(serializeGameState(stateWithSuspendedFrame))` succeeds without exception.
2. `deserializeGameState(serializeGameState(state))` is a content-identity for any FITL or Texas state from the determinism corpus, including states captured mid-suspended-frame.
3. `serializeTrace(trace)` for a `runGame` trace that stops via `noLegalMoves` (so `finalState` carries a suspended frame) round-trips canonically.
4. `grep -rn 'sanitizeNestedBigInts\|restoreNestedSerializedBigInts' packages/engine/src` returns zero hits.
5. Replay-identity tests stay green.
6. The Zod schema (with the new typed `SerializedSuspendedEffectFrameSnapshotSchema`) accepts the new shape and rejects the old (BigInt-bearing) shape with a clear error message. Exercise this in `test/unit/serde.test.ts` (co-locate with existing serde tests; do NOT create `test/kernel/schemas-core.test.ts`, which does not exist today).

### Invariants

1. Per F8: same `(GameDef, seed, agents, maxTurns)` → `JSON.stringify(serializeTrace(run1.trace))` is byte-identical to `JSON.stringify(serializeTrace(run2.trace))`.
2. No code path stringifies a GameState that has been touched by the runtime *without* going through `serializeGameState`. TypeScript does NOT catch raw `JSON.stringify(state)` calls — `JSON.stringify` accepts `any`/`unknown`, and the BigInt failure surfaces only at runtime (which is precisely why the walkers were added in the first place). Enforce via a grep test or lint rule that scans `packages/engine/src/` for `JSON.stringify(` calls referencing values typed as `GameState` or `GameTrace` outside `kernel/serde.ts`.
3. The walker pattern is gone — the only BigInt encoding path is explicit in `serde.ts`.

## Test Plan

### New/Modified Tests

- `test/unit/serialize-decision-stack-roundtrip.test.ts` — new (co-located with existing `test/unit/serde.test.ts`).
- `test/unit/serialize-suspended-frame.test.ts` — new, exercises nested round-trip on synthetic states, including a synthetic-`bindings` BigInt-safety case.
- Update `test/unit/serde.test.ts` to add the schema-rejection case from Acceptance Criterion 6.
- Update `test/determinism/spec-140-replay-identity.test.ts` to add an explicit assertion that a noLegalMoves-stopped trace's serialized `finalState` survives `JSON.stringify`.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. `pnpm -F @ludoforge/engine test`.
3. `pnpm -F @ludoforge/engine test:integration:slow-parity` and the determinism shards.
4. `pnpm turbo lint typecheck`.
5. Grep enforcement: `grep -rn 'sanitizeNestedBigInts\|restoreNestedSerializedBigInts' packages/engine/` → expected zero.

## Follow-On Tickets

This section is a placeholder for `/spec-to-tickets` decomposition.

**Proposed namespace**: `151DECSTACSER`

**Anticipated decomposition outline** (informational; finalized by `/spec-to-tickets`):

- `151DECSTACSER-001` — Add `Serialized*` sibling types for `SuspendedEffectFrameSnapshot`, `DecisionStackFrame`, `EffectExecutionFrameSnapshot`, and `Rng` in `kernel/types-core.ts` / `kernel/microturn/types.ts`; also add the minimum `kernel/serde.ts` decision-stack codecs required for the corrected serialized type contract to compile.
- `151DECSTACSER-002` — Remove the remaining generic-walker invocations from `serializeGameState` and `deserializeGameState` after 001's explicit decision-stack codecs are in place.
- `151DECSTACSER-003` — Tighten `EffectExecutionFrameSnapshotSchema.suspendedFrame` with the typed `SerializedSuspendedEffectFrameSnapshotSchema` in `kernel/schemas-core.ts` (use `z.lazy`).
- `151DECSTACSER-004` — Delete `sanitizeNestedBigInts` and `restoreNestedSerializedBigInts` atomically with the type/serializer/schema work above. Add the grep enforcement test.
- `151DECSTACSER-005` — Tests: `serialize-decision-stack-roundtrip.test.ts`, `serialize-suspended-frame.test.ts`, schema-rejection case in `serde.test.ts`, and the explicit assertion in `spec-140-replay-identity.test.ts`. Add the lint-rule-or-grep enforcement for raw `JSON.stringify(state)` outside `kernel/serde.ts`.
- `151DECSTACSER-006` — Resolve the residual live simulator `noLegalMoves` suspended-frame witness from 005: either land a bounded durable live witness/fixture or record that no cheap live witness exists and keep the synthetic public-seam proof as authoritative.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-01:

- [`archive/tickets/151DECSTACSER-001.md`](../archive/tickets/151DECSTACSER-001.md) — Add `Serialized*` decision-stack types and minimal codecs
- [`archive/tickets/151DECSTACSER-002.md`](../archive/tickets/151DECSTACSER-002.md) — Retire decision-stack walker invocations after 001 wiring
- [`archive/tickets/151DECSTACSER-003.md`](../archive/tickets/151DECSTACSER-003.md) — Tighten `EffectExecutionFrameSnapshotSchema.suspendedFrame` to typed schema
- [`archive/tickets/151DECSTACSER-004.md`](../archive/tickets/151DECSTACSER-004.md) — Delete generic BigInt walkers + grep enforcement
- [`archive/tickets/151DECSTACSER-005.md`](../archive/tickets/151DECSTACSER-005.md) — Tests + raw `JSON.stringify` enforcement
- [`tickets/151DECSTACSER-006.md`](../tickets/151DECSTACSER-006.md) — Live noLegalMoves suspended-frame witness
