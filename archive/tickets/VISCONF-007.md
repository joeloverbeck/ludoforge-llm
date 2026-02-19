# VISCONF-007: Wire visual config into animation system (cardAnimation)

**Status**: ✅ COMPLETED
**Spec**: 42 (Per-Game Visual Config), D9
**Priority**: P1
**Depends on**: VISCONF-001 (VisualConfigProvider)
**Blocks**: VISCONF-008 (engine type stripping requires runner to stop reading `GameDef.cardAnimation`)

---

## Summary

Remove animation-system coupling to engine `GameDef.cardAnimation`. Change the animation controller to read card animation selectors from `VisualConfigProvider` (`provider.getCardAnimation()`), resolve them into concrete token-type IDs, and build mapping context from that resolved config.

---

## Reassessed assumptions (code + tests)

1. Current assumption was partially wrong: `GameStore` does **not** expose `visualConfigProvider` state.
- Reality: `VisualConfigProvider` is already injected into `GameCanvas` and passed to layout/rendering systems; `createAnimationController` currently only receives `store`.
- Correction: pass `visualConfigProvider` explicitly through `AnimationControllerOptions` (do not add to `GameStore` state).

2. Current assumption about `buildCardContext` source is correct.
- Reality: `buildCardContext()` still reads `state.gameDef?.cardAnimation` in `animation-controller.ts`.
- Correction: this must be replaced with `options.visualConfigProvider.getCardAnimation()`.

3. Current tests are still tied to legacy engine shape.
- Reality: `animation-controller.test.ts` stubs `gameDef.cardAnimation.cardTokenTypeIds`.
- Correction: tests must supply card animation via `VisualConfigProvider` config (`cardTokenTypes.ids/idPrefixes`).

4. Resolution source for prefixes must use runtime game definition.
- Reality: prefix selectors (`idPrefixes`) are config-level selectors, not concrete IDs.
- Correction: resolve selectors against `state.gameDef.tokenTypes[].id` when building card context.

---

## Files to modify

| File | Change |
|------|--------|
| `packages/runner/src/animation/animation-controller.ts` | Add `visualConfigProvider` to controller options; update `buildCardContext()` to use provider config and resolve card token-type selectors into concrete IDs. |
| `packages/runner/src/canvas/GameCanvas.tsx` | Pass `visualConfigProvider` into `createAnimationController()` options. |

## Files to update (test)

| File | Change |
|------|--------|
| `packages/runner/test/animation/animation-controller.test.ts` | Update card animation tests: provide config through `VisualConfigProvider`; cover ids+prefix resolution and all zone-role mappings. |

---

## Detailed requirements

### animation-controller.ts changes

**Current** `buildCardContext(state: GameStore)`:
```typescript
const cardAnimation = state.gameDef?.cardAnimation;
```
Reads `CardAnimationMetadata` from engine `GameDef`.

**New** `buildCardContext(state: GameStore, provider: VisualConfigProvider)`:
```typescript
const cardAnimation = provider.getCardAnimation();
```
Reads `CardAnimationConfig` from visual config.

`CardAnimationConfig` uses selectors:
- `cardTokenTypes.ids?: string[]`
- `cardTokenTypes.idPrefixes?: string[]`

Add deterministic selector resolution against `state.gameDef?.tokenTypes`:

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

Zone role mappings (`draw`, `hand`, `shared`, `burn`, `discard`) are copied directly into sets.

### Architecture decision for provider access

Use explicit dependency injection: pass `VisualConfigProvider` via `AnimationControllerOptions`.

Why this is better than current architecture:
- Keeps `GameStore` focused on session/runtime state, not service dependencies.
- Removes the last animation dependency on engine visual metadata.
- Aligns with existing runner wiring pattern (layout/render paths already receive provider explicitly).
- Keeps migration path to VISCONF-008 clean (engine can remove `cardAnimation` without runner breakage).

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

`packages/runner/test/animation/animation-controller.test.ts` (updated):
1. Card animation with config `cardTokenTypes.idPrefixes: ["card-"]` matches token types starting with `card-`.
2. Card animation with config `zoneRoles.draw: ["deck"]` maps draw role correctly.
3. No card animation config (`VisualConfigProvider(null)`) => `buildCardContext` omitted.
4. Card animation with both `ids` and `idPrefixes` => union of both selector results.
5. All 5 zone roles (`draw`, `hand`, `shared`, `burn`, `discard`) map correctly.

### Invariants

- `animation-controller.ts` does NOT read `state.gameDef.cardAnimation` or import engine `CardAnimationMetadata`.
- Card animation is optional — `provider.getCardAnimation() === null` means no card mappings.
- `idPrefixes` resolution is deterministic.
- `pnpm -F @ludoforge/runner typecheck` passes.
- `pnpm -F @ludoforge/runner test` passes.

---

## Outcome

- **Completion date**: 2026-02-19
- **What changed**:
  - `packages/runner/src/animation/animation-controller.ts`
    - Added explicit `visualConfigProvider` dependency in `AnimationControllerOptions`.
    - Replaced legacy `state.gameDef.cardAnimation` read with `visualConfigProvider.getCardAnimation()`.
    - Added deterministic selector resolution from config (`ids` + `idPrefixes`) to concrete token type IDs using `state.gameDef.tokenTypes`.
  - `packages/runner/src/canvas/GameCanvas.tsx`
    - Passed `visualConfigProvider` into `createAnimationController(...)`.
  - `packages/runner/test/animation/animation-controller.test.ts`
    - Migrated card-animation setup from legacy `gameDef.cardAnimation` fixtures to `VisualConfigProvider` config fixtures.
    - Strengthened coverage for selector union behavior (`ids` + `idPrefixes`) and zone-role mapping in card context.
- **Deviations from original plan**:
  - The ticket originally listed “provider in store state (VISCONF-004 wiring) or separate parameter”. Actual architecture uses explicit dependency injection into the animation controller; `GameStore` was not changed.
- **Verification results**:
  - `pnpm -F @ludoforge/runner typecheck` ✅
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
