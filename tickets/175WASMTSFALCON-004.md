# 175WASMTSFALCON-004: Phase 3 — Parity oracle coverage for every unsupported reason

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — adds parity-oracle fixtures under `packages/engine/test/integration/`. No production source change.
**Deps**: `archive/tickets/175WASMTSFALCON-002.md`, `archive/tickets/175WASMTSFALCON-003.md`

## Problem

Spec 174's parity oracle (`policy-wasm-preview-drive-equivalence.test.ts` and siblings) was meant to catch the `278003969` bug class, but its test inputs did not exhaustively enumerate the unsupported preview-drive shapes that triggered the buggy throws. As a result, the asymmetric-throw bug shipped behind a green parity-oracle suite. The structural fix from Phase 1 (null-return contract) and Phase 2 (architecture test) close the producer side; this ticket closes the consumer side by ensuring every unsupported reason emitted by `getProductionPolicyWasmPreviewDriveUnsupportedReasonCounts` has a parity-oracle fixture proving WASM-on and WASM-off outputs are byte-equivalent for that shape.

Without this coverage, a future spec change that alters the TS fallback evaluator's behavior for an unsupported preview-drive shape would silently diverge from the WASM-on path's behavior — the converse failure mode to `278003969`.

## Assumption Reassessment (2026-05-17)

1. The latest 15-seed witness (`reports/fitl-arvn-15-seed-decomposition-2026-05-17-post-fix-wasm.md`) records 5 distinct unsupported reasons across the per-microturn-class rollup:
   - `unknown / production-deep-choosenstep-continuation.projectedState / deep preview-drive reached a terminal boundary before materializing a WASM projected state`
   - `unsupported-effect / production-preview-drive.cardEventAction / production preview-drive does not route card event action candidates`
   - `unsupported-effect / production-preview-drive.actionBatch / production preview-drive requires deterministic shared scalar runtime bindings`
   - `agent-guided-completion / production-preview-drive.chooseN / only origin-seat greedy chooseN publication is supported`
   - `unsupported-effect / production-preview-drive.effect.popInterruptPhase / unsupported production preview-drive effect popInterruptPhase`

   Spec §4 Phase 3 acceptance: every reason in this enumeration MUST have a parity-oracle fixture. Reassess the reason set at implementation start by re-running the witness on the post-Phase-1 source — if Phase 1's conversions added or removed a reason, the fixture set tracks the new enumeration.
