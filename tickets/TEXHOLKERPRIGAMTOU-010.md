# TEXHOLKERPRIGAMTOU-010: Hand-State Consistency Contracts (Counter vs Per-Player Flags)

**Status**: TODO
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-009
**Blocks**: TEXHOLKERPRIGAMTOU-011, TEXHOLKERPRIGAMTOU-012

## Problem

Texas currently uses both aggregate counters (for example `playersInHand`) and per-player booleans (`handActive`, `eliminated`, `allIn`) as state authorities. This allows drift between values under edge flows.

## 1) What should be added/changed

1. Add runtime consistency contracts so hand-level counters are derived from per-player truth at decision boundaries.
2. Choose one source of truth for "players remaining in hand" in Texas spec logic:
- Option A (preferred): derive from per-player vars and stop mutating `playersInHand` directly.
- Option B: keep `playersInHand` but add explicit sync effects after every mutation point and at phase transitions.
3. Add a reusable helper pattern (macro or kernel-surface contract) that other games can apply to avoid aggregate-flag drift.
4. Update Texas YAML/macros to use the chosen pattern consistently.

## 2) Invariants that must pass

1. At every decision boundary: `playersInHand == count(handActive == true && eliminated == false)`.
2. No player with `eliminated == true` can be counted in `playersInHand`.
3. If `playersInHand <= 1`, exactly one eligible hand winner is selected for uncontested-pot resolution.
4. Chip conservation holds for all transitions: `sum(chipStack) + pot` constant per hand.

## 3) Tests that must pass

1. New unit/integration test: hand-state consistency invariant checks across many seeds and move policies.
2. New regression test for fold/all-in edge paths that previously desynced counters.
3. Existing Texas suites:
- `test/integration/texas-runtime-bootstrap.test.ts`
- `test/integration/texas-holdem-hand.test.ts`
- `test/unit/texas-holdem-spec-structure.test.ts`
4. Full repository gates:
- `npm run build`
- `npm run lint`
- `npm test`
