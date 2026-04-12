# 126FREOPEBIN-006: FITL seed 1012 slow/hang boundary after March Trail correction

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Unknown until reassessment; do not assume data-only
**Deps**: `archive/tickets/126FREOPEBIN-001.md`, `archive/tickets/126FREOPEBIN-002.md`, `archive/tickets/126FREOPEBIN-003.md`, `archive/tickets/126FREOPEBIN-005.md`, `archive/tickets/126FREOPEBIN-007.md`

## Problem

After the FITL NVA March Trail continuation correction from `126FREOPEBIN-004`, the original `$chainSpaces` crash/hang boundary is cleared, but seed `1012` remains too slow to satisfy the series scan acceptance. The first live hotspot was free-operation viability in suppressed FITL event-side probing, but after landing that boundedness work the remaining witness shifted later into PolicyAgent preview/runtime evaluation. The ticket is therefore partially completed and now blocked on `126FREOPEBIN-007`, which targets the new policy-preview `applyMove -> advanceToDecisionPoint -> legalMoves` slowdown.

## Assumption Reassessment (2026-04-11)

1. The earlier March Trail correction is already in progress in `126FREOPEBIN-004` and should not be re-opened unless this ticket proves it incomplete.
2. Seed `1012` no longer reproduces the old `$chainSpaces` cardinality crash; it now exhibits a slow/hang boundary after the March data correction.
3. Former hang seeds `1040` and `1054` terminate post-fix, so this is a new narrower outlier rather than the old shared March failure class.
4. `docs/FOUNDATIONS.md` 10 still applies: the simulator path must remain bounded enough that the scan can complete in reasonable time.
5. Reassessment on April 12, 2026 shows the original `006` hotspot was real but not sufficient: seed `1012` now reaches about ply `184` in a 30-second trace, and the dominant remaining delay is `PolicyAgent.chooseMove` preview application for a VC `attack`, not free-operation viability.

## Architecture Check

1. Root-cause-first reassessment is required before deciding whether the remaining boundary belongs in FITL data or generic engine code (Foundations 10, 15).
2. The boundedness work already landed here is engine-agnostic and remains valid under Foundation 1.
3. The newly exposed preview/runtime slowdown is a distinct root cause and must not be silently absorbed into this ticket once evidence shows the boundary moved (Foundations 15, 16).

## What to Change

### 1. Reproduce the post-fix `1012` boundary

- Trace seed `1012` on current post-March-correction code.
- Identify whether the slowdown is in legal move enumeration, free-operation probing, agent preparation, or another FITL rules-data path.
- Record the narrowest valid proof surface for the remaining boundary.

### 2. Implement the root-cause fix

Implemented during this ticket:
- Charge free-operation viability traversal budgets during `chooseOne` / `chooseN` branch exploration instead of only after full selections materialize.
- Order viability probing by lower-complexity candidate branches first, both in grant probing and generic move-decision satisfiability classification.
- Use `moveZoneProbeBindings` during probe-time potential-authorization checks so suppressed event-side grants can prune impossible branches before full move-zone bindings resolve.

If the remaining issue moves again after this work, stop and handle it in the smallest engine-agnostic slice justified by the evidence. Do not silently absorb broader scan/canary work into this ticket; this ticket exists to unblock `004`.

### 3. Prove the unblock

- Completed here:
  - Add targeted regressions proving the former `1012` free-operation/event-side hotspots are traversable.
  - Re-run the targeted `1012` witness to confirm the hotspot moved.
- Remaining unblock proof now belongs to `126FREOPEBIN-007`.

## Files to Touch

- `packages/engine/src/kernel/choice-option-policy.ts` (modified)
- `packages/engine/src/kernel/decision-sequence-satisfiability.ts` (modified)
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` (modified)
- `packages/engine/src/kernel/free-operation-viability.ts` (modified)
- `packages/engine/src/kernel/move-decision-sequence.ts` (modified)
- `packages/engine/test/unit/kernel/free-operation-viability.test.ts` (modified)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modified)
- `packages/engine/test/integration/fitl-policy-agent-enumeration-hang.test.ts` (modified)
- `tickets/126FREOPEBIN-004.md` (modify only if the live boundary shifts again)

## Out of Scope

- Completing the full 1000–2200 scan
- Selecting final determinism canary seeds
- Archiving `126FREOPEBIN-004`

## Acceptance Criteria

1. The former free-operation/event-side hotspot on seed `1012` is materially reduced and proven by targeted automated coverage
2. Seed `1012` no longer spends its dominant time in the original `006` free-operation viability boundary
3. Any remaining blocker is explicitly recorded and handed off via a prerequisite ticket rather than silently widened
4. `126FREOPEBIN-004` can resume only after the follow-up blocker ticket lands

## Test Plan

1. Build `@ludoforge/engine`
2. Run the targeted regression(s) for free-operation viability and `1012` hotspot traversal
3. Re-run the bounded `1012` witness and confirm whether the hotspot moved
4. If the hotspot moves, create the narrowest prerequisite follow-up ticket before continuing

## Outcome (2026-04-12)

- Landed engine-agnostic boundedness work in free-operation viability and move-decision satisfiability.
- Added targeted regression coverage for lower-complexity branch ordering and probe-binding-based early pruning.
- Verified that the original `1012` free-operation/event-side hotspot moved: the bounded 30-second trace now reaches about ply `184` instead of about ply `110`.
- Verification then exposed a later narrower blocker in policy preview/runtime evaluation; that work was split to `126FREOPEBIN-007` rather than widening this ticket.
- After archived follow-ups `126FREOPEBIN-007` and `126FREOPEBIN-008` landed, seed `1012` reached a bounded `maxTurns (300)` classification, confirming this ticket's free-operation/event-side boundary was fully cleared.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/free-operation-viability.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/move-decision-sequence.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-policy-agent-enumeration-hang.test.js`
