# ENG-204: Re-encode Ia Drang on Strict Grant Contracts

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Completed generic turn-flow viability, authorization, preflight, and outcome-policy refinements required to support the strict production data migration cleanly
**Deps**: archive/tickets/FITLEVENTARCH/ENG-201-free-op-grant-viability-gating.md, archive/tickets/ENG/ENG-202-free-op-sequence-bound-space-context.md, archive/tickets/ENG-203-mandatory-grant-and-action-outcome-contracts.md, archive/tickets/ENG-223-resume-card-flow-after-required-grant-resolution.md, archive/tickets/ENG-224-strengthen-required-outcome-enforcement-for-overlapping-grants.md, data/games/fire-in-the-lake/41-content-event-decks.md

## Problem

`card-44 Ia Drang` already uses ordered grants plus sequence-bound space context for “there”, but the production encoding still stops short of the stricter generic grant contracts now available. The remaining discrepancy is that the card still permits no-op grant consumption and the integration suite still tolerates relaxed end-of-chain completion.

## Assumption Reassessment (2026-03-09)

1. Current production card-44 encoding already uses canonical `sequence` plus `sequenceContext` contracts to bind Sweep and Assault to the Air Lift-selected space. The ticket must not treat “there” binding as missing engine work.
2. Current production tests already cover sequence locking, Monsoon allowance, and cross-space denial for Ia Drang. The stale gap is narrower: one integration path still allows an empty Air Lift resolution and still accepts a non-empty residual pending-grant state.
3. Current production card-44 grants do not yet opt into the stricter generic contract fields added by ENG-201/203/223/224:
   - `viabilityPolicy` for event-play suppression when the mandatory opening step is unusable
   - `completionPolicy` plus `postResolutionTurnFlow` for required grant completion
   - `outcomePolicy` for rejecting no-op free-operation consumption
4. Mismatch: the ticket’s original framing overstates missing architecture in the engine. Correction: keep scope to declarative Ia Drang data plus tests, and encode the card on the final shared grant-contract surface rather than adding any runtime workaround.
5. Follow-up verification exposed two remaining generic runtime gaps that block the strict data-only migration:
   - current `requireUsableForEventPlay` probing can treat a grant as usable before it has found a fully legal completed move
   - current required-grant window filtering can run final zone-filter authorization against partial legal-move templates and throw on unresolved bindings
6. Correction: this ticket needs a small shared-engine fix in addition to the production data/test migration. The fix remains game-agnostic and belongs in the generic turn-flow/free-operation layer.

## Architecture Check

1. Card data should express all game-specific behavior via `GameSpecDoc` only; no runtime card-id conditionals.
2. Opting Ia Drang into the shared `viabilityPolicy` / `completionPolicy` / `outcomePolicy` contracts is architecturally better than preserving permissive tests, because the semantics stay in the generic turn-flow layer and the card data becomes the sole policy owner.
3. No backwards-compatibility layer: tighten production data and tests to the final semantics.
4. Broader note: `card-23 Operation Attleboro` still uses a similar ordered-grant pattern without the stricter required/outcome contracts. That looks like the same architectural smell, but it is out of scope for this ticket unless Ia Drang changes reveal a shared production-data bug.
5. The shared-engine repair should stay narrow:
   - viability probing should require at least one fully legal completed move for strict grant usability
   - required-grant legality gating should use discovery-safe matching for partial move templates, while final move validation continues to use exact authorization

## What to Change

### 1. Re-encode card-44 unshaded grants

Keep the existing ordered/sequence-context structure, but add the strict generic grant contracts so the production encoding expresses:
- US must execute Air Lift, then Sweep, then Assault
- the chain resumes normal card flow only after each required step resolves
- the opening Air Lift step may not be consumed as a no-op
- event play is suppressed when the opening Air Lift step is not actually usable
- Sweep can occur during Monsoon
- Sweep and Assault remain constrained to the same space context (“there”)
- ARVN follow-up remains cost 0 via existing free-op behavior

### 2. Repair generic strict-grant probing/gating

