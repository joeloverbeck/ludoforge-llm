# ARCHTRACE-004: Normalize Trace Semantics + Add Trace Contract Tests

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — semantics and contract tests
**Deps**: ARCHTRACE-002, ARCHTRACE-003

## What Needs To Change / Be Implemented

Define and enforce a single trace-semantics policy, then codify it with contract tests.

Current inconsistency:
- Some effects emit trace even when resulting value is unchanged; others do not.

Required implementation:
1. Pick one global rule for no-op traces (recommended: emit only when state changes).
2. Apply that rule consistently across effect handlers (`setVar`, `addVar`, `commitResource`, etc.).
3. Document trace semantics in kernel docs/spec notes.
4. Add a dedicated trace contract test suite validating:
- no-op handling
- ordering guarantees
- provenance presence
- transfer/varChange coherence

## Invariants That Should Pass

1. Trace emission policy for no-op effects is consistent across effect types.
2. Trace ordering is deterministic for identical seed + move stream.
3. Trace entries remain game-agnostic and usable across arbitrary GameSpecDoc games.
4. Contract tests fail if a future effect handler violates trace semantics.

## Tests That Should Pass

1. Unit contract test: no-op `setVar` and no-op `addVar` obey same emission policy.
2. Unit contract test: no-op `commitResource` obeys defined policy.
3. Unit contract test: trace ordering deterministic under replay.
4. Unit contract test: provenance + resourceTransfer/varChange consistency checks pass.
5. Regression: full `npm test` and targeted e2e suites pass.
