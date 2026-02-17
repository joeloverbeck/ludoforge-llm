# STATEMOD-013: Formalize GameStore Lifecycle as Explicit Transition Model

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: L
**Spec**: 37 — State Management & Render Model
**Deps**: STATEMOD-011

## Objective

Improve long-term extensibility by making lifecycle transitions explicit and validated. The store should act as a small deterministic state machine instead of ad hoc transition logic.

## Reassessed Assumptions (Post-STATEMOD-011)

- `STATEMOD-011` completed deterministic next-state render derivation in `packages/runner/src/store/game-store.ts`; render derivation mechanics are no longer in scope here.
- Remaining architectural debt is lifecycle transition governance (allowed/forbidden transitions and centralized guards).
- Current store behavior already passes lifecycle path tests, but transition validity is not encoded as an explicit model.

## Scope Update

This ticket is lifecycle-model focused only:

1. Introduce an internal lifecycle transition model (state-machine style) with explicit allowed transitions among `idle`, `initializing`, `playing`, and `terminal`.
2. Route lifecycle-affecting paths (`initGame`, `confirmMove`, `undo`, init failure/error paths) through that model.
3. Keep render derivation flow from `STATEMOD-011` intact (no rework/duplication).
4. Keep store public API stable unless a clearer contract requires deliberate breaking change.

## What Needs to Change / Be Added

1. Introduce an internal transition model for lifecycle-related updates in `packages/runner/src/store/game-store.ts`:
- encode allowed transitions (`idle`, `initializing`, `playing`, `terminal`)
- centralize transition guards in one internal helper/reducer.
2. Route lifecycle-affecting actions (`initGame`, `confirmMove`, `undo`, error paths) through this transition model.
3. Keep store public interface stable unless a cleaner contract requires a breaking rename/remove.

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
