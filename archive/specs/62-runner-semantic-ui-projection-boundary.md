# Spec 62: Runner Semantic/UI Projection Boundary

**Status**: ✅ COMPLETED
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 60 (Runner Control Surface and Settings Menu), archive/specs/61-runner-right-rail-cleanup-and-event-log-dock.md, current `packages/runner` projection/presentation architecture, current `visual-config.yaml` schema/provider boundary
**Source sections**: `packages/runner/src/model/*`, `packages/runner/src/presentation/*`, `packages/runner/src/ui/*`, `packages/runner/src/config/visual-config-*`

## Overview

The runner currently has a mixed boundary between semantic game-state projection and UI-facing presentation projection.

Recent cleanup removed dead placeholder widgets and dead model fields, but the architecture still exposes generic variable bags across multiple layers:

- `presentation-scene` reads semantic `globalVars` / `playerVars` to build table overlays.
- `ShowdownOverlay` reads `playerVars` from `RenderModel` and derives its own UI-specific structure.

This is workable, but it is not the clean long-term shape. It keeps game-specific presentation behavior spread across generic runner models instead of giving visual surfaces their own explicit contracts.

The long-term architecture should make three boundaries explicit:

1. `GameSpecDoc` and compiled `GameDef` remain game-agnostic with respect to presentation.
2. `visual-config.yaml` is the only home for game-specific presentation policy and surface wiring.
3. Runner UI surfaces consume explicit projected surface models, not broad generic variable bags.

In practice, the current runner needs one more explicit boundary:

4. board/world layout is its own contract, separate from both semantic game state and viewport/canvas runtime state.

No backwards compatibility is required. Old generic presentation plumbing should be deleted rather than preserved behind aliases or compatibility shims.

## Goals

- Keep `GameDef`, simulation, compiler, and kernel fully game-agnostic.
- Keep game-specific presentation data in `visual-config.yaml` only.
- Make `RunnerFrame` a semantic runner-state contract rather than a catch-all UI feed.
- Make `RenderModel` an intentional UI contract rather than a generic data dump.
- Replace generic variable-driven UI consumption with explicit surface models owned by dedicated projectors.
- Allow future runner/game surfaces to be added without widening shared model contracts ad hoc.
- Remove the need for UI components to understand raw variable storage conventions.
- Make board/world positions an explicit reusable contract instead of an incidental detail hidden in canvas setup code.

## Non-Goals

- Moving gameplay semantics into `visual-config.yaml`.
- Making `GameDef` or simulation aware of specific runner widgets.
- Reintroducing generic raw-data inspector panels.
- Solving every runner UI problem in one change set.
- Defining game-specific surface copy, art direction, or CSS in this spec.

## Problems In The Current Design

### P1: UI-specific derivation is split across semantic and render layers

`presentation-scene` derives table-overlay content from raw semantic variable bags, while `ShowdownOverlay` derives a different UI-specific shape from `RenderModel.playerVars`. The result is a blurred ownership boundary.

### P2: Generic variable bags are too broad a public contract

`globalVars` and `playerVars` are still valid semantic facts, but exposing them as generic public runner-model fields invites any future surface to grab raw state directly instead of defining an explicit UI contract.

### P3: Surface ownership is implicit rather than explicit

Today there is no first-class concept of “table overlay model”, “showdown model”, or any other visual surface model. The runner only has generic data plus components that improvise their own derivation.

### P4: Visual-config owns some presentation policy, but not the full surface contract

`tableOverlays` is already presentation-driven configuration, but its runtime projection still depends on generic shared model fields. `ShowdownOverlay` has the opposite problem: it is a presentation surface with game-specific assumptions and no visual-config contract at all.

### P5: Equality and update logic still tracks generic data rather than explicit surfaces

`canvas-updater` and related tests still reason about raw variable arrays because overlays are derived late from general-purpose data instead of earlier from a dedicated surface model.

### P6: The current shape does not scale cleanly

