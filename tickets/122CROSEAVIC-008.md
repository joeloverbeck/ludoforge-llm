# 122CROSEAVIC-008: Regenerate schema artifacts and golden tests

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — schemas (generated)
**Deps**: `archive/tickets/122CROSEAVIC-001.md`

## Problem

The JSON schema files in `packages/engine/schemas/` are generated from the TypeScript types. After adding the `seatAgg` variant to `AgentPolicyExpr` (ticket 001), the schema artifacts are stale and must be regenerated. Any golden tests that snapshot schema output also need updating.

## Assumption Reassessment (2026-04-09)

1. Schema artifacts at `packages/engine/schemas/` include `GameDef.schema.json` (588KB), `EvalReport.schema.json`, and `Trace.schema.json` — confirmed.
2. Schema generation command is `pnpm turbo schema:artifacts` — confirmed from CLAUDE.md.
3. Golden tests that snapshot schema output may need updating — to be verified at implementation time.

## Architecture Check

1. This is a mechanical regeneration step — no design decisions. The schemas are derived from the TypeScript types, which were updated in ticket 001.
2. No backwards-compatibility shims — the schemas reflect the current type definitions.

## What to Change

### 1. Regenerate schema artifacts

Run `pnpm turbo schema:artifacts` to regenerate all JSON schema files.

### 2. Verify and update golden tests

If any golden tests compare schema snapshots, update the expected output to include the new `seatAgg` variant.

### 3. Verify schema correctness

Spot-check the generated `GameDef.schema.json` to confirm the `seatAgg` variant appears correctly in the `AgentPolicyExpr` schema definition with the expected `kind`, `over`, `expr`, and `aggOp` fields.

## Files to Touch

- `packages/engine/schemas/GameDef.schema.json` (regenerate)
- `packages/engine/schemas/Trace.schema.json` (regenerate)
- Golden test snapshot files (modify if applicable)

## Out of Scope

- Type definition changes (ticket 001)
- Runtime behavior changes
- Manual schema edits — schemas are always generated, never hand-edited

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo schema:artifacts` completes without errors.
2. `GameDef.schema.json` contains a `seatAgg` variant in the `AgentPolicyExpr` definition.
3. All golden tests pass with updated snapshots.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Schema artifacts are always generated from TypeScript types — never hand-edited.
2. All existing schema definitions remain present and unchanged (additive change only).

## Test Plan

### New/Modified Tests

1. Golden test snapshot files (update if applicable)

### Commands

1. `pnpm turbo schema:artifacts`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
