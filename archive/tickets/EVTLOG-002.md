# EVTLOG-002: Add test coverage for nested-macro and edge-case bind names

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

`summarizeLifecycleBinding` in `translate-effect-trace.ts` uses a heuristic to parse hygienic macro binding names. Existing tests cover readable output for simple bindings and single-level hygienic macro samples, but still miss key production-shaped variants:

1. **Nested macro bindings** — real Texas Hold'em data produces deeply nested names like `$__macro_collect_forced_bets_turnStructure_...__macro_post_forced_bets_and_set_preflop_actor__...__player`.
2. **Two-segment hygienic body** — bindings where `$__macro_...` is followed by exactly one `__` split for the stem.
3. **Explicit no-`$` plain binding in the macro-focused test** — plain identifiers are covered elsewhere, but not asserted in this heuristic-focused block.

Additionally, the JSDoc on `summarizeLifecycleBinding` is inaccurate. The real generator (`makeHygienicBindingName`) uses single `_` separators between sanitized `macroId`, `path`, and `stem`; `__` sequences are sanitizer artifacts, not formal segment delimiters.

## Assumption Reassessment (2026-02-20)

1. `packages/runner/test/model/translate-effect-trace.test.ts` already contains `summarizes hygienic macro binding names in forEach and reduce messages` with 4 assertions:
   - single-level macro `forEach`
   - single-level macro `reduce`
   - `$player`
   - `bestScore`
2. `packages/runner/src/bootstrap/texas-game-def.json` includes nested hygienic names with embedded `__macro_...` path fragments (for example at line 3008), and these are not covered by the existing test inputs.
3. `packages/runner/src/model/translate-effect-trace.ts` JSDoc still documents `$__macro_<macroId>_<path>__<stem>`, which does not match `packages/engine/src/cnl/expand-effect-macros.ts` `makeHygienicBindingName(...)`.
4. Current architecture remains acceptable for this ticket: presentation-only heuristic with no engine coupling; this ticket should not change runtime behavior.

## Architecture Check

1. Adding coverage in the existing runner model test keeps scope tight and avoids architecture churn.
2. The current heuristic parser is intentionally best-effort and resilient; that is appropriate for event-log display labels.
3. Longer-term ideal architecture is still structured trace metadata for display labels (already tracked by EVTLOG-004). This ticket should only harden tests + docs for the current heuristic.

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

### 3. Add two-segment hygienic-body case

Add a `forEach` bind with exactly 2 `__` segments in the `$__macro_` body:
```
$__macro_some_macro_turnStructure_phases_0__stem
```
Assert the message is `For-each Stem in Some Macro iterated N/N.`

### 4. Keep explicit plain-binding assertion in the same heuristic-focused test

Add one plain `forEach` bind name without `$` prefix:
```
target
```
Assert `For-each Target iterated N/N.`

### 5. Fix the JSDoc on `summarizeLifecycleBinding`

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
3. New test case: two-segment hygienic body produces `"Stem in Some Macro"`.
4. New test case: plain bind without `$` in the macro-focused test produces `"Target"`.
5. All existing `translate-effect-trace.test.ts` tests continue to pass.
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `summarizeLifecycleBinding` never throws for any string input (returns a formatted display string for any bind name shape).
2. Simple bindings (`$player`, `target`, `bestScore`) always format identically to `formatIdAsDisplayName` applied to the stripped name.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/translate-effect-trace.test.ts` — Extend `summarizes hygienic macro binding names in forEach and reduce messages` with:
   - nested forEach bind (production-shaped)
   - deep reduce bind (production-shaped)
   - two-segment hygienic body
   - plain no-`$` bind
   Rationale: validates display-label heuristic against real macro-name shapes and fallback edges.

### Commands

1. `pnpm -F @ludoforge/runner test -- test/model/translate-effect-trace.test.ts`
2. `pnpm -F @ludoforge/runner test && pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- **Completion date**: 2026-02-20
- **What changed**:
  - Updated ticket assumptions/scope to match current repository state (existing macro-summary test coverage was already partially present).
  - Extended `packages/runner/test/model/translate-effect-trace.test.ts` macro-summary test with:
    - a production-shaped nested macro `forEach` bind
    - a production-shaped deep-path `reduce` resultBind
    - a two-segment hygienic-body case
    - an explicit plain no-`$` bind case
  - Corrected stale JSDoc in `packages/runner/src/model/translate-effect-trace.ts` to match `makeHygienicBindingName` generation semantics.
- **Deviations from original plan**:
  - None in implementation intent; only the assumption section was corrected first because prior assumptions were stale.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test -- test/model/translate-effect-trace.test.ts` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
