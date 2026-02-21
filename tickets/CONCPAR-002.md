# CONCPAR-002: Conceal compiler parity with reveal

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler (compile-effects, binder-surface-contract, validate-gamedef-behavior)
**Deps**: CONCPAR-001

## Problem

The compiler's `lowerConcealEffect` (at `compile-effects.ts:612-626`) only lowers the `zone` field, ignoring optional `from` and `filter` fields. This means game specs that use selective conceal syntax (e.g. `conceal: { zone: "hand:0", from: { chosen: playerVar }, filter: [...] }`) would silently drop the selective fields, compiling to a blanket conceal. The binder surface contract and behavioral validator also lack support for the new fields.

## Assumption Reassessment (2026-02-21)

1. **lowerConcealEffect**: Confirmed at `compile-effects.ts:612-626` — only lowers `source.zone`, returns `{ conceal: { zone } }`. No handling of `from` or `filter`.
2. **lowerRevealEffect**: Confirmed at `compile-effects.ts:562-610` — handles `zone`, `to` (via `lowerPlayerSelector`), and `filter` (via `lowerTokenFilterArray`). This is the mirror template for conceal.
3. **binder-surface-contract.ts**: Confirmed at lines 110-116 — conceal entry has `bindingTemplateReferencerPaths: NO_REFERENCER_PATHS` and `zoneSelectorReferencerPaths: [['zone']]`. Reveal at lines 103-109 has `bindingTemplateReferencerPaths: [['to', 'chosen']]`. Conceal needs `[['from', 'chosen']]`.
4. **validate-gamedef-behavior.ts**: Confirmed at lines 1246-1248 — conceal validation only checks `zone`. Reveal at lines 1235-1242 also validates `to` (PlayerSel) and `filter` (TokenFilterPredicate[]). Parity gap confirmed.
5. **Dep on CONCPAR-001**: The type/schema additions for `from` and `filter` on conceal must land first, otherwise the compiler would emit shapes that fail schema validation.

## Architecture Check

1. **Mirror pattern**: Conceal compiler follows the exact same lowering pattern as reveal, replacing `to` with `from`. This keeps the compiler symmetric and maintainable.
2. **Game-agnostic**: `lowerPlayerSelector` and `lowerTokenFilterArray` are generic compiler utilities — no game-specific logic introduced.
3. **No shims**: Existing conceal specs (zone-only) continue to compile identically since `from` and `filter` handling is conditional on their presence.

## What to Change

### 1. Rewrite lowerConcealEffect in compile-effects.ts

Mirror `lowerRevealEffect` structure:
- Lower `source.zone` (already done)
- If `source.from` is present and not `'all'`: call `lowerPlayerSelector`
- If `source.from === 'all'`: set `from = 'all'`
- If `source.filter` is present: validate it's an array, call `lowerTokenFilterArray`
- Return `{ conceal: { zone, ...(from ? { from } : {}), ...(filter ? { filter } : {}) } }`

### 2. Update binder-surface-contract.ts conceal entry

Change `bindingTemplateReferencerPaths` from `NO_REFERENCER_PATHS` to `[['from', 'chosen']]` to match the reveal pattern (which uses `[['to', 'chosen']]`).

### 3. Extend conceal validation in validate-gamedef-behavior.ts

After the existing `validateZoneRef` call for conceal:
- If `effect.conceal.from` exists and is not `'all'`: call `validatePlayerSelector`
- If `effect.conceal.filter` exists: call `validateTokenFilterPredicates`

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/cnl/binder-surface-contract.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)

## Out of Scope

- Type/schema changes (CONCPAR-001)
- Runtime selective conceal logic (CONCPAR-003)
- Trace emission (CONCPAR-004)
- New game spec YAML examples

## Acceptance Criteria

### Tests That Must Pass

1. Compiler test: conceal with `from: { chosen: "x" }` produces correct AST
2. Compiler test: conceal with `filter` array produces correct AST
3. Compiler test: conceal with zone-only (backwards compat) still works
4. Validator test: conceal with invalid `from` produces diagnostic
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Zone-only conceal specs compile identically to pre-change behavior
2. Binder surface contract for conceal includes `from.chosen` binding path
3. Behavioral validator catches invalid PlayerSel in `from` field

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` (or relevant compiler test file) — add conceal-with-from and conceal-with-filter compilation tests
2. `packages/engine/test/unit/validate-gamedef-behavior.test.ts` (or relevant validator test file) — add conceal validation for `from` and `filter` fields

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "conceal"`
2. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
