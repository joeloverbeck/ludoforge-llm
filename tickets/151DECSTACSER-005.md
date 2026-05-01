# 151DECSTACSER-005: Tests + raw JSON.stringify enforcement

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/test/` (new test files + modifications)
**Deps**: `archive/tickets/151DECSTACSER-002.md`, `archive/tickets/151DECSTACSER-003.md`, `tickets/151DECSTACSER-004.md`

## Problem

Spec 151's Acceptance Criteria require five distinct test additions: (1) decision-stack round-trip tests, (2) suspended-frame round-trip with synthetic-`bindings` BigInt-safety lock-in, (3) Zod schema-rejection for old (BigInt-bearing) shapes, (4) explicit assertion in `spec-140-replay-identity.test.ts` that a noLegalMoves-stopped trace's serialized `finalState` survives `JSON.stringify`, and (5) enforcement that no module outside `kernel/serde.ts` calls `JSON.stringify` directly on a value typed as `GameState`/`GameTrace` (the new Invariant 2 from the reassessment). This ticket lands all five together — they exercise the new behavior introduced by 002–004.

## Assumption Reassessment (2026-05-01)

1. Existing serde tests live at `packages/engine/test/unit/serde.test.ts` (confirmed in 151 reassessment). New round-trip and synthetic-bindings tests co-locate in `test/unit/` matching the convention. The spec's `test/kernel/schemas-core.test.ts` reference was removed during reassessment — fold the schema-rejection case into existing `serde.test.ts`.
2. `spec-140-replay-identity.test.ts` lives at `packages/engine/test/determinism/spec-140-replay-identity.test.ts`. Its current assertions cover finalState BigInt serialization round-trip but don't explicitly test a noLegalMoves-stopped trace with a non-empty decision stack. Add an explicit assertion case.
3. `SuspendedEffectFrameSnapshot.bindings: Readonly<Record<string, unknown>>` is empirically JSON-safe today (no production binding carries a BigInt). The synthetic test fabricates a binding with a BigInt to lock in the assumption — the test asserts EITHER successful conversion OR a clear fail-fast error message, depending on what 002 commits to (current 002 treats bindings as pass-through, which would mean a `JSON.stringify` failure on the synthetic state).
4. The spec's Invariant 2 acknowledges that TypeScript does NOT catch raw `JSON.stringify(state)` calls. The pragmatic enforcement is a grep test that flags `JSON.stringify(...state)` and `JSON.stringify(...trace)` token patterns outside `kernel/serde.ts`. Type-aware enforcement via a custom ESLint rule is a follow-up if pragmatic grep proves insufficient.
5. Engine tests use `node --test`. Vitest is runner-only; do not import Vitest helpers in engine tests.

## Architecture Check

1. F8 (canonicality) and F13 (artifact identity) are proven by automated tests, satisfying F16 (Testing as Proof). Round-trip tests are architectural invariants; the determinism corpus already enforces canonical equality.
2. The synthetic-`bindings` BigInt test prevents a future regression where a kernel change introduces a BigInt-carrying binding without the serializer being updated to recurse into bindings. If 002's pass-through behavior is wrong, this test reveals it immediately.
3. The schema-rejection test exercises 003's tightening — proving that a payload with BigInts (the pre-spec walker output before deletion) would now fail validation, a structural protection against silent regression.
4. The JSON.stringify grep test is pragmatic, not type-aware. Document the limitation in the test file's preamble so a future maintainer knows when to upgrade to ESLint.

## What to Change

### 1. New `packages/engine/test/unit/serialize-decision-stack-roundtrip.test.ts`

```ts
// @test-class: architectural-invariant
```

Construct a `GameState` with a non-empty `decisionStack` containing a `suspendedFrame.state` that itself has a non-trivial `stateHash` and `rng.state[]`. Round-trip via:

```
state → serializeGameState → JSON.stringify → JSON.parse → SerializedGameStateSchema.parse → deserializeGameState → state'
```

Assert content-identity (use a content-equality helper since BigInts compare with `===`). Cover at least: empty `decisionStack`, single-frame stack with no suspended frame, single-frame stack with `suspendedFrame.state` that contains its own non-empty `decisionStack` (one level of recursion).

### 2. New `packages/engine/test/unit/serialize-suspended-frame.test.ts`

```ts
// @test-class: architectural-invariant
```

Synthetic `SuspendedEffectFrameSnapshot` round-trip tests covering:

- Standard round-trip: serialize → JSON.stringify → JSON.parse → deserialize → deepEqual.
- Wrapped `Rng` round-trip: assert `suspendedFrame.rng.state.state[i]` is correctly hex-encoded by `serializeRng` and restored by `deserializeRng`.
- Synthetic-`bindings` BigInt-safety: construct a frame with `bindings: { foo: 0xabcn }`. Assert that either (a) the round-trip succeeds with the BigInt converted (if 002 chose to recurse into bindings) OR (b) `JSON.stringify(serializeSuspendedFrame(frame))` throws with a clear error message naming `bindings` (if 002 chose pass-through). Document which behavior 002 committed to.

### 3. Modify `packages/engine/test/unit/serde.test.ts`

Add a schema-rejection test case. Construct a SerializedGameState payload where `decisionStack[0].effectFrame.suspendedFrame.state.stateHash` is a `bigint` (not a hex string) — i.e., the pre-spec walker's input shape. Assert `SerializedGameStateSchema.parse(payload)` throws with an error message that mentions the `stateHash` field path.

### 4. Modify `packages/engine/test/determinism/spec-140-replay-identity.test.ts`

Add an explicit test case using a seed that drives the simulator to stop with `stopReason === 'noLegalMoves'` (so `finalState` carries a suspended frame). Assert:

```ts
const trace = runOnce(seed);
assert.equal(trace.stopReason, 'noLegalMoves');
assert.ok(trace.finalState.decisionStack.length > 0);
const serialized = serializeTrace(trace);
const stringified = JSON.stringify(serialized); // must not throw
assert.ok(stringified.length > 0);
```

If no seed in the existing determinism corpus produces a `noLegalMoves` stop with a populated decision stack, instrument the existing canary corpus to find one and check it in as a fixture.

### 5. New `packages/engine/test/unit/json-stringify-state-enforcement.test.ts`

```ts
// @test-class: architectural-invariant
```

Grep `packages/engine/src/` for `JSON.stringify(` token occurrences. Assert that the only occurrences either (a) live inside `packages/engine/src/kernel/serde.ts` OR (b) are followed by an argument that is NOT typed as `GameState`/`GameTrace` (this requires a heuristic — flag any `JSON.stringify(state)`, `JSON.stringify(...state)`, `JSON.stringify(trace)`, `JSON.stringify(...trace)` literal token patterns outside `serde.ts`).

The pragmatic implementation: grep for the literal patterns and assert zero hits outside `kernel/serde.ts`. Document false-positive handling in the test file preamble:

```ts
// Pragmatic enforcement — a grep test that flags `JSON.stringify(state)` / `JSON.stringify(trace)`
// literal forms outside kernel/serde.ts. Type-aware enforcement (via a custom ESLint rule) is a
// follow-up if production code introduces a non-state variable named `state` or `trace` that
// triggers this test as a false positive.
```

## Files to Touch

- `packages/engine/test/unit/serialize-decision-stack-roundtrip.test.ts` (new)
- `packages/engine/test/unit/serialize-suspended-frame.test.ts` (new)
- `packages/engine/test/unit/serde.test.ts` (modify — add schema-rejection case)
- `packages/engine/test/determinism/spec-140-replay-identity.test.ts` (modify — add noLegalMoves explicit case)
- `packages/engine/test/unit/json-stringify-state-enforcement.test.ts` (new)

## Out of Scope

- Implementing the new serializers — owned by 002.
- Schema tightening — owned by 003.
- Walker function deletion or `walker-deletion-enforcement.test.ts` — owned by 004.
- Type-aware ESLint rule for raw `JSON.stringify` — explicitly deferred as a follow-up if grep proves insufficient.
- Regenerating golden trace fixtures — none of these tests require golden-trace re-blessing; the existing fixtures cover the canonical shape.

## Acceptance Criteria

### Tests That Must Pass

1. New `serialize-decision-stack-roundtrip.test.ts` passes — round-trip identity holds for empty, single-frame, and one-level-recursive decision stacks.
2. New `serialize-suspended-frame.test.ts` passes — wrapped Rng round-trip and synthetic-bindings BigInt-safety case behave per 002's commitment.
3. Modified `serde.test.ts` schema-rejection case throws with a clear error pointing at the BigInt-bearing field.
4. Modified `spec-140-replay-identity.test.ts` exercises a noLegalMoves trace's serialized finalState surviving `JSON.stringify`.
5. New `json-stringify-state-enforcement.test.ts` returns zero hits for raw `JSON.stringify(state|trace)` literal patterns outside `kernel/serde.ts`.
6. Full engine suite: `pnpm -F @ludoforge/engine test` and `pnpm -F @ludoforge/engine test:integration:slow-parity` stay green.
7. `pnpm turbo lint typecheck` passes.

### Invariants

1. Per F8: replay-identity for a stopped-mid-decision trace — same `(GameDef, seed, agents, maxTurns)` produces byte-identical `JSON.stringify(serializeTrace(trace))` across runs.
2. Per F13: a noLegalMoves trace's `serializeTrace(trace).finalState` is a fully canonical SerializedGameState — no hidden BigInts, no walker-dependent encoding.
3. Per F14 + Invariant 2 from the spec: no module outside `kernel/serde.ts` calls `JSON.stringify` directly on a `GameState`/`GameTrace`. Enforced by the new grep test (with the documented false-positive limitation).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/serialize-decision-stack-roundtrip.test.ts` — new. Architectural invariant. Covers nested-state round-trip identity.
2. `packages/engine/test/unit/serialize-suspended-frame.test.ts` — new. Architectural invariant. Wrapped-Rng + synthetic-bindings.
3. `packages/engine/test/unit/serde.test.ts` — modify. Schema-rejection case for old (BigInt-bearing) shape.
4. `packages/engine/test/determinism/spec-140-replay-identity.test.ts` — modify. Add explicit noLegalMoves assertion.
5. `packages/engine/test/unit/json-stringify-state-enforcement.test.ts` — new. Architectural invariant. Pragmatic grep-based enforcement of Invariant 2.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine test:integration:slow-parity`
4. `pnpm turbo lint typecheck`
