# 134UNIMOVLEG-001: Create `evaluateMoveLegality` predicate module and unit tests

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module, unit tests
**Deps**: `specs/134-unified-move-legality-predicate.md`

## Problem

The kernel currently has three sites that each independently decide free-operation outcome-policy legality by duplicating grant-resolution + completion-legality / state-change logic (`apply-move.ts:1912–1963`, `apply-move.ts:284–301`, `move-admissibility.ts:84–110`). Before those three sites can be unified, a single pure predicate must exist for them to consume. This ticket introduces that predicate as a pure, tested module — production callers are wired in ticket 002. Creating the module first lets reviewers reason about the predicate's correctness in isolation before evaluating the atomic migration diff.

## Assumption Reassessment (2026-04-18)

1. Verified during `/reassess-spec` on `specs/134-unified-move-legality-predicate.md` (same session): `packages/engine/src/kernel/move-legality-predicate.ts` does not exist, `packages/engine/test/unit/kernel/evaluate-move-legality.test.ts` does not exist, and `LegalityVerdict` type name returns zero grep hits across `packages/engine/`.
2. Existing primitives verified at these locations: `resolveStrongestRequiredFreeOperationOutcomeGrant` at `free-operation-outcome-policy.ts:25`; `resolveStrongestPotentialRequiredFreeOperationOutcomeGrant` at `free-operation-outcome-policy.ts:40`; `hasLegalCompletedFreeOperationMoveInCurrentState` at `free-operation-viability.ts:719`; `doesCompletedProbeMoveChangeGameplayState` at `free-operation-viability.ts:440`; `IllegalMoveReason` enum at `runtime-reasons.ts:34–53`; `IllegalMoveContext` at `runtime-error.ts:147`; `illegalMoveError` at `runtime-error.ts:335,340`.
3. `FREE_OPERATION_GRANT_MATCH_EVALUATION` surface constant is the one currently passed by Sites 1 and 2; Site 3 defaults to `FREE_OPERATION_GRANT_CONSUMPTION`. Baking `FREE_OPERATION_GRANT_MATCH_EVALUATION` into the predicate aligns with the spec's §Definitions — Surface-ID discipline subsection and is the correct surface for a match-evaluation gate.

## Architecture Check

1. **Purely additive**: no existing production code is touched in this ticket. The new module stands alone with no production callers until ticket 002. This lets the predicate be reviewed for correctness in isolation — reviewers do not have to reason about the three-site migration simultaneously.
2. **Engine agnosticism (Foundation 1)**: the predicate operates on generic `GameDef`, `GameState`, `Move`, `IllegalMoveReason`, `IllegalMoveContext`. No game-specific identifiers, branches, or payloads.
3. **Determinism and purity (Foundation 8, 11)**: the predicate is a pure function of its inputs. It composes existing pure primitives (grant resolution, probe-based state-change forecast, completion-legality probe). Same `(def, state, move)` → same verdict; no mutation of inputs.
4. **No backwards-compatibility shims (Foundation 14)**: the module is new code; nothing it replaces exists yet to shim over. The legacy duplicated sites remain untouched until ticket 002, at which point they are migrated atomically.
5. **Internal branching owned by the predicate**: the complete-move vs. incomplete-move selection (dispatching between `doesCompletedProbeMoveChangeGameplayState` and `hasLegalCompletedFreeOperationMoveInCurrentState`) is implementation detail. Callers pass `state` and `move`; the predicate decides which state-change check applies.

## What to Change

### 1. New module `packages/engine/src/kernel/move-legality-predicate.ts`

Exports:

- `LegalityVerdict`:
  ```ts
  export type LegalityVerdict =
    | { readonly kind: 'legal' }
    | { readonly kind: 'illegal'; readonly reason: IllegalMoveReason; readonly context: IllegalMoveContext };
  ```
- `evaluateMoveLegality(def: GameDef, state: GameState, move: Move, runtime?: GameDefRuntime): LegalityVerdict`