If future games need semantic UI surfaces such as score ribbons, reserve counters, card-area summaries, or result overlays, the current architecture encourages further widening of `RunnerFrame` / `RenderModel` instead of creating owned surface contracts.

### P7: Board/world layout ownership is implicit

Zone positions and bounds currently live behind `GameCanvas` + `position-store`, even though they are derived deterministically from `GameDef` plus `visual-config.yaml`. That makes anchored presentation features depend on canvas-local plumbing instead of on an explicit layout/world contract.

### P8: Viewport runtime state is mixed with stable layout state

Pan/zoom, coordinate conversion, and Pixi container lifecycle are true runtime concerns. Zone positions and board bounds are not. Keeping both concepts under the same canvas-owned umbrella makes the architecture harder to extend cleanly for future anchored surfaces and non-canvas consumers.

## Architectural Decisions

### D1: Separate semantic state from UI surface projection

The runner must distinguish between:

- semantic runner state: generic game/session/action state derived from `GameState` + `GameDef`
- UI surface projection: explicit, presentation-facing models derived from semantic state plus `visual-config.yaml`

The semantic layer describes what is true. The UI surface layer describes what should be rendered.

### D2: `RunnerFrame` becomes a semantic contract only

`RunnerFrame` should contain only generic runner semantics and action affordances, for example:

- zones
- adjacencies
- tokens
- players
- turn/phase/interrupt state
- action groups
- choice state
- event-deck state
- active effects
- victory/terminal state

`RunnerFrame` should not exist as a convenience transport for arbitrary UI data.

If low-level semantic facts such as variables are still needed during projection, they may exist in an internal derivation bundle, but they should not remain a broad public API by default.

### D3: `RenderModel` becomes an explicit UI-facing contract

`RenderModel` should expose:

- projected zone/token/player display state
- projected action/choice display state
- projected event/status display state
- explicit surface models for special visual surfaces

`RenderModel` should not expose generic bags such as `playerVars` just because some current component happens to need them.

Representative shape:

```ts
interface RenderModel {
  readonly board: BoardRenderModel;
  readonly players: readonly RenderPlayer[];
  readonly turn: RenderTurnModel;
  readonly actions: RenderActionModel;
  readonly eventDecks: readonly RenderEventDeck[];
  readonly activeEffects: readonly RenderLastingEffect[];
  readonly surfaces: RenderSurfaceModel;
  readonly terminal: RenderTerminal | null;
}

interface RenderSurfaceModel {
  readonly tableOverlays: readonly TableOverlayNode[];
  readonly showdown: ShowdownSurfaceModel | null;
  readonly panels: RenderPanelModel;
}
```

The exact type layout may differ, but the architectural requirement is explicit surface ownership.

### D4: Add a dedicated projection-bundle stage

Introduce an internal derivation boundary between raw semantic derivation and final render projection.

Representative shape:

```ts
interface RunnerProjectionBundle {
  readonly frame: RunnerFrame;
  readonly source: RunnerProjectionSource;
}

interface RunnerProjectionSource {
  readonly globalVars: readonly RunnerVariable[];
  readonly playerVars: ReadonlyMap<PlayerId, readonly RunnerVariable[]>;
  readonly zoneMarkers: ReadonlyMap<string, readonly RunnerMarker[]>;
}
```

Rules:

- `RunnerProjectionSource` is internal projection input, not a general UI contract.
- UI components do not read this structure directly.
- surface projectors may use it to build explicit surface models.

This keeps semantic facts available without promoting them to permanent public UI API.

### D5: Surface-specific projectors own game-specific presentation wiring

Each nontrivial runner/game surface should have an owned projector.

Examples:

- `projectTableOverlaySurface(bundle, visualConfigProvider)`
- `projectShowdownSurface(bundle, visualConfigProvider)`
- future `projectScoreRibbonSurface(...)`

These projectors:

- consume semantic runner data plus presentation config
- emit explicit UI models
- keep game-specific presentation wiring out of generic UI components

