# FITLOPEFULEFF-033: Explicit Scenario Selection

**Status**: ✅ COMPLETED  
**Priority**: P1  
**Estimated effort**: Medium (4-6 hours)  
**Spec reference**: Spec 26 architecture hardening follow-up  
**Depends on**: FITLOPEFULEFF-032 (archived/completed)

## Summary

Remove implicit positional scenario selection (`first scenario wins`) and require explicit, deterministic scenario selection.

Target behavior:
- If multiple scenario assets exist, selection must be explicit via canonical configuration.
- Ambiguity becomes an error (not warning).
- Single-scenario documents remain valid without additional configuration.

No backwards compatibility fallback to positional selection.

## Reassessed Assumptions (2026-02-14)

1. Current code still uses `first scenario wins` in `src/cnl/compile-data-assets.ts` with a warning diagnostic (`CNL_COMPILER_DATA_ASSET_SCENARIO_AMBIGUOUS`).
2. There is currently no canonical selector field in `GameSpecDoc` for choosing a scenario by ID.
3. `doc.metadata` is forwarded into `GameDef.metadata` during compile; adding a selector there requires explicit compile-time stripping so runtime `GameDef` metadata stays schema-valid.
4. Existing tests do not cover ambiguous multi-scenario selection behavior at all.
5. `test/unit/data-assets.test.ts` mainly validates envelope loading/validation and is not the best location for scenario-selection compiler behavior.

## Updated Scope

- Introduce a canonical scenario selector in `GameSpecDoc` metadata (compile-time only), with validator support.
- Enforce explicit selector when more than one scenario asset exists.
- Keep single-scenario behavior unchanged (no selector required).
- Preserve deterministic asset resolution and diagnostics.
- Ensure runtime `GameDef.metadata` does not carry compile-only selector keys.

## Files to Touch

- `src/cnl/game-spec-doc.ts`
- `src/cnl/validate-spec-shared.ts`
- `src/cnl/validate-metadata.ts`
- `src/cnl/compile-data-assets.ts`
- `src/cnl/compiler-core.ts`
- `test/integration/compile-pipeline.test.ts`
- `test/unit/validate-spec.test.ts`

## Out of Scope

- Marker semantics validation (ticket 032)
- Query primitive redesign (ticket 034)
- Runtime scenario switching APIs

## Acceptance Criteria

### Tests That Must Pass
1. Multiple scenarios without explicit selection fail compilation with deterministic diagnostics.
2. Explicitly selected scenario compiles deterministically.
3. Single-scenario docs compile as before.
4. Existing compile-pipeline tests updated to canonical explicit behavior.
5. Metadata validator accepts selector key and rejects invalid selector shape.

### Invariants
- Deterministic compile behavior independent of data-asset ordering.
- No implicit fallback scenario selection behavior retained.
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
- Lint passes (`npm run lint`)
- Tests pass (`npm test`)

## Outcome

- Completion date: February 14, 2026
- What changed:
  - Added compile-time canonical selector support via `metadata.defaultScenarioAssetId`.
  - Replaced implicit `first scenario wins` fallback with hard-error ambiguity behavior when multiple scenarios are present without an explicit selector.
  - Added hard error for unknown `metadata.defaultScenarioAssetId` references.
  - Kept single-scenario behavior unchanged (no selector required).
  - Ensured compile-only selector is not emitted into runtime `GameDef.metadata`.
  - Added integration and unit coverage for ambiguity, explicit selection, and selector validation.
  - Updated production FITL spec to explicitly set `defaultScenarioAssetId` so existing integration suites compile under the new invariant.
- Deviations from original plan:
  - In addition to engine/compiler/test files, updated `data/games/fire-in-the-lake.md` to align shared production fixtures with the no-fallback architecture.
- Verification results:
  - `npm run build` passed.
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm test` passed.
