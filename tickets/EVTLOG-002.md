# EVTLOG-002: Add test coverage for nested-macro and edge-case bind names

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

`summarizeLifecycleBinding` in `translate-effect-trace.ts` uses a heuristic to parse hygienic macro binding names. The current test covers single-level macro bindings and simple `$variable` bindings, but does not cover:

1. **Nested macro bindings** — real Texas Hold'em data produces deeply nested names like `$__macro_collect_forced_bets_turnStructure_...__macro_post_forced_bets_and_set_preflop_actor__...__player`. These are the most common production pattern.
2. **The `$__macro_` prefix with only a single `__`-separated segment** — e.g., `$__macro_some_macro_turnStructure_phases_0__stem` where the body splits into exactly 2 segments.
3. **Bind names without `$` prefix and without macro prefix** — plain identifiers like `target` (already covered but should be explicit about the no-`$` case).

Additionally, the JSDoc on `summarizeLifecycleBinding` incorrectly states the pattern uses `__` as the stem separator. The actual format (from `makeHygienicBindingName`) joins all three parts with single `_`. The `__` sequences are artifacts of path sanitization, not intentional delimiters.

## Assumption Reassessment (2026-02-20)

1. `translate-effect-trace.test.ts` has one test (`summarizes hygienic macro binding names...`) covering 4 cases: single-level macro forEach, single-level macro reduce, simple `$player`, simple `bestScore`.
2. Real production bind names from `texas-game-def.json` include deeply nested patterns with `__macro_` appearing in the middle of the path (e.g., line 3008).
3. The heuristic produces correct output for nested macros (verified: "Player in Collect Forced Bets") but this is not test-covered.

## Architecture Check

1. Adding tests to an existing test file is the simplest approach — no new files, no structural changes.
2. No game-specific logic in agnostic layers — these tests exercise the runner's presentation-layer formatting.
3. No backwards-compatibility concerns — purely additive test cases.

## What to Change

### 1. Add nested-macro test case to `translate-effect-trace.test.ts`

Add a `forEach` entry with a real nested-macro bind name from production:
```
$__macro_collect_forced_bets_turnStructure_phases_0__onEnter_15__macro_post_forced_bets_and_set_preflop_actor__0__if_then_0__forEach_effects_0__let_in_0__player
```
Assert the message is `For-each Player in Collect Forced Bets iterated N/N.`

### 2. Add a reduce entry with a deep resultBind path

Use the real production pattern:
```
$__macro_hand_rank_score_turnStructure_phases_5__onEnter_1__forEach_effects_0__if_then_1__evaluateSubset_compute_0__straightHigh
```
Assert the message is `Reduce Straight High in Hand Rank Score iterated N/N.`

### 3. Fix the JSDoc on `summarizeLifecycleBinding`

The comment says:
> Hygienic names follow the pattern `$__macro_<macroId>_<path>__<stem>`.

Correct to:
> Hygienic names follow the pattern `$__macro_${sanitize(macroId)}_${sanitize(path)}_${sanitize(stem)}`. The `__` sequences in the result are artifacts of path sanitization (e.g., `].` → `__`), not intentional delimiters. We split on `__` as a heuristic and take the last segment as the stem.

## Files to Touch

- `packages/runner/test/model/translate-effect-trace.test.ts` (modify)
- `packages/runner/src/model/translate-effect-trace.ts` (modify — JSDoc only)

## Out of Scope

- Changing the `summarizeLifecycleBinding` algorithm
- Changing engine hygienic name generation
- Adding structured metadata to trace entries (see EVTLOG-004)

## Acceptance Criteria

### Tests That Must Pass

1. New test case: nested-macro forEach bind name produces `"Player in Collect Forced Bets"`.
2. New test case: deep-path reduce resultBind produces `"Straight High in Hand Rank Score"`.
3. All existing `translate-effect-trace.test.ts` tests continue to pass.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `summarizeLifecycleBinding` never throws for any string input (returns a formatted display string for any bind name shape).
2. Simple bindings (`$player`, `target`, `bestScore`) always format identically to `formatIdAsDisplayName` applied to the stripped name.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/translate-effect-trace.test.ts` — Add 2 entries to the existing `summarizes hygienic macro binding names...` test (or add a new sibling test for nested macros). Rationale: validates the heuristic against actual production data patterns.

### Commands

1. `pnpm -F @ludoforge/runner test -- test/model/translate-effect-trace.test.ts`
2. `pnpm -F @ludoforge/runner test && pnpm -F @ludoforge/runner typecheck`
