# ENG-003: Remove Split Free-Operation Discovery Between Direct Seeding And Retrofit

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/kernel` free-operation legal-move discovery architecture
**Deps**: `/home/joeloverbeck/projects/ludoforge-llm/tickets/README.md`, `/home/joeloverbeck/projects/ludoforge-llm/archive/tickets/ENG-001-unify-ready-pending-free-operation-grant-move-seeding.md`, `/home/joeloverbeck/projects/ludoforge-llm/archive/tickets/ENG-002-make-direct-free-operation-grant-seeding-order-invariant.md`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves-turn-order.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/free-operation-discovery-analysis.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/free-operation-grant-authorization.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legality-surface-parity.test.ts`

## Problem

Free-operation legal move discovery still has two architectural paths:

- direct grant-rooted seeding in `legal-moves.ts`
- late retrofit / variant application in `legal-moves-turn-order.ts`

`ENG-001` narrowed the gap by teaching direct seeding to handle pipeline-backed ready grants without `executionContext`, but plain non-pipeline grants still rely on the retrofit path. The engine therefore still lacks one canonical explanation for why a free move exists.

That split keeps the architecture more fragile than necessary:

- discovery behavior depends on whether an action happens to be pipeline-backed
- the direct path and retrofit path still have separate dedupe and filtering logic
- future free-operation fixes will continue to risk parity drift between the two paths

## Assumption Reassessment (2026-03-11)

1. The current code is better than before but is not yet architecturally converged. Free-operation discovery remains bifurcated between direct seeding in `legal-moves.ts` and retrofit in `applyPendingFreeOperationVariants()`.
2. This problem is broader than the `ENG-002` ordering bug. Even with order-invariant direct seeding, plain non-`executionContext` grants still depend on retrofit for move creation.
3. The current suite already covers more behavior than this ticket originally implied. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` and `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` already exercise required grants, `executionContext`, `executeAsSeat`, ambiguity handling, and legality/apply parity for many denial cases.
4. The live architecture gap is still structural, but the full convergence is larger than this ticket first claimed. In local reassessment, removing retrofit behavior regressed current FITL execution-context / staged-grant flows, including `packages/engine/test/integration/fitl-events-cambodian-civil-war.test.ts` and `packages/engine/test/integration/fitl-events-ia-drang.test.ts`.
5. The comprehensive solution should therefore be split into follow-up tickets: first converge execution-context and staged-grant discovery onto the canonical builder, then retire `applyPendingFreeOperationVariants()` only after those regressions are green under the new model.

## Architecture Check

1. The cleanest long-term design is a single grant-rooted candidate builder used for all ready pending grants, regardless of `executionContext`, `executeAsSeat`, or whether the underlying action has a pipeline.
2. That design is more beneficial than the current architecture because candidate generation then depends only on the runtime grant contract, not on whether an ordinary non-free template happened to exist first.
3. The right refactor is not a broad rewrite of authorization or `applyMove()`. The shared grant-analysis modules already provide the right downstream model; the remaining duplication is in discovery-time candidate creation.
4. No backwards-compatibility shim should preserve duplicate discovery explanations. But the current attempted removal proved that retirement of retrofit must follow parity, not precede it.
5. This ticket is therefore better treated as an umbrella architecture goal, with concrete implementation split into follow-up tickets rather than forced through one risky change set.

## What to Change

### 1. Split The Convergence Work

Track the comprehensive architecture as two concrete follow-ups:

- `ENG-004` should converge execution-context and staged-grant discovery onto the canonical grant-rooted builder in `legal-moves.ts`.
- `ENG-005` should remove `applyPendingFreeOperationVariants()` only after the canonical builder reproduces the current legal-move surface for those flows.

## Deferred Because

1. Current green behavior still depends on retrofit for some execution-context and sequence-driven event chains.
2. The comprehensive change is still the right direction, but forcing retrofit removal before parity would knowingly regress existing behavior.
3. The next step should be explicit, ticketed convergence work rather than leaving the remaining architectural debt implicit.

## Files to Touch

- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-cambodian-civil-war.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-ia-drang.test.ts` (modify)

## Out of Scope

- FITL card content changes
- runner / visual work
- unrelated turn-flow option-matrix redesign

## Acceptance Criteria

### Tests That Must Pass

1. Canonical builder parity for execution-context and staged-grant flows is proven before retrofit is removed.
2. `packages/engine/test/integration/fitl-events-cambodian-civil-war.test.ts` remains green under the converged discovery model.
3. `packages/engine/test/integration/fitl-events-ia-drang.test.ts` remains green under the converged discovery model.
4. `applyPendingFreeOperationVariants()` is removed only after those flows no longer depend on it.

### Invariants

1. Free-operation discovery has one canonical move-creation path for ready grants.
2. `GameDef` and simulation remain game-agnostic; no game-specific kernel branches are introduced.
3. Action class semantics remain intrinsic-first: `turnFlow.actionClassByActionId` is still authoritative, and grant metadata only constrains compatibility where appropriate.

## Test Plan

### New/Modified Tests

1. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-cambodian-civil-war.test.ts` — keep the Cambodia Air Lift -> Sweep follow-up sequence green while discovery is converged.
Rationale: current reassessment showed this flow still depends on retrofit semantics.
2. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-ia-drang.test.ts` — keep the Air Lift -> Sweep -> Assault required chain green while discovery is converged.
Rationale: this is the clearest staged-grant regression when retrofit is removed too early.
3. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts` and `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add focused canonical-builder coverage for the converged discovery path once those staged regressions are solved.
Rationale: broad parity already exists; the missing work is the builder-level convergence.

### Commands

1. `pnpm run check:ticket-deps`
2. `pnpm -F @ludoforge/engine build`
3. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/unit/kernel/legal-moves.test.js`
5. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm -F @ludoforge/engine lint`
8. `pnpm -F @ludoforge/engine typecheck`

## Outcome

Completed: 2026-03-11

What actually changed:

1. This umbrella ticket was completed through the two follow-up tickets it explicitly spawned:
   - `ENG-004` verified and documented the direct canonical-builder convergence already present for execution-context and staged-grant discovery.
   - `ENG-005` finished the remaining canonical-builder parity work and removed `applyPendingFreeOperationVariants()` from turn-order move creation.
2. The final architecture now has one canonical ready-grant move creation path in [`packages/engine/src/kernel/legal-moves.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves.ts), while [`packages/engine/src/kernel/legal-moves-turn-order.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves-turn-order.ts) is back to turn-flow filtering only.

Deviations from original plan:

1. `ENG-003` was not executed as a single large refactor. Reassessment correctly split the work into `ENG-004` and `ENG-005`, which turned out to be the cleaner and safer architectural path.
2. The final implementation had to absorb additional real regressions that the original umbrella wording did not enumerate, especially staged FITL follow-up chains and momentum-blocked free-operation grants.

Verification results:

1. `ENG-004` archived as completed with direct-builder verification.
2. `ENG-005` completed with focused kernel/integration verification plus full `pnpm -F @ludoforge/engine test`, `lint`, and `typecheck`.
