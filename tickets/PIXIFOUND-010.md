# PIXIFOUND-010: Token Renderer

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D6
**Priority**: P0
**Depends on**: PIXIFOUND-002, PIXIFOUND-003
**Blocks**: PIXIFOUND-011, PIXIFOUND-012

---

## Objective

Implement the `TokenRenderer` that renders `RenderToken[]` as colored circles with type labels, positioned within their parent zone containers. Uses `DefaultFactionColorProvider` for color assignment and supports incremental diff updates with stable container references.

---

## Files to Touch

### New files
- `packages/runner/src/canvas/renderers/token-renderer.ts` — `createTokenRenderer()` factory

### New test files
- `packages/runner/test/canvas/renderers/token-renderer.test.ts`

---

## Out of Scope

- Do NOT implement zone or adjacency renderers — those are PIXIFOUND-008/009.
- Do NOT implement click-to-select interactions on tokens — that is PIXIFOUND-012.
- Do NOT implement the canvas-updater subscription wiring — that is PIXIFOUND-011.
- Do NOT implement card face rendering or custom token visuals — that is Spec 42.
- Do NOT implement token stacking with expand-on-click — that is Spec 41/42.
- Do NOT modify any files in `packages/engine/`.
- Do NOT modify existing runner source files (`store/`, `model/`, `worker/`, `bridge/`).
- Do NOT modify `renderer-types.ts`, `faction-colors.ts`, or `container-pool.ts`.

---

## Implementation Details

### Factory

```typescript
export function createTokenRenderer(
  parentContainer: Container,
  colorProvider: FactionColorProvider,
): TokenRenderer;
```

### Default appearance (no visual config)

- Colored circle with token type label (BitmapText).
- Color derived from `ownerID` / faction via `colorProvider.getColor()`.
- Face-down tokens (`faceUp: false`): show "?" instead of type label.
- Visual states:
  - **Normal**: base circle.
  - **Selectable**: subtle glow effect.
  - **Selected**: bright border + slight scale-up.

### Token positioning

- Tokens are added as children of the `TokenGroup` (parentContainer), not individual zone containers.
- Position is derived from the zone container's position (from `zoneContainers` map) plus an offset within the zone (simple grid or row layout based on token index within the zone).
- Tokens whose `zoneID` has no matching zone container are hidden (alpha 0) but not destroyed.

### Incremental diff

- Same pattern as zones: `Map<string, Container>` keyed by token ID.
- Create/remove/update in place. Container references stable across updates.

---

## Acceptance Criteria

### Tests that must pass

**`token-renderer.test.ts`** (mock PixiJS Container/Graphics/BitmapText):
- `update()` with empty token array creates no containers.
- `update()` with 3 tokens creates 3 containers in the map.
- Token color matches `colorProvider.getColor(ownerID, playerIndex)`.
- Face-down token shows "?" label instead of type.
- Face-up token shows type label.
- Token with `isSelectable: true` has glow visual.
- Token with `isSelected: true` has bright border visual.
- Second `update()` removing a token: container destroyed, removed from parent and map.
- Second `update()` adding a new token: new container created and added.
- Token whose `zoneID` is not in `zoneContainers` is hidden (not crashed).
- Container references are stable: same token ID returns same Container across updates.
- `getContainerMap()` returns the internal map (read-only view).
- `destroy()` destroys all containers, removes from parent, clears map.

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true
- `pnpm -F @ludoforge/runner typecheck` passes.
- Implements `TokenRenderer` interface from `renderer-types.ts`.
- Container references are stable across updates — required for Spec 40 GSAP animation.
- Uses `FactionColorProvider` (not hardcoded colors).
- No game-specific logic — appearance derived entirely from RenderModel data.
