# DIAGFITL-003: Set allowWhenHiddenSampling to true for FITL victory preview surfaces

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — game-spec data only
**Deps**: None

## Problem

FITL's observability config (`data/games/fire-in-the-lake/93-observability.md`) sets `allowWhenHiddenSampling: false` for victory preview surfaces (`victory.currentMargin` and `victory.currentRank`). Combined with the whole-state `requiresHiddenSampling` flag (always `true` in FITL because the deck has hidden token order), this blocks ALL preview access to victory surfaces.

As a result, the `projectedSelfMargin` candidate feature always falls back to the coalesce default for the existing FITL baseline profiles that already reference `preview.victory.currentMargin.self`. That removes projected-margin differentiation across candidates even though the authored policy surface is supposed to support it.

Evidence from the fixed-seed FITL policy traces: `previewUsage.refIds` includes `victoryCurrentMargin.currentMargin.self`, but `unknownRefs` reports `{ reason: 'hidden' }` and the outcome breakdown counts those preview evaluations as `unknownHidden`.

This is a **workaround** — the architectural root cause (whole-state `requiresHiddenSampling`) is addressed by Spec 108. This ticket unblocks the preview system immediately.

## Assumption Reassessment (2026-04-02)

1. `93-observability.md:21`: `allowWhenHiddenSampling: false` for `victory.currentMargin` — confirmed
2. `93-observability.md:26`: `allowWhenHiddenSampling: false` for `victory.currentRank` — confirmed
3. FITL baseline profiles (`us-baseline`, `arvn-baseline`, `nva-baseline`, `vc-baseline`) already use `projectedSelfMargin`, which references `preview.victory.currentMargin.self` — confirmed in `92-agents.md`
4. Victory margin computation does NOT depend on hidden information (deck order) — it reads zone token counts and global vars, all public — confirmed by reading terminal condition definitions
5. `policy-preview.ts:146-148`: the hidden-sampling check returns `hidden` when `allowWhenHiddenSampling: false` — confirmed

## Architecture Check

1. Setting `allowWhenHiddenSampling: true` is semantically correct for victory surfaces — their computation doesn't read hidden-zone data
2. This is a game-spec config change, not an engine workaround — the config field was designed for exactly this purpose
3. When Spec 108 lands (per-surface hidden sampling), this config may become unnecessary, but it won't conflict — it will simply be a no-op for surfaces whose zones are all visible

## What to Change

### 1. Update victory surface preview config

In `data/games/fire-in-the-lake/93-observability.md`, change `allowWhenHiddenSampling` from `false` to `true` for both victory surfaces:

```yaml
victory:
  currentMargin:
    current: public
    preview:
      visibility: public
      allowWhenHiddenSampling: true    # was: false
  currentRank:
    current: public
    preview:
      visibility: public
      allowWhenHiddenSampling: true    # was: false
```

### 2. Regenerate GameDef and update golden fixtures

After modifying the game spec:
1. Build: `pnpm -F @ludoforge/engine build`
2. Regenerate compiled GameDef (if golden fixtures capture observability config)
3. Update any snapshot/golden test fixtures

## Files to Touch

- `data/games/fire-in-the-lake/93-observability.md` (modify)
- Golden fixture files if they capture compiled observability config (modify — regenerate)

## Out of Scope

- Changing `allowWhenHiddenSampling` for non-victory surfaces (resources, card identity, etc.)
- Modifying the engine's hidden-sampling check logic — that's Spec 108
- Adding preview-referencing considerations to the vc-evolved profile — that's an evolution campaign concern

## Acceptance Criteria

### Tests That Must Pass

1. Compile FITL game spec — no compiler errors
2. For an existing FITL profile that uses `projectedSelfMargin`, `preview.victory.currentMargin.self` resolves to a numeric value (not `hidden`)
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Victory margin preview access works for all FITL seats (all observe via `currentPlayer`)
2. Non-victory preview surfaces (resources, card identity) remain unaffected by this change

## Test Plan

### New/Modified Tests

1. Update the smallest owned FITL production golden and/or policy integration tests that currently expect `victoryCurrentMargin.currentMargin.self` to resolve as `hidden`

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

## Outcome

Completed: 2026-04-02

- Updated `data/games/fire-in-the-lake/93-observability.md` so FITL victory preview surfaces (`currentMargin` and `currentRank`) allow hidden sampling.
- Regenerated the owned FITL policy catalog and summary goldens to reflect that `preview.victory.currentMargin.self` now evaluates as ready rather than hidden for existing baseline profiles that use `projectedSelfMargin`.
- Updated the FITL integration expectations and one adjacent seed-based helper regression so the verification surface matches the current deterministic FITL seeded states after the observability change.
- The ticket boundary was corrected before implementation: the live production profile surface exercising this path was the existing FITL baseline profiles, not `vc-evolved`.

Verification:

- `pnpm -F @ludoforge/engine build`
- `node --test "dist/test/unit/policy-production-golden.test.js" "dist/test/integration/fitl-policy-agent.test.js"`
- `node --test "dist/test/unit/prepare-playable-moves.test.js"`
- `pnpm turbo typecheck`
- `pnpm -F @ludoforge/engine test`
