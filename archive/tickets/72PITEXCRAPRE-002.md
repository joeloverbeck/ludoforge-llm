# 72PITEXCRAPRE-002: BitmapFont registry and BitmapText factory

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: 72PITEXCRAPRE-001

## Problem

PixiJS Text objects use TexturePool internally, which has an unguarded bug (issue #11735). While 72PITEXCRAPRE-001 patches the immediate crash, migrating simple labels to BitmapText eliminates the TexturePool dependency entirely for those labels. This ticket creates the bitmap font infrastructure and BitmapText factory needed by the migration tickets.

## What to Change

### 1. BitmapFont registry

**CREATE**: `packages/runner/src/canvas/text/bitmap-font-registry.ts`

Install two dynamic bitmap fonts at runtime via `BitmapFont.install()`:
- `LABEL_FONT_NAME` (`'ludoforge-label'`) — plain monospace, 14px, white fill
- `STROKE_LABEL_FONT_NAME` (`'ludoforge-label-stroke'`) — monospace, 14px, white fill, black stroke width 3

Export `installLabelBitmapFonts()` and the font name constants.

### 2. BitmapText factory

**CREATE**: `packages/runner/src/canvas/text/bitmap-text-runtime.ts`

Mirror `text-runtime.ts` API surface:
- `createManagedBitmapText(options)` → BitmapText
- `destroyManagedBitmapText(text)` → safe destruction
- `createKeyedBitmapTextReconciler(options)` → reconcile/get/destroy

### 3. Wire font installation into app creation

**MODIFY**: `packages/runner/src/canvas/create-app.ts`
- Call `installLabelBitmapFonts()` after `app.init()` returns

## Files to Touch

- `packages/runner/src/canvas/text/bitmap-font-registry.ts` (new)
- `packages/runner/src/canvas/text/bitmap-text-runtime.ts` (new)
- `packages/runner/src/canvas/create-app.ts` (modify)
- `packages/runner/test/canvas/text/bitmap-font-registry.test.ts` (new)
- `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts` (new)

## Out of Scope

- Renderer migration (72PITEXCRAPRE-003 through 006)

## Acceptance Criteria

### Tests That Must Pass

1. `installLabelBitmapFonts()` calls `BitmapFont.install` with expected options
2. `createManagedBitmapText` produces non-interactive BitmapText with correct properties
3. `destroyManagedBitmapText` sets renderable/visible false before removing
4. `createKeyedBitmapTextReconciler` reconcile/get/destroy semantics work correctly
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. BitmapText factory API mirrors Text factory API for easy migration
2. Font installation is idempotent

## Test Plan

### New/Modified Tests

1. `packages/runner/test/canvas/text/bitmap-font-registry.test.ts`
2. `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts`

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`
