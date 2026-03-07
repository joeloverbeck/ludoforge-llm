# LEGACTTOO-035: Limit Usage Annotation Invariant Enforcement

**Status**: DONE
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel condition annotator invariant enforcement + tests
**Deps**: tickets/LEGACTTOO-032-limit-identity-contract-centralization-and-validation.md, tickets/LEGACTTOO-034-display-source-reference-contract-generalization.md

## Problem

`annotateLimitsGroup` now resolves usage annotations by line source identity, but missing or mismatched source references silently degrade behavior (no usage annotation) instead of explicitly enforcing the contract. This can mask architecture regressions and weaken trust in tooltip/availability consistency.

## Assumption Reassessment (2026-03-07)

1. `annotateLimitsGroup` currently skips annotation when a line lacks resolvable source identity (`info === undefined`). Confirmed in `packages/engine/src/kernel/condition-annotator.ts`.
2. `describeAction` is intended to be a never-throw API with graceful fallback, so invariant enforcement must preserve that API contract. Confirmed in `describeAction` try/catch behavior.
3. Existing tests do not directly assert behavior when Limits display lines lose or mismatch identity metadata; coverage currently focuses on happy-path identity parity.

## Architecture Check

1. Fail-fast invariant handling (with deterministic fallback behavior) is more robust than silent no-op paths for core identity contracts.
2. This is game-agnostic runtime integrity: it enforces engine display/annotation contracts independent of game content.
3. No backwards-compatibility aliases/shims: missing identity is treated as invalid internal state and handled explicitly.

## What to Change

### 1. Enforce limit annotation identity invariants explicitly

Update `annotateLimitsGroup`/`describeAction` flow so missing or unresolvable limit source identity is treated as invariant failure, with deterministic handling consistent with `describeAction` resilience guarantees.

### 2. Add targeted regression tests for invariant failures

Add tests that simulate malformed/misaligned limit display lines and verify behavior is explicit and deterministic (no silent partial annotation drift).

### 3. Strengthen cross-surface consistency checks

Ensure rule-state limit usage and description limit usage stay coherent under invariant error paths and do not surface ambiguous partial state.

## Files to Touch

- `packages/engine/src/kernel/condition-annotator.ts` (modify)
- `packages/engine/test/unit/kernel/condition-annotator.test.ts` (modify)

## Out of Scope

- Compiler/GameDef canonical limit ID validation (covered by LEGACTTOO-032)
- Runner UI rendering/style refactors
- Any game-specific behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Missing/mismatched limit source identity does not silently no-op; behavior is explicitly handled and deterministic.
2. `describeAction` retains never-throw contract while preserving clear limit usage semantics on invariant violations.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Limit usage annotations are contract-enforced, not best-effort.
2. Identity/usage propagation remains deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/condition-annotator.test.ts` — add invariant-failure coverage for missing/mismatched limit source identity.
2. `packages/engine/test/unit/kernel/condition-annotator.test.ts` — strengthen parity assertions under invariant-stress scenarios.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/condition-annotator.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`
