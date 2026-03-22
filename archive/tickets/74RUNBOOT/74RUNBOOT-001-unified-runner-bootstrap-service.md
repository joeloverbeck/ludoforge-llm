# 74RUNBOOT-001: Unified Runner Bootstrap Service

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: archive/tickets/74VISMAPLAYEDI-005-editor-screen-and-entry-point.md

## Problem

The runner now has two bootstrap paths with overlapping responsibilities:

- `packages/runner/src/bootstrap/resolve-bootstrap-config.ts` builds URL-search-driven bootstrap state for active-game and replay flows
- `packages/runner/src/bootstrap/map-editor-bootstrap.ts` builds typed bootstrap state for the map editor

Both paths resolve descriptors, load/validate `GameDef`, parse visual config, and construct `VisualConfigProvider`, but they do so through different APIs and ownership seams. This is not currently breaking behavior, but it is the wrong long-term architecture: duplicated bootstrap responsibilities will drift, make tests harder to reason about, and encourage future tickets to bolt capabilities onto one bootstrap path but not the others.

## Assumption Reassessment (2026-03-22)

1. `useActiveGameRuntime` currently resolves bootstrap through `resolveBootstrapConfig(search)` after constructing a synthetic query string from session state. Confirmed in `packages/runner/src/session/active-game-runtime.ts`.
2. `useReplayRuntime` does the same, including a second descriptor lookup via `findBootstrapDescriptorById`. Confirmed in `packages/runner/src/session/replay-runtime.ts`.
3. `MapEditorScreen` now uses `resolveMapEditorBootstrapByGameId(gameId)` from `packages/runner/src/bootstrap/map-editor-bootstrap.ts`. Confirmed.
4. `GameSelectionScreen` also calls `resolveMapEditorCapabilities(descriptor)` directly from the editor bootstrap module to decide whether to render the Edit Map affordance. This means capability derivation already leaks beyond `MapEditorScreen`; the ticket must unify that caller too.
5. Both bootstrap paths load `GameDef`, parse visual config, validate references, and expose `VisualConfigProvider`, but only the editor path exposes typed capabilities such as `supportsMapEditor`. Confirmed mismatch.
6. Existing tests are coupled to the old architecture more strongly than this ticket originally stated:
   - `packages/runner/test/session/active-game-runtime.test.tsx` mocks `resolveBootstrapConfig`.
   - `packages/runner/test/session/replay-runtime.test.tsx` mocks both `resolveBootstrapConfig` and `findBootstrapDescriptorById`.
   - `packages/runner/test/map-editor/MapEditorScreen.test.tsx` mocks `resolveMapEditorBootstrapByGameId`.
   - `packages/runner/test/ui/GameSelectionScreen.test.tsx` mocks `resolveMapEditorCapabilities`.
   The test migration is therefore broader than runtime hooks alone.
7. The current split does not belong to any remaining `74VISMAPLAYEDI` ticket. Those tickets stay inside editor renderers, toolbar wiring, export, layout consumption, and polish. Corrected scope: this follow-up ticket owns the broader bootstrap unification instead of smearing it across editor tickets.

## Architecture Check

1. The clean architecture is a single typed runner-bootstrap service that resolves a descriptor once and returns a normalized bootstrap object consumed by active-game, replay, editor, and capability-query flows. This is cleaner than keeping one legacy URL-driven API plus one typed API because it removes duplicated validation and capability logic at the root.
2. This remains fully aligned with `docs/FOUNDATIONS.md`: game-specific data still comes from bootstrap assets and `visual-config.yaml`; no game-specific branching leaks into runtime/kernel code; the work is confined to runner bootstrap composition.
3. No backwards-compatibility shims or alias layers should survive the refactor. The old `resolveBootstrapConfig(search)` search-string seam should be removed once all consumers are migrated to the unified typed service.
4. Capability derivation belongs in the bootstrap layer, not in UI components or runtime hooks. That keeps ownership stable as more runner surfaces need bootstrap facts in the future.
5. Descriptor lookup by runner `id` and URL `queryValue` should be centralized in bootstrap code. Session hooks should not own bootstrap descriptor discovery rules, and editor UI should not own capability caches.

## What to Change

### 1. Introduce a single typed runner-bootstrap module

Create or rename a bootstrap service in `packages/runner/src/bootstrap/` that:

- resolves descriptors by `gameId` or descriptor id
- loads and validates `GameDef`
- parses visual config
- validates visual-config references against the resolved `GameDef`
- constructs `VisualConfigProvider`
- returns typed capabilities required by runner consumers, including `supportsMapEditor`

The service should expose typed inputs based on session/runtime intent, not URL query strings.

### 2. Migrate active-game and replay flows to the typed bootstrap service

Modify:

- `packages/runner/src/session/active-game-runtime.ts`
- `packages/runner/src/session/replay-runtime.ts`

So they call the unified typed bootstrap service directly from session state instead of:

- building synthetic search strings
- round-tripping through `resolveBootstrapConfig(search)`
- repeating descriptor lookup logic

Shared player/descriptor resolution logic should be factored once in bootstrap/session helpers, not duplicated between active-game and replay.

### 3. Fold map-editor bootstrap and capability queries into the same service

Replace the editor-specific bootstrap split with the shared typed service so `MapEditorScreen` consumes the same bootstrap object family as other runner flows.

Editor-specific capability checks like `supportsMapEditor` can remain as typed fields, but they must be derived by the shared bootstrap service rather than a parallel editor-only loader.

`GameSelectionScreen` must obtain capability data through the same service family instead of importing a special-case editor bootstrap helper.

### 4. Remove the URL-driven bootstrap seam from runtime consumers

After all consumers are migrated:

