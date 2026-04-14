# 128FULSCODRA-003: Convert effect handler files to use widened draft scope

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel marker/reveal effect handlers plus focused test helper coverage
**Deps**: `archive/tickets/128FULSCODRA-002.md`

## Problem

After ticket 002 established a single draft scope inside `applyMoveCore`, some shared effect handlers still leave tracker-backed execution on ad hoc local mutation paths instead of consistently using the COW helpers added in ticket 001. However, the same handlers are also called from immutable discovery/setup/preflight contexts that legitimately run with `tracker: undefined`. This ticket cleans up the tracker-backed fast path in the owned effect-handler slice without breaking shared immutable callers.

## Assumption Reassessment (2026-04-14)

1. `effects-markers.ts` still has tracker-backed global marker writes that bypass `ensureGlobalMarkersCloned`, and immutable fallback spreads that are still needed for shared no-tracker callers. Confirmed.
2. `effects-reveal.ts` still has tracker-backed reveal writes that bypass `ensureRevealsCloned`, and immutable fallback spreads that are still needed for shared no-tracker callers. Confirmed.
3. `effects-token.ts` still has spread sites, but the remaining ones are the shared immutable fallback path behind `writeZoneMutations(...)` and other non-tracker branches. No tracker-backed COW gap requiring conversion was verified here for this ticket.
4. `effects-var.ts` already uses `writeScopedVarsMutable(...)` for tracker-backed writes. The remaining spread site is the immutable no-tracker fallback in `applySetActivePlayer`. Confirmed.
5. `scoped-var-runtime-access.ts` is the immutable shared helper backing `writeScopedVarsToState(...)`; its spread-based implementation remains required for no-tracker callers. Confirmed.
6. Shared effect handlers are still executed without a tracker in `legal-choices.ts`, `initial-state.ts`, and `free-operation-viability.ts`, so “every handler asserts tracker presence” would be architecturally wrong under the live repo contract. Confirmed.

## Architecture Check

1. Foundation 11 permits scoped internal mutation inside a private execution boundary, but it does not require all shared effect execution surfaces to mutate. The clean boundary is: `applyMoveCore` and its nested execution path use tracker-backed COW helpers; discovery/setup/preflight callers may remain immutable.
2. No game-specific logic — these are generic effect handlers operating on GameState structure and shared runtime helper boundaries.
3. No backwards-compatibility shims — this ticket preserves the existing dual-mode contract intentionally where both modes are still live, and removes only the tracker-path inconsistencies inside the owned effect handlers.

## What to Change

### 1. effects-markers.ts — make tracker-backed global marker writes use COW helpers

Keep the immutable fallback branches for no-tracker callers. In the tracker-backed branches of `applySetGlobalMarker`, `applyShiftGlobalMarker`, and `applyFlipGlobalMarker`, use `ensureGlobalMarkersCloned(...)` before mutation instead of mutating `globalMarkers` through ad hoc local casts.

### 2. effects-reveal.ts — make tracker-backed reveal writes use COW helpers

Keep the immutable fallback branches for no-tracker callers. In the tracker-backed branches of `applyReveal` and `applyConceal`, use `ensureRevealsCloned(...)` before mutating `reveals`, and preserve the existing omission behavior when the reveal map becomes empty.

### 3. Test helpers and focused regression coverage

Update effect-context test helpers as needed so unit tests can explicitly exercise tracker-backed execution contexts. Add or update focused tests proving that:
- tracker-backed marker/reveal handlers clone the targeted nested branch once and do not mutate the original input state
- immutable no-tracker callers still behave the same way they do today

## Files to Touch

- `packages/engine/src/kernel/effects-markers.ts` (modify)
- `packages/engine/src/kernel/effects-reveal.ts` (modify)
- `packages/engine/test/helpers/effect-context-test-helpers.ts` (modify if needed for explicit tracker coverage)
- `packages/engine/test/unit/effects-reveal.test.ts` (modify)
- `packages/engine/test/unit/kernel/zobrist-incremental-markers.test.ts` (modify or extend for tracker-backed global marker coverage)

## Out of Scope

- Converting immutable fallback branches used by shared no-tracker callers
- Converting spread sites in turn flow files (ticket 004)
- Converting spread sites in lifecycle files (ticket 005)
- Modifying `applyMoveCore` plumbing or adding tracker to non-owned execution contexts

## Acceptance Criteria

### Tests That Must Pass

1. All existing marker/reveal effect tests pass with identical behavior for no-tracker callers
2. Tracker-backed marker/reveal handlers use the COW helpers and do not mutate the original input state
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Foundation 8 (Determinism): same inputs produce identical outputs
2. Foundation 11 (Immutability — external contract): tracker-backed execution mutates only cloned nested branches; immutable no-tracker callers remain supported
3. COW helpers are called before any nested mutation in the tracker-backed marker/reveal paths — no aliased writes

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-reveal.test.ts` — verify tracker-backed reveal/conceal paths clone `reveals` safely and preserve no-tracker behavior
2. `packages/engine/test/unit/kernel/zobrist-incremental-markers.test.ts` — verify tracker-backed global marker paths clone `globalMarkers` safely while preserving incremental hash behavior
3. `packages/engine/test/helpers/effect-context-test-helpers.ts` — support explicit tracker injection for focused effect-handler tests if needed

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/effects-reveal.test.js dist/test/unit/kernel/zobrist-incremental-markers.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

**Completed**: 2026-04-14

1. The active ticket boundary was corrected during reassessment: shared effect handlers do not universally run under `applyMoveCore`, so immutable no-tracker callers were preserved rather than forcing tracker assertions across the whole handler family.
2. `effects-markers.ts` now routes tracker-backed global marker writes through `ensureGlobalMarkersCloned(...)` before mutation in `applySetGlobalMarker`, `applyShiftGlobalMarker`, and `applyFlipGlobalMarker`.
3. `effects-reveal.ts` now routes tracker-backed reveal writes through `ensureRevealsCloned(...)`, including the conceal path that clears the reveal map back to `undefined`.
4. Focused regression coverage now exercises explicit tracker-backed execution contexts through the test helper and verifies the original pre-draft input state remains unchanged while the cloned nested branch is mutated.
5. `effects-token.ts`, `effects-var.ts`, and `scoped-var-runtime-access.ts` required no code change after reassessment because their remaining spread sites are still the shared immutable fallback or helper authority for no-tracker callers.
6. Schema/artifact fallout checked: no schema, spec, or generated-artifact updates were required for this ticket.

### Verification

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/effects-reveal.test.js dist/test/unit/kernel/zobrist-incremental-markers.test.js`
3. `pnpm -F @ludoforge/engine test`
