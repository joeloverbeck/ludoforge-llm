# FITLSEC5RULGAP-001: FITL Data + Tests — Free Operations Override Momentum Legality

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — minimal generic legality-binding default in `legal-moves.ts`
**Deps**: None

## Problem

Rule 5.1.2 says currently played Event text takes precedence over conflicting prior Event effects (example: MACV free Air Lift vs Typhoon Kate).

Current behavior drops such free-operation variants because momentum checks are encoded in FITL action-pipeline `legality:` predicates that do not currently account for `__freeOperation`.

## Assumption Reassessment (2026-02-24)

1. `applyPendingFreeOperationVariants` does iterate base moves + pending-grant stubs — **confirmed**.
2. `isFreeOperationApplicableForMove` does **not** call action preflight; it only checks pending-grant applicability/sequence/action-class/zone filter compatibility — **corrected**.
3. Pipeline legality failure happens inside legal-choice discovery (`resolveMoveDecisionSequence` -> `legalChoicesDiscover` -> `resolveActionApplicabilityPreflight`) — **confirmed**.
4. `skipPipelineDispatch` exists, but using it for this bug is architecturally unsafe because it bypasses **pipeline stage semantics**, not only legality/cost checks — **corrected**.
5. FITL `30-rules-actions.md` contains non-momentum legality predicates as well (for example ARVN resource gating), so blanket pipeline-dispatch bypass is over-broad — **corrected**.
6. `__freeOperation` runtime binding is already available during discovery and apply surfaces, so legality overrides can be encoded data-first in action predicates — **confirmed**.

## Architecture Decision

The previously proposed kernel fallback is **not** better than current architecture:

1. It breaks layering by encoding a FITL-specific precedence rule in shared kernel behavior.
2. It risks semantic drift by skipping pipeline dispatch/stages.
3. It is less explicit than expressing the exception in FITL data where the contradiction actually lives.

Preferred architecture: keep engine generic and encode this precedence in FITL YAML legality predicates via `__freeOperation`.

## What to Change

### 1. Update FITL momentum legality predicates in `30-rules-actions.md`

For action profiles where momentum directly blocks operation/special-activity execution, change legality predicates to allow execution when `__freeOperation == true`. Required profiles:

1. `assault-us-profile` (`mom_generalLansdale`)
2. `air-lift-profile` (`mom_medevacShaded`, `mom_typhoonKate`)
3. `air-strike-profile` (`mom_rollingThunder`, `mom_daNang`, `mom_bombingPause`)
4. `transport-profile` (`mom_typhoonKate`)
5. `infiltrate-profile` (`mom_mcnamaraLine`)
6. `bombard-profile` (`mom_typhoonKate`)
7. `nva-ambush-profile` (`mom_claymores`)
8. `vc-ambush-profile` (`mom_claymores`)

Pattern:
- Paid/non-free action remains blocked by momentum.
- Free operation granted by event can pass legality.

### 2. Add tests for Rule 5.1.2 behavior

Add/extend integration tests so they assert:

1. Momentum still blocks non-free action.
2. Matching free operation grant exposes legal move anyway.
3. Granted free move applies successfully.
4. Existing zone-filter and actionIds grant constraints remain intact.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify or add focused cases)
- `packages/engine/test/integration/fitl-momentum-prohibitions.test.ts` (optional targeted negative assertion reuse)

## Out of Scope

- Any FITL-specific branching in `packages/engine/src/kernel/*`
- Compiler changes
- Altering `actionApplicabilityPreflight` or `skipPipelineDispatch` semantics
- Backwards-compatibility aliases/shims

## Acceptance Criteria

1. With blocking momentum active, non-free action remains illegal.
2. With same momentum active and a valid free-operation grant, legal move list includes `freeOperation: true` variant for granted action.
3. Applying that free move succeeds (no `ACTION_NOT_LEGAL_IN_CURRENT_STATE`).
4. Free-operation constraints (`operationClass`, `actionIds`, `zoneFilter`, sequencing) continue to hold.
5. `pnpm turbo build` passes.
6. `pnpm -F @ludoforge/engine test` passes.
7. `pnpm turbo typecheck` passes.

## Test Plan

### New/Modified Tests

1. Add integration test(s) covering momentum + free-op override (MACV/Typhoon-style behavior).
2. Extend existing free-operation grant integration coverage to include momentum-blocked profile cases.
3. Ensure explicit negative assertion for non-free move under same momentum condition.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-02-24
- **What changed vs plan**:
  - Implemented planned FITL legality predicate updates for momentum-blocked profiles.
  - Added integration coverage in `fitl-momentum-prohibitions.test.ts` for:
    - profile-level `__freeOperation` legality bypass presence
    - runtime Typhoon-blocked paid Air Lift vs granted free Air Lift.
  - Updated one existing assertion in `fitl-coin-operations.test.ts` to match the new legality shape.
  - Added one **minimal generic kernel fix** not originally planned: legal template preflight now includes reserved runtime bindings via `buildMoveRuntimeBindings({ actionId, params: {} })` so legality predicates that reference reserved bindings (like `__freeOperation`) evaluate safely during enumeration.
- **Deviations from original plan**:
  - Original revised scope said no engine changes; implementation required a small engine-default binding change to avoid missing-binding runtime errors during legal-move template preflight.
- **Verification results**:
  - `pnpm turbo build` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
