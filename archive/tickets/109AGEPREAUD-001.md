# 109AGEPREAUD-001: Diagnostic — trace event move classification path

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — prepare-playable-moves.ts (diagnostic logging only)
**Deps**: `specs/109-agent-preview-audit.md`

## Problem

The preview system produces identical projected margins for shaded vs unshaded event card candidates. Before fixing, we need to confirm the root cause: are event moves classified as `complete`, `stochastic`, or `pending` in `preparePlayableMoves`? Do they enter `trustedMoveIndex`? If not, where exactly do they fall out of the pipeline?

## Assumption Reassessment (2026-04-05)

1. `preparePlayableMoves` exists at `packages/engine/src/agents/prepare-playable-moves.ts:55-148` — confirmed.
2. Classification paths: `viability.complete` (line 99), `viability.stochasticDecision` (line 107), pending → `attemptTemplateCompletion` (line 117) — confirmed.
3. `attemptTemplateCompletion` at lines 155-211 — confirmed. Calls `evaluatePlayableMoveCandidate`.
4. Event moves are enumerated separately per side at `legal-moves.ts:1071-1156` — confirmed.

## Architecture Check

1. This is a diagnostic-only ticket — no behavioral changes. Adds temporary logging/instrumentation to trace the classification path for event moves.
2. The diagnostic can be implemented as opt-in trace output (controlled by trace level) or as a temporary debugging aid removed after ticket 002.
3. No game-specific logic — traces all move types, filtering for events in analysis.

## What to Change

### 1. Instrument `preparePlayableMoves` to log event move classification

Add diagnostic output that records, for each legal move processed:
- `actionId` and `stableMoveKey` (abbreviated)
- Classification result: `complete`, `stochastic`, `pending`, or `rejected`
- For pending moves: whether `attemptTemplateCompletion` succeeded or failed
- For failed completions: the rejection reason (`completionUnsatisfiable`, `notViable`, etc.)

This can be a conditional log gated on a flag or always-on at verbose trace level.

### 2. Run diagnostic on FITL tournament seeds

Using the campaign's existing harness infrastructure (or a standalone script), run a FITL game at seed 1003 or 1004 (seeds with event candidates) and capture the diagnostic output. Analyze:
- How many event moves are enumerated?
- How many enter `completedMoves` vs `stochasticMoves` vs are discarded?
- For shaded vs unshaded of the same card: do they follow the same classification path?

### 3. Document findings in musings or a diagnostic report

Record the confirmed root cause with specific evidence (which path, which line, which classification) for ticket 002 to act on.

## Files to Touch

- `packages/engine/src/agents/prepare-playable-moves.ts` (modify) — add classification diagnostics
- `packages/engine/src/agents/policy-agent.ts` (modify) — pass through diagnostic flag if needed

## Out of Scope

- Fixing the classification (ticket 002)
- Fixing the enumeration-time filter (ticket 003)
- Enriching preview trace output (ticket 004)
- Writing integration tests (ticket 005)

## Acceptance Criteria

### Tests That Must Pass

1. Diagnostic output correctly identifies the classification path for event moves
2. For a FITL game state with event candidates, the diagnostic shows where shaded and unshaded diverge (or confirms they follow the same path)
3. Existing suite: `pnpm turbo test`

### Invariants

1. No behavioral changes — game outcomes must be identical with and without diagnostics
2. Diagnostic output does not affect performance when disabled

## Test Plan

### New/Modified Tests

1. No new tests — this is a diagnostic ticket. The diagnostic output IS the deliverable.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test`
2. Run FITL seed with event candidates and analyze diagnostic output

## Outcome

Completed: 2026-04-05

What changed:
- Added structured verbose-trace `movePreparations` diagnostics to the policy agent trace instead of ad hoc logging.
- Threaded move-preparation classification metadata through the policy evaluation and trace schemas.
- Wrote the FITL audit findings to `reports/109-agent-preview-audit.md`.
- Corrected stale downstream ticket premises in `109AGEPREAUD-002.md` and `109AGEPREAUD-004.md` based on the audit result.

Deviations from original plan:
- The final diagnostic surface was the existing verbose policy trace, not temporary console-style logging.
- The audit disproved the original broad hypothesis that event moves generally fail out of `preparePlayableMoves` before trusted preview.

Verification results:
- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine run schema:artifacts`
- `node --test packages/engine/dist/test/unit/agents/policy-diagnostics.test.js packages/engine/dist/test/unit/agents/policy-agent.test.js`
- `pnpm -F @ludoforge/engine test`
- `pnpm run check:ticket-deps`
