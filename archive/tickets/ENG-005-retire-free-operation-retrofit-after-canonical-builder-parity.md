# ENG-005: Retire Free-Operation Retrofit After Canonical Builder Parity

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel` free-operation discovery architecture cleanup
**Deps**: `/home/joeloverbeck/projects/ludoforge-llm/tickets/README.md`, `/home/joeloverbeck/projects/ludoforge-llm/archive/tickets/ENG-003-remove-split-free-operation-discovery-between-direct-seeding-and-retrofit.md`, `/home/joeloverbeck/projects/ludoforge-llm/archive/tickets/ENG-004-converge-execution-context-and-staged-free-operation-discovery.md`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves-turn-order.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legality-surface-parity.test.ts`

## Problem

`ENG-004` is complete, and the current kernel is closer to the target architecture than this ticket text originally acknowledged. `legal-moves.ts` already performs direct canonical-builder discovery for:

- `executionContext`-scoped grants
- ready staged pending grants
- `executeAsSeat` / execution-player override flows

But the architecture is still genuinely split because `applyPendingFreeOperationVariants()` remains a second discovery path for a narrower set of ready grants, especially:

- non-`executionContext` grants that still derive free moves by retrofitting ordinary templates
- non-pipeline / special-activity free moves that still depend on synthesized retrofit base moves

As long as that retrofit remains as move-creation logic:

- legal move explanations remain duplicated
- future fixes risk drift between direct seeding and retrofit
- discovery bugs for ready non-`executionContext` grants can be masked instead of corrected at the canonical source

## Assumption Reassessment (2026-03-11)

