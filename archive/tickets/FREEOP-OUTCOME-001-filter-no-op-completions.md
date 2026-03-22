# FREEOP-OUTCOME-001: Reject no-op free-operation completions before agents can select them

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel/apply-move.ts, kernel/free-operation-viability.ts, kernel/legal-moves.ts, and agent-facing consumers of move viability
**Deps**: None

## Problem

When a free-operation grant has `outcomePolicy: mustChangeGameplayState`, the kernel currently exposes two inconsistent views of legality:

1. `legalMoves` can still enumerate a required free-operation template even when the current state has no completion that can satisfy the outcome policy.
2. `probeMoveViability` / `evaluatePlayableMoveCandidate` can still classify a completed no-op free operation as playable, even though `applyMove` will reject it as `freeOperationOutcomePolicyFailed`.

This lets agent code select a move the kernel already knows must be rejected at execution time.

**Concrete scenario** (FITL, seed 17, observed 2026-03-22):
1. Turn 0: ARVN plays `card-75` (`Sihanouk`, shaded), which grants VC a required free Rally in Cambodia followed by a required free March tied to the spaces affected by the Rally.
2. Turn 1: VC takes the free Rally.
3. Turn 2: the only legal move exposed to the agent is the required free `march` template.
4. `evaluatePlayableMoveCandidate` completes that template with a destination selection and empty mover selections:
   - `$targetSpaces = ["kien-giang-an-xuyen:none"]`
   - `$movingGuerrillas = []`
   - `$movingTroops = []`
5. `probeMoveViability` treats that completed move as viable/complete.
6. `applyMove` then rejects the same move with `IllegalMoveError: freeOperationOutcomePolicyFailed`.

**Rules basis** (FITL 5.1.3): "An executed Event's text that can be implemented must be. If not all of its text can be carried out, implement that which can."  A march with zero pieces cannot be carried out — it should be skipped, not attempted and then rejected.

## Assumption Reassessment (2026-03-22)

1. `evaluatePlayableMoveCandidate` does not directly enforce outcome policies; it delegates completed-move classification to `probeMoveViability`.
2. `probeMoveViability` currently checks structural legality and decision-sequence completeness, but it does NOT reject completed free-operation moves that fail `mustChangeGameplayState`.
3. `applyMove` does enforce `mustChangeGameplayState` after action execution by comparing `materialGameplayStateProjection` before vs after.
4. `free-operation-viability.ts` already contains a dedicated probe path (`doesCompletedProbeMoveChangeGameplayState` / `hasLegalCompletedProbeMove`) that reasons about whether some completed free-operation move would materially change gameplay state.
5. `legalMoves` does not currently require that a pending free-operation template have at least one completion that survives the outcome policy in the current state. Because of that, a required free-operation window may still expose a template that no agent can legally execute.
6. If agent-side preparation filters every completion of such a template, the simulator does NOT automatically stop via `noLegalMoves`; `legalMoves` is still non-empty, so agent code receives an empty playable set and will fail higher up the stack. The root fix therefore cannot live only in agent preparation.

## Architecture Check

1. The authoritative legality fix belongs in the kernel, not only in agent preparation.
2. Completed moves that predictably fail `mustChangeGameplayState` should be rejected by shared move-viability logic before they are presented as playable candidates.
3. Pending required free-operation templates that have no legal completion in the current state should not be enumerated by `legalMoves`; otherwise agents still receive a syntactically legal but semantically impossible obligation.
4. This is engine-agnostic: `mustChangeGameplayState` is a generic free-operation outcome policy, not FITL-specific.
5. No backwards-compatibility shims or aliases. The legality model should have one current truth: moves that will definitely fail the required outcome policy are not viable.

## What to Change

### 1. Move outcome-policy viability into shared kernel legality

Extract the "would this authorized free operation satisfy its strongest applicable outcome policy?" logic into a shared kernel helper, then use it from:

- `applyMove` for authoritative enforcement
- `probeMoveViability` for completed-move preflight legality
- `free-operation-viability.ts` to avoid duplicate material-state-change probing code

Recommendation: use the dedicated shared-helper path, not agent-local `applyMove` dry-runs. The codebase already has kernel-level outcome-policy probing in `free-operation-viability.ts`; the clean fix is to consolidate around that capability rather than layering another partial policy check in `preparePlayableMoves`.

### 2. Tighten pending free-operation legal-move enumeration

When `legalMoves` enumerates a pending required free-operation template, require proof that the template has at least one completable move that is legal in the current state and satisfies any required `mustChangeGameplayState` policy. If not, do not enumerate the template.

