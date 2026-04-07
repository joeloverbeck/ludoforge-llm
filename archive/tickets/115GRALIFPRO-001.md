# 115GRALIFPRO-001: Add `GrantLifecyclePhase` type and `phase` field

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel type definitions
**Deps**: None

## Problem

The `TurnFlowPendingFreeOperationGrant` type has no explicit lifecycle phase field. Grant readiness, eligibility, and viability are computed from scratch by 6+ subsystems. This ticket adds the foundational type infrastructure that all subsequent lifecycle tickets depend on.

## Assumption Reassessment (2026-04-07)

1. `TurnFlowPendingFreeOperationGrant` is defined in `packages/engine/src/kernel/types-turn-flow.ts:184` — confirmed via grep.
2. No `phase` field or `GrantLifecyclePhase` type exists anywhere in the codebase — confirmed via grep.
3. `turn-flow-free-operation-grant-contract.ts` exists and defines completion/viability/outcome policy string unions — confirmed.

## Architecture Check

1. Adding a `phase` field to the grant type is the minimal first step — it introduces no logic changes, only type infrastructure.
2. The `GrantLifecyclePhase` type is fully game-agnostic: the phases describe generic lifecycle states (waiting, ready, offered, consumed, exhausted, skipped, expired), not game-specific concepts.
3. No backwards-compatibility shims — the `phase` field is required, not optional. Repo-owned grant construction and typed fixture surfaces must be updated atomically in the same change to satisfy Foundation 14.

## What to Change

### 1. Define `GrantLifecyclePhase` type

In `packages/engine/src/kernel/types-turn-flow.ts`, add the `GrantLifecyclePhase` discriminated union:

```typescript
type GrantLifecyclePhase =
  | 'sequenceWaiting'
  | 'ready'
  | 'offered'
  | 'consumed'
  | 'exhausted'
  | 'skipped'
  | 'expired';
```

Export it from the module.

### 2. Add `phase` field to `TurnFlowPendingFreeOperationGrant`

Add `readonly phase: GrantLifecyclePhase` to the `TurnFlowPendingFreeOperationGrant` type at line 184.

### 3. Update contract file

In `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts`, add `GrantLifecyclePhase` to exports if the contract pattern requires it, or add validation for the phase values.

### 4. Export from kernel index

Ensure `GrantLifecyclePhase` is exported from `packages/engine/src/kernel/index.ts` via the existing `types-turn-flow` re-export chain.

## Files to Touch

- `packages/engine/src/kernel/types-turn-flow.ts` (modify — add type and field)
- `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts` (modify — add phase validation)

## Out of Scope

- Lifecycle transition logic (ticket 002)
- Replacing predicates with phase reads (ticket 004)
- Full determinism/integration follow-through after the broader lifecycle refactor (ticket 006)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine typecheck` passes.
2. Runtime schema and touched typed fixture surfaces compile with required `phase`.
3. Focused engine build and grant/schema unit coverage pass for the touched surfaces.

### Invariants

1. `GrantLifecyclePhase` is a string union, not an enum — consistent with existing policy/contract types in the codebase.
2. `phase` is `readonly` — consistent with Foundation 11 (Immutability).
3. `phase` is required, not optional — no backwards-compatibility shim (Foundation 14).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/json-schema.test.ts` — validates the required runtime schema surface for pending grants.
2. `packages/engine/test/unit/kernel/free-operation-grant-bindings.test.ts` — validates helper/fixture grant surfaces still preserve metadata.
3. `packages/engine/test/unit/kernel/free-operation-grant-sequence-readiness.test.ts` — validates sequenced fixtures encode explicit `phase`.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine schema:artifacts`
4. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/json-schema.test.js dist/test/unit/kernel/free-operation-grant-sequence-readiness.test.js dist/test/unit/kernel/free-operation-grant-bindings.test.js`

## Outcome

- **Completed**: 2026-04-07
- **What changed**:
  - Added the generic `GrantLifecyclePhase` string union to the shared turn-flow free-operation grant contract.
  - Added required `phase` to `TurnFlowPendingFreeOperationGrant`.
  - Set initial `phase` in the live grant construction paths to keep the repository atomic and Foundation 14 compliant.
  - Updated runtime schema artifacts and repo-owned typed helpers/fixtures that construct pending grants.
- **Deviations from original plan**:
  - The ticket's original boundary was stale. Initial `phase` assignment and typed fixture fallout could not be deferred to later tickets without leaving the repository broken, so that owned migration work was absorbed here.
  - The contract file path named in the ticket was stale; the live file was `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts`.
- **Verification results**:
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine schema:artifacts` regenerated schema artifacts successfully.
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/json-schema.test.js dist/test/unit/kernel/free-operation-grant-sequence-readiness.test.js dist/test/unit/kernel/free-operation-grant-bindings.test.js` passed.
