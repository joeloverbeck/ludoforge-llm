# 110DYNZONINADJ-002: Update cookbook with dynamic adjacentTokenAgg example

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — documentation only
**Deps**: `archive/tickets/110DYNZONINADJ-001.md`

## Problem

The agent DSL cookbook (`docs/agent-dsl-cookbook.md`) documents `adjacentTokenAgg` with a static `anchorZone` string. After ticket 001 enables expression-based `anchorZone`, the cookbook should show the dynamic pattern to help LLMs evolving agents use this capability.

## Assumption Reassessment (2026-04-05)

1. Cookbook's `adjacentTokenAgg` section is at the "Adjacent Zone Token Counts" heading — confirmed (added this session).
2. Current example uses `anchorZone: saigon:none` (hardcoded string).
3. The cookbook also documents that `zoneProp.zone` and `zoneTokenAgg.zone` accept expressions — the `adjacentTokenAgg` section should match this pattern.

## Architecture Check

1. Documentation change only — no engine code modified.
2. The example must use correct syntax validated by ticket 001's implementation.
3. No game-specific content — the example uses generic zone/token references (Foundation 1).

## What to Change

### 1. Add dynamic anchorZone example to cookbook

In the "Adjacent Zone Token Counts with `adjacentTokenAgg`" section, add a second example showing the dynamic pattern:

```yaml
candidateFeatures:
  # Count enemy troops near the candidate's target zone (dynamic per candidate)
  enemyTroopsNearTarget:
    type: number
    expr:
      adjacentTokenAgg:
        anchorZone: { ref: candidate.param.targetSpace }
        aggOp: count
        tokenFilter:
          props:
            faction: { eq: US }
            type: { eq: troops }
```

### 2. Add to Common Patterns section

Add a "Evaluate threat near target zone" common pattern:

```yaml
### "Evaluate threat near target zone"
candidateFeature:
  type: number
  expr:
    adjacentTokenAgg:
      anchorZone: { ref: candidate.param.targetSpace }
      aggOp: count
      tokenFilter:
        props:
          faction: { eq: US }
```

## Files to Touch

- `docs/agent-dsl-cookbook.md` (modify) — add dynamic adjacentTokenAgg examples

## Out of Scope

- Engine changes (ticket 001)
- Other cookbook sections

## Acceptance Criteria

### Tests That Must Pass

1. No tests — documentation only
2. YAML examples in cookbook use correct syntax (validated by ticket 001's tests)

### Invariants

1. Existing cookbook content preserved — only additions
2. No game-specific strategies (Foundation 1) — examples use generic faction/type references

## Test Plan

### New/Modified Tests

None — documentation ticket.

### Commands

None.
