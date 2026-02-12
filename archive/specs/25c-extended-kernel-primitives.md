# Spec 25c: Extended Kernel Primitives

**Status**: IMPLEMENTED
**Priority**: P0
**Complexity**: S
**Dependencies**: Spec 25b (kernel decision sequence model)
**Source sections**: Brainstorming Sections 4.2, 7.4

## Overview

Six kernel primitive additions required by Spec 26 (Operations Full Effects):

1. **Integer division operator** (`'/'`) for `ValueExpr` arithmetic
2. **`tokenZone` reference** — resolves to zone ID containing a token
3. **`markerState` compiler support** — bug fix: runtime supported it but compiler didn't
4. **`zoneProp` reference** — access scalar properties of map spaces
5. **`zonePropIncludes` condition** — check if array property of a map space contains a value
6. **JSON Schema sync** — `schemas/GameDef.schema.json` updated with all additions

All additions are minimal, self-contained, with no impact on existing functionality.

## Task 25c.1: Integer Division Operator

### Files Modified

| File | Change |
|------|--------|
| `src/kernel/types.ts` | Add `'/'` to op union in ValueExpr |
| `src/kernel/eval-error.ts` | Add `DIVISION_BY_ZERO` error code and helper |
| `src/kernel/eval-value.ts` | Add division case with div-by-zero guard using `Math.trunc` |
| `src/cnl/compile-conditions.ts` | Add `'/'` to arithmetic op check |

### Semantics

- Floor-toward-zero: `7/2=3`, `-7/2=-3`, `0/5=0`, `6/3=2`
- Division by zero throws `DIVISION_BY_ZERO` error
- Result passes through existing `expectSafeInteger()` guard

## Task 25c.2: tokenZone Reference

### Files Modified

| File | Change |
|------|--------|
| `src/kernel/types.ts` | Add `tokenZone` arm to Reference union |
| `src/kernel/resolve-ref.ts` | Add tokenZone resolution (linear scan of zones) |
| `src/cnl/compile-conditions.ts` | Add `'tokenZone'` to SUPPORTED_REFERENCE_KINDS + lowering case |

### Semantics

- `{ ref: 'tokenZone', token: TokenSel }` resolves to zone ID string
- Uses binding-based token lookup, then linear scan of `state.zones`
- Throws MISSING_BINDING (not found), TYPE_MISMATCH (not a token), MISSING_VAR (not in any zone)

## Task 25c.3: markerState Compiler Support (Bug Fix)

### Files Modified

| File | Change |
|------|--------|
| `src/cnl/compile-conditions.ts` | Add `'markerState'` to SUPPORTED_REFERENCE_KINDS + lowering case |

### Details

Runtime (`resolve-ref.ts`) already supported `markerState`, but the compiler's
`SUPPORTED_REFERENCE_KINDS` array omitted it, blocking YAML compilation of
`{ ref: markerState }` references.

## Task 25c.4: zoneProp Reference

### Files Modified

| File | Change |
|------|--------|
| `src/kernel/types.ts` | Add `zoneProp` arm to Reference union |
| `src/kernel/eval-context.ts` | Add `mapSpaces?: readonly MapSpaceDef[]` to EvalContext |
| `src/kernel/eval-error.ts` | Add `ZONE_PROP_NOT_FOUND` error code and helper |
| `src/kernel/resolve-ref.ts` | Add zoneProp resolution from `ctx.mapSpaces` |
| `src/kernel/legal-moves.ts` | Add optional `mapSpaces` param to `makeEvalContext()` |
| `src/cnl/compile-conditions.ts` | Add `'zoneProp'` to SUPPORTED_REFERENCE_KINDS + lowering case |

### Semantics

- `{ ref: 'zoneProp', zone: ZoneSel, prop: string }` resolves scalar properties from MapSpaceDef
- Zone resolved via `resolveMapSpaceId()` — handles `$binding` references and literal IDs
- Throws ZONE_PROP_NOT_FOUND (zone/prop not found), TYPE_MISMATCH (array prop → use zonePropIncludes)
- `mapSpaces` threading: `EffectContext` already had it; `EvalContext` now also has it; `{ ...ctx }` spread propagates automatically

## Task 25c.5: zonePropIncludes Condition

### Files Modified

| File | Change |
|------|--------|
| `src/kernel/types.ts` | Add `zonePropIncludes` to ConditionAST union |
| `src/kernel/eval-condition.ts` | Add condition handler using `ctx.mapSpaces` |
| `src/kernel/validate-gamedef.ts` | Add validation case for zonePropIncludes |
| `src/cnl/compile-conditions.ts` | Add to SUPPORTED_CONDITION_OPS + lowering case |
| `test/unit/types-exhaustive.test.ts` | Add zonePropIncludes to exhaustive switch + increment variant count |

### Semantics

- `{ op: 'zonePropIncludes', zone: ZoneSel, prop: string, value: ValueExpr }` — checks if array property contains value
- Throws ZONE_PROP_NOT_FOUND (zone/prop not found), TYPE_MISMATCH (non-array prop → use zoneProp + comparison)
- Common use case: `terrainTags` array membership — `{ op: zonePropIncludes, zone: $space, prop: terrainTags, value: 'highland' }`

## Task 25c.6: JSON Schema Sync

### Files Modified

| File | Change |
|------|--------|
| `schemas/GameDef.schema.json` | Add `/` to ValueExpr op enum, `markerState`/`tokenZone`/`zoneProp` to reference oneOf, `zonePropIncludes` to conditionAST oneOf |

## Tests

| Test File | Coverage |
|-----------|----------|
| `test/unit/eval-value.test.ts` | Division: 7/2=3, -7/2=-3, 0/5=0, 6/3=2, 10/0 throws, division with aggregate |
| `test/unit/resolve-ref.test.ts` | tokenZone: in zone, missing binding, not-a-token, not-in-any-zone. zoneProp: scalar props, zone not found, prop not found, array prop throws |
| `test/unit/eval-condition.test.ts` | zonePropIncludes: terrainTags includes highland, doesn't include coastal, non-array throws, zone not found throws |
| `test/unit/compile-conditions.test.ts` | Division lowering, markerState lowering, tokenZone lowering, zoneProp lowering, zonePropIncludes lowering |

## Invariants

1. Division by zero always throws DIVISION_BY_ZERO (never NaN/Infinity/0)
2. Division result is always a safe integer (Math.trunc ensures this)
3. tokenZone returns exactly one zone ID or throws
4. zoneProp returns only scalar values; arrays throw TYPE_MISMATCH with guidance to use zonePropIncludes
5. zonePropIncludes requires array property; scalars throw TYPE_MISMATCH with guidance to use zoneProp + comparison
6. All existing tests pass (no regression)
7. JSON Schema matches TypeScript types exactly
8. No game-specific logic in kernel code

## Outcome

- **Completed**: 2026-02-12
- **All 6 tasks implemented** as specified, no deviations
- **Additional work**: `resolveMapSpaceId()` extracted to `resolve-selectors.ts` as shared helper (DRY); `validate-gamedef.ts` and `types-exhaustive.test.ts` updated for new `zonePropIncludes` variant
- **Spec 26 fix**: Corrected terrain checks (lines 555-556) from `zoneProp`/`spaceType` to `zonePropIncludes`/`terrainTags`
- **Verification**: 923 tests pass, build clean, lint clean
