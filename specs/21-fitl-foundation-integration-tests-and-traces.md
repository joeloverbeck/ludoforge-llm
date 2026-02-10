# Spec 21: Fire in the Lake Foundation Integration Tests and Traces

**Status**: Draft
**Priority**: P1 (required for foundation confidence)
**Complexity**: L
**Dependencies**: Spec 16, Spec 17, Spec 18, Spec 19, Spec 20
**Estimated effort**: 3-4 days
**Source sections**: all FITL foundation sections in brainstorming doc

## Overview

Define and implement the FITL foundation test harness: deterministic scenario tests, operation/event/coup integration tests, and golden trace contracts for reproducibility.

## In Scope

- Targeted unit tests for FITL-specific rule executors.
- Multi-step integration tests covering at least one full campaign slice (events + operations + coup).
- Golden `GameTrace` fixtures for deterministic replay.
- Test utilities for concise scenario setup overrides.

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

## Verification Commands

- `npm run build`
- `npm run test:unit`
- `npm run test:integration`
- `npm test`

