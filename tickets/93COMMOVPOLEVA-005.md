# 93COMMOVPOLEVA-005: Integration test and golden fixture update

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — golden fixture update + new integration test
**Deps**: `archive/tickets/93COMMOVPOLEVA-003.md`, `archive/tickets/93COMMOVPOLEVA-004.md`

## Problem

With tickets 001-003 complete, the production `PolicyAgent` now builds a `trustedMoveIndex` and the preview runtime uses it. This ticket verifies the end-to-end behavior:
1. FITL PolicyAgent decision traces show working preview (no more `unknownRefIds` for completed deterministic moves)
2. Different parameterizations of the same FITL action produce different `projectedSelfMargin` values
3. The golden fixture for FITL policy summary changes (scores now reflect actual projected margins instead of fallback constants)
4. Texas Hold'em policy evaluation is unchanged

## Assumption Reassessment (2026-03-29)

1. `test/unit/agents/policy-production-golden.test.ts` exists and compares FITL policy summary output against a golden JSON file (`fitl-policy-summary.golden.json`). The golden will change because scores now use real projected margins.
2. `test/integration/fitl-policy-agent.test.ts` exists and runs end-to-end FITL policy evaluation. A new test can be added here or in a new `policy-agent-preview.test.ts` file.
3. FITL spec compilation uses `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts`. Confirmed per CLAUDE.md testing requirements.
4. `fitl-policy-catalog.golden.json` is unchanged by this work (no compilation changes).
5. Texas Hold'em moves are already `playableComplete` or legitimately `unknown` due to hidden information — the trusted index fast-path produces identical outcomes for them.

## Architecture Check

1. **Golden update justification**: The golden changes because the agent now produces real preview data instead of `unknown` fallbacks. The new golden is the correct expected output — the old golden reflected the bug.
2. **Integration test design**: Compiles FITL spec, enumerates moves for a decision point with multiple parameterizations (e.g., different target spaces for the same action type), runs `PolicyAgent.chooseMove`, and asserts that at least two candidates of the same action type received different `projectedSelfMargin` scores.
3. **Agnosticism (F1)**: Texas Hold'em test confirms no FITL-specific logic leaked into the kernel.
4. **Determinism (F11)**: Golden test is deterministic — same seed, same spec, same expected output.

## What to Change

### 1. New integration test: `test/integration/policy-agent-preview.test.ts`

**Test: "FITL PolicyAgent scores differ across candidates of the same action type"**
- Compile FITL spec via `compileProductionSpec()`
- Create initial state with a known seed
- Advance to a decision point with multiple target-space parameterizations (e.g., a Train or Sweep action)
- Run `PolicyAgent.chooseMove` with trace enabled
- From the trace metadata, extract `scoreContributions` or `compositeScore` for candidates sharing the same `actionId`
- Assert: at least two candidates of the same action type have different `compositeScore` values

**Test: "FITL PolicyAgent decision trace has empty unknownRefIds for deterministic completed moves"**
- Same setup as above
- From the trace, extract `unknownPreviewRefIds` for completed candidates
- Assert: `unknownPreviewRefIds` is empty for moves that don't consume RNG

**Test: "Texas Hold'em PolicyAgent evaluation is unchanged"**
- Compile Texas Hold'em spec
- Run PolicyAgent evaluation for a known seed
- Assert scores are consistent with expectations (no regression)

### 2. Update FITL policy summary golden fixture

- Run the golden test, capture the new output
- Replace `fitl-policy-summary.golden.json` with the new expected output
- The diff should show: `projectedSelfMargin` values changing from constant fallbacks to varying numeric values; `unknownRefIds` arrays becoming empty for deterministic moves

### 3. Verify FITL policy catalog golden is unchanged

- Run the catalog golden test — it must pass without changes (no compilation changes in this work)

## Files to Touch

- `packages/engine/test/integration/policy-agent-preview.test.ts` (new)
- `packages/engine/test/fixtures/fitl-policy-summary.golden.json` (modify — updated expected output)
- `packages/engine/test/unit/agents/policy-production-golden.test.ts` (modify — only if the golden path or assertion needs adjustment)

## Out of Scope

- Performance benchmarking (noted in spec as a pre-merge requirement, but is a separate verification step — not a ticket deliverable)
- Changes to production source files (done in 001-003)
- Changes to `fitl-policy-catalog.golden.json` (must remain unchanged)
- New YAML authoring surface or kernel changes
- Multi-ply search or rollouts

## Acceptance Criteria

### Tests That Must Pass

1. New integration test: "FITL PolicyAgent scores differ across candidates of the same action type" passes
2. New integration test: "FITL PolicyAgent decision trace has empty unknownRefIds for deterministic completed moves" passes
3. New integration test: "Texas Hold'em PolicyAgent evaluation is unchanged" passes
4. Updated golden: `policy-production-golden.test.ts` passes with new `fitl-policy-summary.golden.json`
5. Unchanged golden: `fitl-policy-catalog.golden.json` comparison passes without changes
6. Full suite: `pnpm turbo test`
7. Full suite: `pnpm turbo typecheck`

### Invariants

1. No kernel source files modified
2. `fitl-policy-catalog.golden.json` is byte-identical to its pre-change state
3. Texas Hold'em policy evaluation produces identical results (engine agnosticism — F1)
4. Determinism (F5): golden test is reproducible — same seed + same spec = same output
5. FITL compilation is unchanged — only agent scoring behavior differs

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/policy-agent-preview.test.ts` — new file, 3 tests (FITL score differentiation, FITL empty unknownRefIds, Texas Hold'em unchanged)
2. `packages/engine/test/fixtures/fitl-policy-summary.golden.json` — updated golden fixture
3. `packages/engine/test/unit/agents/policy-production-golden.test.ts` — may need path/assertion adjustment if golden fixture location changed

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "policy-agent-preview"` (targeted integration)
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern "golden"` (golden tests)
3. `pnpm -F @ludoforge/engine test` (full engine suite)
4. `pnpm turbo test` (workspace-wide)
5. `pnpm turbo typecheck` (type safety)
6. `pnpm turbo lint` (style)