### D6: `visual-config.yaml` owns game-specific presentation selectors

Game-specific presentation wiring belongs in `visual-config.yaml`, not in `GameDef`, simulation, or hardcoded runner components.

This includes:

- which semantic facts feed a surface
- how those facts are labeled or grouped for display
- when a surface is shown
- zone/seat/token selection rules for presentation

This does not include:

- gameplay rules
- action legality
- turn structure semantics
- scoring logic
- outcome calculation

### D7: Replace ad hoc showdown derivation with a visual-config-driven surface contract

`ShowdownOverlay` should stop reading `RenderModel.playerVars` and deriving its own semantics.

Instead:

- the runner should project a dedicated `showdown` surface model
- the surface model should be built from generic runtime facts plus presentation selectors declared in `visual-config.yaml`
- the React component should render that model only

Representative config shape:

```yaml
runnerSurfaces:
  showdown:
    when:
      phase: showdown
    ranking:
      source:
        kind: perPlayerVar
        name: showdownScore
      hideZeroScores: true
    communityCards:
      zones:
        - community:flop
        - community:turn
        - community:river
    playerCards:
      zonePrefix: hand:
```

This is presentation data about how to form the surface, not gameplay logic.

### D8: Table overlays should project directly to overlay nodes

`presentation-scene` should not read raw variable bags to compute overlay text.

Instead:

- `tableOverlays` config should be projected into explicit overlay nodes earlier
- `presentation-scene` should consume already-projected overlay nodes

That removes overlay-specific variable logic from the scene builder and makes overlay update/equality behavior explicit.

### D9: Do not widen shared model contracts for one surface

Future surfaces must not justify new broad fields on `RunnerFrame` or `RenderModel` unless the field is truly shared semantic state required across multiple independent consumers.

Default rule:

- surface-specific need -> add/extend a dedicated surface model
- generic semantic need -> add to semantic frame or internal projection source

Not the reverse.

### D10: Introduce an explicit layout/world contract

The runner should distinguish:

- semantic projection: generic game/session/action state
- layout/world projection: deterministic world-space placement and bounds derived from `GameDef` plus `visual-config.yaml`
- viewport runtime: pan/zoom state, screen-space conversion, Pixi objects, and interaction runtime

Representative shape:

```ts
interface WorldLayoutModel {
  readonly positions: ReadonlyMap<string, Position>;
  readonly bounds: PositionBounds;
  readonly boardBounds: PositionBounds;
}
```

Rules:

- `WorldLayoutModel` is presentation/layout data, not gameplay semantics.
- `WorldLayoutModel` must not be folded into `RenderModel` just because some surfaces need anchors.
- viewport/canvas runtime may consume `WorldLayoutModel`, but should not own the stable contract implicitly.

### D11: Anchored surface projectors may depend on semantic plus layout contracts

Not every surface should project from semantic state alone.

Examples:

- table overlays need semantic vars plus seat/table anchor positions
- action announcements need semantic/render actor context plus world anchors
- future score ribbons or reserve counters may need semantic values plus board anchor zones

Representative shape:

```ts
projectAnchoredSurface(bundle, worldLayout, visualConfigProvider)
```

This is cleaner than pushing world-space points into `RenderModel` or making canvas-local code rediscover the same anchored projection rules independently.

## Target Architecture

### Layer 1: Semantic Derivation

Input:

- `GameState`
- `GameDef`
- runner context/state

Output:

- `RunnerFrame`
- internal `RunnerProjectionSource`

Responsibilities:

- derive generic game/session/action semantics
- remain game-agnostic
- contain no visual-config decisions

### Layer 2: Layout/World Projection

Input:

- `GameDef`
- `VisualConfigProvider`

Output:

- `WorldLayoutModel`

Responsibilities:

- derive deterministic zone/world positions
- derive world bounds and board bounds
- remain presentation/layout-only
- contain no gameplay logic

