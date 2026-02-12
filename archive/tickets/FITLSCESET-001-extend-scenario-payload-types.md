# FITLSCESET-001: Extend Scenario Payload Types

**Status**: ✅ COMPLETED
**Priority**: P0
**Depends on**: None
**Blocks**: FITLSCESET-002, FITLSCESET-003, FITLSCESET-004, FITLSCESET-005, FITLSCESET-006

## Summary

Add TypeScript interfaces for the extended scenario payload to `src/kernel/types.ts`. These types will be used by the schema (FITLSCESET-002), validator (FITLSCESET-003), and the scenario data assets (FITLSCESET-004 through FITLSCESET-006).

## Detailed Description

Currently `DataAssetKind` includes `'scenario'` in `src/kernel/types.ts`, but there is no typed `ScenarioPayload` interface. The compiler and validator currently treat scenario payloads as object records and pull fields dynamically from `payload.mapAssetId` / `payload.pieceCatalogAssetId` rather than using a shared scenario payload contract.

Add the following interfaces to `src/kernel/types.ts`:

1. **`ScenarioPayload`** — top-level scenario shape:
   - `mapAssetId: string`
   - `pieceCatalogAssetId: string`
   - `eventCardSetAssetId?: string`
   - `scenarioName: string`
   - `yearRange: string`
   - `initialPlacements?: readonly ScenarioPiecePlacement[]`
   - `initialTrackValues?: readonly { readonly trackId: string; readonly value: number }[]`
   - `initialMarkers?: readonly { readonly spaceId: string; readonly markerId: string; readonly state: string }[]`
   - `outOfPlay?: readonly { readonly pieceTypeId: string; readonly faction: string; readonly count: number }[]`
   - `deckComposition?: ScenarioDeckComposition`
   - `startingLeader?: string`
   - `leaderStack?: readonly string[]`
   - `startingCapabilities?: readonly { readonly capabilityId: string; readonly side: 'unshaded' | 'shaded' }[]`
   - `startingEligibility?: readonly { readonly faction: string; readonly eligible: boolean }[]`
   - `usPolicy?: 'jfk' | 'lbj' | 'nixon'`

2. **`ScenarioPiecePlacement`**:
   - `spaceId: string`
   - `pieceTypeId: string`
   - `faction: string`
   - `count: number`
   - `status?: Record<string, string>` (e.g. `{ tunnel: 'tunneled' }`)

3. **`ScenarioDeckComposition`**:
   - `pileCount: number`
   - `eventsPerPile: number`
   - `coupsPerPile: number`
   - `includedCardIds?: readonly string[]`
   - `excludedCardIds?: readonly string[]`

All interfaces must use `readonly` on every field, consistent with the codebase immutability convention.

## Assumptions Reassessed

- Confirmed: no `ScenarioPayload`, `ScenarioPiecePlacement`, or `ScenarioDeckComposition` interfaces currently exist in `src/kernel/types.ts`.
- Confirmed: scenario payload handling in `src/cnl/compiler.ts` and `src/cnl/validate-spec.ts` is currently object-based and not yet bound to a shared typed payload contract.
- Adjustment: although this ticket is type-only and does not require runtime behavior changes, a minimal compile-time test is needed to lock in export availability and key shape guarantees for follow-on tickets.

## Scope (Revised)

- Add `ScenarioPayload`, `ScenarioPiecePlacement`, and `ScenarioDeckComposition` interfaces to `src/kernel/types.ts`.
- Keep `DataAssetKind` and runtime behavior unchanged.
- Add a minimal type-focused unit test that verifies the new interfaces are exported and enforce expected readonly/shape constraints at compile time.

## Files to Touch

| File | Change |
|------|--------|
| `src/kernel/types.ts` | Add `ScenarioPayload`, `ScenarioPiecePlacement`, `ScenarioDeckComposition` interfaces; export them |
| `test/unit/types-exhaustive.test.ts` (or equivalent type-focused unit test) | Add compile-time checks that import and exercise the new scenario payload interfaces |

## Out of Scope

- Zod schemas (FITLSCESET-002)
- Validation logic (FITLSCESET-003)
- Scenario data assets in `data/games/fire-in-the-lake.md`
- Compiler changes in `src/cnl/compiler.ts`
- Any changes to existing interfaces or types

## Acceptance Criteria

### Tests That Must Pass

- `npm run typecheck` passes with zero errors
- `npm run test:unit -- --coverage=false` passes with zero failures
- `npm test` — all existing tests continue to pass (no regressions)
- The new types are exported and importable from `src/kernel/types.ts`

### Invariants That Must Remain True

- All existing type exports unchanged
- `DataAssetKind` union unchanged
- No runtime behavior changes (types only)
- All fields use `readonly` modifier
- `leaderStack` is on `ScenarioPayload`, NOT inside `ScenarioDeckComposition`

## Outcome

- Completed on 2026-02-12.
- What changed:
  - Added `ScenarioPayload`, `ScenarioPiecePlacement`, and `ScenarioDeckComposition` interfaces in `src/kernel/types.ts` with readonly field contracts.
  - Added compile-time shape/export coverage in `test/unit/types-exhaustive.test.ts` for scenario payload types, including guards for readonly fields and `leaderStack` placement.
- Deviation from original plan:
  - Original ticket listed test files as out of scope; revised scope added a minimal type-focused test to lock contract expectations for downstream tickets.
- Verification:
  - `npm run typecheck`
  - `npm run test:unit -- --coverage=false`
  - `npm test`
