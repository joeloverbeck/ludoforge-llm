# FITLBOARD-005: Dev-Mode FITL Game Loading

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner + build config only
**Deps**: None (FITLBOARD-001–004 are not required to implement loading; they only improve visible board quality once FITL is loaded)

## Problem

The runner hardcodes `DEFAULT_BOOTSTRAP_GAME_DEF` from `bootstrap/default-game-def.json` (Texas Hold'em) in `App.tsx`. There is no mechanism to load the FITL compiled GameDef. The F2 gate in `specs/35-00-frontend-implementation-roadmap.md` requires seeing the FITL board in the browser.

## Assumption Check (Reassessed Against Current Code)

- `App.tsx` currently initializes with a fixed GameDef, seed (`42`), and player (`0`) and does not read URL params.
- `packages/runner/test/ui/App.test.ts` already validates bootstrap behavior and will need updates (the previous assumption that tests remain unchanged is incorrect).
- `packages/runner/README.md` does not exist today; dev instructions must be added in a different location.
- `@ludoforge/runner` does not currently have a `tsx` dependency; using a `.mjs` script avoids adding new toolchain dependencies for a one-off compile step.

## What to Change

### Approach: Pre-compiled FITL GameDef JSON + URL bootstrap config resolver

Architecture decision:
- Prefer a dedicated bootstrap resolver module over embedding URL parsing inside `App.tsx`.
- This keeps `App` thin, testable, and extensible when additional games/bootstrap parameters are added.
- No aliasing/back-compat mode is required; dev URL contract is explicit and strict (`game`, `seed`, `player`).

### 1. Generate pre-compiled FITL GameDef

**New script**: `packages/runner/scripts/compile-fitl-bootstrap.mjs`

```typescript
// Uses the engine's compileGameSpecToGameDef to compile the FITL production spec
// and writes the result to packages/runner/src/bootstrap/fitl-game-def.json
```

Add npm script to `packages/runner/package.json`:
```json
"bootstrap:fitl": "node scripts/compile-fitl-bootstrap.mjs"
```

The script must:
1. Reads `data/games/fire-in-the-lake/` via `loadGameSpecSource()`
2. Parses, validates, compiles to `GameDef`
3. Writes JSON to `packages/runner/src/bootstrap/fitl-game-def.json`
4. Fail fast with actionable errors if parse/validation/compile diagnostics contain errors

### 2. Bootstrap config resolver + App wiring

**New file**: `packages/runner/src/bootstrap/resolve-bootstrap-config.ts`  
**Update file**: `packages/runner/src/App.tsx`

Resolver responsibilities:
- Read URL search params from `window.location.search`.
- Select default or FITL bootstrap GameDef using explicit IDs:
  - default: `default-game-def.json`
  - fitl: `fitl-game-def.json`
- Parse `seed` and `player` with strict finite integer validation and deterministic fallback defaults.
- Validate selected JSON via `assertValidatedGameDefInput` at the boundary.
- Return a typed config object: `{ gameDef, seed, playerId }`.

`App.tsx` must consume this resolver and pass resolved values to `initGame()`.

### 3. Seed and player config

Supported URL params:
- `game=fitl` selects FITL compiled bootstrap.
- `seed=<int>` selects deterministic seed, defaults to `42` if invalid/missing.
- `player=<int>` selects human player id, defaults to `0` if invalid/missing.

Player count validity remains enforced by engine/kernel during init; resolver only validates integer shape.

### 4. Dev instructions

Add a short section to root `README.md` under runner/dev commands (or create `packages/runner/README.md` if preferred in this repo) with:

```
# Run FITL in dev mode:
pnpm -F @ludoforge/runner bootstrap:fitl
pnpm -F @ludoforge/runner dev
# Then open http://localhost:5173/?game=fitl
```

## Invariants

- `pnpm turbo build` passes
- `pnpm turbo typecheck` passes
- Default behavior unchanged: `http://localhost:5173/` still loads Texas Hold'em
- `http://localhost:5173/?game=fitl` loads the FITL compiled game
- FITL GameDef JSON is valid (passes `assertValidatedGameDefInput`)
- FITL game initializes without kernel errors (zones, tokens, phases present)
- URL parsing is deterministic and resilient to malformed query params

## Tests

- **Modify**: `packages/runner/test/ui/App.test.ts` to assert `initGame()` receives resolver-derived `gameDef`, `seed`, and `playerId`.
- **New**: `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` covering:
  - default config with empty query
  - `game=fitl` selection
  - invalid `seed` fallback
  - invalid `player` fallback
  - bootstrap fixture validation failure for both default/FITL sources
- **Integration verification (manual)**: Open `?game=fitl` in browser, verify:
  - 47 zones appear on canvas
  - Tokens are present in zones
  - Game state panel shows FITL variables (aid, patronage, trail, etc.)
  - No console errors
- `pnpm -F @ludoforge/runner test` — all tests pass
- `pnpm -F @ludoforge/runner lint` — passes

## Outcome

- **Completed**: 2026-02-18
- **What changed**:
  - Added FITL bootstrap compile script at `packages/runner/scripts/compile-fitl-bootstrap.mjs` and wired `bootstrap:fitl` in `packages/runner/package.json`.
  - Generated and committed `packages/runner/src/bootstrap/fitl-game-def.json`.
  - Added `packages/runner/src/bootstrap/resolve-bootstrap-config.ts` to centralize game/seed/player resolution and fixture boundary validation.
  - Updated `packages/runner/src/App.tsx` to initialize from resolver output while keeping bootstrap config stable for the mount lifecycle.
  - Added resolver tests and updated App tests for resolver-based bootstrapping.
  - Added FITL dev bootstrap usage notes to root `README.md`.
- **Deviations from original plan**:
  - Used a Node `.mjs` compile script instead of `tsx` because `tsx` is not currently part of runner toolchain.
  - Added a dedicated bootstrap resolver module instead of inline URL parsing in `App.tsx` for cleaner separation and extensibility.
  - Added a small ESLint config update to support Node globals in `.mjs` scripts.
- **Verification**:
  - `pnpm -F @ludoforge/runner bootstrap:fitl`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm turbo typecheck`
  - `pnpm turbo build`
  - `pnpm turbo lint`
