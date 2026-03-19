# Spec 61: Runner Right-Rail Cleanup and Event Log Dock

**Status**: Draft
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 60 (Runner Control Surface and Settings Menu), current `packages/runner` overlay architecture, current `data/games/*/visual-config.yaml` schema/provider boundary
**Source sections**: `packages/runner/src/ui/*`, `packages/runner/src/config/visual-config-*`, screenshot `screenshots/fitl-ui.png`

## Overview

Remove the generic `Variables`, `Scoreboard`, and `Global Markers` widgets from the runner for all games. They were temporary, dev-facing placeholder chrome and should not survive into the long-term UI architecture.

Keep the `Event Log`, but stop treating it as another right-rail panel. Instead, introduce a dedicated bottom-right utility dock in the overlay system and place the event log there. The dock must occupy the same general visual territory as the action surface while never overlapping the currently active action/choice/AI panels.

No backwards compatibility is required. The implementation should delete obsolete UI surfaces and their supporting presentation contracts rather than preserve them behind flags.

## Goals

- Remove the placeholder right-rail widgets for every game.
- Keep the event log available, toggleable, and collapsible.
- Reposition the event log into a dedicated bottom-right dock coordinated with the bottom action surface.
- Make the overlay-region contract explicit so future runner utilities do not get bolted onto the side rail ad hoc.
- Keep `GameDef`, simulation, compiler, and kernel fully game-agnostic.
- Keep game-specific presentation data in `visual-config.yaml` only.

## Non-Goals

- Replacing the removed widgets with a new generic raw-data inspector.
- Moving gameplay semantics or runner utility behavior into `GameSpecDoc` or `GameDef`.
- Redesigning the event log’s filtering/grouping semantics.
- Reworking unrelated persistent overlays such as `VictoryStandingsBar`, phase, turn order, or event deck display.

## Problems in the Current Design

### P1: Placeholder chrome became permanent architecture

`VariablesPanel`, `Scoreboard`, and `GlobalMarkersBar` are generic dump surfaces for internal runner data. They are not authored game UI, and they are not a clean long-term abstraction for real game presentation.

### P2: The right rail mixes unrelated concerns

The current `side` region combines:

- real game-state panels that may deserve persistent side placement,
- temporary dev-only placeholder widgets,
- the event log, which is a runner utility with different spatial needs.

This makes the rail visually noisy and architecturally muddy.

### P3: Event log occupies the wrong region

The screenshot shows the event log living in the same vertical stack as right-rail panels. That wastes rail space, forces the log into a narrow/tall posture, and separates it from the bottom action surface it is most closely associated with during play.

### P4: No bottom-area ownership contract

`UIOverlay` has a single `bottomBarContent` slot but no semantic notion of a secondary dock or utility tray in the bottom region. As a result, placing a panel near actions currently encourages CSS-level improvisation instead of an explicit layout contract.

### P5: Obsolete visual-config surface area

The runner currently carries presentation contracts for removed placeholder UI, especially the `variables` visual-config section and related provider plumbing. Keeping that schema after deleting the widget would preserve dead architecture.

## Architectural Decisions

### D1: Delete the placeholder widgets globally

Remove these runner surfaces entirely:

- `VariablesPanel`
- `Scoreboard`
- `GlobalMarkersBar`

This is a full removal, not a hide/show option and not a per-game toggle.

### D2: Split the right rail from the bottom-right utility dock

Refine overlay composition so the runner has distinct semantic regions:

- `leftRailContent`
- `rightRailContent`
- `bottomPrimaryContent`
- `bottomRightDockContent`
- existing `topStatusContent`, `topSessionContent`, `scoringBarContent`, and `floatingContent`

The important change is that the event log no longer belongs to the right rail. It belongs to `bottomRightDockContent`.

### D3: Make the event log a runner-owned bottom-right dock panel

