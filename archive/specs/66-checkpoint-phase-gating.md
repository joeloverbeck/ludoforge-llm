# Spec 66 — Checkpoint Phase Gating

- **Status**: COMPLETED
- **Priority**: High
- **Complexity**: Low-Medium
- **Dependencies**: None

## Problem

The engine evaluates `duringCoup` victory checkpoints after **every phase transition** within a Coup round, not just during the designated victory-check phase. This produces unlawful game states where a faction crosses its victory threshold during a later Coup phase (e.g., VC agitation during Support) and the game terminates before the remaining Coup phases (Redeploy, Commitment, Reset) execute.

### Root Cause

In `packages/engine/src/kernel/phase-advance.ts`, the phase-advance loop calls `terminalResult()` after every phase transition:

```typescript
while (terminalResult(def, nextState, cachedRuntime) === null) { ... }
```

`terminalResult()` calls `evaluateVictory()` in `terminal.ts`, which scans ALL `duringCoup` checkpoints whose `when` condition is true. The checkpoints' only guard is "is a Coup card in the played zone" — which remains true throughout the entire Coup round. There is no mechanism to restrict checkpoint evaluation to a specific Coup phase.

### Impact

In Fire in the Lake, the rules (Section 6.1, 7.2) are explicit: victory is checked **once** at the start of the Coup round. If no faction wins, the entire Coup plays out (Resources → Support → Redeploy → Commitment → Reset) without re-checking. The only other game-end within a Coup is at the end of Redeploy on the final round (rule 6.4.5), determined by margin ranking (7.3), not by threshold crossing.

The current engine behavior means:
- Games terminate prematurely when agitation/pacification/redeploy moves cause threshold crossings.
- Redeploy, Commitment, and Reset phases may never execute.
- All prior simulation results are potentially invalid if any game ended via a mid-Coup threshold crossing rather than at the designated Victory phase.

## Proposed Solution

### 1. Add optional `phases` field to checkpoint schema

