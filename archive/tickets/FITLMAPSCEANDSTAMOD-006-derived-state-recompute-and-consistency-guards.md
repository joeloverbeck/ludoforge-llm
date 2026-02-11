# FITLMAPSCEANDSTAMOD-006 - Derived-State Recompute and Consistency Guards

**Status**: ✅ COMPLETED
**Spec**: `specs/16-fitl-map-scenario-and-state-model.md`
**References**: `specs/22-fitl-foundation-implementation-order.md`
**Depends on**: `FITLMAPSCEANDSTAMOD-005`

## Goal
Close a generic canonical-vs-derived consistency gap: ensure zone ownership semantics used by derived zone-owner queries are validated against canonical zone declarations.

## Architecture Contract
- Canonical execution path: `GameSpecDoc` YAML -> parser/validator/compiler -> `GameDef` -> simulation.
- Derived-state logic must remain game-agnostic and reusable; no FITL-id keyed branching in kernel/compiler code.
- Validation must guard canonical definitions so runtime query derivations are deterministic and drift-free.

## Assumption Reassessment (Before Implementation)
- The originally listed FITL-specific recomputation targets ("control totals", "support/opposition aggregates") are not represented as kernel runtime fields in the current codebase.
- The originally listed fixture path `test/fixtures/spec/fitl-foundation-inline-assets.md` does not exist.
- Current derived owner filtering in `evalQuery({ query: 'zones', filter.owner })` depends on zone id qualifiers (for example `hand:1`) while canonical ownership is declared in `ZoneDef.owner`; this relation was not explicitly validated for zone declarations.
- Therefore, this ticket is corrected to implement and test the generic ownership consistency guard that protects existing derived query behavior.

## Scope
- Add `validateGameDef` guards that enforce zone id qualifier consistency with `ZoneDef.owner`.
- Require player-owned zones to use numeric owner qualifiers compatible with zone-owner query derivation.
- Require unowned zones to use the `:none` qualifier.
- Add unit tests for the new diagnostics and keep existing query behavior unchanged.

## File List Expected To Touch
- `src/kernel/validate-gamedef.ts`
- `test/unit/validate-gamedef.test.ts`

## Out Of Scope
- No victory check end-condition logic from Spec 19.
- No operation/event execution behavior.
- No trace/e2e campaign flow assertions.
- No new FITL-specific control/support-opposition runtime schema.
- No changes to public eval-query API shape.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/validate-gamedef.test.ts`
  - player-owned zone ids without numeric qualifiers are rejected with actionable diagnostics.
  - unowned zone ids without `:none` qualifiers are rejected with actionable diagnostics.
  - player-owned zone id qualifiers outside metadata player bounds are rejected.
- `npm run test:unit -- --coverage=false`

## Invariants That Must Remain True
- Canonical state is the single source of truth.
- Derived values are deterministic pure functions of canonical state.
- No FITL-specific derived-state code paths keyed off filesystem asset locations.

## Outcome
- **Completion date**: 2026-02-11
- **What changed**:
  - Reassessed and corrected ticket assumptions to match the current codebase (removed non-existent FITL control/support recomputation scope and stale fixture references).
  - Implemented generic `validateGameDef` ownership consistency diagnostics for zone id qualifiers vs declared zone owners and player bounds.
  - Added focused unit coverage for unowned qualifier mismatch, non-numeric player qualifiers, and out-of-bounds player qualifiers.
- **Deviation from original plan**:
  - Original plan targeted FITL-specific runtime recomputation paths and fixture files that are not present; delivered scope was narrowed to the concrete generic consistency guard gap currently in engine validation.
- **Verification**:
  - `npm run build`
  - `npm run test:unit -- --coverage=false` (all passing)
