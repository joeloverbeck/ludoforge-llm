# 60RUNCONSUR-006: Add RunnerChrome Presentation Hints to Visual Config

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner config schema/provider only
**Deps**: specs/60-runner-control-surface-and-settings-menu.md, archive/tickets/RUNCONSUR/60RUNCONSUR-002-split-top-overlay-into-status-and-session-chrome.md

## Problem

Spec 60 allows game-specific presentation tuning for top-HUD chrome, but only as presentation-only hints. The current visual-config schema still has no explicit `runnerChrome` section, so any future top-bar presentation tweak would either get hardcoded into runner UI code or be deferred into ad hoc CSS changes with no data boundary.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/config/visual-config-types.ts` currently has no `runnerChrome` section.
2. The larger Spec 60 runner-chrome refactor is already in place: `runner-ui-store`, `SettingsMenu`, `topStatusContent`, and `topSessionContent` already exist and are covered by UI tests.
3. `packages/runner/src/config/visual-config-provider.ts` currently has no normalized accessor for runner-chrome presentation defaults.
4. A schema/provider-only addition would be dead config surface. If this ticket adds `runnerChrome`, it must also wire a generic UI consumer for the supported hints.
5. Corrected scope: add the smallest presentation-only `runnerChrome.topBar` contract that has a real generic consumer today; do not add speculative fields that the runner cannot yet honor cleanly.

## Architecture Check

1. A dedicated presentation-only `runnerChrome` config is cleaner than embedding per-game layout exceptions in UI components.
2. Restricting the schema to a minimal set of layout hints with an actual UI consumer preserves the agnostic-engine rule: control semantics stay runner-owned, while only presentation policy may be game-authored.
3. Adding speculative fields such as compactness flags without a concrete generic renderer path would be worse architecture than the current code because it creates unsupported configuration surface.
4. No schema field should permit menu items, playback defaults, AI defaults, or session behavior to migrate into YAML.

## What to Change

### 1. Extend visual-config types and provider

Add an optional `runnerChrome.topBar` section, but only for presentation hints that the current runner can consume generically and deterministically. At minimum this should cover top-bar alignment/spacing semantics, and it should expose normalized runner-owned defaults through the provider.

### 2. Wire a generic runner UI consumer

Apply the supported `runnerChrome.topBar` hints in the runner top-bar presentation layer (`UIOverlay`/`GameContainer`) so the config surface is not dead data. Keep the implementation generic and CSS-driven; do not add game-specific branches.

### 3. Validate omission and structural correctness

Ensure the new section is fully optional, uses generic defaults when omitted, and rejects malformed or behavior-encoding shapes.

### 4. Add YAML opt-in only if needed

Only update `data/games/fire-in-the-lake/visual-config.yaml` if FITL actually requires non-default top-bar spacing after the UI refactor. If defaults are sufficient, do not touch the YAML.

## File List It Expects to Touch

- `packages/runner/src/config/visual-config-types.ts` (modify)
- `packages/runner/src/config/visual-config-provider.ts` (modify)
- `packages/runner/src/config/validate-visual-config-refs.ts` (modify only if structural validation needs it)
- `packages/runner/src/ui/UIOverlay.tsx` (modify)
- `packages/runner/src/ui/UIOverlay.module.css` (modify)
- `packages/runner/src/ui/GameContainer.tsx` (modify only if provider-backed top-bar hints need wiring)
- `packages/runner/test/config/visual-config-schema.test.ts` (modify)
- `packages/runner/test/config/visual-config-provider.test.ts` (modify)
- `packages/runner/test/ui/UIOverlay.test.ts` (modify)
- `packages/runner/test/ui/GameContainer.test.ts` (modify only if wiring or ordering assertions need updates)
- `data/games/fire-in-the-lake/visual-config.yaml` (modify only if a non-default presentation hint is necessary)

## Out of Scope

- adding settings menu items or behavior to YAML
- playback defaults in config
- game-rule or simulation changes
- save/load/quit behavior changes
- any game-specific runner branching in TypeScript

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/config/visual-config-schema.test.ts` proves valid `runnerChrome.topBar` presentation hints parse successfully.
2. `packages/runner/test/config/visual-config-schema.test.ts` proves malformed or behavior-encoding `runnerChrome` shapes are rejected.
3. `packages/runner/test/config/visual-config-provider.test.ts` proves omission of `runnerChrome` yields stable generic defaults and configured values resolve deterministically.
4. `packages/runner/test/ui/UIOverlay.test.ts` proves supported `runnerChrome.topBar` hints are consumed by the overlay presentation layer without changing behavior ownership.
5. Existing suite: `pnpm -F @ludoforge/runner test`
6. Existing suite: `pnpm -F @ludoforge/runner lint`
7. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. `runnerChrome` remains presentation-only; it must not encode menu structure, playback behavior, AI behavior, or session actions.
2. Games without `runnerChrome` config continue rendering correctly under generic runner defaults.
3. The runner remains game-agnostic in behavior even when a game opts into spacing or alignment hints.
4. The added config surface must stay minimal: no field may be introduced unless the runner has a clean generic consumer for it now.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-schema.test.ts` — schema acceptance and rejection for `runnerChrome.topBar`.
2. `packages/runner/test/config/visual-config-provider.test.ts` — provider defaults and optional override handling.
3. `packages/runner/test/ui/UIOverlay.test.ts` — top-bar presentation consumption for supported `runnerChrome.topBar` hints.

### Commands

1. `pnpm -F @ludoforge/runner test -- visual-config`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm -F @ludoforge/runner typecheck`
5. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-19
- Actual changes:
  - added a strict optional `runnerChrome.topBar` visual-config section with a single supported presentation hint, `statusAlignment`
  - added runner-owned normalization in `VisualConfigProvider` so omission resolves deterministically to centered top-status alignment
  - wired `UIOverlay` and `GameContainer` to consume the provider-backed top-bar presentation hint generically, without moving any behavior into YAML
  - strengthened config and UI tests to cover schema acceptance/rejection, provider defaults/overrides, and overlay consumption
- Deviations from original plan:
  - deliberately did not add speculative spacing/compactness fields because the current runner has no clean generic consumer for them yet; expanding the config surface without a real renderer path would be worse architecture than the status quo
  - did not modify `data/games/fire-in-the-lake/visual-config.yaml` because the current generic defaults remain sufficient
- Verification results:
  - `pnpm -F @ludoforge/runner test -- visual-config-schema visual-config-provider UIOverlay GameContainer`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm run check:ticket-deps`
