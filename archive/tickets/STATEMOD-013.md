# STATEMOD-013: Formalize GameStore Lifecycle as Explicit Transition Model

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: L
**Spec**: 37 — State Management & Render Model
**Deps**: STATEMOD-011

## Objective

Improve long-term extensibility by making lifecycle transitions explicit and validated. The store should act as a small deterministic state machine instead of ad hoc transition logic.

## Reassessed Assumptions (Post-STATEMOD-011)

- `STATEMOD-011` completed deterministic next-state render derivation in `packages/runner/src/store/game-store.ts`; render derivation mechanics are no longer in scope here.
- Current lifecycle tests already verify important behavior paths (`initGame` success/failure, `initializing` visibility, terminal/undo transitions), so this is not a functional-bug ticket.
- Remaining architectural debt is lifecycle transition governance: transitions are still assigned ad hoc (`toLifecycle(...)` + direct writes) instead of enforced by one explicit transition model.
- There is no first-class transition matrix/helper module yet, so invalid transitions are not structurally prevented in implementation.

## Scope Update

This ticket is lifecycle-model focused only:

1. Introduce an internal lifecycle transition model (state-machine style) with explicit allowed transitions among `idle`, `initializing`, `playing`, and `terminal`.
2. Route lifecycle-affecting paths (`initGame`, `confirmMove`, `undo`, init failure/error paths) through that model.
3. Keep render derivation flow from `STATEMOD-011` intact (no rework/duplication).
4. Favor the cleanest internal contract over compatibility shims; do not introduce alias APIs.

## What Needs to Change / Be Added

1. Introduce an internal transition model for lifecycle-related updates in `packages/runner/src/store/game-store.ts`:
- encode allowed transitions (`idle`, `initializing`, `playing`, `terminal`)
- centralize transition guards in one internal helper/reducer.
2. Route lifecycle-affecting actions (`initGame`, `confirmMove`, `undo`, error paths) through this transition model.
3. Keep store surface minimal; if an internal rename/removal yields a cleaner architecture, apply it directly (no compatibility aliasing).

## Architecture Decision

Adopt a first-class lifecycle transition matrix + transition helper/reducer. This makes invalid transitions unrepresentable in implementation and localizes lifecycle policy to one place, improving correctness and extensibility.

## Invariants That Must Pass

- Illegal lifecycle transitions are impossible by construction.
- `initGame` always passes through `initializing` before `playing/terminal`.
- `undo` can transition `terminal -> playing` only when bridge returns restored state.
- Error paths return to a coherent lifecycle state with no mixed-session artifacts.

## Tests That Must Pass

- Existing: `pnpm -F @ludoforge/runner test`
- Existing: `pnpm -F @ludoforge/runner lint`
- Existing: `pnpm -F @ludoforge/runner typecheck`
- New/updated tests in `packages/runner/test/store/game-store.test.ts`:
- explicit transition-matrix coverage (allowed and rejected transitions)
- illegal transition attempts are unrepresentable/unreachable in implementation
- transition sequence assertions for success, terminal, undo, and failure flows

## Outcome

- **Completed**: 2026-02-17
- **What changed**:
  - Added `packages/runner/src/store/lifecycle-transition.ts` with an explicit allowed-transition matrix and guarded transition helper.
  - Routed `game-store` lifecycle writes through guarded transitions for init start/success/failure, confirm-move mutation, undo mutation, and bridge-error stabilization.
  - Preserved `STATEMOD-011` render derivation flow and kept lifecycle policy centralized instead of inferred from scattered assignments.
  - Added `packages/runner/test/store/lifecycle-transition.test.ts` for explicit allowed/rejected transition coverage.
  - Added a store regression test ensuring non-init bridge errors preserve lifecycle coherence while surfacing structured error state.
- **Deviation vs original plan**:
  - Transition-matrix tests were added in a dedicated new test file (`lifecycle-transition.test.ts`) rather than only extending `game-store.test.ts`, to keep lifecycle policy unit-testable as a pure module.
- **Verification**:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner typecheck`
