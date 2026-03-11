# ENG-003: Remove Split Free-Operation Discovery Between Direct Seeding And Retrofit

**Status**: PENDING
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

1. The current code is better than before but is not yet architecturally converged. Free-operation discovery remains bifurcated between direct seeding and retrofit.
2. This problem is broader than the `ENG-002` ordering bug. Even if direct-seeding order is fixed, plain grants still flow through a separate mechanism.
3. The active FITL rollout ticket assumes the generic free-operation path is stable, but it does not specify this remaining discovery split and should not be overloaded with the kernel refactor.

## Architecture Check

1. The cleanest long-term design is a single grant-rooted candidate builder used for all ready pending grants, regardless of `executionContext` or whether the underlying action has a pipeline.
2. That design keeps game-specific behavior in `GameSpecDoc` and tests while making the kernel’s move-discovery model uniform and easier to reason about.
3. No backwards-compatibility shim should preserve duplicate discovery explanations. If retrofit becomes redundant after convergence, it should be reduced or removed.

## What to Change

### 1. Introduce One Canonical Grant-Rooted Candidate Path

Refactor free-operation discovery so all ready pending grants produce candidate free moves through one shared path before general turn-flow filtering.

That path must handle:

- pipeline-backed actions
- plain non-pipeline actions
- `executionContext`
- `executeAsSeat`
- zone-filtered and sequence-filtered grants
- intrinsic vs grant-derived action class handling

### 2. Collapse Retrofit Responsibilities

Reduce `applyPendingFreeOperationVariants()` so it no longer serves as a second independent explanation for ready free-operation discovery.

If some turn-flow-specific filtering still belongs there, limit it to post-candidate filtering rather than move creation.

### 3. Strengthen Cross-Surface Parity

Add tests proving the unified discovery path remains aligned with:

- `legalChoicesDiscover`
- `applyMove`
- ambiguity handling
- exact move identity for denied and admitted free-operation probes

## Files to Touch

- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (modify)

## Out of Scope

- FITL card content changes
- runner / visual work
- unrelated turn-flow option-matrix redesign

## Acceptance Criteria

### Tests That Must Pass

1. Ready pending free-operation grants are surfaced through one canonical grant-rooted discovery model regardless of pipeline presence.
2. Plain non-pipeline grants no longer depend on late retrofit to become discoverable free moves.
3. Existing suite: `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. Existing suite: `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Free-operation discovery has one canonical move-creation path for ready grants.
2. `GameDef` and simulation remain game-agnostic; no game-specific kernel branches are introduced.
3. Action class semantics remain intrinsic-first: `turnFlow.actionClassByActionId` is still authoritative, and grant metadata only constrains compatibility where appropriate.

## Test Plan

### New/Modified Tests

1. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts` — cover plain ready grants, pipeline-backed grants, and mixed cases through one discovery model.
2. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — pin unified discovery behavior across executionContext, execute-as, and required-grant flows.
3. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — verify unified discovery stays aligned with legality/authorization surfaces.

### Commands

1. `pnpm run check:ticket-deps`
2. `pnpm -F @ludoforge/engine build`
3. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
4. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/unit/kernel/legal-moves.test.js`
5. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm -F @ludoforge/engine lint`
8. `pnpm -F @ludoforge/engine typecheck`
