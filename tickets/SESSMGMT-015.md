# SESSMGMT-015: Token Type Display Name in Visual Config (Spec 43 D7 — optional enhancement)

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None (can be done at any time)

## Problem

The event log translation (SESSMGMT-013) falls back to `formatIdAsDisplayName()` for token type names. Games can improve readability by providing explicit `displayName` in their visual config YAML (e.g., `displayName: "Guerrilla"` for token type id `nva-guerrilla`).

## What to Change

### 1. `packages/runner/src/config/visual-config-types.ts`

Add optional `displayName` to `TokenTypeVisualStyleSchema`:

```typescript
const TokenTypeVisualStyleSchema = z.object({
  shape: TokenShapeSchema.optional(),
  color: z.string().optional(),
  size: z.number().optional(),
  symbol: z.string().optional(),
  backSymbol: z.string().optional(),
  symbolRules: z.array(TokenSymbolRuleSchema).optional(),
  displayName: z.string().optional(),  // NEW
});
```

### 2. `packages/runner/src/config/visual-config-provider.ts`

Add method:

```typescript
getTokenTypeDisplayName(tokenTypeId: string): string | null {
  return this.config?.tokenTypes?.[tokenTypeId]?.displayName ?? null;
}
```

### 3. Update per-game visual config YAML files (optional, can be deferred)

Add `displayName` to token type entries in:
- `data/games/fire-in-the-lake/visual-config.yaml`
- `data/games/texas-holdem/visual-config.yaml`

Example for FITL:
```yaml
tokenTypes:
  nva-guerrilla:
    displayName: "Guerrilla"
    shape: circle
    color: "#..."
```

### 4. Update `translateEffectTrace` to use `getTokenTypeDisplayName`

In `packages/runner/src/model/translate-effect-trace.ts`, update the token type name resolution to check `visualConfig.getTokenTypeDisplayName(tokenTypeId)` before falling back to `formatIdAsDisplayName()`.

## Files to Touch

- `packages/runner/src/config/visual-config-types.ts`
- `packages/runner/src/config/visual-config-provider.ts`
- `data/games/fire-in-the-lake/visual-config.yaml` (optional)
- `data/games/texas-holdem/visual-config.yaml` (optional)
- `packages/runner/src/model/translate-effect-trace.ts` (update name resolution)
- `packages/runner/test/config/visual-config-provider.test.ts` (add test for new method)
- `packages/runner/test/model/translate-effect-trace.test.ts` (update to test displayName usage)

## Out of Scope

- Token type display in other UI (scoreboard, hand panel, etc. — they use their own rendering)
- Visual config schema validation refactoring
- Engine changes
- Event log panel UI (SESSMGMT-014)
- Translation logic overhaul (SESSMGMT-013)

## Acceptance Criteria

### Tests That Must Pass

1. **Schema accepts displayName**: `TokenTypeVisualStyleSchema.parse({ displayName: "Guerrilla" })` succeeds.
2. **Schema optional**: `TokenTypeVisualStyleSchema.parse({})` succeeds (displayName is optional).
3. **Provider returns displayName**: `getTokenTypeDisplayName('nva-guerrilla')` returns `"Guerrilla"` when set.
4. **Provider returns null**: `getTokenTypeDisplayName('unknown-type')` returns `null` when not set.
5. **Translation uses displayName**: When `getTokenTypeDisplayName` returns a value, `translateEffectTrace` uses it instead of `formatIdAsDisplayName()`.
6. **Translation fallback**: When `getTokenTypeDisplayName` returns `null`, `formatIdAsDisplayName()` is used.
7. **Existing runner tests**: `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. `displayName` is optional — no existing visual config files break without it.
2. `getTokenTypeDisplayName` returns `null` (not `undefined`) when not found, consistent with `getZoneLabel` and `getFactionDisplayName`.
3. Visual config YAML files are still valid without `displayName` on any token type.