1. `ENG-004` is already complete; this ticket should no longer describe that work as a prerequisite.
2. Current green behavior still depends on retrofit, but more narrowly than the prior wording implied. The live remaining dependency is ready non-`executionContext` grant discovery, not execution-context/staged-chain parity in general.
3. The canonical-builder work still belongs entirely in the agnostic kernel. No game-specific behavior should leak into the removal.
4. The current suite already proves more than this ticket originally implied. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`, `packages/engine/test/integration/fitl-events-cambodian-civil-war.test.ts`, and `packages/engine/test/integration/fitl-events-ia-drang.test.ts` are already the right high-signal regression suites for staged and required-grant flows.

## Architecture Check

1. The clean end state is still one discovery mechanism: canonical ready-grant candidate creation in `legal-moves.ts`, followed by ordinary turn-flow filtering.
2. That architecture is more beneficial than the current mixed model because free-operation move creation should depend on runtime grant contracts and action definitions, not on whether an ordinary non-free template happened to exist first.
3. `legal-moves-turn-order.ts` should remain responsible only for turn-flow filtering/window rules, not for creating free-operation moves.
4. No backwards-compatibility shim or alias should preserve the old retrofit path once the remaining non-`executionContext` parity gap is closed.

## What to Change

### 1. Finish Canonical-Builder Parity For Remaining Ready Grants

Extend `enumeratePendingFreeOperationMoves()` so it becomes the sole discovery path for the remaining ready non-`executionContext` grants that still depend on retrofit today, including non-pipeline / special-activity cases.

### 2. Remove Retrofit Move Creation

Reduce `applyPendingFreeOperationVariants()` so it no longer creates or authorizes free-operation moves.

### 3. Tighten Architectural Guards

Update kernel architecture tests so `legal-moves-turn-order.ts` is prevented from:

- probing free-operation applicability for move creation
- probing free-operation authorization for move creation
- probing free-operation decision admission for move creation

### 4. Preserve Cross-Surface Parity

Ensure legality/apply/legal-move surfaces remain aligned after retrofit removal.

## Files to Touch

- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify if parity gaps require stronger coverage)

## Out of Scope

- re-solving execution-context / staged-grant parity work already completed under `ENG-004`
- game-data rewrites
- runner / visual changes

## Acceptance Criteria

1. `enumeratePendingFreeOperationMoves()` covers the ready non-`executionContext` grant cases that still relied on retrofit before this ticket.
2. `applyPendingFreeOperationVariants()` no longer creates free-operation moves.
3. `legal-moves-turn-order.ts` no longer imports or calls free-operation discovery admission helpers for move creation.
4. `legalMoves`, `legalChoicesDiscover`, and `applyMove` remain aligned for free-operation denials and admissions.
5. `packages/engine/test/unit/kernel/legal-moves.test.ts` passes.
6. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` passes.
7. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` passes.
8. `packages/engine/test/integration/fitl-events-cambodian-civil-war.test.ts` passes.
9. `packages/engine/test/integration/fitl-events-ia-drang.test.ts` passes.
10. `pnpm -F @ludoforge/engine test` passes.

## Test Plan

### New/Modified Tests

1. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts` — restore/add architecture guards that prove canonical builder now covers the remaining ready non-`executionContext` cases and that retrofit no longer creates free-operation moves.
Rationale: the architectural boundary should be enforced directly in source-level tests.
2. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — keep cross-surface parity green after retrofit removal.
Rationale: once the second discovery path is removed, surface behavior must remain consistent.
3. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — keep required non-`executionContext` grant discovery green after retirement of retrofit.
Rationale: this suite exercises the generic grant machinery more directly than the architecture-only unit guards.
4. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-cambodian-civil-war.test.ts` and `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-ia-drang.test.ts` — keep staged FITL chains green.
Rationale: these remain the highest-signal end-to-end proofs that the canonical builder still honors ordered ready-grant chains.

### Commands

1. `pnpm run check:ticket-deps`
2. `pnpm -F @ludoforge/engine build`
3. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
5. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
6. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-cambodian-civil-war.test.js`
7. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-events-ia-drang.test.js`
8. `pnpm -F @ludoforge/engine test`
9. `pnpm -F @ludoforge/engine lint`
10. `pnpm -F @ludoforge/engine typecheck`

## Outcome

Completed: 2026-03-11

What actually changed:

1. Reassessed the ticket against the live kernel and corrected the scope before implementation. The real remaining gap was not all builder parity; it was the subset of ready non-`executionContext` and special-activity grant cases that still depended on retrofit.
2. Removed `applyPendingFreeOperationVariants()` from [`packages/engine/src/kernel/legal-moves-turn-order.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves-turn-order.ts) so turn-order helpers no longer create or authorize free-operation moves.
3. Extended the canonical builder in [`packages/engine/src/kernel/legal-moves.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves.ts) to cover the remaining ready-grant cases, including:
   - non-pipeline / special-activity free moves
   - staged event follow-up grants such as Cambodian Civil War and Ia Drang
   - momentum-blocked profiles that are still legal when granted as free operations
   - grant-scoped phase/pipeline preflight cases where the old retrofit had been masking the missing canonical path
4. Tightened architecture guards in [`packages/engine/test/unit/kernel/legal-moves.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts) and [`packages/engine/test/unit/kernel/free-operation-probe-boundary-guard.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/free-operation-probe-boundary-guard.test.ts) so free-operation move creation is pinned to `legal-moves.ts`, not `legal-moves-turn-order.ts`.

Deviations from original plan:

1. The ticket originally assumed `ENG-004` completion implied canonical-builder parity. Reassessment showed that assumption was false; the remaining retrofit dependency still included important production flows.
2. The final implementation had to solve two additional real regressions not called out in the original ticket text:
   - staged FITL free-operation chains (`card-62`, `card-44`)
   - momentum-blocked actions that remain legal when granted as free operations
3. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` did not need source edits because the existing parity suite stayed green once the canonical builder matched the retrofit behavior.

Verification results:

1. `pnpm run check:ticket-deps`
2. `pnpm -F @ludoforge/engine build`
3. `node packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `node packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
5. `node packages/engine/dist/test/unit/kernel/free-operation-probe-boundary-guard.test.js`
6. `node packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
7. `node packages/engine/dist/test/integration/fitl-events-cambodian-civil-war.test.js`
8. `node packages/engine/dist/test/integration/fitl-events-ia-drang.test.js`
9. `node packages/engine/dist/test/integration/fitl-momentum-prohibitions.test.js`
10. `pnpm -F @ludoforge/engine test`
11. `pnpm -F @ludoforge/engine lint`
12. `pnpm -F @ludoforge/engine typecheck`
