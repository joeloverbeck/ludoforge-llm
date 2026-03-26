# 86DETLANEHNG-002: Fix the determinism lane stall without weakening determinism proofs

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — determinism test(s) and/or generic engine runtime path identified by the lane audit
**Deps**: `docs/FOUNDATIONS.md`, `tickets/README.md`, `tickets/86DETLANEHNG-001-harden-determinism-lane-runner.md`

## Problem

The repository appears to have a real stall somewhere in the dedicated determinism lane. After `86DETLANEHNG-001` makes the lane observable, the offending file and failure mode should be identifiable. This ticket owns the actual repair.

The repair must preserve the reason the lane exists: proving determinism. If a test or runtime path is wrong, fix the implementation or the test harness architecture. Do not "solve" this by skipping the test, lowering coverage, or trimming assertions until it passes.

## Assumption Reassessment (2026-03-27)

1. The current determinism lane contains exactly three files, but the specific offender is not yet proven; this ticket must begin by using the improved lane output from `86DETLANEHNG-001` rather than guessing.
2. Because the stall reproduces even on direct file execution, the eventual root cause may live in a determinism test body, a shared test helper, or a generic engine/runtime path exercised by those tests.
3. The most likely ownership surface is one of:
   - `packages/engine/test/determinism/*.test.ts`
   - shared helpers those tests rely on
   - a generic engine path those tests drive repeatedly
4. Any discovered bug must be fixed with TDD. If the root cause is in engine behavior, add or strengthen tests that pin the invariant rather than adapting expectations to the current broken behavior.
5. The fix must respect Foundations 5, 6, 9, 10, and 11: determinism stays strict, computation stays bounded, no compatibility shims, and the resulting design must be cleaner than the current stalled path.

## Architecture Check

1. The clean outcome is a determinism lane that terminates with meaningful proofs. That is strictly better than accepting a lane that can stall indefinitely.
2. This ticket must repair the narrowest true owner of the stall. If the issue is a test harness loop, fix the harness; if it is an engine/runtime bug, fix the engine/runtime bug. Do not smear the fix across unrelated areas.
3. No game-specific branching, seed exceptions, or skip-lists may be introduced. Determinism remains a generic kernel property, not a per-game special case.

## What to Change

### 1. Identify the concrete offender using the hardened lane output

- Run the improved determinism lane from `86DETLANEHNG-001`.
- Record which file times out or stalls.
- Reduce further inside that file only as needed to isolate the loop, property, helper, or runtime path responsible.

### 2. Repair the actual root cause

- If the issue is a test bug:
  - make the test bounded and architecturally correct
  - preserve the determinism assertion the test was intended to prove
- If the issue is a runtime or helper bug:
  - fix the runtime/helper implementation
  - keep the fix generic and deterministic
- If the issue reveals an unbounded property campaign or runaway replay loop:
  - bound it explicitly and document the bound in code/comments/tests where justified

### 3. Add or strengthen regression coverage

- Add a focused regression test for the exact stall trigger.
- If a broader determinism invariant was previously under-specified, strengthen the relevant determinism test to prove the repaired behavior.
- Never resolve the issue by deleting the coverage unless the assertion is relocated to a stronger, more precise test.

### 4. Re-verify the determinism lane end-to-end

- Confirm the dedicated lane completes successfully after the fix.
- Confirm the repaired test still proves determinism rather than only proving termination.

## Files to Touch

- `packages/engine/test/determinism/*.test.ts` (modify as needed after reassessment)
- `packages/engine/test/helpers/*` (modify only if the identified owner is a shared helper)
- `packages/engine/src/kernel/**` (modify only if the identified owner is generic runtime/kernel behavior)
- `packages/engine/test/unit/**` or `packages/engine/test/integration/**` (add/modify focused regression coverage as needed)

## Out of Scope

- Rewriting the entire determinism lane architecture beyond what `86DETLANEHNG-001` already owns
- Any skip/only quarantine mechanism for determinism tests
- Game-specific exceptions, fixture downgrades, or weaker determinism definitions
- Unrelated performance tuning not required to remove the stall

## Acceptance Criteria

### Tests That Must Pass

1. The previously offending determinism file now completes and passes.
2. `pnpm -F @ludoforge/engine test:determinism` completes successfully end-to-end.
3. Existing suite: `pnpm turbo test`

### Invariants

1. Determinism coverage is preserved or strengthened, never weakened.
2. The repaired code path is bounded and does not rely on manual interruption.
3. No backwards-compatibility aliases, fallback code paths, or game-specific carve-outs are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/determinism/<identified offender>.test.ts` — narrows and proves the exact determinism/stall invariant after the fix
2. `packages/engine/test/unit/` or `packages/engine/test/integration/` regression coverage — added only if the root cause belongs outside the determinism lane test file itself

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/determinism/<identified offender>.test.js`
3. `pnpm -F @ludoforge/engine test:determinism`
4. `pnpm turbo typecheck`
5. `pnpm turbo test`
6. `pnpm turbo lint`
