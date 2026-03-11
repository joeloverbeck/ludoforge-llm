# ENG-004: Converge Execution-Context And Staged Free-Operation Discovery

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel` free-operation legal-move discovery
**Deps**: `/home/joeloverbeck/projects/ludoforge-llm/tickets/README.md`, `/home/joeloverbeck/projects/ludoforge-llm/tickets/ENG-003-remove-split-free-operation-discovery-between-direct-seeding-and-retrofit.md`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves-turn-order.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/free-operation-discovery-analysis.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-cambodian-civil-war.test.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-ia-drang.test.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts`

## Problem

`ENG-004` was originally written as a major kernel convergence task. That is no longer accurate.

The current code in `packages/engine/src/kernel/legal-moves.ts` already contains direct canonical-builder handling for:

- `executionContext` grants
- ready staged pending grants
- `executeAsSeat` / execution-player override discovery

The remaining architectural debt is narrower:

- `applyPendingFreeOperationVariants()` still exists as a retrofit/fallback path
- kernel-boundary tests did not yet pin the direct execution-context/staged behavior as explicitly as the FITL integration suites did

So the live problem is not “implement the convergence from scratch.” The live problem is “verify the convergence now present, strengthen kernel-boundary coverage, and leave retrofit retirement to `ENG-005`.”

## Assumption Reassessment (2026-03-11)

1. The current code already has shared downstream grant analysis in authorization and apply-time logic, and now also has direct discovery-time handling for `executionContext` grants inside `enumeratePendingFreeOperationMoves()`.
2. The existing integration suite already proves the intended behavior more broadly than this ticket originally claimed:
   - `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` already covers declarative/effect-issued `executionContext`, `executeAsSeat`, monsoon interaction, and ordered grant chains.
   - `packages/engine/test/integration/fitl-events-cambodian-civil-war.test.ts` and `packages/engine/test/integration/fitl-events-ia-drang.test.ts` are green and already pin the real FITL chains cited in the ticket.
3. The remaining architecture gap is now primarily explicit coverage and final retrofit retirement, not missing canonical-builder behavior for the flows named here.
4. This remains generic engine work. FITL is still only the proving ground; no game-specific kernel branches are justified.

## Architecture Check

1. The target architecture is still one canonical grant-rooted builder in `legal-moves.ts` for ready free-operation candidates.
2. That architecture is better than the current mixed model because discovery should depend on runtime grant contracts and action definitions, not on whether an ordinary template happens to exist for retrofit.
3. The current code is already materially closer to that target than the ticket text stated. A second large refactor under `ENG-004` would now be churn without clear benefit.
4. The clean next step is therefore:
   - strengthen direct-builder regression coverage here
   - keep the remaining fallback debt isolated to `ENG-005`
5. `GameSpecDoc` remains the home for game-specific grant content. No FITL-specific kernel branching belongs here.

## What to Change

### 1. Correct The Ticket Scope

Update `ENG-004` to reflect the live code:

- execution-context convergence is already implemented in the canonical builder
- staged FITL chains named in this ticket are already green
- outright retrofit retirement remains `ENG-005`

### 2. Tighten Kernel-Boundary Coverage

Add or strengthen focused `packages/engine/test/unit/kernel/legal-moves.test.ts` regressions so the ticket is defended at the kernel boundary as well as by FITL integration:

- `executionContext` grants still surface only the grant-scoped free moves in a required-grant window
- staged ready-grant sequencing remains locked to the current ready step before advancing

### 3. Verify The Full Engine Guardrails

Run the focused suites plus engine-wide test/lint/typecheck verification and archive the ticket if everything is green.

## Files to Touch

- `/home/joeloverbeck/projects/ludoforge-llm/tickets/ENG-004-converge-execution-context-and-staged-free-operation-discovery.md` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)

## Out of Scope

- removing `applyPendingFreeOperationVariants()` outright
- rewriting apply-time authorization or grant consumption unless a concrete parity bug requires it
- FITL card text/content rewrites unrelated to expressing already-intended rules data

## Acceptance Criteria

1. The ticket text matches the live architecture and no longer claims missing behavior that is already implemented.
2. Kernel-boundary tests explicitly cover direct execution-context discovery and staged ready-grant sequencing.
3. `packages/engine/test/integration/fitl-events-cambodian-civil-war.test.ts` passes.
4. `packages/engine/test/integration/fitl-events-ia-drang.test.ts` passes.
5. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` passes.
6. `packages/engine/test/unit/kernel/legal-moves.test.ts` passes.
7. `pnpm -F @ludoforge/engine test` passes.
8. `pnpm -F @ludoforge/engine lint` passes.
9. `pnpm -F @ludoforge/engine typecheck` passes.

## Test Plan

### New/Modified Tests

1. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts` — add focused regressions for direct `executionContext` free-move discovery and staged ready-grant sequencing.
Rationale: the architecture should be defended at the kernel boundary, not only by FITL integration coverage that already exists.
2. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — keep existing execution-context and staged-grant integration coverage green.
Rationale: this suite already exercises the generic grant machinery more directly than the original ticket text acknowledged.
3. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-cambodian-civil-war.test.ts` and `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-ia-drang.test.ts` — keep the real FITL chains green.
Rationale: these are still the best high-signal end-to-end proofs that event-driven staged grants behave correctly in live content.

### Commands

1. `pnpm run check:ticket-deps`
2. `pnpm -F @ludoforge/engine build`
3. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
5. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-cambodian-civil-war.test.js`
6. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-ia-drang.test.js`
7. `pnpm -F @ludoforge/engine test`
8. `pnpm -F @ludoforge/engine lint`
9. `pnpm -F @ludoforge/engine typecheck`

## Outcome

Completed: 2026-03-11

What actually changed:

1. Reassessed the ticket against the live kernel and corrected the scope. `legal-moves.ts` already contains direct canonical-builder handling for `executionContext` grants and ready staged pending grants, so no production-kernel refactor was justified under `ENG-004`.
2. Strengthened kernel-boundary coverage in `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts` with:
   - a required-grant regression that proves only `executionContext`-scoped free moves surface
   - a staged pending-grant regression that proves discovery stays locked to the current ready step before advancing
3. Re-verified the existing FITL integration coverage cited by the ticket instead of duplicating it.

Deviations from original plan:

1. No production code in `packages/engine/src/kernel/legal-moves.ts` was changed because the behavior this ticket was written to implement is already present.
2. No FITL integration tests were modified because the existing suites already covered the cited Cambodia, Ia Drang, and generic execution-context flows.
3. Remaining retrofit retirement work stays with `ENG-005`; forcing more change here would have been architecture churn, not improvement.

Verification results:

1. `pnpm run check:ticket-deps`
2. `pnpm -F @ludoforge/engine build`
3. `node packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `node packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
5. `node packages/engine/dist/test/integration/fitl-events-cambodian-civil-war.test.js`
6. `node packages/engine/dist/test/integration/fitl-events-ia-drang.test.js`
7. `pnpm -F @ludoforge/engine test`
8. `pnpm -F @ludoforge/engine lint`
9. `pnpm -F @ludoforge/engine typecheck`
