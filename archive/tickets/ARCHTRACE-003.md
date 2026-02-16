# ARCHTRACE-003: Add Generic Resource Transfer Trace Primitive

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new game-agnostic trace primitive
**Deps**: ARCHTRACE-002 (satisfied; archived at `archive/tickets/ARCHTRACE-002.md`)

## Reassessed Assumptions (Code/Test Reality Check)

Validated against current `src/kernel`, `schemas/`, and `test/`:

1. `commitResource` currently emits only two `varChange` trace entries (source decrement + destination increment) and no first-class transfer entry.
2. Provenance metadata from ARCHTRACE-002 already exists and is emitted on those `varChange` entries, so this ticket should reuse that contract rather than redefine it.
3. No existing unit test directly validates `commitResource` trace shape/semantics; current coverage focuses on state outcomes and legal move constraints.
4. JSON schema artifacts (`Trace`, `EvalReport`) currently only accept the existing trace kinds and must be regenerated if a new trace primitive is added.

## Updated Scope

Introduce a first-class `resourceTransfer` trace entry so consumers can read transfer intent/outcome directly, without reconstructing from paired var deltas.

Required implementation:
1. Define a new `resourceTransfer` trace entry shape in shared runtime types + zod schema + generated JSON schema artifacts.
2. Emit `resourceTransfer` from `commitResource` execution when a transfer is actually applied (`actualAmount > 0` and source/destination are distinct cells).
3. Keep existing `varChange` entries alongside `resourceTransfer` as low-level mutation telemetry (not backward-compat aliasing):
- `resourceTransfer` = semantic operation-level event.
- `varChange` = per-variable mutation-level events.
4. Ensure `resourceTransfer` carries existing provenance metadata contract from ARCHTRACE-002.
5. Include clamp-relevant numeric context directly in `resourceTransfer` (`requestedAmount`, `actualAmount`, `sourceAvailable`, `destinationHeadroom`, plus optional resolved `min`/`max` when provided).

## Architectural Direction

Preferred long-term direction:
1. Keep engine generic: transfer endpoints must be generic variable references (`global`/`perPlayer` scopes, variable name, optional player id).
2. Keep semantics explicit: represent transfer intent/outcome as its own trace primitive instead of requiring downstream inference from two var deltas.
3. Keep layered telemetry: operation-level (`resourceTransfer`) and mutation-level (`varChange`) traces should coexist with deterministic ordering and shared provenance.

This is more beneficial than the current architecture because it removes brittle consumer-side inference while preserving low-level debuggability.

## Invariants That Should Pass

1. Every successful `commitResource` with `actualAmount > 0` emits exactly one `resourceTransfer` trace entry.
2. `resourceTransfer.actualAmount` equals net source decrease and destination increase for the same effect.
3. `resourceTransfer.actualAmount` is never negative.
4. No-op `commitResource` executions (`actualAmount == 0` or same source/destination cell) emit no `resourceTransfer` and no `varChange` entries.
5. Transfer tracing remains generic for any game/resource and contains provenance metadata.

## Tests That Should Pass

1. Unit test: `commitResource` emits one `resourceTransfer` with correct endpoints, amounts, and provenance.
2. Unit test: clamped transfers report expected `requestedAmount` vs `actualAmount` and clamp context fields.
3. Unit test: no-op transfers emit no `resourceTransfer` consistently.
4. Unit test: `resourceTransfer.actualAmount` equals paired `varChange` deltas for the same effect.
5. Schema sync test and regression suite pass.

## Outcome

- Completion date: 2026-02-16
- What was actually changed:
1. Added a new game-agnostic `resourceTransfer` effect trace entry contract in runtime types and zod schemas.
2. Emitted `resourceTransfer` from `commitResource` with generic endpoints, requested/actual amounts, clamp context, and provenance.
3. Kept existing paired `varChange` entries and deterministic ordering (`resourceTransfer` followed by source/destination var changes).
4. Added focused unit tests for transfer trace emission, clamp context, no-op behavior, and `resourceTransfer`/`varChange` delta coherence.
5. Regenerated `schemas/Trace.schema.json` and `schemas/EvalReport.schema.json`.
- Deviations from original plan:
1. None after reassessment; implementation matched the updated ticket scope.
- Verification results:
1. `npm run schema:artifacts:generate` passed.
2. `node --test dist/test/unit/resource-transfer-trace.test.js` passed.
3. `npm run lint` passed.
4. `npm test` passed.
