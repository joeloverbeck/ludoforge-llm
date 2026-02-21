# CONCPAR-007: Reveal/Conceal contract parity guardrail tests

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — tests (cross-layer parity)
**Deps**: CONCPAR-001

## Problem

Reveal and conceal are a paired hidden-information contract, but parity is currently verified only indirectly through scattered tests. This increases drift risk across AST type, schema, behavior validation, and runtime reason contracts.

## Assumption Reassessment (2026-02-21)

1. Reveal and conceal now differ intentionally only by selector direction (`to` vs `from`) and current runtime semantics (selective execution deferred to CONCPAR-003).
2. Current tests validate many individual behaviors but do not provide one focused parity guardrail for the shared contract surface.
3. This parity-guardrail work is not covered by CONCPAR-002/003/004 implementation scopes.

## Architecture Check

1. A dedicated parity guardrail test suite is a low-cost way to keep hidden-information architecture coherent over time.
2. Tests stay game-agnostic and enforce only engine-level contracts.
3. No backward-compatibility path: tests encode the canonical contract and fail on drift.

## What to Change

### 1. Add a focused parity test suite

Create unit tests that assert reveal/conceal parity across layers:
- AST acceptance parity for `zone + selector + filter`
- schema acceptance/rejection parity for equivalent shapes
- behavior validator parity for selector and filter validation
- runtime reason taxonomy parity (`REVEAL_RUNTIME_VALIDATION_FAILED` and `CONCEAL_RUNTIME_VALIDATION_FAILED` both present)

### 2. Keep parity scope explicit

Document in test names/comments that runtime selective conceal behavior parity is intentionally excluded until CONCPAR-003 lands.

## Files to Touch

- `packages/engine/test/unit/` (new test file; exact file name up to implementer, e.g. `reveal-conceal-parity.test.ts`)
- `packages/engine/test/unit/kernel/runtime-reasons.test.ts` (modify only if parity assertions are centralized there)

## Out of Scope

- Implementing selective conceal runtime removal — CONCPAR-003
- Compiler lowering implementation — CONCPAR-002
- Trace entry model changes — CONCPAR-004

## Acceptance Criteria

### Tests That Must Pass

1. Parity tests fail if reveal/conceal type/schema/validator reason contracts diverge unintentionally.
2. Existing reveal/conceal behavior tests remain green.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Hidden-information effect contracts stay symmetrical where intentionally designed.
2. Any future reveal/conceal surface change requires explicit, synchronized updates across layers.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/reveal-conceal-parity.test.ts` (new) — targeted cross-layer contract guardrails.

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "reveal|conceal|parity"`
2. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