- delete `resolveBootstrapConfig(search)` or reduce it to a thin browser-entry helper if still needed by a true URL-entry surface
- do not leave it as a second canonical bootstrap path for runtime hooks

If a browser search-param entrypoint is still required, it should parse the URL once and delegate into the unified typed bootstrap service.

## Files to Touch

- `packages/runner/src/bootstrap/resolve-bootstrap-config.ts` (modify heavily or remove)
- `packages/runner/src/bootstrap/map-editor-bootstrap.ts` (modify heavily or remove)
- `packages/runner/src/bootstrap/*` (add unified typed bootstrap service/helpers)
- `packages/runner/src/session/active-game-runtime.ts` (modify)
- `packages/runner/src/session/replay-runtime.ts` (modify)
- `packages/runner/src/ui/GameSelectionScreen.tsx` (modify)
- `packages/runner/src/bootstrap/README.md` (modify)
- `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` (modify or replace)
- `packages/runner/test/session/active-game-runtime.test.tsx` (modify)
- `packages/runner/test/session/replay-runtime.test.tsx` (modify)
- `packages/runner/test/map-editor/MapEditorScreen.test.tsx` (modify if bootstrap API changes)
- `packages/runner/test/ui/GameSelectionScreen.test.tsx` (modify if capability API changes)

## Out of Scope

- Any engine/kernel/compiler changes
- Map-editor renderer work (`74VISMAPLAYEDI-006` through `011`)
- New bootstrap descriptor content or new game fixtures
- URL routing or React Router introduction

## Acceptance Criteria

### Tests That Must Pass

1. Active-game runtime resolves bootstrap through the unified typed service without constructing URL search strings.
2. Replay runtime resolves bootstrap through the unified typed service without constructing URL search strings.
3. Map-editor bootstrap resolves through the same service family and still exposes `supportsMapEditor`.
4. Game-selection capability lookup resolves through the same service family instead of an editor-only bootstrap helper.
5. Visual-config validation behavior is preserved for all runner flows.
6. Unknown descriptor handling remains explicit and typed rather than falling through hidden defaults at runtime-hook level.
7. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. There is exactly one canonical bootstrap path for runner runtime consumers.
2. Game-specific knowledge remains in bootstrap assets and visual config, not in shared runtime logic.
3. No compatibility aliases remain for the old split bootstrap architecture.
4. Capability derivation such as `supportsMapEditor` remains centralized in bootstrap code.
5. Session/runtime code depends on bootstrap inputs expressed in runner terms (`gameId`, seed, player selection, replay intent), not browser URL strings.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/bootstrap/resolve-bootstrap-config.test.ts` or replacement bootstrap-service test — proves descriptor resolution, visual-config parsing, validation, and capability derivation from the unified service.
   Rationale: the architectural risk is bootstrap drift; this test becomes the single proof point for shared bootstrap semantics.
2. `packages/runner/test/session/active-game-runtime.test.tsx` — prove active-game runtime consumes the typed bootstrap service directly.
   Rationale: this catches regressions where runtime hooks silently reconstruct old URL-driven bootstrap logic.
3. `packages/runner/test/session/replay-runtime.test.tsx` — prove replay runtime consumes the same typed bootstrap service and preserves bootstrap-failure handling.
   Rationale: replay currently duplicates descriptor/bootstrap logic and is the easiest place for drift to reappear.
4. `packages/runner/test/map-editor/MapEditorScreen.test.tsx` — prove the editor still receives capability-aware bootstrap data through the unified service.
   Rationale: this guards the cross-flow contract that motivated the refactor.
5. `packages/runner/test/ui/GameSelectionScreen.test.tsx` — prove game selection derives map-editor support through the shared bootstrap capability seam.
   Rationale: capability lookup is part of the same architectural split and must not regress into a side-channel.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm turbo lint`
4. `pnpm run check:ticket-deps`

## Outcome

- Outcome amended: 2026-03-22
- Completion date: 2026-03-22
- What actually changed:
  - Added `packages/runner/src/bootstrap/runner-bootstrap.ts` as the single typed bootstrap service for descriptor lookup by runner `id`, `GameDef` loading, visual-config parsing/validation, `VisualConfigProvider` creation, and capability derivation.
  - Migrated `useActiveGameRuntime`, `useReplayRuntime`, `MapEditorScreen`, and `GameSelectionScreen` to the shared service.
  - Moved `findBootstrapDescriptorById` ownership into bootstrap code and updated `App.tsx` to consume it there instead of via `active-game-runtime.ts`.
  - Added `packages/runner/src/bootstrap/browser-entry.ts` and wired `main.tsx`/`App.tsx` so browser search params are parsed once into a typed runner entry request at app startup, then converted into initial session state.
  - Reduced `resolve-bootstrap-config.ts` to the browser search-param helper only.
  - Removed `packages/runner/src/bootstrap/map-editor-bootstrap.ts`; no split bootstrap path remains for runner consumers.
- Deviations from original plan:
  - The URL helper was retained as a thin browser-entry adapter instead of being deleted outright, and the browser entry path was made explicit through a typed app-startup parser rather than by letting runtime consumers read URL params directly.
  - `GameSelectionScreen` was explicitly migrated as part of this ticket because capability derivation had already leaked there in the current codebase.
- Verification results:
  - Passed: `pnpm -F @ludoforge/engine build`
  - Passed: `pnpm -F @ludoforge/runner typecheck`
  - Passed: `pnpm -F @ludoforge/runner test`
  - Passed: `pnpm turbo lint`
  - Failed pre-existing unrelated check: `pnpm run check:ticket-deps` still reports an unresolved dependency string in `tickets/MAPEDIT-004-draggable-zone-endpoints.md`; this ticket did not modify that file.
