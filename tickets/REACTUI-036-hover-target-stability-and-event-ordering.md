# REACTUI-036: Hover Target Stability + Event Ordering

**Spec**: 39 (React DOM UI Layer) — D19 hardening
**Priority**: P1
**Depends on**: REACTUI-016
**Estimated complexity**: M

---

## What Needs To Change

- Add a runtime hover-target controller in canvas runtime (single source of truth for current hovered target).
- Replace fragile boolean hover callbacks with target-aware enter/leave semantics.
  - Avoid clearing hover on `pointerout` unless leaving target matches current target.
- Define deterministic precedence for overlapping hits (token over zone should not flicker/null-transition incorrectly).
- Preserve existing selection behavior (this ticket is hover-state correctness only).

Likely files:
- `packages/runner/src/canvas/GameCanvas.tsx`
- `packages/runner/src/canvas/interactions/zone-select.ts`
- `packages/runner/src/canvas/interactions/token-select.ts`
- `packages/runner/test/canvas/GameCanvas.test.ts`
- `packages/runner/test/canvas/interactions/zone-select.test.ts`
- `packages/runner/test/canvas/interactions/token-select.test.ts`

---

## Invariants

- No tooltip flicker/null spikes during zone↔token hover transitions.
- Hover clear is target-safe (cannot clear a newer hover state from stale pointerout events).
- Selection dispatch behavior is unchanged.
- Hover pipeline remains generic and game-agnostic.

---

## Tests That Must Pass

- `packages/runner/test/canvas/interactions/token-select.test.ts`
  - Target-aware hover enter/leave callbacks are emitted.
  - Pointerout from token does not incorrectly clear newer zone/token hover.
- `packages/runner/test/canvas/interactions/zone-select.test.ts`
  - Target-aware hover enter/leave callbacks are emitted.
  - Pointerout clear semantics are guarded by current-target matching.
- `packages/runner/test/canvas/GameCanvas.test.ts`
  - Overlap ordering scenario: token hover over zone remains stable without transient null flicker.
  - Hover lifecycle clears exactly once on destroy/unmount.
