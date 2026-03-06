# TOKFILAST-023: Add Guardrail Policy for Condition-Surface Contract Parity

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — lint/policy test coverage for validator contract usage
**Deps**: archive/tickets/TOKFILAST-022-condition-surface-contract-adoption-completion.md

## Problem

The condition-surface contract is now present, but there is no guardrail that prevents future reintroduction of raw condition-path literals in validator callsites. Without a policy test, architectural drift can silently return.

## Assumption Reassessment (2026-03-06)

1. Validator condition-path centralization depends on developers consistently using helper APIs, not on an enforced policy.
2. Existing lint/policy test suites already enforce architectural contracts in this repository, so this area can follow the same pattern.
3. No active ticket currently enforces condition-surface helper usage across validator callsites.

## Architecture Check

1. A policy/lint guard is cleaner than relying on convention because it makes the contract mechanically enforceable.
2. This is pure engine architecture hygiene and remains fully game-agnostic.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Add a policy test for validator condition-surface callsites

Create a focused unit lint/policy test that scans validator files and fails when top-level `validateConditionAst` callsites use raw inline path templates where contract helpers are required.

### 2. Document allowed vs disallowed path-construction patterns

In the policy test and/or associated contract comments, codify:
- allowed: `conditionSurfacePathFor*` and `appendConditionSurfacePath(...)`
- disallowed: top-level raw literal templates for those same surfaces

## Files to Touch

- `packages/engine/test/unit/lint/` (add new policy test)
- `packages/engine/src/contracts/condition-surface-contract.ts` (modify comments only, if needed)

## Out of Scope

- Runtime or validator semantic behavior changes.
- Token-filter traversal/operator hardening tickets (`TOKFILAST-018..021`).

## Acceptance Criteria

### Tests That Must Pass

1. Policy test fails when a validator top-level condition surface uses raw path literals instead of contract helpers.
2. Policy test passes for current contract-compliant validator code.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Condition-surface path ownership remains centralized and mechanically enforced.
2. Engine contracts stay generic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/<new-condition-surface-policy>.test.ts` — enforce contract usage in validator callsites to prevent path drift regressions.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