Match the `runtime?` / supplemental-parameter shape to what `probeMoveViabilityRaw`, `classifyMoveAdmissibility`, and the future apply-time call site will already have in scope. The goal is to avoid forcing ticket 002's callers to fabricate arguments. The live helper contract is `createSeatResolutionContext(def, state.playerCount)`, so the predicate constructs seat resolution internally from `(def, state.playerCount)` rather than introducing a new helper signature.

Implementation outline:

1. Determine whether the move is complete in the decision-sequence sense. Mirror how `probeMoveViabilityRaw` derives `sequence.complete` today (via the decision-sequence resolution path). If the predicate cannot derive completeness from `(def, state, move)` alone, accept completeness as an explicit parameter — document the choice inline.
2. Build `seatResolution = createSeatResolutionContext(def, state.playerCount)`.
3. Resolve grants with `FREE_OPERATION_GRANT_MATCH_EVALUATION`:
   - Complete branch: `grant = resolveStrongestRequiredFreeOperationOutcomeGrant(def, state, move, seatResolution, FREE_OPERATION_GRANT_MATCH_EVALUATION)`.
   - Incomplete branch: `grant = resolveStrongestRequiredFreeOperationOutcomeGrant(...) ?? resolveStrongestPotentialRequiredFreeOperationOutcomeGrant(...)`.
   - Tolerate the same `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` exception that `resolveOutcomePolicyGrantForAdmissibility` currently handles (returns "grant not determinable" → treat as no grant). This preserves existing diagnostic routing when the zone filter cannot be evaluated.
4. If `grant === null`, return `{ kind: 'legal' }`.
5. If `grant !== null`:
   - **Complete branch**: if `doesCompletedProbeMoveChangeGameplayState(def, state, move, seatResolution)` is false, return `{ kind: 'illegal', reason: ILLEGAL_MOVE_REASONS.FREE_OPERATION_OUTCOME_POLICY_FAILED, context: { grantId: grant.grantId, outcomePolicy: 'mustChangeGameplayState' } }`. Otherwise `{ kind: 'legal' }`.
   - **Incomplete branch**: if `hasLegalCompletedFreeOperationMoveInCurrentState(def, state, move, seatResolution)` is false, return the same illegal verdict. Otherwise `{ kind: 'legal' }`.

### 2. Unit tests `packages/engine/test/unit/kernel/evaluate-move-legality.test.ts`

New test file. File-top marker: `// @test-class: architectural-invariant` — all assertions below are properties that must hold across every legitimate kernel evolution, not seed-specific witnesses.

Test cases:

1. **Legal complete move + satisfying grant**: fixture where a complete free-op move does satisfy the grant's `mustChangeGameplayState` policy. Expect `{ kind: 'legal' }`.
2. **No grant applies**: fixture where no required or potential grant matches the move. Expect `{ kind: 'legal' }` (grant-free moves are legal by default — absence of a grant does not produce `FREE_OPERATION_NOT_GRANTED`; that reason applies to different legality paths).
3. **`FREE_OPERATION_OUTCOME_POLICY_FAILED` — complete branch**: fixture with a grant matching a complete move that is a no-op (`doesCompletedProbeMoveChangeGameplayState` returns false). Expect illegal verdict with `reason === 'freeOperationOutcomePolicyFailed'`, `context.grantId` set, `context.outcomePolicy === 'mustChangeGameplayState'`.
4. **`FREE_OPERATION_OUTCOME_POLICY_FAILED` — incomplete branch**: fixture with a grant matching an incomplete move that has no legal completion changing state. Expect the same illegal verdict shape.
5. **Zone-filter tolerance**: fixture where grant resolution throws `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED`. Expect predicate treats as no-grant → `{ kind: 'legal' }`, preserving classifier behavior.
6. **Purity**: feed `Object.freeze`d `def`, `state`, `move`; invoke twice; assert identical verdicts and confirm neither input was mutated (frozen inputs would throw on mutation).