The event log remains runner-owned, game-agnostic in behavior, and toggleable from the top-right session cluster. Its new home is a dedicated bottom-right dock that:

- sits above the canvas in the lower-right quadrant,
- is visually associated with the action surface,
- never overlaps active action/choice/AI panels,
- remains available in read-only contexts if the runner still exposes the toggle.

The dock is a utility tray, not a game-specific panel system.

### D4: Bottom-region layout must be collision-free by construction

Do not solve placement with hardcoded absolute offsets against whichever bottom panel happens to be mounted.

Instead, the bottom overlay region must own both:

- the primary action surface, and
- the utility dock.

Representative layout model:

```ts
interface BottomOverlayLayout {
  readonly primary: ReactNode;
  readonly dock?: ReactNode;
}
```

Representative behavior:

- wide screens: primary content uses the main bottom area, dock is anchored to the right in the same bottom layout container,
- constrained screens: dock stacks above the primary area or switches to a compact width according to the same layout contract.

The key requirement is structural non-overlap, not z-index tricks.

### D5: Remove placeholder-only presentation schema

Delete runner presentation schema/provider APIs that only exist for removed widgets. In particular:

- remove the `variables` section from `visual-config.yaml` schema and provider APIs,
- remove variable-formatting and variable-panel grouping contracts that no longer have a runtime consumer.

No compatibility shim is needed.

### D6: Keep semantic game data separate from generic placeholder chrome

This spec removes generic placeholder surfaces. It does not require engine/runtime semantics to become game-specific.

Rules:

- `GameDef` and simulation remain unchanged in responsibility and stay game-agnostic.
- `visual-config.yaml` may define presentation-only layout hints for runner chrome.
- future game-specific UI should be built as intentional semantic surfaces, not by restoring generic raw-data dump widgets.

### D7: Clean up dead runner projections when they no longer serve a real surface

If `RenderModel` / `RunnerFrame` fields exist only to support the removed widgets, delete them in the same delivery rather than carry dead data through the runner pipeline.

This applies especially to generic placeholder-oriented projections such as:

- `globalVars`
- `playerVars`
- `globalMarkers`
- `tracks`

If any of these are still required by a remaining production surface, keep only the minimum needed projection. Do not preserve unused fields “for later”.

### D8: Visual config may tune dock layout, not dock behavior

If per-game presentation tuning is needed, add an optional presentation-only section under `runnerChrome`.

Representative shape:

```yaml
runnerChrome:
  bottomRightDock:
    width: 360
    maxHeight: 320
    rightInset: 16
    bottomInset: 16
    narrowMode: stackAbovePrimary
```

Allowed uses:

- width / max-height hints,
- insets,
- narrow-screen presentation policy.

Disallowed uses:

- whether the event log exists,
- default visibility,
- filtering behavior,
- gameplay semantics,
- action availability,
- anything that belongs in `GameDef` or simulation.

If FITL does not need custom tuning, the runner should use generic defaults and keep `visual-config.yaml` unchanged.

## Proposed UX

### Right Rail

The right rail should contain only panels that still deserve persistent side placement after the placeholder cleanup. This spec does not require the rail to disappear, only to stop hosting dev-only dump widgets and the event log.

### Event Log Dock

- Positioned in the bottom-right utility dock.
- Toggle remains in the top-right session cluster.
- Panel remains collapsible via its own header.
- Open state should feel attached to the action area, not to the side rail.

### Action-Surface Coordination

For action, choice, and AI-turn bottom modes:

- the dock must not cover action buttons,
- the primary bottom panel must not render beneath the dock,
- layout should degrade by stacking rather than clipping.

## Detailed Deliverables

### D1: Overlay Region Refactor

Update `UIOverlay` and its CSS contract so bottom-area composition has separate primary and dock slots.

Candidate updates:

- `packages/runner/src/ui/UIOverlay.tsx`
- `packages/runner/src/ui/UIOverlay.module.css`
- `packages/runner/test/ui/UIOverlay.test.ts`

