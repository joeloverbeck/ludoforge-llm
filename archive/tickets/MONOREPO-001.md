# MONOREPO-001: Pre-Move Verification & Baseline

**Status**: COMPLETED
**Spec**: 35 — Monorepo Restructure & Build System (D8, pre-move checks)
**Priority**: P0 — Must run first, before any restructuring begins
**Depends on**: Nothing
**Blocks**: MONOREPO-002

---

## Objective

Establish a verified baseline before monorepo restructuring: confirm the codebase compiles with `isolatedModules`, unit/integration tests pass, e2e tests pass when run in the correct order, and schema artifacts are in sync. Record the baseline in this ticket so subsequent tickets can detect regressions.

This ticket remains code-read-only for engine/runtime behavior: no source, test, or config edits are allowed here.

---

## Tasks

1. Run `npx tsc --isolatedModules --noEmit` and confirm zero errors.
2. Run `npm run schema:artifacts:check` and confirm schemas are in sync.
3. Run `npm test` (full unit + integration suite) and confirm all tests pass.
4. Run `npm run test:e2e` after `npm test` completes. Do not run these in parallel because `npm test` runs `pretest` (`clean && build`) and can invalidate `dist/` while e2e is executing.
5. Run `npm run lint` and `npm run typecheck` to lock in baseline hygiene before MONOREPO-002+.
6. Record exact pass/fail counts and runtime notes in this ticket's Outcome section (not in an external commit/PR description).

---

## Files Expected to Touch

- `tickets/MONOREPO-001.md` (status, corrected assumptions, and baseline outcome record)

---

## Out of Scope

- Modifying any source code or configuration files.
- Installing new dependencies.
- Fixing pre-existing test failures (document them; don't fix in this ticket).
- Any file moves or directory creation.

---

## Acceptance Criteria

- `npx tsc --isolatedModules --noEmit` exits 0.
- `npm run schema:artifacts:check` exits 0.
- `npm test` exits 0 (all unit + integration tests pass).
- `npm run test:e2e` exits 0 when run sequentially after `npm test`.
- `npm run lint` exits 0.
- `npm run typecheck` exits 0.

### Invariants that must remain true

- No source, test, schema, or build configuration files are modified by this ticket.
- Any observed command-order instability must be documented explicitly for downstream tickets.
- Working tree is clean after this ticket is archived.

---

## Architecture Reassessment

This ticket's baseline gate is still beneficial and should remain the first MONOREPO ticket:

- It prevents structural migration work from masking pre-existing issues.
- It enforces strict, explicit quality gates (`isolatedModules`, schemas, tests, lint, typecheck) before package movement.
- It avoids compatibility shims/aliases by requiring confidence in existing contracts before D0-D8 work proceeds.

The key correction is execution discipline: baseline commands must be run sequentially. Parallelizing `npm test` and `npm run test:e2e` creates false negatives because `npm test` mutates `dist/` in `pretest`.

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed vs. original plan**:
  - Clarified command ordering assumptions (sequential execution required).
  - Expanded baseline checks to include `lint` and `typecheck`.
  - Replaced "record in commit/PR description" with "record in ticket outcome" for deterministic local traceability.
  - Kept implementation scope code-read-only (no engine/runtime changes).
- **Verification results**:
  - `npx tsc --isolatedModules --noEmit`: pass
  - `npm run schema:artifacts:check`: pass
  - `npm test`: pass (`243` tests, `243` passed, `0` failed)
  - `npm run test:e2e` (run sequentially): pass (`21` tests, `21` passed, `0` failed)
  - `npm run lint`: pass
  - `npm run typecheck`: pass
