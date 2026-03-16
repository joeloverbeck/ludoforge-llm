# 63COMZONIDCROREFVAL-001 — Add Zone ID Cross-Reference Diagnostic Codes

## Summary

Add three new diagnostic codes to `compiler-diagnostic-codes.ts` for zone ID existence validation: one for unknown fully-qualified zone IDs in selectors, one for unknown adjacency targets, and one for unknown reshuffle source zones.

## Motivation

These codes are the foundation for all subsequent tickets. They must exist before any validation logic can emit them.

## File List

| File | Change |
|------|--------|
| `packages/engine/src/cnl/compiler-diagnostic-codes.ts` | Add 3 new codes to `COMPILER_DIAGNOSTIC_CODES_ZONES` |

## Implementation Details

Add to `COMPILER_DIAGNOSTIC_CODES_ZONES` (inside the `Object.freeze({...})` block, alphabetically sorted with existing entries):

```typescript
CNL_COMPILER_ZONE_ADJACENCY_TARGET_UNKNOWN: 'CNL_COMPILER_ZONE_ADJACENCY_TARGET_UNKNOWN',
CNL_COMPILER_ZONE_BEHAVIOR_RESHUFFLE_TARGET_UNKNOWN: 'CNL_COMPILER_ZONE_BEHAVIOR_RESHUFFLE_TARGET_UNKNOWN',
CNL_COMPILER_ZONE_ID_UNKNOWN: 'CNL_COMPILER_ZONE_ID_UNKNOWN',
```

These are semantically distinct from `CNL_COMPILER_ZONE_SELECTOR_UNKNOWN_BASE` (base doesn't exist) — here the base exists but the fully-qualified ID doesn't.

## Out of Scope

- Any validation logic — that belongs in tickets 003, 004.
- Changes to any other file.
- New helper/builder functions for these codes.

## Acceptance Criteria

### Tests That Must Pass
- `pnpm turbo typecheck` passes (the new codes are reachable via `CNL_COMPILER_DIAGNOSTIC_CODES`).
- `pnpm turbo build` succeeds.
- All existing tests continue to pass (`pnpm turbo test`).

### Invariants
- `CNL_COMPILER_DIAGNOSTIC_CODES` frozen object now includes the 3 new keys.
- `CnlCompilerDiagnosticCode` union type includes the 3 new string literal types.
- No existing diagnostic codes are renamed or removed.
- No other files are modified.
