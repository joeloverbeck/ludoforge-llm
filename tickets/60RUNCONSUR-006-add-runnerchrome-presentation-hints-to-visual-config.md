# 60RUNCONSUR-006: Add RunnerChrome Presentation Hints to Visual Config

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner config schema/provider only
**Deps**: specs/60-runner-control-surface-and-settings-menu.md, archive/tickets/RUNCONSUR/60RUNCONSUR-002-split-top-overlay-into-status-and-session-chrome.md

## Problem

The spec allows game-specific presentation tuning for top-HUD spacing, but only as presentation-only hints. The current visual-config schema has no explicit place for runner chrome layout hints, which means any future spacing tweak risks getting hardcoded into runner UI code or leaking behavior into the wrong data boundary.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/config/visual-config-types.ts` currently has no `runnerChrome` section.
2. The visual-config provider/test suite already validates optional configuration sections and is the correct place to add a presentation-only extension.
3. Corrected scope: this ticket should add schema/provider support and tests, but it should only touch game YAML if a real non-default inset/alignment hint is proven necessary.

## Architecture Check

1. A dedicated presentation-only `runnerChrome` config is cleaner than embedding per-game layout exceptions in UI components.
2. Restricting the schema to spacing/alignment hints preserves the agnostic-engine rule: control semantics stay runner-owned, while only presentation policy may be game-authored.
3. No schema field should permit menu items, playback defaults, AI defaults, or session behavior to migrate into YAML.

## What to Change

### 1. Extend visual-config types and provider

Add an optional `runnerChrome.topBar` section with presentation-only fields such as right-side inset reservation, status alignment, and compactness hints.

### 2. Validate omission and structural correctness

Ensure the new section is fully optional, uses generic defaults when omitted, and rejects malformed or behavior-encoding shapes.

### 3. Add YAML opt-in only if needed

Only update `data/games/fire-in-the-lake/visual-config.yaml` if FITL actually requires non-default top-bar spacing after the UI refactor. If defaults are sufficient, do not touch the YAML.

## File List It Expects to Touch

- `packages/runner/src/config/visual-config-types.ts` (modify)
- `packages/runner/src/config/visual-config-provider.ts` (modify)
- `packages/runner/src/config/validate-visual-config-refs.ts` (modify only if structural validation needs it)
- `packages/runner/test/config/visual-config-schema.test.ts` (modify)
- `packages/runner/test/config/visual-config-provider.test.ts` (modify)
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
3. `packages/runner/test/config/visual-config-provider.test.ts` proves omission of `runnerChrome` yields stable generic defaults.
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. `runnerChrome` remains presentation-only; it must not encode menu structure, playback behavior, AI behavior, or session actions.
2. Games without `runnerChrome` config continue rendering correctly under generic runner defaults.
3. The runner remains game-agnostic in behavior even when a game opts into spacing or alignment hints.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-schema.test.ts` — schema acceptance and rejection for `runnerChrome.topBar`.
2. `packages/runner/test/config/visual-config-provider.test.ts` — provider defaults and optional override handling.

### Commands

1. `pnpm -F @ludoforge/runner test -- visual-config`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm run check:ticket-deps`
