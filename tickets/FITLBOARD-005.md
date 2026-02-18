# FITLBOARD-005: Dev-Mode FITL Game Loading

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner + build config only
**Deps**: None (can be done in parallel; benefits from FITLBOARD-001–004 being merged first for visible results)

## Problem

The runner hardcodes `DEFAULT_BOOTSTRAP_GAME_DEF` from `bootstrap/default-game-def.json` (Texas Hold'em) in `App.tsx:18`. There is no mechanism to load the FITL compiled GameDef. The F2 gate requires seeing the FITL board in the browser.

## What to Change

### Approach: Pre-compiled FITL GameDef JSON + URL param game selector

### 1. Generate pre-compiled FITL GameDef

**New script**: `packages/runner/scripts/compile-fitl-bootstrap.ts`

```typescript
// Uses the engine's compileGameSpecToGameDef to compile the FITL production spec
// and writes the result to packages/runner/src/bootstrap/fitl-game-def.json
```

Add npm script to `packages/runner/package.json`:
```json
"bootstrap:fitl": "tsx scripts/compile-fitl-bootstrap.ts"
```

The script:
1. Reads `data/games/fire-in-the-lake/` via `loadGameSpecSource()`
2. Parses, validates, compiles to GameDef
3. Writes JSON to `packages/runner/src/bootstrap/fitl-game-def.json`

### 2. Game selector in App.tsx

**File**: `packages/runner/src/App.tsx`

Read URL search param `?game=fitl` to select the game:

```typescript
import defaultBootstrapGameDef from './bootstrap/default-game-def.json';

function resolveGameDef(): GameDef {
  const params = new URLSearchParams(window.location.search);
  const game = params.get('game');

  if (game === 'fitl') {
    // Dynamic import to avoid bundling FITL when not needed
    // For now, static import is fine for dev mode
    const fitlDef = /* import fitl-game-def.json */;
    return assertValidatedGameDefInput(fitlDef, 'FITL bootstrap fixture');
  }

  return assertValidatedGameDefInput(defaultBootstrapGameDef, 'runner bootstrap fixture');
}
```

### 3. Seed and player config

FITL is a 4-player game. The URL could also accept `?seed=N` and `?player=N`:

```typescript
const seed = Number(params.get('seed') ?? DEFAULT_BOOTSTRAP_SEED);
const playerIndex = Number(params.get('player') ?? 0);
```

### 4. Dev instructions

Add a note to `packages/runner/README.md` or an inline comment:

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

## Tests

- **Existing**: All runner tests pass unchanged (no App.tsx test changes needed — component is thin)
- **New test**: `resolveGameDef()` unit test — returns default def when no param, returns FITL def when `game=fitl`
- **Integration verification (manual)**: Open `?game=fitl` in browser, verify:
  - 47 zones appear on canvas
  - Tokens are present in zones
  - Game state panel shows FITL variables (aid, patronage, trail, etc.)
  - No console errors
- `pnpm -F @ludoforge/runner test` — all tests pass
