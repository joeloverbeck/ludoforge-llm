# ENG-004: Converge Execution-Context And Staged Free-Operation Discovery

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/kernel` free-operation legal-move discovery
**Deps**: `/home/joeloverbeck/projects/ludoforge-llm/tickets/README.md`, `/home/joeloverbeck/projects/ludoforge-llm/tickets/ENG-003-remove-split-free-operation-discovery-between-direct-seeding-and-retrofit.md`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves-turn-order.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/free-operation-discovery-analysis.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-cambodian-civil-war.test.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-ia-drang.test.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts`

## Problem

The engine still has no single grant-rooted discovery explanation for execution-context and staged free-operation chains.

Today, current green behavior for some real event flows still depends on `applyPendingFreeOperationVariants()` discovering free moves after ordinary templates already exist. When retrofit behavior is removed too early, at least these current suites regress:

1. `packages/engine/test/integration/fitl-events-cambodian-civil-war.test.ts`
2. `packages/engine/test/integration/fitl-events-ia-drang.test.ts`

That means the canonical builder in `legal-moves.ts` is not yet semantically complete enough to replace retrofit for:

- execution-context grants
- staged same-event free-operation chains
- follow-up grants whose discoverability depends on prior move sequencing or decision-driven overlays

## Assumption Reassessment (2026-03-11)

1. The current code already has shared downstream grant analysis in authorization and apply-time logic. The missing convergence is discovery-time candidate creation.
2. Plain grant gaps are not the whole story. Real green FITL flows prove that execution-context and staged grant chains still depend on retrofit semantics.
3. This is still generic engine work. The failing examples come from FITL, but the architectural gap is in kernel discovery, not in game data modeling.
4. The clean solution is not to preserve retrofit forever. It is to teach the canonical builder to produce the same current legal moves for these flows without relying on retrofit.

## Architecture Check

1. The target architecture is one canonical grant-rooted builder in `legal-moves.ts` that can emit all ready free-operation candidates, including execution-context and staged chains.
2. That is better than the current architecture because discovery then depends on runtime grant contracts and action definitions, not on whether an ordinary template happens to exist for retrofit.
3. `GameSpecDoc` remains the home for game-specific grant content. No FITL-specific branches belong in the kernel.
4. No backwards-compatibility aliasing should be introduced. This ticket should improve the canonical builder directly rather than adding a third discovery path.

## What to Change

### 1. Teach The Canonical Builder Execution-Context Parity

Refactor `enumeratePendingFreeOperationMoves()` so execution-context grants emit the same legal free moves that current green behavior exposes through the combined direct-plus-retrofit model.

This includes:

- action applicability under execution overlays
- decision-driven move shapes
- zone-filtered overlays
- `executeAsSeat` and execution-player overrides

### 2. Teach The Canonical Builder Staged-Grant Parity

Ensure staged same-event free-operation chains remain discoverable at each ready step directly from the canonical builder.

At minimum, preserve current legal move behavior for:

- card-62 Cambodian Civil War free Air Lift -> free Sweep
- card-44 Ia Drang free Air Lift -> free Sweep -> free Assault

### 3. Tighten Canonical-Builder Coverage

Add or strengthen tests around the builder-level convergence so these flows are pinned at the kernel boundary, not only through end-to-end FITL integration.

## Files to Touch

- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-cambodian-civil-war.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-ia-drang.test.ts` (modify)

## Out of Scope

- removing `applyPendingFreeOperationVariants()` outright
- rewriting apply-time authorization or grant consumption unless a concrete parity bug requires it
- FITL card text/content rewrites unrelated to expressing already-intended rules data

## Acceptance Criteria

1. Current green execution-context and staged-grant FITL flows remain green using the improved canonical builder behavior.
2. The canonical builder can surface those free moves without depending on retrofit to create them.
3. `packages/engine/test/integration/fitl-events-cambodian-civil-war.test.ts` passes.
4. `packages/engine/test/integration/fitl-events-ia-drang.test.ts` passes.
5. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` passes.
6. `packages/engine/test/unit/kernel/legal-moves.test.ts` passes.
7. `pnpm -F @ludoforge/engine test` passes.

## Test Plan

### New/Modified Tests

1. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-cambodian-civil-war.test.ts` — pin the Air Lift follow-up free move directly after event resolution.
Rationale: this is the clearest current execution-context regression when retrofit is removed too early.
2. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-events-ia-drang.test.ts` — pin staged required-grant discovery across the Air Lift -> Sweep -> Assault chain.
Rationale: this is the clearest staged-grant regression when retrofit is removed too early.
3. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts` — add focused canonical-builder regressions that do not depend on FITL fixtures.
Rationale: the architecture should be defended at the kernel boundary, not only by one game's integration tests.

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
