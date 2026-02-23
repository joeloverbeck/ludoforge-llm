# FITLCOUROUANDDATFIX-003: Coup Victory Phase Gate (Rule 6.1)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None expected (verification + regression tests only)
**Deps**: `archive/tickets/FITLCOUROUANDDATFIX-002.md` (completed)

## Problem

This ticket was originally framed as potential missing coup-victory wiring in data. That assumption is now stale.

Per Spec 43 and FITL Rulebook sections 2.4.2, 6.1, and 6.4.5, production behavior must satisfy:

1. During a coup round, victory checkpoints must stop progression during `coupVictory`.
2. If no victory is met, progression must continue into `coupResources`.
3. Final-coup ranking must resolve after redeploy completion on the last coup round.

The codebase already contains generic `coupPlan` routing and terminal timing evaluation. The remaining gap is explicit regression coverage proving phase-boundary behavior in production FITL runtime, not new runtime/data architecture.

## Assumption Reassessment (2026-02-23)

Verified discrepancies against current code/tests:

1. `data/games/fire-in-the-lake/30-rules-actions.md` already declares `coupVictory` through `coupReset` and a fully wired `turnOrder.config.coupPlan`.
2. `packages/engine/src/kernel/phase-advance.ts` already gates effective phases generically via `coupPlan`, including consecutive-coup suppression and final-round omission.
3. `packages/engine/src/kernel/phase-advance.ts` already checks `terminalResult` inside `advanceToDecisionPoint` before each auto-advance loop iteration.
4. `data/games/fire-in-the-lake/90-terminal.md` already encodes `duringCoup` checkpoints and `final-coup-ranking` with `timing: finalCoup` plus `deck:none == 0` and `lookahead:none == 0`.
5. Existing tests cover structure and terminal formulas, but not an end-to-end production assertion that terminal evaluation halts exactly at `coupVictory` / post-`coupRedeploy`.

## Architecture Decision

Keep the current architecture. Do not add FITL-only phase-enter triggers or alias flags.

Why this is better:

1. Coup activation and timing remain in generic kernel runtime (`coupPlan` + `advanceToDecisionPoint`), reusable by any card-driven game.
2. FITL data stays declarative (`timing` formulas in terminal YAML) without imperative glue.
3. Avoids duplicating victory checks in phase effects and avoids brittle dual-path semantics.

## Scope

### 1. Validate runtime sequencing assumptions

Document verified behavior from:

- `packages/engine/src/kernel/phase-advance.ts`
- `packages/engine/src/kernel/terminal.ts`
- `data/games/fire-in-the-lake/30-rules-actions.md`
- `data/games/fire-in-the-lake/90-terminal.md`

### 2. Add missing production regression tests

Add integration coverage proving:

1. Terminal win during coup halts at `coupVictory` (before `coupResources`).
2. No win at `coupVictory` advances to `coupResources`.
3. `final-coup-ranking` resolves after `coupRedeploy` on last coup round.

### 3. No data or kernel rewiring unless a failing test proves a real gap

If tests fail and expose architectural issues, escalate via 1-3-1 before changing runtime semantics.

## Files to Touch

- `packages/engine/test/integration/fitl-coup-victory-phase-gating.test.ts` (new)
- `tickets/FITLCOUROUANDDATFIX-003.md` (this ticket)

## Out of Scope

- Adding FITL-specific runtime flags/globals/triggers for coup activation
- Reworking generic kernel coup architecture already delivered by ticket 002
- Rule 6.2+ mechanics already covered by follow-on tickets/tests
- Any backwards-compatibility aliasing/shims

## Acceptance Criteria

### Tests That Must Pass

1. Production spec compiles without errors.
2. In a coup-round simulation: when a faction meets its victory condition, the game terminates during the `coupVictory` phase (before Resources phase runs).
3. In a non-final coup round: if no victory condition is met, the game continues to `coupResources` phase.
4. `final-coup-ranking` fires after `coupRedeploy` on the last coup card (deck and lookahead empty).
5. Existing test suite: `pnpm -F @ludoforge/engine test` — all pass.
6. Existing terminal victory tests: `fitl-production-terminal-victory.test.ts` — still green.

### Invariants

1. All 4 faction victory conditions retain their `duringCoup` semantics — checked only during coup rounds.
2. `final-coup-ranking` only fires when deck AND lookahead are empty (last coup card).
3. Non-coup turns never trigger victory or final-coup evaluation.
4. No kernel/runtime behavior changes unless regression tests prove a defect.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-coup-victory-phase-gating.test.ts` (new)
- During-coup win halts in `coupVictory`.
- Non-win advances to `coupResources`.
- Final-coup ranking resolves at post-`coupRedeploy` boundary.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- --test-name-pattern="coup victory phase gating"`
3. `pnpm -F @ludoforge/engine test -- --test-name-pattern="terminal victory|coup phase structure"`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-23
- What actually changed:
  - Corrected stale ticket assumptions/scope to match shipped architecture from `FITLCOUROUANDDATFIX-002`.
  - Added production integration regression coverage for coup-victory phase gating and final-coup post-redeploy ranking timing.
- Deviations from original plan:
  - Did not modify FITL data assets (`90-terminal.md`, `30-rules-actions.md`) because verification showed they were already correct.
  - Did not add runtime wiring/phase-enter triggers because they would duplicate generic kernel behavior.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test -- --test-name-pattern="coup victory phase gating"` passed (and suite green).
  - `pnpm -F @ludoforge/engine test` passed (`259/259`).
  - `pnpm -F @ludoforge/engine lint` passed.
