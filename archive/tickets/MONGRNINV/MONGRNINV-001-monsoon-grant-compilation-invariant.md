# MONGRNINV-001: Compilation invariant — Monsoon-restricted grants require allowDuringMonsoon

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — compiler cross-validation + tests
**Deps**: None

## Problem

Event card free-operation grants that reference Monsoon-restricted actions (`sweep`, `march`, `airStrike`, `airLift`) can silently break during Monsoon if they lack `allowDuringMonsoon: true`. The Monsoon window filter in `applyTurnFlowWindowFilters` removes such moves post-enumeration, causing `legalMoves` to return 0 and `expireUnfulfillableRequiredFreeOperationGrants` to expire the grant. This was the root cause of 4 CI failures on the `map-editor-improvements` branch (card-62 Cambodian Civil War, card-44 Ia Drang).

Per FITL rule 5.1.1, Events override Monsoon restrictions. Any event-granted operation that targets a Monsoon-restricted action MUST include `allowDuringMonsoon: true` so the Monsoon window filter does not block it.

Currently, the compiler cross-validation path validates event-grant references (seat/action/window) but does not validate this Monsoon-specific contract. There are runtime and FITL card-specific tests that expose the behavior, but the invariant is still enforced too late. That allows malformed content to compile successfully and fail only when a Monsoon runtime scenario happens to exercise it.

## Reassessed Assumptions

- The original ticket assumed the right fix was a new FITL integration test over the compiled production spec. That is insufficient as the primary safeguard.
- The codebase already has a dedicated compiler cross-validation layer in `packages/engine/src/cnl/cross-validate.ts` that owns structural event-grant invariants. This Monsoon contract belongs there.
- Existing tests already cover the runtime side of the behavior:
  - kernel-level Monsoon filtering honors `allowDuringMonsoon`
  - FITL card tests for card-44 and card-62 exercise real Monsoon event flows
  - several FITL integration suites already assert specific grants carry `allowDuringMonsoon: true`
- Because `allowDuringMonsoon` is part of the shared free-operation grant contract, the clean architecture is to reject malformed content during compilation rather than add another FITL-only regression test and leave the compiler permissive.

## Foundation Alignment

- **Foundation 11 (Testing as Proof)**: "Architectural properties MUST be proven through automated tests, not assumed." The relationship between Monsoon-restricted actions and `allowDuringMonsoon` on event grants is a structural invariant that can be verified at compile time without game simulation.
- **Foundation 1 (Engine Agnosticism)**: The test operates on compiled GameDef JSON, not game-specific runtime logic. The Monsoon restriction list comes from the GameDef's `turnOrder.config.turnFlow.monsoon.restrictedActions`, not from hardcoded FITL knowledge.
- **Foundation 10 (Architectural Completeness)**: The root cause is permissive compilation, not missing regression coverage. The fix must reject invalid authored content at the compiler boundary.
- **Foundation 9 (No Backwards Compatibility)**: Invalid grants should become compile errors. If authored content breaks, the content must be fixed rather than tolerated.

## What to Change

### 1. Add compiler cross-validation for Monsoon-restricted event grants

Extend `packages/engine/src/cnl/cross-validate.ts` so event-card `freeOperationGrants` are validated against the declared Monsoon restriction set:

1. Read the restricted action ids from `sections.turnOrder.config.turnFlow.monsoon.restrictedActions`
2. While validating event-card side and branch grants, detect any grant whose `actionIds` intersects that restricted-action set
3. Emit a compiler cross-validation diagnostic unless `allowDuringMonsoon === true`
4. Cover all offending grants independently so authors get exact card/side/branch/grant paths

Diagnostic requirements:

- Severity: `error`
- Surface: compiler cross-validation diagnostic
- Path: the exact `freeOperationGrants[n].allowDuringMonsoon` field path
- Message should identify the event card and explain that grants for Monsoon-restricted actions must set `allowDuringMonsoon: true`

This must stay data-driven: no hardcoded FITL action ids in compiler code or tests.

### 2. Add unit coverage for the cross-validator

Add focused tests in `packages/engine/test/unit/cross-validate.test.ts` that:

1. Build a minimal compilable card-driven doc with Monsoon restrictions
2. Assert a restricted-action event grant without `allowDuringMonsoon` emits the new diagnostic on the exact field path
3. Assert the same grant passes when `allowDuringMonsoon: true`
4. Cover both side-level and branch-level grants if a single test setup can do so without duplication; otherwise prefer the smallest clear coverage set

### 3. Add a FITL production regression test

Add a production-spec regression test in `packages/engine/test/integration/` that compiles the FITL production spec successfully under the new invariant. This is a corpus-level guard, not the primary enforcement mechanism.

The regression test may either:

- assert that `compileProductionSpec()` continues to succeed with no diagnostics from the new rule, or
- explicitly walk compiled FITL event grants and assert zero violations

Prefer the lighter approach that avoids duplicating compiler logic.

## Files to Touch

- `packages/engine/src/cnl/cross-validate.ts`
- `packages/engine/src/cnl/cross-validate-diagnostic-codes.ts`
- `packages/engine/test/unit/cross-validate.test.ts`
- `packages/engine/test/integration/` production regression test file (new or existing, whichever is the smallest clean change)

## Out of Scope

- Changes to `applyTurnFlowWindowFilters` or `expireUnfulfillableRequiredFreeOperationGrants`
- Broad refactors of FITL event authoring beyond fixing any newly surfaced invalid grants
- Non-event sources of free-operation grants unless the same invariant is later elevated into a broader shared rule by a separate ticket

## Verification

- Targeted unit and integration tests covering the new cross-validation rule pass
- FITL production compilation passes with zero errors under the new rule
- Removing `allowDuringMonsoon: true` from any FITL event grant for a restricted action causes compilation to fail with a clear diagnostic identifying the card and grant path

## Outcome

- Completion date: 2026-03-27
- Actual changes:
  - added compiler cross-validation that rejects event free-operation grants targeting Monsoon-restricted actions unless `allowDuringMonsoon: true`
  - added focused unit coverage for the new cross-validation diagnostic
  - added an explicit FITL production regression covering the invariant
  - corrected the FITL production event data for the authored grants that were still missing `allowDuringMonsoon: true`
- Deviations from original plan:
  - the original ticket proposed a FITL-only invariant test as the primary fix
  - the implemented architecture moved ownership to compiler cross-validation, with the FITL regression retained as corpus proof rather than sole enforcement
- Verification results:
  - `node packages/engine/dist/test/unit/cross-validate.test.js`
  - `node packages/engine/dist/test/integration/cross-validate-production.test.js`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
  - `pnpm turbo test`
