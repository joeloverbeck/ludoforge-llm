**Status**: ✅ COMPLETED

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

## Additional Production Fixes (discovered during implementation)

The integration tests revealed that `zoneIdSet` was not propagated through `buildEffectLoweringContext` and `buildConditionLoweringContext` in `compile-lowering.ts`. This meant `CNL_COMPILER_ZONE_ID_UNKNOWN` could never fire through the standard effect/condition lowering pipeline — the validation infrastructure from tickets 001–006 was silently inactive for effects and conditions. Additionally, `canonicalizeZoneSelector` checked runtime-resolved qualifiers (`active`, `actor`, `allOther`, etc.) against the static zone ID set, producing false positives.

**Fixes applied:**

| File | Change |
|------|--------|
| `packages/engine/src/cnl/compile-lowering.ts` | Propagate `zoneIdSet` in `buildEffectLoweringContext` and `buildConditionLoweringContext` |
| `packages/engine/src/cnl/compile-zones.ts` | Add `isStaticZoneQualifier` — only check `none` and numeric seat indices against `zoneIdSet`; skip runtime qualifiers |
| `packages/engine/test/integration/compile-pipeline.test.ts` | Update event-deck cross-ref test: `discrad:none` now caught earlier by `CNL_COMPILER_ZONE_ID_UNKNOWN` (effect lowering) instead of later by `CNL_XREF_EVENT_DECK_EFFECT_ZONE_MISSING` (cross-validation) |
| `packages/engine/test/unit/compiler-structured-results.test.ts` | Add missing `board:none` zone to eventDecks test fixture (latent bug exposed by active validation) |

## Out of Scope

- Unit tests for `canonicalizeZoneSelector` (ticket 007).
- Unit tests for `materializeZoneDefs` cross-references (ticket 008).
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

## Outcome

- **Completion date**: 2026-03-16
- **What changed**:
  - New test file: `packages/engine/test/integration/zone-id-cross-reference-validation.test.ts` (4 tests)
  - Bug fix: `compile-lowering.ts` — `buildEffectLoweringContext` and `buildConditionLoweringContext` now propagate `zoneIdSet` (was silently dropped, making effect/condition zone ID validation from tickets 001–006 inactive)
  - Bug fix: `compile-zones.ts` — added `isStaticZoneQualifier()` to skip runtime qualifiers (`active`, `actor`, `allOther`, etc.) during zone ID existence checks
  - Test update: `compile-pipeline.test.ts` — event-deck cross-ref test updated for earlier detection via `CNL_COMPILER_ZONE_ID_UNKNOWN`
  - Test fix: `compiler-structured-results.test.ts` — added missing `board:none` zone to eventDecks fixture (latent bug exposed by active validation)
- **Deviations**: Ticket originally scoped as "no production source changes." During implementation, discovered that `zoneIdSet` was not propagated through the lowering context builders, making `CNL_COMPILER_ZONE_ID_UNKNOWN` unreachable for effects and conditions. Fixed the two context builders and added `isStaticZoneQualifier` to prevent false positives on runtime qualifiers. Two existing tests updated to reflect the improved earlier detection.
- **Verification**: `pnpm turbo build && pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` — all green (4794/4794 tests pass).
