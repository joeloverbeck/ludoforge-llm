# 126FREOPEBIN-007: Policy preview applyMove slowdown on FITL seed 1012

**Status**: BLOCKED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Expected — engine/agent runtime only, game-agnostic
**Deps**: `archive/tickets/126FREOPEBIN-001.md`, `archive/tickets/126FREOPEBIN-002.md`, `archive/tickets/126FREOPEBIN-003.md`, `archive/tickets/126FREOPEBIN-005.md`, `tickets/126FREOPEBIN-006.md`, `archive/tickets/126FREOPEBIN-008.md`

## Problem

After the boundedness work in `126FREOPEBIN-006`, seed `1012` still did not complete within a bounded witness run. The first remaining live hotspot was policy preview application of a VC `attack`: on April 12, 2026, a 30-second bounded trace reached about ply `184`, and direct profiling showed preview evaluation spending about `3.3s` in `applyMove -> advanceToDecisionPoint -> legalMoves` while evaluating that trusted move. That preview/runtime boundary has now been fixed in this ticket, but the bounded witness is still not complete because the dominant remaining cost moved again. The ticket is therefore partially completed and now blocked on `126FREOPEBIN-008`, which owns the newly exposed real-move execution slowdown later in the same seed.

## Assumption Reassessment (2026-04-12)

1. The `006` free-operation/event-side hotspot was real and is now reduced enough that the remaining boundary is later in the run.
2. The FITL rules checked in `rules/fire-in-the-lake/fire-in-the-lake-rules-section-4.md` and `rules/fire-in-the-lake/fire-in-the-lake-rules-section-8.md` support the legality of VC/NVA attack/ambush sequencing and do not justify a FITL-data workaround for the slowdown.
3. The preview-specific cost was in generic preview/runtime behavior, not FITL data modeling, so the fix remained game-agnostic (Foundations 1, 15).
4. `docs/FOUNDATIONS.md` 10 still applies: preview evaluation cannot rely on effectively unbounded move application inside agent choice.
5. Reassessment after landing the preview fix shows the original `007` hotspot is cleared: the former ply-183 `PolicyAgent.chooseMove` witness dropped from multi-second preview time to about `7ms`, but the seed still only reaches about ply `185` in a 30-second run because the dominant remaining cost is now actual `applyTrustedMove` for the same `attack`.

## Architecture Check

1. Any fix here had to be engine-agnostic and reusable across games; no FITL-specific branches (Foundation 1).
2. The solution had to address the root cause in preview/runtime evaluation, not merely mask the slow seed (Foundation 15).
3. The follow-up blocker is now distinct and must not be silently absorbed once evidence shows the boundary moved again (Foundations 15, 16).

## What to Change

### 1. Reproduce the preview/runtime hotspot

Completed during this ticket:
- Reconfirmed the seed `1012` late hotspot on current code.
- Identified that policy preview `applyMove` for the VC `attack` was spending most of its time in `advanceToDecisionPoint -> legalMoves`.
- Determined the narrowest valid fix surface was preview-specific apply semantics.

### 2. Implement the root-cause fix

Implemented during this ticket:
- Add a shared preview-application helper in `policy-preview.ts` that applies trusted moves with `advanceToDecisionPoint: false`.
- Route policy preview runtime move application through that helper so preview refs use immediate post-move state rather than full decision-point advancement.
- Align memoized preview dependencies in `policy-agent.ts` with the same preview-specific semantics.

Do not widen this ticket to cover the new post-preview hotspot. That remaining boundary belongs to `126FREOPEBIN-008`.

### 3. Prove the unblock

Completed here:
- Added targeted automated coverage proving policy preview application now uses non-advancing semantics.
- Re-ran the bounded `1012` witness and confirmed the original preview hotspot is reduced enough that the live blocker moved.

Remaining unblock proof now belongs to `126FREOPEBIN-008`.

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modified)
- `packages/engine/src/agents/policy-agent.ts` (modified)
- `packages/engine/test/unit/agents/policy-preview.test.ts` (modified)
- `tickets/126FREOPEBIN-004.md` (modify only if the live boundary shifts again)

## Out of Scope

- Re-opening FITL March Trail data correction
- Full 1000–2200 scan completion
- Final determinism canary selection
- FITL-specific policy heuristics or strategy changes
- The newly exposed real-move execution slowdown after the preview fix

## Acceptance Criteria

1. The former late `PolicyAgent` preview hotspot is materially reduced and proven by targeted automated coverage
2. Seed `1012` no longer spends its dominant time in preview `applyMove -> advanceToDecisionPoint -> legalMoves`
3. Any remaining blocker is explicitly recorded and handed off via a prerequisite ticket rather than silently widened
4. `126FREOPEBIN-004` can resume only after the follow-up blocker ticket lands

## Test Plan

1. Build `@ludoforge/engine`
2. Run the new targeted regression(s) for the preview/runtime hotspot
3. Re-run the bounded seed `1012` witness and confirm whether the hotspot moved
4. If the hotspot moves, create the narrowest prerequisite follow-up ticket before continuing

## Partial Outcome (2026-04-12)

- Landed a shared preview-application path that skips `advanceToDecisionPoint` during policy preview evaluation.
- Aligned memoized preview application in `PolicyAgent` with the same non-advancing preview semantics.
- Added targeted unit coverage proving preview application now receives `{ advanceToDecisionPoint: false }`.
- Verified that the original `007` hotspot is cleared: the former ply-183 preview witness now takes about `7ms` instead of several seconds.
- Verified the remaining blocker is later and distinct: in a 30-second bounded seed-`1012` run, the seed now reaches about ply `185`, and the slowest remaining step is actual `applyTrustedMove` at ply `183` on `attack` at about `3138ms`.
- Ticket is blocked on `126FREOPEBIN-008`, which owns that newly exposed real-move execution boundary.
