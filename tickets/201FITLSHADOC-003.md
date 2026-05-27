# 201FITLSHADOC-003: Strategic conditions

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None
**Deps**: `tickets/201FITLSHADOC-002.md`

## Problem

Spec 201 §4.3 introduces six new strategic conditions (`selfCanWinNow`, `currentLeaderNearWin`, `coupImminent`, `monsoonNow`, `resourcesLow`, `allyNearWin`) consumed by the shared.* modules in ticket 004. These conditions reference the state and candidate features from ticket 002.

Without these conditions, the shared.* modules in ticket 004 cannot evaluate their `when` clauses; the doctrine layer would have no gate predicates to bind against.

## Assumption Reassessment (2026-05-27)

1. `data/games/fire-in-the-lake/92-agents.md` declares a `strategicConditions` block (existing entries: `selfPoliticalEngineBehind` @ 240, `usNearWin` @ 261, `arvnNearWin` @ 273, `nvaNearWin` @ 285, `vcNearWin` @ 297). New conditions are additive at the bottom of the block.
2. The features referenced by the new conditions land in ticket 002 (predecessor), and prerequisite ticket `201FITLSHADOC-001B` lands the generic `preview.relationship.<role>.victoryMargin` ref. After 002 lands, `feature.projectedSelfMargin`, `feature.projectedCurrentLeaderMargin`, `feature.distanceToCoup`, `feature.monsoonNow`, `feature.selfResources`, and `preview.relationship.nominalAlly.victoryMargin` are all resolvable.
3. The existing per-faction `*NearWin` conditions are NOT removed by this ticket; they remain alongside the new `currentLeaderNearWin` (which provides the generic shared-doctrine entry point per Spec 201 §4.3).

## Architecture Check

1. Foundation #2: conditions are pure GameSpecDoc YAML primitives; evolution may mutate the thresholds (`-2` for leader-near-win, `-1` for ally-near-win, `< 2` for resources-low).
2. Foundation #15: shared conditions close the four-faction parity gap by providing a single named gate for each cross-cutting decision point (immediate win, leader denial, coup imminence, monsoon awareness, resource floor, ally rivalry). Per-faction conditions remain for faction-specific scoring nuance.
3. No engine changes; no schema additions.

## What to Change

### 1. Strategic conditions — add to `agents.library.strategicConditions`

Add the six entries from Spec 201 §4.3 verbatim, each including a `description` field matching Spec 201's text:

- `selfCanWinNow` — `target: { gte: [feature.projectedSelfMargin, 0] }`
- `currentLeaderNearWin` — `target: { gte: [feature.projectedCurrentLeaderMargin, -2] }`
- `coupImminent` — `target: { lte: [feature.distanceToCoup, 1] }`
- `monsoonNow` — `target: { eq: [feature.monsoonNow, true] }`
- `resourcesLow` — `target: { lt: [feature.selfResources, 2] }`
- `allyNearWin` — `target: { gte: [preview.relationship.nominalAlly.victoryMargin, -1] }`

The old per-faction direct-margin fallback is intentionally not used after the 2026-05-27 reassessment; `201FITLSHADOC-001B` owns the generic relationship preview ref instead.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify — additive entries to `strategicConditions` block)

## Out of Scope

- Shared strategy modules (owned by 004).
- Removal of existing `usNearWin` / `arvnNearWin` / `nvaNearWin` / `vcNearWin` (those remain — they provide per-seat near-win signals that `currentLeaderNearWin` does not subsume; see Spec 201 §1.3).

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo build` — conditions compile without diagnostic.
2. Standalone witness: a curated scenario with `feature.projectedSelfMargin >= 0` evaluates `condition.selfCanWinNow.satisfied = true`.
3. `pnpm turbo schema:artifacts` regenerates cleanly.

### Invariants

1. All six conditions defined with explicit `target` predicates and human-readable descriptions.
2. No engine code modified.
3. Existing per-faction near-win conditions remain unchanged (no scope creep into the per-seat surface).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/spec-201-strategic-conditions-evaluation.test.ts` — one assertion per new condition: curated state evaluates the expected `satisfied` boolean. File-top class marker: `// @test-class: architectural-invariant`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/policy-profile-quality/spec-201-strategic-conditions-evaluation.test.js`
3. `pnpm turbo lint typecheck test`
