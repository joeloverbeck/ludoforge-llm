# FITLEVENTARCH-007: Stochastic Option Legality Soundness in legalChoicesEvaluate

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — legal option classification under stochastic pending in legality probing
**Deps**: archive/tickets/FITLEVENTARCH/FITLEVENTARCH-003-rollrandom-decision-discovery-soundness.md

## Problem

`legalChoicesEvaluate` can currently classify a choice option as `legal` when probe execution returns `pendingStochastic`. This is unsound: unresolved stochastic alternatives should never be upgraded to deterministic legality.

## Assumption Reassessment (2026-03-07)

1. `packages/engine/src/kernel/legal-choices.ts` computes option legality by probing candidate moves and only recursively classifies when `probed.kind === 'pending'`.
2. For `probed.kind === 'pendingStochastic'`, current control flow falls through to the `legal` default branch.
3. Existing tests add `pendingStochastic` coverage in decision-sequence and effect layers, but no direct `legalChoicesEvaluate` regression currently guards this classification path.

## Architecture Check

1. Option-legality computation must be conservative and monotonic under uncertainty; classifying unresolved stochastic probes as legal breaks that invariant.
2. Fix is kernel-generic and game-agnostic; no game-specific logic should be introduced.
3. No backwards-compatibility shims: one canonical rule for stochastic uncertainty (`unknown` unless proven legal).

## What to Change

### 1. Fix chooseOne option classification for stochastic probe outcomes

In `mapOptionsForPendingChoice`, treat `probed.kind === 'pendingStochastic'` as uncertain (`unknown`) and do not mark option as `legal`.

### 2. Fix chooseN combination classification for stochastic probe outcomes

In `mapChooseNOptions`, treat `probed.kind === 'pendingStochastic'` as uncertain (`unknown`) and propagate uncertainty for all options participating in those selections.

### 3. Add direct regressions for legality probing

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
3. Existing suite: `pnpm -F @ludoforge/engine test`.

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
