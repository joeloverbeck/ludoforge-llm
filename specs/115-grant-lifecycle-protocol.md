# Spec 115 — Grant Lifecycle Protocol

**Status**: PROPOSED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel turn-flow subsystem refactoring
**Deps**: None (can be implemented independently of other specs)

## Problem

The free-operation grant system is a 3,500+ line cross-cutting concern spread across 35 files with 55+ exported functions. It has 8 explicit workarounds for problems that shouldn't exist if the abstraction were right. The root cause: grants have an implicit state machine whose transitions are scattered across 6+ subsystems (legal-moves, turn-flow-eligibility, apply-move, phase-advance, free-operation-viability, simulator). Each subsystem computes grant readiness, eligibility, and viability from scratch. Fixing a bug in one subsystem breaks another because there is no single source of truth for grant state.

**Evidence**:
- FREOPSKIP-001 changed 11 engine files and broke determinism (FOUNDATIONS §8)
- The re-implementation required simulator-level error recovery (FOUNDATIONS §5 violation: kernel and simulator have different grant handling paths)
- `isRequiredPendingFreeOperationGrant` was broadened to cover `skipIfNoLegalCompletion` — a semantic contradiction in the predicate name (FOUNDATIONS §15: symptom patch, not root cause fix)
- The same "is this grant ready?" check is computed in 5+ locations from the raw pending-grants array

## Architecture Check

### FOUNDATIONS Alignment

| Principle | Current | After |
|-----------|---------|-------|
| §1 Engine Agnosticism | Grants encode game-specific semantics deep in kernel | Grant lifecycle is generic; policies are game-spec data |
| §5 One Rules Protocol | Simulator catches agent errors to compensate for kernel gaps | Kernel owns full lifecycle; simulator has no grant-specific logic |
| §8 Determinism | At risk — scattered transitions create hidden order dependencies | Single-source transitions; deterministic by construction |
| §10 Bounded Computation | `hasLegalCompletedFreeOperationMoveInCurrentState` is expensive redundant probing | Viability computed once during transition, cached in lifecycle state |
| §14 No Backwards Compatibility | `isRequiredPendingFreeOperationGrant` broadening is a compatibility shim | No shims — each policy has its own explicit transition rules |
| §15 Architectural Completeness | 8 workarounds address symptoms | State machine addresses root cause |

### Game-Agnosticism

The grant lifecycle protocol is game-agnostic. It provides a generic state machine for "temporary action rights with completion constraints." FITL free operations, Texas Hold'em side pots, or any future game mechanic that grants temporary action rights would use the same protocol. The game-specific part (which actions, zone filters, outcome policies) lives in GameSpecDoc YAML, not in the engine.

## What to Change

### 1. Introduce `GrantLifecyclePhase` type

Replace the implicit grant phases with an explicit discriminated union:

```typescript
type GrantLifecyclePhase =
  | 'sequenceWaiting'    // Blocked by prior sequence steps
  | 'ready'              // Sequence-ready; enumerable to legal moves
  | 'offered'            // Legal moves surfaced for this grant
  | 'consumed'           // Grant use decremented (remainingUses > 0: stays ready)
  | 'exhausted'          // remainingUses reached 0; grant removed
  | 'skipped'            // skipIfNoLegalCompletion: no viable completion found
  | 'expired';           // required: unfulfillable constraint detected
```

### 2. Add `phase` field to `TurnFlowPendingFreeOperationGrant`

The `phase` field is the single source of truth for where the grant is in its lifecycle. All existing predicates (`isRequiredPendingFreeOperationGrant`, `isPendingFreeOperationGrantSequenceReady`, `hasReadyRequiredPendingFreeOperationGrantForSeat`) become thin wrappers that read `phase` instead of computing from scratch.

### 3. Centralize phase transitions in `grant-lifecycle.ts`

New module: `packages/engine/src/kernel/grant-lifecycle.ts`

Exports one function per transition:

| Transition | From | To | Current owner(s) |
|-----------|------|-----|-------------------|
| `advanceToReady` | sequenceWaiting | ready | `isPendingFreeOperationGrantSequenceReady` (computed) |
| `markOffered` | ready | offered | implicit (enumeration happened) |
| `consumeUse` | offered/ready | consumed → ready OR exhausted | `consumeTurnFlowFreeOperationGrant` |
| `skipGrant` | ready/offered | skipped | `skipPendingSkippableFreeOperationGrants` |
| `expireGrant` | ready/offered | expired | `expireUnfulfillableRequiredFreeOperationGrants` |