2. The existing parity oracle harness lives in `packages/engine/test/integration/policy-wasm-preview-drive-equivalence.test.ts` and its `-fixtures.ts` companion. New fixtures extend that harness rather than introducing a parallel mechanism.
3. The harness pattern is to (a) construct a `GameState` known to hit a specific reason, (b) assert the WASM-side `materializePreviewDynamicRowsWithWasm` returns null (or the function's typed equivalent), (c) assert the local TS fallback at `policy-wasm-score-routing.ts:417` (or equivalent) runs and produces scores, (d) assert WASM-on vs WASM-off scores are byte-equivalent. Confirmed against current source. The "byte-equivalent" assertion uses the existing canonical-serialization comparison in the harness — no new oracle abstractions.
4. Acceptance criterion #6: every new test file carries a `@test-class` marker. Parity fixtures are `architectural-invariant` (the invariant: WASM-on equals WASM-off for every unsupported preview-drive shape).
5. The harness can be exercised against arbitrary `(GameDef, GameState, profile, seat)` tuples. Constructing inputs for each reason requires either a checked-in scenario fixture (preferred for stability) or a programmatic state setup helper (acceptable when the scenario data is small). FITL data assets and policy profiles are already loaded by sibling tests; reuse those.

## Architecture Check

1. **Coverage closes the consumer side**: Phases 1 and 2 ensure WASM-side branches return null uniformly. This ticket ensures every shape that triggers a null-return is exercised by a test that proves the TS fallback produces equivalent scores. The combination is what Spec 175's "test-proven for every unsupported preview-drive path" goal requires.
2. **No new oracle abstraction**: The fixtures extend the existing harness rather than introducing a parallel parity-test mechanism. Foundation 14 — no shim layer.
3. **Foundation 16 alignment**: "Architectural properties MUST be proven through automated tests, not assumed." The WASM↔TS parity for every unsupported shape is now a proof, not an assumption.
4. **Foundation 8 alignment**: The byte-equivalence assertion preserves Determinism Is Sacred — WASM-on and WASM-off paths produce bit-identical scoring decisions for every unsupported-drive shape, modulo only the (well-isolated) PolicyAgent-side telemetry counters.
5. **No production code coupling**: This ticket adds tests only. Production code is unchanged. The architecture test from Phase 2 ensures the producer side stays compliant; this ticket's fixtures ensure the consumer side stays equivalent.

## What to Change

### 1. Re-enumerate unsupported reasons against post-Phase-1 source

Run the 15-seed witness on post-Phase-1 source:

```
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs \
  --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-3-coverage-enumeration
```

Extract the full set of `(unsupportedDriveClass, unsupportedOwner, reason)` triples from the rollup's `WASM preview-drive unsupported reasons` column. This is the authoritative coverage target — use it instead of the pre-Phase-1 enumeration above if they differ.

### 2. Add per-reason parity fixtures

For each enumerated reason, add a fixture under `packages/engine/test/integration/`:

- File naming: `policy-wasm-preview-drive-equivalence-<owner-slug>.test.ts` where `<owner-slug>` is derived from the `unsupportedOwner` field (e.g., `cardEventAction`, `actionBatch`, `chooseN`, `popInterruptPhase`, `projectedState`). One file per owner slug; if a single owner emits multiple reasons (different `unsupportedDriveClass` values), each reason gets its own `describe` block in the same file.
- Each test in each file MUST:
  1. Construct or load a `GameState` that triggers the targeted reason (verified by asserting the post-evaluation counter `getProductionPolicyWasmPreviewDriveUnsupportedReasonCounts()` increments the matching key by exactly 1).
  2. Assert the WASM-side branch returns null (or typed equivalent).
  3. Assert the TS fallback evaluator runs (verifiable via the per-feature score assignment on each candidate).
  4. Assert WASM-on and WASM-off candidate scores are byte-equivalent — reuse the existing canonical-serialization comparison from `policy-wasm-preview-drive-equivalence.test.ts`.
- Each new file begins with `// @test-class: architectural-invariant`.
- If a reason cannot be exercised by an isolated fixture (e.g., requires deep mid-game state that only the 15-seed witness reaches), use a checkpointed `GameState` snapshot from a witness run and check it in under `packages/engine/test/integration/fixtures/175-parity/`. Document the snapshot's provenance (seed, decision index, witness date) in a sibling `.json.meta` file or a header comment.

### 3. Extend the equivalence-harness shared helpers (if needed)

If a fixture cannot be expressed using the existing harness primitives, extend the shared helpers in `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts` rather than duplicating setup. Reuse beats duplication.

### 4. Verify counter coverage assertion

Add one cross-cutting test (in a new file or appended to an existing parity test) that loads the post-Phase-1 reason enumeration as test data, iterates the parity-fixture file set, and asserts a 1:1 mapping: every reason in the enumeration has at least one fixture, and every fixture targets a reason in the enumeration. This prevents drift in either direction — the spec's acceptance criterion #5 (counters non-zero) plus #2 (every reason has a parity fixture) become a single mechanically-verified invariant.

### 5. Run the full engine suite and confirm 15-seed witness counters

Acceptance criterion #5 requires post-spec route/unsupported/batch counters remain non-zero. Re-run the witness post-fixture-addition:

```
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs \
  --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-3-post-coverage
```

Compare against the Phase 1 post-conversion baseline:
- WASM production preview-drive route count: same or higher.
- WASM production preview-drive unsupported count: same or lower (or stable).
- WASM production preview-drive batch count: same or higher.
- Per-reason unsupported counts: all non-zero (criterion #5).
- Slow-tier median wall ms: within ±10% of the Phase 4i baseline `11536.43 ms` (criterion #4).

## Files to Touch

- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-cardEventAction.test.ts` (new)
- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-actionBatch.test.ts` (new)
- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-chooseN.test.ts` (new)
- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-popInterruptPhase.test.ts` (new)
- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-projectedState.test.ts` (new)
- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-reason-coverage.test.ts` (new — cross-cutting 1:1 mapping assertion)
- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts` (modify — extend helpers if needed)
- `packages/engine/test/integration/fixtures/175-parity/` (new directory — checkpointed `GameState` snapshots if any reason requires deep mid-game state)
- `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-3-post-coverage.md` (new — witness verifying counters stay non-zero post-fixture-addition)
- `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-3-post-coverage.csv` (new — accompanying CSV)

Likely surface — final file naming and the exact fixture set are refined against the post-Phase-1 reason enumeration (step 1). If the enumeration drops a reason (e.g., Phase 1 conversion changes the upstream code path so `popInterruptPhase` no longer fires), drop the corresponding fixture file; if it adds one, add the corresponding fixture.

## Out of Scope

- Production source changes in `packages/engine/src/` (Phases 1 and 2 own those).
- Adding parity coverage for *supported* preview-drive shapes (those already work; the spec scope is unsupported-shape coverage).
- WASM coverage extension to currently-unsupported preview-drive classes (spec §8; tracked in spec 176).
- Performance optimization of the parity-fixture suite — slowness here is acceptable if it's a one-time integration-suite cost.
- Documentation header comments (Phase 4 / ticket 005).

## Acceptance Criteria

### Tests That Must Pass

1. Each new per-reason parity fixture passes: WASM-side returns null, TS fallback runs, WASM-on scores byte-equivalent to WASM-off scores.
2. The cross-cutting reason-coverage test passes: 1:1 mapping between post-Phase-1 reason enumeration and parity-fixture files.
3. Existing suite: `pnpm turbo test` and `pnpm -F @ludoforge/engine test:e2e` both pass.
4. Post-coverage 15-seed witness records all per-reason unsupported counts non-zero (criterion #5) and slow-tier median wall ms within ±10% of `11536.43 ms` (criterion #4).

### Invariants

1. Every reason emitted by `getProductionPolicyWasmPreviewDriveUnsupportedReasonCounts()` has at least one parity-oracle fixture proving WASM/TS byte-equivalence for that shape.
2. Every parity-fixture file carries `// @test-class: architectural-invariant`.
3. The reason-coverage cross-cutting test fails if a future change adds a new unsupported reason without a corresponding fixture, OR removes a reason whose fixture still exists — coverage tracks the enumeration in both directions.

## Test Plan

### New/Modified Tests

1. `policy-wasm-preview-drive-equivalence-cardEventAction.test.ts` — exercises the `cardEventAction` owner's reason; the same shape as the bug `278003969` repaired. `@test-class: architectural-invariant`.
2. `policy-wasm-preview-drive-equivalence-actionBatch.test.ts` — exercises the `actionBatch` owner's reason (deterministic shared scalar runtime bindings unsupported). `@test-class: architectural-invariant`.
3. `policy-wasm-preview-drive-equivalence-chooseN.test.ts` — exercises the `chooseN` owner's reason (only origin-seat greedy chooseN publication supported). `@test-class: architectural-invariant`.
4. `policy-wasm-preview-drive-equivalence-popInterruptPhase.test.ts` — exercises the `popInterruptPhase` owner's reason. `@test-class: architectural-invariant`.
5. `policy-wasm-preview-drive-equivalence-projectedState.test.ts` — exercises the `projectedState` owner's reason (deep preview-drive reached terminal boundary). `@test-class: architectural-invariant`.
6. `policy-wasm-preview-drive-equivalence-reason-coverage.test.ts` — cross-cutting 1:1 mapping assertion between enumeration and fixture files. `@test-class: architectural-invariant`.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test packages/engine/test/integration/policy-wasm-preview-drive-equivalence-*.test.ts` — targeted parity-fixture run.
2. `pnpm turbo test` — full gate.
3. `pnpm -F @ludoforge/engine test:e2e` — end-to-end coverage.
4. `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-3-post-coverage` — post-coverage witness for acceptance criteria #4 / #5.
5. `pnpm run check:ticket-deps` — dep integrity.
