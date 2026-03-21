# 70BITFONLEA-004: Replace BitmapText `fontFamily` Strings with Typed Font Contract

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: specs/70-bitmap-font-leak-and-init-perf.md, archive/tickets/70BITFONLEA/70BITFONLEA-001-use-preinstalled-font-names-in-table-overlay.md, tickets/70BITFONLEA-002-cache-table-overlay-style-objects.md

## Problem

The runner still models BitmapText font selection as raw `string` values in multiple contracts that only ever accept runner-owned preinstalled bitmap fonts:

1. `project-table-overlay-surface.ts` exposes `fontFamily: string` for overlay BitmapText nodes.
2. `visual-config-provider.ts` exposes `ResolvedStackBadgeStyle.fontFamily: string`, and `token-renderer.ts` passes that raw string into BitmapText.
3. `bitmap-text-runtime.ts` accepts generic `TextStyleOptions`, which makes it easy to route raw CSS font-family strings into BitmapText code paths by mistake.

This is weaker than the architecture already used by `zone-renderer.ts`, which has an explicit `fontName` concept backed by `LABEL_FONT_NAME` and `STROKE_LABEL_FONT_NAME`. As long as BitmapText-facing contracts stay stringly typed, we can reintroduce the same class of leak and drift by accident.

## Assumption Reassessment (2026-03-21)

1. `packages/runner/src/presentation/project-table-overlay-surface.ts` still defines overlay text/marker styles with `fontFamily: string` even though the resolved value is always `LABEL_FONT_NAME` today — **confirmed**.
2. `packages/runner/src/config/visual-config-provider.ts` still defines `ResolvedStackBadgeStyle.fontFamily: string` with default `'monospace'`, and `packages/runner/src/canvas/renderers/token-renderer.ts` feeds that raw string directly into BitmapText — **confirmed**.
3. `packages/runner/src/canvas/text/bitmap-text-runtime.ts` still exposes generic `TextStyleOptions` for both managed and keyed BitmapText contracts, so any caller can route arbitrary CSS `fontFamily` strings through BitmapText by mistake — **confirmed**.
4. `packages/runner/src/canvas/renderers/zone-renderer.ts` already uses a narrower internal `fontName` concept, but that type is local to the file and does not protect the shared BitmapText runtime or other renderers — **confirmed**.
5. `packages/runner/src/canvas/renderers/hidden-zone-stack.ts` also routes a bitmap font through `fontFamily`, so limiting the ticket to overlay + token badges would leave another runner-owned BitmapText path stringly typed — **confirmed**.
6. `packages/runner/src/config/visual-config-types.ts` currently allows `tokens.stackBadge.fontFamily?: string`, so visual config can still express arbitrary CSS font names for a BitmapText-backed path — **confirmed**.
7. `packages/runner/src/canvas/renderers/card-template-renderer.ts` and `packages/runner/src/canvas/renderers/region-boundary-renderer.ts` still use raw CSS fonts, but they are not BitmapText-backed paths and should stay out of scope — **confirmed**.

## Architecture Check

1. A dedicated typed bitmap-font contract is cleaner than passing raw strings through presentation and renderer layers. It makes invalid states unrepresentable for runner-owned BitmapText paths.
2. This stays fully inside the runner presentation layer, aligning with Foundations 3 and 4. No game-specific logic enters engine/compiler/runtime boundaries.
3. The shared runtime is the architectural choke point. If `bitmap-text-runtime.ts` continues to accept generic style contracts, string leaks can reappear even after overlay/token-specific cleanup. The runtime API itself must become BitmapText-specific.
4. No backwards-compatibility aliases or dual fields: replace BitmapText-facing `fontFamily` string contracts with a typed `fontName` contract and update all callers/config consumers in one change.
5. This also aligns with Foundations 12. Bitmap font identifiers are domain identifiers and should not remain raw strings when the runner controls the finite set of legal values.

## What to Change

