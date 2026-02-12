# Spec 25c: Extended Kernel Primitives

**Status**: Draft
**Priority**: P0
**Complexity**: S
**Dependencies**: Spec 25b (kernel decision sequence model)
**Estimated effort**: 0.5-1 day
**Source sections**: Brainstorming Sections 4.2, 7.4

## Overview

Add two small but critical kernel primitives required by Spec 26 (Operations Full Effects):

1. **Integer division operator** (`'/'`) for `ValueExpr` arithmetic — needed by Attack damage (`floor(guerrillas / 2)`) and Sweep activation ratio (`floor(cubes / 2)`)
2. **`tokenZone` reference** for `Reference` union — resolves to the zone ID containing a specified token, needed by March, Patrol, and Sweep for dynamic source zone lookups

Both are minimal, self-contained additions with no impact on existing functionality.

## Task 25c.1: Integer Division Operator

### Motivation

Attack computes damage as `floor(activeGuerrillaCount / 2)`. Sweep computes activation limit as `floor(cubeCount / 2)` in Highland/Jungle terrain. The kernel currently supports `+`, `-`, `*` but not `/`. Without division, these formulas cannot be expressed in the DSL.

### Semantics

- **Floor-division** (truncate toward zero): `7 / 2 = 3`, `-7 / 2 = -3`
- Matches JavaScript `Math.trunc(a / b)` behavior
- Division by zero throws `EvalRuntimeError` with descriptive message and context

### Type Change

```typescript
// src/kernel/types.ts — ValueExpr arithmetic arm
// BEFORE:
{ readonly op: '+' | '-' | '*'; readonly left: ValueExpr; readonly right: ValueExpr }

// AFTER:
{ readonly op: '+' | '-' | '*' | '/'; readonly left: ValueExpr; readonly right: ValueExpr }
```

### Implementation Change

```typescript
// src/kernel/eval-value.ts — arithmetic evaluation (line ~102)
// BEFORE:
const result = expr.op === '+' ? left + right
  : expr.op === '-' ? left - right
  : left * right;

// AFTER:
if (expr.op === '/' && right === 0) {
  throw evalRuntimeError('Division by zero', { expr, left, right });
}
const result = expr.op === '+' ? left + right
  : expr.op === '-' ? left - right
  : expr.op === '*' ? left * right
  : Math.trunc(left / right);
```

### Files Modified

| File | Change |
|------|--------|
| `src/kernel/types.ts` | Add `'/'` to op union in ValueExpr |
| `src/kernel/eval-value.ts` | Add division case with div-by-zero guard |

### Tests

- `7 / 2 = 3` (floor toward zero)
- `-7 / 2 = -3` (truncate, not floor)
- `0 / 5 = 0`
- `6 / 3 = 2` (exact division)
- `10 / 0` throws `EvalRuntimeError`
- `{ op: '/', left: { aggregate: { op: count, ... } }, right: 2 }` — division with aggregate sub-expression

## Task 25c.2: tokenZone Reference

### Motivation

March moves tokens from adjacent zones into a destination. The `moveToken` effect needs `from: <source zone>`. When iterating over tokens selected from `tokensInAdjacentZones`, we need to know which zone each token currently occupies. Similarly, Patrol and Sweep move cubes from adjacent spaces.

### Semantics

`{ ref: 'tokenZone', token: TokenSel }` resolves to the `ZoneId` (string) of the zone containing the specified token.

- **Token lookup**: Linear scan through `state.zones` entries, checking token ID match. O(zones * tokens), acceptable for FITL (~60 zones, ~230 tokens).
- **Token not found**: Throw `EvalRuntimeError` — the token binding must reference a valid token currently in some zone.
- **Token in multiple zones**: Throw `EvalRuntimeError` — state corruption, should never happen with proper immutable state management.

### Type Change

```typescript
// src/kernel/types.ts — Reference union
// ADD new arm:
| { readonly ref: 'tokenZone'; readonly token: TokenSel }
```

Full Reference type after change:

```typescript
export type Reference =
  | { readonly ref: 'gvar'; readonly var: string }
  | { readonly ref: 'pvar'; readonly player: PlayerSel; readonly var: string }
  | { readonly ref: 'zoneCount'; readonly zone: ZoneSel }
  | { readonly ref: 'tokenProp'; readonly token: TokenSel; readonly prop: string }
  | { readonly ref: 'binding'; readonly name: string }
  | { readonly ref: 'markerState'; readonly space: ZoneSel; readonly marker: string }
  | { readonly ref: 'tokenZone'; readonly token: TokenSel };
```

