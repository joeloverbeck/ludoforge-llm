# CMPSACON-002: Train+Transport postState probe materializes a non-incrementing compound

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `agents/plan-role-constraint-eval.ts` (postState probe), possibly `kernel/legal-choices.ts` (SA chaining)
**Deps**: `archive/tickets/CMPSACON-001.md`, `packages/engine/test/integration/fitl-arvn-transport-constraint-migration.test.ts`, `packages/engine/src/agents/plan-role-constraint-eval.ts`

## Problem

In the `fitl-rules` lane, `fitl-arvn-transport-constraint-migration.test.ts` → "probes a production Train+Transport preserving candidate through generic compound postState materialization" fails with `0 !== 1`: after `probeRoleBoundPostState` materializes and applies the Train+Transport compound, `globalVars.transportCount` is `0`, but the test expects `base + 1` (the Transport special activity should have executed once).

The first assertion (`postState.kind === 'ready'`) passes, so a move *is* materialized and applied — but it does not perform the Transport. Instrumentation of `resolveDecisionContinuation` during this probe showed the chained SA decisions resolving against pipeline 20 with a `$governMode@ba-xuyen:none` chooseOne, i.e. the probe appears to materialize a **different special activity (Govern) than the Transport** the test set up role bindings for (`transportOrigin=an-loc`, `transportDestination=binh-dinh`), or the probe's `choose` callback (`materializePostStateProbeMove`) fails to match the Transport role steps and falls through to `pickDeterministicChoiceValue`.

## Assumption Reassessment (2026-06-04)

1. **The probe drives the real `resolveDecisionContinuation` → `applyMove` path.** Confirmed: `probeRoleBoundPostState` (`plan-role-constraint-eval.ts:202`) calls `resolveDecisionContinuation(... materializeCompoundRootMove(context) ..., { choose })` then `applyMove`. So the failure exercises production continuation machinery, not a test-only shim.
2. **This may be a symptom of CMPSACON-001 rather than a distinct defect.** The same PR's compound op+SA chaining changes (`maybeChainCompoundSA` post-main `compoundDiscoveryState`, the binding-prefix round-trip) could cause the wrong SA / wrong stage to be chained. **Re-verify this test after CMPSACON-001 lands before doing independent work here.**
3. **`@test-class` marker check.** The test summary reported `architectural-invariant: 4 pass, 2 fail` for this file. Per `.claude/rules/testing.md`, an architectural-invariant failure is fixed in the kernel/probe, never by softening the assertion.

## Architecture Check

1. The postState probe is the agent-side constructibility check for role-bound compound candidates; it must materialize the *same* compound the production legal-move enumeration would (Foundation 18 — one legality/constructibility property). A probe that silently materializes a different SA than intended is a Foundation 18 / Foundation 15 gap.
2. No FITL-specific branching in the agnostic probe; the step-matching (`requestMatchesStep`) must remain generic over plan-template roles.

## What to Change

### 1. Re-verify post-CMPSACON-001

Run the test after CMPSACON-001 lands. If it passes, close this ticket as subsumed (record the CMPSACON-001 commit that fixed it).

### 2. If still failing — fix the probe step-matching / SA chaining

Determine whether `materializePostStateProbeMove`'s `choose` callback correctly matches the Transport role steps (`requestMatchesStep`) for the chained SA, or whether `maybeChainCompoundSA` chains the wrong special activity for the materialized root. Fix so the materialized compound executes the Transport SA and increments `transportCount`.

## Files to Touch

- `packages/engine/src/agents/plan-role-constraint-eval.ts` (modify — only if not subsumed by CMPSACON-001)
- `packages/engine/src/kernel/legal-choices.ts` (modify — only if SA chaining selects the wrong activity)

## Out of Scope

- The compound op+SA constructibility crash across the determinism/perf lanes — that is CMPSACON-001.

## Acceptance Criteria

### Tests That Must Pass

1. `fitl-arvn-transport-constraint-migration.test.ts` → "probes a production Train+Transport preserving candidate through generic compound postState materialization" — `transportCount` increments by exactly 1.
2. Existing suite: `pnpm -F @ludoforge/engine test:integration:fitl-rules`.

### Invariants

1. The postState probe materializes the same compound (operation + intended SA) that production legal-move enumeration publishes for the given role bindings (Foundation 18).
2. No FITL-specific identifiers introduced into the agnostic probe.

## Test Plan

### New/Modified Tests

1. Keep the existing probe assertion (do not soften); add a sub-assertion that the materialized move's `compound.specialActivity.actionId` is the Transport SA, not an unrelated activity, to lock the regression.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/integration/fitl-arvn-transport-constraint-migration.test.js`
2. `pnpm -F @ludoforge/engine test:integration:fitl-rules`
3. `pnpm turbo lint typecheck`

## Outcome

Completed: 2026-06-04

What changed:
- Fixed generic compound postState materialization so an existing root compound is preserved only when its special activity matches the plan template special tags.
- Resolved template special tags to the intended special action id using direct action-id matches first, then the compiled action tag index.
- Preserved game-agnostic matching; no FITL-specific action ids or branch logic were introduced.

Deviations from original plan:
- CMPSACON-001 did not fully subsume this ticket. The Train+Transport witness still required the materializer fix in `packages/engine/src/agents/plan-role-constraint-eval.ts`.

Verification:
- `pnpm -F @ludoforge/engine build`
- `node --test packages/engine/dist/test/integration/fitl-arvn-transport-constraint-migration.test.js`
- `pnpm -F @ludoforge/engine test:integration:fitl-rules` passed 80/80 files.
