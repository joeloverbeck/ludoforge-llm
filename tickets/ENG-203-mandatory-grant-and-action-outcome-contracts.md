# ENG-203: Mandatory Grant and Action Outcome Contracts

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — event grants, turn-flow pass/eligibility controls, action execution validation
**Deps**: archive/tickets/FITLEVENTARCH/ENG-201-free-op-grant-viability-gating.md, tickets/ENG-202-free-op-sequence-bound-space-context.md, packages/engine/src/kernel/apply-move.ts, packages/engine/src/kernel/turn-flow-eligibility.ts

## Problem

Cards needing “must execute with something” semantics cannot currently enforce that granted operations are mandatory and materially executed. Grants can remain pending or actions can resolve as effectively no-op while still satisfying chain progression.

## Assumption Reassessment (2026-03-08)

1. Current grant model supports ordering and authorization but no explicit “mandatory completion” contract.
2. Current action pipelines can be legal with minimal selections that may yield no material change depending on action profile stages.
3. Mismatch: playbook-level obligations like “must Air Lift, Sweep, and Assault with something” are not expressible exactly. Correction: add generic mandatory grant and outcome contracts.

## Architecture Check

1. Generic mandatory contracts are cleaner than hardcoding per-card/per-action enforcement logic.
2. Contracts remain data-driven in `GameSpecDoc`; runtime just enforces declared constraints.
3. No compatibility shims: one canonical mandatory policy and one canonical outcome-check surface.

## What to Change

### 1. Mandatory grant completion policy

Add grant/sequence metadata for required completion before pass/card-end (for example `completion: required`).

### 2. Outcome guard contract

Add declarative per-grant or per-action guard (for example condition over resolved params and/or execution result metrics) that must pass for move acceptance.

### 3. Enforcement and diagnostics

Reject moves that fail required-outcome checks with explicit illegal reason/metadata, and prevent pass/advancement while required grants for active seat remain unresolved.

## Files to Touch

- `packages/engine/src/kernel/types-events.ts` (modify)
- `packages/engine/src/kernel/types-turn-flow.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/runtime-reasons.ts` and legality metadata contracts (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)

## Out of Scope

- Ia Drang card data rewrite (handled in dependent ticket).

## Acceptance Criteria

### Tests That Must Pass

1. Required grant chains block pass and card-end until resolved or explicitly failed by policy.
2. Outcome-guard violation rejects move with deterministic reason metadata.
3. Existing suite: `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`

### Invariants

1. Mandatory/outcome semantics are declarative and game-agnostic.
2. Enforcement is deterministic across seeds and does not depend on UI-specific choices.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — mandatory chain progression and pass blocking.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — outcome-guard fail/pass coverage.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
