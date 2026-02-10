# DETPRI-006 - Determinism Guardrails, State Round-Trip, and Integration Coverage

**Status**: Planned

## Goal
Add determinism enforcement utilities and end-to-end deterministic replay coverage combining seeded PRNG and Zobrist hashing behavior.

## Scope
- Add/complete determinism guardrail utilities and guidance for forbidden APIs.
- Add `assertStateRoundTrip(state)` helper for deterministic state serialization checks.
- Add integration test that repeats a seeded random-move sequence and asserts identical hash timeline.

## File List Expected To Touch
- `src/kernel/determinism.ts`
- `src/kernel/serde.ts`
- `src/kernel/index.ts`
- `test/integration/determinism-full.test.ts`
- `test/unit/determinism-state-roundtrip.test.ts`
- `README.md`

## Implementation Notes
- Guardrail utilities should document and centralize forbidden patterns (`Math.random`, time-based APIs, unsorted key iteration in hash-sensitive paths).
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
