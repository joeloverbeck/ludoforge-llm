# 126FREOPEBIN-008: Real-move attack applyMove slowdown on FITL seed 1012

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Expected — engine/runtime only, game-agnostic
**Deps**: `archive/tickets/126FREOPEBIN-001.md`, `archive/tickets/126FREOPEBIN-002.md`, `archive/tickets/126FREOPEBIN-003.md`, `archive/tickets/126FREOPEBIN-005.md`, `tickets/126FREOPEBIN-006.md`, `tickets/126FREOPEBIN-007.md`

## Problem

After the boundedness work in `126FREOPEBIN-006` and the policy-preview fix in `126FREOPEBIN-007`, seed `1012` still does not classify within a bounded witness run. The former preview hotspot is cleared, but the dominant remaining cost has moved to actual move execution. On April 12, 2026, a 30-second bounded run reached about ply `185`; profiling showed the slowest remaining step was `applyTrustedMove` at ply `183` on a VC `attack`, taking about `3138ms`. Aggregate timing over that bounded run was roughly `enumerateLegalMoves=13.3s`, `PolicyAgent.chooseMove=15.0s`, and `applyTrustedMove=3.4s`, with the worst single execution now in the real move-application path rather than preview. This distinct engine/runtime boundary must be fixed before `004` can complete its scan and canary work.

## Assumption Reassessment (2026-04-12)

1. The `006` free-operation/event-side hotspot was real and is now reduced enough that the remaining boundary is later in the run.
2. The `007` preview/runtime hotspot was also real and is now reduced enough that the ply-183 preview witness is no longer dominant.
3. The remaining cost is in generic engine/runtime execution, not FITL data modeling, so the fix must remain game-agnostic (Foundations 1, 15).
4. The FITL rules checked in `rules/fire-in-the-lake/fire-in-the-lake-rules-section-4.md` and `rules/fire-in-the-lake/fire-in-the-lake-rules-section-8.md` support the legality of VC/NVA attack sequencing and do not justify a FITL-data workaround here.
5. `docs/FOUNDATIONS.md` 10 still applies: real move execution and decision-point advancement cannot rely on effectively unbounded work in late-run simulator traces.

## Architecture Check

1. Any fix must be engine-agnostic and reusable across games; no FITL-specific branches (Foundation 1).
2. The solution must address the root cause in actual move execution/runtime behavior, not merely mask the slow seed (Foundation 15).
3. The fix must be proven with targeted automated regressions plus the bounded `1012` witness (Foundation 16).

## What to Change

### 1. Reproduce the post-preview hotspot

- Reconfirm the current seed `1012` late hotspot on top of `007`.
- Identify why actual `applyTrustedMove` for the ply-183 VC `attack` still spends multi-second time in move execution / decision-point advancement / legal-move work.
- Determine the narrowest valid fix surface: shared `applyMove` semantics, downstream decision-point advancement policy, or a lower-level legal-move/runtime budget gap.

### 2. Implement the root-cause fix

- Fix the real move-execution/runtime bottleneck in the smallest game-agnostic slice justified by the evidence.
- If the issue is in shared decision-point advancement after actual move resolution, correct that shared engine behavior rather than adding PolicyAgent-only workarounds.
- Do not add FITL-specific shortcuts or ticket-local hacks.

### 3. Prove the unblock

- Add or update the narrowest regression proving the former late `1012` real-move hotspot is reduced.
- Re-run the bounded `1012` witness and enough nearby checks to confirm `004` can resume.

## Files to Touch

- Unknown until reassessment; expected to include one or more of:
  - `packages/engine/src/kernel/apply-move.ts`
  - `packages/engine/src/kernel/phase-advance.ts`
  - `packages/engine/src/kernel/legal-moves.ts`
  - `packages/engine/src/agents/policy-agent.ts`
  - targeted unit/integration tests under `packages/engine/test`
- `tickets/126FREOPEBIN-004.md` (modify only if the live boundary shifts again)

## Out of Scope

- Re-opening FITL March Trail data correction
- Re-opening the preview-specific fix from `126FREOPEBIN-007`
- Full 1000–2200 scan completion
- Final determinism canary selection
- FITL-specific policy heuristics or strategy changes

## Acceptance Criteria

1. Seed `1012` reaches `terminal`, `maxTurns`, or `agentStuck` without crashing
2. Seed `1012` no longer requires an effectively unbounded proof run to classify
3. The late real-move execution hotspot is proven reduced by targeted automated coverage
4. `126FREOPEBIN-004` can resume its scan/canary deliverables on top of this result

## Test Plan

1. Build `@ludoforge/engine`
2. Run the new targeted regression(s) for the real-move execution hotspot
3. Run the bounded seed `1012` witness
4. Re-run the `004`-relevant seed checks needed to confirm unblock

## Outcome (2026-04-12)

- Added an early-exit fast path in `legal-moves.ts` that returns immediately once a filtered trivial move already proves the state has a legal action, instead of continuing into pending free-operation variant enumeration.
- Verified this directly fixes the former ply-183 real-move hotspot exposed after `007`: the late `applyTrustedMove` cost is no longer multi-second, and the bounded seed `1012` witness now reaches a stable `maxTurns (300)` classification instead of timing out.
- Added targeted unit coverage proving `earlyExitAfterFirst` now returns the legal `pass` move without descending into malformed pending-grant enumeration.
- `126FREOPEBIN-004` can now resume its scan/canary deliverables on top of the cumulative `006`/`007`/`008` engine fixes.
