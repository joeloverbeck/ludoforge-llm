# GAMEDEFGEN-022: Compiler/Runtime/Schema Contract Lockstep Enforcement

**Status**: ✅ COMPLETED  
**Priority**: MEDIUM  
**Effort**: Medium

## 0) Reassessed Assumptions (Current Codebase Reality)

1. Runtime error context contracts and legality-surface parity are already substantially covered by existing unit tests (`runtime-error-contracts`, `legality-surface-parity`, `legality-outcome`, and pipeline-viability policy suites).
2. GameDef envelope schema validation is already exercised via runtime Zod schema tests and JSON schema artifact tests.
3. The highest-risk remaining drift is trace trigger-entry parity across layers:
   - Type/runtime layer includes newer trigger entries (`operationFree`, simultaneous submission/commit traces).
   - Runtime schema and/or JSON artifact coverage is not fully lockstep-enforced for all emitted trigger-entry variants.
4. Therefore, this ticket should focus on closing that drift first, rather than re-implementing already-covered contract areas.

## 1) Updated Scope (What Needs To Change / Be Added)

1. Add explicit lockstep tests for `TriggerLogEntry` variants across:
   - Type/runtime-emitted payload shape
   - Runtime Zod schema acceptance
   - `schemas/Trace.schema.json` acceptance
2. Update schema sources/artifacts so every runtime-emitted `TriggerLogEntry.kind` is accepted without aliases/back-compat shims.
3. Keep enforcement game-agnostic and limited to shared kernel contracts (no game-specific logic).
4. Document in this ticket outcome that contract changes must update all three layers in the same change set.

## 2) Invariants That Should Pass

1. Runtime-emitted trigger entries cannot be rejected by runtime validation or serialized JSON schema.
2. Contract change intent is explicit: unsynchronized edits fail deterministically in unit tests.
3. Payload keys/types for trace contracts remain stable for simulator, agents, and downstream tooling.
4. Lockstep policy remains engine-generic and independent of any single GameSpecDoc.

## 3) Tests That Should Pass

1. Unit: lockstep tests assert parity for trigger-entry contract kinds across runtime schemas and JSON schema artifacts.
2. Unit: negative/mismatch assertions fail with deterministic diagnostics when contract layers drift.
3. Regression: existing schema/runtime/legality suites continue to pass.
4. Regression: `npm test` and lint pass after lockstep updates.

## Outcome

- **Completion date**: 2026-02-15
- **What was actually changed**:
  - Added missing runtime schema contract for `operationFree` trigger entries (`OperationFreeTraceEntrySchema`).
  - Extended runtime trigger-log schema union to include `operationFree`.
  - Updated `schemas/Trace.schema.json` to include missing trigger-entry definitions and union members for:
    - `simultaneousSubmission`
    - `simultaneousCommit`
    - `operationFree`
  - Added/updated lockstep-focused tests to assert runtime schema + JSON schema acceptance for all runtime `TriggerLogEntry` variants and deterministic rejection of unknown kinds.
- **Deviations from original plan**:
  - Scope was narrowed based on reassessment: runtime error context contracts and legality-surface parity were already covered, so implementation targeted the highest-risk remaining drift (trace trigger-entry parity) instead of duplicating existing coverage.
- **Verification results**:
  - Targeted verification:
    - `npm run build && node --test dist/test/unit/schemas-top-level.test.js dist/test/unit/json-schema.test.js` passed.
  - Full required verification:
    - `npm test` passed.
    - `npm run lint` passed.
