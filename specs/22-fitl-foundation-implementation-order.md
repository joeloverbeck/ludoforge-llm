# Spec 22: Fire in the Lake Foundation Implementation Order

**Status**: Draft
**Priority**: P0 (execution control)
**Complexity**: S
**Dependencies**: Spec 15, Spec 16, Spec 17, Spec 18, Spec 19, Spec 20, Spec 21
**Estimated effort**: 0.5-1 day
**Source sections**: FITL foundation spec set (15-21)

## Overview

Define the required order for implementing FITL foundation specs, with dependency gates, milestones, and verification checkpoints.

## Ordered Sequence

1. Spec 15 - Foundation Scope and Engine Gaps
2. Spec 16 - Map, Scenario, and State Model
3. Spec 17 - Turn Sequence, Eligibility, and Card Flow
4. Spec 18 - Operations and Special Activities
5. Spec 19 - Coup Round and Victory
6. Spec 20 - Event Framework and Initial Card Pack
7. Spec 21 - Integration Tests and Traces

## Why This Order

- Spec 15 prevents accidental hacks by forcing explicit gap decisions.
- Spec 16 establishes the canonical state shape all later mechanics mutate.
- Spec 17 defines legal execution windows that operations/events depend on.
- Spec 18 provides the largest mechanics surface and should stabilize before coup/event layers.
- Spec 19 depends on operation effects to compute correct coup transitions and scoring.
- Spec 20 depends on stable core mechanics because events invoke them directly.
- Spec 21 must be last to lock deterministic behavior against settled semantics.

## Milestones and Gates

### Milestone A: Foundations Ready
- Complete Specs 15-16.
- Gate: scenario can initialize and validate deterministically.

### Milestone B: Core Campaign Loop
- Complete Specs 17-19.
- Gate: play through event-card turns and coup rounds with correct victory checks.

### Milestone C: Event Slice + Quality Bar
- Complete Specs 20-21.
- Gate: cards 82/27 execute correctly; deterministic golden traces and full test suite pass.

## Verification Gates

After Milestone A:
- `npm run build`
- targeted FITL unit tests for state/setup

After Milestone B:
- `npm run test:unit`
- targeted integration tests for sequence + ops + coup

After Milestone C:
- `npm run test:integration`
- `npm test`

## Risk Controls

- Do not begin Spec 18 before Spec 17 acceptance tests pass.
- Do not begin Spec 20 before Spec 19 scoring/coup tests pass.
- Treat any nondeterministic trace mismatch as a release blocker.

