# Spec 22: Fire in the Lake Foundation Implementation Order

**Status**: Draft
**Priority**: P0 (execution control)
**Complexity**: S
**Dependencies**: Spec 15, Spec 15a, Spec 16, Spec 17, Spec 18, Spec 19, Spec 20, Spec 21
**Estimated effort**: 0.5-1 day
**Source sections**: FITL foundation spec set (15-21)

## Overview

Define the required order for implementing FITL foundation specs, with dependency gates, milestones, and verification checkpoints.

This order is intentionally architecture-first: close generic engine capability gaps first, then encode FITL behavior in data/specs.

Canonical delivery target for every phase: FITL runs only through `GameSpecDoc` YAML -> `GameDef` -> simulation, while new engine/compiler code remains reusable for non-FITL titles.

## Ordered Sequence

1. Spec 15 - Foundation Scope and Engine Gaps
2. Spec 16 - Map, Scenario, and State Model
3. Spec 17 - Turn Sequence, Eligibility, and Card Flow
4. Spec 18 - Operations and Special Activities
5. Spec 19 - Coup Round and Victory
6. Spec 20 - Event Framework and Initial Card Pack
7. Spec 21 - Integration Tests and Traces

## Why This Order

- Spec 15 prevents accidental hacks by forcing explicit capability-gap decisions and architecture constraints.
- Spec 16 establishes canonical state/data structures used by all later mechanics.
- Spec 17 defines legal execution windows and deterministic sequencing used by operations/events.
- Spec 18 introduces the largest mechanics surface and should stabilize before coup/event layers.
- Spec 19 depends on operation effects to compute correct coup transitions and scoring.
- Spec 20 depends on stable generic event/operation semantics because cards invoke those semantics.
- Spec 21 locks deterministic behavior and architecture quality after semantics are settled.

## Milestones and Gates

### Gate 0: Architecture Contract Locked
- Spec 15 accepted, including P0 gap ownership and "no hardcoded FITL logic" checks.
- Gate: all planned runtime/compiler changes are framed as generic capabilities, not FITL-specific handlers.
- Gate: FITL executable data source is YAML-embedded `GameSpecDoc` data (no required filesystem asset dependency for evolved specs).

### Milestone A: Foundations Ready
- Complete Specs 16-17.
- Gate: scenario initializes deterministically, turn flow and eligibility transitions are deterministic and trace-visible.

### Milestone B: Core Campaign Loop
- Complete Specs 18-19.
- Gate: play through event-card turns and coup rounds with correct legality, accounting, and victory checks.

### Milestone C: Event Slice + Quality Bar
- Complete Specs 20-21.
- Gate: cards 82/27 execute correctly via generic event primitives; deterministic golden traces and test suite pass.

## Verification Gates

After Gate 0:
- `npm run build`
- targeted unit tests for schema/compiler additions tied to Spec 15 gaps
- targeted tests proving embedded YAML data assets compile without requiring `data/fitl/...` files

After Milestone A:
- `npm run test:unit`
- targeted FITL setup/sequence tests

After Milestone B:
- `npm run test:unit`
- targeted integration tests for sequence + ops + coup

After Milestone C:
- `npm run test:integration`
- `npm test`

## Risk Controls

- Do not begin Spec 16 implementation until Spec 15 P0 gap ownership is explicit.
- Do not ship Spec 16 compiler/runtime wiring that depends on filesystem-only FITL asset files.
- Do not accept any FITL milestone that adds FITL-specific branching where a generic primitive plus YAML data could express the same behavior.
- Do not begin Spec 18 before Spec 17 acceptance tests pass.
- Do not begin Spec 20 before Spec 19 scoring/coup tests pass.
- Treat any nondeterministic trace mismatch as a release blocker.
- Treat any newly introduced FITL-specific branch in generic engine code as a release blocker.
