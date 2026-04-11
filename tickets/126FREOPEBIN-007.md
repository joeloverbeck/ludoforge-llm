# 126FREOPEBIN-007: Policy preview applyMove slowdown on FITL seed 1012

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Expected — engine/agent runtime only, game-agnostic
**Deps**: `archive/tickets/126FREOPEBIN-001.md`, `archive/tickets/126FREOPEBIN-002.md`, `archive/tickets/126FREOPEBIN-003.md`, `archive/tickets/126FREOPEBIN-005.md`, `tickets/126FREOPEBIN-006.md`

## Problem

After the boundedness work in `126FREOPEBIN-006`, seed `1012` still does not complete within a bounded witness run. The remaining live hotspot is no longer free-operation viability. On April 12, 2026, a 30-second bounded trace reached about ply `184`, and the dominant remaining delay was `PolicyAgent.chooseMove` at ply `183` on a VC `attack`. Direct profiling showed that preview evaluation spends about `3.3s` applying that trusted `attack` move, almost entirely in `applyMove -> advanceToDecisionPoint -> legalMoves`. This distinct engine/agent-runtime boundary must be fixed before `004` can complete its scan and canary work.

## Assumption Reassessment (2026-04-12)

1. The `006` free-operation/event-side hotspot was real and is now reduced enough that the remaining boundary is later in the run.
2. The FITL rules checked in `rules/fire-in-the-lake/fire-in-the-lake-rules-section-4.md` and `rules/fire-in-the-lake/fire-in-the-lake-rules-section-8.md` support the legality of VC/NVA attack/ambush sequencing and do not justify a FITL-data workaround for the current slowdown.
3. The remaining cost is in generic preview/runtime behavior, not FITL data modeling, so the fix must remain game-agnostic (Foundations 1, 15).
4. `docs/FOUNDATIONS.md` 10 still applies: preview evaluation cannot rely on effectively unbounded move application inside agent choice.

## Architecture Check

1. Any fix must be engine-agnostic and reusable across games; no FITL-specific branches (Foundation 1).
2. The solution must address the root cause in preview/runtime evaluation, not merely mask the slow seed (Foundation 15).
3. The fix must be proven with targeted automated regressions plus the bounded `1012` witness (Foundation 16).

## What to Change

### 1. Reproduce the preview/runtime hotspot

- Reconfirm the seed `1012` late hotspot on current code.
- Identify why policy preview `applyMove` for the VC `attack` spends most of its time in `advanceToDecisionPoint -> legalMoves`.
- Determine the narrowest valid fix surface: preview-specific apply semantics, decision-point advancement policy, or a lower-level legal-move/runtime budget gap.

### 2. Implement the root-cause fix

- If preview refs only require post-move state, avoid unnecessary full `advanceToDecisionPoint` work during policy preview.
- If the issue is deeper than preview semantics, fix the shared engine/runtime behavior in the smallest game-agnostic slice justified by the evidence.
- Do not add FITL-specific preview shortcuts or ticket-local hacks.

### 3. Prove the unblock

- Add or update the narrowest regression proving the former late `1012` preview hotspot is reduced.
- Re-run the bounded `1012` witness and enough nearby checks to confirm `004` can resume.

## Files to Touch

- Unknown until reassessment; expected to include one or more of:
  - `packages/engine/src/agents/policy-agent.ts`
  - `packages/engine/src/agents/policy-preview.ts`
  - `packages/engine/src/agents/policy-eval.ts`
  - `packages/engine/src/kernel/apply-move.ts`
  - `packages/engine/src/kernel/phase-advance.ts`
  - targeted unit/integration tests under `packages/engine/test`
- `tickets/126FREOPEBIN-004.md` (modify only if the live boundary shifts again)

## Out of Scope

- Re-opening FITL March Trail data correction
- Full 1000–2200 scan completion
- Final determinism canary selection
- FITL-specific policy heuristics or strategy changes

## Acceptance Criteria

1. Seed `1012` reaches `terminal`, `maxTurns`, or `agentStuck` without crashing
2. Seed `1012` no longer requires an effectively unbounded preview/runtime proof run to classify
3. The late `PolicyAgent` preview hotspot is proven reduced by targeted automated coverage
4. `126FREOPEBIN-004` can resume its scan/canary deliverables on top of this result

## Test Plan

1. Build `@ludoforge/engine`
2. Run the new targeted regression(s) for the preview/runtime hotspot
3. Run the bounded seed `1012` witness
4. Re-run the `004`-relevant seed checks needed to confirm unblock
