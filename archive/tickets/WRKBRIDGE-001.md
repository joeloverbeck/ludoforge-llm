# WRKBRIDGE-001: Add Comlink Dependency and Runner Test Baseline

**Status**: ✅ COMPLETED
**Priority**: HIGH (prerequisite for WRKBRIDGE-002..006)
**Effort**: XS
**Spec**: 36 (Game Kernel Web Worker Bridge)
**Deps**: Spec 35 (Monorepo — completed)

## Reassessed Assumptions

- `packages/runner` currently has no `comlink` dependency.
- `packages/runner` currently has no test script and no `test/` directory.
- The runner is Vite + TypeScript, and upcoming WRKBRIDGE tests target worker/main-thread bridge behavior; a TS-native test runner is the cleanest baseline.

## Scope

Establish the minimal runner foundation for Spec 36 work by adding:
1. Runtime `comlink` dependency.
2. Runner-local test infrastructure using Vitest (`vitest run`) so future worker-bridge tests can stay in TypeScript.
3. Initial worker-test directory and a minimal smoke test proving the test command executes.

## What to Change

1. Add `comlink@^4.4.2` to `packages/runner/package.json` `dependencies`.
2. Add `vitest` to `packages/runner/package.json` `devDependencies`.
3. Add `test` script in `packages/runner/package.json`: `vitest run`.
4. Create runner test structure:
   - `packages/runner/test/worker/`
   - `packages/runner/test/worker/smoke.test.ts` (minimal passing smoke test)
5. Add `packages/runner/vitest.config.ts` configured for Node environment and `test/**/*.test.ts` discovery.
6. Update lockfile via workspace install.

## Files to Touch

- `packages/runner/package.json` — dependency + script updates
- `packages/runner/vitest.config.ts` — **NEW FILE**
- `packages/runner/test/worker/smoke.test.ts` — **NEW FILE**
- `pnpm-lock.yaml` — updated by install

## Out of Scope

- Do NOT modify any engine source code (`packages/engine/src/**`).
- Do NOT create worker or bridge implementation files (WRKBRIDGE-002/003).
- Do NOT add React component testing libraries.
- Do NOT modify `turbo.json`.

## Acceptance Criteria

### Tests that must pass
- `pnpm -F @ludoforge/runner typecheck` passes.
- `pnpm -F @ludoforge/runner test` passes.
- `pnpm turbo build` succeeds.

### Invariants
- Engine source files remain untouched.
- Runner `package.json` has `comlink` in `dependencies` (runtime usage).
- Test infrastructure is present and executable from package script.

## Outcome

- **Completion date**: 2026-02-17
- **What changed**:
  - Added `comlink` runtime dependency to `packages/runner`.
  - Added Vitest baseline in runner (`test` script + `vitest.config.ts`).
  - Added `packages/runner/test/worker/smoke.test.ts` to verify runner tests execute.
  - Updated `pnpm-lock.yaml`.
- **Deviation from original plan**:
  - Chose Vitest (Vite-native TS workflow) instead of Node's built-in test runner to better support upcoming worker bridge TS tests without ad hoc transpilation.
- **Verification**:
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm turbo build`
  - `pnpm turbo test`
  - `pnpm turbo lint`
