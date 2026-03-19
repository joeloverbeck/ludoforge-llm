# 60RUNHOVTOOLIF-001: Add shared hover popover session controller

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: `specs/60-runner-hover-tooltip-lifecycle.md`

## Problem

`packages/runner/src/ui/useActionTooltip.ts` and `packages/runner/src/ui/useCardTooltip.ts` each implement their own debounce and grace-period lifecycle. `useActionTooltip()` additionally owns stale async suppression for `bridge.describeAction(...)`. That duplicated lifecycle policy is the right seam to extract now, but it is not, by itself, the full stale-action-tooltip bug fix. The runner needs one reusable hover-popover session primitive before the action-surface invalidation and floating-anchor safety fixes land in later slices.

## Assumption Reassessment (2026-03-19)

1. Current runner code has two separate tooltip hooks with near-duplicate debounce/grace logic: `packages/runner/src/ui/useActionTooltip.ts` and `packages/runner/src/ui/useCardTooltip.ts`.
2. `packages/runner/src/canvas/interactions/hover-target-controller.ts` is an existence proof for extracting transient-hover logic into a dedicated controller, but it solves target arbitration only. It does not already provide debounce, grace, popover ownership, or async invalidation semantics for DOM tooltips.
3. The stale action-tooltip bug described by Spec 60 also depends on action-surface invalidation and safe anchor/render gating. Those concerns are not implemented in the current code, and they are not covered by the existing `useActionTooltip` / `useCardTooltip` tests.
4. The current duplication is entirely in runner UI state; no engine, `GameDef`, `GameSpecDoc`, simulation, or kernel changes are required.

## Architecture Check

1. A shared controller/hook is cleaner than fixing `useActionTooltip()` in place because it removes duplicated lifecycle rules instead of encoding the same state machine twice.
2. The abstraction lives entirely in `packages/runner/src/ui` and keeps hover lifecycle generic; it does not introduce any game-specific identifiers or behavior into agnostic engine layers.
3. This ticket should stay narrowly focused on hover-session lifecycle. Source-key invalidation tied to action-surface revisions and safe floating-anchor render gating are architecturally valid, but they belong to later tickets because they couple to `GameContainer`, `ActionToolbar`, and tooltip presentation components rather than the shared session primitive itself.
4. The new primitive should replace, not wrap with compatibility shims, the duplicated timer/state logic in existing tooltip hooks.

## What to Change

### 1. Add a reusable hover-popover session primitive

Create a shared runner-level controller/hook that owns:

- source payload
- pending vs visible vs idle session state
- debounce timer
- grace-period timer
- async response invalidation / stale response suppression
- explicit `invalidate()` / `dismiss()` operations

The primitive must support both:

- synchronous content (`RenderEventCard`)
- async content (`bridge.describeAction(...)`)

### 2. Define a generic runner contract for session state

Expose a generic state shape that can represent:

- current source payload
- anchor element
- resolved content
- loading/pending status
- interaction owner (`source`, `popover`, `grace`, or equivalent)
- revision/invalidation token

The contract should be generic enough that action and card tooltip hooks can both adopt it now without reintroducing per-hook lifecycle policy. Do not force action-surface revision semantics into this primitive yet; callers can invalidate explicitly when those higher-level lifecycles are implemented.

### 3. Add focused unit coverage for lifecycle behavior

Add tests for:

- invalidation while a debounce timer is pending
- invalidation while async content is in flight
- stale async completion after source change
- grace period dismissal
- popover hover ownership during grace
- explicit dismiss clearing all session state

## Files to Touch

- `packages/runner/src/ui/useHoverPopoverSession.ts` (new)
- `packages/runner/src/ui/useActionTooltip.ts` (modify)
- `packages/runner/src/ui/useCardTooltip.ts` (modify)
- `packages/runner/test/ui/useHoverPopoverSession.test.ts` (new)
- `packages/runner/test/ui/useActionTooltip.test.ts` (modify)
- `packages/runner/test/ui/useCardTooltip.test.ts` (modify)

## Out of Scope

- `GameContainer` action-surface revision derivation or tooltip invalidation wiring
- `ActionToolbar` hover metadata changes
- `ActionTooltip` / `EventCardTooltip` positioning/rendering hardening
- FITL-specific or any other game-specific logic
- changes to engine/runtime/kernel/schema files

## Acceptance Criteria

### Tests That Must Pass

1. `packages/runner/test/ui/useHoverPopoverSession.test.ts` covers explicit invalidation, grace handling, sync content resolution, and stale async response suppression.
2. `packages/runner/test/ui/useActionTooltip.test.ts` still passes after moving action-tooltip state management onto the shared session primitive.
3. `packages/runner/test/ui/useCardTooltip.test.ts` still passes after moving card-tooltip state management onto the shared session primitive.
4. Targeted verification command: `pnpm -F @ludoforge/runner test -- useHoverPopoverSession useActionTooltip useCardTooltip`
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Hover-popover lifecycle policy remains entirely inside `packages/runner`; no engine-facing contracts or YAML/spec inputs are changed.
2. Session invalidation always beats debounce/grace timers and stale async completions.
3. The shared primitive is generic and does not encode action IDs, card-specific rules, surface revisions, or any game-specific behavior.
4. This ticket does not claim to solve detached-anchor rendering or action-surface invalidation; it only extracts the shared session lifecycle needed by those follow-up fixes.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/useHoverPopoverSession.test.ts` — locks the generic lifecycle contract before action/card rewiring grows.
2. `packages/runner/test/ui/useActionTooltip.test.ts` — proves the action hook preserves current user-visible behavior while adopting the shared controller.
3. `packages/runner/test/ui/useCardTooltip.test.ts` — proves the card hook preserves current debounce/grace behavior while adopting the shared controller.

### Commands

1. `pnpm -F @ludoforge/runner test -- useHoverPopoverSession`
2. `pnpm -F @ludoforge/runner test -- useActionTooltip useCardTooltip`
3. `pnpm -F @ludoforge/runner test`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - added `packages/runner/src/ui/useHoverPopoverSession.ts` as the shared debounce/grace/invalidation lifecycle primitive for hover-owned DOM popovers
  - rewired `useActionTooltip()` and `useCardTooltip()` onto that primitive and exposed lifecycle metadata plus explicit `invalidate` / `dismiss` controls
  - added dedicated lifecycle coverage in `packages/runner/test/ui/useHoverPopoverSession.test.ts`
  - strengthened action/card hook tests to cover status/ownership state and explicit invalidation
- Deviations from original plan:
  - kept this ticket narrowly scoped to shared hover-session lifecycle only
  - did not change `GameContainer`, `ActionToolbar`, `ActionTooltip`, or `EventCardTooltip`
  - did not implement action-surface revision invalidation or detached-anchor render gating; those remain follow-up work
- Verification results:
  - `pnpm -F @ludoforge/runner test -- useHoverPopoverSession useActionTooltip useCardTooltip`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner typecheck`
