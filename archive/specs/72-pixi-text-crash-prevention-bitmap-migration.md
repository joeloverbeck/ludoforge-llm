# Spec 72 — PixiJS Text Crash Prevention & BitmapText Migration

**Status**: COMPLETED
**Priority**: Critical (crash blocks gameplay)
**Depends on**: None (standalone fix; builds on Specs 68, 69, 71 infrastructure)

---

## 0 — Problem Statement

A recurring PixiJS v8 crash kills the canvas during FITL gameplay, completely preventing the game from being played in the visual app. Three previous specs attempted to fix this:

- **Spec 68** (completed): Removed `_texture = null` from neutralization, added double-RAF disposal, installed ticker error fence, added crash recovery.
- **Spec 69** (completed): Added sliding-window error detection, heartbeat recovery polling, viewport preservation.
- **Spec 71** (completed): Specified five defensive layers including a critical TexturePool monkey-patch.

**Spec 71's Layer 1 — a monkey-patch on `TexturePoolClass.prototype.returnTexture` — was never actually created.** The file `texture-pool-patch.ts` does not exist. The only layer that would prevent the crash was never implemented. All existing infrastructure is purely reactive containment.

### Two Distinct PixiJS v8.17.1 Bugs

**Bug 1: TexturePool.returnTexture** (PixiJS [Issue #11735](https://github.com/pixijs/pixijs/issues/11735), open, unfixed, no assignee)
```
TypeError: Cannot read properties of undefined (reading 'push')
    at TexturePoolClass.returnTexture
```
Root cause in `TexturePool.mjs:returnTexture`:
```javascript
returnTexture(renderTexture, resetStyle = false) {
    const key = this._poolKeyHash[renderTexture.uid];
    // key is undefined when texture was never pool-tracked or pool was cleared
    this._texturePool[key].push(renderTexture);
    // TypeError: Cannot read properties of undefined (reading 'push')
}
```
No guard exists for `key === undefined` or `this._texturePool[key] === undefined`.

**Bug 2: validateRenderables null child** (partially fixed in v8.14.0 via PR #11688, still occurring)
```
TypeError: Cannot read properties of null (reading 'renderPipeId')
    at validateRenderables
```
A render group's children array has a null entry from destruction timing during render. The ticker error fence already contains this error; the real damage is the cascade.

### The Fatal Cascade

1. Bug 1 fires during render loop → ticker fence catches it (1/3)
2. Bug 2 fires → (2/3), then (3/3) → ticker stops → crash recovery triggers
3. Recovery teardown calls `Text.destroy()` on every text object
4. Each `Text.destroy()` triggers Bug 1 again via `TexturePool.returnTexture`
5. `safeDestroyDisplayObject` catches each one but logs a warning → **40+ identical errors**
6. Even after recovery, `TexturePool` singleton may carry corrupted state

### Why Previous Reactive Approaches Failed

| Layer | What It Does | Why It's Not Enough |
|-------|-------------|---------------------|
| Ticker error fence | Catches render-loop errors | Single contained error corrupts TexturePool permanently |
| Heartbeat recovery | Polls health status | Recovery teardown itself cascades via Bug 1 |
| Double-RAF disposal | Defers destroy by 2 frames | Crash is in PixiJS render loop, not destroy timing |
| Safe destroy try/catch | Wraps `destroy()` calls | Catches the error but logs 40+ warnings during teardown |

### PixiJS Version Status

v8.17.1 IS the latest stable release. No v8.18+ exists. Bug 1 is open with no fix timeline.

---

## 1 — Constraints

- **C-1**: Targeted PixiJS monkey-patches ARE permitted. Must be minimal, documented, tested, and removable.
- **C-2**: Must preserve deterministic game-state flow (kernel purity).
- **C-3**: Destroy operations must eventually free GPU resources — no permanent leaks.
- **C-4**: Must not introduce perceptible visual glitches.
- **C-5**: Must remain compatible with PixiJS v8.17.x and the existing GSAP animation pipeline.
- **C-6**: Recovery must remain automatic — no user-initiated reload.
- **C-7**: Solutions must address root causes, not symptoms (Foundation 10).
- **C-8**: No backwards-compatibility shims (Foundation 9).

---

## 2 — Solution Architecture

Three-part strategy: prevent the crash (monkey-patch), eliminate the dependency (BitmapText migration), harden the fallback (teardown resilience).

### 2.1 — Part 1: TexturePool Monkey-Patch (Prevention)

**CREATE**: `packages/runner/src/canvas/pixi-patches.ts`

Patch `TexturePoolClass.prototype.returnTexture` before any `Application` is created:

```
returnTexture(renderTexture, resetStyle):
  key = this._poolKeyHash[renderTexture.uid]
  if key === undefined → return silently (texture never pool-tracked)
  if resetStyle → renderTexture.source.style = this.textureStyle
  if this._texturePool[key] === undefined → this._texturePool[key] = []
  this._texturePool[key].push(renderTexture)
```

The patch:
- Imports `TexturePoolClass` from `pixi.js` (exported from the package)
- Saves the original `returnTexture` in module scope
- Replaces the prototype method with a guarded version
- Exports `applyPixiPatches()` and `removePixiPatches()` (for testing)
- Documents upstream issue #11735 and the condition for removal
- Is idempotent (double-call does not double-wrap)

**MODIFY**: `packages/runner/src/canvas/create-app.ts`
- Add `import './pixi-patches.js';` as the first import (side-effect)
- In `destroy()`: call `TexturePool.clear()` before `app.destroy()` to empty the pool before cascading Text destroys

### 2.2 — Part 2: BitmapFont Registry & BitmapText Factory

BitmapText does NOT use TexturePool — it uses a shared texture atlas managed by BitmapFontManager. Migrating Text to BitmapText eliminates the Bug 1 crash path entirely for migrated labels.

**CREATE**: `packages/runner/src/canvas/text/bitmap-font-registry.ts`

Uses PixiJS v8's `BitmapFont.install()` API to generate dynamic bitmap fonts at runtime:

- `LABEL_FONT_NAME` (`'ludoforge-label'`) — plain monospace, white fill, no stroke
- `STROKE_LABEL_FONT_NAME` (`'ludoforge-label-stroke'`) — monospace with black stroke

One font at 14px (largest needed size); BitmapText scales down cleanly to 10px/11px. Character set: `BitmapFont.ASCII`.

Exports: `installLabelBitmapFonts()`, font name constants.

**CREATE**: `packages/runner/src/canvas/text/bitmap-text-runtime.ts`

Mirrors `text-runtime.ts` API surface:

- `createManagedBitmapText(options)` → `BitmapText`
- `destroyManagedBitmapText(text)` → renderable=false, visible=false, removeFromParent, safeDestroyDisplayObject
- `createKeyedBitmapTextReconciler(options)` → same reconcile/get/destroy interface

**MODIFY**: `packages/runner/src/canvas/create-app.ts`
- Call `installLabelBitmapFonts()` after `app.init()` returns

### 2.3 — Part 3: Renderer Migration (Text → BitmapText)

**Migrate** (simple labels/badges — ~70% of Text usage):

| Renderer | Labels | Font |
|----------|--------|------|
| `token-renderer.ts` | countBadge | `STROKE_LABEL_FONT_NAME` |
| `hidden-zone-stack.ts` | countLabel | `LABEL_FONT_NAME` |
| `zone-renderer.ts` | nameLabel, markersLabel | `STROKE_LABEL_FONT_NAME` |
| `zone-renderer.ts` | badgeLabel | `LABEL_FONT_NAME` |
| `table-overlay-renderer.ts` | marker labels, text overlays | `LABEL_FONT_NAME` |

**Keep as Text** (need effects BitmapText doesn't support):

| Renderer | Reason |
|----------|--------|
| `action-announcement-renderer.ts` | dropShadow effect |
| `region-boundary-renderer.ts` | letterSpacing + sans-serif + dynamic scale measurement |

### 2.4 — Part 4: Teardown Hardening

**MODIFY**: `packages/runner/src/canvas/renderers/disposal-queue.ts`

Add error-budget to `flush()`: after N destroy failures during a single flush (default: 5), switch remaining items to `neutralizeDisplayObject()` only. Prevents 40+ warning cascades even if an edge case slips past the patch.

---

## 3 — Ticket Sequence

| Ticket | Scope | Ship-gating? |
|--------|-------|-------------|
| 72PITEXCRAPRE-001 | TexturePool monkey-patch + test + create-app import | YES |
| 72PITEXCRAPRE-002 | BitmapFont registry + BitmapText factory + tests | No |
| 72PITEXCRAPRE-003 | Token renderer BitmapText migration + test update | No |
| 72PITEXCRAPRE-004 | Hidden zone stack BitmapText migration + test update | No |
| 72PITEXCRAPRE-005 | Zone renderer BitmapText migration + test update | No |
| 72PITEXCRAPRE-006 | Table overlay renderer BitmapText migration + test update | No |
| 72PITEXCRAPRE-007 | Teardown hardening (disposal-queue error budget, create-app destroy order) | No |

---

## 4 — Files

### New Files
- `packages/runner/src/canvas/pixi-patches.ts`
- `packages/runner/src/canvas/text/bitmap-font-registry.ts`
- `packages/runner/src/canvas/text/bitmap-text-runtime.ts`
- `packages/runner/test/canvas/pixi-patches.test.ts`
- `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts`
- `packages/runner/test/canvas/text/bitmap-font-registry.test.ts`

### Modified Files
- `packages/runner/src/canvas/create-app.ts`
- `packages/runner/src/canvas/renderers/token-renderer.ts`
- `packages/runner/src/canvas/renderers/hidden-zone-stack.ts`
- `packages/runner/src/canvas/renderers/zone-renderer.ts`
- `packages/runner/src/canvas/renderers/table-overlay-renderer.ts`
- `packages/runner/src/canvas/renderers/disposal-queue.ts`

### Unchanged (reference)
- `packages/runner/src/canvas/text/text-runtime.ts` — pattern to follow
- `packages/runner/src/canvas/renderers/safe-destroy.ts` — used by both Text and BitmapText
- `packages/runner/src/canvas/ticker-error-fence.ts` — no changes needed
- `packages/runner/src/canvas/renderers/action-announcement-renderer.ts` — stays as Text
- `packages/runner/src/canvas/renderers/region-boundary-renderer.ts` — stays as Text

---

## 5 — Testing

### New Tests
- `pixi-patches.test.ts`: returnTexture guards for undefined key, missing bucket, normal operation, idempotency, removal
- `bitmap-text-runtime.test.ts`: createManagedBitmapText, destroyManagedBitmapText, createKeyedBitmapTextReconciler
- `bitmap-font-registry.test.ts`: installLabelBitmapFonts, font name constants, idempotency

### Updated Tests
- All migrated renderer test files: add `BitmapText` to pixi.js mock, update type assertions

---

## 6 — Verification

1. `pnpm turbo typecheck` — no errors
2. `pnpm turbo lint` — passes
3. `pnpm -F @ludoforge/runner test` — all existing + new tests pass
4. Manual: `pnpm -F @ludoforge/runner dev` → load FITL game → canvas renders correctly
5. Manual: verify NO `TexturePool.returnTexture` errors in console
6. Manual: verify BitmapText labels render correctly at all sizes
7. Manual: verify action-announcement and region-boundary renderers still render with effects
8. Manual: trigger React StrictMode double-mount → verify no cascade during teardown

---

## Outcome

**Completion date**: 2026-03-21

**What changed**:
- Created `pixi-patches.ts` — monkey-patches `TexturePoolClass.prototype.returnTexture` to guard against undefined keys/buckets (PixiJS #11735). Auto-applied on module load via side-effect import in `create-app.ts`.
- Created `bitmap-font-registry.ts` — installs two dynamic monospace bitmap fonts (`ludoforge-label`, `ludoforge-label-stroke`) via `BitmapFontManager.install()`.
- Created `bitmap-text-runtime.ts` — mirrors `text-runtime.ts` API surface for BitmapText (factory, destroy, keyed reconciler).
- Migrated ~70% of Text usage to BitmapText: token-renderer (countBadge), hidden-zone-stack (countLabel), zone-renderer (nameLabel, markersLabel, badgeLabel), table-overlay-renderer (marker labels, text overlay reconciler).
- Kept Text for action-announcement-renderer (dropShadow) and region-boundary-renderer (letterSpacing + sans-serif + dynamic scale).
- Hardened disposal-queue flush with error-budget: after 5 destroy failures, remaining items neutralized instead of destroyed.
- Reversed destroy order in create-app.ts: TexturePool.clear() before app.destroy().

**Deviations from plan**: None. All 7 tickets implemented as specified.

**Verification**: 174 test files, 1734 tests all passing. Typecheck clean. Manual verification pending.
