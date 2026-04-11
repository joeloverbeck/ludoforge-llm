# 126FREOPEBIN-003: Add PolicyAgent fallback for empty phase-2 action-filter completions

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — PolicyAgent phase-2 completion fallback
**Deps**: `archive/tickets/126FREOPEBIN-005.md`

## Problem

The remaining post-`005` live `agentStuck` witness is narrower than the original draft. On FITL seed `1041`, `PolicyAgent` reaches turn `17` with 56 legal moves and throws `NoPlayableMovesAfterPreparationError` even though broader preparation still yields dozens of completed moves. The failure occurs because phase 1 chooses action id `infiltrate`, then the phase-2 `preparePlayableMoves(..., { actionIdFilter })` lane produces zero candidates and the agent throws instead of falling back to the broader prepared set.

## Assumption Reassessment (2026-04-11)

1. `PolicyAgent` in `packages/engine/src/agents/policy-agent.ts` still throws `NoPlayableMovesAfterPreparationError` when the phase-2 prepared candidate set is empty — confirmed.
2. `NoPlayableMovesAfterPreparationError` defined in `packages/engine/src/agents/no-playable-move.ts` line 3 — confirmed.
3. On the current post-`005` code, sampled former `agentStuck` seeds `1021`, `1022`, `1023`, `1044`, `1048`, `1050`, and `1053` no longer hit `agentStuck` in the same bounded window; seed `1041` still does — confirmed.
4. The verified `1041` witness is a phase-1/phase-2 mismatch, not an all-agent empty-template failure: unfiltered preparation yields 70 completed moves, while the chosen `actionIdFilter` (`infiltrate`) yields zero — confirmed.
5. `GreedyAgent` and `RandomAgent` both select valid moves on that same live witness state, so widening this ticket to all three agents would be stale — confirmed.
6. The error still propagates to the simulator which records `agentStuck` stop reason — this remains the observable failure once kernel discovery no longer crashes first.

## Architecture Check

1. The fix remains engine-agnostic — it corrects shared `PolicyAgent` behavior when phase 1 narrows to an action whose phase-2 completion lane produces zero candidates even though broader prepared moves exist.
2. This aligns with Foundations 10 and 15: when legal/prepared moves exist, the agent should continue through a bounded fallback rather than stop on an avoidable local dead-end.
3. No backwards-compatibility shims — the agent keeps its existing two-stage policy flow and only adds a narrow fallback path for a verified mismatch.

## What to Change

### 1. Confirm the phase-1/phase-2 mismatch

Use the verified seed-`1041` witness and focused unit coverage to confirm the actual failure shape: `PolicyAgent` picks an action in phase 1 whose filtered preparation returns zero candidates, even though broader preparation returns valid completed moves.

### 2. Add a narrow PolicyAgent fallback

When the chosen phase-2 `actionIdFilter` yields zero playable candidates but broader preparation still yields completed or stochastic candidates, `PolicyAgent` should fall back to that broader prepared set instead of throwing. Keep the fallback narrow:
- preserve the existing phase-1 action ranking and normal phase-2 path when filtered preparation succeeds
- use the broader prepared candidate set only for the verified empty-filter dead-end
- record a trace-visible diagnostic so the fallback is observable in policy decision traces

### 3. Preserve the hard error when no prepared fallback exists

If broader preparation also yields zero candidates, keep throwing `NoPlayableMovesAfterPreparationError`. That remains a real failure rather than the verified phase-1/phase-2 mismatch.

## Files to Touch

- `packages/engine/src/agents/policy-agent.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` and/or `packages/engine/src/agents/policy-diagnostics.ts` (modify if needed for trace-visible fallback metadata)
- `packages/engine/test/unit/agents/policy-agent.test.ts` (modify)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify)

## Out of Scope

- Zone filter probe fix (tickets 001 and 005)
- Enumeration budgets (ticket 002)
- GreedyAgent / RandomAgent behavior changes
- Full PolicyAgent AI strategy overhaul
- General template matcher redesign beyond the narrow fallback

## Acceptance Criteria

### Tests That Must Pass

1. Unit: when phase 1 chooses an action whose filtered preparation is empty but broader preparation succeeds, `PolicyAgent` returns a broader prepared move instead of throwing
2. Unit: when both filtered and broader preparation are empty, `PolicyAgent` still throws `NoPlayableMovesAfterPreparationError`
3. Integration: the verified FITL seed-`1041` witness advances past the former turn-17 `agentStuck` boundary
4. Existing focused checks: repo-valid `build` + direct `node --test` runs pass

### Invariants

1. `PolicyAgent` no longer stops on the verified empty-filter dead-end when broader prepared candidates exist
2. Determinism preserved — fallback continues to use the agent RNG, never `Math.random()`
3. Policy decision traces make the fallback visible when it triggers

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-agent.test.ts` — add empty-filter fallback regression and preserve the true-empty throw case
2. `packages/engine/test/integration/fitl-policy-agent.test.ts` — add a bounded seed-`1041` regression for the former live `agentStuck` witness

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-agent.test.js`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-policy-agent.test.js`

## Outcome

- Completed: 2026-04-11
- What changed:
  - narrowed the implementation from the stale all-agent fallback plan to a `PolicyAgent`-only phase-1/phase-2 mismatch fix
  - updated `packages/engine/src/agents/policy-agent.ts` so an empty phase-2 `actionIdFilter` lane widens to a broader prepared candidate set before throwing
  - added a trace-visible failure code and emergency fallback signal for this path in policy decision metadata
  - added a unit regression in `packages/engine/test/unit/agents/policy-agent.test.ts`
  - added a bounded FITL seed-`1041` regression in `packages/engine/test/integration/fitl-policy-agent.test.ts`
- Deviations from original plan:
  - the drafted “all three agents random fallback when every template is uncompletable” boundary was stale after ticket `005`
  - live evidence showed `RandomAgent` and `GreedyAgent` already succeeded on the witness state while `PolicyAgent` failed only after phase 1 chose an action whose filtered phase-2 preparation was empty
  - no `GreedyAgent` / `RandomAgent` changes or new shared fallback test file were needed once the real boundary was verified
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-agent.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-policy-agent.test.js`
