# REACTUI-034: Marker/Effect RenderModel Boundary Regression Suite

**Status**: ✅ COMPLETED
**Spec**: 37 (State Management), 39 (React DOM UI Layer)
**Priority**: P1
**Depends on**: REACTUI-031, REACTUI-032
**Estimated complexity**: S

---

## Summary

Add strict boundary/regression tests for marker/effect projection contracts so malformed or sparse game metadata cannot silently leak fragile UI behavior.

---

## Assumption Reassessment (2026-02-18)

- `packages/runner/test/model/derive-render-model-state.test.ts` already contains substantial boundary coverage introduced by prior REACTUI work:
  - missing lattice entries fallback to empty `possibleStates`.
  - sparse optional metadata (`globalMarkers`, `activeLastingEffects`, `eventDecks`, `interruptPhaseStack`) handled without crashes.
  - deterministic marker/effect attribute ordering is already asserted.
- `packages/runner/test/ui/GlobalMarkersBar.test.ts` and `packages/runner/test/ui/ActiveEffectsPanel.test.ts` currently cover happy-path rendering but under-cover sparse projection payloads (for example empty possible-states rendering on the panel and zero-attribute effects).
- The original ticket wording implies broader model-layer gaps than currently exist. The remaining work is now primarily regression hardening for edge-case projections and tightening deterministic expectations where not yet explicit.

---

## What Needs to Change

- Add narrowly-scoped model regression assertions in `packages/runner/test/model/derive-render-model-state.test.ts` only where coverage is still missing:
  - explicit unknown marker *state value* passthrough with known lattice `possibleStates` retained.
  - explicit deterministic ordering assertion for global marker/effect lists under intentionally unsorted source payloads.
- Strengthen UI regression tests for sparse-but-valid projection inputs:
  - `packages/runner/test/ui/GlobalMarkersBar.test.ts`: assert empty `possibleStates` renders deterministic tooltip text (`Possible states: none`) in component output.
  - `packages/runner/test/ui/ActiveEffectsPanel.test.ts`: assert effect entries with empty `attributes` render without crashing and keep stable list row output.
- Do not change production projection semantics unless tests expose a real deterministic or boundary defect.
- Keep validation/projection boundary in model derivation (UI remains a tolerant display consumer, not semantic validator).

---

## Invariants

- Marker/effect projection boundary behavior is deterministic and explicitly tested.
- UI components remain tolerant display consumers of RenderModel outputs.
- No game-specific conditionals are introduced in tests or production code.
- Contract regressions fail fast in model tests before UI behavior drifts.

---

## Tests that Should Pass

- `packages/runner/test/model/derive-render-model-state.test.ts`
  - marker/effect boundary cases remain deterministic, including unknown marker state passthrough.
- `packages/runner/test/ui/GlobalMarkersBar.test.ts`
  - robust rendering for projection edge cases including empty `possibleStates`.
- `packages/runner/test/ui/ActiveEffectsPanel.test.ts`
  - robust rendering for projection edge cases including empty `attributes`.
- `pnpm -F @ludoforge/runner test`
  - targeted runner suite remains green after regression hardening.
- `pnpm -F @ludoforge/runner lint`
  - runner lint remains green.

---

## Outcome

- **Completion date**: 2026-02-18
- **What was actually changed**:
  - Reassessed and corrected ticket assumptions to reflect existing model boundary coverage already delivered by REACTUI-031/032.
  - Added model regression tests for:
    - unknown marker state passthrough while retaining lattice `possibleStates`.
    - deterministic projection behavior under intentionally unsorted marker/effect source payloads.
  - Added UI regression tests for sparse projection inputs:
    - empty `possibleStates` tooltip behavior in `GlobalMarkersBar`.
    - empty `attributes` rendering behavior in `ActiveEffectsPanel`.
- **Deviations from original plan**:
  - No production code changes were required; existing architecture already satisfied projection-boundary ownership and determinism goals.
  - Scope narrowed to regression hardening where real gaps existed (tests only), instead of broad model/UI rewrites.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm -F @ludoforge/runner typecheck` ⚠️ fails due pre-existing unrelated `src/ui/GameContainer.tsx` `OverlayRegionPanel` nullability mismatch in this branch.
