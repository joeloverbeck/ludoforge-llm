# MONOREPO-008: Post-Move Verification & Documentation Update

**Spec**: 35 — Monorepo Restructure & Build System (D8 — post-move verification)
**Priority**: P0
**Depends on**: MONOREPO-006, MONOREPO-007

---

## Objective

Run the full Spec 35 D8 post-move verification checklist. Update `CLAUDE.md` and `AGENTS.md` to reflect the new monorepo directory structure. Verify that the schema artifacts pipeline, ESLint, and all test suites work correctly in the new layout.

---

## Tasks

### 1. Post-move verification checklist (from Spec 35 D8)

Run each and confirm:

- [ ] `pnpm install` completes without errors.
- [ ] `pnpm turbo build` compiles both packages (engine + runner).
- [ ] `pnpm -F @ludoforge/engine test` passes all existing tests.
- [ ] `pnpm -F @ludoforge/runner dev` starts Vite dev server.
- [ ] Runner scaffold renders a React component that imports a type from `@ludoforge/engine`.
- [ ] `git log --follow packages/engine/src/kernel/index.ts` shows full pre-move history.
- [ ] Engine test that compiles FITL from `data/` still works (path resolution verified).
- [ ] Engine test that compiles Texas Hold'em from `data/` still works.
- [ ] `pnpm turbo schema:artifacts` generates schemas correctly in `packages/engine/schemas/`.
- [ ] No Vite resolve aliases used (check `packages/runner/vite.config.ts`).
- [ ] `pnpm turbo lint` passes.
- [ ] `pnpm turbo typecheck` passes.

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
- `CLAUDE.md` "Project Structure" tree shows `packages/engine/` and `packages/runner/`.
- `CLAUDE.md` "Tech Stack" mentions pnpm, Turborepo, Vite, React 19.
- All engine test counts match the MONOREPO-001 baseline (no tests lost or broken).
- `AGENTS.md` is consistent with `CLAUDE.md` on structural information.
- No engine source code or test logic has been modified (only documentation files touched in this ticket).
