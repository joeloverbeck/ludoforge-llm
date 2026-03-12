# ENG-227: Constrained event grant viability preflight

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — generic free-operation witness-search ordering plus declarative FITL data restore and regression coverage
**Deps**: archive/tickets/ENG-205-authoritative-event-grant-viability-legality.md, archive/tickets/ENGINEARCH-084-free-op-sequence-viability-diagnostics.md, data/games/fire-in-the-lake/41-events/065-096.md, packages/engine/test/integration/fitl-event-free-operation-grants.test.ts, packages/engine/test/integration/fitl-events-an-loc.test.ts

## Problem

This ticket originally assumed `requireUsableForEventPlay` still relied on a coarse preflight heuristic that could not certify constrained deferred grants. Current code is already materially stronger: event gating calls the shared generic viability path, and that path probes complete witness moves through canonical grant authorization, action applicability, pipeline legality, `executeAsSeat`, move-zone probe bindings, and required outcome/state-change rules. The remaining gap is narrower but still architectural: the generic `chooseN` witness search can explore larger optional sets before smaller ones, which can miss a minimal legal witness within practical search budgets for richer operation profiles such as FITL March. Card-71 `An Loc` still carries a temporary authoring workaround because that generic search-order weakness was not revisited after the broader viability machinery and sequence-context capture support landed.

## Assumption Reassessment (2026-03-12)

1. Current event-play legality still flows through shared generic turn-flow filtering in `packages/engine/src/kernel/turn-flow-eligibility.ts`, and both discovery and direct `applyMove` validation already share that path via prior work in ENG-205.
2. `packages/engine/src/kernel/free-operation-viability.ts` already performs witness-based viability probing by enumerating complete candidate moves, replaying them through canonical free-operation discovery/authorization, action applicability, pipeline legality, and outcome-policy checks.
3. The current viability path already accounts for `executeAsSeat`, move-zone probe bindings, sequence blockers, and required non-noop outcomes. Replacing it with a second "new" witness engine would duplicate architecture that already exists.
4. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` already covers `requireUsableForEventPlay`, required outcome/state-change gating, execute-as-seat viability, sequence-context runtime capture/enforcement, and discovery/apply parity. What it does not yet pin explicitly is the positive event-play case where first-step usability is certified for a deferred sequence that captures context for later steps.
5. The remaining `An Loc` failure is not a need for FITL-specific kernel logic. It is a generic witness-search ordering problem: viability probing should prefer smaller `chooseN` selections first because minimal legal witnesses are both more common and less combinatorial.
6. `packages/engine/test/integration/fitl-events-an-loc.test.ts` currently verifies the runtime March-then-double-Attack path and currently asserts that the shaded March grant omits `viabilityPolicy`, which is now the stale workaround.

## Architecture Check

1. The current architecture is already the right one: one generic viability path derived from canonical grant/action legality and shared by event gating and runtime grant issuance.
2. Adding another dedicated witness-analysis subsystem would be worse than the current design because it would duplicate legality policy, increase drift risk, and obscure which path is authoritative.
3. The clean fix is to use the existing generic path everywhere, refine that path's `chooseN` witness-search ordering so it prefers minimal legal sets first, restore declarative authoring on `An Loc`, and add regression tests that lock the architecture in place.
4. `GameSpecDoc` remains the place where a game encodes a constrained March or Attack. Kernel/runtime code stays generic and reusable.

## What to Change

### 1. Correct stale FITL authoring

Restore `viabilityPolicy: requireUsableForEventPlay` on Card-71 `An Loc`'s constrained shaded March grant in `data/games/fire-in-the-lake/41-events/065-096.md`.

### 2. Refine generic witness-search ordering

Update the generic viability probe in `packages/engine/src/kernel/free-operation-viability.ts` so `chooseN` witness exploration prefers smaller valid cardinalities before larger ones. This keeps the search generic, reduces combinatorial waste, and makes minimal legal witnesses discoverable for richer action profiles without game-specific knowledge.

### 3. Add the missing generic regression

Expand `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` with a regression that proves `requireUsableForEventPlay` keeps an event playable when the first constrained witness move is legal and also establishes downstream sequence context for later grants.

### 4. Lock the real FITL scenario

Update `packages/engine/test/integration/fitl-events-an-loc.test.ts` to:

1. assert the shaded March grant again carries `requireUsableForEventPlay`,
2. assert the shaded event is suppressed when no legal troop-into-City March witness exists,
3. preserve the existing runtime March/Attack sequence coverage.

## Files to Touch

- `data/games/fire-in-the-lake/41-events/065-096.md` (modify)
- `packages/engine/src/kernel/free-operation-viability.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-an-loc.test.ts` (modify)

## Out of Scope

- New kernel viability subsystems or parallel legality paths.
- FITL-specific engine branches keyed on `An Loc`, `March`, `Attack`, `City`, or faction IDs.
- Visual config changes.

## Acceptance Criteria

### Tests That Must Pass

1. Card-71 shaded again uses `viabilityPolicy: requireUsableForEventPlay` on its constrained March grant.
2. Card-71 shaded event is suppressed when no legal troop-into-City March witness exists.
3. `requireUsableForEventPlay` remains playable for a constrained deferred-sequence grant whose first witness move establishes downstream sequence context.
4. Existing suites:
   `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
   `node --test packages/engine/dist/test/integration/fitl-events-an-loc.test.js`

