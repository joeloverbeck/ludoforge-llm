# MONOREPO-004: Move Engine Code to `packages/engine/`

**Spec**: 35 — Monorepo Restructure & Build System (D3 — file moves only)
**Priority**: P0
**Depends on**: MONOREPO-003
**Blocks**: MONOREPO-005, MONOREPO-006

---

## Objective

Use `git mv` to relocate the engine's source code, tests, schemas, and scripts into `packages/engine/`. Preserve git history for all moved files. This ticket performs the physical move ONLY — configuration files (package.json, tsconfig) are adapted in subsequent tickets.

---

## Tasks

1. Create `packages/engine/` directory.
2. Move the following using `git mv`:
   ```bash
   git mv src packages/engine/src
   git mv test packages/engine/test
   git mv schemas packages/engine/schemas
   git mv scripts packages/engine/scripts
   ```
3. Verify git history is preserved:
   ```bash
   git log --follow --oneline packages/engine/src/kernel/index.ts | head -5
   ```
   Must show commits from before the move.
4. Verify that `data/` remains at repo root (NOT moved).
5. Verify that `docs/`, `specs/`, `tickets/`, `archive/`, `brainstorming/`, `reports/` remain at repo root.
6. Verify that `.claude/`, `CLAUDE.md`, `AGENTS.md`, `README.md`, `LICENSE`, `.gitignore` remain at repo root.
7. Verify that `eslint.config.js` remains at repo root.
8. Commit the move as a single commit with message: `refactor: move engine code to packages/engine/`

**Important**: The project will NOT build after this ticket alone — the tsconfig and package.json adaptations happen in MONOREPO-005 and MONOREPO-006. This is intentional; the move must be a clean `git mv` commit for history preservation.

---

## Files Expected to Touch

| Action | Path |
|--------|------|
| git mv | `src/` → `packages/engine/src/` |
| git mv | `test/` → `packages/engine/test/` |
| git mv | `schemas/` → `packages/engine/schemas/` |
| git mv | `scripts/` → `packages/engine/scripts/` |

---

## Out of Scope

- Editing any file contents (this is moves only).
- Adapting `tsconfig.json` or `package.json` (MONOREPO-005, MONOREPO-006).
- Creating `tsconfig.base.json` (MONOREPO-005).
- Fixing `data/` path resolution in test helpers (MONOREPO-006).
- Creating the runner package (MONOREPO-007).
- Moving or modifying `data/`, `docs/`, `specs/`, `tickets/`, `archive/`, etc.

---

## Acceptance Criteria

### Tests that must pass

- N/A — the project is expected to be in a broken state after this commit. The next tickets (MONOREPO-005, MONOREPO-006) restore it.

### Invariants that must remain true

- `git log --follow packages/engine/src/kernel/index.ts` shows pre-move commit history.
- `git log --follow packages/engine/test/helpers/production-spec-helpers.ts` shows pre-move history.
- No files exist at old locations (`src/`, `test/`, `schemas/`, `scripts/` at repo root).
- `data/` directory remains at repo root, untouched.
- `eslint.config.js` remains at repo root, untouched.
- All files under `packages/engine/` are tracked by git (no untracked artifacts).
- The move commit contains ONLY renames (no content edits in the diff).
