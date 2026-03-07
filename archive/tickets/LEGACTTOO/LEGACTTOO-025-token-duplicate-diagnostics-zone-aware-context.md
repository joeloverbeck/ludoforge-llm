# LEGACTTOO-025: Token Duplicate Diagnostics — Zone-Aware Context

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — effect runtime diagnostics quality for token occurrence violations
**Deps**: archive/tickets/LEGACTTOO/LEGACTTOO-020-canonical-token-state-index-for-kernel-lookups.md

## Problem

Token occurrence validation now uses canonical token-state index data, but duplicate-id runtime errors still report generic "multiple zones" wording even when duplicates occur inside a single zone. This weakens diagnostic clarity and slows debugging.

## Assumption Reassessment (2026-03-07)

1. Effect token operations now consume canonical token-state index occurrence metadata. **Confirmed in `packages/engine/src/kernel/effects-token.ts`.**
2. Duplicate detection currently checks `occurrenceCount > 1` and reports "Token appears in multiple zones" regardless of actual distribution. **Confirmed in `packages/engine/src/kernel/effects-token.ts`.**
3. Duplicate diagnostics are emitted in three runtime paths: `moveToken`, `destroyToken`, and `setTokenProp`. **Confirmed in `packages/engine/src/kernel/effects-token.ts`.**
4. Existing tests currently assert only generic "multiple zones" wording for duplicate cases (cross-zone and same-zone) and do not assert diagnostic detail shape for same-zone duplicates. **Confirmed in `packages/engine/test/unit/effects-token-move-draw.test.ts` and `packages/engine/test/unit/effects-lifecycle.test.ts`.**

## Architecture Check

1. Zone-aware diagnostics are cleaner and more robust than generic messages because runtime contract violations become actionable.
2. This change remains game-agnostic and concerns only kernel error semantics.
3. No backwards compatibility/shims: diagnostics become stricter and more precise.

## What to Change

### 1. Make duplicate-id diagnostics zone-aware

- Add one shared helper in `effects-token.ts` that builds duplicate-id runtime errors for all token effect paths.
- If duplicate IDs span multiple zones, keep multi-zone wording and include deterministic zone list.
- If duplicates exist only within one zone, emit single-zone duplicate wording with zone id and occurrence count.

### 2. Strengthen tests for diagnostic specificity

- Add/adjust effect tests to assert differentiated diagnostics for:
  - same-zone duplicates
  - cross-zone duplicates
- Ensure parity across every token effect path that enforces duplicate-id invariants (`moveToken`, `destroyToken`, `setTokenProp`).

## Files to Touch

- `packages/engine/src/kernel/effects-token.ts` (modify)
- `packages/engine/test/unit/effects-token-move-draw.test.ts` (modify)
- `packages/engine/test/unit/effects-lifecycle.test.ts` (modify)

## Out of Scope

- Token-selection semantics changes
- Query contract changes
- Game data / GameSpecDoc content changes

## Acceptance Criteria

### Tests That Must Pass

1. Same-zone duplicate IDs produce zone-specific duplicate diagnostics.
2. Cross-zone duplicate IDs produce multi-zone diagnostics with deterministic zone list.
3. Duplicate diagnostics remain consistent across `moveToken`, `destroyToken`, and `setTokenProp`.
4. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Duplicate-id runtime detection remains centralized and game-agnostic.
2. Diagnostic payloads stay deterministic and structurally stable.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-token-move-draw.test.ts` — assert same-zone vs cross-zone duplicate diagnostic differentiation.
2. `packages/engine/test/unit/effects-lifecycle.test.ts` — add/adjust duplicate diagnostic assertions for `destroyToken` and `setTokenProp` parity.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/effects-token-move-draw.test.js`
3. `node --test packages/engine/dist/test/unit/effects-lifecycle.test.js`
4. `pnpm -F @ludoforge/engine test:unit`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-07
- What changed:
  - Added a shared duplicate-occurrence runtime diagnostic helper in `packages/engine/src/kernel/effects-token.ts` used by `moveToken`, `destroyToken`, and `setTokenProp`.
  - Duplicate diagnostics are now distribution-aware:
    - single-zone duplicates emit zone-specific wording with `zoneId` and `occurrenceCount`
    - cross-zone duplicates retain multi-zone wording with deterministic sorted `zones`
  - Strengthened tests in:
    - `packages/engine/test/unit/effects-token-move-draw.test.ts`
    - `packages/engine/test/unit/effects-lifecycle.test.ts`
  - Added parity assertions for duplicate diagnostics in `setTokenProp`, which was previously untested for this invariant.
- Deviations from original plan:
  - Expanded explicit coverage to include `setTokenProp` duplicate diagnostics as a first-class parity target (architecturally required because it shares the same duplicate-occurrence invariant).
  - Normalized duplicate zone lists via set semantics before branching diagnostic wording, because same-zone duplicates currently surface repeated zone ids from occurrence metadata.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed
  - `node --test packages/engine/dist/test/unit/effects-token-move-draw.test.js` passed
  - `node --test packages/engine/dist/test/unit/effects-lifecycle.test.js` passed
  - `pnpm -F @ludoforge/engine test:unit` passed
  - `pnpm -F @ludoforge/engine lint` passed
