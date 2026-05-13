# 170PARTVISOBS-003: WASM opcode parity for `topNVisible` and `partial.lowerBound`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine-wasm/policy-vm/src/lib.rs` (schedule-distance opcode handler), `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` (fixture extension), associated WASM build artifacts
**Deps**: `tickets/170PARTVISOBS-002.md`

## Problem

Foundation #5 (One Rules Protocol) mandates that the simulator, web runner, and AI agents use the same legality and resolution logic. The TypeScript policy runtime gained the `topNVisible` branch and the `partial.lowerBound` resolution variant in ticket 002; the WASM policy VM must produce identical schedule-distance resolution rows for the same fixtures. Without this ticket, any deployment that exercises the WASM path (browser runner, future native bindings) diverges from the TS path on partial-visibility-bearing boundaries, breaking determinism guarantees and `policy-bytecode-equivalence.test.ts`. The Rust opcode handler must consume the observer-policy metadata encoded by the TS-side compiler, perform the same ordered-zone scan with `maxItems` cap, and emit `partial.lowerBound` results with bit-identical numerics and observer metadata.

## Assumption Reassessment (2026-05-13)

1. `packages/engine-wasm/policy-vm/src/lib.rs` is the WASM policy VM entry point hosting the schedule-distance opcode handler. The exact handler symbol name and the schedule-distance opcode number must be verified during implementation by greping the lib.rs file.
2. `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` exists (verified by find this session) and pairs with `policy-bytecode-equivalence-phase-schedule-fixtures.ts` — the fixture file the test consumes for spec 169 phase-schedule cases. The new topNVisible fixture should be added to that fixtures file.
3. The 15-seed baseline (`baseline seeds`) referenced in spec 170 §7 Phase 2 and §8.4 is the same seed pool used by `policy-bytecode-equivalence` for spec 169 — confirm the seed set by reading the test setup before extending the fixture.
4. WASM opcode I/O encoding for spec 169's schedule-distance refs uses an existing serialization shape for `PhaseScheduleResolution`. Extending it for the new `partial` kind requires both encoding (Rust → JS) and decoding (test harness) updates.
5. WASM rebuild pipeline (likely `pnpm -F @ludoforge/engine-wasm build` or equivalent) regenerates the wasm binary consumed by the engine tests; verify the exact command in `packages/engine-wasm/package.json` before running.

## Architecture Check

