# 115GRALIFPRO-002: Create `grant-lifecycle.ts` transition functions and trace module

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel modules
**Deps**: `archive/tickets/115GRALIFPRO-001.md`

## Problem

Grant lifecycle transitions (ready, offered, consumed, skipped, expired) are implicit — scattered across `turn-flow-eligibility.ts`, `phase-advance.ts`, `apply-move.ts`, and `simulator.ts`. There is no centralized module that validates phase transitions or produces trace entries. This ticket creates the lifecycle state machine as a standalone module with full unit tests.

## Assumption Reassessment (2026-04-07)

1. No `grant-lifecycle.ts` or `grant-lifecycle-trace.ts` exists — confirmed via glob.
2. `GrantLifecyclePhase` type will be available after ticket 001 — dependency is explicit.
3. Trace entry patterns exist in `packages/engine/src/kernel/` (e.g., effect execution traces) — can follow existing patterns for trace structure.

## Architecture Check

1. A centralized lifecycle module is the root-cause fix for scattered grant state (Foundation 15: Architectural Completeness).
2. Each transition function validates the source phase and returns a new grant object — pure, deterministic, immutable (Foundations 8, 11).
3. Trace entries enable replay and debugging (Foundation 9: Auditability).
4. The module is game-agnostic — it operates on generic grant lifecycle phases, not game-specific concepts (Foundation 1).

## What to Change

### 1. Create `grant-lifecycle.ts`

New file: `packages/engine/src/kernel/grant-lifecycle.ts`

Export one function per transition:

- `advanceToReady(grant): grant` — from `sequenceWaiting` → `ready`. Hard error if source phase is not `sequenceWaiting`.
- `markOffered(grant): grant` — from `ready` → `offered`. Hard error if not `ready`.
- `consumeUse(grant): grant` — from `offered` or `ready` → if `remainingUses > 1`: new grant with `phase: 'ready'` and decremented `remainingUses`; if `remainingUses === 1`: `phase: 'exhausted'`.
- `skipGrant(grant): grant` — from `ready` or `offered` → `skipped`. Only valid for `completionPolicy === 'skipIfNoLegalCompletion'`.
- `expireGrant(grant): grant` — from `ready` or `offered` → `expired`. Only valid for `completionPolicy === 'required'` or `'skipIfNoLegalCompletion'`.

Each function:
1. Validates source phase (throws `RuntimeError` on invalid transition)
2. Returns a new grant object with updated `phase` (and `remainingUses` for `consumeUse`)
3. Calls the trace producer

### 2. Create `grant-lifecycle-trace.ts`

New file: `packages/engine/src/kernel/grant-lifecycle-trace.ts`

Export a trace entry factory that produces structured trace records for each lifecycle transition. Follow the existing trace pattern in the kernel. Each entry includes: `grantId`, `fromPhase`, `toPhase`, `seat`, `operationClass`.

### 3. Export from kernel index

Add both modules to `packages/engine/src/kernel/index.ts` exports.

### 4. Unit tests

New file: `packages/engine/test/unit/kernel/grant-lifecycle.test.ts`

Test each transition:
- Valid source phase → correct target phase
- Invalid source phase → throws `RuntimeError`
- `consumeUse` with `remainingUses > 1` → `ready` (not exhausted)
- `consumeUse` with `remainingUses === 1` → `exhausted`
- `skipGrant` rejects grants without `skipIfNoLegalCompletion` policy
- Each transition produces a trace entry

## Files to Touch

- `packages/engine/src/kernel/grant-lifecycle.ts` (new)
- `packages/engine/src/kernel/grant-lifecycle-trace.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify — add exports)
- `packages/engine/test/unit/kernel/grant-lifecycle.test.ts` (new)

## Out of Scope

- Wiring transitions into existing subsystems (tickets 004, 005)
- Setting initial phase at creation sites (ticket 003)
- Modifying existing predicates (ticket 004)

## Acceptance Criteria

### Tests That Must Pass

1. All lifecycle transition unit tests pass (valid and invalid source phases).
2. `consumeUse` correctly handles `remainingUses` decrement and exhaustion.
3. Every transition produces a trace entry with correct `fromPhase`/`toPhase`.
4. `pnpm turbo typecheck` passes.
5. `pnpm turbo lint` passes.

### Invariants

1. Transition functions are pure — same input always produces same output (Foundation 8).
2. Transition functions never mutate the input grant (Foundation 11).
3. Invalid transitions throw `RuntimeError`, never silently succeed.
4. Trace entries are deterministic — same transition produces identical trace.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/grant-lifecycle.test.ts` — comprehensive transition tests covering all phases and edge cases

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="grant-lifecycle"`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completed: 2026-04-07
- What changed:
  - Added the new lifecycle transition module at `packages/engine/src/kernel/grant-lifecycle.ts`.
  - Added the trace factory at `packages/engine/src/kernel/grant-lifecycle-trace.ts`.
  - Extended the shared trigger-log type/schema surfaces so `turnFlowGrantLifecycle` is a first-class trace entry.
  - Exported the new lifecycle modules from the kernel index.
  - Added focused lifecycle unit coverage in `packages/engine/test/unit/kernel/grant-lifecycle.test.ts`.
- Deviations from original plan:
  - The ticket's focused test command used a Jest-style `--test-name-pattern` example. The repo's engine tests run on Node's test runner, so verification used the built concrete test file path instead.
  - Root `pnpm turbo typecheck` surfaced one repo-owned fallout item outside the ticket's listed files: `packages/runner/src/model/translate-effect-trace.ts` needed a new exhaustiveness case for the added `turnFlowGrantLifecycle` union member. That adapter update was included to keep the repo coherent.
- Verification:
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine schema:artifacts`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/grant-lifecycle.test.js`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
