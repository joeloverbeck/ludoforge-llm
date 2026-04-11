# 126FREOPEBIN-004: FITL NVA March trail-chain correction and seed scan

**Status**: BLOCKED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — data-only and test-only
**Deps**: `archive/tickets/126FREOPEBIN-001.md`, `archive/tickets/126FREOPEBIN-002.md`, `archive/tickets/126FREOPEBIN-003.md`, `archive/tickets/126FREOPEBIN-005.md`, `tickets/126FREOPEBIN-006.md`, `tickets/126FREOPEBIN-007.md`

## Problem

After implementing the remaining engine fixes in this series, a full seed scan is needed to verify the fixes work and to determine whether a remaining FITL data-modeling error still causes live regressions. The current post-`005` live witness is no longer the old march zone-filter crash. Seed `1010` now fails earlier with `chooseN selection cardinality mismatch for: $chainSpaces` on the NVA March Trail continuation path. The existing data models Trail continuation as a top-level `$chainSpaces` multi-select over Laos/Cambodia spaces, but FITL Rules 3.3.2 say continuation depends on the immediately previous destination being in Laos or Cambodia and the moving pieces continuing as a single group. If the production scan confirms this mismatch is the remaining crash source, the FITL march data must be corrected so Trail continuation is tied to the just-marched Laos/Cambodia destination and follows official rules semantics.

## Assumption Reassessment (2026-04-11)

1. `data/games/fire-in-the-lake/30-rules-actions.md` exists and contains the march action definition — confirmed.
2. `fitl-policy-agent-canary.test.ts` exists at `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` — confirmed. Will be updated with validated terminal seeds.
3. Previously-crashing seeds: 1010, 1012, 1014, 1015, 1019, 1025, 1030, 1035, 1042, 1043, 1046, 1047, 1051 — from spec evidence table.
4. Previously-hanging seeds: 1040, 1054 — from spec evidence table.
5. Ticket `126FREOPEBIN-002` did not add a new simulator stop reason. It fixed the live hang by charging existing free-operation viability probe budgets during `chooseOne` / `chooseN` traversal, including the `card-75` event-play stall on seed `1040`.
6. Tickets `126FREOPEBIN-003` and `126FREOPEBIN-005` have now landed, so this seed scan is the next authoritative series step; it should verify whether any crash/hang or residual `agentStuck` cohorts remain before considering FITL data correction.
7. Live reassessment on 2026-04-11 shows the first remaining crash boundary is now NVA March Trail continuation, not the earlier free-operation zone filter. `rules/fire-in-the-lake/fire-in-the-lake-rules-section-3.md` confirms that Trail continuation depends on the previous destination being in Laos/Cambodia and the moving group continuing onward, so the correction must align with that rule text rather than preserving the current global `$chainSpaces` shape.
8. Mid-implementation reassessment on 2026-04-11: the March Trail correction was landed into FITL data and clears the original `$chainSpaces` crash/hang boundary (`1010` no longer crashes; `1040` and `1054` terminate), but seed `1012` remains too slow to complete within a bounded proof run and is now the blocking live boundary for the full scan acceptance.

## Architecture Check

1. All changes in this ticket are data-only (FITL game spec YAML) or test-only — no engine code changes. This respects Foundation 1 (Engine Agnosticism).
2. Trail continuation correction (if needed) keeps rule-authoritative data in GameSpecDoc YAML (Foundation 2).
3. Determinism canary seeds prove the fix via automated tests (Foundation 16).

## What to Change

### 1. Re-run seed scan

After tickets `126FREOPEBIN-006` and `126FREOPEBIN-007` are implemented, re-run the seed scan across 1000–2200 with all 4 FITL PolicyAgent profiles and `MAX_TURNS=300`. Categorize results:
- `terminal` (correct completion)
- `maxTurns` (300 moves, no winner — game design issue, not engine bug)
- `agentStuck` (agent fallback exhausted — investigate if frequent)
- Crash or hang (regressions — must be zero)

