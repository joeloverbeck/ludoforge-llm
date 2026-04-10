# 123BATREDENU-004: Update FITL redeploy tests and regenerate golden fixtures

**Status**: NOT IMPLEMENTED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test and fixture changes only
**Deps**: `archive/tickets/123BATREDENU-003.md`

## Problem

Blocked by `archive/tickets/123BATREDENU-003.md`, whose migration rationale is currently blocked after `archive/tickets/123BATREDENU-001.md` disproved the underlying probing-gap premise on current `main`.

After migrating FITL redeploy actions to parameterless batch form (ticket 003), the existing redeploy tests and golden fixtures reference the old hybrid `sourceSpace`-param format. Tests will fail because move shapes, decision keys, and enumeration results have changed. Golden fixtures must be regenerated to match the new parameterless format.

## Archival Note

Archived without implementation on 2026-04-10 because the underlying migration ticket (`003`) is no longer actionable under the corrected series boundary.

## Boundary Correction (2026-04-10)

Keep this ticket blocked until a verified migration ticket replaces or revalidates `003`.

## Assumption Reassessment (2026-04-10)

1. `fitl-coup-redeploy-phase.test.ts` is at `packages/engine/test/integration/fitl-coup-redeploy-phase.test.ts` — confirmed this session. It exercises all 4 redeploy actions with `sourceSpace` param + `chooseOne` destination decisions.
2. `fitl-playbook-golden.test.ts` is at `packages/engine/test/e2e/fitl-playbook-golden.test.ts` — confirmed. It replays a full FITL game including coup redeploy phases.
3. `fitl-coup-redeploy-commit-reset.test.ts` at `packages/engine/test/integration/fitl-coup-redeploy-commit-reset.test.ts` — confirmed. Tests commit/reset behavior during redeploy.
4. Golden fixtures under `packages/engine/test/fixtures/` include `fitl-policy-summary.golden.json`, `fitl-turn-flow.golden.json`, and others — confirmed.
5. `fitl-playbook-harness.ts` at `packages/engine/test/helpers/fitl-playbook-harness.ts` provides replay utilities — confirmed.

## Architecture Check

1. Test updates reflect the new parameterless action shape — `params: {}` instead of `params: { sourceSpace: ... }`, no `sourceSpace` param in move templates.
2. Decision override patterns change: instead of overriding per-source-zone moves, tests override the `chooseOne` decisions inside the `forEach` loop body.
3. Golden fixture regeneration is a mechanical process — run the game, capture new snapshots.
4. No backwards-compatibility in tests — old param-based assertions are replaced, not dual-supported (F14).

## What to Change

### 1. Update `fitl-coup-redeploy-phase.test.ts`

- Remove all `sourceSpace` param references from move construction
- Update `applyMove` calls to use parameterless templates: `{ actionId: asActionId('coupArvnRedeployMandatory'), params: {} }`
- Update decision override patterns — the `chooseOne` for destination is now inside the `forEach` loop, so overrides target the loop-scoped decision key
- Update `findDestinationKey` helper calls (or replace with the new decision key pattern)
- Verify all 9 test cases exercise the parameterless form correctly

### 2. Update `fitl-coup-redeploy-commit-reset.test.ts`

- Same structural changes as section 1 — remove `sourceSpace` params, update decision overrides
- Verify commit/reset behavior is preserved with the new batch form

### 3. Update `fitl-playbook-golden.test.ts`

- Update the playbook replay sequence: redeploy moves are now parameterless batch operations
- Update decision override sequences in the playbook harness to match the new `forEach`-scoped decision keys
- The playbook may need fewer move entries since one parameterless action replaces multiple source-zone-specific moves

### 4. Update playbook harness if needed

- If `fitl-playbook-harness.ts` has hardcoded redeploy move shapes or decision key patterns, update them

### 5. Regenerate golden fixtures

- Run the FITL golden fixture generation commands
- Capture new snapshots for all affected fixtures: `fitl-policy-summary.golden.json`, `fitl-turn-flow.golden.json`, and others
- Verify the new fixtures are deterministic (run twice, compare)

### 6. Run full test suite

- All FITL tests must pass with the new fixtures
- All engine tests must pass (no regressions from the probing fix or YAML migration)

## Files to Touch

- `packages/engine/test/integration/fitl-coup-redeploy-phase.test.ts` (modify)
- `packages/engine/test/integration/fitl-coup-redeploy-commit-reset.test.ts` (modify)
- `packages/engine/test/e2e/fitl-playbook-golden.test.ts` (modify)
- `packages/engine/test/helpers/fitl-playbook-harness.ts` (modify — if needed)
- `packages/engine/test/fixtures/trace/fitl-policy-summary.golden.json` (regenerate)
- `packages/engine/test/fixtures/trace/fitl-turn-flow.golden.json` (regenerate)
- `packages/engine/test/fixtures/trace/fitl-events-initial-pack.golden.json` (regenerate — if affected)
- `packages/engine/test/fixtures/trace/fitl-foundation-initial-state.golden.json` (regenerate — if affected)
- `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json` (regenerate — if affected)

## Out of Scope

- Engine code changes (completed in ticket 002)
- YAML migration (completed in ticket 003)
- Non-FITL tests (no other game uses redeploy patterns)
- Adding new test scenarios beyond what the existing tests cover

## Acceptance Criteria

### Tests That Must Pass

1. `fitl-coup-redeploy-phase.test.ts` — all 9 test cases pass with parameterless move templates
2. `fitl-coup-redeploy-commit-reset.test.ts` — commit/reset behavior preserved
3. `fitl-playbook-golden.test.ts` — full playbook replay passes with regenerated fixtures
4. `probe-foreach-decision.test.ts` and `fitl-probe-foreach-redeploy.test.ts` — continue passing (from tickets 001/002)
5. Existing suite: `pnpm turbo test` — zero regressions

### Invariants

1. Golden fixtures are deterministic — regenerating them twice produces identical output
2. No engine source code is modified in this ticket
3. All redeploy test scenarios exercise the parameterless batch form, not the old hybrid form

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coup-redeploy-phase.test.ts` — update move shapes and decision overrides for parameterless form
2. `packages/engine/test/integration/fitl-coup-redeploy-commit-reset.test.ts` — same structural updates
3. `packages/engine/test/e2e/fitl-playbook-golden.test.ts` — update playbook replay for batch redeploy

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/integration/fitl-coup-redeploy-phase.test.js`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/integration/fitl-coup-redeploy-commit-reset.test.js`
3. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/e2e/fitl-playbook-golden.test.js`
4. `pnpm turbo test`
5. `pnpm turbo lint`
6. `pnpm turbo typecheck`
