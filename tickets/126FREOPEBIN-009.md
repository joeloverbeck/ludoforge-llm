# 126FREOPEBIN-009: FITL seed 2057 `$targetSpaces` cardinality crash

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — exact runtime/data owner to confirm during reassessment
**Deps**: `archive/tickets/126FREOPEBIN-004.md`, `specs/126-free-operation-binding-resolution-and-agent-robustness.md`

## Problem

Post-review of `126FREOPEBIN-004` found one still-live FITL crash outside that ticket's targeted proof cohort. Seed `2057`, which previously appeared in the original spec's terminal sample and older canary set, now crashes with:

- `EffectRuntimeError: chooseN selection cardinality mismatch for: $targetSpaces`
- `context={"reason":"choiceRuntimeValidationFailed","effectType":"chooseN","bind":"$targetSpaces","min":1,"max":1,"actual":4}`

This is concrete current evidence, not a speculative cleanup. `004` removed `2057` from the determinism canaries rather than papering over the crash, but the underlying runtime/data defect remains and should be fixed on its own boundary.

## Assumption Reassessment (2026-04-12)

1. `archive/archive/tickets/126FREOPEBIN-004.md` records the exact repro context: seed `2057` was removed from the canary set because it now crashes on a separate `$targetSpaces` cardinality defect — confirmed.
2. `specs/126-free-operation-binding-resolution-and-agent-robustness.md` still lists `2057` in the old terminal sample, so the live code has drifted from the earlier broad seed classification — confirmed.
3. The current repo has no remaining active `126FREOPEBIN` ticket covering this crash after `004` completes — confirmed.
4. The current crash surface is runtime contract enforcement (`choiceRuntimeValidationFailed` / cardinality mismatch), but the root cause may still be either FITL-authored action data or a generic engine/runtime boundary. Exact ownership must be revalidated before implementation.

## Architecture Check

1. A separate ticket is cleaner than reopening `004`, which already completed its approved targeted proof boundary and archival-ready outcome.
2. This preserves Foundations 1, 12, and 15 by forcing a fresh root-cause reassessment before deciding whether the fix belongs in FITL-authored data or a generic kernel/runtime path.
3. The ticket is anchored to a concrete deterministic seed witness and should land a regression test, so the eventual fix remains test-proven under Foundation 16.

## What to Change

### 1. Reproduce and isolate seed `2057`

Run the production FITL PolicyAgent path for seed `2057` and identify the exact action / decision / authored rule path that produces the `$targetSpaces` cardinality mismatch.

### 2. Fix the root cause on the correct boundary

Depending on reassessment evidence:
- correct FITL-authored action/event data if the move shape is semantically wrong in GameSpecDoc
- or correct the generic runtime/choice validation path if the authored move is valid and the engine is mishandling it

### 3. Land a permanent regression

Add a focused regression test for seed `2057` or the narrower reconstructed runtime witness so the crash cannot silently re-enter the canary pool.

## Files to Touch

- `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` (modify only if the fixed seed should re-enter the canary set)
- `packages/engine/test/integration/` (modify or add focused FITL regression for the `2057` crash witness)
- `packages/engine/src/kernel/` (modify only if reassessment proves a generic runtime/choice bug)
- `data/games/fire-in-the-lake/` (modify only if reassessment proves an authored FITL data bug)

## Out of Scope

- Reopening `126FREOPEBIN-004`'s targeted former crash/hang cohort proof
- Broad canary reselection beyond the concrete `2057` witness
- Unrelated FITL maxTurns or agentStuck quality issues

## Acceptance Criteria

### Tests That Must Pass

1. A focused regression reproduces the current seed `2057` crash path before the fix and passes after the fix
2. Seed `2057` no longer throws `choiceRuntimeValidationFailed` / cardinality mismatch for `$targetSpaces`
3. Existing suite: `pnpm turbo test`

### Invariants

1. The fix lands on the true root-cause boundary, not as a canary-only workaround
2. No game-specific logic leaks into engine code if the final owner is generic runtime behavior

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/<targeted-fitl-2057-regression>.test.ts` — prove the concrete crash witness is fixed
2. `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` — only if `2057` becomes a validated terminal canary again

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/<targeted-fitl-2057-regression>.test.js`
3. `pnpm turbo test`