### D2: GameContainer Region Assignment Cleanup

Refactor `GameContainer` so:

- `VariablesPanel`, `Scoreboard`, and `GlobalMarkersBar` are removed from overlay registration,
- `EventLogPanel` is rendered through the new bottom-right dock slot,
- the right rail only contains panels that still belong there,
- the top-right event-log toggle continues to control visibility through runner UI state.

Candidate updates:

- `packages/runner/src/ui/GameContainer.tsx`
- `packages/runner/test/ui/GameContainer.test.ts`
- `packages/runner/test/ui/GameContainer.chrome.test.tsx`

### D3: Widget and Contract Removal

Delete obsolete components, styles, tests, and supporting config/provider code tied only to those widgets.

Candidate removals:

- `packages/runner/src/ui/VariablesPanel.tsx`
- `packages/runner/src/ui/VariablesPanel.module.css`
- `packages/runner/src/ui/Scoreboard.tsx`
- `packages/runner/src/ui/Scoreboard.module.css`
- `packages/runner/src/ui/GlobalMarkersBar.tsx`
- `packages/runner/src/ui/GlobalMarkersBar.module.css`
- corresponding `packages/runner/test/ui/*` files

### D4: Visual-Config Schema Cleanup

Remove placeholder-widget schema from the visual-config type system and provider.

Candidate updates:

- `packages/runner/src/config/visual-config-types.ts`
- `packages/runner/src/config/visual-config-provider.ts`
- `packages/runner/test/config/visual-config-schema.test.ts`
- `packages/runner/test/config/visual-config-provider.test.ts`
- any fixture YAML / config tests that still assert the deleted `variables` surface

### D5: Runner-Frame / Render-Model Cleanup

After widget removal, audit the runner projection boundary and delete any dead placeholder-only fields and tests.

Candidate updates:

- `packages/runner/src/model/runner-frame.ts`
- `packages/runner/src/model/render-model.ts`
- `packages/runner/src/model/derive-runner-frame.ts`
- projection/model tests that reference removed fields

This cleanup is part of the architectural requirement. Do not leave unused projection plumbing behind.

## Testing and Verification

### Unit / Component Coverage

- `UIOverlay` tests prove the new bottom-right dock region exists and is distinct from the right rail.
- `GameContainer` tests prove the event log renders in the dock slot rather than the side rail.
- `GameContainer` tests prove the event-log toggle still works.
- Schema/provider tests prove obsolete `variables` config is rejected or absent after the cleanup.

### Integration Expectations

- Runner tests prove the bottom action surface and event-log dock can coexist without overlap in:
  - action mode,
  - choice mode,
  - AI-turn mode,
  - read-only mode if the event log is enabled there.

- Chrome/layout tests should assert region ownership, not brittle pixel snapshots alone.

### Manual Verification

Using the FITL visual app:

- the right rail no longer shows `Variables`, `Scoreboard`, or `Global Markers`,
- the event log appears in the bottom-right dock,
- action buttons remain unobscured,
- narrow-width behavior stacks or compacts cleanly instead of overlapping.

## Acceptance Criteria

- `Variables`, `Scoreboard`, and `Global Markers` no longer exist anywhere in the runner UI.
- The event log no longer renders in the right rail.
- The event log renders through a dedicated bottom-right dock region.
- Bottom action/choice/AI panels and the event-log dock do not overlap.
- Placeholder-only visual-config schema/provider contracts are removed.
- Any now-unused runner projection fields that existed only for removed widgets are deleted.
- `GameDef`, simulation, compiler, and kernel remain game-agnostic.
- Any per-game tuning lives only in `visual-config.yaml` and is presentation-only.

## Migration Notes

- No backwards compatibility.
- Existing `visual-config.yaml` files using the removed `variables` section must be updated or fail schema validation.
- No compatibility adapter should preserve the removed placeholder widgets or their config model.