### 1. Introduce a typed runner-owned bitmap font identifier

**Files**:
- `packages/runner/src/canvas/text/bitmap-font-registry.ts`
- `packages/runner/src/canvas/text/bitmap-text-runtime.ts`

Export a dedicated bitmap-font identifier type from the registry that covers the finite runner-owned bitmap fonts. The contract should be used wherever the code is selecting a BitmapText font, rather than raw `string`.

`bitmap-text-runtime.ts` should expose BitmapText-specific options/spec types that use the typed bitmap-font identifier for the `fontName` field instead of handing generic `fontFamily` strings through the API. This is the primary architectural benefit of the ticket: one shared typed runtime contract instead of repeated local conventions.

### 2. Replace BitmapText-facing `fontFamily` contracts with `fontName`

**Files**:
- `packages/runner/src/presentation/project-table-overlay-surface.ts`
- `packages/runner/src/canvas/renderers/table-overlay-renderer.ts`
- `packages/runner/src/presentation/token-presentation.ts`
- `packages/runner/src/canvas/renderers/token-renderer.ts`
- `packages/runner/src/canvas/renderers/hidden-zone-stack.ts`

Rename BitmapText-specific style fields from `fontFamily` to `fontName` in runner-owned presentation contracts and renderer usage, and type them with the registry-owned bitmap font identifier.

This should include:
- overlay text and marker styles
- token stack badge styles
- hidden-zone stack label styling
- any keyed BitmapText reconciliation specs that currently accept raw `TextStyleOptions` only to feed `fontFamily` into BitmapText

### 3. Replace visual-config stack badge raw font strings with a finite font selector

**Files**:
- `packages/runner/src/config/visual-config-types.ts`
- `packages/runner/src/config/visual-config-provider.ts`
- related config tests/fixtures

The stack-badge visual-config path currently exposes `fontFamily?: string` for a BitmapText-backed renderer. Replace it with a finite config field that maps directly to the supported bitmap fonts, for example `fontName?: 'label' | 'labelStroke'` or the equivalent runner-owned naming used by the registry type.

Because this repo does not preserve backwards compatibility, remove the old `fontFamily` field from the schema and provider normalization path in the same change. Update fixtures/tests accordingly.

### 4. Align tests and regressions with the typed contract

Update runner tests so they assert the typed bitmap font contract instead of raw CSS-family strings. Add regression coverage that invalid/legacy raw `fontFamily` values are no longer accepted on BitmapText-backed config/types, and add runtime-focused coverage so new BitmapText call sites cannot bypass the typed contract through `bitmap-text-runtime.ts`.

## Files to Touch

- `packages/runner/src/canvas/text/bitmap-font-registry.ts` (modify)
- `packages/runner/src/canvas/text/bitmap-text-runtime.ts` (modify)
- `packages/runner/src/presentation/project-table-overlay-surface.ts` (modify)
- `packages/runner/src/canvas/renderers/table-overlay-renderer.ts` (modify)
- `packages/runner/src/config/visual-config-types.ts` (modify)
- `packages/runner/src/config/visual-config-provider.ts` (modify)
- `packages/runner/src/presentation/token-presentation.ts` (modify)
- `packages/runner/src/canvas/renderers/token-renderer.ts` (modify)
- `packages/runner/src/canvas/renderers/hidden-zone-stack.ts` (modify)
- `packages/runner/test/presentation/project-table-overlay-surface.test.ts` (modify)
- `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts` (modify)
- `packages/runner/test/config/visual-config-provider.test.ts` (modify)
- `packages/runner/test/config/visual-config-schema.test.ts` (modify)
- `packages/runner/test/canvas/renderers/token-renderer.test.ts` (modify)
- `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts` (modify)
- `packages/runner/test/canvas/renderers/hidden-zone-stack.test.ts` (modify if the typed runtime contract changes fixture expectations)
- `packages/runner/test/canvas/renderers/zone-renderer.test.ts` (modify if shared runtime helper changes propagate there)

