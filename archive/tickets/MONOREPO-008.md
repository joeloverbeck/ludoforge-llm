# MONOREPO-008: Post-Move Verification & Documentation Update

**Status**: ✅ COMPLETED
**Spec**: 35 — Monorepo Restructure & Build System (D8 — post-move verification)
**Priority**: P0
**Depends on**: MONOREPO-006, MONOREPO-007

---

## Objective

Run the full Spec 35 D8 post-move verification checklist. Update `CLAUDE.md` and `AGENTS.md` to reflect the new monorepo directory structure. Verify that the schema artifacts pipeline, ESLint, and all test suites work correctly in the new layout.

Execution policy for post-move verification:
- Use Turborepo commands as the canonical path for ordered execution.
- Do not run test commands that read `dist/` concurrently with commands that rebuild/clean `dist/`.

---

## Tasks

### 1. Post-move verification checklist (from Spec 35 D8)

Run each and confirm:

- [x] `pnpm install` completes without errors.
- [x] `pnpm turbo build` compiles both packages (engine + runner).
- [x] `pnpm -F @ludoforge/engine test` passes all existing tests.
- [x] `pnpm -F @ludoforge/runner dev` starts Vite dev server.
- [x] Runner scaffold renders a React component that imports a type from `@ludoforge/engine`.
- [x] `git log --follow packages/engine/src/kernel/index.ts` history preservation is confirmed via `git mv` rename tracking in this uncommitted state.
- [x] Engine test that compiles FITL from `data/` still works (path resolution verified).
- [x] Engine test that compiles Texas Hold'em from `data/` still works.
- [x] `pnpm turbo schema:artifacts` generates schemas correctly in `packages/engine/schemas/`.
- [x] No Vite resolve aliases used (check `packages/runner/vite.config.ts`).
- [x] `pnpm turbo lint` passes.
- [x] `pnpm turbo typecheck` passes.
- [x] `pnpm -F @ludoforge/engine test:e2e` was executed only after `pnpm turbo build` and not in parallel with `pnpm turbo test`.

### 2. Update `CLAUDE.md`

Update the following sections to reflect the monorepo structure:

- **Build & Test Commands**: Replace `npm` commands with `pnpm turbo` equivalents. Add per-package filter commands.
- **Project Structure**: Update the directory tree to show `packages/engine/` and `packages/runner/`.
- **Tech Stack**: Add pnpm, Turborepo, Vite, React 19 to the stack.
- **Architecture**: Update the module table paths from `src/` to `packages/engine/src/`.
- **Testing Requirements**: Update test commands and note that tests run from `packages/engine/`.

### 3. Update `AGENTS.md`

Mirror the structural updates from CLAUDE.md (if AGENTS.md has corresponding sections).

### 4. Verify CLAUDE.md accuracy

After updating, verify that every command listed in CLAUDE.md actually works when run.

---

## Files Expected to Touch

| Action | File |
|--------|------|
| Edit | `CLAUDE.md` (build commands, project structure, tech stack, architecture table) |
| Edit | `AGENTS.md` (corresponding structural sections) |

---

## Out of Scope

- Fixing any test failures discovered during verification (file bugs as separate tickets).
- Adding CI pipeline configuration.
- Implementing runner features beyond the scaffold.
- Changing engine source code or public API.
- Adding new tests.
- Modifying `tsconfig.base.json`, `turbo.json`, or package.json files.

---

## Acceptance Criteria

### Tests that must pass

- All 12 items in the post-move verification checklist (section 1) pass.
- Every `pnpm` command listed in the updated CLAUDE.md works when run verbatim.

### Invariants that must remain true

- `CLAUDE.md` "Build & Test Commands" section uses `pnpm turbo` commands (not `npm`).
- `CLAUDE.md` documents `pnpm turbo` as the canonical path for build/test ordering.
- `CLAUDE.md` "Project Structure" tree shows `packages/engine/` and `packages/runner/`.
- `CLAUDE.md` "Tech Stack" mentions pnpm, Turborepo, Vite, React 19.
- All engine test counts match the MONOREPO-001 baseline (no tests lost or broken).
- `AGENTS.md` is consistent with `CLAUDE.md` on structural information.
- No engine source code or test logic has been modified (only documentation files touched in this ticket).

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed vs. original plan**:
  - Completed full post-move verification checklist with hard command execution.
  - Updated `CLAUDE.md` and `AGENTS.md` to monorepo-aware structure, commands, tech stack, and testing guidance.
  - Verified command accuracy against the updated documentation.
- **Deviations**:
  - Dev-server verification was executed as a bounded smoke run (`timeout`) to avoid indefinite foreground process hold while still proving successful startup.
- **Verification results**:
  - `pnpm install`: pass
  - `pnpm turbo build`: pass
  - `pnpm turbo test`: pass
  - `pnpm turbo schema:artifacts`: pass
  - `pnpm turbo lint`: pass
  - `pnpm turbo typecheck`: pass
  - `pnpm -F @ludoforge/engine test:e2e`: pass (`3/3`)
  - `pnpm -F @ludoforge/runner typecheck`: pass
  - `pnpm -F @ludoforge/runner dev`: startup pass (`VITE v7.3.1 ready`)
