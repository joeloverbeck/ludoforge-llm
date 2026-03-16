# 63COMZONIDCROREFVAL-009 — Integration Tests Against Production Specs

## Summary

Add integration tests that compile the production FITL and Texas Hold'em specs and verify zero new diagnostics are emitted. These serve as regression gates — if the new validation produces false positives on known-correct specs, these tests catch it.

## Prerequisites

- All previous tickets (001–006) — the validation is fully active.

## File List

| File | Change |
|------|--------|
| `packages/engine/test/integration/zone-id-cross-reference-validation.test.ts` | New test file |

## Implementation Details

### Test 1: Production FITL spec compiles without zone ID diagnostics

```typescript
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
```

- Compile the FITL production spec via `compileProductionSpec()`.
- Filter the returned diagnostics for codes: `CNL_COMPILER_ZONE_ID_UNKNOWN`, `CNL_COMPILER_ZONE_ADJACENCY_TARGET_UNKNOWN`, `CNL_COMPILER_ZONE_BEHAVIOR_RESHUFFLE_TARGET_UNKNOWN`.
- Assert: zero diagnostics with any of these codes.

### Test 2: Production Texas Hold'em spec compiles without zone ID diagnostics

- Same pattern as Test 1, but compile the Texas Hold'em production spec.
- Assert: zero diagnostics with any of the three new codes.

### Test 3: Minimal spec with deliberate zone ID typo fails compilation

- Construct a minimal `GameSpecDoc` with:
  - One zone: `deck` (owner: none)
  - A setup effect that references `decks:none` (typo — should be `deck:none`)
- Compile via `compileGameSpecToGameDef`.
- Assert: at least one diagnostic with code `CNL_COMPILER_ZONE_ID_UNKNOWN`.

### Test 4: Minimal spec with correct zone ID passes

- Same minimal spec but with correct `deck:none` reference.
- Assert: zero diagnostics with code `CNL_COMPILER_ZONE_ID_UNKNOWN`.

### Test helper usage

Use `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts` for FITL/Texas Hold'em. Do NOT create separate fixture files for these games (per CLAUDE.md testing requirements).

For the minimal spec tests, construct inline `GameSpecDoc` objects following existing test patterns.

## Out of Scope

- Unit tests for `canonicalizeZoneSelector` (ticket 007).
- Unit tests for `materializeZoneDefs` cross-references (ticket 008).
- Changes to production source files.
- Changes to production game specs (`data/games/`).

## Acceptance Criteria

### Tests That Must Pass
- All new tests pass: `pnpm -F @ludoforge/engine test:e2e` or `pnpm -F @ludoforge/engine test`
- All existing tests continue to pass.
- Final gate: `pnpm turbo build && pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` all green.

### Invariants
- Production FITL spec emits zero new zone ID diagnostics.
- Production Texas Hold'em spec emits zero new zone ID diagnostics.
- A deliberate zone ID typo in a minimal spec is caught at compile time.
- No changes to production game data files.
- Tests use the `node --test` runner (engine integration tests).
