# 140MICRODECPRO-015: D8b — Replace `move-decision-sequence.ts` as the remaining internal decision-authority seam

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — kernel authority consolidation across microturn publication/application and legality
**Deps**: `archive/tickets/140MICRODECPRO-012.md`

## Problem

Ticket 012 truthfully retires the remaining **public** certificate/template-completion surface, but reassessment showed that `packages/engine/src/kernel/move-decision-sequence.ts` is still a live internal authority seam rather than a compatibility shim. The microturn kernel currently depends on `resolveMoveDecisionSequence(...)` in:

- `packages/engine/src/kernel/microturn/publish.ts`
- `packages/engine/src/kernel/microturn/apply.ts`
- `packages/engine/src/kernel/apply-move.ts`
- `packages/engine/src/kernel/move-legality-predicate.ts`

As long as that file remains, the repo still carries a pre-microturn internal decision-resolution authority shape even though the public client/agent contract is microturn-native. This ticket owns the remaining kernel-authority migration so the series does not silently stop at the public-surface cleanup.

## Assumption Reassessment (2026-04-21)

1. `move-decision-sequence.ts` is still called directly by the live microturn kernel and related legality/apply seams; it is not a dead compatibility file.
2. Deleting that file inside ticket 012 would materially widen 012 beyond a bounded public-surface retirement into a deeper kernel-core rewrite.
3. No other active ticket besides 012/013/014/009 would otherwise own this residual source migration, so the remaining authority replacement must be captured explicitly as a new active ticket.

## Architecture Check

1. F14 / F15: this ticket completes the migration by removing the last pre-microturn internal decision-authority seam rather than leaving it implicit and undocumented.
2. F5 / F18: decision legality, executability, and publication should converge on one kernel-owned microturn authority path rather than a split between microturn publication and a retained move-decision-sequence helper.
3. The boundary is cleaner than forcing the work into ticket 012 after reassessment because this ticket isolates the deeper kernel-authority rewrite from the public legacy-surface retirement.

## What to Change

### 1. Replace `move-decision-sequence.ts` as a shared authority

Design and implement the replacement authority path so that microturn publication/application and move-legality evaluation no longer depend on `resolveMoveDecisionSequence(...)` as a separate retained seam.

### 2. Migrate direct consumers

At minimum:

- `packages/engine/src/kernel/microturn/publish.ts`
- `packages/engine/src/kernel/microturn/apply.ts`
- `packages/engine/src/kernel/apply-move.ts`
- `packages/engine/src/kernel/move-legality-predicate.ts`
- any remaining direct kernel/test consumers of `resolveMoveDecisionSequence(...)`

### 3. Delete or narrow the old file truthfully

If the full authority replacement lands, delete `packages/engine/src/kernel/move-decision-sequence.ts`. If a smaller kernel-internal helper survives, narrow it to the smallest truthful non-public utility surface and update the active ticket text accordingly before completion.

## Files to Touch

- `packages/engine/src/kernel/move-decision-sequence.ts` (delete or heavily narrow)
- `packages/engine/src/kernel/microturn/publish.ts` (modify)
- `packages/engine/src/kernel/microturn/apply.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/move-legality-predicate.ts` (modify)
- adjacent kernel/tests required by the authority migration

## Out of Scope

- Public certificate/template-surface retirement already owned by ticket 012.
- FOUNDATIONS/doc updates — ticket 013.
- Test wave T1–T15 — ticket 014.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build`
2. `rg -n "resolveMoveDecisionSequence|classifyMoveDecisionSequenceSatisfiabilityForLegalMove" packages/engine/src` — zero hits or only the explicitly retained narrowed helper surface documented in the ticket outcome
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo build`
5. `pnpm turbo test --force`
6. `pnpm turbo lint`
7. `pnpm turbo typecheck`

### Invariants

1. Microturn publication/application and legality no longer depend on an undocumented retained pre-microturn authority seam.
2. Any surviving helper surface from the old file is the narrowest truthful kernel-internal utility and is documented explicitly in the ticket outcome.

## Test Plan

### New/Modified Tests

1. Update existing kernel tests that currently prove `resolveMoveDecisionSequence(...)` directly so they prove the new authority seam instead.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `rg -n "resolveMoveDecisionSequence|classifyMoveDecisionSequenceSatisfiabilityForLegalMove" packages/engine/src`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo build`
5. `pnpm turbo test --force`
6. `pnpm turbo lint`
7. `pnpm turbo typecheck`
