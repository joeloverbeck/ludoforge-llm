# ENG-001: Unify Ready Pending Free-Operation Grant Move Seeding

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel` legal-move discovery around pending free-operation grants
**Deps**: `/home/joeloverbeck/projects/ludoforge-llm/tickets/README.md`, `/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/30-rules-actions.md`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves-turn-order.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/turn-flow-eligibility.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/free-operation-grant-authorization.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/apply-move.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`

## Problem

Ready pending free-operation grants are still discovered through two legal-move paths:

- direct grant-rooted seeding in `enumeratePendingFreeOperationMoves()`, currently limited to grants with `executionContext`
- late retrofit in `applyPendingFreeOperationVariants()`, which tries to turn ordinary templates into free-operation variants after normal action discovery

That split is no longer a whole-engine problem, but it is still a real legal-move architecture problem. It allows a ready required grant to exist in turn-flow runtime and pass grant analysis while still disappearing from `legalMoves()`.

This is currently surfacing as:

- `card-46` shaded (`559th Transport Grp`) entering a valid required free-`Infiltrate` window but producing no legal moves, causing a decision-point stall loop.
- continued fragility for any future required grant whose legal move depends on late retrofit instead of being seeded directly from the grant contract.

## Assumption Reassessment (2026-03-11)

1. The original ticket overstated the redesign scope. The current kernel already has shared free-operation grant analysis in `free-operation-discovery-analysis.ts`, `free-operation-grant-authorization.ts`, and `applyMove()`. This is not a blank-slate architecture.
2. The live discrepancy is concentrated in legal move discovery: direct grant-rooted seeding is still `executionContext`-only, while non-`executionContext` grants depend on `applyPendingFreeOperationVariants()` as a second pass.
3. `turnFlow.actionClassByActionId` remains the canonical source of intrinsic action class. The cited `card-62` mismatch path no longer reproduces in the current suite and should not drive this ticket's scope.
4. The reproduced live failure is `card-46` shaded. Applying the event with `advanceToDecisionPoint: false` yields a runtime state with a valid required pending free-operation grant and deferred payout effect, but `legalMoves()` still returns zero moves.

## Architecture Check

1. The more beneficial architecture, relative to the current code, is not a wholesale rewrite of authorization/validation. It is to make ready pending grants the primary legal-move seeding source regardless of `executionContext`.
2. That change is cleaner than the current architecture because it removes the `executionContext` asymmetry at the point where the bug actually occurs, while preserving the already-good shared grant-analysis code in validation and consumption.
3. This remains fully game-agnostic. The engine should seed ready grant-rooted moves generically from runtime grant data, without FITL-specific branches or aliases.
4. Backwards-compatibility shims are not desired. If direct grant seeding makes the retrofit path obsolete for the affected cases, the retrofit should be reduced or removed rather than preserved out of caution.

## What to Change

### 1. Make Ready Grant Seeding Canonical For Legal Move Discovery

Refactor `legalMoves()` so every ready pending free-operation grant can seed legal moves directly, regardless of whether the grant has `executionContext`.

The seeded move path must preserve:

- the authoritative `grantId`
- the intrinsic mapped action class for the target action
- execution player / seat override context
- free-operation overlay data (`executionContext`, `zoneFilter`, sequence context) when present
- required/completion semantics through filtering and later grant consumption

It is acceptable for `applyMove()` to continue using the existing shared grant-analysis modules, because that side of the architecture already converges on the canonical grant.

### 2. Remove The `executionContext` Asymmetry In Grant Enumeration

Specifically:

- stop treating `executionContext` grants as special in `enumeratePendingFreeOperationMoves()`
- ensure a required ready grant can produce at least one legal move without depending on late variant retrofit from a normal action template
- ensure a ready required grant can keep the active seat actionable even when normal `firstEligible` / `secondEligible` windows would otherwise be exhausted
- if `applyPendingFreeOperationVariants()` becomes redundant for the affected path, collapse or reduce it rather than keeping duplicate explanations alive

