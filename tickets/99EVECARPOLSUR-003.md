# 99EVECARPOLSUR-003: Add three active-card surface ref families and parsing

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — types-core.ts (family union), policy-surface.ts (ref parsing)
**Deps**: 99EVECARPOLSUR-001

## Problem

The surface ref system has no way to reference event card data. Three new ref families (`activeCardIdentity`, `activeCardTag`, `activeCardMetadata`) must be added to the family union type, and the ref parser must be extended to handle `activeCard.*` ref paths.

## Assumption Reassessment (2026-03-31)

1. `CompiledAgentPolicySurfaceRefFamily` at `types-core.ts:338-343` currently has: `globalVar`, `perPlayerVar`, `derivedMetric`, `victoryCurrentMargin`, `victoryCurrentRank` — confirmed.
2. `parseAuthoredPolicySurfaceRef` at `policy-surface.ts:25` parses authored ref strings into `CompiledAgentPolicySurfaceRefBase` — confirmed. Need to read its current parsing logic to understand the pattern.
3. Preview variants (`preview.activeCard.*`) are handled by `resolvePreviewRuntimeRef` in `compile-agents.ts:1614` which strips the `preview.` prefix — confirmed. No changes needed in the preview path for parsing.

## Architecture Check

1. Adding families to the existing union type follows the established pattern — no new ref kinds or switch cases in `resolveRef` needed. The family dispatch in `resolveSurface` (policy-runtime.ts) will handle them in ticket 005.
2. The `activeCard.*` prefix is unambiguous — no collision with existing `globalVar.*`, `perPlayerVar.*`, `derivedMetric.*`, or `victory.*` prefixes.
3. `activeCardTag` uses the tag name as the `id` field, `activeCardMetadata` uses the metadata key as `id` — consistent with how `globalVar` uses the var name as `id`.

## What to Change

### 1. Extend `CompiledAgentPolicySurfaceRefFamily` union

In `types-core.ts`, add three new members:

```typescript
export type CompiledAgentPolicySurfaceRefFamily =
  | 'globalVar'
  | 'perPlayerVar'
  | 'derivedMetric'
  | 'victoryCurrentMargin'
  | 'victoryCurrentRank'
  | 'activeCardIdentity'
  | 'activeCardTag'
  | 'activeCardMetadata';
```

### 2. Extend `parseAuthoredPolicySurfaceRef` in `policy-surface.ts`

Add parsing for `activeCard.*` ref paths:

| Authored ref path | Parsed family | Parsed id |
|-------------------|---------------|-----------|
| `activeCard.id` | `activeCardIdentity` | `'id'` |
| `activeCard.deckId` | `activeCardIdentity` | `'deckId'` |
| `activeCard.hasTag.<TAG>` | `activeCardTag` | `<TAG>` |
| `activeCard.metadata.<KEY>` | `activeCardMetadata` | `<KEY>` |

Follow the existing parsing pattern (string prefix matching and splitting). Return `null` or error for malformed paths like `activeCard.hasTag` (missing tag name) or `activeCard.metadata` (missing key).

### 3. Extend `getPolicySurfaceVisibility` in `policy-surface.ts`

Add cases for the three new families to look up visibility from the catalog (the catalog entries are added in ticket 004, but the lookup code should handle the new family names). The visibility lookup should return the flat entry from `catalog.activeCardIdentity`, `catalog.activeCardTag`, or `catalog.activeCardMetadata` respectively.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — extend family union)
- `packages/engine/src/agents/policy-surface.ts` (modify — extend parsing and visibility lookup)

## Out of Scope

- Visibility catalog type changes (ticket 004)
- Runtime resolution (ticket 005)
- FITL agent profile updates (ticket 006)
- Compile-time validation of tag/metadata key existence against the card metadata index

## Acceptance Criteria

### Tests That Must Pass

1. `parseAuthoredPolicySurfaceRef('activeCard.id')` returns `{ family: 'activeCardIdentity', id: 'id' }`.
2. `parseAuthoredPolicySurfaceRef('activeCard.deckId')` returns `{ family: 'activeCardIdentity', id: 'deckId' }`.
3. `parseAuthoredPolicySurfaceRef('activeCard.hasTag.pivotal')` returns `{ family: 'activeCardTag', id: 'pivotal' }`.
4. `parseAuthoredPolicySurfaceRef('activeCard.metadata.period')` returns `{ family: 'activeCardMetadata', id: 'period' }`.
5. Malformed paths like `activeCard.hasTag` (no tag) or `activeCard.unknown` return null/error.
6. Existing ref paths (`globalVar.*`, `perPlayerVar.*`, etc.) continue to parse correctly.
7. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. The three new families are valid members of `CompiledAgentPolicySurfaceRefFamily` — TypeScript enforces exhaustiveness.
2. Parsing is a pure string operation — no state dependency.
3. No selector is needed for active-card refs (the active card is global, not per-player).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-surface.test.ts` — add parsing tests for all `activeCard.*` ref paths including edge cases (malformed, missing segments).

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "parseAuthored"` (targeted)
2. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
