# 102SHAOBSMOD-008: Schema artifacts, golden tests, and cross-game verification

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — schema artifacts, test fixtures
**Deps**: `archive/tickets/102SHAOBSMOD-007.md`, `specs/102-shared-observer-model.md`

## Problem

The `GameDef.schema.json` artifact must include the new `observers` field. Golden tests must verify compilation output structure. Cross-game tests must confirm both FITL and Texas Hold'em compile and run correctly with observer-based visibility. Fingerprint determinism must be proven.

## Assumption Reassessment (2026-04-01)

1. `packages/engine/schemas/GameDef.schema.json` exists — confirmed.
2. Schema generation uses `pnpm turbo schema:artifacts` — confirmed per CLAUDE.md.
3. Golden test fixtures exist under `packages/engine/test/fixtures/` — must be verified at implementation time.
4. FITL and Texas Hold'em E2E tests exist — confirmed via `test:e2e` command.

## Architecture Check

1. Schema artifacts are generated from Zod schemas — the new types added in tickets 001/005 automatically flow into the JSON schema.
2. Golden tests are the primary proof of compilation correctness (FOUNDATIONS.md #16).
3. Cross-game tests prove engine agnosticism (FOUNDATIONS.md #1, #16).

## What to Change

### 1. Regenerate `GameDef.schema.json`

Run `pnpm turbo schema:artifacts` to regenerate. Verify the schema includes `observers` as an optional field with `CompiledObserverCatalog` structure.

### 2. Add observer compilation golden tests

Create golden test(s) that compile a spec with `observability:` and assert the `observers` field in the resulting GameDef matches expected JSON structure.

### 3. Add fingerprint determinism test

Compile the same spec twice (or with same input) and assert `catalogFingerprint` and per-observer `fingerprint` values are identical.

### 4. Add cross-game compilation tests

Verify both FITL and Texas Hold'em:
- Compile successfully
- Produce valid GameDef (passes Zod validation)
- FITL GameDef includes `observers` with expected profile(s)
- Texas Hold'em GameDef has no `observers` (or has built-in defaults only — depends on implementation choice in ticket 004)

### 5. Update golden test fixtures

Update any existing golden fixtures that include `GameDef` JSON to reflect:
- Renamed types from ticket 001
- New `observers` field from ticket 005
- Removed `agents.visibility` from ticket 006

### 6. Run full verification

- `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Files to Touch

- `packages/engine/schemas/GameDef.schema.json` (modify — regenerated)
- `packages/engine/test/fixtures/` (modify — update golden fixtures)
- `packages/engine/test/integration/observer-golden.test.ts` (new)
- `packages/engine/test/unit/cnl/observer-fingerprint.test.ts` (new — or add to existing compile-observers test)

## Out of Scope

- Runner-side observer consumption tests — follow-up spec
- Simulator-side observer validation — follow-up spec
- Zone/token visibility schema — Spec 106

## Acceptance Criteria

### Tests That Must Pass

1. `GameDef.schema.json` validates a GameDef with `observers` field
2. `GameDef.schema.json` validates a GameDef without `observers` field
3. Golden test: spec with observability compiles to expected JSON structure
4. Fingerprint determinism: same spec → same fingerprint across two compilations
5. FITL compiles and runs (E2E)
6. Texas Hold'em compiles and runs (E2E)
7. `pnpm turbo schema:artifacts` succeeds with no diff after regeneration (idempotent)
8. Full suite: `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` passes

### Invariants

1. Schema artifact is always in sync with Zod schemas — `schema:artifacts` is idempotent
2. Golden tests are the authoritative proof of compilation correctness
3. Cross-game tests prove no game-specific logic leaked into the observer model

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/observer-golden.test.ts` — golden compilation output structure
2. `packages/engine/test/unit/cnl/observer-fingerprint.test.ts` — fingerprint determinism

### Commands

1. `pnpm turbo schema:artifacts` — schema regeneration
2. `pnpm -F @ludoforge/engine test` — full engine test suite
3. `pnpm -F @ludoforge/engine test:e2e` — end-to-end cross-game tests
4. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck` — full verification
