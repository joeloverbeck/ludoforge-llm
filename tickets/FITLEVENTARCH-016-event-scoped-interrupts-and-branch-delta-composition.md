# FITLEVENTARCH-016: Event-Scoped Interrupts and Branch Delta Composition for Card Mini-Phases

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — generic event/runtime scaffolding, compiler/schema support, and FITL data simplification
**Deps**: tickets/README.md, archive/tickets/FITLEVENTARCH-006-event-target-canonical-payload-ownership.md, archive/tickets/GAMESPECDOC-004-binding-and-param-semantics-spec.md, data/games/fire-in-the-lake/30-rules-actions.md, data/games/fire-in-the-lake/41-events/033-064.md, packages/engine/src/kernel/apply-move.ts, packages/engine/src/kernel/turn-flow-eligibility.ts

## Problem

Card 64 currently requires a bespoke global interrupt phase (`honoluluPacify`) plus four near-identical branch payloads that only vary by Aid/Patronage deltas. That works, but it does not scale cleanly. As more event cards introduce mini-phases or small choice matrices, the current authoring model will accumulate one-off global interrupt IDs in shared rule files and repeated branch effects in card data, increasing maintenance cost and making event architecture less declarative than it should be.

## Assumption Reassessment (2026-03-11)

1. Confirmed: `data/games/fire-in-the-lake/30-rules-actions.md` now contains a dedicated `honoluluPacify` interrupt and routes existing coup pacify actions through it.
2. Confirmed: `data/games/fire-in-the-lake/41-events/033-064.md` repeats four branches with identical control flow and only two numeric deltas changing between branches.
3. Mismatch: the current implementation is rules-correct but not the cleanest long-term shape. Corrected scope is to create reusable generic authoring/runtime primitives so future cards express mini-phases and small delta-choice matrices without bespoke global scaffolding.

## Architecture Check

1. A reusable event-scoped interrupt/subphase primitive is cleaner than adding new global interrupt IDs per card because it localizes event-specific sequencing to event data while keeping runtime handling generic.
2. A generic branch-delta composition helper keeps game-specific numbers in `GameSpecDoc` while preventing repeated boilerplate in card payloads; `GameDef` and simulation stay agnostic.
3. No backwards-compatibility aliases should be added. Replace ad hoc authoring shapes with one canonical pattern for event mini-phases and repeated delta bundles.

## What to Change

### 1. Introduce a generic event-scoped interrupt/subphase contract

Design a generic GameSpecDoc/GameDef shape for event-triggered mini-phases that can:
- push a scoped interrupt/subphase without requiring a globally named per-card interrupt in shared rules files,
- bind the executing faction or other event-local context into the mini-phase,
- resume card flow generically when the mini-phase completes.

The runtime/compiler implementation must remain generic and must not know about Honolulu specifically.

### 2. Add a reusable branch delta-composition authoring primitive

Introduce a generic authoring helper for "choose one of N delta bundles, then run common follow-up effects". The helper should cover patterns like:
- multiple branches that differ only in resource/track deltas,
- one shared follow-up effect block such as "if executing COIN faction, open event mini-phase",
- data-level composition without pushing repeated effect lists into each branch.

### 3. Migrate Honolulu to the canonical pattern

After the generic primitives exist, re-author card 64 to use them:
- no bespoke `honoluluPacify` global interrupt identifier in shared FITL rules unless still required by the canonical primitive,
- no four-way repeated effect boilerplate for Aid/Patronage choices,
- preserve exact current rules behavior and coverage.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify)
- `data/games/fire-in-the-lake/41-events/033-064.md` (modify)
- `packages/engine/src/cnl/` (modify relevant lowering/validation modules)
- `packages/engine/src/kernel/` (modify relevant generic interrupt/runtime modules)
- `packages/engine/schemas/` (modify if schema artifacts need regeneration)
- `packages/engine/test/integration/fitl-events-honolulu-conference.test.ts` (modify)
- `packages/engine/test/unit/` (modify/add generic contract tests for event-scoped interrupt and branch-composition lowering)

## Out of Scope

- Reworking unrelated FITL event cards unless they are the minimum additional fixture needed to prove the generic primitive.
- Visual presentation changes or `visual-config.yaml` concerns.
- Game-specific special casing in engine code for Fire in the Lake card IDs or faction names.

## Acceptance Criteria

### Tests That Must Pass

1. A card can declare an event-scoped mini-phase without introducing a bespoke global interrupt identifier in shared game rule action lists.
2. A card can express a delta-choice matrix with one shared follow-up effect block and produce the same runtime behavior as the expanded branch form.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Event-specific sequencing remains authored in GameSpecDoc data; runtime/compiler/kernel stay generic and reusable across games.
2. The canonical branch-composition helper does not encode game-specific resources or faction semantics in shared engine contracts.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/` — add focused lowering/runtime tests for the new event-scoped interrupt primitive and branch delta-composition helper.
2. `packages/engine/test/integration/fitl-events-honolulu-conference.test.ts` — verify Honolulu still produces the same Aid/Patronage choices, pacify behavior, and insurgent eligibility behavior after migration.
3. `packages/engine/test/integration/fitl-events-text-only-behavior-backfill.test.ts` — extend regression coverage if needed so event text/backfill behavior remains aligned with canonical card data.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo schema:artifacts`
4. `pnpm turbo test`
