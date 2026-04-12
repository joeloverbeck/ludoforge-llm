# 126FREOPEBIN-009: FITL seed 2057 `$targetSpaces` cardinality crash

**Status**: COMPLETE
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — generic template-completion/runtime guard
**Deps**: `archive/tickets/126FREOPEBIN-004.md`, `specs/126-free-operation-binding-resolution-and-agent-robustness.md`

## Problem

Post-review of `126FREOPEBIN-004` captured seed `2057` as a separate FITL crash witness outside that ticket's targeted cohort. Under the repository's real FITL baseline policy profiles, the production `PolicyAgent` path still reproduced:

- `EffectRuntimeError: chooseN selection cardinality mismatch for: $targetSpaces`
- `context={"reason":"choiceRuntimeValidationFailed","effectType":"chooseN","bind":"$targetSpaces","min":1,"max":1,"actual":4}`

The crash was not authored FITL data drift. It came from generic template completion: a bad guided/random `chooseN` completion draw could escape as `EFFECT_RUNTIME` instead of being classified as an unsatisfiable candidate and retried/fallen back safely.

## Assumption Reassessment (2026-04-12)

1. [archive/tickets/126FREOPEBIN-004.md](/home/joeloverbeck/projects/ludoforge-llm/archive/tickets/126FREOPEBIN-004.md) correctly records why seed `2057` was removed from the terminal canary set during `004` closeout — confirmed.
2. `specs/126-free-operation-binding-resolution-and-agent-robustness.md` still lists `2057` in the old terminal sample, so a focused witness remains useful even though it is not currently canary-worthy — confirmed.
3. The exact crash still reproduces on current code when using the repository's FITL baseline policy profiles and simulator RNG handling; a spot check with default `PolicyAgent` instances was misleading and not authoritative — confirmed.
4. Existing `card-71` / An Loc integration coverage already exercises the authored free-operation semantics, so the true missing fix is generic completion-path robustness plus a direct seed-level regression witness — confirmed.

## Architecture Check

1. A separate ticket is still cleaner than reopening `004`, which already completed its approved targeted proof boundary.
2. This preserves Foundations 1, 12, 15, and 16 by landing the fix on the generic completion/runtime boundary rather than FITL-specific authored data.
3. The ticket should still avoid widening back into canary reselection unless seed `2057` later becomes a validated terminal witness again.

## What to Change

### 1. Reproduce and isolate seed `2057`

Run the production FITL `PolicyAgent` path for seed `2057` with the repository's baseline profiles and isolate the real failing boundary.

### 2. Fix the generic completion/runtime boundary

Treat guided/runtime `chooseN` cardinality validation failures during template completion as an unsatisfiable completion result instead of letting them crash agent move preparation.

### 3. Land a focused regression test

Add a focused integration regression for seed `2057` so the former `$targetSpaces` crash path remains bounded and non-throwing even though the seed is still outside the terminal canary set.

## Files to Touch

- `packages/engine/test/integration/` (add focused FITL regression for the `2057` witness)
- `packages/engine/test/unit/kernel/move-completion.test.ts` (prove generic completion classification on invalid guided `chooseN`)
- `packages/engine/src/kernel/move-completion.ts` (narrow generic completion/runtime guard)
- `tickets/126FREOPEBIN-009.md` (record the revised boundary and completed outcome)

## Out of Scope

- Reopening `126FREOPEBIN-004`'s targeted former crash/hang cohort proof
- Re-introducing `2057` into the determinism canary set
- FITL-authored data rewrites for `card-71` unless new evidence appears

## Acceptance Criteria

### Tests That Must Pass

1. A focused regression proves seed `2057` stays bounded and non-throwing on the production FITL `PolicyAgent` path
2. Seed `2057` no longer throws `choiceRuntimeValidationFailed` / cardinality mismatch for `$targetSpaces`
3. Existing suite: `pnpm turbo test`

### Invariants

1. The fix lands on the true generic completion/runtime boundary, not as FITL-specific authored logic
2. The focused witness stays outside the terminal canary set unless separately revalidated

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-seed-2057-regression.test.ts` — prove the former crash witness is now bounded and non-throwing
2. `packages/engine/test/unit/kernel/move-completion.test.ts` — prove invalid guided `chooseN` completion attempts classify as unsatisfiable

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/move-completion.test.js`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-seed-2057-regression.test.js`
4. `pnpm turbo test`

## Outcome

Completed: 2026-04-12

Implemented on the generic template-completion boundary. `completeTemplateMove(...)` now classifies `choiceRuntimeValidationFailed` cardinality errors as `unsatisfiable` instead of letting them escape as agent-loop crashes. That keeps bad guided/random completion draws inside the normal rejection/fallback flow.

Added a unit regression for invalid guided `chooseN` completion and a focused FITL integration regression proving that seed `2057` no longer re-enters the former `$targetSpaces` cardinality crash on the production baseline-policy path. The seed remains outside the terminal canary set; this ticket only locks in non-crashing bounded behavior for the concrete witness.

Deviation from original plan: mid-reassessment briefly suggested the seed had gone stale, but the authoritative FITL baseline-profile simulator path showed the crash was still live. The final implementation stayed on the original generic runtime boundary rather than becoming a regression-only ticket.

Verification:
- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/move-completion.test.js`
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-seed-2057-regression.test.js`
- `pnpm turbo test`
