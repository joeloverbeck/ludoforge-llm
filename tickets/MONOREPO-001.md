# MONOREPO-001: Pre-Move Verification & Baseline

**Spec**: 35 — Monorepo Restructure & Build System (D8, pre-move checks)
**Priority**: P0 — Must run first, before any restructuring begins
**Depends on**: Nothing
**Blocks**: MONOREPO-002

---

## Objective

Establish a verified baseline: confirm the codebase compiles with `isolatedModules`, all tests pass, and there are no const enum / namespace issues that would break Vite bundling later. Record the baseline so subsequent tickets can verify nothing regressed.

---

## Tasks

1. Run `npx tsc --isolatedModules --noEmit` and confirm zero errors.
2. Run `npm test` (full unit + integration suite) and confirm all tests pass.
3. Run `npm run test:e2e` and record results (pass or known failures).
4. Run `npm run schema:artifacts:check` and confirm schemas are in sync.
5. Record test count and pass/fail summary in a commit message or PR description for reference.

---

## Files Expected to Touch

None. This is a read-only verification ticket.

---

## Out of Scope

- Modifying any source code or configuration files.
- Installing new dependencies.
- Fixing pre-existing test failures (document them; don't fix in this ticket).
- Any file moves or directory creation.

---

## Acceptance Criteria

### Tests that must pass

- `npx tsc --isolatedModules --noEmit` exits 0.
- `npm run schema:artifacts:check` exits 0.
- `npm test` exits 0 (all unit + integration tests pass).

### Invariants that must remain true

- No files modified on disk after this ticket completes.
- Working tree is clean (`git status` shows no changes).
