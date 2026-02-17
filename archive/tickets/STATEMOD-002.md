# STATEMOD-002: Implement `formatIdAsDisplayName` Utility

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: S
**Spec**: 37 — State Management & Render Model (D9)
**Deps**: None

## Objective

Implement the `formatIdAsDisplayName()` pure utility function that converts engine IDs (kebab-case, camelCase, snake_case, colon-separated) to human-readable Title Case display names.

The utility remains the sole display-name source until Spec 42 (visual config overrides), and must stay engine-agnostic with no per-game branches.

## Assumptions Reassessment (2026-02-17)

### Confirmed

- `packages/runner/src/` currently has no display-name utility implementation.
- `packages/runner/test/` currently has no utility tests for ID formatting.
- Spec 37 D9 requires a shared fallback formatter and explicitly references this utility.

### Corrected / Updated

- The runner currently has no `src/utils/` directory; this ticket must create it as part of implementation.
- Validation scope is expanded from typecheck-only to include runner tests and runner lint to satisfy hard verification requirements.
- Scope remains runner-only; no engine changes, no per-game schema changes, and no visual-config override behavior.

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
6. Preserve all-caps tokens (e.g., `ARVN`) as-is.

### 2. Write comprehensive unit tests

Cover all ID formats used in the engine.

## Acceptance Criteria

### Tests that must pass

- [x] `'train-us'` → `'Train Us'` (kebab-case)
- [x] `'activePlayer'` → `'Active Player'` (camelCase)
- [x] `'total_support'` → `'Total Support'` (snake_case)
- [x] `'hand:0'` → `'Hand 0'` (owner zone with player suffix)
- [x] `'hand:1'` → `'Hand 1'`
- [x] `'main'` → `'Main'` (single word)
- [x] `'ARVN'` → `'ARVN'` (all-caps acronym preserved)
- [x] `'nva-guerrilla'` → `'Nva Guerrilla'` (mixed)
- [x] `''` → `''` (empty string edge case)
- [x] `'0'` → `'0'` (numeric player ID)
- [x] `'table:none'` → `'Table None'` (colon separator)
- [x] `pnpm -F @ludoforge/runner test` passes
- [x] `pnpm -F @ludoforge/runner typecheck` passes
- [x] `pnpm -F @ludoforge/runner lint` passes

### Invariants

- Function is pure — no side effects, no external state
- Function never throws — returns a string for any input
- No engine source files modified
- No dependencies added beyond what's in the runner package

## Architecture Rationale

- Keep `formatIdAsDisplayName` as a small pure utility in `runner/src/utils` so RenderModel/store/UI layers can share one deterministic formatter.
- Avoid per-domain aliases or multiple formatter variants; one canonical function reduces drift and keeps Spec 42 override integration straightforward.

## Outcome

- Completed on: 2026-02-17
- What changed:
  - Added `packages/runner/src/utils/format-display-name.ts` with a pure, engine-agnostic `formatIdAsDisplayName(id: string)` implementation.
  - Added `packages/runner/test/utils/format-display-name.test.ts` with required acceptance tests plus additional edge-case coverage.
  - Updated this ticket assumptions/scope to match the current codebase and hard-verification requirements.
- Deviations from original plan:
  - Added extra tests beyond the initial acceptance list to lock invariants (multi-colon IDs and repeated separator normalization).
  - Expanded validation from typecheck-only to runner test + typecheck + lint.
- Verification:
  - `pnpm -F @ludoforge/runner test` passed (`43 passed`).
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
