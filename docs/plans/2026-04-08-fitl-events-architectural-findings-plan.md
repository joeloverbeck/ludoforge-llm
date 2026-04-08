# FITL Events Architectural Findings — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create Spec 119 (Event Side-Effect Manifest) and three investigation tickets (INVMOMDUPATH-001, INVDECRESCAL-001, INVGRANTSHAPDUP-001) from the architectural recovery report.

**Architecture:** Spec 119 defines a typed manifest consolidating event side-effects into a single value produced by `event-execution.ts` and consumed by `turn-flow-eligibility.ts`. Investigation tickets probe three single-signal fractures for a second signal before committing to implementation.

**Tech Stack:** TypeScript (engine kernel), node:test (engine tests), Markdown (specs/tickets)

---

### Task 1: Write investigation ticket INVMOMDUPATH-001

**Files:**
- Create: `tickets/INVMOMDUPATH-001.md`
- Reference: `tickets/_TEMPLATE.md`
- Reference: `reports/architectural-abstractions-2026-04-08-fitl-events.md` (Needs Investigation > Dual Momentum Enforcement Pathway)

**Step 1: Write the ticket**

Use the ticket template. Fill in:

```markdown
# INVMOMDUPATH-001: Investigate dual momentum enforcement pathway

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — investigation only
**Deps**: None

## Problem

The architectural recovery report (2026-04-08-fitl-events) identified that momentum in FITL may be enforced through two independent mechanisms:
1. Global variable guards (`mom_rollingThunder`, `mom_generalLansdale`, etc.) in action pipeline legality conditions, evaluated during move enumeration.
2. `activeLastingEffects[].actionRestrictions` checked by `isMoveAllowedByLastingEffectRestrictions()` in `legal-moves-turn-order.ts`.

The free-operation bypass (`move.freeOperation === true`) is implemented independently in both paths. If the same momentum card uses both mechanisms for the same blocking behavior, this is a split protocol requiring consolidation. If they handle disjoint concerns, the dual path is intentional.

Currently supported by a single evidence signal (test behavior). A second signal is needed to confirm or reject.

## Assumption Reassessment (2026-04-08)

1. Momentum cards exist with both gvar effects and lasting effects — confirmed by momentum-validation test (14 cards with `duration: 'round'` lasting effects)
2. Pipeline legality conditions reference `mom_*` gvar names — confirmed by `fitl-coin-operations.test.ts:922`
3. Whether any card's lasting effect carries `actionRestrictions` AND its pipelines carry matching gvar conditions — UNKNOWN, this is the investigation target

## Architecture Check

1. This is an investigation, not an implementation — no code changes
2. If confirmed, a follow-up Spec 120 would consolidate the enforcement pathway
3. No shims or compatibility concerns

## What to Change

### 1. Compile and inspect a momentum card

Compile the FITL production spec. For Rolling Thunder (card-41), inspect:
- The compiled lasting effect: does it have `actionRestrictions`? If so, which actions and with what constraints?
- The affected action pipelines (e.g., Air Strike): do their `legality` conditions reference `gvar.mom_rollingThunder`?
- If both exist: do they block the same action in the same way, or handle different aspects?

### 2. Check at least 3 momentum cards

Repeat for General Lansdale (card-30) and Claymores (card-17) to confirm the pattern is consistent or varies per card.

### 3. Write verdict

Document findings in a brief report section appended to this ticket:
- **Confirmed**: Both paths block the same action → write Spec 120
- **Rejected**: Paths handle disjoint concerns (e.g., gvar = "is action family allowed", actionRestriction = "cap numeric parameter") → close ticket

## Files to Touch

- No source files modified
- Read: `packages/engine/src/kernel/legal-moves-turn-order.ts` (lines 241-290)
- Read: Compiled GameDef for FITL (via `compileProductionSpec()`)

## Out of Scope

- Any code changes
- Writing Spec 120 (that's a follow-up if confirmed)

## Acceptance Criteria

### Tests That Must Pass

1. No tests — investigation only

### Invariants

1. No source files modified
2. Verdict is one of: confirmed (with evidence) or rejected (with explanation)

## Test Plan

### New/Modified Tests

1. None

### Commands

1. None — static analysis only
```

**Step 2: Commit**

```bash
git add tickets/INVMOMDUPATH-001.md
git commit -m "docs: add investigation ticket INVMOMDUPATH-001 — dual momentum enforcement pathway"
```

---

### Task 2: Write investigation ticket INVDECRESCAL-001

