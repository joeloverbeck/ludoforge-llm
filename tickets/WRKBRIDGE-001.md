# WRKBRIDGE-001: Add Comlink Dependency and Runner Test Infrastructure

**Status**: PENDING
**Priority**: HIGH (blocker for all other WRKBRIDGE tickets)
**Effort**: XS
**Spec**: 36 (Game Kernel Web Worker Bridge)
**Deps**: Spec 35 (Monorepo — completed)

## Problem

The runner package (`packages/runner`) needs `comlink` as a runtime dependency to expose the kernel API across a Web Worker boundary. Comlink is not currently installed. Additionally, the runner has no test infrastructure — no `test/` directory, no test script in `package.json`.

## What to Change

1. Add `comlink@^4.4.2` as a dependency in `packages/runner/package.json`.
2. Run `pnpm install` to update the lockfile.
3. Add a `test` script to `packages/runner/package.json` pointing to Node.js built-in test runner (or Vitest if the runner already uses Vite — check project conventions).
4. Create `packages/runner/test/` directory structure:
   - `packages/runner/test/worker/` (for WRKBRIDGE-003 and WRKBRIDGE-004)
5. Verify `comlink` types resolve correctly by adding a minimal type-only import in a scratch file or confirming `tsc --noEmit` still passes.

## Files to Touch

- `packages/runner/package.json` — add dependency + test script
- `pnpm-lock.yaml` — updated by install
- `packages/runner/tsconfig.json` — may need to add `test/` to `include` if tests use TS

## Out of Scope

- Do NOT modify any engine code (`packages/engine/`).
- Do NOT create worker or bridge source files (that is WRKBRIDGE-002).
- Do NOT add React testing libraries (runner UI tests are a separate concern).
- Do NOT modify `turbo.json` (the `test` task already exists generically).

## Acceptance Criteria

### Tests that must pass
- `pnpm -F @ludoforge/runner typecheck` passes (comlink types resolve).
- `pnpm turbo build` succeeds (no breakage from new dependency).

### Invariants
- Engine package is untouched (`git diff packages/engine/` is empty).
- `pnpm turbo test` (engine tests) still passes.
- Runner `package.json` has `comlink` in `dependencies` (not `devDependencies` — it's used at runtime in bundled code).