1. **One rules protocol (Foundation #5)**: This ticket exists precisely to preserve the foundation — the TS and WASM paths must be byte-identical for the same `(GameDef, GameState, seed)` triple. The bytecode-equivalence test is the enforcement mechanism; extending it covers the new resolution kind.
2. **Determinism (Foundation #8)**: The Rust opcode handler must produce the same `partial.lowerBound` numerics across all 15 baseline seeds and across repeated runs. Replay identity is guaranteed by the canonical encoding contract for the new variant.
3. **Bounded computation (Foundation #10)**: The Rust scan loop matches the TS-side O(maxItems) bound; `maxItems` is a compile-time constant in the encoded opcode input.
4. **Engine agnosticism (Foundation #1)**: The Rust path takes generic observer-policy metadata (kind enum + zone-id list + maxItems integer) — no game-specific logic.
5. **No backwards-compat shims (Foundation #14)**: The new opcode variant is gated on observer-policy presence in the encoded input; existing schedule-distance opcodes for boundaries without `observerPolicy` produce identical output to today's WASM path.

## What to Change

### 1. Rust opcode handler in `packages/engine-wasm/policy-vm/src/lib.rs`

Locate the existing schedule-distance opcode (spec 169's handler). Extend it to:

- Accept observer-policy metadata as part of the encoded input: a `kind` discriminator (currently only `topNVisible` valid), an ordered list of zone identifiers, and a `maxItems` integer.
- When observer policy is `topNVisible`, perform the ordered-zone scan with `maxItems` cap, mirroring the TS path's logic verbatim (per ticket 002's `What to Change` §1):
  - Read each listed zone's card list from the encoded GameState.
  - For each card, evaluate the encoded `cardSelector` predicate (same predicate semantics as spec 169).
  - On match, emit `ready` with `value = scanned`, observerPolicy metadata, `visiblePrefixLength = scanned + 1`.
  - On exhaustion, emit `partial.lowerBound` with `lowerBound = scanned`, observerPolicy metadata, `visiblePrefixLength = scanned`.
- When observer policy is absent, fall through to the existing spec-169 path with no behavioral change.

### 2. WASM result encoding

The result type for schedule-distance opcodes must include the new `partial` variant. Update the Rust-side enum and any serialization helpers (likely a `to_json` or equivalent path that the JS test harness consumes). The encoded `partial` shape mirrors §4.3 of spec 170:

```json
{
  "kind": "partial",
  "partialKind": "lowerBound",
  "lowerBound": <n>,
  "observerPolicy": { "kind": "topNVisible" },
  "visiblePrefixLength": <n>
}
```

### 3. Bytecode-equivalence test fixture extension

Extend `packages/engine/test/integration/policy-bytecode-equivalence-phase-schedule-fixtures.ts` (the fixture file paired with the equivalence test) with a new fixture exercising:

- A synthetic profile that uses `schedule.distance.toBoundary.<X>.cards` with `scheduleFallback: { onUnavailable: noContribution, onPartial: { visiblePrefixExhausted: useLowerBound } }`.
- A synthetic GameDef declaring `observerPolicy: { kind: topNVisible, visiblePrefix: { zones: [...], maxItems: 2 } }` on the test boundary.
- State variants that produce both `ready` and `partial.lowerBound` resolutions.

The new fixture follows the same shape as existing spec-169 fixtures in the file. Extend the test's seed-loop to assert equivalence across the existing 15-seed baseline.

### 4. WASM build pipeline

After Rust changes land, rebuild the WASM binary and confirm the JS test harness picks up the new opcode handler. Commit the rebuilt wasm artifact if the repo checks it in (verify by inspecting `packages/engine-wasm/dist/` or `pkg/`).

## Files to Touch

- `packages/engine-wasm/policy-vm/src/lib.rs` (modify) — extend schedule-distance opcode handler with `topNVisible` branch + `partial.lowerBound` result encoding.
- `packages/engine-wasm/policy-vm/src/` other Rust modules (modify if needed) — result enums, serialization helpers per implementation discovery.
- `packages/engine/test/integration/policy-bytecode-equivalence-phase-schedule-fixtures.ts` (modify) — add topNVisible + partial.lowerBound fixture.
- `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` (modify) — extend seed-loop to cover the new fixture.
- `packages/engine-wasm/dist/` or `pkg/` (regenerated) — WASM build artifacts, if checked in.

## Out of Scope

- TypeScript-side resolver, fallback evaluator, or trace surface changes — those landed in ticket 002.
- FITL data authoring — deferred to ticket 004.
- Compiler diagnostics — landed in ticket 001.
- Schedule kinds beyond `cardDraw`.
- WASM ABI changes unrelated to the schedule-distance opcode.

## Acceptance Criteria

### Tests That Must Pass

1. `policy-bytecode-equivalence.test.ts` with the new topNVisible fixture — WASM and TS paths produce byte-identical scoring rows across all 15 baseline seeds for both `ready` and `partial.lowerBound` resolutions.
2. Existing spec-169 bytecode-equivalence rows unchanged.
3. Existing suite: `pnpm turbo test` — no regressions.
4. WASM rebuild produces a deterministic binary (re-running the build produces an identical artifact).

### Invariants

1. **Bilateral equivalence**: for the same `(GameDef, GameState, seed, opcode input)` triple, the TS and WASM paths produce equal `PhaseScheduleResolution` structures including the `partial` variant's numerics and observer metadata.
2. **Backward compatibility for non-policy-bearing boundaries**: schedule-distance opcodes whose encoded input carries no observer-policy metadata produce identical output to the pre-spec-170 WASM path.
3. **Deterministic encoding**: the encoded result for a given resolution is canonical and byte-stable.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/policy-bytecode-equivalence-phase-schedule-fixtures.ts` (modify) — append a topNVisible + partial.lowerBound fixture variant per spec §8.4.
2. `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` (modify) — extend the seed-loop assertion set to include the new fixture.

Test class headers per `.claude/rules/testing.md`:
- The equivalence test is `architectural-invariant` (already declared on the existing file; no new file added — only fixture extension).

### Commands

1. `pnpm -F @ludoforge/engine-wasm build` (or repo-specific equivalent) — rebuild WASM after Rust changes.
2. `pnpm -F @ludoforge/engine test packages/engine/test/integration/policy-bytecode-equivalence.test.ts` — equivalence verification.
3. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`.
4. `pnpm turbo test` — full suite.
