# 122CROSEAVIC-008: Regenerate schema artifacts and golden tests

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — schemas (generated)
**Deps**: `archive/tickets/122CROSEAVIC-001.md`

## Problem

The JSON schema files in `packages/engine/schemas/` are generated from the TypeScript types. After adding the `seatAgg` variant to `AgentPolicyExpr`, the series still needs explicit proof that the checked-in schema artifacts and schema-facing tests are in sync with the current source contracts. Earlier ticket wording assumed stale artifacts remained; this ticket now owns the verification pass and any no-op regeneration fallout.

## Assumption Reassessment (2026-04-09)

1. Schema artifacts at `packages/engine/schemas/` include `GameDef.schema.json`, `EvalReport.schema.json`, and `Trace.schema.json` — confirmed.
2. `GameDef.schema.json` already contains the `seatAgg` variant in the checked-in artifact, and archived `122CROSEAVIC-001.md` already records that regeneration happened when the union/schema groundwork landed.
3. Schema generation command is `pnpm turbo schema:artifacts` — confirmed from the repo command surface.
4. The live schema-facing verification surface is the existing sync and JSON-schema test coverage in `packages/engine/test/unit/schema-artifacts-sync.test.ts` and `packages/engine/test/unit/json-schema.test.ts`; there is no separate `seatAgg`-specific golden snapshot file to update unless regeneration produces drift.

## Architecture Check

1. This ticket is now a mechanical verification/regeneration step rather than a feature change. The clean boundary is to prove the generated artifacts remain synchronized with the current source contracts, not to reopen the already-landed `seatAgg` schema design.
2. This preserves the existing generic schema pipeline: artifacts remain derived from shared TypeScript/Zod contracts, with no game-specific branching or manual edits.
3. No backwards-compatibility shims — either the generated files match current contracts or this ticket updates them directly.

## What to Change

### 1. Regenerate schema artifacts

Run `pnpm turbo schema:artifacts` to regenerate all JSON schema files and detect whether any persisted artifact drift remains.

### 2. Verify and update golden tests

Run the existing schema-facing test lanes. If regeneration produces schema drift that breaks checked-in fixtures or schema consumers, update the owned expected outputs in the same turn.

### 3. Verify schema correctness

Spot-check the generated `GameDef.schema.json` to confirm the `seatAgg` variant appears correctly in the `AgentPolicyExpr` schema definition with the expected `kind`, `over`, `expr`, and `aggOp` fields, then record whether `Trace.schema.json` and `EvalReport.schema.json` changed or remained in sync.

## Files to Touch

- `tickets/122CROSEAVIC-008.md` (modify)
- `packages/engine/schemas/GameDef.schema.json` (regenerate if drift remains)
- `packages/engine/schemas/Trace.schema.json` (regenerate if drift remains)
- `packages/engine/schemas/EvalReport.schema.json` (regenerate if drift remains)
- Schema-facing test fixtures or expectations (modify only if regeneration produces drift)

## Out of Scope

- Type definition changes (ticket 001)
- Runtime behavior changes
- Manual schema edits — schemas are always generated, never hand-edited

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo schema:artifacts` completes without errors.
2. `GameDef.schema.json` contains a `seatAgg` variant in the `AgentPolicyExpr` definition.
3. Schema-facing tests pass with any required updates, or with no persisted diff if artifacts were already in sync.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Schema artifacts are always generated from TypeScript types — never hand-edited.
2. All existing schema definitions remain present and unchanged (additive change only).

## Test Plan

### New/Modified Tests

1. Existing schema-facing coverage in `packages/engine/test/unit/schema-artifacts-sync.test.ts` and `packages/engine/test/unit/json-schema.test.ts` (no new test file unless regeneration exposes missing coverage)

### Commands

1. `pnpm turbo schema:artifacts`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`

## Outcome

Completion date: 2026-04-09

- Re-ran `pnpm turbo schema:artifacts` against the live source contracts and confirmed the checked-in schema artifacts were already in sync. The generator rewrote `packages/engine/schemas/GameDef.schema.json`, `packages/engine/schemas/Trace.schema.json`, and `packages/engine/schemas/EvalReport.schema.json` with no persisted diff.
- Spot-checked `packages/engine/schemas/GameDef.schema.json` and confirmed the compiled schema still includes the `seatAgg` variant in the `AgentPolicyExpr` definition.
- Verified the existing schema-facing test surface passed unchanged, including the package test lane that runs `schema:artifacts:check` before the engine suite. No schema-specific golden or fixture updates were required.

### Verification

- `pnpm turbo schema:artifacts`
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo typecheck`

### Boundary Notes

- The original ticket premise that schema artifacts were still stale was no longer true in the live repo. Regeneration had already landed during the earlier `seatAgg` groundwork, so this ticket closed the remaining proof obligation instead of producing a new schema diff.
- The original `Files to Touch` list named generated schema files, but those files remained byte-identical after regeneration. The only persisted change in this ticket is the ticket rewrite/outcome itself.