Each transition function:
1. Validates the current phase (hard error if invalid transition)
2. Returns the new grant with updated `phase`
3. Produces a trace entry for auditability (FOUNDATIONS §9)

### 4. Replace scattered predicates with phase reads

| Current predicate | Replacement |
|-------------------|-------------|
| `isRequiredPendingFreeOperationGrant(grant)` | `grant.phase === 'ready' \|\| grant.phase === 'offered'` |
| `isPendingFreeOperationGrantSequenceReady(...)` | `grant.phase !== 'sequenceWaiting'` |
| `hasReadyRequiredPendingFreeOperationGrantForSeat(...)` | `pending.some(g => g.seat === seat && g.phase === 'ready')` |

### 5. Remove simulator error recovery

The `NoPlayableMovesAfterPreparationError` catch in `simulator.ts` that calls `skipPendingSkippableFreeOperationGrants` should be removed. Instead, the kernel's `advanceToDecisionPoint` handles skip/expiry transitions before surfacing legal moves. The viability check happens during the `ready → offered` transition.

### 6. Move completion viability into the lifecycle

Currently `hasLegalCompletedFreeOperationMoveInCurrentState` is called ad-hoc. In the new model, the `advanceToReady` transition checks viability for `skipIfNoLegalCompletion` grants. If no viable completion exists, the grant transitions directly to `skipped` without ever reaching `offered`.

## Files to Touch

**New**:
- `packages/engine/src/kernel/grant-lifecycle.ts` — lifecycle state machine
- `packages/engine/src/kernel/grant-lifecycle-trace.ts` — trace entry production
- `packages/engine/test/unit/kernel/grant-lifecycle.test.ts` — unit tests for transitions

**Modify** (refactor to use lifecycle):
- `packages/engine/src/kernel/turn-flow-eligibility.ts` — replace predicate computation with phase reads
- `packages/engine/src/kernel/legal-moves.ts` — read phase instead of computing readiness
- `packages/engine/src/kernel/phase-advance.ts` — drive transitions instead of calling scattered functions
- `packages/engine/src/kernel/apply-move.ts` — call `consumeUse` transition
- `packages/engine/src/kernel/free-operation-viability.ts` — fold into lifecycle transitions
- `packages/engine/src/kernel/free-operation-grant-authorization.ts` — simplify authorization using phase
- `packages/engine/src/kernel/types.ts` — add `phase` to grant type
- `packages/engine/src/sim/simulator.ts` — remove grant-specific error recovery

**Delete** (after migration):
- `expireUnfulfillableRequiredFreeOperationGrants` (replaced by `expireGrant` transition)
- `skipPendingSkippableFreeOperationGrants` (replaced by `skipGrant` transition)
- The `isRequiredPendingFreeOperationGrant` broadening (replaced by phase read)

## Out of Scope

- Changing the grant creation path (effect execution)
- Changing the GameSpecDoc YAML format for grants
- Adding new completion/outcome policies
- Modifying the agent system
- Changing the browser runner

## Acceptance Criteria

### Tests

1. **Lifecycle unit tests**: Each transition (ready, offered, consumed, exhausted, skipped, expired) has a test proving valid/invalid source phases.
2. **Determinism canary**: Seeds 1001-1004 produce identical PolicyAgent outcomes (existing canary test).
3. **Seed 1009**: Card 75 shaded March grant is skipped without deadlock.
4. **Sihanouk integration**: All 5 Card 75 tests pass.
5. **Full test suite**: 5581+ tests pass, 0 failures.
6. **Simulator simplification**: `simulator.ts` has NO grant-specific error handling.
7. **Predicate elimination**: `isRequiredPendingFreeOperationGrant` no longer uses `||` broadening; it reads `grant.phase`.

### Invariants

1. Grant phase is the ONLY source of truth for grant state. No function computes readiness/eligibility from raw fields.
2. Every phase transition produces a trace entry (FOUNDATIONS §9).
3. The simulator has no grant-specific logic (FOUNDATIONS §5).
4. All transitions are deterministic (FOUNDATIONS §8).
5. No backwards-compatibility shims (FOUNDATIONS §14).

## Test Plan

### New Tests
- `packages/engine/test/unit/kernel/grant-lifecycle.test.ts` — lifecycle state machine transitions
- Update `packages/engine/test/determinism/fitl-policy-agent-canary.test.ts` if needed

### Existing Tests (must all pass)
- `pnpm -F @ludoforge/engine test` (full default suite)
- `pnpm -F @ludoforge/engine test:determinism` (determinism lane)
- `pnpm -F @ludoforge/engine test:integration:fitl-events` (event integration lane)
- `pnpm turbo typecheck`
- `pnpm turbo lint`
