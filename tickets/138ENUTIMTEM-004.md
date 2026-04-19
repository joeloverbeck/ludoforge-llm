# 138ENUTIMTEM-004: Delete noPlayableMoveCompletion stop reason and error class (Foundation 14 atomic cut)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `SimulationStopReason` union, simulator, trace-eval, degeneracy flags, schemas, agent error class, test fixtures
**Deps**: `archive/tickets/138ENUTIMTEM-006.md`

## Problem

Per Spec 138 Goal G4 and Design §D6, once the corrected guided completion contract lands in 138ENUTIMTEM-006 the `noPlayableMoveCompletion` stop reason, the `NoPlayableMovesAfterPreparationError` error class, and the `DegeneracyFlag.NO_PLAYABLE_MOVE_COMPLETION` enum value become unreachable for any spec that passes compilation and validation. Foundation #14 (No Backwards Compatibility) requires deleting these symbols in the same change — no compatibility shims, no deprecated fallbacks. This ticket performs the atomic cut across engine types, schemas, simulator, trace-eval, the agent error module, and all test consumers, then proves the deletion with T3 seed-corpus bounded termination.

## Assumption Reassessment (2026-04-19)

1. `SimulationStopReason` union is defined at `packages/engine/src/kernel/types-core.ts:1727–1731`. Four members: `'terminal' | 'maxTurns' | 'noLegalMoves' | 'noPlayableMoveCompletion'`. Post-ticket: three members.
2. `SimulationStopReasonSchema` is at `packages/engine/src/kernel/schemas-core.ts:1601–1606`. Delete the `z.literal('noPlayableMoveCompletion')` row.
3. `DegeneracyFlag.NO_PLAYABLE_MOVE_COMPLETION` is at `packages/engine/src/kernel/diagnostics.ts:39`. Remove the enum member.
4. Simulator emits the stop reason at `packages/engine/src/sim/simulator.ts:129–135` inside the agent `chooseMove` try/catch. Post-deletion: the catch branch is unreachable (the error class no longer exists); remove the entire `if (isNoPlayableMovesAfterPreparationError(error))` branch and let any unexpected error propagate.
5. Trace-eval flag mapping is at `packages/engine/src/sim/trace-eval.ts:244–246`. Remove the branch.
6. `NoPlayableMovesAfterPreparationError` class + `isNoPlayableMovesAfterPreparationError` helper are at `packages/engine/src/agents/no-playable-move.ts:3–20`. The file also exports `BuiltinAgentId` (line 1). Post-deletion: keep the file with only `BuiltinAgentId` OR fold `BuiltinAgentId` into `packages/engine/src/agents/index.ts` and delete the file. Per Foundation #14 "unused code is deleted, not commented out" — if `BuiltinAgentId` has no other callers in `agents/`, fold and delete.
7. Schema JSON files: `packages/engine/schemas/Trace.schema.json:5136` and `packages/engine/schemas/EvalReport.schema.json:54, 89, 136`. These are generated artifacts — confirm they are regenerated via `pnpm turbo schema:artifacts`.
8. Tests referencing the stop reason:
   - `packages/engine/test/integration/fitl-canary-bounded-termination.test.ts:14, 32` — `ALLOWED_STOP_REASONS` set.
   - `packages/engine/test/unit/sim/simulator-no-playable-moves.test.ts` — entire file tests the deleted behavior; delete the file (Foundation #14).
   - `packages/engine/test/unit/schemas-top-level.test.ts:1613` — stop-reason enumeration.
   - `packages/engine/test/unit/types-foundation.test.ts:49` — degeneracy flag enumeration.
   - `packages/engine/test/integration/fitl-seed-1002-regression.test.ts` — `ALLOWED_STOP_REASONS` includes `noPlayableMoveCompletion` per Spec 137's distillation (confirm via Grep during implementation; may need update).
   - `packages/engine/test/integration/fitl-seed-1005-1010-1013-regression.test.ts` — same pattern.
9. `PolicyAgent.chooseMove` at `packages/engine/src/agents/policy-agent.ts:128` throws `NoPlayableMovesAfterPreparationError`. With 138ENUTIMTEM-006's corrected guided completion in place this throw is unreachable — replace it with `throw new Error(...)` with a kernel-bug-signal message, since per Foundation #14 the named class must go.

## Architecture Check

1. Foundation #14 atomic-cut: the deletion is mechanically uniform across ~12 sites — the same symbol removed from every reference. Large effort rating is justified by site count; reviewable-as-one-diff justification is the uniformity (Foundation 14 exception per ticket authoring guidance).
2. Foundation #15 architectural completeness: the deletion closes the enumerate-vs-sampler design gap at the type level — with the stop reason gone, no future regression can "legitimately" surface it as an outcome.
3. Foundation #5 one rules protocol: after the cut, the simulator has exactly three bounded stop reasons: `terminal` (game ended under rules), `maxTurns` (session bound), `noLegalMoves` (deterministic dead-end). No "agent couldn't prepare" path exists as a legitimate terminal — that's now a kernel bug surfaced via the guided-completion tripwire introduced by 138ENUTIMTEM-006.
4. The simulator's `try/catch` around `agent.chooseMove` becomes simpler: any throw is a genuine error (kernel bug, contract violation), not an accepted stop condition. This is an architectural improvement: the catch previously conflated "agent couldn't find a playable move" (a legitimate but rare corner) with "kernel bug". Post-ticket these cannot be conflated.
5. No runner worker bridge impact — the runner does not introspect `SimulationStopReason` members; it accepts any string from the engine via the structured-clone contract. Verified via grep during Step 2 reassessment.

## What to Change

### 1. Delete from `SimulationStopReason` union

In `packages/engine/src/kernel/types-core.ts`:
```ts
export type SimulationStopReason =
  | 'terminal'
  | 'maxTurns'
  | 'noLegalMoves';
  // DELETED: | 'noPlayableMoveCompletion';
```

### 2. Delete from `SimulationStopReasonSchema`

In `packages/engine/src/kernel/schemas-core.ts`:
```ts
export const SimulationStopReasonSchema = z.union([
  z.literal('terminal'),
  z.literal('maxTurns'),
  z.literal('noLegalMoves'),
  // DELETED: z.literal('noPlayableMoveCompletion'),
]);
```

### 3. Delete from `DegeneracyFlag` enum

In `packages/engine/src/kernel/diagnostics.ts:39`, remove the `NO_PLAYABLE_MOVE_COMPLETION = 'NO_PLAYABLE_MOVE_COMPLETION'` line.

### 4. Simplify simulator catch

In `packages/engine/src/sim/simulator.ts:120–137`, remove the `isNoPlayableMovesAfterPreparationError`-guarded branch. The simplified structure:
```ts
try {
  selected = agent.chooseMove({ ... });
} catch (error) {
  perfEnd(profiler, 'simAgentChooseMove', t0_agent);
  throw error;  // no longer a legitimate stop condition
}
```

### 5. Delete trace-eval mapping

In `packages/engine/src/sim/trace-eval.ts:244–246`, remove the `noPlayableMoveCompletion` → `NO_PLAYABLE_MOVE_COMPLETION` branch.

### 6. Delete agent error class

Delete `packages/engine/src/agents/no-playable-move.ts` IF `BuiltinAgentId` can be moved elsewhere; otherwise keep the file with only `BuiltinAgentId`. Preferred path: fold `BuiltinAgentId` into `packages/engine/src/agents/index.ts` and delete the file (reduces module count).

In `packages/engine/src/agents/policy-agent.ts`, replace `throw new NoPlayableMovesAfterPreparationError('policy', input.legalMoves.length)` at line 128 with a plain `throw new Error(...)` carrying a descriptive kernel-bug message. Same for `greedy-agent.ts` and `random-agent.ts` if they throw this class (verify via grep during implementation).

### 7. Regenerate schema artifacts

Run `pnpm turbo schema:artifacts` (or the project's canonical schema regeneration command) to update `packages/engine/schemas/Trace.schema.json` and `EvalReport.schema.json`. Do not hand-edit the JSON — regenerate from source of truth.

### 8. Update test consumers

- `packages/engine/test/integration/fitl-canary-bounded-termination.test.ts:14, 32`: remove `'noPlayableMoveCompletion'` from `ALLOWED_STOP_REASONS`.
- `packages/engine/test/unit/sim/simulator-no-playable-moves.test.ts`: delete the file — its entire subject of test is deleted behavior.
- `packages/engine/test/unit/schemas-top-level.test.ts:1613`: remove `'noPlayableMoveCompletion'` from the enumerated stop-reason list.
- `packages/engine/test/unit/types-foundation.test.ts:49`: remove `'NO_PLAYABLE_MOVE_COMPLETION'` from the degeneracy flag enumeration.
- `packages/engine/test/integration/fitl-seed-1002-regression.test.ts` and `fitl-seed-1005-1010-1013-regression.test.ts`: remove `'noPlayableMoveCompletion'` from any `ALLOWED_STOP_REASONS` set (confirm via grep; update per Spec 137's distilled property form).

### 9. T3 — Seed-corpus bounded termination

New file `packages/engine/test/integration/fitl-seed-classifier-coverage.test.ts`:
- Run FITL arvn seeds 1002 and 1010 through `runGame` at max-turns=200 using the guided sampler (default post-003).
- Assert `trace.stopReason ∈ {'terminal', 'maxTurns', 'noLegalMoves'}` and `trace.moves.length > 0`.
- Do NOT pin a specific stop reason per seed (property form per Spec 137 — any legitimate bounded stop reason is acceptable).
- File-top marker: `// @test-class: architectural-invariant`. No `@witness:` — the property holds across any legitimate trajectory.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — remove union member)
- `packages/engine/src/kernel/schemas-core.ts` (modify — remove schema literal)
- `packages/engine/src/kernel/diagnostics.ts` (modify — remove enum member)
- `packages/engine/src/sim/simulator.ts` (modify — simplify catch)
- `packages/engine/src/sim/trace-eval.ts` (modify — remove flag mapping)
- `packages/engine/src/agents/no-playable-move.ts` (delete — after folding `BuiltinAgentId`)
- `packages/engine/src/agents/index.ts` (modify — absorb `BuiltinAgentId` if needed)
- `packages/engine/src/agents/policy-agent.ts` (modify — replace throw class)
- `packages/engine/src/agents/greedy-agent.ts` (modify if uses the class)
- `packages/engine/src/agents/random-agent.ts` (modify if uses the class)
- `packages/engine/schemas/Trace.schema.json` (regenerate)
- `packages/engine/schemas/EvalReport.schema.json` (regenerate)
- `packages/engine/test/integration/fitl-canary-bounded-termination.test.ts` (modify)
- `packages/engine/test/unit/sim/simulator-no-playable-moves.test.ts` (delete)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify)
- `packages/engine/test/unit/types-foundation.test.ts` (modify)
- `packages/engine/test/integration/fitl-seed-1002-regression.test.ts` (modify if applicable)
- `packages/engine/test/integration/fitl-seed-1005-1010-1013-regression.test.ts` (modify if applicable)
- `packages/engine/test/integration/fitl-seed-classifier-coverage.test.ts` (new — T3)

## Out of Scope

- No caching changes (deferred to 138ENUTIMTEM-005).
- No new runtime warnings beyond what 138ENUTIMTEM-006 introduces.
- No changes to `classifyDecisionSequenceSatisfiability` or `preparePlayableMoves` behavior beyond deleting the error-class throw sites.
- No runner worker bridge updates — confirmed zero-touch by the 138ENUTIMTEM-006 reassessment.

## Acceptance Criteria

### Tests That Must Pass

1. T3 integration test passes: seeds 1002 and 1010 terminate under an allowed stop reason with `moves.length > 0`.
2. `pnpm turbo build test lint typecheck` green across the full workspace.
3. `pnpm turbo schema:artifacts` produces updated JSON schemas with no `noPlayableMoveCompletion` literal.
4. FITL canary bounded termination test passes with the reduced `ALLOWED_STOP_REASONS` set.
5. All existing simulator, trace-eval, schema, and types-foundation tests pass under the reduced stop-reason union.
6. No grep hits for `noPlayableMoveCompletion`, `NoPlayableMovesAfterPreparationError`, `NO_PLAYABLE_MOVE_COMPLETION` outside `archive/` and `specs/138*` / `archive/specs/132*` / `archive/tickets/` historical references.

### Invariants

1. `SimulationStopReason` has exactly three members: `'terminal' | 'maxTurns' | 'noLegalMoves'`.
2. `packages/engine/src/agents/no-playable-move.ts` either does not exist or contains only `BuiltinAgentId`.
3. `DegeneracyFlag` enum does not contain `NO_PLAYABLE_MOVE_COMPLETION`.
4. Schema JSON artifacts do not enumerate `'noPlayableMoveCompletion'` as a valid stop reason.
5. No production code references `NoPlayableMovesAfterPreparationError` or `isNoPlayableMovesAfterPreparationError`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-seed-classifier-coverage.test.ts` (new) — T3 post-deletion seed-corpus verification.
2. `packages/engine/test/integration/fitl-canary-bounded-termination.test.ts` (modify) — update `ALLOWED_STOP_REASONS`.
3. `packages/engine/test/unit/sim/simulator-no-playable-moves.test.ts` (delete).
4. `packages/engine/test/unit/schemas-top-level.test.ts` (modify) — update enumerated stop-reason list.
5. `packages/engine/test/unit/types-foundation.test.ts` (modify) — update degeneracy flag list.
6. `packages/engine/test/integration/fitl-seed-1002-regression.test.ts` (modify if applicable).
7. `packages/engine/test/integration/fitl-seed-1005-1010-1013-regression.test.ts` (modify if applicable).

### Commands

1. `pnpm turbo build` (ensure types compile after union deletion)
2. `pnpm turbo schema:artifacts` (regenerate schema JSON)
3. `pnpm turbo test lint typecheck`
4. Manual post-implementation grep: `grep -r "noPlayableMoveCompletion\|NoPlayableMovesAfterPreparationError\|NO_PLAYABLE_MOVE_COMPLETION" packages/ --include="*.ts" --include="*.json"` — expect zero hits outside schemas generated from source.
