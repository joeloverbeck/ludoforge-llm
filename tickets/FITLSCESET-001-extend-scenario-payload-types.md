# FITLSCESET-001: Extend Scenario Payload Types

**Status**: Pending
**Priority**: P0
**Depends on**: None
**Blocks**: FITLSCESET-002, FITLSCESET-003, FITLSCESET-004, FITLSCESET-005, FITLSCESET-006

## Summary

Add TypeScript interfaces for the extended scenario payload to `src/kernel/types.ts`. These types will be used by the schema (FITLSCESET-002), validator (FITLSCESET-003), and the scenario data assets (FITLSCESET-004 through FITLSCESET-006).

## Detailed Description

Currently `DataAssetKind` includes `'scenario'` (line 488 of `types.ts`) but there is no typed `ScenarioPayload` interface. The compiler and validator treat scenario payloads as untyped `Record<string, unknown>`.

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

## Files to Touch

| File | Change |
|------|--------|
| `src/kernel/types.ts` | Add `ScenarioPayload`, `ScenarioPiecePlacement`, `ScenarioDeckComposition` interfaces; export them |

## Out of Scope

- Zod schemas (FITLSCESET-002)
- Validation logic (FITLSCESET-003)
- Scenario data assets in `data/games/fire-in-the-lake.md`
- Compiler changes in `src/cnl/compiler.ts`
- Any test files
- Any changes to existing interfaces or types

## Acceptance Criteria

### Tests That Must Pass

- `npm run typecheck` passes with zero errors
- `npm test` — all existing tests continue to pass (no regressions)
- The new types are exported and importable from `src/kernel/types.ts`

### Invariants That Must Remain True

- All existing type exports unchanged
- `DataAssetKind` union unchanged
- No runtime behavior changes (types only)
- All fields use `readonly` modifier
- `leaderStack` is on `ScenarioPayload`, NOT inside `ScenarioDeckComposition`