## Out of Scope

- Changing non-BitmapText renderers that intentionally use CSS fonts, such as card template or region boundary text.
- Adding new bitmap fonts beyond the existing runner-owned set unless a concrete rendering requirement emerges.
- Any engine (`packages/engine/`) or GameSpecDoc/GameDef changes.
- The performance measurement/mitigation work in `70BITFONLEA-003`.

## Acceptance Criteria

### Tests That Must Pass

1. Overlay presentation tests assert a typed bitmap font identifier field (`fontName`), not `fontFamily: string`.
2. Token stack badge resolution and rendering use the typed bitmap font identifier end to end.
3. The shared BitmapText runtime only accepts the typed bitmap font contract for font selection; callers can no longer pass arbitrary `TextStyleOptions.fontFamily` into runner-owned BitmapText helpers.
4. Visual config rejects or no longer types legacy `stackBadge.fontFamily` values for BitmapText-backed stack badges.
5. Existing suites for overlay, token rendering, hidden-zone stack, bitmap-text runtime, and visual-config provider all pass.
6. `pnpm -F @ludoforge/runner test` passes.

### Invariants

1. All runner-owned BitmapText paths select fonts via the registry-owned typed identifier, not freeform strings.
2. The set of legal BitmapText fonts remains finite and runner-owned.
3. The shared runtime contract does not expose a bypass for arbitrary CSS font-family values.
4. No compatibility aliasing: `fontFamily` is removed from BitmapText-facing runner contracts rather than supported alongside the new field.
5. `pnpm turbo typecheck` and `pnpm turbo lint` pass with zero errors.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/presentation/project-table-overlay-surface.test.ts` — assert overlay nodes expose the typed bitmap font field and supported registry value.
2. `packages/runner/test/canvas/renderers/table-overlay-renderer.test.ts` — assert renderer mapping consumes the typed bitmap font field, not raw `fontFamily`.
3. `packages/runner/test/canvas/text/bitmap-text-runtime.test.ts` — assert the shared BitmapText runtime exposes the typed font field and preserves it across reconciliation.
4. `packages/runner/test/config/visual-config-provider.test.ts` — assert stack badge config resolves the finite bitmap font selector and no longer accepts raw CSS font families on BitmapText-backed config.
5. `packages/runner/test/config/visual-config-schema.test.ts` — assert legacy `stackBadge.fontFamily` is rejected and the new finite selector is accepted.
6. `packages/runner/test/canvas/renderers/token-renderer.test.ts` — assert stack badge rendering uses the typed bitmap font identifier end to end.
7. `packages/runner/test/canvas/renderers/hidden-zone-stack.test.ts` — assert hidden-zone stack keeps using the typed bitmap font contract if fixture assertions cover style payloads.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-21
- What actually changed:
  - Introduced a shared runner-owned `BitmapFontName` contract in `bitmap-font-registry.ts` and pushed it through `bitmap-text-runtime.ts`, so BitmapText helpers now expose `fontName` instead of generic `TextStyleOptions`/raw `fontFamily` strings.
  - Replaced BitmapText-facing `fontFamily` fields with typed `fontName` fields across overlay presentation, token stack badges, and hidden-zone stack usage.
  - Replaced visual-config stack-badge `fontFamily` with a finite `fontName` selector (`label` / `labelStroke`) and made the schema reject the legacy field rather than ignoring it.
  - Aligned the affected runner tests with the typed contract and added regression coverage for the shared runtime and legacy schema rejection.
- Deviations from original plan:
  - Scope expanded slightly to include `hidden-zone-stack.ts` and the shared `bitmap-text-runtime.ts` contract, because leaving those untouched would preserve another stringly-typed BitmapText entry point.
  - The real architectural choke point was the shared runtime API, not only the overlay/token call sites, so the implementation centered the refactor there.
- Verification results:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm turbo typecheck` ✅
  - `pnpm turbo lint` ✅