### Invariants

1. Event-play viability remains game-agnostic and derived from canonical generic grant legality, not game IDs or card IDs.
2. `GameSpecDoc` continues to author the constraint; the engine only proves present-tense usability of that authored constraint.
3. There is one canonical event-play viability path. No second fallback or duplicate witness engine is introduced.
4. Generic witness search prefers smaller `chooseN` sets first so minimal legal proofs are discoverable before broader combinatorial branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add a constrained deferred-sequence regression proving event-play gating certifies a legal first-step witness that captures downstream sequence context.
2. `packages/engine/test/integration/fitl-events-an-loc.test.ts` — assert the shaded grant shape includes `requireUsableForEventPlay`.
3. `packages/engine/test/integration/fitl-events-an-loc.test.ts` — add a negative event-gating case where the card is suppressed because no legal troop March into a City exists.
4. `packages/engine/test/integration/fitl-events-an-loc.test.ts` — preserve the existing runtime coverage for Monsoon March, troop-only legality, same-city binding, and two Attacks.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-an-loc.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`
6. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-12
- What actually changed:
  - Reassessed the ticket assumptions and narrowed the real kernel gap to generic witness-search behavior rather than missing event-play architecture.
  - Refined `packages/engine/src/kernel/free-operation-viability.ts` so `chooseN` viability probing prefers smaller candidate sets first.
  - Added partial-move-safe pruning through `packages/engine/src/kernel/free-operation-discovery-analysis.ts` so unresolved future bindings in zone filters remain probeable while already-impossible branches are cut early.
  - Restored `viabilityPolicy: requireUsableForEventPlay` on Card-71 `An Loc` in `data/games/fire-in-the-lake/41-events/065-096.md`.
  - Added regression coverage for the generic constrained sequence-context case and the real `An Loc` event-gating/runtime case.
- Deviations from original plan:
  - The original ticket proposed replacing a "coarse" viability system with a new witness engine. That architecture already existed, so the implementation improved the existing generic probe instead of adding a second engine or duplicate legality path.
  - The final code change was smaller and cleaner than originally planned, but still kernel-level and fully generic.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js` passed.
  - `node packages/engine/dist/test/integration/fitl-events-an-loc.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`349` tests, `349` passed).
  - `pnpm turbo lint` passed with existing repo warnings only; no lint errors were introduced.
  - `pnpm run check:ticket-deps` passed.