Update the shared free-operation runtime so:
- `requireUsableForEventPlay` and `requireUsableAtIssue` only treat a grant as usable when at least one fully legal completion exists in the current state
- required-grant window filtering remains safe during legal-move discovery for partial templates and does not throw unresolved-binding zone-filter errors

### 3. Tighten Ia Drang tests

Replace workaround assertions with strict expected outcomes for:
- no-op Air Lift rejection / event suppression under the production encoding
- full chain completion with no residual pending grants
- preserved same-space sequence-context enforcement

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)
- `packages/engine/src/kernel/free-operation-viability.ts` (modify)
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modify if shared discovery-safe matching helper belongs there)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/test/integration/fitl-events-1965-nva.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-ia-drang.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify if generic viability behavior needs explicit regression coverage)

## Out of Scope

- New engine contract design work (completed in dependency tickets).
- Re-architecting other FITL chained-grant cards unless Ia Drang exposes a shared production-data defect that must be fixed for correctness.

## Acceptance Criteria

### Tests That Must Pass

1. Ia Drang unshaded is legal only when mandatory chain can be satisfied under new policies.
2. Ia Drang unshaded is absent when the only possible Air Lift resolution would be a no-op.
3. A no-op free Air Lift under Ia Drang is rejected by the production outcome-policy contract and does not consume the grant.
4. Free Sweep and free Assault are legal only in the Air Lift context space.
5. Ia Drang chain leaves no pending required grants after successful completion.
6. Shared free-operation viability probing no longer treats partial or non-legal completions as “usable” for strict grant-playability policies.
7. Required pending-grant legality filtering does not throw unresolved-binding zone-filter runtime errors while enumerating partial free-operation templates.

### Invariants

1. Card-44 behavior is fully data-driven from `GameSpecDoc`.
2. No Ia Drang-specific branch logic in engine/runtime code.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-ia-drang.test.ts` — strict playbook semantics (no workaround expectations).
2. `packages/engine/test/integration/fitl-events-1965-nva.test.ts` — assert card-44 opts into the strict grant-contract fields.
3. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — explicit regression for strict-viability probing on generic synthetic grants.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-ia-drang.test.js packages/engine/dist/test/integration/fitl-events-1965-nva.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`

## Outcome

Completion date: 2026-03-09

What actually changed:
- Re-encoded FITL `card-44 Ia Drang` on the strict shared grant-contract surface in `GameSpecDoc`, including required grant completion, strict viability gating, sequence-bound space capture, and explicit probe bindings for the opening Air Lift.
- Added the generic `moveZoneProbeBindings` contract across compiler, runtime, schemas, validation, and tests so GameSpecDoc can declare probe-time movement binding families without pushing game-specific logic into `GameDef` or simulation.
- Reworked strict free-operation viability probing so it searches for fully legal completed moves, uses discovery-safe probe-time zone exploration, and stays layered on discovery contracts instead of execution-only authorization helpers.
- Fixed generic free-operation execution/preflight handling so granted free operations bypass normal phase gating through the shared preflight overlay.
- Tightened outcome-policy enforcement to compare material gameplay state rather than telemetry-only `*Count` globals, preventing no-op Air Lift resolutions from satisfying `mustChangeGameplayState`.

Deviations from original plan:
- The ticket did not remain data-only. Clean architecture required a broader shared-engine refinement than originally assumed: probe-time binding scope, probe/discovery layering, generic free-operation phase handling, and material-state outcome comparison all had to be corrected before the Ia Drang data could stay declarative.
- The direct Ia Drang integration no-op assertion was replaced by stronger boundary coverage split across production playability suppression and generic outcome-policy enforcement tests, because the partial Air Lift decision sequence made a single inline assertion less robust than the combined coverage.

Verification results:
- `pnpm -F @ludoforge/engine lint`
- `pnpm -F @ludoforge/engine run schema:artifacts`
- `pnpm -F @ludoforge/engine test`
- Focused regressions also passed after final fixes:
  - `node packages/engine/dist/test/integration/fitl-events-ia-drang.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-events-1965-nva.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