### Layer 3: Surface Projection

Input:

- semantic derivation bundle
- optional `WorldLayoutModel` for anchored surfaces
- `VisualConfigProvider`

Output:

- explicit `RenderModel` surface contracts

Responsibilities:

- project labels and display names
- map semantic facts into explicit surfaces
- apply game-specific presentation selectors from `visual-config.yaml`
- consume layout/world anchors when a surface needs world-space placement

### Layer 4: UI Rendering / Viewport Runtime

Input:

- explicit render/surface models
- `WorldLayoutModel`

Responsibilities:

- render DOM/canvas
- avoid re-deriving semantics from raw state bags
- avoid owning stable layout contracts implicitly
- avoid hardcoded game-specific data wiring

## Detailed Deliverables

### D1: Introduce an internal projection-source contract

Refactor runner derivation so low-level semantic facts needed for projection live in an internal bundle instead of broad public UI types.

Candidate updates:

- `packages/runner/src/model/derive-runner-frame.ts`
- `packages/runner/src/model/*` supporting types

### D2: Define explicit render-surface types

Add dedicated render-surface contracts for nontrivial presentation surfaces.

Minimum target surfaces:

- table overlays
- showdown overlay

Candidate updates:

- `packages/runner/src/model/render-model.ts`
- new `packages/runner/src/model/render-surfaces.ts` or equivalent

### D3: Introduce a first-class world-layout contract

Promote deterministic board/world layout into an explicit contract instead of hiding it inside `GameCanvas` and `position-store`.

Candidate updates:

- `packages/runner/src/layout/layout-cache.ts`
- new `packages/runner/src/layout/world-layout-model.ts` or equivalent
- `packages/runner/src/canvas/GameCanvas.tsx`
- `packages/runner/src/store/game-store.ts` or an equivalent non-canvas owner if the contract is shared above the canvas layer

### D4: Move table-overlay derivation out of `presentation-scene`

Project table overlay nodes before scene assembly and pass them into scene rendering as explicit surface data.

Candidate updates:

- `packages/runner/src/presentation/presentation-scene.ts`
- a dedicated anchored-surface projector
- `packages/runner/src/canvas/canvas-updater.ts`

This projector should depend on semantic projection input plus layout/world anchors, not on canvas-local ad hoc derivation.

### D5: Add a visual-config contract for showdown

Create a presentation-only config section for showdown-style overlays and project it into a dedicated render surface.

Candidate updates:

- `packages/runner/src/config/visual-config-types.ts`
- `packages/runner/src/config/visual-config-provider.ts`
- `packages/runner/src/config/validate-visual-config-refs.ts`
- relevant `data/games/*/visual-config.yaml` fixtures

### D6: Refactor `ShowdownOverlay` to consume explicit surface data

`ShowdownOverlay` should render a `showdown` surface model only and should no longer inspect generic player vars.

Candidate updates:

- `packages/runner/src/ui/ShowdownOverlay.tsx`
- `packages/runner/test/ui/ShowdownOverlay.test.ts`

### D7: Delete generic render-surface leakage after replacement

Once explicit surfaces exist, delete any remaining generic `RenderModel` fields that survive only because a surface had been consuming them directly.

This includes, when no longer needed:

- `RenderModel.playerVars`
- `RenderModel.globalVars`
- any overlay-specific generic fields

Delete rather than alias.

## Visual-Config Ownership Rules

### May live in `visual-config.yaml`

- surface visibility conditions based on generic runtime facts used for presentation
- bindings from presentation surfaces to generic runtime facts
- labels, grouping, display order, layout hints, widths, insets
- zone/seat/token selectors used purely for presentation

### Must not live in `visual-config.yaml`

- gameplay rules
- legality logic
- scoring math
- AI policy
- turn-order rules
- mutation logic
- any data required by engine compilation or simulation

## Migration Strategy

### Phase 1: Internalize low-level projection inputs

