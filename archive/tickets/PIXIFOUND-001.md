# PIXIFOUND-001: Add PixiJS v8 Dependencies to Runner Package

**Status**: ✅ COMPLETED
**Spec**: 38 (PixiJS Canvas Foundation)
**Deliverable**: Prerequisite for all D1–D14
**Priority**: P0
**Depends on**: None
**Blocks**: PIXIFOUND-002 through PIXIFOUND-015

---

## Objective

Install PixiJS v8, pixi-viewport v6, and @pixi/react v8 into the runner package, then verify the existing runner architecture still builds/tests cleanly.

---

## Reassessed Assumptions (Validated Against Codebase)

1. `packages/runner/package.json` currently has no PixiJS dependencies; this ticket is still required.
2. Runner scripts exist and are runnable for verification:
   - `pnpm -F @ludoforge/runner build`
   - `pnpm -F @ludoforge/runner typecheck`
   - `pnpm -F @ludoforge/runner test`
3. Current runner tests are worker/store/model-focused; there are no Pixi-specific tests yet, which is expected for this dependency-foundation ticket.
4. `pnpm-lock.yaml` records exact resolved versions. It does **not** store caret ranges (`^`), so compatibility must be validated by resolved versions satisfying the declared `package.json` ranges.

---

## Scope

- Add dependencies in `packages/runner/package.json`:
  - `pixi.js: ^8.2.0`
  - `pixi-viewport: ^6.0.1`
  - `@pixi/react: ^8.0.0`
- Update `pnpm-lock.yaml` via install.
- Verify build/typecheck/tests remain green.

### Out of Scope

- No canvas/rendering source files in this ticket.
- No engine package changes.
- No tsconfig/vite config changes unless install resolution forces them.

---

## Architectural Rationale

This change is beneficial versus the current architecture because it introduces only foundational dependencies required by Spec 38 while preserving the existing clean separation:

- `@pixi/react` will be used as mount/unmount glue (not reconciler-driven scene updates).
- Future rendering remains imperative and store-driven per Spec 38.
- No aliasing/back-compat layers are introduced; any breakage from dependency introduction should be fixed directly in subsequent implementation tickets.

This keeps the architecture extensible and game-agnostic without premature abstractions in this ticket.

---

## Files to Touch

- `packages/runner/package.json`
- `pnpm-lock.yaml`

---

## Implementation Steps

1. Add dependency entries to `packages/runner/package.json`.
2. Run `pnpm install`.
3. Run verification commands:
   - `pnpm -F @ludoforge/runner build`
   - `pnpm -F @ludoforge/runner typecheck`
   - `pnpm -F @ludoforge/runner test`
   - `pnpm -F @ludoforge/engine test`

---

## Acceptance Criteria

### Tests/Checks that must pass
- `pnpm -F @ludoforge/runner build`
- `pnpm -F @ludoforge/runner typecheck`
- `pnpm -F @ludoforge/runner test`
- `pnpm -F @ludoforge/engine test`

### Invariants that must remain true
- No source changes outside dependency manifests/lockfile for this ticket.
- Resolved lockfile versions satisfy declared ranges and are compatible with existing React 19 runner setup.

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Added `@pixi/react`, `pixi-viewport`, and `pixi.js` to `packages/runner/package.json`.
  - Updated `pnpm-lock.yaml` with resolved versions and transitive dependencies.
  - Corrected ticket assumptions before implementation (lockfile semantics and current test-scope assumptions).
- **Deviation from original plan**:
  - Clarified acceptance language from “lockfile matches caret ranges” to “resolved versions satisfy declared ranges,” which matches pnpm lockfile behavior.
- **Verification results**:
  - `pnpm -F @ludoforge/runner build` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner test` passed (11 files, 102 tests).
  - `pnpm -F @ludoforge/engine test` passed (244 tests).
  - `pnpm turbo lint` passed for `@ludoforge/engine` and `@ludoforge/runner`.
