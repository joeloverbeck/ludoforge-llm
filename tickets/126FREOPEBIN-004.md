# 126FREOPEBIN-004: FITL march zone filter seed scan and correction

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — data-only and test-only
**Deps**: `archive/tickets/126FREOPEBIN-001.md`, `archive/tickets/126FREOPEBIN-002.md`, `tickets/126FREOPEBIN-003.md`, `archive/tickets/126FREOPEBIN-005.md`

## Problem

After implementing the remaining engine fixes in this series, a full seed scan is needed to verify the fixes work and to determine whether the FITL march zone filter itself needs restructuring. The march zone filter uses `$movingTroops@{$zone}` which references per-target-space bindings that may not exist at filter evaluation time. If the engine-side deferral fixes still leave the game-design intent ambiguous in practice, the zone filter data must be corrected to only reference bindings available at probe time.

## Assumption Reassessment (2026-04-11)

1. `data/games/fire-in-the-lake/30-rules-actions.md` exists and contains the march action definition — confirmed.
2. `fitl-policy-agent-canary.test.ts` exists at `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` — confirmed. Will be updated with validated terminal seeds.
3. Previously-crashing seeds: 1010, 1012, 1014, 1015, 1019, 1025, 1030, 1035, 1042, 1043, 1046, 1047, 1051 — from spec evidence table.
4. Previously-hanging seeds: 1040, 1054 — from spec evidence table.
5. Ticket `126FREOPEBIN-002` did not add a new simulator stop reason. It fixed the live hang by charging existing free-operation viability probe budgets during `chooseOne` / `chooseN` traversal, including the `card-75` event-play stall on seed `1040`.
6. Ticket `126FREOPEBIN-003` is not the next live prerequisite by itself; the remaining `legalChoices` crash on missing `$targetSpaces` is now tracked in ticket `126FREOPEBIN-005` and must land before the seed scan is authoritative.

## Architecture Check

1. All changes in this ticket are data-only (FITL game spec YAML) or test-only — no engine code changes. This respects Foundation 1 (Engine Agnosticism).
2. Zone filter correction (if needed) keeps rule-authoritative data in GameSpecDoc YAML (Foundation 2).
3. Determinism canary seeds prove the fix via automated tests (Foundation 16).

## What to Change

### 1. Re-run seed scan

After tickets 003 and 005 are implemented, re-run the seed scan across 1000–2200 with all 4 FITL PolicyAgent profiles and `MAX_TURNS=300`. Categorize results:
- `terminal` (correct completion)
- `maxTurns` (300 moves, no winner — game design issue, not engine bug)
- `agentStuck` (agent fallback exhausted — investigate if frequent)
- Crash or hang (regressions — must be zero)

### 2. Assess march zone filter

If the `inconclusive` probe result from ticket 001 causes the march free-operation to be incorrectly granted or denied in practice:
- Restructure the zone filter in `30-rules-actions.md` to only reference bindings available at probe time: global vars, the candidate `$zone`, and top-level action bindings.
- Move per-space troop/guerrilla selection bindings out of the zone filter and into the per-space `forEach` scope.
- Consult FITL Rules Section 3.3.3 (March) and Section 4.1 (Special Activities) for correct eligibility semantics.

### 3. Establish determinism canary seeds

From the seed scan results, select 4–6 seeds that produce `terminal` results as permanent canaries. Update `fitl-policy-agent-canary.test.ts` with the validated seeds and their expected outcomes.

### 4. Validate previously-crashing seeds

Run the specific seeds from the spec's evidence table (1010, 1012, 1014, 1015, 1019, 1040, 1054) and verify none crash or hang.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — if zone filter correction needed)
- `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` (modify)
- `packages/engine/test/integration/fitl-seed-stability.test.ts` (new)

## Out of Scope

- Engine code changes (covered by tickets 001–003)
- Full PolicyAgent AI strategy overhaul
- `maxTurns` seeds that play 300 moves without a winner — game design quality, not engine bug
- Evolution pipeline or CLI integration

## Acceptance Criteria

### Tests That Must Pass

1. Integration: seeds 1010, 1012, 1014, 1015, 1019 reach `terminal`, `maxTurns`, or `agentStuck` — never crash
2. Integration: seeds 1040, 1054 terminate within reasonable time — never hang
3. Determinism: 4–6 canary seeds produce identical `terminal` results across 2 runs
4. Existing suite: `pnpm turbo test`

### Invariants

1. Zero crashes across all scanned seeds
2. Zero hangs across all scanned seeds
3. Canary seeds are deterministic (Foundation 8)
4. No engine-specific logic introduced — all changes are data or tests

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-seed-stability.test.ts` — new file verifying previously-crashing/hanging seeds
2. `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` — update with validated terminal seeds

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "seed-stability"`
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern "canary"`
3. `pnpm turbo test`
