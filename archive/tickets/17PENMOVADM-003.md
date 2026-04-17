# 17PENMOVADM-003: Migrate playable-candidate client boundary to shared admissibility classifier

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/playable-candidate.ts`
**Deps**: `archive/tickets/17PENMOVADM-001.md`

## Problem

`packages/engine/src/kernel/playable-candidate.ts` contains two scattered inline admissibility checks — `classifyPlayableCandidateViability` at lines 63-67 (pre-completion; maps to `notDecisionComplete`) and `classifyCompletedTemplateMove` at lines 93-98 (post-completion; maps to `drawDeadEnd`). Per Spec 17 Foundation #14 direction, both must be replaced atomically by calls into the shared `classifyMoveAdmissibility` module from ticket 001.

This is the client-boundary side of the Spec 17 migration. After this ticket, no scattered admissibility check remains outside the shared classifier. The downstream consumer `packages/engine/src/agents/prepare-playable-moves.ts:295-310` (retry-budget logic) must continue to receive the same rejection labels with identical semantics — verified as part of this ticket but not modified.

## Assumption Reassessment (2026-04-17)

1. `classifyPlayableCandidateViability` at `packages/engine/src/kernel/playable-candidate.ts:35-68` has inline check at lines 63-67 returning `{ kind: 'rejected', move: viability.move, rejection: 'notDecisionComplete' }` when `viable && !complete && stochasticDecision === undefined`. Confirmed via read.
2. `classifyCompletedTemplateMove` at `packages/engine/src/kernel/playable-candidate.ts:70-101` has inline check at lines 93-98 returning `{ kind: 'rejected', move: viability.move, rejection: 'drawDeadEnd' }` under the same condition. Confirmed.
3. `PlayableCandidateClassification` union at `playable-candidate.ts:11-28` defines rejection labels: `'structurallyUnsatisfiable' | 'drawDeadEnd' | 'notViable' | 'notDecisionComplete'`. No new labels required for this migration.
4. `prepare-playable-moves.ts:295-310` handles `result.rejection` with three branches: `structurallyUnsatisfiable` → break; `notViable` or `drawDeadEnd` → extend retry budget up to `NOT_VIABLE_RETRY_CAP`; everything else (including `notDecisionComplete`) → fall through. Today `notDecisionComplete` never reaches this code because `classifyCompletedTemplateMove` maps it to `drawDeadEnd` first. Migration must preserve this pipeline mapping exactly.
5. Test coverage exercising these rejection paths exists in `packages/engine/test/unit/agents/policy-preview.test.ts`, `packages/engine/test/unit/agents/policy-agent.test.ts`, `packages/engine/test/unit/agents/policy-eval.test.ts`, and `packages/engine/test/unit/kernel/completion-contract-invariants.test.ts` — all must remain green.

## Architecture Check

1. Foundation #15: one source of truth for the admissibility predicate; layer-specific policy (which rejection label to use, which rejection is retryable) remains at the call site as intentional policy, not duplicated logic.
2. Foundation #11: classifier is pure; no mutation introduced by the migration.
3. Foundation #14: both inline checks are deleted in this ticket's diff — no `_legacy` or dual-path code retained.
4. `prepare-playable-moves.ts` is **not modified**. Its retry-budget logic at lines 295-310 depends on the rejection label being `structurallyUnsatisfiable` / `notViable` / `drawDeadEnd`. This ticket preserves every label and the pipeline mapping (`classifyCompletedTemplateMove` continues to map the post-completion floating shape to `drawDeadEnd`), so retry behavior is byte-equal to pre-migration.

## What to Change

### 1. Migrate `classifyPlayableCandidateViability` (lines 35-68)

Replace the inline check at lines 63-67 with a call into `classifyMoveAdmissibility`:

```ts
// BEFORE (lines 35-68, approximate):
const classifyPlayableCandidateViability = (move, state, viability) => {
  if (!viability.viable) return { kind: 'rejected', move, rejection: 'notViable', viability };
  if (viability.complete) return { kind: 'playableComplete', ... };
  if (viability.stochasticDecision !== undefined) return { kind: 'playableStochastic', ... };
  return { kind: 'rejected', move: viability.move, rejection: 'notDecisionComplete' };
};
```

```ts
// AFTER:
const classifyPlayableCandidateViability = (def, state, move, viability, runtime?) => {
  const admissibility = classifyMoveAdmissibility(def, state, move, viability, runtime);
  switch (admissibility.kind) {
    case 'complete':
      return { kind: 'playableComplete', move: createTrustedExecutableMove(viability.move, state.stateHash, 'templateCompletion'), warnings: viability.warnings };
    case 'pendingAdmissible':
      if (admissibility.continuation === 'stochastic') {
        return { kind: 'playableStochastic', move: createTrustedExecutableMove(viability.move, state.stateHash, 'templateCompletion'), warnings: viability.warnings, viability };
      }
      // Non-stochastic pending (decision/decisionSet) is inadmissible at the preparation layer
      // because completion has not yet driven to a playable boundary. Policy:
      return { kind: 'rejected', move: viability.move, rejection: 'notDecisionComplete' };
    case 'inadmissible':
      if (admissibility.reason === 'illegalMove' || admissibility.reason === 'runtimeError') {
        return { kind: 'rejected', move, rejection: 'notViable', viability };
      }
      return { kind: 'rejected', move: viability.move, rejection: 'notDecisionComplete' };
  }
};
```

Signature changes: `classifyPlayableCandidateViability` now needs `def` and optional `runtime` to call the classifier. Update its only in-file caller `classifyPlayableMoveCandidate` at lines 103-112 to pass them through (both are already available in that caller's scope).

### 2. Migrate `classifyCompletedTemplateMove` (lines 70-101)

Replace the inline check at lines 93-98 with a call into the classifier. Preserve the layer-specific mapping of `notDecisionComplete` → `drawDeadEnd` at this layer (post-completion policy):

```ts
// AFTER (lines 93-98 region):
const viability = probeMoveViability(def, state, completed.move, runtime);
if (!viability.viable) {
  return { kind: 'rejected', move: completed.move, rejection: 'drawDeadEnd', viability };
}
const admissibility = classifyMoveAdmissibility(def, state, completed.move, viability, runtime);
if (admissibility.kind === 'inadmissible' || (admissibility.kind === 'pendingAdmissible' && admissibility.continuation !== 'stochastic')) {
  return { kind: 'rejected', move: viability.move, rejection: 'drawDeadEnd' };
}
return classifyPlayableCandidateViability(def, state, completed.move, viability, runtime);
```

The `drawDeadEnd` mapping at this layer is intentional: after `completeTemplateMove` has run, any remaining non-stochastic pending shape indicates the sampled path failed to bind; callers retry under `NOT_VIABLE_RETRY_CAP` budget.

### 3. Verify `prepare-playable-moves.ts` retry decisions (no code change)

Read `packages/engine/src/agents/prepare-playable-moves.ts:295-310` post-migration and confirm:

- `result.rejection === 'structurallyUnsatisfiable'` → break (unchanged)
- `result.rejection === 'notViable' || result.rejection === 'drawDeadEnd'` → extend retry budget (unchanged)
- Post-completion floating shapes still arrive as `drawDeadEnd` via the layer-2 mapping above (retry-eligible, as before)

Document the confirmation in the commit message or PR. Do not modify `prepare-playable-moves.ts`.

## Files to Touch

- `packages/engine/src/kernel/playable-candidate.ts` (modify)

## Out of Scope

- `legal-moves.ts` migration (ticket 002)
- Any change to `packages/engine/src/agents/prepare-playable-moves.ts`
- Any change to `completeTemplateMove` or `TemplateCompletionResult`
- Any change to `probeMoveViability`
- New tests (ticket 004)
- Renaming or extending `PlayableCandidateClassification` union labels

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/kernel/completion-contract-invariants.test.ts` green — Spec 16 client-boundary invariant (`structurallyUnsatisfiable` not retried) unchanged.
2. `packages/engine/test/integration/fitl-policy-agent.test.ts` green — seed 17 outcome-policy dead-end recovery.
3. `packages/engine/test/integration/fitl-events-sihanouk.test.ts` green — seed 1009 Rally/March continuation.
4. `packages/engine/test/unit/sim/simulator-no-playable-moves.test.ts` green — `agentStuck` remains rejected at TypeScript and Zod layers (Spec 132 preservation).
5. `packages/engine/test/unit/agents/policy-preview.test.ts` green — `notDecisionComplete` mapping preserved.
6. `packages/engine/test/unit/agents/policy-agent.test.ts` green — including the `previewFailureReason === 'notDecisionComplete'` assertion at line 1065.
7. `packages/engine/test/unit/agents/policy-eval.test.ts` green.
8. `packages/engine/test/integration/classified-move-parity.test.ts` green.
9. Full engine suite: `pnpm turbo test`.

