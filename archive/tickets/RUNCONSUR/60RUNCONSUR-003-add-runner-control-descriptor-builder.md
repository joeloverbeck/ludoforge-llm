# 60RUNCONSUR-003: Add Runner Control Descriptor Builder

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only descriptor model
**Deps**: specs/60-runner-control-surface-and-settings-menu.md, archive/tickets/60RUNCONSUR-001-add-runner-ui-store-for-chrome-state.md

## Problem

`AnimationControls.tsx` currently hardcodes runner-control composition directly in JSX. That blocks reuse across surfaces and makes the architecture dependent on one layout. The spec requires a runner-owned descriptor model so controls can be rendered in a menu today and another surface later without rewriting the behavior layer.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/ui/AnimationControls.tsx` still mixes store selection, availability rules, and rendering in one component, so it remains the authoritative control-semantics layer today.
2. No runner control-descriptor module currently exists under `packages/runner/src/ui/`.
3. `archive/tickets/60RUNCONSUR-001-add-runner-ui-store-for-chrome-state.md` already introduced `packages/runner/src/ui/runner-ui-store.ts`, so chrome-state ownership is no longer part of this ticket.
4. `archive/tickets/RUNCONSUR/60RUNCONSUR-002-split-top-overlay-into-status-and-session-chrome.md` already split `UIOverlay` into `topStatusContent` and `topSessionContent`, and `GameContainer` already renders `AnimationControls` in the session lane rather than the status lane.
5. Corrected scope: this ticket should add the descriptor model/builder and make it the authoritative definition of runner-control semantics now, while leaving menu/popover UI and final legacy removal to later tickets.

## Architecture Check

1. A descriptor builder is cleaner than letting each control surface duplicate store selectors and availability logic.
2. The descriptor layer remains runner-owned and does not move playback semantics into `visual-config.yaml`, `GameDef`, or simulation state.
3. This ticket is only architecturally worthwhile if control semantics stop living inside `AnimationControls`; after it lands, the legacy component should be an adapter over descriptor data at most, not the authoritative behavior definition.
4. No legacy JSX-first composition should remain the authoritative control definition after this ticket.

## What to Change

### 1. Define runner control section/descriptor types

Add a small typed model for grouped control sections and supported control kinds such as segmented, select, toggle, and action.

### 2. Build descriptors from runner/game store state

Create a builder that maps current playback, AI detail, AI auto-skip, pause/resume, skip, and diagnostics availability into structured sections with labels, descriptions, selected values, and disabled/hidden states.

The builder must become the authoritative source of grouping and availability rules immediately. `AnimationControls` may continue to exist temporarily, but only as a thin renderer/adaptor over descriptor output until the later settings-menu integration ticket removes it.

### 3. Add focused descriptor tests

Cover grouping, selected values, disabled states, and diagnostics visibility without rendering the final menu UI.

## File List It Expects to Touch

- `packages/runner/src/ui/runner-control-surface.ts` (new)
- `packages/runner/test/ui/runner-control-surface.test.ts` (new)
- `packages/runner/src/ui/AnimationControls.tsx` (modify to consume descriptor output instead of owning control semantics directly)
- `packages/runner/test/ui/AnimationControls.test.tsx` (modify to cover the adapted renderer contract only)

## Out of Scope

- rendering any settings trigger or menu component
- changing `UIOverlay` layout
- removing `AnimationControls`
- adding `runnerChrome` visual-config fields
- persisting user preferences across sessions

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/ui/runner-control-surface.test.ts` proves the builder emits `Playback`, `AI Playback`, and `Diagnostics` sections in the spec-defined order.
2. `packages/runner/test/ui/runner-control-surface.test.ts` proves pause and skip controls become disabled when no animation is playing.
3. `packages/runner/test/ui/runner-control-surface.test.ts` proves the diagnostics action is hidden when no diagnostic buffer is available or the environment does not support it.
4. `packages/runner/test/ui/AnimationControls.test.tsx` proves the legacy component renders from descriptor-backed grouping rather than hardcoded JSX-first control semantics.
5. Existing suite: `pnpm -F @ludoforge/runner test`
6. Existing suite: `pnpm -F @ludoforge/runner lint`
7. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Runner control grouping, labels, and availability rules remain runner-owned, not game-authored data.
2. Playback and AI state continue to be sourced from the existing runner/game stores rather than duplicated state.
3. The descriptor model is generic enough to support another surface without changing the underlying control logic.
4. `AnimationControls`, if still present after this ticket, is no longer the source of truth for control semantics.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/runner-control-surface.test.ts` — descriptor sections, selected values, and disabled/hidden states.
2. `packages/runner/test/ui/AnimationControls.test.tsx` — adapted renderer behavior over descriptor-backed sections without reasserting JSX-owned control logic as the primary contract.

### Commands

1. `pnpm -F @ludoforge/runner test -- runner-control-surface`
2. `pnpm -F @ludoforge/runner test -- AnimationControls`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm -F @ludoforge/runner lint`
5. `pnpm -F @ludoforge/runner typecheck`
6. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-19
- Actual changes:
  - added `packages/runner/src/ui/runner-control-surface.ts` as the typed runner-owned descriptor model and authoritative builder for playback, AI playback, and diagnostics controls
  - refactored `packages/runner/src/ui/AnimationControls.tsx` into a thin renderer over descriptor sections instead of leaving store selection and availability rules hardcoded in JSX
  - added `packages/runner/test/ui/runner-control-surface.test.ts` to cover section ordering, selected values, disabled states, and diagnostics visibility
  - updated `packages/runner/test/ui/AnimationControls.test.tsx` so it validates the adapted grouped renderer contract rather than treating the legacy component as the source of truth for control semantics
- Deviations from original plan:
  - `AnimationControls` was intentionally modified in this ticket, because leaving control semantics inside the legacy component would have made the new builder dead weight and preserved the existing architectural smell
  - no settings trigger or menu surface work was introduced here; those remain correctly deferred to `60RUNCONSUR-004` and `60RUNCONSUR-005`
- Verification results:
  - `pnpm -F @ludoforge/runner test -- runner-control-surface`
  - `pnpm -F @ludoforge/runner test -- AnimationControls`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm run check:ticket-deps`