This closes the gap where a required free-operation window remains "legal" even though no execution path can succeed.

### 3. Keep agent preparation simple

`preparePlayableMoves` should continue to rely on shared kernel viability classification. It may not need direct policy-specific logic once kernel probing is corrected. If a small agent-layer guard is still useful after the kernel fix, keep it as a thin consumer of shared viability results rather than adding new policy semantics there.

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify) — extract/reuse shared free-operation outcome-policy viability logic
- `packages/engine/src/kernel/free-operation-viability.ts` (modify) — reuse the shared helper instead of maintaining a private duplicate path
- `packages/engine/src/kernel/legal-moves.ts` (modify) — suppress required free-operation templates that have no legal completion in the current state
- `packages/engine/src/agents/prepare-playable-moves.ts` (modify only if still needed) — continue consuming shared viability results
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify) — add viability/probe regression coverage around completed no-op free ops
- `packages/engine/test/unit/kernel/legal-moves.test.ts` and/or `packages/engine/test/unit/prepare-playable-moves.test.ts` (modify) — assert impossible required free-op templates are not surfaced as playable
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify) — add seed 17 regression coverage

## Out of Scope

- Changing the `chooseN min: 0` semantics in the march profile — this is correct for normal (non-free-operation) marches where a player may choose not to move pieces.
- Changing the Sihanouk event spec — the `mustChangeGameplayState` outcome policy is correctly specified.
- Fixing the underlying game-state issue of VC having zero available pieces — this is a valid game state.

## Acceptance Criteria

### Tests That Must Pass

1. Seed 17, 5-turn FITL policy self-play completes without `IllegalMoveError` or policy-evaluation empty-candidate failures.
2. Seed 11, 5-turn FITL policy self-play continues to pass (no regression from zone-filter fix).
3. Completed free-operation moves that predictably fail `mustChangeGameplayState` are rejected by shared viability probing before `applyMove`.
4. Required free-operation windows do not expose templates that have no legal completion in the current state.
4. Existing suite: `pnpm turbo test`

### Invariants

1. `evaluatePlayableMoveCandidate` remains a template resolver plus shared viability classifier; it must not grow a private outcome-policy implementation.
2. `applyMove` remains the authoritative enforcement point. Earlier viability checks are preflight consistency, not a replacement.
3. Foundation #1 (Engine Agnosticism): the fix operates on generic `mustChangeGameplayState` policy, not FITL-specific logic.
4. Foundation #5 (Determinism): same seed + same actions = same result.  Filtering out no-op completions is deterministic.
5. Foundation #10 (Architectural Completeness): the fix addresses the root cause in shared kernel legality and free-operation enumeration, not as an agent-only symptom patch.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — add test that `probeMoveViability` rejects a completed free operation that would fail `mustChangeGameplayState`
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` and/or `packages/engine/test/unit/prepare-playable-moves.test.ts` — add regression covering a required free-operation template with no valid completion in the current state
3. `packages/engine/test/integration/fitl-policy-agent.test.ts` — add seed 17 to fixed-seed self-play coverage

### Commands

1. `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
2. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
3. `node --test packages/engine/dist/test/unit/prepare-playable-moves.test.js`
4. `node --test packages/engine/dist/test/integration/fitl-policy-agent.test.js`
5. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-22
- What actually changed:
  - Added shared kernel outcome-policy helpers so `applyMove`, probe viability, and free-operation viability all resolve the strongest required `mustChangeGameplayState` grant the same way.
  - `probeMoveViability` now rejects completed free-operation moves that would fail `mustChangeGameplayState`, so agents no longer see those no-op completions as playable.
  - `legalMoves` now suppresses pending free-operation templates when a satisfiable decision path exists but no completion can satisfy the required outcome policy in the current state.
  - Added seed `17` FITL policy-agent regression coverage plus unit coverage for probe viability, legal move enumeration, and the new export-surface contracts.
- Deviations from original plan:
  - The fix did not land in `preparePlayableMoves`. Reassessment showed the root cause lived in shared kernel legality and free-operation enumeration, so the implementation moved there instead.
  - The final solution added canonical kernel exports to preserve one source of truth for outcome-policy and decision-admission behavior.
- Verification results:
  - `node --test packages/engine/dist/test/unit/kernel/apply-move.test.js`
  - `node packages/engine/dist/test/unit/kernel/legal-moves.test.js`
  - `node --test packages/engine/dist/test/integration/fitl-policy-agent.test.js`
  - `pnpm turbo test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
