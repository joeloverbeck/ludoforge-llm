# STATEMOD-002: Implement `formatIdAsDisplayName` Utility

**Status**: PENDING
**Priority**: HIGH
**Effort**: S
**Spec**: 37 — State Management & Render Model (D9)
**Deps**: None

## Objective

Implement the `formatIdAsDisplayName()` pure utility function that converts engine IDs (kebab-case, camelCase, snake_case, colon-separated) to human-readable Title Case display names. This is the sole source of display names until Spec 42 (visual config) adds overrides.

## Files to Touch

- `packages/runner/src/utils/format-display-name.ts` — **new file**: `formatIdAsDisplayName` implementation
- `packages/runner/test/utils/format-display-name.test.ts` — **new file**: unit tests

## Out of Scope

- Spec 42 visual config overrides
- Localization / i18n
- Any other runner modules
- Any engine changes

## What to Do

### 1. Implement `formatIdAsDisplayName`

```typescript
// packages/runner/src/utils/format-display-name.ts

/**
 * Convert engine IDs to human-readable display names.
 * - kebab-case: 'train-us' → 'Train Us'
 * - camelCase: 'activePlayer' → 'Active Player'
 * - snake_case: 'total_support' → 'Total Support'
 * - Numeric suffixes with colon: 'hand:0' → 'Hand 0'
 * - Plain numbers: '0' → '0' (player IDs, left as-is)
 */
export function formatIdAsDisplayName(id: string): string
```

Algorithm:
1. Split on `:` — treat the part after the last colon as a suffix (e.g., `hand:0` → base `hand`, suffix `0`).
2. For the base part, split on `-`, `_`, or camelCase word boundaries.
3. Capitalize the first letter of each word.
4. Join with spaces.
5. Append the suffix (if any) separated by a space.

### 2. Write comprehensive unit tests

Cover all ID formats used in the engine.

## Acceptance Criteria

### Tests that must pass

- [ ] `'train-us'` → `'Train Us'` (kebab-case)
- [ ] `'activePlayer'` → `'Active Player'` (camelCase)
- [ ] `'total_support'` → `'Total Support'` (snake_case)
- [ ] `'hand:0'` → `'Hand 0'` (owner zone with player suffix)
- [ ] `'hand:1'` → `'Hand 1'`
- [ ] `'main'` → `'Main'` (single word)
- [ ] `'ARVN'` → `'ARVN'` (all-caps acronym preserved)
- [ ] `'nva-guerrilla'` → `'Nva Guerrilla'` (mixed)
- [ ] `''` → `''` (empty string edge case)
- [ ] `'0'` → `'0'` (numeric player ID)
- [ ] `'table:none'` → `'Table None'` (colon separator)
- [ ] `pnpm -F @ludoforge/runner typecheck` passes

### Invariants

- Function is pure — no side effects, no external state
- Function never throws — returns a string for any input
- No engine source files modified
- No dependencies added beyond what's in the runner package
