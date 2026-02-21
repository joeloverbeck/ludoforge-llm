# CONCPAR-003: Selective conceal runtime implementation

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel (effects-reveal.ts)
**Deps**: CONCPAR-001

## Problem

The `applyConceal` function (at `effects-reveal.ts:13-42`) performs blanket grant removal: it removes all reveal grants for a zone regardless of observer or filter. With the type additions from CONCPAR-001, the runtime must support selective conceal — removing only grants that match the specified `from` (observer) and/or `filter` criteria.

## Assumption Reassessment (2026-02-21)

1. **Current applyConceal logic**: Confirmed at `effects-reveal.ts:13-42`. It resolves the zone, checks if grants exist, then deletes the entire zone key from `reveals`. No per-grant filtering.
2. **RevealGrant shape**: Used in `effects-reveal.ts:50` — `grantsEqual` compares `observers` (PlayerId[] or 'all') and `filter` (via `filterKey`). These same fields will be used for selective matching.
3. **resolvePlayerSel**: Available via import from `resolve-selectors.js`. Already used in `applyReveal` at line 86. Can be reused for resolving `from` in conceal.
4. **Immutability**: Current code uses spread and destructuring for state updates. New logic must follow the same immutable pattern.
5. **No-op on empty grants**: Current behavior returns unchanged state if no grants exist for the zone. This must be preserved.

## Architecture Check

1. **Composable matching**: Selective conceal uses the same grant-matching primitives (`normalizeObservers`, `filterKey`) already in the file. This avoids duplicating matching logic.
2. **Game-agnostic**: The `from` field resolves via `resolvePlayerSel` (generic) and `filter` matching uses JSON key comparison (generic). No game-specific branches.
3. **Backwards compatible**: When neither `from` nor `filter` is specified on the conceal effect, the function falls through to the existing blanket-remove behavior.

## What to Change

### 1. Rewrite applyConceal in effects-reveal.ts

Replace the blanket zone-key removal with selective grant filtering:

**When `from` is specified:**
- Resolve `from` via `resolvePlayerSel` (or handle `'all'` literal)
- Only remove grants whose `observers` match the resolved players

**When `filter` is specified:**
- Only remove grants whose `filterKey` matches the effect's filter

**When both are specified:**
- Both conditions must match for a grant to be removed

**When neither is specified:**
- Blanket remove all grants for the zone (current behavior)

**Post-filter cleanup:**
- If remaining grants for the zone are empty, remove the zone key entirely
- If no reveals remain at all, remove the `reveals` key from state

## Files to Touch

- `packages/engine/src/kernel/effects-reveal.ts` (modify)

## Out of Scope

- Type/schema changes (CONCPAR-001)
- Compiler changes (CONCPAR-002)
- Trace emission (CONCPAR-004)
- Changes to `applyReveal`

## Acceptance Criteria

### Tests That Must Pass

1. Selective conceal by `from`: only grants matching the specified observer are removed
2. Selective conceal by `filter`: only grants matching the specified filter key are removed
3. Selective conceal by both `from` and `filter`: both must match for removal
4. Blanket conceal (no `from`, no `filter`): all grants for the zone are removed (existing behavior preserved)
5. No-op: conceal on a zone with no matching grants returns unchanged state
6. No-op: conceal on a zone with no grants at all returns unchanged state
7. Cleanup: zone key removed from reveals when last grant is removed
8. Cleanup: reveals key removed from state when last zone is emptied
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `applyConceal` never mutates state — always returns new objects
2. Zone-only conceal (no `from`/`filter`) behaves identically to pre-change
3. Grant matching uses the same normalization as `applyReveal` (sorted observer arrays)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-reveal.test.ts` — add selective conceal test block:
   - Conceal by observer (single player, multiple players, 'all')
   - Conceal by filter (matching key, non-matching key)
   - Conceal by both observer and filter
   - No-op when no grants match
   - Cleanup when all grants removed
   - Blanket conceal backwards compatibility

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "conceal"`
2. `pnpm turbo test && pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-02-21
- **What changed**:
  - Reworked `applyConceal` in `packages/engine/src/kernel/effects-reveal.ts` to support selective conceal matching by `from`, `filter`, or both.
  - Preserved blanket conceal behavior when neither `from` nor `filter` is authored.
  - Added observer matching normalization parity with reveal semantics (`'all'` canonicalization for full-player selection).
  - Added selective conceal coverage in `packages/engine/test/unit/effects-reveal.test.ts`.
- **Deviations from original plan**:
  - None in scope; implementation and tests aligned with the ticket plan.
- **Verification results**:
  - `pnpm -F @ludoforge/engine test -- --test-name-pattern "effects reveal|effects conceal|conceal"` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