### Implementation Change

```typescript
// src/kernel/resolve-ref.ts — add new case before the final 'binding' fallthrough
if (ref.ref === 'tokenZone') {
  const tokenBinding = ctx.bindings[ref.token];
  if (tokenBinding === undefined) {
    throw missingBindingError(`Token binding not found: ${ref.token}`, {
      reference: ref,
      binding: ref.token,
      availableBindings: Object.keys(ctx.bindings).sort(),
    });
  }
  if (!isTokenBinding(tokenBinding)) {
    throw typeMismatchError(`Token binding ${ref.token} must resolve to a Token`, {
      reference: ref,
      binding: ref.token,
      actualType: typeof tokenBinding,
      value: tokenBinding,
    });
  }

  const tokenId = tokenBinding.id;
  let foundZone: string | null = null;

  for (const [zoneId, tokens] of Object.entries(ctx.state.zones)) {
    for (const t of tokens) {
      if (t.id === tokenId) {
        if (foundZone !== null) {
          throw typeMismatchError(
            `Token ${tokenId} found in multiple zones (state corruption)`,
            { reference: ref, zones: [foundZone, zoneId], tokenId }
          );
        }
        foundZone = zoneId;
      }
    }
  }

  if (foundZone === null) {
    throw missingVarError(`Token ${tokenId} not found in any zone`, {
      reference: ref,
      tokenId,
      availableZoneIds: Object.keys(ctx.state.zones).sort(),
    });
  }

  return foundZone;
}
```

### Compiler Support

The compiler (`src/cnl/compile-conditions.ts` or equivalent) must recognize `{ ref: tokenZone, token: $binding }` in YAML and lower it to the correct `Reference` AST node. This follows the same pattern as existing reference compilation for `gvar`, `pvar`, `zoneCount`, `tokenProp`, `binding`, and `markerState`.

### Files Modified

| File | Change |
|------|--------|
| `src/kernel/types.ts` | Add `tokenZone` arm to Reference union |
| `src/kernel/resolve-ref.ts` | Add tokenZone resolution (linear scan) |
| `src/cnl/compile-conditions.ts` | Add tokenZone lowering (follow existing ref patterns) |

### Tests

**Unit tests (resolve-ref)**:
- Token in zone A → returns `'A'`
- Token not found → throws with descriptive error
- Token in two zones → throws state corruption error
- Token binding is not a Token object → throws type mismatch

**Integration tests**:
- March: select token from `tokensInAdjacentZones`, use `{ ref: tokenZone, token: $piece }` as `moveToken.from`
- Attack damage formula using division + tokenZone compiles and evaluates correctly

**Compiler tests**:
- YAML `{ ref: tokenZone, token: $piece }` compiles to correct Reference AST node

## Invariants

1. Division by zero always throws (never returns NaN, Infinity, or 0)
2. Division result is always a safe integer (Math.trunc ensures this for safe integer inputs)
3. `tokenZone` always returns a string zone ID or throws
4. A token can exist in exactly one zone at any time — finding it in multiple zones indicates state corruption
5. All existing tests continue to pass (no regression)
6. The `'/'` operator composes correctly with other arithmetic and aggregate sub-expressions

## Acceptance Criteria

- [ ] `{ op: '/' }` in ValueExpr type-checks and evaluates correctly
- [ ] Division uses floor-toward-zero semantics (Math.trunc)
- [ ] Division by zero throws EvalRuntimeError
- [ ] `{ ref: 'tokenZone' }` in Reference type-checks and resolves correctly
- [ ] tokenZone linear scan finds the correct zone
- [ ] tokenZone throws on token not found
- [ ] tokenZone throws on token in multiple zones (state corruption)
- [ ] Compiler lowers YAML `{ ref: tokenZone }` to correct AST
- [ ] All existing tests pass (no regression)
- [ ] Build passes (`npm run build`)
- [ ] Typecheck passes (`npm run typecheck`)

## Files to Create/Modify

```
src/kernel/types.ts           # MODIFY — add '/' to op union, add tokenZone to Reference
src/kernel/eval-value.ts      # MODIFY — add division case with div-by-zero guard
src/kernel/resolve-ref.ts     # MODIFY — add tokenZone resolution case
src/cnl/compile-conditions.ts # MODIFY — add tokenZone lowering
test/unit/eval-value.test.ts  # MODIFY — add division tests
test/unit/resolve-ref.test.ts # MODIFY — add tokenZone tests
test/integration/fitl-march-tokenzone.test.ts  # NEW — March + tokenZone integration
```