### 2. Correct NVA March Trail continuation

Implemented during this ticket:
- Restructure the NVA March Trail continuation in `30-rules-actions.md` so continuation is evaluated per previously selected destination, not via one top-level global `$chainSpaces` pool.
- Ensure only destinations reached by a just-marched NVA group in Laos/Cambodia may continue, matching FITL Rules Section 3.3.2.
- Ensure continuation preserves single-group movement semantics instead of allowing one prior destination to fan out into multiple arbitrary follow-on destinations.
- Keep coupled FITL event free-operation grants aligned with the new per-origin Trail continuation binding shape.

### 3. Establish determinism canary seeds

From the seed scan results, select 4–6 seeds that produce `terminal` results as permanent canaries. Update `fitl-policy-agent-canary.test.ts` with the validated seeds and their expected outcomes.

### 4. Validate previously-crashing seeds

Run the specific seeds from the spec's evidence table (1010, 1012, 1014, 1015, 1019, 1040, 1054) and verify none crash or hang.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify — Trail continuation correction landed)
- `data/games/fire-in-the-lake/41-events/033-064.md` (modify — coupled March free-operation grant bindings aligned to per-origin Trail continuation)
- `data/games/fire-in-the-lake/41-events/065-096.md` (modify — coupled March free-operation grant bindings aligned to per-origin Trail continuation)
- `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` (modify — still pending after `126FREOPEBIN-006`)
- `packages/engine/test/integration/fitl-seed-stability.test.ts` (new — still pending after `126FREOPEBIN-006`)

## Out of Scope

- Engine code changes (covered by tickets 001–003)
- Full PolicyAgent AI strategy overhaul
- `maxTurns` seeds that play 300 moves without a winner — game design quality, not engine bug
- Evolution pipeline or CLI integration

## Acceptance Criteria

### Tests That Must Pass

1. Integration: after `126FREOPEBIN-006` and `126FREOPEBIN-007`, seeds 1010, 1012, 1014, 1015, 1019 reach `terminal`, `maxTurns`, or `agentStuck` — never crash
2. Integration: seeds 1040, 1054 terminate within reasonable time — never hang
3. Determinism: 4–6 canary seeds produce identical `terminal` results across 2 runs
4. Existing suite: `pnpm turbo test`

### Invariants

1. Zero crashes across all scanned seeds after `126FREOPEBIN-006`
2. Zero hangs across all scanned seeds after `126FREOPEBIN-006`
3. Canary seeds are deterministic (Foundation 8)
4. No engine-specific logic introduced — all changes are data or tests

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-seed-stability.test.ts` — new file verifying previously-crashing/hanging seeds
2. `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` — update with validated terminal seeds

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-seed-stability.test.js`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/fitl-policy-agent-canary.test.js`
4. `pnpm turbo test`

## Blocking Evidence (2026-04-11)

- Completed in this ticket:
  - NVA March Trail continuation is now modeled per prior Laos/Cambodia destination instead of through one global `$chainSpaces` pool.
  - Coupled FITL event free-operation grants were updated away from the stale global `$chainSpaces` shape.
  - Targeted checks after the correction show `1010 -> maxTurns (300)`, `1014 -> maxTurns (300)`, `1015 -> maxTurns (300)`, `1019 -> agentStuck (146)`, `1040 -> terminal (26)`, `1041 -> maxTurns (300)`, `1054 -> terminal (29)`.
- Blocking remainder:
  - `126FREOPEBIN-006` reduced the original `1012` free-operation/event-side hotspot, but did not clear the witness.
  - Reassessment on 2026-04-12 shows the next live blocker is later and narrower: policy preview application of a VC `attack`, captured in `126FREOPEBIN-007`.
  - The full scan/canary acceptance remains blocked until both `006` and `007` land.
