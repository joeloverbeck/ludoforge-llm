# MONGRNINV-002: Cookbook — Monsoon grant encoding guidance

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: No — docs only
**Deps**: MONGRNINV-001 (invariant test should exist before documenting the rule)

## Problem

The `docs/fitl-event-authoring-cookbook.md` has zero mentions of Monsoon. Any future event card encoding that grants a Monsoon-restricted operation (`sweep`, `march`, `airStrike`, `airLift`) will hit the same silent failure: the grant works outside Monsoon but is blocked during Monsoon because `allowDuringMonsoon: true` is missing.

This was the root cause of 4 CI failures. The fix was a one-line YAML addition per grant, but diagnosing it required tracing through 5 layers of the `legalMoves` pipeline because the failure mode is silent (moves generated then post-filtered, no warning).

## Foundation Alignment

- **Foundation 10 (Architectural Completeness)**: "Solutions address root causes, not symptoms. If a problem reveals a design gap, the design is fixed." The cookbook is the canonical authoring reference — its silence on Monsoon is a documentation gap that will cause repeat errors.
- **Foundation 2 (Evolution-First)**: Evolution mutates YAML. If an LLM evolves an event card that grants a Monsoon-restricted operation, it needs to know about `allowDuringMonsoon` from the documentation, not from runtime failure.

## What to Change

### 1. New section in `docs/fitl-event-authoring-cookbook.md`

Add a new `## Monsoon-Restricted Free-Operation Grants` section. Place it after the existing `## Ordered Free-Op Event Testing` section (line ~530) since both concern free-operation grants.

Content should cover:

**Which actions are Monsoon-restricted**: Reference the GameDef's `turnOrder.config.turnFlow.monsoon.restrictedActions` — currently `sweep`, `march`, `airStrike` (limited to 2 spaces), `airLift` (limited to 2 spaces).

**The rule**: Per FITL rule 5.1.1, Events override Monsoon restrictions. When an event card grants a free operation for a Monsoon-restricted action via `freeOperationGrants`, the grant MUST include `allowDuringMonsoon: true`.

**What happens without it**: During Monsoon, `applyTurnFlowWindowFilters` removes the move. `legalMoves` returns 0 for the grant. `expireUnfulfillableRequiredFreeOperationGrants` expires the grant. The event's grant chain breaks silently.

**Canonical example**: Card-62 (Cambodian Civil War) grants US free Air Lift + Sweep into Cambodia. Both Air Lift grants and both Sweep grants have `allowDuringMonsoon: true`. Without the flag on Air Lift, the entire grant chain fails during Monsoon because Air Lift is sequence step 0 and its expiry cascades.

**Compile-time guard**: The `fitl-events-monsoon-grant-invariant.test.ts` test (MONGRNINV-001) catches violations at compilation time.

### 2. Add to Practical Checklist

Append a checklist item to the existing `## Practical Checklist` section (line ~589):

```
- [ ] Every `freeOperationGrant` whose `actionIds` includes a Monsoon-restricted action has `allowDuringMonsoon: true`
```

## Files to Touch

- `docs/fitl-event-authoring-cookbook.md` (modify — add section + checklist item)

## Out of Scope

- Engine code changes
- Test changes (covered by MONGRNINV-001)
- Non-FITL documentation

## Verification

- The new section is findable via `grep -i monsoon docs/fitl-event-authoring-cookbook.md`
- The checklist item appears in the Practical Checklist section
- Content references the invariant test from MONGRNINV-001
