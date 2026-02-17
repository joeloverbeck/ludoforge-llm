# MONOREPO-003: pnpm Workspaces + Turborepo Configuration

**Status**: ✅ COMPLETED
**Spec**: 35 — Monorepo Restructure & Build System (D1, D2)
**Priority**: P0
**Depends on**: MONOREPO-002
**Blocks**: MONOREPO-004

---

## Assumptions Revalidated (2026-02-17)

- Repo is still in single-package layout (`src/`, `test/`, `schemas/`, `scripts/` at root).
- `packages/` does not exist yet.
- `pnpm-workspace.yaml` does not exist yet.
- `turbo.json` does not exist yet.
- Root `package.json` scripts still run direct local commands (`tsc`, `node --test`, etc.), which is expected before MONOREPO-006.
- Root devDependencies do not yet include `turbo`.
- `.gitignore` does not yet include `.turbo/`.

These assumptions align with Spec 35 D1/D2 and with dependency ordering (`MONOREPO-002` completed; `MONOREPO-004+` not yet executed).

## Objective

Set up the monorepo infrastructure: create `pnpm-workspace.yaml`, install Turborepo, and create `turbo.json` with the task pipeline. After this ticket, `pnpm turbo build` should work (even though packages haven't been moved yet — it will find nothing to build, which is fine).

---

## Tasks

1. Create `pnpm-workspace.yaml` at repo root:
   ```yaml
   packages:
     - "packages/*"
   ```
2. Create `packages/` directory (empty for now).
3. Install Turborepo as a root dev dependency: `pnpm add -Dw turbo`.
4. Create `turbo.json` at repo root with the task pipeline from Spec 35 D2:
   ```jsonc
   {
     "$schema": "https://turbo.build/schema.json",
     "tasks": {
       "build": {
         "dependsOn": ["^build"],
         "outputs": ["dist/**"]
       },
       "schema:artifacts": {
         "dependsOn": ["build"],
         "outputs": ["schemas/**"]
       },
       "test": {
         "dependsOn": ["build"]
       },
       "lint": {},
       "typecheck": {
         "dependsOn": ["^build"]
       },
       "dev": {
         "cache": false,
         "persistent": true
       },
       "clean": {
         "cache": false
       }
     }
   }
   ```
5. Add `.turbo/` to `.gitignore`.
6. Verify `pnpm turbo build` runs without error (should be a no-op — no packages yet).

---

## Files Expected to Touch

| Action | File |
|--------|------|
| Create | `pnpm-workspace.yaml` |
| Create | `packages/` (empty directory) |
| Create | `turbo.json` |
| Edit | `.gitignore` (add `.turbo/`) |
| Edit | `pnpm-lock.yaml` (turbo added) |

---

## Out of Scope

- Moving source code into `packages/engine/` (that's MONOREPO-004).
- Creating `packages/runner/` (that's MONOREPO-007).
- Changing `tsconfig.json` or `eslint.config.js`.
- Modifying the root `package.json` scripts to use turbo (that's MONOREPO-006).
- Any engine source or test code changes.

---

## Acceptance Criteria

### Tests that must pass

- `pnpm turbo build` exits 0 (no packages to build, but no errors).
- Existing `pnpm run build && pnpm test` still works (root scripts unchanged).
- `turbo.json` validates against the Turborepo JSON Schema.

### Invariants that must remain true

- `pnpm-workspace.yaml` exists with `packages: ["packages/*"]`.
- `turbo.json` exists with all 7 task definitions (build, schema:artifacts, test, lint, typecheck, dev, clean).
- `.turbo/` is in `.gitignore`.
- No source code or test code modified.
- Existing tests still pass identically.

---

## Architecture Reassessment

The proposed D1/D2 changes are more beneficial than the current architecture and should proceed:

- `pnpm-workspace.yaml` establishes explicit workspace boundaries early, reducing ambiguity before physical package moves.
- Turborepo introduces deterministic task graph orchestration (`dependsOn`, cache scopes) that scales better than independent root scripts once `engine` and `runner` packages exist.
- Keeping source/test files untouched in this ticket preserves migration safety while still validating the monorepo control plane.
- Deferring script rewrites to MONOREPO-006 maintains ticket isolation and cleaner fault localization if regressions appear.

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed vs. original plan**:
  - Added an explicit assumptions revalidation section before implementation to capture then-current repo state and prevent stale-ticket execution drift.
  - Installed `turbo` at the root as a dev dependency (resolved to `2.8.9` in `pnpm-lock.yaml`).
  - Created `pnpm-workspace.yaml`, `turbo.json`, and `packages/` directory, and added `.turbo/` to `.gitignore`.
- **Verification results**:
  - `pnpm turbo build`: pass (0 packages in scope; no-op run exits 0).
  - `pnpm run build`: pass.
  - `pnpm test`: pass (`243` tests, `243` passed, `0` failed).
  - `pnpm run lint`: pass.
  - `pnpm run typecheck`: pass.
  - `pnpm run test:e2e` (extra hard-check): pass (`3` tests, `3` passed, `0` failed).
