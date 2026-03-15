# TUNLRESET-001: Reset tunnel status when bases are removed from map

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — YAML event/macro definitions, possibly kernel effect helpers
**Deps**: `data/games/fire-in-the-lake/41-events/033-064.md`, `data/games/fire-in-the-lake/41-events/065-096.md`, `data/games/fire-in-the-lake/20-macros.md`, `reports/fire-in-the-lake-rules-section-1.md`

## Problem

Rule 1.4.4 states: "When a Tunneled Base is removed, so is the Tunnel marker." Currently, when cards or operations move a tunneled base to Available (or other non-board zones), the `tunnel=tunneled` token property is preserved. If that base later re-enters play via Rally or an event, it would incorrectly retain its tunneled status.

Known affected cards:
- **Card 94 (Tunnel Rats)** — Branch B removes a tunneled base to Available without resetting tunnel property
- **Card 36 (Hamburger Hill)** — unshaded removes an insurgent base (possibly tunneled) to Available without resetting tunnel property
- **Card 2 (Kissinger)** — removes insurgent pieces from Cambodia/Laos to Available (bases could be tunneled)
- **Assault macros** (`20-macros.md`) — remove bases to Available after die roll succeeds against tunnel protection; the die-roll path resets tunnel on a 4-6 roll, but the base removal path does not explicitly reset it

Any other card or operation that moves a tunneled base off the map is potentially affected.

## Assumption Reassessment (2026-03-15)

1. `setTokenProp` with `prop: tunnel, value: untunneled` works correctly — confirmed by card-36 shaded and assault macros in `20-macros.md`
2. No engine-level auto-reset mechanism exists for token properties on zone transfer — confirmed by reviewing `effects-token.ts` (moveToken does not modify token props)
3. The `tunnel` property default for bases entering play is `untunneled` — confirmed by token definitions in `40-content-data-assets.md`. However, Rally and placement effects create new tokens from Available using the existing token object, so any stale `tunneled` property would carry over.

## Architecture Check

1. **Option A (local fix per card)**: Add `setTokenProp tunnel=untunneled` before each `moveToken` to Available in affected cards/macros. Simple and explicit, but fragile — future cards could omit it.
2. **Option B (engine-level auto-reset)**: Add a zone-transfer hook in `moveToken` that resets `tunnel` to `untunneled` when moving to non-board zones. Systematic but introduces game-specific logic into the agnostic kernel — violates the Agnostic Engine Rule.
3. **Option C (GameSpecDoc-level convention)**: Define a `tokenPropertyResets` section in the game spec that declares which properties reset on zone transfer to specific zone categories. The kernel applies this generically. Clean separation of concerns.

**Recommendation**: Option A for immediate correctness (this ticket), with Option C deferred to a future spec if the pattern recurs across more games.

This preserves the GameSpecDoc vs GameDef/runtime boundary — all fixes are in YAML game data, no kernel changes needed.

## What to Change

### 1. Card 94 (Tunnel Rats) — Branch B tunnel reset

Add `setTokenProp tunnel=untunneled` before `moveToken` in both Branch B code paths (both-branches-feasible and only-Branch-B-feasible).

### 2. Card 36 (Hamburger Hill) — unshaded base removal tunnel reset

Add `setTokenProp tunnel=untunneled` before `moveToken` in the base removal section.

### 3. Card 2 (Kissinger) — unshaded insurgent piece removal

Add `setTokenProp tunnel=untunneled` before `moveToken` in the forEach that removes insurgent pieces (only applies to bases, but harmless on non-base pieces since tunnel prop is ignored).

### 4. Assault macros — base removal path

Audit the assault macro base-removal paths in `20-macros.md`. Where a base is removed to Available after passing tunnel protection checks, ensure tunnel property is reset.

### 5. Full audit of moveToken-to-Available patterns

Grep for all `moveToken` effects that target `available-` zones and verify no tunneled bases can reach them without a tunnel reset.

## Files to Touch

- `data/games/fire-in-the-lake/41-events/065-096.md` (modify — card-94 Branch B)
- `data/games/fire-in-the-lake/41-events/033-064.md` (modify — card-36 unshaded)
- `data/games/fire-in-the-lake/41-events/001-032.md` (modify — card-2 unshaded)
- `data/games/fire-in-the-lake/20-macros.md` (modify — assault macro base removal)
- `packages/engine/test/integration/fitl-events-tunnel-rats.test.ts` (modify — add tunnel-reset assertions)
- `packages/engine/test/integration/fitl-events-tunnel-reset.test.ts` (new — cross-card tunnel reset regression tests)

## Out of Scope

- Engine-level auto-reset mechanism (Option B/C above — deferred to future spec)
- Token property reset for properties other than `tunnel`
- Non-FITL games (Texas Hold'em has no tunnel mechanic)

## Acceptance Criteria

### Tests That Must Pass

1. Card 94 Branch B: removed base has `tunnel=untunneled` in Available zone
2. Card 36 unshaded: removed base (if previously tunneled) has `tunnel=untunneled` in Available zone
3. Card 2 unshaded: removed insurgent base has `tunnel=untunneled` in Available zone
4. Assault macro: removed base has `tunnel=untunneled` in Available zone after successful tunnel roll
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No base in any Available zone should ever have `tunnel=tunneled`
2. Rule 1.4.4 compliance: tunnel marker removed whenever tunneled base is removed from map
3. No kernel/runtime changes — all fixes in YAML game data

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-tunnel-rats.test.ts` — add assertion that Branch B removed base has `tunnel=untunneled`
2. `packages/engine/test/integration/fitl-events-tunnel-reset.test.ts` — cross-card regression tests verifying tunnel property reset on base removal for cards 2, 36, 94, and assault macros

### Commands

1. `node --test packages/engine/dist/test/integration/fitl-events-tunnel-rats.test.js`
2. `node --test packages/engine/dist/test/integration/fitl-events-tunnel-reset.test.js`
3. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm -F @ludoforge/engine test`
