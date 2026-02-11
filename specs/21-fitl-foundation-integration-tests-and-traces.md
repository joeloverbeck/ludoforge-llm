# Spec 21: Fire in the Lake Foundation Integration Tests and Traces

**Status**: Draft
**Priority**: P1 (required for foundation confidence)
**Complexity**: L
**Dependencies**: Spec 15, Spec 15a, Spec 16, Spec 17, Spec 18, Spec 19, Spec 20
**Estimated effort**: 3-4 days
**Source sections**: all FITL foundation sections in brainstorming doc
**Spec 15 Artifacts**: `specs/15-fitl-foundation-scope-and-engine-gaps.md`, `specs/15a-fitl-foundation-gap-analysis-matrix.md`

## Overview

Define and implement the FITL foundation test harness: deterministic scenario tests, operation/event/coup integration tests, and golden trace contracts for reproducibility.

This spec is the end-to-end quality gate for the canonical execution path:
`GameSpecDoc` YAML -> compiler -> `GameDef` -> simulation.

## In Scope

- Targeted unit tests for generic data-driven primitives exercised by FITL scenarios.
- Integration tests that execute FITL only through `GameSpecDoc` YAML -> compiled `GameDef` -> simulation.
- Multi-step campaign-slice tests covering event card execution + operation/special activity + coup + victory recomputation.
- Golden `GameTrace` fixtures for deterministic replay and regression detection.
- Test utilities for concise, deterministic scenario setup overrides without hidden FITL-only runtime hooks.
- Architecture-audit tests aligned with Spec 15a Deliverable 5 (no hardcoded FITL logic in generic engine/compiler modules).
- Regression tests proving non-FITL game specs still compile/run unchanged after FITL capability additions.

## Out of Scope

- Performance/load benchmarking beyond standard repo performance tests.
- Full statistical game-balance evaluation for the complete deck.

## Test Deliverables

1. Compiler-path integration tests
- Parse/validate FITL `GameSpecDoc` YAML from test fixture text.
- Compile to `GameDef` and assert required structural invariants used by runtime.
- Prove tests do not rely on `data/fitl/...` filesystem files at runtime.

2. Campaign-slice simulation integration tests
- Deterministic setup to one or more card windows including cards 82 and 27 (both sides where applicable).
- Include operation legality checks, limited-op behavior, eligibility/ineligibility transitions, and coup phase sequence checks.
- Assert state deltas for support/opposition/control/tracks/resources/patronage/trail and victory metric recomputation.

3. Deterministic golden trace suite
- Store canonical traces for representative foundation flows.
- Enforce byte-identical replay for same seed + same move sequence.
- Include an explicit fixture update policy: trace updates require intentional review in PR diff.

4. Architecture and portability audits
- Assert no FITL-specific branch logic in generic runtime/compiler modules (`src/kernel/**`, `src/cnl/**`), per Spec 15a checklist.
- Assert FITL behavior is driven by declarative data payloads and generic primitives.
- Assert at least one non-FITL spec path remains green under the same engine build.

5. Negative and guardrail tests
- Invalid or incomplete FITL YAML should fail with deterministic diagnostics.
- Missing required declarative data in YAML should fail compile/simulation early and clearly.
- Any nondeterministic ordering site detected in non-choice paths is treated as test failure.

## Test Matrix (Minimum Coverage)

- Setup correctness tests.
- Eligibility and sequence transition tests.
- Operation legality and state delta tests.
- Special activity interaction tests.
- Event card tests (82, 27; both sides).
- Coup/victory scoring tests.
- Determinism tests: same seed + same move inputs => byte-identical trace.
- Compiler/runtime path tests proving YAML-only embedded data assets are sufficient.
- Regression tests for at least one non-FITL game definition.

## Acceptance Criteria

- `npm run build`, targeted FITL unit/integration suites, and `npm test` pass.
- At least one golden trace includes: event execution, op+special activity, coup phase updates, and victory-metric recomputation.
- Determinism gate passes: identical seed and move sequence produce byte-identical `GameTrace`.
- No flaky FITL tests across repeated runs.
- Integration coverage proves embedded FITL YAML data alone is sufficient for compile + simulation (no required runtime lookup from `data/fitl/...`).
- Architecture-audit checks in Spec 15a Deliverable 5 pass.
- At least one non-FITL regression integration test passes unchanged.

## Verification Commands

- `npm run build`
- `npm run test:unit`
- `npm run test:integration`
- `npm test`
- repeat deterministic integration target multiple times (example: 20x loop) and compare trace outputs
