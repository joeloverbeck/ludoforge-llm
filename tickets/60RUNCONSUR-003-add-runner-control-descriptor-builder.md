# 60RUNCONSUR-003: Add Runner Control Descriptor Builder

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only descriptor model
**Deps**: specs/60-runner-control-surface-and-settings-menu.md, archive/tickets/60RUNCONSUR-001-add-runner-ui-store-for-chrome-state.md

## Problem

`AnimationControls.tsx` currently hardcodes runner-control composition directly in JSX. That blocks reuse across surfaces and makes the architecture dependent on one layout. The spec requires a runner-owned descriptor model so controls can be rendered in a menu today and another surface later without rewriting the behavior layer.

## Assumption Reassessment (2026-03-19)

1. `packages/runner/src/ui/AnimationControls.tsx` still mixes control-state binding, availability rules, and rendering in one component.
2. No runner control-descriptor module currently exists under `packages/runner/src/ui/`.
3. `archive/tickets/RUNCONSUR/60RUNCONSUR-002-split-top-overlay-into-status-and-session-chrome.md` moved `AnimationControls` into the session lane, but that only corrected placement. The remaining architectural smell is that the legacy component still owns control semantics in JSX.
4. Corrected scope: this ticket should define the control model and builder only; it should not introduce popover UI yet.

## Architecture Check

1. A descriptor builder is cleaner than letting each control surface duplicate store selectors and availability logic.
2. The descriptor layer remains runner-owned and does not move playback semantics into `visual-config.yaml`, `GameDef`, or simulation state.
3. This ticket is the point where control semantics stop living inside `AnimationControls`; after it lands, the legacy component should be demoted to an adapter at most, not the authoritative behavior definition.
4. No legacy JSX-first composition should remain the authoritative control definition after this ticket.

## What to Change

### 1. Define runner control section/descriptor types

Add a small typed model for grouped control sections and supported control kinds such as segmented, select, toggle, and action.

### 2. Build descriptors from runner/game store state

Create a builder that maps current playback, AI detail, AI auto-skip, pause/resume, skip, and diagnostics availability into structured sections with labels, descriptions, selected values, and disabled/hidden states.

### 3. Add focused descriptor tests

Cover grouping, selected values, disabled states, and diagnostics visibility without rendering the final menu UI.

## File List It Expects to Touch

- `packages/runner/src/ui/runner-control-surface.ts` (new)
- `packages/runner/test/ui/runner-control-surface.test.ts` (new)
- `packages/runner/test/ui/AnimationControls.test.tsx` (modify only if shared fixtures/helpers are extracted)

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
4. Existing suite: `pnpm -F @ludoforge/runner test`
5. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. Runner control grouping, labels, and availability rules remain runner-owned, not game-authored data.
2. Playback and AI state continue to be sourced from the existing runner/game stores rather than duplicated state.
3. The descriptor model is generic enough to support another surface without changing the underlying control logic.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/runner-control-surface.test.ts` — descriptor sections, selected values, and disabled/hidden states.
2. Shared helper extraction from `packages/runner/test/ui/AnimationControls.test.tsx` only if it reduces duplication without preserving the legacy component as the primary contract.

### Commands

1. `pnpm -F @ludoforge/runner test -- runner-control-surface`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm run check:ticket-deps`
