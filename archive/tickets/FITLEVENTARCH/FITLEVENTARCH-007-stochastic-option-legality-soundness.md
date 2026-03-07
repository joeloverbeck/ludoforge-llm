# FITLEVENTARCH-007: Stochastic Option Legality Soundness in legalChoicesEvaluate

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — legal option classification under stochastic pending in legality probing
**Deps**: archive/tickets/FITLEVENTARCH/FITLEVENTARCH-003-rollrandom-decision-discovery-soundness.md

## Problem

`legalChoicesEvaluate` can currently classify a choice option as `legal` when probe execution returns `pendingStochastic`. This is unsound: unresolved stochastic alternatives should never be upgraded to deterministic legality.

## Assumption Reassessment (2026-03-07)

1. `packages/engine/src/kernel/legal-choices.ts` computes option legality in both `mapOptionsForPendingChoice` (chooseOne) and `mapChooseNOptions` (chooseN) by probing candidate moves, but only runs recursive satisfiability classification when `probed.kind === 'pending'`.
2. In both chooseOne and chooseN mapping paths, `probed.kind === 'pendingStochastic'` currently bypasses illegal/unknown branches and is promoted to `legal` by default.
3. Existing tests cover `pendingStochastic` in decision-sequence and effects layers, and cover `rollRandom` discovery in legal-choices, but there is still no direct `legalChoicesEvaluate` regression asserting option legality classification under stochastic probe outcomes.

## Architecture Check

1. Option-legality computation must be conservative and monotonic under uncertainty; classifying unresolved stochastic probes as legal breaks that invariant.
2. Fix is kernel-generic and game-agnostic; no game-specific logic should be introduced.
3. No backwards-compatibility shims: one canonical rule for stochastic uncertainty (`unknown` unless proven legal).
4. Prefer an explicit legality-classification rule (single source of truth for probe outcome -> option legality) to avoid divergent chooseOne/chooseN behavior and future regressions.

## What to Change

### 1. Fix chooseOne option classification for stochastic probe outcomes

In `mapOptionsForPendingChoice`, treat `probed.kind === 'pendingStochastic'` as uncertain (`unknown`) and do not mark option as `legal`.

### 2. Fix chooseN combination classification for stochastic probe outcomes

In `mapChooseNOptions`, treat `probed.kind === 'pendingStochastic'` as uncertain (`unknown`) and propagate uncertainty for all options participating in those selections.

### 3. Consolidate legality classification logic for probe outcomes

Add or extract a small helper in `legal-choices.ts` that encodes conservative legality mapping for probed outcomes (including stochastic uncertainty) so chooseOne and chooseN share the same classification rule.

### 4. Add direct regressions for legality probing

Add tests that construct rollRandom-divergent decision requirements and assert `legalChoicesEvaluate` marks option legality as `unknown` (not `legal`) under unresolved stochastic alternatives.

## Files to Touch

- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify)

## Out of Scope

- Decision-sequence API shape redesign
- Legal move enumeration policy changes
- Agent move-selection behavior

## Acceptance Criteria

### Tests That Must Pass

1. `legalChoicesEvaluate` never marks options `legal` solely from a `pendingStochastic` probe result.
2. chooseOne and chooseN option-legality mapping both classify unresolved stochastic outcomes as `unknown`.
3. chooseOne and chooseN mappings use a shared conservative probe-classification rule.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Option legality remains conservative under uncertainty.
2. Kernel legality probing remains game-agnostic and deterministic for identical inputs.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — chooseOne stochastic probe path returns `unknown` legality.
2. `packages/engine/test/unit/kernel/legal-choices.test.ts` — chooseN stochastic probe path returns `unknown` legality for impacted options.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`

## Outcome

- Completion date: 2026-03-07
- What actually changed:
  - Added shared conservative probe-outcome legality classification in `packages/engine/src/kernel/legal-choices.ts` and applied it to both chooseOne and chooseN option mapping.
  - Explicitly classified `pendingStochastic` probe outcomes as `unknown` (never implicitly `legal`).
  - Added direct `legalChoicesEvaluate` regressions for chooseOne and chooseN stochastic probe paths in `packages/engine/test/unit/kernel/legal-choices.test.ts`.
- Deviations from original plan:
  - The new regressions initially used a stochastic branch shape that merged to deterministic `pending`; tests were refined to use roll-dependent decision IDs so probe outcomes are truly `pendingStochastic`.
  - Scope remained otherwise aligned with plan.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck` passed.