**Files:**
- Create: `tickets/INVDECRESCAL-001.md`
- Reference: `tickets/_TEMPLATE.md`
- Reference: `reports/architectural-abstractions-2026-04-08-fitl-events.md` (Needs Investigation > Decision Resolution Caller Complexity)

**Step 1: Write the ticket**

```markdown
# INVDECRESCAL-001: Investigate decision resolution caller complexity

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — investigation only
**Deps**: None

## Problem

The test helper `decision-param-helpers.ts` (136 lines) wraps the kernel's `completeMoveDecisionSequence` with substantial logic: compound SA move decomposition, stochastic binding stripping, consumed-key tracking. Every FITL event card test imports it. This suggests the kernel's decision API may lack a higher-level "resolve and apply move with full decision completion" function.

Currently supported by a single evidence signal (test helper complexity). Need to check whether non-test consumers face the same orchestration burden.

## Assumption Reassessment (2026-04-08)

1. `decision-param-helpers.ts` is ~136 lines of orchestration — confirmed
2. 100% of FITL event execution tests import `applyMoveWithResolvedDecisionIds` — confirmed
3. Whether sim/agents implement similar wrapper logic — UNKNOWN, this is the investigation target

## Architecture Check

1. This is an investigation, not an implementation — no code changes
2. If non-test consumers need similar orchestration, a follow-up spec for a kernel-level API is warranted
3. If only tests need it, the helper is appropriate test infrastructure — no action needed

## What to Change

### 1. Check simulator usage

Grep for `completeMoveDecisionSequence`, `resolveMoveDecisionSequence`, and `applyMove` usage in `packages/engine/src/sim/`. Does the simulator implement compound-SA decomposition or stochastic stripping?

### 2. Check agent usage

Grep the same symbols in `packages/engine/src/agents/`. Do agents need to handle compound moves or do they produce fully-resolved moves?

### 3. Check runner usage

Grep in `packages/runner/src/`. Does the web runner face similar orchestration needs?

### 4. Write verdict

- **Confirmed**: Non-test consumers implement similar wrapper logic → write follow-up spec
- **Rejected**: Only tests need compound-SA decomposition → close, helper is appropriate

## Files to Touch

- No source files modified
- Read: `packages/engine/src/sim/simulator.ts`
- Read: `packages/engine/src/agents/policy-agent.ts`
- Read: `packages/runner/src/worker/` (if relevant)

## Out of Scope

- Any code changes
- Writing a follow-up spec (that's a follow-up if confirmed)

## Acceptance Criteria

### Tests That Must Pass

1. No tests — investigation only

### Invariants

1. No source files modified
2. Verdict is one of: confirmed (with evidence) or rejected (with explanation)

## Test Plan

### New/Modified Tests

1. None

### Commands

1. None — static analysis only
```

**Step 2: Commit**

```bash
git add tickets/INVDECRESCAL-001.md
git commit -m "docs: add investigation ticket INVDECRESCAL-001 — decision resolution caller complexity"
```

---

### Task 3: Write investigation ticket INVGRANTSHAPDUP-001

**Files:**
- Create: `tickets/INVGRANTSHAPDUP-001.md`
- Reference: `tickets/_TEMPLATE.md`
- Reference: `reports/architectural-abstractions-2026-04-08-fitl-events.md` (Needs Investigation > toPendingFreeOperationGrant Construction Triplication)

**Step 1: Write the ticket**

