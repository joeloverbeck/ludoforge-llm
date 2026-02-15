# TEXHOLKERPRIGAMTOU-013: Deterministic Reduce and Bounded Repeat Primitives

**Status**: TODO
**Priority**: HIGH
**Effort**: XL
**Dependencies**: TEXHOLKERPRIGAMTOU-012
**Blocks**: TEXHOLKERPRIGAMTOU-014

## 1) What needs to be fixed/added

Add canonical game-agnostic reduction and bounded repetition primitives to express layered algorithms (for example side-pot decomposition) in YAML without brittle unrolling.

Scope:
- Add a deterministic `reduce` effect primitive for accumulator-driven processing.
- Add bounded repeat primitive (for example `repeatUntil` with required max-iteration guard).
- Wire compiler lowering, runtime application, legality traversal, validation, and schemas.
- Provide structured runtime errors for non-termination attempts or invalid reducer shapes.

Constraints:
- No aliasing (`reduce` and loop primitive each have one canonical syntax).
- No unbounded loops in runtime.
- Deterministic iteration order and tie-resolution semantics must be explicit.

## 2) Invariants that should pass

1. Reducer accumulator updates are deterministic and side-effect ordering is stable.
2. Repeat primitive cannot run unbounded; explicit cap is mandatory and enforced.
3. Runtime failures for exhausted bounds or invalid accumulator shapes are structured.
4. Primitives are reusable for any game algorithm needing fold/repeat.
5. Existing execution-budget controls remain compatible.

## 3) Tests that should pass

1. Unit: reduce accumulator correctness across numeric and structured states.
2. Unit: deterministic ordering invariants for reduce over identical inputs.
3. Unit: repeatUntil stops on condition and on max-iteration guard with reason code.
4. Unit: legality/move-discovery traversal compatibility with new primitives.
5. Integration: fixture implementing a layered payout-like algorithm using reduce+repeat.
6. Regression: `npm run build`, `npm test`, `npm run lint`.
