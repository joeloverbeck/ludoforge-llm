# Spec 54 — Remove Phantom Joint Operation Stubs (`usOp`/`arvnOp`)

## Context

The FITL game spec contains two actions (`usOp`, `arvnOp`) and their associated pipeline profiles (`us-op-profile`, `arvn-op-profile`) that do not correspond to any mechanic in the Fire in the Lake rules. Per Section 2.3.4, eligible factions choose from exactly: Pass, Event, Operation (Train/Patrol/Sweep/Assault), or Operation + Special Activity. There is no "US Op" or "ARVN Op" as a distinct choice.

These stubs were created during early development as placeholders. They have:
- Empty action bodies (no effects besides incrementing counters)
- A flat cost of 5 ARVN Resources (no FITL operation costs a flat 5)
- Bookkeeping counters (`usOpCount`, `arvnOpCount`) that are never read downstream
- No `accompanyingOps` — they cannot combine with special activities

The real cross-faction resource spending (US spending ARVN Resources above Total Econ) is correctly implemented via the `us-joint-op-arvn-spend-eligible` condition macro, which is used by `train-us-profile`, `assault-us-profile`, and US Pacification cost guards. That macro and all its usages in real operation profiles are **not** affected by this removal.

## Scope

**Remove**: `usOp`, `arvnOp` actions, `us-op-profile`, `arvn-op-profile` pipelines, `usOpCount`/`arvnOpCount` variables, and all `actionClassByActionId` entries for these phantom actions.

**Keep**: The `us-joint-op-arvn-spend-eligible` condition macro and all its references in real operation profiles (Train, Assault, Pacification). These encode genuine FITL rules (Section 1.8.1).

**Out of scope**: Renaming the `us-joint-op-arvn-spend-eligible` macro (the name is misleading but the macro is correct; renaming is cosmetic and separate).

## Ticket Series: RMJOINT

### RMJOINT-001: Remove phantom actions and pipelines from FITL game spec

Remove from `data/games/fire-in-the-lake/30-rules-actions.md`:
- `usOp: operation` and `arvnOp: operation` entries in `actionClassByActionId` (lines 44-45)
- `usOp` and `arvnOp` action definitions (line 1121-1122)
- `us-op-profile` pipeline block with its OPCLASS-007 comment (lines 4969-5003)
- `arvn-op-profile` pipeline block (lines 5004-5031)

Remove from `data/games/fire-in-the-lake/10-vocabulary.md`:
- `usOpCount` global variable declaration (lines 293-297)
- `arvnOpCount` global variable declaration (lines 298-302)

**Verification**: `compileProductionSpec()` succeeds. Compile the spec and confirm `usOp`, `arvnOp`, `usOpCount`, `arvnOpCount`, `us-op-profile`, `arvn-op-profile` do not appear in the compiled `GameDef`.

---

### RMJOINT-002: Update integration tests

**Delete entirely**:
- `packages/engine/test/integration/fitl-joint-operations.test.ts` — every test in this file exclusively tests `usOp`/`arvnOp` behavior.

**Update**:
- `packages/engine/test/integration/fitl-faction-action-filtering.test.ts`:
  - Remove `'usOp'` from `US_EXCLUSIVE` array (line 24).
  - Remove `'arvnOp'` from `ARVN_EXCLUSIVE` array (line 25).
  - Update the comment on line 23 to remove "joint ops".

- `packages/engine/test/integration/fitl-pass-rewards-production.test.ts`:
  - Replace `usOp` move (line 55-57) with a real operation (e.g., `train`). The test verifies pass rewards are not granted after a non-pass action, so any valid operation works.

- `packages/engine/test/integration/fitl-us-arvn-resource-spend-constraint.test.ts`:
  - Remove the test `'routes us-op-profile costValidation through shared condition macro'` (lines 14-23) — tests the phantom profile.
  - Remove the test `'keeps arvn-op-profile independent from totalEcon joint-operations constraint'` (lines 25-32) — tests the phantom profile.
  - Keep all other tests (macro existence, Train ARVN-cubes guard, Assault follow-up guard, Pacification guards) — these test real operation profiles.

- `packages/engine/test/integration/fitl-us-arvn-special-activities.test.ts`:
  - Update the test `'rejects advise when accompanied by an operation outside accompanyingOps'` (line 585-609) to use a real operation that is not in advise's `accompanyingOps` list (e.g., `assault` — advise only accompanies Train or Patrol per Section 4.2.1).

**Verification**: `pnpm -F @ludoforge/engine test` — all tests pass with 0 failures.

---

### RMJOINT-003: Regenerate runner bootstrap fixture

After RMJOINT-001:
- Recompile the production spec and update `packages/runner/src/bootstrap/fitl-game-def.json` to remove all `usOp`, `arvnOp`, `usOpCount`, `arvnOpCount`, `us-op-profile`, `arvn-op-profile` references.

**Verification**: `pnpm turbo build` — clean build for both engine and runner. `pnpm -F @ludoforge/runner test` — all runner tests pass.

---

### RMJOINT-004: Update design plans (informational docs)

Update references in planning documents that mention `arvnOp`/`usOp`:
- `docs/plans/2026-02-24-fitl-playbook-e2e-golden-suite-design.md` (line 96): Remove or replace the `arvnOp` compound move example.
- `docs/plans/2026-02-24-fitl-playbook-e2e-golden-suite-plan.md` (lines 397-498): Replace `arvnOp` references with the correct action pattern (ARVN executes `train` or another real operation directly, not via `arvnOp`).

Archived tickets (`archive/tickets/FITLRULES1-005.md`, `archive/tickets/FITLRULES2-002.md`, `archive/tickets/FITLCOUROUANDDATFIX-005.md`) reference `usOp`/`us-op-profile` but are historical records and should not be modified.

**Verification**: No code changes — documentation only.

## Dependency Graph

```
RMJOINT-001 → RMJOINT-002 (tests depend on spec changes)
RMJOINT-001 → RMJOINT-003 (bootstrap depends on spec changes)
RMJOINT-004 (independent — docs only)
```

## Final Verification

After all tickets:
1. `pnpm turbo build` — clean build
2. `pnpm turbo test` — all tests pass
3. `pnpm turbo schema:artifacts:check` — schemas in sync
4. `grep -r 'usOp\|arvnOp\|usOpCount\|arvnOpCount\|us-op-profile\|arvn-op-profile' data/ packages/` — only hits should be in `archive/` directories
