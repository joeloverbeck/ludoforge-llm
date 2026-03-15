# 63CHOOPEROPT-007: Extract ChooseNTemplate from effects-choice.ts

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — effects-choice.ts, new choose-n-session.ts
**Deps**: 63CHOOPEROPT-001

## Problem

The worker-local session (Phase B) needs a `ChooseNTemplate` — the selection-invariant data required to recompute a chooseN pending state without rerunning the full discovery pipeline. This data is currently interleaved in the chooseN effect handler.

## Assumption Reassessment (2026-03-15)

1. `buildChooseNPendingChoice()` in `effects-choice.ts` receives all the data needed: normalizedOptions, selectedSequence, prioritizedTierEntries, qualifierMode, cardinality bounds, name, targetKinds, decisionKey.
2. The `LegalChoicesPreparedContext` (adjacency graph, runtime table index, seat resolution) is selection-invariant.
3. Some data is selection-dependent (tier admissibility, confirmability, legality resolution) and must NOT be in the template.

## Architecture Check

1. The template is a read-only data structure capturing everything needed to rebuild a pending chooseN request given a new selection.
2. Template extraction is a pure refactor — no behavioral change.
3. Template eligibility check ensures only safe chooseN decisions are sessionized.

## What to Change

### 1. Define `ChooseNTemplate` type in `choose-n-session.ts`

```typescript
interface ChooseNTemplate {
  readonly decisionKey: DecisionKey;
  readonly name: string;
  readonly normalizedDomain: readonly MoveParamValue[];
  readonly domainIndex: ReadonlyMap<string, number>;  // stable option ordering
  readonly cardinalityBounds: { min: number; max: number };
  readonly targetKinds: readonly string[] | null;
  readonly prioritizedTierEntries: readonly (readonly PrioritizedTierEntry[])[] | null;
  readonly qualifierMode: 'none' | 'byQualifier';
  readonly preparedContext: LegalChoicesPreparedContext;
  readonly partialMoveIdentity: { actionId: string; params: Record<string, unknown> };
  // Any other selection-invariant metadata from buildChooseNPendingChoice
}
```

### 2. Extract template creation from effects-choice.ts

Add a `createChooseNTemplate()` function that captures the invariant data during the initial chooseN pending request construction. This runs once per chooseN decision, not per toggle.

### 3. Add `rebuildPendingFromTemplate()` function

Given a `ChooseNTemplate` and a `selectedSequence`, rebuild the `ChoicePendingChooseNRequest` without rerunning the discovery pipeline:
- Recompute tier admissibility from template tier entries + new selection
- Recompute canConfirm from template cardinality bounds + new selection size
- Recompute per-option legality (static filtering only; probing is separate)

### 4. Template eligibility check

A chooseN is session-eligible when:
- Its base domain is selection-invariant
- Only selected membership, tier admissibility, confirmability, and legality resolution are selection-dependent
- The extraction logic can prove eligibility (conservative: fail-closed)

## Files to Touch

- `packages/engine/src/kernel/choose-n-session.ts` (new)
- `packages/engine/src/kernel/effects-choice.ts` (modify — extract template creation)

## Out of Scope

- `ChooseNSession` lifecycle (63CHOOPEROPT-008)
- Canonical selection keys / bitset caches (63CHOOPEROPT-008)
- Worker integration (63CHOOPEROPT-009)
- Probe/legality caches (63CHOOPEROPT-008)
- UI changes

## Acceptance Criteria

### Tests That Must Pass

1. New test: `createChooseNTemplate()` captures all selection-invariant data from a known chooseN fixture
2. New test: `rebuildPendingFromTemplate(template, [])` matches the initial `buildChooseNPendingChoice()` output for empty selection
3. New test: `rebuildPendingFromTemplate(template, [A, B])` matches `buildChooseNPendingChoice()` output for the same selection (parity check)
4. New test: template eligibility — standard chooseN passes; hypothetical non-standard case is rejected
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `ChooseNTemplate` is immutable (all `readonly` fields).
2. Template creation does NOT change the behavior of `buildChooseNPendingChoice()` — it's a parallel extraction, not a replacement.
3. `rebuildPendingFromTemplate()` produces identical results to `buildChooseNPendingChoice()` for any given selection.
4. Template eligibility is conservative — false negatives are safe, false positives are bugs.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choose-n-session.test.ts` — template creation, rebuild parity, eligibility checks
2. Modify `packages/engine/test/unit/kernel/effects-choice.test.ts` — verify extraction doesn't change existing behavior

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
