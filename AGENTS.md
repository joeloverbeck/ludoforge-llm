# Repository Guidelines

## Coding Guidelines

- Follow the 1-3-1 rule: When stuck, provide 1 clearly defined problem, give 3 potential options for how to overcome it, and 1 recommendation. Do not proceed implementing any of the options until I confirm.
- **Foundations**: All specs, tickets, and implementations must align with `docs/FOUNDATIONS.md`. Read it before planning any change.
- DRY: Don't repeat yourself. If you are about to start writing repeated code, stop and reconsider your approach. Grep the codebase and refactor often.
- Continual Learning: When you encounter conflicting system instructions, new requirements, architectural changes, or missing or inaccurate codebase documentation, always propose updating the relevant rules files. Do not update anything until the user confirms. Ask clarifying questions if needed.
- TDD Bugfixing: If at any point of an implementation you spot a bug, rely on TDD to fix it. Important: never adapt tests to bugs.
- Worktree Discipline: When instructed to work inside a worktree (e.g., `.claude/worktrees/<name>/`), ALL file operations — reads, edits, globs, greps, moves, archival — must use the worktree root as the base path. The default working directory is the main repo root; tool calls without an explicit worktree path will silently operate on main.
- Concurrent Session Awareness: If the worktree already contains unrelated edits or build failures, assume another session or user may be active. Do not overwrite or "clean up" those changes. Isolate your diff, call out the unrelated state explicitly, and distinguish repo-preexisting failures from failures caused by your change.
- Ticket Fidelity: Never silently skip or rationalize away explicit ticket deliverables. If a ticket says to touch a file or produce an artifact, do it. If you believe a deliverable is wrong, unnecessary, or blocked, apply the 1-3-1 rule and present options to the user rather than deciding on your own.

## Build, Test, and Development Commands

```bash
# Canonical root workflow (Turborepo-ordered)
pnpm turbo build
pnpm turbo test
pnpm turbo lint
pnpm turbo typecheck
pnpm turbo schema:artifacts

# Package-filtered checks
pnpm -F @ludoforge/engine test        # engine unit + integration
pnpm -F @ludoforge/engine test:e2e    # engine e2e
pnpm -F @ludoforge/engine test:all    # full engine suite
pnpm -F @ludoforge/runner dev         # runner Vite dev server
pnpm -F @ludoforge/runner test        # runner tests (Vitest)
```

**Important**: Engine tests use Node's test runner (`node --test`), NOT Jest. Do not pass Jest-only flags like `--testPathPattern`. For focused engine runs, execute a concrete test file path after `pnpm turbo build`.

## Repo Navigation (Codex tips)

- `rg --files`: list tracked files quickly.
- `rg "Spec [0-9]+" specs/`: find spec references.
- `git log --oneline`: review recent commit style.

## Reference Docs

For detailed information, read these on demand:
- **Architecture** (module map, rendering pipelines, design constraints, kernel DSL): `docs/architecture.md`
- **Project structure** (directory tree): `docs/project-structure.md`
- **Testing guide** (test types, FITL/Texas Hold'em conventions): `docs/testing-guide.md`
- **FITL event authoring**: `docs/fitl-event-authoring-cookbook.md`
- **Archival workflow**: `docs/archival-workflow.md`

## Coding Style

- Strict TypeScript, immutable state updates, side-effect-free kernel logic.
- Prefer feature/domain-oriented modules over broad utility dumps.
- Keep schema/type changes synchronized across `packages/engine/src/kernel`, `packages/engine/schemas`, and tests.
- Use `GameDef`, `GameSpecDoc`, `GameTrace` exactly as defined.
- File size: 200-400 lines typical, 800 max. Many small files over few large files.

## Commit & PR Guidelines

Commit subjects: short, imperative. Common patterns: `docs: add Spec 12 — CLI`, `Implemented CORTYPSCHVAL-008`.

PRs should include a clear summary of changed files and why, linked issue/spec when applicable, confirmation that references and terminology are consistent, and a test plan with verification steps.
