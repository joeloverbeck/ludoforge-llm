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
- The shipped PR #231 fix: a generic `sanitizeNestedBigInts(value)` recursive walker invoked as a defensive pass at the bottom of `serializeGameState`. Functional, but catches BigInts wherever they appear — too permissive and not type-checked.
- `kernel/serde.ts` already has explicit conversions for the top-level fields: `state.stateHash`, `state.rng.state[]`, `state._runningHash` (stripped). The nested fields under `decisionStack[i].effectFrame.suspendedFrame.state` are GameState snapshots that recursively contain the same fields. The serialization code was written before the suspended-frame state was fully realized as "another GameState."

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

**Synthesis.** Replace the generic `sanitizeNestedBigInts` walker with explicit recursion driven by the schema:

1. `SuspendedEffectFrameSnapshot.state: SerializedGameState` (typed; same nominal type as the top-level serialized state).
2. `serializeSuspendedFrame(frame): SerializedSuspendedFrame` calls `serializeGameState(frame.state)` recursively.
3. The decision-stack serializer iterates frames and applies `serializeSuspendedFrame` per frame.
4. Zod schemas mirror the structure: `SerializedGameStateSchema.refine(...)` includes `decisionStack[i].effectFrame.suspendedFrame.state: SerializedGameStateSchema` (the recursive Zod ref).
5. Delete `sanitizeNestedBigInts`. F14: no compat shim.

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
// kernel/types-core.ts (additions)
export interface SerializedSuspendedEffectFrame {
  // ...existing scalar fields, all already JSON-safe...
  readonly state: SerializedGameState;        // recursively serialized
  readonly rng: SerializedRng;                // explicit, not piggybacked
  // ...other nested-state fields, each explicitly typed...
}

// kernel/serde.ts (replaces walker)
const serializeSuspendedFrame = (frame: SuspendedEffectFrameSnapshot): SerializedSuspendedEffectFrame => ({
  ...frame,
  state: serializeGameState(frame.state),
  rng: serializeRng(frame.rng),
});

const serializeDecisionStack = (stack: readonly DecisionStackFrame[] | undefined): readonly SerializedDecisionStackFrame[] | undefined => {
  if (stack === undefined) return undefined;
  return stack.map((frame) => ({
    ...frame,
    ...(frame.effectFrame === undefined ? {} : { effectFrame: serializeEffectFrame(frame.effectFrame) }),
  }));
};

export const serializeGameState = (state: GameState): SerializedGameState => {
  // existing top-level conversions PLUS:
  //   decisionStack: serializeDecisionStack(state.decisionStack)
  // sanitizeNestedBigInts is DELETED.
};
```

Symmetric `deserializeSuspendedFrame` / `deserializeDecisionStack` functions in the inverse direction. The Zod schema `SerializedGameStateSchema` becomes recursively self-referential at `decisionStack[i].effectFrame.suspendedFrame.state`.

## What to Change

### 1. `kernel/types-core.ts`

- Promote `SuspendedEffectFrameSnapshot` to have a `Serialized*` sibling typed with `SerializedGameState` for its nested-state fields.
- Same for any other state-bearing snapshot type the decision stack can carry (audit all `.state: GameState` occurrences inside `decisionStack` schema).

### 2. `kernel/serde.ts`

- Add `serializeSuspendedFrame`, `serializeDecisionStackFrame`, `serializeDecisionStack` (and inverses).
- Wire `serializeGameState` to call `serializeDecisionStack` on `state.decisionStack`.
- Wire `deserializeGameState` to call `deserializeDecisionStack`.
- **Delete `sanitizeNestedBigInts`** and remove its invocation from `serializeGameState`.

### 3. `kernel/schemas-core.ts`

- Add a recursive Zod schema for `SerializedGameStateSchema` so `decisionStack[i].effectFrame.suspendedFrame.state` validates as a nested `SerializedGameStateSchema`. Use `z.lazy(() => ...)` for the cycle.

### 4. Audit pass — find any other `state: GameState` field reachable through serialized artifacts

Suspect locations (verify and add explicit serialization where any are found):
- `interruptPhaseStack[i].suspendedState`?
- `runtime.snapshotForRollback`?
- `runtime.lastTerminalCheckpoint`?

For each one, write a targeted unit test: "round-trip preserves nested state hashes."

### 5. Tests

- `test/kernel/serialize-decision-stack-roundtrip.test.ts` — given a state with a non-empty `decisionStack` containing a `suspendedFrame.state`, serialize → JSON.stringify → JSON.parse → deserialize → `assert.deepEqual` to the original (using a content-equality helper since BigInts compare ok).
- Update `test/determinism/spec-140-replay-identity.test.ts` to actively assert on traces that would have hit the BigInt issue (use a seed where the simulator stops mid-decision-chain).
- A grep test: `grep -rn 'sanitizeNestedBigInts' packages/engine/src` → must return zero hits.

## Out of Scope

- The PR #231 BigInt walker stays in place for the period between the PR landing and this spec landing. F14 says no shim post-this-spec; the walker is deleted in the atomic change.
- Changing the trace's `decisions[i]` shape — that's already explicit and correct.
- Reducing the size of suspended-frame snapshots (a separate perf optimization; this spec is correctness-only).

## Acceptance Criteria

### Tests That Must Pass

1. `JSON.stringify(serializeGameState(stateWithSuspendedFrame))` succeeds without exception.
2. `deserializeGameState(serializeGameState(state))` is a content-identity for any FITL or Texas state from the determinism corpus, including states captured mid-suspended-frame.
3. `serializeTrace(trace)` for a `runGame` trace that stops via `noLegalMoves` (so `finalState` carries a suspended frame) round-trips canonically.
4. `grep -rn 'sanitizeNestedBigInts' packages/engine/src` returns zero hits.
5. Replay-identity tests stay green.
6. The Zod recursive schema accepts the new shape and rejects the old (BigInt-bearing) shape with a clear error message — exercise this in `test/kernel/schemas-core.test.ts`.

### Invariants

1. Per F8: same `(GameDef, seed, agents, maxTurns)` → `JSON.stringify(serializeTrace(run1.trace))` is byte-identical to `JSON.stringify(serializeTrace(run2.trace))`.
2. No code path stringifies a GameState that has been touched by the runtime *without* going through `serializeGameState`. (Compile-time enforced by the type system: `JSON.stringify` of `GameState` directly is a TS error because `bigint` is not assignable to a JSON-serializable type. We add a lint rule if needed.)
3. The walker pattern is gone — the only BigInt encoding path is explicit in `serde.ts`.

## Test Plan

### New/Modified Tests

- `test/kernel/serialize-decision-stack-roundtrip.test.ts` — new.
- `test/kernel/serialize-suspended-frame.test.ts` — new, exercises nested round-trip on synthetic states.
- Update `test/determinism/spec-140-replay-identity.test.ts` to add an explicit assertion that a noLegalMoves-stopped trace's serialized `finalState` survives `JSON.stringify`.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. `pnpm -F @ludoforge/engine test`.
3. `pnpm -F @ludoforge/engine test:integration:slow-parity` and the determinism shards.
4. `pnpm turbo lint typecheck`.
5. Grep enforcement: `grep -rn 'sanitizeNestedBigInts' packages/engine/` → expected zero.
