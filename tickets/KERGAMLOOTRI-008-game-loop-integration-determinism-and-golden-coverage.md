# KERGAMLOOTRI-008 - Game Loop Integration, Determinism, and Golden Coverage

**Status**: ⏳ TODO
**Spec**: `specs/06-kernel-game-loop-triggers.md`
**Depends on**: `KERGAMLOOTRI-002`, `KERGAMLOOTRI-003`, `KERGAMLOOTRI-004`, `KERGAMLOOTRI-005`, `KERGAMLOOTRI-006`, `KERGAMLOOTRI-007`

## Goal
Add cross-module verification that the full Spec 06 loop behaves correctly over multi-turn execution and remains deterministic under repeated runs.

## Scope
- Add integration tests covering:
  - multi-turn gameplay progression
  - triggered win path
  - trigger cascade handling
  - no-legal-move progression
- Add determinism tests for:
  - identical seed + identical move sequence => identical state hash sequence
  - identical seed + PRNG-indexed move selection => identical trace/hash sequence
- Add golden fixtures/tests for known initial legal moves and known final hash after fixed move sequence.

## File List Expected To Touch
- `test/integration/game-loop.test.ts` (new)
- `test/integration/determinism-game-loop.test.ts` (new)
- `test/unit/game-loop.golden.test.ts` (new)
- `test/fixtures/gamedef/` (fixture additions only if required)
- `test/fixtures/trace/` (fixture additions only if required)

## Out Of Scope
- New kernel runtime features beyond Spec 06 behavior.
- Broad test harness refactors.
- Performance benchmarking or stress tooling outside deterministic correctness tests.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/integration/game-loop.test.ts`
  - 10-turn scripted scenario reaches expected states at checkpoints.
  - terminal result is correct when scripted end condition is met.
  - cascade scenario enforces depth behavior and expected trigger logs.
- `test/integration/determinism-game-loop.test.ts`
  - duplicate-run hash sequences are identical.
  - duplicate-run trigger logs are identical (including truncation entries).
- `test/unit/game-loop.golden.test.ts`
  - seed `42` initial legal move list snapshot matches expected canonical ordering.
  - seed `42` + fixed move script final hash matches expected value.
- Full baseline remains green:
  - `npm test`

## Invariants That Must Remain True
- Same seed + same move sequence always yields identical state hash trajectory.
- Test fixtures encode deterministic order-sensitive expectations (no nondeterministic assertions).
- Integration tests do not mutate shared fixtures at runtime.
