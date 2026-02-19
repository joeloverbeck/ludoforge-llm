# VISCONF-007: Wire visual config into animation system (cardAnimation)

**Spec**: 42 (Per-Game Visual Config), D9
**Priority**: P1
**Depends on**: VISCONF-001 (VisualConfigProvider)
**Blocks**: VISCONF-008 (engine type stripping requires runner to stop reading `GameDef.cardAnimation`)

---

## Summary

Change the animation controller to read card animation configuration from `VisualConfigProvider` instead of from `GameDef.cardAnimation`. The `buildCardContext()` function currently reads `state.gameDef.cardAnimation` — change it to use `provider.getCardAnimation()`.

---

## Files to modify

| File | Change |
|------|--------|
| `packages/runner/src/animation/animation-controller.ts` | Change `buildCardContext()` to accept `VisualConfigProvider` and call `provider.getCardAnimation()` instead of reading `state.gameDef.cardAnimation`. |

## Files to update (test)

| File | Change |
|------|--------|
| `packages/runner/test/animation/animation-controller.test.ts` | Update card animation tests: provide config via `VisualConfigProvider` instead of setting `gameDef.cardAnimation`. |

---

## Detailed requirements

### animation-controller.ts changes

**Current** `buildCardContext(state: GameStore)`:
```typescript
const cardAnimation = state.gameDef?.cardAnimation;
```
Reads `CardAnimationMetadata` from `GameDef.cardAnimation`.

**New** `buildCardContext(state: GameStore, provider: VisualConfigProvider)`:
```typescript
const cardAnimation = provider.getCardAnimation();
```
Reads `CardAnimationConfig` from visual config.

The `CardAnimationConfig` type (from VISCONF-001) has a slightly different shape than `CardAnimationMetadata` (engine):
- Engine: `cardTokenTypeIds: readonly string[]` (pre-resolved)
- Config: `cardTokenTypes: { ids?: string[], idPrefixes?: string[] }` (selectors)

The provider's `getCardAnimation()` returns the config shape. The animation controller must resolve `idPrefixes` to concrete token type IDs using the GameDef's token type list. Add a resolution step:

```typescript
function resolveCardTokenTypeIds(
  config: CardAnimationConfig,
  tokenTypeIds: readonly string[]
): ReadonlySet<string> {
  const result = new Set<string>();
  for (const id of config.cardTokenTypes.ids ?? []) result.add(id);
  for (const prefix of config.cardTokenTypes.idPrefixes ?? []) {
    for (const ttId of tokenTypeIds) {
      if (ttId.startsWith(prefix)) result.add(ttId);
    }
  }
  return result;
}
```

The zone role mappings (`draw`, `hand`, `shared`, `burn`, `discard`) transfer directly — both engine and config use `string[]`.

### Where provider is accessed

The animation controller needs access to `VisualConfigProvider`. The most natural path: the controller already receives `state: GameStore` which holds `gameDef`. Add the provider to the store state (done in VISCONF-004's store wiring) or pass it as a separate parameter.

---

## Out of scope

- Render model changes (VISCONF-004)
- Faction color / renderer changes (VISCONF-005)
- Layout pipeline changes (VISCONF-006)
- Engine type removals (VISCONF-008)
- Removing `cardAnimation` from `GameDef` (engine change — VISCONF-008)
- Animation preset overrides from `animations.actions` config (future work)

---

## Acceptance criteria

### Tests that must pass

**animation-controller.test.ts** (updated):
1. Card animation with config `cardTokenTypes.idPrefixes: ["card-"]` correctly matches token types starting with "card-"
2. Card animation with config `zoneRoles.draw: ["deck"]` maps draw role to "deck" zone
3. No card animation config (null provider) — `buildCardContext` returns `undefined`
4. Card animation with both `ids` and `idPrefixes` — union of both sets
5. All 5 zone roles (draw, hand, shared, burn, discard) map correctly

### Invariants

- `animation-controller.ts` does NOT read `state.gameDef.cardAnimation` or import `CardAnimationMetadata` from engine
- Card animation is optional — null config provider means no card animations (graceful)
- The `idPrefixes` resolution logic is deterministic
- `pnpm -F @ludoforge/runner typecheck` passes
- `pnpm -F @ludoforge/runner test` passes
