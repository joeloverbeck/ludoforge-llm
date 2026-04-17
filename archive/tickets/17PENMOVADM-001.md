# 17PENMOVADM-001: Introduce shared admissibility classifier module

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module `packages/engine/src/kernel/move-admissibility.ts`; barrel re-export in `packages/engine/src/kernel/index.ts`
**Deps**: `archive/specs/16-template-completion-contract.md`, `archive/specs/132-agent-stuck-viable-template-completion-mismatch.md`, `specs/17-pending-move-admissibility.md`

## Problem

Admissibility classification for pending moves is currently enforced at three scattered, non-identical call sites:

- `packages/engine/src/kernel/legal-moves.ts:327-354` (enumeration layer — rejects floating-incomplete shape when decision-sequence admission is `'unsatisfiable'`, emits `MOVE_ENUM_PROBE_REJECTED`)
- `packages/engine/src/kernel/playable-candidate.ts:63-67` (pre-completion — rejects `viable && !complete && stochasticDecision === undefined` as `notDecisionComplete`)
- `packages/engine/src/kernel/playable-candidate.ts:93-98` (post-completion — same condition, mapped to `drawDeadEnd`)

There is no shared predicate. A future refactor can weaken one site while the other two still pass regression tests, and no single point in the codebase owns the invariant "a pending admissible move must point to a real decision or stochastic continuation under the shared completion contract" (Spec 17 Contract §1).

This ticket introduces the shared admissibility classifier module. Migration of the three call sites happens atomically across tickets 002 and 003; this ticket does not yet migrate.

## Assumption Reassessment (2026-04-17)

1. `probeMoveViability` at `packages/engine/src/kernel/apply-move.ts:2068` returns `MoveViabilityProbeResult` (alias for `MoveViabilityResult`), the 4-branch discriminated union defined at `packages/engine/src/kernel/viability-predicate.ts:43-91`. Confirmed via read.
2. `classifyMoveDecisionSequenceAdmissionForLegalMove` at `packages/engine/src/kernel/move-decision-sequence.ts:177-198` returns `'satisfied' | 'unsatisfiable' | 'unknown'`. Confirmed.
3. The "floating incomplete" shape (`viable: true, complete: false`, all three pending-decision refs `undefined`) has exactly one construction site: `deriveMoveViabilityVerdict` at `packages/engine/src/kernel/viability-predicate.ts:108-127`, triggered only by `isDeferredFreeOperationTemplateZoneFilterMismatch`. Confirmed.
4. Spec 16 (archived; COMPLETED 2026-04-17) locked the `TemplateCompletionResult` contract; Spec 132 (archived; COMPLETED 2026-04-17) removed `agentStuck` from the simulator stop-reason union. Both dependencies resolved to `archive/specs/`.
5. No existing `move-admissibility.ts` module — verified via `ls packages/engine/src/kernel/` and grep.

## Architecture Check

1. Foundation #15 (Architectural Completeness): centralizing the admissibility predicate eliminates the drift surface where three independent sites encode overlapping rules.
2. Foundation #1 (Engine Agnosticism): classifier operates on `GameDef + GameState + Move + MoveViabilityResult`; no game-specific logic introduced.
3. Foundation #11 (Immutability): classifier is a pure predicate — no mutation of `def`, `state`, `move`, or `runtime`. Returns a fresh verdict object.
4. Foundation #14 (No Backwards Compatibility): this ticket only introduces the module; tickets 002 and 003 atomically delete the three inline call sites in the same changes that begin consuming the classifier. No `_legacy` paths or dual-code periods beyond the ticket chain.

## What to Change

### 1. New module `packages/engine/src/kernel/move-admissibility.ts`

Export the verdict type and classifier function:

```ts
export type MoveAdmissibilityVerdict =
  | Readonly<{ kind: 'complete' }>
  | Readonly<{ kind: 'pendingAdmissible'; continuation: 'decision' | 'decisionSet' | 'stochastic' }>
  | Readonly<{
      kind: 'inadmissible';
      reason:
        | 'illegalMove'
        | 'runtimeError'
        | 'floatingUnsatisfiable'
        | 'floatingUnresolved';
    }>;

export const classifyMoveAdmissibility = (
  def: GameDef,
  state: GameState,
  move: Move,
  viability: MoveViabilityResult,
  runtime?: GameDefRuntime,
): MoveAdmissibilityVerdict => { ... };
```

Classification rules:

- `!viability.viable && viability.code === 'ILLEGAL_MOVE'` → `{ kind: 'inadmissible', reason: 'illegalMove' }`
- `!viability.viable && viability.code !== 'ILLEGAL_MOVE'` → `{ kind: 'inadmissible', reason: 'runtimeError' }`
- `viability.viable && viability.complete` → `{ kind: 'complete' }`
- `viability.viable && !viability.complete && viability.stochasticDecision !== undefined` → `{ kind: 'pendingAdmissible', continuation: 'stochastic' }`
- `viability.viable && !viability.complete && viability.nextDecision !== undefined` → `{ kind: 'pendingAdmissible', continuation: 'decision' }`
- `viability.viable && !viability.complete && viability.nextDecisionSet !== undefined` → `{ kind: 'pendingAdmissible', continuation: 'decisionSet' }`
- Otherwise (floating incomplete — all three pending refs `undefined`): call `classifyMoveDecisionSequenceAdmissionForLegalMove(def, state, move, MISSING_BINDING_POLICY_CONTEXTS.LEGAL_MOVES_FREE_OPERATION_DECISION_SEQUENCE, { budgets: resolveMoveEnumerationBudgets() }, runtime)`:
  - `'unsatisfiable'` → `{ kind: 'inadmissible', reason: 'floatingUnsatisfiable' }`
  - `'satisfied'` or `'unknown'` → `{ kind: 'inadmissible', reason: 'floatingUnresolved' }` (floating-incomplete shape is never acceptable at the client boundary per Spec 17 Contract §2; even a `'satisfied'` admission for this shape indicates a refinement bug upstream and must not cross the boundary)

Note: ticket 002 must preserve today's enumeration-layer behavior of keeping moves whose admission is `'satisfied'` or `'unknown'`. That preservation happens at the enumeration layer's call site (layer-specific policy), not in the shared classifier. The classifier reports the strict Spec 17 §2 verdict; each layer chooses which verdicts it treats as fatal vs. keepable. See ticket 002 for the enumeration-layer mapping.

### 2. Barrel re-export

Add `export * from './move-admissibility.js';` to `packages/engine/src/kernel/index.ts`.

### 3. Unit tests `packages/engine/test/unit/kernel/move-admissibility.test.ts`

Cover every verdict branch with minimal synthetic `GameDef` fixtures (no FITL dependency):

1. Complete move → `{ kind: 'complete' }`
2. Stochastic pending → `{ kind: 'pendingAdmissible', continuation: 'stochastic' }`
3. Single `nextDecision` pending → `{ kind: 'pendingAdmissible', continuation: 'decision' }`
4. `nextDecisionSet` pending → `{ kind: 'pendingAdmissible', continuation: 'decisionSet' }`
5. Illegal move → `{ kind: 'inadmissible', reason: 'illegalMove' }`
6. Non-`ILLEGAL_MOVE` runtime error → `{ kind: 'inadmissible', reason: 'runtimeError' }`
7. Floating-incomplete with unsatisfiable admission → `{ kind: 'inadmissible', reason: 'floatingUnsatisfiable' }`
8. Floating-incomplete with satisfied/unknown admission → `{ kind: 'inadmissible', reason: 'floatingUnresolved' }`
9. Determinism: repeated call returns byte-equal verdict (JSON-stringify equality).
10. Purity: deep clone of inputs pre-call equals deep clone post-call.

## Files to Touch

- `packages/engine/src/kernel/move-admissibility.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify — add barrel re-export)
- `packages/engine/test/unit/kernel/move-admissibility.test.ts` (new)

## Out of Scope

- Migrating `legal-moves.ts:327-354` (ticket 002)
- Migrating `playable-candidate.ts:63-67` and `playable-candidate.ts:93-98` (ticket 003)
- Cross-layer parity integration test (ticket 004)
- Any change to `probeMoveViability`, `completeTemplateMove`, `classifyMoveDecisionSequenceAdmissionForLegalMove`, or retry logic
- Any change to `TemplateCompletionResult` (Spec 16 territory)

## Acceptance Criteria

### Tests That Must Pass

1. All unit tests in `packages/engine/test/unit/kernel/move-admissibility.test.ts` green.
2. `packages/engine/test/unit/kernel/completion-contract-invariants.test.ts` remains green (no semantic change expected).
3. `packages/engine/test/unit/kernel/viability-predicate*` tests remain green (not touched).
4. Full engine suite: `pnpm turbo test`.

### Invariants

1. `classifyMoveAdmissibility` is pure: for fixed `(def, state, move, viability, runtime)`, repeated calls return byte-equal verdicts.
2. Inputs are not mutated — deep-cloned snapshots taken before and after the call are equal.
3. Every `MoveViabilityResult` branch produces exactly one verdict; no branch is unreachable.
4. The module does not import from `packages/engine/src/agents/` or `packages/engine/src/sim/` — the classifier lives at the kernel layer.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/move-admissibility.test.ts` — all ten verdict branches plus determinism and purity assertions.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/move-admissibility.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`

## Outcome

- Completed on 2026-04-17.
- Landed `packages/engine/src/kernel/move-admissibility.ts` with the shared `MoveAdmissibilityVerdict` type and `classifyMoveAdmissibility(def, state, move, viability, runtime?)` classifier required by this ticket.
- Added the kernel barrel re-export in `packages/engine/src/kernel/index.ts`.
- Added `packages/engine/test/unit/kernel/move-admissibility.test.ts` covering all ticket-owned verdict branches plus determinism and purity checks.
- Boundary correction confirmed during reassessment: this ticket intentionally stops at module introduction and unit proof. The `legal-moves.ts` and `playable-candidate.ts` migrations remain deferred to tickets 002 and 003, and the cross-layer parity integration proof remains deferred to ticket 004.
- Schema/artifact fallout checked: none required and none changed.

## Verification Run

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/move-admissibility.test.js`
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo lint`
- `pnpm turbo typecheck`
- `pnpm turbo test`