```markdown
# INVGRANTSHAPDUP-001: Investigate toPendingFreeOperationGrant triplication

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — investigation only (consolidation ticket as follow-up if confirmed)
**Deps**: None

## Problem

The function `toPendingFreeOperationGrant` — converting a grant contract to a pending grant object — appears duplicated in three locations:
1. `packages/engine/src/kernel/turn-flow-eligibility.ts`
2. `packages/engine/src/kernel/free-operation-viability.ts`
3. Inline construction in `packages/engine/src/kernel/effects-turn-flow.ts`

If all three produce the same field set, this is a DRY violation. The natural consolidation target is `grant-lifecycle.ts`.

## Assumption Reassessment (2026-04-08)

1. `toPendingFreeOperationGrant` exists in turn-flow-eligibility.ts — needs verification of exact location and signature
2. `toPendingFreeOperationGrant` exists in free-operation-viability.ts — needs verification
3. Inline construction in effects-turn-flow.ts — needs verification of field-set equivalence

## Architecture Check

1. This is an investigation, not an implementation — no code changes
2. If confirmed identical, a single consolidation ticket moves the factory to `grant-lifecycle.ts`
3. If the three sites intentionally produce different field subsets, the duplication is acceptable

## What to Change

### 1. Read and compare all three sites

Read `toPendingFreeOperationGrant` in `turn-flow-eligibility.ts` and `free-operation-viability.ts`. Read the inline construction in `effects-turn-flow.ts` (around line 324-345). Diff the field sets.

### 2. Check for intentional differences

Are any fields conditionally omitted in one site but not others? Does one site produce a subset for probing purposes?

### 3. Write verdict

- **Confirmed identical**: Write a follow-up consolidation ticket (move to `grant-lifecycle.ts`, update 3 import sites)
- **Rejected**: Document which fields differ and why the duplication is intentional

## Files to Touch

- No source files modified
- Read: `packages/engine/src/kernel/turn-flow-eligibility.ts`
- Read: `packages/engine/src/kernel/free-operation-viability.ts`
- Read: `packages/engine/src/kernel/effects-turn-flow.ts`
- Read: `packages/engine/src/kernel/grant-lifecycle.ts` (natural consolidation target)

## Out of Scope

- Implementing the consolidation (that's a follow-up ticket)
- The broader grant array authority split (covered by prior archived report)

## Acceptance Criteria

### Tests That Must Pass

1. No tests — investigation only

### Invariants

1. No source files modified
2. Verdict includes a field-by-field comparison of the three sites

## Test Plan

### New/Modified Tests

1. None

### Commands

1. None — static analysis only
```

**Step 2: Commit**

```bash
git add tickets/INVGRANTSHAPDUP-001.md
git commit -m "docs: add investigation ticket INVGRANTSHAPDUP-001 — grant shape construction triplication"
```

---

### Task 4: Write Spec 119 — Event Side-Effect Manifest

**Files:**
- Create: `specs/119-event-side-effect-manifest.md`
- Reference: `reports/architectural-abstractions-2026-04-08-fitl-events.md` (Candidate Abstractions > Event Side-Effect Manifest)
- Reference: `docs/FOUNDATIONS.md`
- Reference: `packages/engine/src/kernel/event-execution.ts`
- Reference: `packages/engine/src/kernel/turn-flow-eligibility.ts`
- Reference: `packages/engine/src/kernel/apply-move.ts`

**Step 1: Read the source files to verify assumptions**

Before writing the spec, read the three key source files to confirm:
- `event-execution.ts`: `resolveEventFreeOperationGrants()`, `resolveEventEligibilityOverrides()`, `executeEventMove()` signatures and return types
- `turn-flow-eligibility.ts`: Where it currently re-derives grants/overrides from the move
- `apply-move.ts`: Where it threads `deferredEventEffect` between the two modules

**Step 2: Write the spec**

The spec must cover:

1. **Overview**: Single-computation-point protocol for event side-effects
2. **Problem statement**: Current re-derivation pattern with evidence from the architectural report
3. **Proposed type**: `EventSideEffectManifest` with fields for grants, overrides, lasting effects, deferred payloads
4. **Production point**: `event-execution.ts` produces the manifest
5. **Consumption point**: `turn-flow-eligibility.ts` receives the manifest instead of re-resolving
6. **Threading**: `apply-move.ts` passes the manifest between the two modules
7. **Migration**: Which existing functions are replaced or simplified
8. **FOUNDATIONS alignment**: F5, F8, F11, F14, F15
9. **Counter-evidence**: What would falsify this approach (conditional coupling between event execution and turn-flow integration)
10. **Test strategy**: Existing event card tests should continue passing with no behavioral change

Use `/reassess-spec` after writing to validate assumptions against the codebase.

**Step 3: Commit**

```bash
git add specs/119-event-side-effect-manifest.md
git commit -m "docs: add Spec 119 — Event Side-Effect Manifest"
```

---

### Task 5: Decompose Spec 119 into tickets

**After Spec 119 is written and reassessed**, run `/spec-to-tickets` to decompose it into implementation tickets. Expected 3-5 tickets.

This task is deferred until Tasks 1-4 are complete.

---

## Dependency Summary

```
Task 1 (INVMOMDUPATH-001)    — independent
Task 2 (INVDECRESCAL-001)    — independent
Task 3 (INVGRANTSHAPDUP-001) — independent
Task 4 (Spec 119)            — independent (reads source files, no deps on Tasks 1-3)
Task 5 (Spec 119 decomp)     — blocked by Task 4
```

Tasks 1-4 can all execute in parallel.
