# Spec 21: Fire in the Lake Foundation Integration Tests and Traces

**Status**: Draft
**Priority**: P1 (required for foundation confidence)
**Complexity**: L
**Dependencies**: Spec 16, Spec 17, Spec 18, Spec 19, Spec 20
**Estimated effort**: 3-4 days
**Source sections**: all FITL foundation sections in brainstorming doc
**Spec 15 Artifacts**: `specs/15-fitl-foundation-scope-and-engine-gaps.md`, `specs/15a-fitl-foundation-gap-analysis-matrix.md`

## Overview

Define and implement the FITL foundation test harness: deterministic scenario tests, operation/event/coup integration tests, and golden trace contracts for reproducibility.

## In Scope

- Targeted unit tests for generic data-driven primitives exercised by FITL scenarios.
- Multi-step integration tests covering at least one full campaign slice (events + operations + coup).
- Golden `GameTrace` fixtures for deterministic replay.
- Test utilities for concise scenario setup overrides.
- Tests that explicitly assert FITL executes through `GameSpecDoc` YAML -> `GameDef` -> simulation with no required `data/fitl/...` runtime lookup.
- Tests that show FITL behavior is expressed via reusable generic primitives plus FITL data payloads.

## Out of Scope

- Performance/load benchmarking beyond standard repo performance tests.
- Full statistical game-balance evaluation for the complete deck.

## Test Matrix

- Setup correctness tests.
- Eligibility and sequence transition tests.
- Operation legality and state delta tests.
- Special activity interaction tests.
- Event card tests (82, 27; both sides).
- Coup/victory scoring tests.
- Determinism tests: same seed + same move inputs => identical trace.

## Acceptance Criteria

- `npm test` passes with all new FITL tests.
- At least one golden trace includes: event execution, op+special activity, coup phase updates, and victory-metric recomputation.
- No flaky FITL tests across repeated runs.
- Integration coverage includes a fixture proving embedded FITL YAML data alone is sufficient for compile + simulation.

## Verification Commands

- `npm run build`
- `npm run test:unit`
- `npm run test:integration`
- `npm test`