- add an internal projection-source layer
- keep current external behavior stable only until explicit surfaces are projected

### Phase 2: Make layout/world projection explicit

- introduce `WorldLayoutModel`
- route anchored presentation features through the explicit layout/world contract
- keep viewport runtime concerns separate from stable world-layout ownership

### Phase 3: Project explicit surfaces

- project `tableOverlays`
- project `showdown`
- update UI/canvas consumers

### Phase 4: Delete generic render-surface fields

- remove generic variable-bag access from UI components
- remove old render-model fields
- tighten tests around the reduced contract

No compatibility shims. No aliasing. If something breaks, fix the consumer against the new contract.

## Acceptance Criteria

1. `RunnerFrame` is a semantic runner-state contract and no longer serves as a convenience UI data bag.
2. `WorldLayoutModel` or equivalent exists as an explicit contract for stable world-space layout derived from `GameDef` plus `visual-config.yaml`.
3. `RenderModel` exposes explicit surface models for showdown rather than broad generic variable bags, while anchored canvas surfaces may project from semantic plus layout/world contracts without forcing world-space data into `RenderModel`.
4. `visual-config.yaml` becomes the only home for game-specific presentation selectors that wire semantic facts into those surfaces.
5. `presentation-scene`, anchored presentation projectors, and `ShowdownOverlay` render explicit projected data instead of re-deriving UI state from generic variables.
6. No presentation-specific behavior is moved into `GameDef`, compiler, kernel, or simulation.
7. Generic surface additions in the future have a clear extension path through dedicated surface projectors and the shared layout/world contract rather than through widening shared model contracts.

## Test Plan

### New/Modified Tests

1. semantic projection boundary tests: prove `RunnerFrame` contains only semantic runner state.
2. layout/world projection tests: prove stable world positions and bounds are exposed through an explicit contract.
3. render-surface projection tests: prove table overlays and showdown are projected through owned projectors with the correct semantic/layout inputs.
4. visual-config schema/provider tests: prove new presentation selectors are accepted and validated.
5. canvas/presentation tests: prove `presentation-scene` consumes projected overlay nodes rather than raw variable bags.
6. UI tests: prove `ShowdownOverlay` renders only from dedicated surface data.
7. structural-sharing/update tests: prove surface updates respond to explicit projected outputs rather than broad generic bag equality.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

## Risks

- The wrong config DSL could accidentally encode gameplay semantics in presentation config.
- A surface-projector split that is too granular could introduce avoidable complexity.
- Pushing world-space layout into `RenderModel` could over-couple semantic projection to canvas/layout concerns.
- Migrating late-derived overlay logic may temporarily increase churn across tests and update/equality code.

These risks are acceptable if the implementation preserves the core rule: semantic truth stays generic, game-specific presentation wiring lives in `visual-config.yaml`, and UI consumers render explicit surface models only.

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - Introduced `RunnerProjectionBundle` / `RunnerProjectionSource` so raw vars remain internal projection input instead of public runner-frame state.
  - Added explicit render-surface ownership under `RenderModel.surfaces` and moved showdown onto a config-driven explicit surface contract.
  - Projected table overlays before scene assembly while keeping anchored overlay projection on the internal projection/world-layout side of the boundary rather than forcing it onto `RenderModel`.
  - Introduced store-owned `WorldLayoutModel`, migrated anchored presentation consumers to it, and renamed the remaining canvas runtime adapter from `position-store` terminology to `runtime-layout-store`.
  - Finished the series with structural-sharing and boundary-hardening tests so the semantic/UI/layout split is enforced by the suite.
- Deviations from original plan:
  - Table overlays did not become `RenderModel.surfaces.tableOverlays`; the final architecture kept them as anchored canvas projection derived from internal semantic source plus world layout, which is cleaner than widening the public DOM-facing render-model contract.
  - The spec landed through a focused ticket series, and several later tickets were narrowed after reassessment because parts of the intended architecture had already landed.
- Verification results:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
