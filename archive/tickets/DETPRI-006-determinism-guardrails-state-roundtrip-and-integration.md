# DETPRI-006 - Determinism Guardrails, State Round-Trip, and Integration Coverage

**Status**: ✅ COMPLETED

## Goal
Close the remaining determinism gaps by adding state round-trip helper coverage and an end-to-end deterministic replay integration test combining seeded PRNG and Zobrist hashing behavior.

## Reassessed Assumptions (Current Codebase)
- `src/kernel/determinism.ts` already exports `assertDeterministic` and `assertRngRoundTrip`.
- `src/kernel/serde.ts` already provides `serializeGameState`/`deserializeGameState` and trace round-trip codecs.
- `src/kernel/index.ts` already re-exports determinism and serde APIs.
- Unit coverage already exists for PRNG determinism helpers and serde BigInt round-trips.
- Missing pieces for this ticket are:
  - `assertStateRoundTrip(state)` helper in determinism utilities.
  - Integration coverage that proves identical hash timelines for two seeded replay runs.

## Scope
- Add `assertStateRoundTrip(state)` helper for deterministic game-state serialization checks.
- Add unit coverage for `assertStateRoundTrip`.
- Add integration test that repeats a seeded random-move sequence and asserts identical hash timeline for 20 steps.

## File List Expected To Touch
- `src/kernel/determinism.ts`
- `test/unit/determinism-state-roundtrip.test.ts`
- `test/integration/determinism-full.test.ts`

## Implementation Notes
- Integration flow should use a fixed seed and deterministic move-selection path.
- Keep tests deterministic and non-flaky; avoid wall-clock assertions.

## Out Of Scope
- Refactoring unrelated kernel subsystems.
- Additional CLI surface changes.
- Introducing cryptographic RNG or floating-point random helpers.
- Large-scale benchmark harnesses.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/determinism-state-roundtrip.test.ts`:
  - serializing and deserializing representative game states preserves deterministic behavior inputs.
- `test/integration/determinism-full.test.ts`:
  - two runs with same seed and same move policy produce identical per-step hashes for 20 steps.
- Existing targeted suites remain passing:
  - `test/unit/prng-core.test.ts`
  - `test/unit/prng-nextint.test.ts`
  - `test/unit/prng-roundtrip-fork.test.ts`
  - `test/unit/zobrist-table.test.ts`
  - `test/unit/zobrist-hash-updates.test.ts`

### Invariants That Must Remain True
- Same seed + same move sequence => identical state hash trajectory.
- No forbidden nondeterministic APIs are used in deterministic primitives modules.
- State round-trip does not alter hash-relevant values.
- Determinism helpers remain pure and side-effect free.

## Outcome
- **Completed**: February 10, 2026
- **What changed**:
  - Added `assertStateRoundTrip(state)` to `src/kernel/determinism.ts`.
  - Added `test/unit/determinism-state-roundtrip.test.ts` for representative round-trip validation and serializer constraint propagation.
  - Added `test/integration/determinism-full.test.ts` with a 20-step seeded replay that asserts identical hash timelines across runs and verifies incremental token hash updates against full recomputation each step.
- **What changed vs original plan**:
  - Did not modify `src/kernel/serde.ts`, `src/kernel/index.ts`, or `README.md` because these assumptions were outdated; required functionality was already present/re-exported.
  - Scope was narrowed to missing helper and missing integration/unit coverage only.
- **Verification**:
  - `npm test` passes (unit + integration, including existing PRNG/Zobrist deterministic suites).
