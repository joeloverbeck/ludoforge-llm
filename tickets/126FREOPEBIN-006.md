# 126FREOPEBIN-006: FITL seed 1012 slow/hang boundary after March Trail correction

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Unknown until reassessment; do not assume data-only
**Deps**: `archive/tickets/126FREOPEBIN-001.md`, `archive/tickets/126FREOPEBIN-002.md`, `archive/tickets/126FREOPEBIN-003.md`, `archive/tickets/126FREOPEBIN-005.md`

## Problem

After the FITL NVA March Trail continuation correction from `126FREOPEBIN-004`, the original `$chainSpaces` crash/hang boundary is cleared, but seed `1012` remains too slow to satisfy the series scan acceptance. A direct post-fix `runGame(...)` check on April 11, 2026 did not finish within `timeout 120s`, and a bounded trace advanced only to about ply `110` after 30 seconds. The next live boundary must be identified before `004` can complete its full scan and canary work.

## Assumption Reassessment (2026-04-11)

1. The earlier March Trail correction is already in progress in `126FREOPEBIN-004` and should not be re-opened unless this ticket proves it incomplete.
2. Seed `1012` no longer reproduces the old `$chainSpaces` cardinality crash; it now exhibits a slow/hang boundary after the March data correction.
3. Former hang seeds `1040` and `1054` terminate post-fix, so this is a new narrower outlier rather than the old shared March failure class.
4. `docs/FOUNDATIONS.md` 10 still applies: the simulator path must remain bounded enough that the scan can complete in reasonable time.

## Architecture Check

1. Root-cause-first reassessment is required before deciding whether the remaining boundary belongs in FITL data or generic engine code (Foundations 10, 15).
2. Any engine change must remain game-agnostic (Foundation 1). If the issue is FITL-only, keep the fix in GameSpecDoc data.
3. The resolution must be proven with automated tests and a targeted bounded witness (Foundation 16).

## What to Change

### 1. Reproduce the post-fix `1012` boundary

- Trace seed `1012` on current post-March-correction code.
- Identify whether the slowdown is in legal move enumeration, free-operation probing, agent preparation, or another FITL rules-data path.
- Record the narrowest valid proof surface for the remaining boundary.

### 2. Implement the root-cause fix

- If the issue is another FITL data-modeling error, correct the relevant FITL rules/event data.
- If the issue is a generic engine boundedness gap, stop and handle it in the smallest engine-agnostic slice justified by the evidence.
- Do not silently absorb broader scan/canary work into this ticket; this ticket exists to unblock `004`.

### 3. Prove the unblock

- Add or update the narrowest regression proving seed `1012` no longer crashes or effectively hangs.
- Re-run the targeted `1012` witness and enough nearby seeds to confirm `004` can resume.

## Files to Touch

- Unknown until reassessment; expected to include one or more FITL data files and/or targeted engine tests
- `tickets/126FREOPEBIN-004.md` (modify only if the live boundary shifts again)

## Out of Scope

- Completing the full 1000–2200 scan
- Selecting final determinism canary seeds
- Archiving `126FREOPEBIN-004`

## Acceptance Criteria

1. Seed `1012` reaches `terminal`, `maxTurns`, or `agentStuck` without crashing
2. Seed `1012` no longer requires an effectively unbounded proof run to classify
3. The fix is proven by targeted automated coverage
4. `126FREOPEBIN-004` can resume its scan/canary deliverables on top of this result

## Test Plan

1. Build `@ludoforge/engine`
2. Run the targeted post-fix `1012` witness
3. Run the new targeted regression(s)
4. Re-run the `004`-relevant seed checks needed to confirm unblock
