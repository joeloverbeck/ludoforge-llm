# 64DECVICMET-002: Add decomposed victory stateFeatures and conditional considerations to ARVN agent profiles

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — game data only
**Deps**: `archive/tickets/64DECVICMET-001.md`

## Problem

ARVN agent profiles see victory margin as a single composite number (`victory.currentMargin.self` = COIN-Controlled Population + Patronage - 50). The agent cannot distinguish "margin is low because Patronage is low" from "margin is low because COIN control is low." These require different remedies (Govern for Patronage, Train/Patrol for control), but the agent treats them identically because no stateFeatures reference the decomposed signals.

After 64DECVICMET-001 exposes derived metrics in the observer, agents can reference `ref: metric.auto:victory:controlledPopulation:coin` and `ref: var.global.patronage`. This ticket adds those references to ARVN agent profiles.

## Assumption Reassessment (2026-04-11)

1. `data/games/fire-in-the-lake/92-agents.md` exists and contains ARVN agent profiles (`arvn-baseline`, `arvn-evolved`) — confirmed via Explore agent this session.
2. The agent DSL supports `ref: metric.<id>` — confirmed at `packages/engine/src/agents/policy-surface.ts:196-204`.
3. The agent DSL supports `ref: var.global.<id>` — confirmed at `packages/engine/src/agents/policy-surface.ts:125-126` and documented in `docs/agent-dsl-cookbook.md:36`.
4. `patronage` is a global variable declared via content data assets (`data/games/fire-in-the-lake/40-content-data-assets.md:781`, scope: global) — confirmed via grep this session.
5. The auto-synthesized metric ID for ARVN's COIN-controlled population is `auto:victory:controlledPopulation:coin` — confirmed via grep of `packages/runner/src/bootstrap/fitl-game-def.json`.
6. Existing ARVN stateFeatures include `selfMargin` (`ref: victory.currentMargin.self`) and `selfResources` (`ref: var.player.self.resources`) — confirmed via Explore agent this session.
7. `ref: candidate.tag.govern` and `ref: candidate.tag.train` are valid candidate-scope references for FITL action tags — these follow the documented `candidate.tag.<tagName>` pattern in `docs/agent-dsl-cookbook.md`.

## Architecture Check

1. This is a pure game-data change — adding stateFeatures and considerations to FITL agent profiles in YAML. No engine code is touched.
2. All referenced paths (`metric.*`, `var.global.*`, `candidate.tag.*`, `feature.*`) are generic agent DSL constructs, not game-specific engine logic (Foundation 1).
3. The new stateFeatures and considerations are additive — existing profile behavior is preserved. No backwards-compatibility concerns.
4. The evolution pipeline can mutate these new features and considerations just like existing ones (Foundation 2).

## What to Change

### 1. Add decomposed stateFeatures to the FITL agent library

In `data/games/fire-in-the-lake/92-agents.md`, add two new stateFeatures to the shared library section (where `selfMargin`, `selfResources`, etc. are defined):

```yaml
    patronage:
      type: number
      expr: { ref: var.global.patronage }
    coinControlPop:
      type: number
      expr: { ref: metric.auto:victory:controlledPopulation:coin }
```

### 2. Add conditional considerations to ARVN profiles

Add considerations that differentiate strategy based on the decomposed components. These go in the ARVN-specific profile section (either `arvn-evolved` or a new ARVN consideration block):

```yaml
    governWhenPatronageLow:
      scopes: [move]
      when:
        lt: [{ ref: feature.patronage }, 20]
      weight: 8
      value:
        boolToNumber: { ref: candidate.tag.govern }
    trainWhenControlLow:
      scopes: [move]
      when:
        lt: [{ ref: feature.coinControlPop }, 25]
      weight: 5
      value:
        boolToNumber: { ref: candidate.tag.train }
```

The exact threshold values (20 for patronage, 25 for control) are starting points — the evolution pipeline can optimize them. The weight values (8 and 5) reflect that Patronage is more directly actionable than population control.

### 3. Verify agent profile compilation

After adding the features and considerations, recompile and run the agent test suite to confirm the profile compiles without diagnostics and the new stateFeatures resolve correctly.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (modify)

## Out of Scope

- Observer visibility changes (covered by 64DECVICMET-001)
- Adding derived metric definitions (auto-synthesis from victory standings is sufficient)
- Modifying US, NVA, or VC agent profiles (only ARVN is targeted)
- Engine or compiler changes
- Optimizing threshold values or weights (evolution pipeline handles this)

## Acceptance Criteria

### Tests That Must Pass

1. FITL compiles without diagnostics after adding the new stateFeatures and considerations.
2. The compiled agent profiles include `patronage` and `coinControlPop` stateFeatures with correct reference resolution.
3. The compiled ARVN profile includes `governWhenPatronageLow` and `trainWhenControlLow` considerations.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No engine source files are modified — this is a game-data-only change.
2. Existing ARVN stateFeatures (`selfMargin`, `selfResources`, etc.) and considerations are unchanged.
3. US, NVA, and VC agent profiles are unaffected.
4. The `ref: feature.patronage` and `ref: feature.coinControlPop` paths resolve to the stateFeatures declared in this ticket (not to other features with the same name).

## Test Plan

### New/Modified Tests

1. No new test files needed — the compilation integration test suite validates agent profile structure. A simulation smoke test (if available) confirms the agent can evaluate the new considerations without runtime errors.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