### Invariants

1. `PlayableCandidateClassification` union shape and rejection labels unchanged: `'structurallyUnsatisfiable' | 'drawDeadEnd' | 'notViable' | 'notDecisionComplete'`.
2. `prepare-playable-moves.ts:295-310` retry-budget decisions are byte-equal to pre-migration: `structurallyUnsatisfiable` → break; `notViable` / `drawDeadEnd` → retry within `NOT_VIABLE_RETRY_CAP`.
3. Post-completion floating shape mapping preserved: `classifyCompletedTemplateMove` continues to surface these as `drawDeadEnd` (retry-eligible).
4. Determinism preserved across the preparation pipeline.
5. No mutation of `def`, `state`, or `move` by the migrated functions.

## Test Plan

### New/Modified Tests

1. No new tests introduced by this ticket. Existing coverage in `policy-preview.test.ts`, `policy-agent.test.ts`, `policy-eval.test.ts`, and `completion-contract-invariants.test.ts` exercises every rejection path.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/completion-contract-invariants.test.js`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-policy-agent.test.js`
4. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-events-sihanouk.test.js`
5. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/sim/simulator-no-playable-moves.test.js`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`

## Outcome

- Completed on 2026-04-17.
- Replaced the two inline admissibility checks in `packages/engine/src/kernel/playable-candidate.ts` with calls to the shared `classifyMoveAdmissibility(def, state, move, viability, runtime?)` classifier from ticket 001.
- Preserved the pre-completion client-boundary policy exactly: non-stochastic pending shapes still reject as `notDecisionComplete`, while non-viable probe failures still reject as `notViable`.
- Preserved the post-completion retry policy exactly: any inadmissible or non-stochastic pending post-completion shape still maps to `drawDeadEnd`, keeping `prepare-playable-moves.ts` retry semantics unchanged without modifying that file.
- Added one defensive runtime assertion for the `playableStochastic` branch so the declared return type remains aligned with the viable incomplete stochastic contract.
- No schema, generated-artifact, or cross-package surface changes were required.

## Verification Run

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/completion-contract-invariants.test.js`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview.test.js`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-agent.test.js`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-eval.test.js`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/sim/simulator-no-playable-moves.test.js`
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/classified-move-parity.test.js`
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-policy-agent.test.js`
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-events-sihanouk.test.js`
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo lint`
- `pnpm turbo typecheck`
- `pnpm turbo test`
