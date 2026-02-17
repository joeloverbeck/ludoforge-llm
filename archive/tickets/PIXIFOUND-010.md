# PIXIFOUND-010: Token Renderer

**Status**: ✅ COMPLETED

**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: D6
**Priority**: P0
**Depends on**: Existing D2/D11 foundations already present in repo (`layers.ts`, `renderer-types.ts`, `faction-colors.ts`)
**Blocks**: PIXIFOUND-011, PIXIFOUND-012

---

## Objective

Implement `TokenRenderer` to render `RenderToken[]` as token visuals in `TokenGroup`, positioned relative to zone container positions, with incremental diff updates and stable container references for animation consumers.

---

## Reassessed Assumptions (Validated Against Current Code + Specs 35-00/38)

1. `packages/runner/src/canvas/renderers/token-renderer.ts` and `packages/runner/test/canvas/renderers/token-renderer.test.ts` did not exist; this ticket was required.
2. The `TokenRenderer` interface in `packages/runner/src/canvas/renderers/renderer-types.ts` had to be implemented exactly:
   - `update(tokens, zoneContainers)`
   - `getContainerMap()`
   - `destroy()`
3. `RenderToken` includes `factionId` (derived in `deriveRenderModel`) and token color assignment must consume this explicit render-model field instead of inferring faction context in the renderer.
4. Existing renderer/test patterns use Pixi `Text` with mocked Pixi primitives in Vitest node tests; `BitmapText` was not required.
5. `TokenRenderer.update()` receives only `tokens` and `zoneContainers`; positioning therefore must derive from zone-container transforms plus deterministic per-zone offsets.
6. Missing zone references should degrade gracefully (hide token visuals while preserving identity), matching Spec 38 robustness requirements.

---

## Files to Touch

### New files
- `packages/runner/src/canvas/renderers/token-renderer.ts` -- `createTokenRenderer()` factory

### New test files
- `packages/runner/test/canvas/renderers/token-renderer.test.ts`

---

## Out of Scope

- Do NOT implement zone or adjacency renderers -- those are already completed by PIXIFOUND-008/009.
- Do NOT implement click-to-select interactions on tokens -- that is PIXIFOUND-012.
- Do NOT implement canvas-updater subscription wiring -- that is PIXIFOUND-011.
- Do NOT implement card face rendering or per-game custom token visuals -- that is Spec 42.
- Do NOT modify any files in `packages/engine/`.
- Do NOT modify existing runner source files under `store/`, `model/`, `worker/`, or `bridge/`.
- Do NOT modify `renderer-types.ts`, `faction-colors.ts`, or `container-pool.ts`.

---

## Architecture Rationale

Compared to the pre-ticket architecture (renderer contracts existed, token rendering missing), this change is structurally beneficial:

- It introduces a dedicated, contract-bound token projection module instead of pushing token logic into wiring/orchestration.
- It preserves stable container identity per token ID, which is required for Spec 40 animation timelines.
- It remains game-agnostic by consuming only `RenderToken` and zone container transforms, with no game-specific branches.
- It uses deterministic in-place updates rather than full teardown/rebuild, reducing churn and improving extensibility for later visual/animation layers.

Long-term architecture note: when Spec 42 introduces visual-config customization, this should remain the generic baseline renderer extended by composition/configuration, not aliases or parallel ad-hoc code paths.

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

- Colored circle with token label (`Text`).
- Color from `colorProvider.getColor(factionId, ownerID)` when owner exists; neutral fallback for `ownerID: null`.
- Face-down tokens (`faceUp: false`) show `?` label.
- Visual states:
  - Normal: base circle.
  - `isSelectable: true`: selectable accent stroke.
  - `isSelected: true`: brighter/thicker stroke and slight scale-up.

### Token positioning

- Token containers are direct children of `TokenGroup` (`parentContainer`).
- World position comes from matching zone container position plus deterministic per-zone offset derived from token order within that zone in the current update.
- Tokens whose `zoneID` has no matching zone container are hidden (`visible=false`, `alpha=0`) and retained (not destroyed).

### Incremental diff

- Internal `Map<string, Container>` keyed by token ID.
- On each `update()`:
  - New token IDs: create container + visuals, add to parent and map.
  - Removed token IDs: remove from parent, destroy, delete from map.
  - Existing IDs: update in place (position, label, color, visual states).
- Same token ID retains the same container instance across updates.

---

## Acceptance Criteria

### Tests that must pass

**`token-renderer.test.ts`** (mock PixiJS Container/Graphics/Text):
- `update([])` creates no containers.
- `update()` with 3 tokens creates 3 containers in map and parent.
- Token color uses `colorProvider.getColor()` for owned tokens.
- Unowned token (`ownerID: null`) uses neutral fallback and does not call provider.
- Face-down token shows `?`; face-up token shows token `type`.
- `isSelectable` and `isSelected` produce distinct visual-state markers/styles.
- Removing a token destroys/removes its container and map entry.
- Missing `zoneID` container hides token without crash and supports later recovery.
- Container references are stable for unchanged token IDs across updates.
- Tokens are positioned via zone anchor + deterministic per-zone offsets.
- `getContainerMap()` returns live internal map view.
- `destroy()` destroys/removes all containers and clears map.

- All existing runner tests pass: `pnpm -F @ludoforge/runner test`

### Invariants that must remain true

- `pnpm -F @ludoforge/runner typecheck` passes.
- Implements `TokenRenderer` interface from `renderer-types.ts`.
- Container references are stable across updates.
- Uses `FactionColorProvider` where owner context exists; no hardcoded per-faction branching.
- No game-specific logic.

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Added `packages/runner/src/canvas/renderers/token-renderer.ts` with `createTokenRenderer()` implementing incremental token diffing, stable container identity, zone-relative deterministic offsets, face-up/face-down labels, owner-aware color resolution via `FactionColorProvider`, missing-zone hiding behavior, and teardown cleanup.
  - Added `packages/runner/test/canvas/renderers/token-renderer.test.ts` with 10 tests covering lifecycle diffing, color behavior (owned vs unowned), visual states, missing-zone recovery, stable references, positioning semantics, and destroy behavior.
  - Corrected ticket assumptions before implementation to match current contracts and data model (renderer contract uses `zoneContainers` rather than direct positions).
  - Follow-up architecture hardening added explicit `RenderToken.factionId` derivation and token renderer consumption of `factionId` for deterministic, data-driven faction coloring.
- **Deviations from original plan**:
  - Used Pixi `Text` rather than `BitmapText`, consistent with existing runner renderer architecture and test harness.
  - Owner-less tokens still use a neutral fallback color.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test test/canvas/renderers/token-renderer.test.ts` passed.
  - `pnpm -F @ludoforge/runner test` passed (22 files, 199 tests).
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm turbo test` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo typecheck` passed.
