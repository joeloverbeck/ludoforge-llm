# FRONTEND-F3-004: End-to-End Verification for Milestone F3 Card Animations

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: No (runner tests + roadmap docs)
**Deps**: FRONTEND-F3-002, FRONTEND-F3-003

## Assumption Reassessment (2026-02-19)

1. `FRONTEND-F3-002` and `FRONTEND-F3-003` are already completed and archived (`archive/tickets/FRONTEND-F3-002.md`, `archive/tickets/FRONTEND-F3-003.md`), so card semantic classification and card-capable rendering are present.
2. The ticket's assumption that there is no objective test evidence is inaccurate:
   - semantic mapping coverage exists (`packages/runner/test/animation/trace-to-descriptors.test.ts`);
   - card semantic preset/timeline coverage exists (`packages/runner/test/animation/preset-registry.test.ts`, `packages/runner/test/animation/timeline-builder.test.ts`);
   - playback controls and reduced-motion behavior coverage exists (`packages/runner/test/animation/animation-controller.test.ts`, `packages/runner/test/animation/animation-queue.test.ts`, `packages/runner/test/animation/reduced-motion.test.ts`, `packages/runner/test/canvas/GameCanvas.test.ts`).
3. The real gap is acceptance-level proof for Milestone F3 card animation readiness: no single integrated runner test currently validates one flow containing `cardDeal`, `cardFlip`, and `cardBurn` together while also asserting playback/reduced-motion semantics at the controller boundary.
4. A new browser E2E harness is not currently part of runner architecture; adding one just for this gate would add maintenance overhead and flaky UI-coupled assertions. Deterministic integration tests at the animation-controller boundary are the cleaner long-term architecture fit.

## Problem

The F3 roadmap gate includes "`[ ] Card animations (deal, flip, burn) work`". While component-level coverage exists, there is no consolidated acceptance test proving all three semantics in a single controller-level animation flow under normal and reduced-motion execution policies. Without this evidence, the roadmap checkbox remains under-justified.

## Updated Scope (Architecture-First)

1. Add deterministic integration acceptance tests at the animation-controller pipeline boundary (not a new browser E2E framework) that exercise a realistic card effect trace containing:
   - deal semantics,
   - flip semantics,
   - burn semantics.
2. Assert semantic descriptor emission and timeline handoff in normal mode using existing generic `GameDef.cardAnimation` metadata wiring.
3. Assert reduced-motion fast-forward behavior for the same card semantic flow (no queue enqueue, timeline completion/kill).
4. Re-assert playback control forwarding (speed/pause/resume/skip) in the acceptance context to ensure no regressions.
5. Update `specs/35-00-frontend-implementation-roadmap.md` F3 checkbox for card animations only after tests are green.

## Invariants

1. Milestone F3 checkbox is updated only when objective test evidence exists.
2. Acceptance assertions verify observable pipeline behavior (semantic descriptors + timeline/queue policy), not engine internals.
3. Card animation coverage includes at least one full flow that contains all three semantics (deal, flip, burn).
4. Accessibility/reduced-motion behavior remains compliant during card animation flows.
5. No backwards-compatibility shims or alias paths are introduced; tests target the current architecture directly.

## Tests

1. `packages/runner/test/animation/animation-controller.test.ts`
   - add combined card semantic flow acceptance (`cardDeal` + `cardFlip` + `cardBurn`) with timeline handoff assertions.
2. `packages/runner/test/animation/animation-controller.test.ts`
   - add reduced-motion acceptance for the same semantic flow (fast-forward instead of queue playback).
3. Regression: existing animation queue/control tests remain green (`packages/runner/test/animation/animation-queue.test.ts` and existing controller playback-control coverage).
4. Roadmap update validation:
   - set F3 gate "`Card animations (deal, flip, burn) work`" to complete only after all runner tests and lint pass.

## Outcome

- Completion date: 2026-02-19
- What actually changed:
  - Reassessed and corrected ticket assumptions to reflect completed dependencies and existing coverage.
  - Added two acceptance tests in `packages/runner/test/animation/animation-controller.test.ts`:
    - combined `cardDeal` + `cardFlip` + `cardBurn` flow in normal mode with timeline handoff;
    - same combined flow under reduced motion with fast-forward behavior (`progress(1)` + `kill`) and no queue enqueue.
  - Updated `specs/35-00-frontend-implementation-roadmap.md` to mark F3 gate "`Card animations (deal, flip, burn) work`" as complete.
- Deviation from original plan:
  - Did not add a new browser E2E harness; implemented deterministic controller-level acceptance tests instead because this better matches current architecture and avoids brittle UI-coupled tests.
- Verification:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
