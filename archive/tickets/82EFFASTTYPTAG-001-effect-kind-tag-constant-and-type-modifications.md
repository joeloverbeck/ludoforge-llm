# 82EFFASTTYPTAG-001: Effect Kind Tag Constant and Type Modifications

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/types-ast.ts`
**Deps**: None (first ticket in series)

## Problem

`EffectAST` nodes lack a numeric discriminant tag, unlike `ValueExpr` which
has `_t`. All downstream tickets depend on `EFFECT_KIND_TAG`, `EffectKindTag`,
`WithKindTag<K>`, and the updated `EffectAST` / `EffectOfKind` types being
defined first.

## Assumption Reassessment (2026-03-25)

1. `EffectKindMap` is the 34-entry interface at `types-ast.ts:330-605` — each
   entry is `{ readonly [kindKey]: payload }`. Confirmed.
2. `EffectKind = keyof EffectKindMap` at line 607. Confirmed.
3. `EffectOfKind<K> = EffectKindMap[K]` at line 608. Confirmed.
4. `EffectAST = EffectKindMap[EffectKind]` at line 609. Confirmed.
5. `VALUE_EXPR_TAG` lives at lines 71-78 — this is the reference pattern.
   Confirmed.
6. No `_k` field or `EFFECT_KIND_TAG` constant exists today. Confirmed.

## Architecture Check

1. Adding a numeric tag constant + intersection type is the minimal
   foundation. No behavioral changes — purely type-level.
2. Agnostic: tags apply uniformly to all effect kinds for all games.
3. No backwards-compatibility shims. `_k` becomes a required field on
   `EffectAST`; downstream tickets update all construction sites.

## What to Change

### 1. Add `EFFECT_KIND_TAG` constant

Add the 34-entry numeric tag constant right after `VALUE_EXPR_TAG` in
`types-ast.ts`. Keys use camelCase matching `EffectKind` string values.
Values are contiguous 0..33.

```typescript
export const EFFECT_KIND_TAG = {
  setVar: 0,
  addVar: 1,
  setActivePlayer: 2,
  transferVar: 3,
  moveToken: 4,
  moveAll: 5,
  moveTokenAdjacent: 6,
  draw: 7,
  shuffle: 8,
  createToken: 9,
  destroyToken: 10,
  setTokenProp: 11,
  reveal: 12,
  conceal: 13,
  bindValue: 14,
  chooseOne: 15,
  chooseN: 16,
  setMarker: 17,
  shiftMarker: 18,
  setGlobalMarker: 19,
  flipGlobalMarker: 20,
  shiftGlobalMarker: 21,
  grantFreeOperation: 22,
  gotoPhaseExact: 23,
  advancePhase: 24,
  pushInterruptPhase: 25,
  popInterruptPhase: 26,
  rollRandom: 27,
  if: 28,
  forEach: 29,
  reduce: 30,
  removeByPriority: 31,
  let: 32,
  evaluateSubset: 33,
} as const;

export type EffectKindTag = typeof EFFECT_KIND_TAG[keyof typeof EFFECT_KIND_TAG];
```

### 2. Add `WithKindTag<K>` helper type

```typescript
type WithKindTag<K extends EffectKind> =
  EffectKindMap[K] & { readonly _k: typeof EFFECT_KIND_TAG[K] };
```

### 3. Update `EffectAST` and `EffectOfKind<K>`

```typescript
export type EffectAST = { [K in EffectKind]: WithKindTag<K> }[EffectKind];
export type EffectOfKind<K extends EffectKind> = WithKindTag<K>;
```

### 4. Add compile-time exhaustiveness check

```typescript
const _effectTagExhaustive: Record<EffectKind, number> = EFFECT_KIND_TAG;
```

## Files to Touch

- `packages/engine/src/kernel/types-ast.ts` (modify)

## Out of Scope

- `makeEffect()` builder factory (ticket 002)
- `tagEffectAsts()` structural tagger (ticket 002)
- `effectKindOf()` changes (ticket 003)
- Dispatch table changes (ticket 003)
- Compiler migration (ticket 004)
- Schema changes (ticket 005)
- Test fixture migration (ticket 006)
- CI exhaustiveness/contiguity tests (ticket 007)
- Any behavioral changes to effect execution
- Changes to `ValueExpr` or `_t` tagging

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine build` compiles without errors (type-level
   additions only — existing code will have type errors until downstream
   tickets complete, but the types themselves must be valid).
2. The compile-time `_effectTagExhaustive` check ensures every `EffectKind`
   key has a corresponding `EFFECT_KIND_TAG` entry.

### Invariants

1. `EFFECT_KIND_TAG` keys are exactly the set of `EffectKind` keys (enforced
   by `_effectTagExhaustive`).
2. Tag values are contiguous integers starting from 0 (verified by ticket 007
   CI test; structural guarantee here via literal values).
3. No behavioral changes to any runtime code.
4. `EffectKindMap` interface entries remain unchanged — `_k` is injected via
   intersection at the union level.

## Test Plan

### New/Modified Tests

1. No new test files in this ticket. The compile-time `satisfies` check is
   the primary validation. Runtime CI tests are in ticket 007.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm turbo typecheck`

### Note on Build Breakage

This ticket intentionally changes the `EffectAST` type to require `_k`.
This will cause type errors at every construction site that doesn't include
`_k`. Those errors are resolved by tickets 002-006. During development,
tickets 001-006 should be implemented as a single branch or the branch
should not be expected to build cleanly until ticket 004 completes.

## Outcome

- **Completed**: 2026-03-25
- **What changed**: Added `EFFECT_KIND_TAG` (34-entry, 0..33), `EffectKindTag` type, `WithKindTag<K>` helper, updated `EffectAST` and `EffectOfKind<K>` to require `_k`, and added compile-time exhaustiveness check — all in `packages/engine/src/kernel/types-ast.ts`.
- **Deviations**: None. Implemented exactly as specified.
- **Verification**: `types-ast.ts` compiles cleanly. All build errors are downstream construction sites missing `_k`, as expected per the ticket's build breakage note.
