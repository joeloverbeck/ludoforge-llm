# MONOREPO-004: Move Engine Code to `packages/engine/`

**Status**: ✅ COMPLETED
**Spec**: 35 — Monorepo Restructure & Build System (D3 — physical relocation foundation)
**Priority**: P0
**Depends on**: MONOREPO-003
**Blocks**: MONOREPO-005, MONOREPO-006

---

## Assumptions Revalidated (2026-02-17)

- Repo is still in single-package layout: `src/`, `test/`, `schemas/`, and `scripts/` exist at root.
- `packages/` exists (created in MONOREPO-003) but currently has no `engine/` or `runner/` package.
- Root build/test pipeline is green before this move (`pnpm run build`, `pnpm test` pass).
- `data/` is intentionally rooted at repository level and must remain there.
- `specs/35-monorepo-restructure-build-system.md` includes D3 as relocation plus config adaptation split across subsequent tickets.
- Current active ticket sequence (`MONOREPO-004` through `MONOREPO-008`) is required to restore a fully green monorepo state.

Discrepancy corrected:
- Prior wording implied this ticket should be archived while the repo is intentionally broken. For this implementation pass, D3 relocation is executed first, then dependent MONOREPO tickets are completed in sequence so build/tests/lint/typecheck are green before ticket archival.

---

## Objective

Relocate engine source code, tests, schemas, and scripts into `packages/engine/` while preserving git history and repository invariants. This ticket establishes the physical package boundary and prepares a clean base for MONOREPO-005/006 configuration work.

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
4. Verify `data/` remains at repo root (not moved).
5. Verify `docs/`, `specs/`, `tickets/`, `archive/`, `brainstorming/`, and `reports/` remain at repo root.
6. Verify `.claude/`, `CLAUDE.md`, `AGENTS.md`, `README.md`, `LICENSE`, `.gitignore` remain at repo root.
7. Verify `eslint.config.js` remains at repo root.
8. Do not introduce functional source changes in this ticket beyond file relocation.

---

## Files Expected to Touch

| Action | Path |
|--------|------|
| `git mv` | `src/` → `packages/engine/src/` |
| `git mv` | `test/` → `packages/engine/test/` |
| `git mv` | `schemas/` → `packages/engine/schemas/` |
| `git mv` | `scripts/` → `packages/engine/scripts/` |

---

## Out of Scope

- Adapting `tsconfig` and `package.json` files (MONOREPO-005 and MONOREPO-006).
- Creating `packages/runner/` (MONOREPO-007).
- Post-move docs verification updates (MONOREPO-008).
- Moving `data/`, `docs/`, `specs/`, `tickets/`, `archive/`, `brainstorming/`, or `reports/`.

---

## Acceptance Criteria

### Tests that must pass

- Structural move verification passes (`git status`, tree invariants, history checks).
- End-to-end repository health (build/test/lint/typecheck) is validated before archiving this ticket via completion of dependent MONOREPO tickets.

### Invariants that must remain true

- `git log --follow packages/engine/src/kernel/index.ts` shows pre-move commit history.
- `git log --follow packages/engine/test/helpers/production-spec-helpers.ts` shows pre-move commit history.
- No files remain at old root locations (`src/`, `test/`, `schemas/`, `scripts/`).
- `data/` remains at repo root, untouched.
- `eslint.config.js` remains at repo root, untouched.
- All moved files are tracked by git.
- Diff for this ticket contains only relocations (no semantic code changes).

---

## Architecture Reassessment

The proposed move remains beneficial versus the current architecture:

- It creates a strict package boundary for engine code, which is required for long-term extensibility (`@ludoforge/engine` as reusable runtime/compiler core).
- It enables package-scoped build/test pipelines and typed inter-package dependencies (required by runner work in Spec 35+).
- Keeping data and project-management docs at root preserves shared assets without coupling runtime code to repository layout internals.
- A move-first phase keeps migration risk localized; subsequent config tickets can be validated independently and with hard tests.

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed vs. original plan**:
  - Revalidated and corrected ticket assumptions before implementation to align with the requirement that the repository end state remains buildable/test-green before archival.
  - Performed physical relocation with `git mv` for `src/`, `test/`, `schemas/`, and `scripts` into `packages/engine/`.
  - Kept all repository-root invariants (`data/`, docs/spec/ticket/archive folders, root metadata/config files).
- **Deviations**:
  - The `git log --follow` verification on new paths is commit-sensitive; before commit, history was validated via staged rename tracking plus old-path history checks.
- **Verification results**:
  - Root non-engine directories/files remained at repo root.
  - Old root engine paths no longer exist.
  - `git status --short` reports path changes as renames (`R`), confirming history-preserving move intent.
