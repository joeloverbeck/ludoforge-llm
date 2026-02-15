# GAMEDEFGEN-022: Compiler/Runtime/Schema Contract Lockstep Enforcement

**Status**: TODO  
**Priority**: MEDIUM  
**Effort**: Medium-Large

## 1) What Needs To Change / Be Added

1. Define explicit lockstep contract checks between TypeScript kernel/compiler types, runtime validation schemas, and serialized payload shapes.
2. Add deterministic tests that fail when a contract is changed in one layer but not synchronized in the others.
3. Focus first on high-risk shared contracts (runtime error context payloads, trace entry payloads, legality metadata payloads, and key GameDef-facing runtime envelopes).
4. Document synchronization policy so contract additions/changes always include updates across type + schema + tests.

## 2) Invariants That Should Pass

1. Shared contracts cannot silently drift across type definitions, schema validation, and emitted runtime payloads.
2. Contract change intent is explicit and reviewable through failing lockstep tests.
3. Deterministic payload keys/types remain stable for simulator, agents, and downstream tooling.
4. Lockstep policy remains game-agnostic and independent of any single GameSpecDoc content pack.

## 3) Tests That Should Pass

1. Unit: lockstep tests assert schema/type/runtime parity for selected high-risk contracts.
2. Unit: mismatch fixtures intentionally fail with deterministic diagnostics.
3. Integration: compile->simulate flows using validated contracts continue to pass.
4. Regression: existing schema/runtime/legality suites pass with lockstep enforcement added.