Fixture strategy: prefer minimal hand-constructed `GameDef` / `GameState` over loading a full FITL scenario when the test only needs to exercise the predicate. Reuse helpers from existing admissibility / probe tests where available.

## Files to Touch

- `packages/engine/src/kernel/move-legality-predicate.ts` (new)
- `packages/engine/src/kernel/index.ts` (export surface update)
- `packages/engine/test/unit/kernel/evaluate-move-legality.test.ts` (new)

## Out of Scope

- No changes to `apply-move.ts`, `move-admissibility.ts`, or any production call site — that is ticket 002.
- No deletion of `validateFreeOperationOutcomePolicy`, `classifyFreeOperationOutcomePolicyAdmissibility`, or `resolveOutcomePolicyGrantForAdmissibility` — that is ticket 002.
- No integration tests (three-site agreement, pre/post-apply equivalence, surface-migration regression) — those land in ticket 002 where the migrations they prove also land.
- No changes to `legal-moves.ts`, `grant-lifecycle.ts`, or `free-operation-viability.ts` — documented exempt per spec §Touched but not migrated.
- No new `IllegalMoveReason` variants; the predicate uses only existing reasons.

## Acceptance Criteria

### Tests That Must Pass

1. All 6 unit test cases in `evaluate-move-legality.test.ts` pass.
2. Purity test confirms frozen inputs don't mutate and repeated calls return identical verdicts.
3. Existing suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test` — no regressions.

### Invariants

1. **Purity**: for any frozen `(def, state, move)`, `evaluateMoveLegality` returns the same verdict across repeated invocations and never mutates its inputs.
2. **Verdict shape**: every `kind: 'illegal'` return carries a valid `reason: IllegalMoveReason` and `context: IllegalMoveContext` shape compatible with `illegalMoveError`.
3. **Surface discipline**: the module passes `FREE_OPERATION_GRANT_MATCH_EVALUATION` as the surface argument to all grant-resolution helper calls — no other surface is used.
4. **Isolation**: no production call site is migrated in this ticket. The only production-source change outside `packages/engine/src/kernel/move-legality-predicate.ts` is the additive export surface update in `packages/engine/src/kernel/index.ts`; grep for new runtime consumer sites of `evaluateMoveLegality` in `packages/engine/src/` returns zero matches until ticket 002.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/evaluate-move-legality.test.ts` (new) — covers spec §Required Proof: Unit / Kernel Proof items 1 (purity), 4 (internal branching coverage). Consumer-site reason mapping (items 2, 3) lands in ticket 002 where consumers are wired.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test` — full engine suite including the new unit tests.
2. `pnpm turbo lint && pnpm turbo typecheck` — workspace lint and typecheck.

## Outcome

- Completed: 2026-04-18
- Added `packages/engine/src/kernel/move-legality-predicate.ts` with pure `LegalityVerdict` / `evaluateMoveLegality` exports.
- Derived completeness through `resolveMoveDecisionSequence(..., { choose: () => undefined })` so the predicate mirrors the existing probe-time decision-sequence boundary.
- Kept `FREE_OPERATION_GRANT_MATCH_EVALUATION` as the only grant-resolution surface and returned the existing `FREE_OPERATION_OUTCOME_POLICY_FAILED` reason/context shape on failure.
- Preserved zone-filter tolerance by treating `FREE_OPERATION_ZONE_FILTER_EVALUATION_FAILED` as indeterminate grant matching and therefore legal for this standalone predicate module.
- Exported the module from `packages/engine/src/kernel/index.ts` so ticket 002 can consume it without adding another surface change.
- Deviations from original plan: the final boundary included the additive `packages/engine/src/kernel/index.ts` export update so the new predicate is consumable from the public kernel surface; no production caller migration landed in this ticket.

## Verification

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/evaluate-move-legality.test.js`
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo lint`
- `pnpm turbo typecheck`
