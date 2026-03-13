# DECINSARC-008: Full-suite green verification and runner test migration

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — tests and verification only
**Deps**: DECINSARC-001, DECINSARC-002, DECINSARC-003, DECINSARC-004, DECINSARC-005, DECINSARC-006, DECINSARC-007

## Problem

After all source migrations are complete (DECINSARC-001 through DECINSARC-007), the full workspace must be verified green: build, typecheck, lint, all engine tests, all runner tests. Runner tests may need updates for the `decisionKey` field changes. This ticket is the final integration gate.

## Assumption Reassessment (2026-03-13)

1. Engine has ~703 test files across unit, integration, e2e, performance, memory directories — some may have been missed in DECINSARC-006.
2. Runner tests exist in `packages/runner/test/` across worker, store, model, canvas, animation, ui, input, bootstrap directories — some may reference old fields.
3. `pnpm turbo test` runs both engine and runner test suites — the canonical full verification command.
4. `pnpm turbo schema:artifacts` generates JSON Schema artifacts that may reference old types — must verify.

## Architecture Check

1. This is a verification-only ticket — no source changes expected (only test fixes if needed).
2. Full-stack green build is the gate condition for the spec to be considered complete.
3. Spec 60 acceptance criteria require all 5 verification commands to pass.

## What to Change

### 1. Fix any remaining runner test failures

- Grep runner test files for `decisionId` references and update to `decisionKey`
- Update any test fixtures constructing `PartialChoice` with old field names
- Update any mock `ChoicePendingRequest` objects in runner tests

### 2. Fix any remaining engine test stragglers

- Run full engine test suite and fix any failures missed in DECINSARC-006
- Pay special attention to:
  - `packages/engine/test/integration/` tests
  - `packages/engine/test/e2e/` tests
  - `packages/engine/test/fixtures/` — any fixture JSON files with old occurrence field names

### 3. Verify schema artifacts

- Run `pnpm turbo schema:artifacts` to regenerate JSON Schema files
- If schemas reference `ChoicePendingRequest` fields, verify they reflect the new shape
- Run schema check scripts if they exist

### 4. Final verification battery

Run all 5 spec-mandated verification commands:
1. `pnpm turbo build`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm turbo test`
5. `pnpm turbo schema:artifacts`

## Files to Touch

- `packages/runner/test/**/*.test.ts` — any files with `decisionId` references (modify)
- `packages/engine/test/**/*` — any remaining stragglers (modify)
- `packages/engine/schemas/` — if schema artifacts need regeneration (modify)

## Out of Scope

- Engine source changes (all done in DECINSARC-001 through DECINSARC-005)
- Runner source changes (done in DECINSARC-007)
- New features or enhancements beyond the spec
- Game-specific data changes
- Documentation updates (separate concern)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` — zero errors
2. `pnpm turbo typecheck` — zero errors
3. `pnpm turbo lint` — zero errors
4. `pnpm turbo test` — all engine + runner tests green
5. `pnpm turbo schema:artifacts` — generates without error
6. `pnpm -F @ludoforge/engine test:all` — full engine suite green (unit + integration + e2e)
7. `pnpm -F @ludoforge/runner test` — full runner suite green

### Invariants

1. `DecisionKey` branded string is the sole decision identity type across entire workspace.
2. `DecisionScope` is immutable — no mutable occurrence maps anywhere in workspace.
3. Codec functions are the single source of truth for key generation — no hand-crafted key strings.
4. `ChoicePendingRequest` has `decisionKey` field, no occurrence fields — across all source AND test files.
5. `EffectContextBase.decisionScope` is required (not optional) — verified by typecheck.
6. No imports of deleted modules (`decision-occurrence`, `decision-id`) anywhere in workspace.
7. No game-specific logic added to kernel, simulation, or `GameDef`.
8. Canonical serialized move shape is deterministic and minimal.
9. Existing FITL event coverage passes after migration.
10. All 10 spec invariants hold (see Spec 60 § Invariants).

## Test Plan

### New/Modified Tests

1. Any runner test files needing `decisionId` → `decisionKey` updates
2. Any straggler engine tests missed in DECINSARC-006

### Commands

1. `pnpm turbo build`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm turbo test`
5. `pnpm turbo schema:artifacts`
6. `pnpm -F @ludoforge/engine test:all`
7. `pnpm -F @ludoforge/runner test`
