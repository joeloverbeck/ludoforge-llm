# SESSMGMT-015: Token Type Display Name in Event Log Translation (Spec 43 D7 enhancement)

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None (can be done independently)

## Assumption Reassessment (2026-02-20)

### Discrepancies Found

1. Spec 43 D7 baseline is already implemented in runner (`EventLogPanel`, `useEventLogEntries`, `translateEffectTrace`), so this ticket is **not** introducing event log infrastructure.
2. The original acceptance criteria referenced parsing `TokenTypeVisualStyleSchema` directly, but that schema is internal to `visual-config-types.ts` and not exported. Validation should be tested through `VisualConfigSchema`.
3. Session architecture assumptions from earlier Spec 43 work are stale for this ticket: app router, replay, save/load, and event-log UI already exist. This enhancement is a focused naming-quality improvement only.
4. `Toolbar.tsx` path in older D1 notes is stale; quit/session controls now live in `GameContainer` top-bar controls and terminal overlay paths under `packages/runner/src/ui/`.

### Updated Scope

Add optional token-type `displayName` in visual config and use it in event log token create/destroy messages, with fallback to `formatIdAsDisplayName()`.

## Problem

`translateEffectTrace` currently renders token type names for `createToken`/`destroyToken` with `formatIdAsDisplayName(entry.type)`. This is generic but not always ideal (pluralization, domain naming, abbreviations). Visual config already supports explicit display naming for factions/zones; token types should support the same pattern.

## Architecture Rationale

This change is beneficial over current behavior because it keeps naming policy inside `visual-config.yaml` (data-driven, game-authored) and avoids hardcoded naming logic in translation code. It strengthens the existing `VisualConfigProvider` boundary instead of adding game-specific branches.

## What to Change

### 1. `packages/runner/src/config/visual-config-types.ts`

Add optional `displayName` to token-type visual style schema:

```typescript
const TokenTypeVisualStyleSchema = z.object({
  shape: TokenShapeSchema.optional(),
  color: z.string().optional(),
  size: z.number().optional(),
  symbol: z.string().optional(),
  backSymbol: z.string().optional(),
  symbolRules: z.array(TokenSymbolRuleSchema).optional(),
  displayName: z.string().optional(),
});
```

### 2. `packages/runner/src/config/visual-config-provider.ts`

Add provider accessor:

```typescript
getTokenTypeDisplayName(tokenTypeId: string): string | null {
  return this.config?.tokenTypes?.[tokenTypeId]?.displayName ?? null;
}
```

### 3. `packages/runner/src/model/translate-effect-trace.ts`

For `createToken` and `destroyToken`, resolve token-type label through provider first:
- `visualConfig.getTokenTypeDisplayName(entry.type)`
- fallback: `formatIdAsDisplayName(entry.type)`

### 4. Tests

- `packages/runner/test/config/visual-config-schema.test.ts`
  - add coverage that `VisualConfigSchema` accepts token-type `displayName`
  - add coverage that token-type `displayName` remains optional
- `packages/runner/test/config/visual-config-provider.test.ts`
  - add `getTokenTypeDisplayName()` configured + null fallback tests
- `packages/runner/test/model/translate-effect-trace.test.ts`
  - add assertion that token create/destroy messages prefer configured token-type `displayName`
  - add assertion that fallback formatting is used when no token-type `displayName` exists

## Files to Touch

- `packages/runner/src/config/visual-config-types.ts`
- `packages/runner/src/config/visual-config-provider.ts`
- `packages/runner/src/model/translate-effect-trace.ts`
- `packages/runner/test/config/visual-config-schema.test.ts`
- `packages/runner/test/config/visual-config-provider.test.ts`
- `packages/runner/test/model/translate-effect-trace.test.ts`

## Out of Scope

- Event log panel UI structure/filtering/scroll behavior
- Save/load/replay/session-router behavior (already implemented in other Spec 43 tickets)
- Engine package changes
- Per-game YAML authoring rollout (can be done separately; schema and runtime must support it)

## Acceptance Criteria

### Tests That Must Pass

1. `VisualConfigSchema` accepts token-type `displayName`.
2. `VisualConfigSchema` still accepts token-type entries without `displayName`.
3. `VisualConfigProvider.getTokenTypeDisplayName()` returns configured value.
4. `VisualConfigProvider.getTokenTypeDisplayName()` returns `null` when missing.
5. `translateEffectTrace` uses token-type `displayName` for create/destroy token messages when present.
6. `translateEffectTrace` falls back to formatted token-type id when display name is absent.
7. `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. `displayName` remains optional to preserve compatibility with existing visual configs.
2. Provider returns `null` (not `undefined`) for missing token type display names.
3. Translation logic remains generic and game-agnostic.

## Outcome

- Completion date: 2026-02-20
- Actually changed:
  - Added optional token-type `displayName` support in visual config schema.
  - Added `getTokenTypeDisplayName()` to `VisualConfigProvider`.
  - Updated `translateEffectTrace` to prefer token-type display names for `createToken`/`destroyToken` messages with fallback formatting.
  - Added/updated runner tests for schema acceptance, provider lookup, and translation behavior.
- Deviations from original ticket:
  - Corrected stale assumptions first (event-log/session infrastructure was already implemented).
  - Did not require per-game YAML updates in this ticket; enhancement is schema/runtime ready.
- Verification:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner typecheck`
