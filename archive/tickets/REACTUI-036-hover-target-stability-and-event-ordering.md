# REACTUI-036: Hover Target Stability + Event Ordering
**Status**: ✅ COMPLETED

**Spec**: 39 (React DOM UI Layer) — D19 hardening
**Priority**: P1
**Depends on**: REACTUI-016
**Estimated complexity**: M

---

## Assumption Reassessment (2026-02-18)

- `GameCanvas` already includes hover-anchor publishing in screen space and a `HoveredCanvasTarget` contract.
- Current hover interactions still use boolean `onHoverChange(isHovered)` callbacks in `zone-select`/`token-select`.
- Hover target state is currently maintained inline in `GameCanvas` and is vulnerable to stale leave ordering (a leave from an older target can clear a newer target).
- Existing tests cover basic hover enter/leave callbacks but do **not** fully assert stale leave protection or deterministic overlap precedence.

Ticket scope is therefore refined: do **not** re-implement hover-anchor pipeline; harden hover-target state transitions and event contracts.

---

## Updated Scope

- Introduce a runtime hover-target controller as the single source of truth for hovered target lifecycle.
  - Deterministic precedence for overlaps: token target takes priority over zone target.
  - Leave handling is target-safe: a leave event can only clear/swap current hover if it applies to the active target state.
- Replace boolean hover callbacks with target-aware enter/leave semantics.
  - `onHoverEnter(target)` / `onHoverLeave(target)` from interaction handlers.
- Keep selection dispatch behavior unchanged.
- Keep hover pipeline generic and game-agnostic.

Likely files:
- `packages/runner/src/canvas/GameCanvas.tsx`
- `packages/runner/src/canvas/interactions/zone-select.ts`
- `packages/runner/src/canvas/interactions/token-select.ts`
- `packages/runner/src/canvas/interactions/hover-target-controller.ts` (new)
- `packages/runner/test/canvas/GameCanvas.test.ts`
- `packages/runner/test/canvas/interactions/zone-select.test.ts`
- `packages/runner/test/canvas/interactions/token-select.test.ts`
- `packages/runner/test/canvas/interactions/hover-target-controller.test.ts` (new)

---

## Invariants

- No tooltip flicker/null spikes during zone↔token hover transitions caused by stale leave ordering.
- Hover clear is target-safe (cannot clear a newer hover state from stale leave events).
- Overlap precedence is deterministic (token over zone).
- Selection dispatch behavior is unchanged.
- Hover pipeline remains generic and game-agnostic.

---

## Tests That Must Pass

- `packages/runner/test/canvas/interactions/token-select.test.ts`
  - Emits target-aware hover enter/leave callbacks with token target payload.
- `packages/runner/test/canvas/interactions/zone-select.test.ts`
  - Emits target-aware hover enter/leave callbacks with zone target payload.
- `packages/runner/test/canvas/interactions/hover-target-controller.test.ts` (new)
  - Stale leave from previous target does not clear current hover target.
  - Deterministic precedence: token target wins over zone while both are active.
  - Leaving active top-priority target falls back to remaining hovered target.
- `packages/runner/test/canvas/GameCanvas.test.ts`
  - Runtime wiring uses target-aware enter/leave callbacks.
  - Overlap ordering scenario remains stable without transient null hover anchor emissions.
  - Hover lifecycle clears exactly once on destroy/unmount.

---

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Added `hover-target-controller` runtime module to centralize hover target lifecycle and precedence.
  - Replaced boolean hover callbacks with target-aware `onHoverEnter`/`onHoverLeave` in zone/token interaction handlers.
  - Wired `GameCanvas` runtime to consume hover controller state for anchor publishing.
  - Added/updated tests to validate stale leave safety, overlap precedence, fallback behavior, and runtime hover-anchor stability.
- **Deviations from original plan**:
  - Did not rebuild hover-anchor publishing; existing screen-space anchor pipeline already existed and was preserved.
  - Implemented microtask-batched hover target recomputation in controller to avoid transient ordering artifacts.
- **Verification**:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner typecheck`