### 3. Preserve Current Validation Model Unless The Fix Proves Otherwise

Do not rewrite grant authorization or `applyMove()` unless the legal-move fix exposes a concrete parity failure. The current evidence says the break is in discovery, not in validation/consumption.

## Files to Touch

- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-559th-transport-grp.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)

## Out of Scope

- changing FITL card text or card data beyond what is required to conform to the redesigned generic engine model
- visual presentation, runner UI, or `visual-config.yaml`
- broad `applyMove()` refactors that are not justified by a reproduced failing test
- keeping duplicate discovery paths purely for compatibility once the narrower bug is fixed

## Acceptance Criteria

### Tests That Must Pass

1. Ready pending free-operation grants are surfaced as legal moves through direct grant-rooted seeding whether or not they carry `executionContext`.
2. `card-46` shaded no longer produces a legal-move vacuum or `advanceToDecisionPoint` stall after queuing the required free `Infiltrate`.
3. Existing `executionContext`-backed free-move behavior remains green.
4. Existing `card-62` Cambodian Civil War coverage remains green.
5. Existing suite: `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
6. Existing suite: `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-559th-transport-grp.test.js`
7. Existing suite: `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-cambodian-civil-war.test.js`
8. Workspace test/lint/typecheck commands still pass for the touched package(s)

### Invariants

1. Legal move discovery does not privilege `executionContext` grants over otherwise equivalent ready grants.
2. `GameDef` and kernel remain game-agnostic; no FITL-specific identifiers or branch logic are introduced in engine code.
3. `turnFlow.actionClassByActionId` remains the intrinsic source of action class; `grant.operationClass` stays compatibility metadata, not a substitute move class.

## Test Plan

### New/Modified Tests

1. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-559th-transport-grp.test.ts` — prove the shaded event yields a required free `Infiltrate` decision instead of a stall loop, and that deferred payouts still resolve after the grant is consumed.
2. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — cover direct ready-grant move seeding without `executionContext` so the regression is pinned at the generic engine layer.
3. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts` — verify required ready grants produce free moves through direct grant seeding even when a normal template path is unavailable or insufficient.

### Commands

1. `pnpm run check:ticket-deps`
2. `pnpm -F @ludoforge/engine build`
3. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-559th-transport-grp.test.js`
5. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-cambodian-civil-war.test.js`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm -F @ludoforge/engine lint`
8. `pnpm -F @ludoforge/engine typecheck`

## Outcome

- Completed: 2026-03-11
- What actually changed:
  - widened direct ready-grant seeding in `legal-moves.ts` so pipeline-backed pending free-operation grants without `executionContext` can surface as legal free moves before retrofit
  - preserved the existing shared grant-analysis and `applyMove()` authorization model instead of rewriting validation/consumption
  - added regression coverage for immediate non-`executionContext` grant surfacing, `card-46` shaded immediate `Infiltrate` availability, and direct special-activity grant seeding
  - strengthened parity coverage so denied free-operation probes compare the exact move identity instead of only `actionId`
  - repaired an existing sequence-lock test fixture in `packages/engine/test/unit/legal-moves.test.ts` so its earlier grant is truly inapplicable
- Deviations from original plan:
  - no `legal-moves-turn-order.ts` refactor was required; the bug was resolved in canonical ready-grant seeding inside `legal-moves.ts`
  - no `applyMove()` rewrite was justified after reassessment; the current shared grant-analysis architecture remained the better long-term design
  - the older `card-62` mismatch concern did not reproduce and therefore stayed out of scope
- Verification results:
  - `pnpm run check:ticket-deps`
  - `pnpm -F @ludoforge/engine build`
  - `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
  - `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-559th-transport-grp.test.js`
  - `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-cambodian-civil-war.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine typecheck`
