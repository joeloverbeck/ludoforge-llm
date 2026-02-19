# VISCONF2-007: Cross-Reference ID Validation

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only change
**Deps**: VISCONF2-003 completed (canonical adjacency metadata is already in place)

## Problem

The visual config YAML contains IDs that reference entities from the compiled `GameDef` — zone IDs, token type IDs, faction IDs, variable names, etc. Runtime bootstrap currently validates YAML shape only; it does not fail fast when references point to non-existent runtime IDs.

For example, `data/games/fire-in-the-lake/visual-config.yaml` references zone overrides like `"an-loc:none"` and token types like `us-troops`. If these IDs are misspelled or the GameDef changes, the visual config silently falls back to defaults with no error.

The config loader at `packages/runner/src/config/visual-config-loader.ts` uses `VisualConfigSchema.safeParse()` and returns `null` on invalid input with a warning. The bootstrap registry currently creates the visual provider before resolving and validating the selected `GameDef`, so no cross-reference guard exists in the startup path.

## Assumption Reassessment (Code + Tests)

### Verified assumptions

1. Runtime bootstrap does not enforce cross-reference correctness between visual config IDs and `GameDef`.
2. Existing tests focus on schema validity and selected invariants for FITL/Texas config files but do not provide a centralized, reusable cross-reference validator used by bootstrap.

### Corrected assumptions

1. File references in the original ticket were stale:
   - `packages/runner/src/config/visual-config-schema.ts` does not exist.
   - Schema/types live in `packages/runner/src/config/visual-config-types.ts`.
2. `GameDef` variable names are sourced from:
   - `gameDef.globalVars[].name`
   - `gameDef.perPlayerVars[].name`
   (not `gameDef.variables.*`).
3. Adjacency data is canonical object-based (`ZoneAdjacency`) due to VISCONF2-003:
   - rendered edge categories come from `zone.adjacentTo[].category` when present, otherwise zone category fallback (`zone.category`).
4. Current bootstrap shape (`resolveVisualConfigProvider: () => VisualConfigProvider`) is too early for strict validation, because validated `GameDef` is only available in `resolveGameDef()`.

## Architecture Decision

This ticket is beneficial and should proceed with one scope refinement:

1. Keep visual-config parsing/shape validation and cross-reference validation as separate concerns.
2. Enforce strict failure in bootstrap after `GameDef` validation and before game initialization.
3. Remove silent fallback behavior for bootstrap visual-config loading/validation failures. If config is provided and invalid (schema or references), throw and surface bootstrap failure.
4. Keep engine/runtime generic: all game-specific identifiers remain in YAML + compiled `GameDef`, and validation logic remains data-driven with no hardcoded game IDs.

## What to Change

### 1. New module: `packages/runner/src/config/validate-visual-config-refs.ts`

Create a validation module:

```typescript
export interface VisualConfigRefValidationContext {
  readonly zoneIds: ReadonlySet<string>;
  readonly tokenTypeIds: ReadonlySet<string>;
  readonly factionIds: ReadonlySet<string>;
  readonly variableNames: ReadonlySet<string>;
  readonly edgeCategories: ReadonlySet<string>;
}

export interface VisualConfigRefError {
  readonly category: 'zone' | 'tokenType' | 'faction' | 'variable' | 'edge';
  readonly configPath: string;    // e.g., "zones.overrides.an-loc:none"
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

**Edge categories**:
- `config.edges.categoryStyles` keys — validate against known rendered edge categories derived from `GameDef`:
  - explicit adjacency categories: `zone.adjacentTo[].category`
  - fallback zone categories: `zone.category`

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
1. Parses YAML strictly (no warning + `null` fallback if YAML is present but invalid shape)
2. If config is non-null, calls `validateVisualConfigRefs(config, context)`
3. If schema or reference errors are found, **throws** with a descriptive error message listing all issues
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
- `variableNames` from `gameDef.globalVars[].name` + `gameDef.perPlayerVars[].name`
- `edgeCategories` from `gameDef.zones[].adjacentTo[].category` and `gameDef.zones[].category` (defined string values only)

### 5. Wire into bootstrap flow

Where the game is bootstrapped, perform validation after resolving validated `GameDef` and before game initialization. The final flow is:

1. Resolve bootstrap descriptor and params
2. Resolve `GameDef` input
3. Validate `GameDef` via existing `assertValidatedGameDefInput`
4. Build visual-config reference context from validated `GameDef`
5. Validate visual config references against the resolved `GameDef`
6. Initialize store

This ensures typos in visual config are caught immediately on game load rather than silently producing wrong visuals.

## Invariants

1. Validation **throws** on any invalid visual-config schema or reference error when YAML is provided — no silent fallback in bootstrap.
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
8. **Unit — buildRefValidationContext extracts edge categories**: Build context from adjacency metadata and verify unique categories are collected.
9. **Unit — validateAndCreateProvider throws on shape errors**: Call with malformed non-null config, verify it throws and does not degrade to defaults.
10. **Unit — validateAndCreateProvider throws on reference errors**: Call with config containing invalid refs, verify it throws with descriptive message.
11. **Unit — validateAndCreateProvider succeeds on valid config**: Call with all-valid config, verify provider returned.
12. **Integration — bootstrap fails fast on invalid visual config refs**: Mock a target visual config with bad IDs and verify bootstrap reports failure.
13. **Integration — bootstrap still succeeds for valid FITL/Texas configs**: Existing bootstrap flows continue to initialize with validated provider.
14. **Regression**: Existing visual config loader tests are adjusted only where strict bootstrap behavior changes and continue passing.

## Outcome

- Completion date: 2026-02-19
- What was actually changed:
  - Added `packages/runner/src/config/validate-visual-config-refs.ts` with:
    - `buildRefValidationContext(gameDef)`
    - `validateVisualConfigRefs(config, context)`
    - `parseVisualConfigStrict(rawYaml)` for single-path strict parsing
    - `validateAndCreateProvider(rawYaml, context)` with strict schema + ref failure behavior
  - Re-exported validation APIs through `visual-config-loader.ts` and `config/index.ts`.
  - Updated bootstrap contract:
    - `BootstrapDescriptor.resolveVisualConfigProvider` replaced with `resolveVisualConfigYaml`.
    - `resolveBootstrapConfig()` now parses visual config exactly once (strict, no fallback-to-defaults path) and constructs a single provider instance from that parsed config.
    - `resolveBootstrapConfig().resolveGameDef()` now validates visual-config refs against validated `GameDef` and fails fast on errors without reparsing YAML.
  - Added and updated tests:
    - `packages/runner/test/config/validate-visual-config-refs.test.ts` (new)
    - `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` (new invalid-ref bootstrap failure test)
    - `packages/runner/test/bootstrap/bootstrap-registry.test.ts` (descriptor contract update)
- Deviations from originally planned scope:
  - For app/store initialization compatibility, provider creation remains synchronous, while strict cross-reference enforcement occurs in `resolveGameDef()` immediately before game initialization.
  - Added an extra architecture hardening step beyond the initial ticket scope: removed duplicate visual-config parsing paths by introducing a single strict parse source used by both provider creation and reference validation.
- Verification results:
  - `pnpm turbo test` ✅
  - `pnpm turbo lint` ✅
