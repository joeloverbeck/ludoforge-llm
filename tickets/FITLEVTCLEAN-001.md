# FITLEVTCLEAN-001: Standardize moveToken `to` field format across event decks

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — data file only
**Deps**: None

## Problem

The `moveToken` effect's `to` field uses two different formats for static zone references across `41-content-event-decks.md`:

- **Bare string**: `to: out-of-play-US:none` (e.g., Gulf of Tonkin shaded line 769, Kissinger shaded line 888)
- **Wrapped**: `to: { zoneExpr: available-NVA:none }` (e.g., card-55 lines 1875, 1896)

Both compile identically, but the inconsistency makes it harder to grep for patterns and introduces ambiguity about which form is canonical for `moveToken`.

Note: `moveAll` legitimately uses bare strings (`from`/`to` are always static), so this ticket only targets `moveToken`.

## Assumption Reassessment (2026-02-27)

1. The compiler accepts both bare-string and `{ zoneExpr: ... }` for `moveToken.to` — confirmed by 2748 passing tests including both forms.
2. Dynamic zone references (bindings, concat expressions) already use `{ zoneExpr: ... }` — only static zones vary.
3. No mismatch with active specs; this is a data-file-only cleanup.

## Architecture Check

1. Standardizing on `{ zoneExpr: ... }` for all `moveToken.to` fields makes the format self-documenting: `zoneExpr` signals "this is a zone expression" regardless of whether it's static or dynamic. Bare strings for `moveAll` remain acceptable since `moveAll` never uses dynamic zones.
2. Change is entirely within `GameSpecDoc` YAML — no engine/kernel/compiler changes.
3. No backwards-compatibility shims; old bare-string form simply gets replaced.

## What to Change

### 1. Standardize all `moveToken.to` bare strings to `{ zoneExpr: ... }` form

Search `41-content-event-decks.md` for `moveToken` effects where `to:` is a bare string (not wrapped in `zoneExpr`). Replace each with the `{ zoneExpr: <zone> }` form.

Known instances:
- Kissinger shaded (line ~888): `to: out-of-play-US:none` → `to: { zoneExpr: out-of-play-US:none }`

Scan the full file for any others added after this ticket was written.

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` (modify)

## Out of Scope

- `moveAll` effects (bare strings are appropriate there since both fields are always static)
- Engine/compiler changes (both forms already compile correctly)
- Other game data files (Texas Hold'em, etc.)

## Acceptance Criteria

### Tests That Must Pass

1. All existing event card compilation tests continue to pass unchanged (no test modifications needed — compiled output is identical)
2. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Every `moveToken.to` field in `41-content-event-decks.md` uses `{ zoneExpr: ... }` form
2. Compiled GameDef JSON output is byte-identical before and after the change

## Test Plan

### New/Modified Tests

1. No new tests — this is a format-only change with identical compilation output.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`
