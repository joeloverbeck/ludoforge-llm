# 62BINCCHOPRO-002: Create shared prioritized tier-admissibility helper

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module + unit tests
**Deps**: archive/tickets/KERQUERY/62CONPIESOU-001-prioritized-query-ast-and-recursive-infrastructure.md, archive/tickets/62CONPIESOU-004.md, specs/62b-incremental-choice-protocol.md

## Problem

Tier-admissibility logic for `prioritized` queries must be shared between discovery-time legality and apply-time validation. Without one shared helper, those sites will drift and the engine will advertise options it later rejects, or reject options it previously advertised.

The original ticket got several codebase facts wrong, which made the proposed API too tightly coupled to nonexistent types and to an oversimplified model of how `qualifierKey` behaves.

## Assumption Reassessment (2026-03-14)

1. `prioritized` already exists in the AST and runtime. `evalQuery` handles it by flattening tiers in order and deliberately does not attach tier metadata to results. Confirmed in [eval-query.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/eval-query.ts).
2. `ChoicePendingRequest` already includes engine-owned `selected` and `canConfirm` for `chooseN`. This was not introduced by this ticket. Confirmed in [types-core.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/types-core.ts) and covered in existing tests.
3. No shared tier-admissibility helper exists today. `effects-choice.ts` and `legal-choices.ts` still lack tier-aware `prioritized` enforcement. Confirmed.
4. There is no `PrioritizedTier` type in the kernel. The original proposed helper signature referenced a type that does not exist. Confirmed by repository search.
5. `qualifierKey` is authored query data, validated as a token-prop name. By the time choice domains are normalized for `chooseN`, callers typically hold move-param scalars, not rich query-result objects. That means the helper cannot derive qualifier values from the AST alone; callers must pass evaluated tier snapshots that already carry any needed qualifier values. Confirmed in [validate-queries.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/validate-queries.ts) and [move-param-normalization.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/move-param-normalization.ts).
6. With qualifier-aware prioritization, there is not always a single active tier. Different qualifiers can unlock from different tiers at the same time. So a return shape like `{ tierIndex: number }` is architecturally wrong for the general case.

## Architecture Check

1. The helper should stay at the choice-legality layer, not in `evalQuery`, and it must not introduce hidden metadata on query results.
2. The clean input is evaluated tier snapshots, not the `prioritized` AST itself. Callers that understand the AST and runtime state should translate it into a generic helper input.
3. The helper should be generic over move-param scalars plus optional qualifier values. It must not know about FITL, specific token types, or engine state shape.
4. The helper should report all currently active tiers, not pretend there is always exactly one.
5. This ticket is a foundation ticket only. It should create the reusable helper and test it thoroughly, but it should not wire `effects-choice.ts` or `legal-choices.ts` yet. That integration belongs in ticket 62BINCCHOPRO-003.

## Corrected Scope

### 1. Create a generic helper over evaluated tier snapshots

New file at `packages/engine/src/kernel/prioritized-tier-legality.ts`.

Export:

```ts
interface PrioritizedTierEntry {
  readonly value: MoveParamScalar;
  readonly qualifier?: string | number | boolean;
}

interface PrioritizedTierAdmissibility {
  readonly admissibleValues: readonly MoveParamScalar[];
  readonly activeTierIndices: readonly number[];
}

function computeTierAdmissibility(
  tiers: readonly (readonly PrioritizedTierEntry[])[],
  alreadySelected: readonly MoveParamScalar[],
  qualifierMode: 'none' | 'byQualifier',
): PrioritizedTierAdmissibility;
```

Semantics:

- `qualifierMode: 'none'`
  - only the first non-exhausted tier contributes admissible values
- `qualifierMode: 'byQualifier'`
  - each qualifier becomes admissible from the first tier where that qualifier still has an unselected value
  - different qualifiers may therefore unlock from different tiers at the same time
- `activeTierIndices` reports every tier that currently contributes admissible values

### 2. Add focused helper tests

New file at `packages/engine/test/unit/kernel/prioritized-tier-legality.test.ts`.

The tests should prove the helper contract directly, without prematurely coupling them to `effects-choice.ts` or `legal-choices.ts`.

## Files to Touch

- `tickets/62BINCCHOPRO-002.md` (modify)
- `packages/engine/src/kernel/prioritized-tier-legality.ts` (new)
- `packages/engine/test/unit/kernel/prioritized-tier-legality.test.ts` (new)

## Out of Scope

- Wiring the helper into `effects-choice.ts` or `legal-choices.ts` (ticket 62BINCCHOPRO-003)
- `advanceChooseN` (ticket 62BINCCHOPRO-004)
- Runner/store/UI changes
- `evalQuery` changes or tier metadata on query results
- Card 87 re-authoring (ticket 62BINCCHOPRO-008)

## Acceptance Criteria

### Tests That Must Pass

1. Without qualifier mode, the helper returns only the first non-exhausted tier's remaining values
2. Without qualifier mode, lower tiers become admissible only after all higher-tier values are selected
3. With qualifier mode, qualifiers are independent and may unlock from different tiers simultaneously
4. With qualifier mode, once all higher-tier values for qualifier `Q` are selected, lower-tier values for `Q` become admissible
5. With qualifier mode, all values in the active tier for a qualifier remain admissible together
6. Fully exhausted tiers return an empty admissible set and no active tiers
7. `pnpm turbo build --filter=@ludoforge/engine` succeeds
8. Relevant engine tests pass with no regressions

### Invariants

1. The helper is pure and deterministic
2. The helper does not depend on FITL-specific identifiers or engine state shape
3. The helper does not depend on `evalQuery` metadata or mutate query results
4. The helper can represent multiple active tiers when qualifier-aware prioritization is in use

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/prioritized-tier-legality.test.ts` — direct helper coverage for qualifier-free and qualifier-aware admissibility

### Commands

1. `pnpm turbo build --filter=@ludoforge/engine`
2. `pnpm turbo lint --filter=@ludoforge/engine`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-14
- What actually changed:
  - Rewrote the ticket so its assumptions match the current codebase and Spec 62b.
  - Added [prioritized-tier-legality.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/prioritized-tier-legality.ts) as a pure helper over evaluated tier snapshots.
  - Added [prioritized-tier-legality.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/prioritized-tier-legality.test.ts) covering qualifier-free and qualifier-aware admissibility, including multi-tier activation.
- Deviations from original plan:
  - Did not use a nonexistent `PrioritizedTier` type.
  - Did not return a single `tierIndex`; the implemented helper returns `activeTierIndices` because qualifier-aware prioritization can activate multiple tiers simultaneously.
  - Kept wiring into `effects-choice.ts` and `legal-choices.ts` out of scope for the follow-up integration ticket.
- Verification results:
  - `pnpm turbo build --filter=@ludoforge/engine`
  - `pnpm turbo lint --filter=@ludoforge/engine`
  - `pnpm -F @ludoforge/engine test -- prioritized-tier-legality.test.ts`
  - `pnpm -F @ludoforge/engine test`
