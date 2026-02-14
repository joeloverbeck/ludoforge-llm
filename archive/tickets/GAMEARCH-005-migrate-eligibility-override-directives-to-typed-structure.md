# GAMEARCH-005: Migrate Eligibility Override Directives to Typed Structure

**Status**: ✅ COMPLETED
**Priority**: P2
**Complexity**: M
**Parent spec**: specs/29-fitl-event-card-encoding.md (engine/runtime alignment follow-up)
**Depends on**: GAMEARCH-004

## Description

Eligibility overrides still rely on string-encoded directive tokens in move params. This is inconsistent with schema-first architecture and retains hidden DSL aliasing.

### What Must Change

1. Replace string token parsing (`eligibilityOverride:*`) with typed declarative structures in `GameSpecDoc`/`GameDef` for event- or action-emitted eligibility windows.
2. Remove legacy token parsing path from runtime.
3. Extend schema/compiler/validator to support typed override declarations.
4. Update tests and fixtures to typed model only (no backwards compatibility).

## Reassessed Assumptions and Scope

- Runtime parsing of `eligibilityOverride:*` currently exists in `src/kernel/turn-flow-eligibility.ts` and is still active.
- There is no typed eligibility-override declaration in event card payloads today. The nearest architecture precedent is `freeOperationGrants` (typed, compiled, cross-validated, runtime-resolved from event side/branch context).
- The ticket currently under-scopes affected files: typed override migration also requires event-card model/schema/compilation/cross-validation updates, not only turn-flow files.
- Existing integration/unit tests still encode override behavior via directive strings in move params and helper constructors.
- Golden fixtures still contain directive tokens and must be updated with deterministic typed equivalents.

### Architectural Direction

- Preferred architecture is event-payload declared overrides (side/branch), resolved by generic runtime event context, with explicit typed references to configured eligibility windows.
- This is more robust than parsing move-param string DSL because it is schema-validated, cross-validated, discoverable, and composable with existing event-side constructs.
- No compatibility shim should remain: directive token parsing path is removed entirely.

## Files to Touch

- `src/kernel/types-events.ts`
- `src/kernel/types-turn-flow.ts`
- `src/kernel/turn-flow-eligibility.ts`
- `src/kernel/event-execution.ts`
- `src/kernel/schemas-extensions.ts`
- `src/cnl/game-spec-doc.ts`
- `src/cnl/compile-event-cards.ts`
- `src/cnl/validate-extensions.ts`
- `src/cnl/cross-validate.ts`
- `test/integration/fitl-events-test-helpers.test.ts`
- `test/integration/fitl-events-test-helpers.ts`
- `test/integration/fitl-eligibility-window.test.ts`
- `test/unit/apply-move.test.ts`
- `test/integration/fitl-turn-flow-golden.test.ts`
- related golden fixtures under `test/fixtures/trace/`

## Out of Scope

- Non-eligibility turn-flow mechanics.
- Monsoon/pivotal override-token migration (tracked separately).
- Broad JSON Schema artifact alignment (tracked separately; current artifact already drifts from event-card runtime shape).

## Acceptance Criteria

### Tests That Must Pass

1. Integration tests for eligibility windows use typed declarations only.
2. No test uses `eligibilityOverride:*` string directives.
3. Runtime behavior matches current semantics for equivalent typed data.
4. Cross-validation fails when typed override entries reference unknown factions or unknown override window ids.
5. `npm run build` passes.
6. `npm test` passes.
7. `npm run lint` passes.

### Invariants That Must Remain True

- Turn-flow control data is explicit and strongly typed.
- No hidden string DSL in runtime-critical paths.
- Game-specific behavior remains entirely in `GameSpecDoc` data.

## Outcome

- Completion date: 2026-02-14
- What was changed:
  - Added typed event-card eligibility override declarations (`eligibilityOverrides`) with explicit target union (`active` | `faction`) in shared kernel types and Zod schemas.
  - Added event-runtime resolver for typed eligibility overrides and removed `eligibilityOverride:*` string token parsing from turn-flow runtime.
  - Kept free-operation grant behavior unchanged while isolating eligibility override migration.
  - Added cross-validation diagnostics for typed eligibility overrides:
    - `CNL_XREF_EVENT_DECK_OVERRIDE_FACTION_MISSING`
    - `CNL_XREF_EVENT_DECK_OVERRIDE_WINDOW_MISSING`
  - Migrated integration/unit tests and golden fixtures to typed override declarations only.
- Deviations from original plan:
  - Did not include broad JSON Schema artifact refactoring; reassessment showed pre-existing schema drift is a separate concern and outside this ticket’s safe scope.
  - Runtime extraction point was implemented via event execution context (`event-execution.ts`) to match existing `freeOperationGrants` architecture instead of extending move-param parsing.
- Verification results:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