Add an optional `phases` field to the `CheckpointDef` type. When present, the checkpoint is only evaluated when `state.currentPhase` is in the specified list. When absent, the checkpoint is evaluated on every phase transition (preserving backward compatibility for games that don't need phase gating).

This is game-agnostic (Foundation 1): the game spec declares which phases a checkpoint applies to; the engine enforces the constraint without knowing anything about FITL's coup structure.

**Type change** (in `packages/engine/src/kernel/types-victory.ts`):

```typescript
interface VictoryCheckpointDef {
  readonly id: string;
  readonly seat: string;
  readonly timing: VictoryTiming;
  readonly phases?: readonly string[];  // NEW: only evaluate when currentPhase is in this list
  readonly when: ConditionAST;
}
```

**Zod schema update** (in `packages/engine/src/kernel/schemas-extensions.ts`): Add `phases` as an optional array of strings to `VictoryCheckpointSchema`.

### 2. Update `evaluateVictory()` in `terminal.ts`

When scanning checkpoints, filter out any checkpoint whose `phases` array is defined and does not include `state.currentPhase`. The function signature already receives `state`, so `state.currentPhase` is available.

```typescript
// Before (current):
const duringCheckpoint = checkpoints.find(
  (checkpoint) => checkpoint.timing === 'duringCoup' && evaluateConditionWithCache(checkpoint.when, baseCtx),
);

// After (proposed):
const duringCheckpoint = checkpoints.find(
  (checkpoint) =>
    checkpoint.timing === 'duringCoup' &&
    (checkpoint.phases === undefined || checkpoint.phases.includes(state.currentPhase)) &&
    evaluateConditionWithCache(checkpoint.when, baseCtx),
);
```

Apply the same gating to `finalCoup` checkpoints.

### 3. Update FITL game data (`90-terminal.md`)

Add `phases: [coupVictory]` to each of the four `duringCoup` checkpoints (us-victory, arvn-victory, nva-victory, vc-victory). This ensures they are only evaluated during the `coupVictory` phase, matching rule 6.1.

The `finalCoup` checkpoint (`final-coup-ranking`) should get `phases: [coupRedeploy]` to match rule 6.4.5 — the game ends after Redeploy on the final round, and victory is determined by margin.

```yaml
checkpoints:
  - id: us-victory
    seat: 'us'
    timing: duringCoup
    phases: [coupVictory]
    when: ...
```

### 4. Compiler validation

The compiler should validate that every phase referenced in a checkpoint's `phases` array exists in the game's `turnStructure.phases` or `coupPlan.phases`. Unknown phase IDs are a compile-time error. The existing `validateTerminal()` function in `packages/engine/src/kernel/validate-gamedef-extensions.ts` is the insertion point for this validation.

### 5. Remove the isCoup guard from checkpoint conditions

Currently, each `duringCoup` checkpoint condition includes a guard checking that a Coup card is in the played zone. With phase gating, this guard is redundant — the checkpoint will only be evaluated during `coupVictory`, which only runs during a Coup round. The guard should be removed to simplify the conditions and eliminate a potential source of desynchronization.

However, this removal is **optional** and low-priority. The guard is harmless (just redundant). It can be cleaned up in a follow-up if preferred.

## Testing Requirements

### Unit tests (kernel)

1. **Phase-gated checkpoint is skipped in wrong phase**: Create a GameDef with a `duringCoup` checkpoint with `phases: [coupVictory]`. Advance to a non-`coupVictory` coup phase where the checkpoint's `when` condition is true. Assert `terminalResult()` returns `null`.

2. **Phase-gated checkpoint fires in correct phase**: Same GameDef, but advance to `coupVictory` where the condition is true. Assert `terminalResult()` returns the expected victory result.

3. **Ungated checkpoint fires in any phase (backward compat)**: Create a checkpoint without `phases`. Assert it fires regardless of `currentPhase`, preserving existing behavior for games that don't use phase gating.

4. **Multiple checkpoints, mixed gating**: One gated, one ungated. Verify the ungated one can still fire during phases where the gated one is suppressed.

5. **`finalCoup` checkpoint respects phase gating**: Create a `finalCoup` checkpoint with `phases: [coupRedeploy]`. Verify it only fires during `coupRedeploy`.

### Compiler validation tests

6. **Valid phases accepted**: Checkpoint referencing phases that exist in `coupPlan.phases` compiles without error.

7. **Invalid phase rejected**: Checkpoint referencing a non-existent phase produces a compile-time error with a clear message.

### Integration tests (FITL)

8. **VC agitation during Support does not end game**: Run a FITL simulation where VC crosses its threshold during agitation (coupSupport phase). Assert the game does NOT terminate after Support — it proceeds through Redeploy, Commitment, and Reset.

9. **Victory check at coupVictory works**: Run a FITL simulation where a faction meets its condition at the start of the Coup (coupVictory phase). Assert the game ends immediately without proceeding to Resources/Support.

10. **Final Coup margin ranking**: Run a FITL simulation reaching the final Coup card where nobody wins at the Victory check. Assert the game plays through all phases including Redeploy, then ends with margin-based ranking per rule 7.3.

11. **Redeploy executes when no faction wins at victory check**: Run a FITL simulation to a non-final Coup where nobody wins at 6.1. Assert that Redeploy actions appear in the game trace.

### Edge cases

12. **Checkpoint with empty phases array**: Treated as "never fires" (no phase matches). Should produce a compiler warning.

13. **All factions below threshold at victory check, one above after Resources**: Faction gains resources or Econ changes push them over threshold during coupResources. Assert game does NOT terminate — victory is only checked at coupVictory.

14. **Determinism**: Same seed produces identical results before and after the fix, for games where no mid-Coup threshold crossing was occurring. (Games where it WAS occurring will now correctly produce different results.)

## Affected Files

### Engine (Tier 2 changes)
- `packages/engine/src/kernel/types-victory.ts` — Add `phases` to `VictoryCheckpointDef`
- `packages/engine/src/kernel/schemas-extensions.ts` — Update `VictoryCheckpointSchema` Zod schema
- `packages/engine/src/kernel/terminal.ts` — Phase-gating logic in `evaluateVictory()`
- `packages/engine/src/kernel/validate-gamedef-extensions.ts` — Phase reference validation in `validateTerminal()`

### Game data
- `data/games/fire-in-the-lake/90-terminal.md` — Add `phases` to all checkpoints

### Tests
- `packages/engine/test/integration/fitl-coup-victory-phase-gating.test.ts` — **Already exists** with 3 tests: victory halt at coupVictory, phase advancement when no victory, final-coup ranking after coupRedeploy. Covers test cases 9 and partially 8/11 from the Testing Requirements below.
- New unit tests for phase-gated terminal evaluation (test cases 1-5: phase skip, phase fire, ungated backward compat, mixed gating, finalCoup gating)
- New compiler validation tests for phase references (test cases 6-7: valid phases accepted, invalid phase rejected)
- Additional FITL integration tests if gaps remain after evaluating existing test coverage (test cases 10, 12-14)
- Update any existing tests that assert checkpoint behavior without phase gating

## Alignment with FOUNDATIONS.md

| Foundation | Alignment |
|---|---|
| 1. Engine Agnosticism | `phases` is a generic schema field — no FITL-specific logic in engine code |
| 2. Evolution-First | Checkpoint behavior is fully declarative in YAML |
| 7. Specs Are Data | No code in game spec — just a new declarative field |
| 8. Determinism | No impact on determinism — same inputs → same outputs |
| 10. Bounded Computation | Phase list is finite and enumerable |
| 11. Immutability | No mutation changes — `evaluateVictory` is a pure read |
| 12. Compiler-Kernel Boundary | Compiler validates phase references exist; kernel enforces phase gating at runtime |
| 14. No Backwards Compat | Optional field with backward-compatible default (absent = fire always). No shims needed |
| 15. Architectural Completeness | Addresses root cause (unconstrained checkpoint evaluation) rather than symptom |
| 16. Testing as Proof | Comprehensive test plan covering unit, integration, and edge cases |

## Outcome

- Completed on 2026-04-11.
- Implemented the generic checkpoint `phases` field across kernel/runtime, validator, and CNL/GameSpecDoc victory lowering so authored YAML phase gates survive into compiled `GameDef` artifacts.
- Updated FITL terminal checkpoint data to gate `duringCoup` checks to `coupVictory` and final-Coup ranking to `coupRedeploy`.
- Verified with focused engine build/test plus full `pnpm turbo test`, `pnpm turbo typecheck`, and `pnpm turbo lint`.
