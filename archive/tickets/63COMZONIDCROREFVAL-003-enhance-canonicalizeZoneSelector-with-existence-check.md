# 63COMZONIDCROREFVAL-003 — Enhance `canonicalizeZoneSelector` With Zone ID Existence Check

## Summary

Add an optional `zoneIdSet` parameter to `canonicalizeZoneSelector`. After successful canonicalization, if the set is provided and the result is a static literal (not a `$binding`), verify the canonicalized zone ID exists in the set. Emit `CNL_COMPILER_ZONE_ID_UNKNOWN` if it doesn't.

## Prerequisites

- 63COMZONIDCROREFVAL-001 (diagnostic codes exist)

## File List

| File | Change |
|------|--------|
| `packages/engine/src/cnl/compile-zones.ts` | Add `zoneIdSet` param to `canonicalizeZoneSelector`; add existence check on success paths |

## Implementation Details

### Signature change

```typescript
export function canonicalizeZoneSelector(
  selector: unknown,
  ownershipByBase: Readonly<Record<string, ZoneOwnershipKind>>,
  path: string,
  seatIds?: readonly string[],
  zoneIdSet?: ReadonlySet<string>,  // NEW
): ZoneCompileResult<string | null>
```

### Existence check — qualified path (line ~237, the final success return)

After `const canonicalId = \`${zoneBase}:${normalizedQualifier.value}\``, before returning:

```typescript
if (zoneIdSet !== undefined && !canonicalId.startsWith('$') && !zoneIdSet.has(canonicalId)) {
  return {
    value: null,
    diagnostics: [{
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_ID_UNKNOWN,
      path,
      severity: 'error',
      message: `Zone "${canonicalId}" does not exist.`,
      suggestion: 'Check zone definitions for the correct zone ID.',
      alternatives: [...zoneIdSet].filter(id => id.startsWith(zoneBase + ':')).sort(),
    }],
  };
}
```

### Existence check — auto-qualified `owner: 'none'` path (line ~180)

The `${normalizedSelector}:none` auto-qualification also needs the check:

```typescript
const autoId = `${normalizedSelector}:none`;
if (zoneIdSet !== undefined && !zoneIdSet.has(autoId)) {
  return {
    value: null,
    diagnostics: [{
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_ID_UNKNOWN,
      path,
      severity: 'error',
      message: `Zone "${autoId}" does not exist.`,
      suggestion: 'Check zone definitions for the correct zone ID.',
      alternatives: [...zoneIdSet].filter(id => id.startsWith(normalizedSelector + ':')).sort(),
    }],
  };
}
```

### Skip conditions

- **Binding references** (`$space`): already short-circuited at line 173 before reaching the check.
- **Dynamic concat**: `tryStaticConcatResolution` returns `undefined` for dynamic parts, and the selector becomes non-string or binding — never hits the check.
- **`zoneIdSet` undefined**: check is skipped entirely (graceful degradation).
- **Qualifier is a binding** (e.g., `hand:$actor`): the canonicalized ID starts with a non-`$` base but the qualifier portion is `$actor` — the `canonicalId` will be `hand:$actor`. This contains `$` but doesn't *start* with it. Add a check: skip if qualifier starts with `$`.

More precisely, the skip condition should be: `canonicalId.includes('$')` rather than `canonicalId.startsWith('$')`, since `hand:$actor` has a dynamic qualifier.

## Out of Scope

- Wiring `zoneIdSet` from callers (tickets 005, 006) — this ticket only changes the function signature and internal logic.
- Zone definition cross-references (adjacency, reshuffle — ticket 004).
- Test files — tests are in ticket 007.

## Acceptance Criteria

### Tests That Must Pass
- `pnpm turbo typecheck` passes — new param is optional, all existing call sites remain valid.
- `pnpm turbo build` succeeds.
- All existing tests continue to pass (`pnpm turbo test`) — since no caller passes `zoneIdSet` yet, behavior is unchanged.

### Invariants
- When `zoneIdSet` is `undefined`, behavior is identical to before (no existence check).
- When `zoneIdSet` is provided and the ID exists, no diagnostic is emitted.
- When `zoneIdSet` is provided and the ID does NOT exist, `CNL_COMPILER_ZONE_ID_UNKNOWN` error is emitted with `alternatives` listing valid IDs for that base.
- Binding references (`$space`, `hand:$actor`) are never checked against the set.
- The function signature remains backwards-compatible (new param is optional and last).
