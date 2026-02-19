# VISCONF2-007: Cross-Reference ID Validation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only change
**Deps**: None (but benefits from all other VISCONF2 tickets being defined so all ID categories are known)

## Problem

The visual config YAML contains IDs that reference entities from the compiled `GameDef` — zone IDs, token type IDs, faction IDs, variable names, etc. Currently, there is **no validation** that these IDs actually exist in the `GameDef`.

For example, `data/games/fire-in-the-lake/visual-config.yaml` references zone overrides like `"an-loc:none"` and token types like `us-troops`. If these IDs are misspelled or the GameDef changes, the visual config silently falls back to defaults with no error.

The config loader at `packages/runner/src/config/visual-config-loader.ts:10-22` only validates the YAML against the Zod schema shape — it does not cross-reference IDs against the GameDef.

## What to Change

### 1. New module: `packages/runner/src/config/validate-visual-config-refs.ts`

Create a validation module:

```typescript
export interface VisualConfigRefValidationContext {
  readonly zoneIds: ReadonlySet<string>;
  readonly tokenTypeIds: ReadonlySet<string>;
  readonly factionIds: ReadonlySet<string>;
  readonly variableNames: ReadonlySet<string>;
  readonly adjacencyPairs: ReadonlySet<string>; // "from:to" normalized keys
}

export interface VisualConfigRefError {
  readonly category: 'zone' | 'tokenType' | 'faction' | 'variable' | 'edge';
  readonly configPath: string;    // e.g., "zones.overrides.an-lok:none"
  readonly referencedId: string;
  readonly message: string;
}

export function validateVisualConfigRefs(
  config: VisualConfig,
  context: VisualConfigRefValidationContext,
): readonly VisualConfigRefError[]
```

### 2. Validation checks

The function checks all cross-references:

**Zone IDs** (check against `context.zoneIds`):
- `config.zones.overrides` keys
- `config.zones.layoutRoles` keys
- `config.layout.hints.fixed[].zone`
- `config.layout.hints.regions[].zones[]`
- `config.cardAnimation.zoneRoles.draw[]`, `.hand[]`, `.shared[]`, `.burn[]`, `.discard[]`

**Token type IDs** (check against `context.tokenTypeIds`):
- `config.tokenTypes` keys
- `config.cardAnimation.cardTokenTypes.ids[]`

**Faction IDs** (check against `context.factionIds`):
- `config.factions` keys

**Variable names** (check against `context.variableNames`):
- `config.variables.prominent[]`
- `config.variables.panels[].vars[]`
- `config.variables.formatting` keys

**Edge categories** (if VISCONF2-003 is implemented):
- `config.edges.categoryStyles` keys — validate against known edge categories from GameDef (if available)

### 3. Strict validation at bootstrap

**File**: `packages/runner/src/config/visual-config-loader.ts`

Add a new export:

```typescript
export function validateAndCreateProvider(
  rawYaml: unknown,
  context: VisualConfigRefValidationContext,
): VisualConfigProvider
```

This function:
1. Parses YAML via `loadVisualConfig()` as before
2. If config is non-null, calls `validateVisualConfigRefs(config, context)`
3. If errors are found, **throws** with a descriptive error message listing all invalid references
4. Returns the provider if all references are valid

### 4. Build validation context from GameDef

**File**: `packages/runner/src/config/validate-visual-config-refs.ts`

Add helper:

```typescript
export function buildRefValidationContext(gameDef: GameDef): VisualConfigRefValidationContext
```

Extracts:
- `zoneIds` from `gameDef.zones[].id`
- `tokenTypeIds` from `gameDef.tokenTypes[].id`
- `factionIds` from `gameDef.factions[].id`
- `variableNames` from `gameDef.variables.global[].name` + `gameDef.variables.perPlayer[].name`
- `adjacencyPairs` from `gameDef.zones[].adjacentTo[]` (normalized pair keys)

### 5. Wire into bootstrap flow

Where the game is bootstrapped (bridge or store initialization), replace `createVisualConfigProvider(rawYaml)` with `validateAndCreateProvider(rawYaml, buildRefValidationContext(gameDef))`.

This ensures typos in visual config are caught immediately on game load rather than silently producing wrong visuals.

## Invariants

1. Validation **throws** on any invalid reference — no silent fallback.
2. Validation is performed once at bootstrap, not on every render frame.
3. All error messages include the config path and the invalid ID for easy debugging.
4. A visual config with all valid references passes validation silently (no output).
5. A `null` visual config (no YAML provided) skips validation entirely.
6. The validation context is built from `GameDef` — not from runtime `GameState`.
7. Missing optional sections in the config (e.g., no `variables`) produce no errors.

## Tests

1. **Unit — valid config passes**: Build context from a GameDef, create a visual config with all valid IDs, verify `validateVisualConfigRefs()` returns empty array.
2. **Unit — invalid zone ID detected**: Config has `zones.overrides["typo-zone:none"]`, verify error returned with `category: 'zone'` and the invalid ID.
3. **Unit — invalid token type ID detected**: Config has `tokenTypes.nonexistent`, verify error with `category: 'tokenType'`.
4. **Unit — invalid faction ID detected**: Config has `factions.badFaction`, verify error with `category: 'faction'`.
5. **Unit — invalid variable name detected**: Config has `variables.prominent: ["nonexistent"]`, verify error with `category: 'variable'`.
6. **Unit — multiple errors collected**: Config has 3 invalid references, verify all 3 are returned (not just the first).
7. **Unit — buildRefValidationContext extracts all IDs**: Build context from a GameDef with 5 zones, 3 token types, 2 factions, verify sets contain all expected IDs.
8. **Unit — validateAndCreateProvider throws on errors**: Call with config containing invalid refs, verify it throws with descriptive message.
9. **Unit — validateAndCreateProvider succeeds on valid config**: Call with all-valid config, verify provider returned.
10. **Integration — FITL visual config passes validation**: Load FITL GameDef and visual config, run validation, verify zero errors.
11. **Integration — Texas Hold'em visual config passes validation**: Load Texas Hold'em GameDef and visual config, run validation, verify zero errors.
12. **Regression**: Existing visual config loader tests still pass.
