# MONOREPO-003: pnpm Workspaces + Turborepo Configuration

**Spec**: 35 — Monorepo Restructure & Build System (D1, D2)
**Priority**: P0
**Depends on**: MONOREPO-002
**Blocks**: MONOREPO-004

---

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
- `turbo.json` exists with all 6 task definitions (build, schema:artifacts, test, lint, typecheck, dev, clean).
- `.turbo/` is in `.gitignore`.
- No source code or test code modified.
- Existing tests still pass identically.
