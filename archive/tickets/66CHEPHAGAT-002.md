# 66CHEPHAGAT-002: Compiler validation for checkpoint phase references

**Status**: COMPLETE
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — GameDef validator
**Deps**: `archive/tickets/66CHEPHAGAT-001.md`

## Problem

After adding the optional `phases` field to checkpoints (66CHEPHAGAT-001), a game spec could reference non-existent phase IDs in a checkpoint's `phases` array. This would silently cause the checkpoint to never fire (since `currentPhase` would never match a non-existent ID), producing hard-to-diagnose bugs. Compile-time validation catches this class of error early.

## Assumption Reassessment (2026-04-11)

1. `validateTerminal()` in `packages/engine/src/kernel/validate-gamedef-extensions.ts:264` already validates checkpoints (duplicate IDs, empty array, `when` condition AST). This is the correct insertion point.
2. `turnStructure.phases` provides the list of all declared phase IDs (confirmed via `validate-gamedef-structure.ts:378`).
3. `coupPlan.phases` provides coup-specific phase IDs (confirmed via `validate-gamedef-extensions.ts:76-87` where coup phases are already validated against `turnStructure.phases`).
4. Since `coupPlan.phases` IDs must already be in `turnStructure.phases` (enforced by existing validation at line 78-87), validating against declared turn phases covers both regular and coup phases.
5. The `phases` field will be `readonly string[]` after 66CHEPHAGAT-001.
6. `turnStructure.interrupts` is also part of the live `GameDef` shape and should be accepted as a valid checkpoint phase target when present. Confirmed from `types-core.ts` and phase-lookup consumers.

## Architecture Check

1. Phase reference validation is a static, compile-time check — it belongs in the GameDef validator per Foundation 12 (Compiler-Kernel Boundary).
2. Validating against `turnStructure.phases` (which already includes coup phases) keeps the check game-agnostic.
3. No new validation infrastructure needed — reuses existing `Diagnostic` patterns and `validateTerminal()` location.

## What to Change

### 1. Add phase reference validation to `validateTerminal()`

In `packages/engine/src/kernel/validate-gamedef-extensions.ts`, inside the existing `validateTerminal()` function, after the per-checkpoint `when` validation loop (around line 304), add validation for each checkpoint's `phases` array:

- Build a `Set<string>` of all phase IDs from `def.turnStructure.phases` plus any `def.turnStructure.interrupts`.
- For each checkpoint with a `phases` array:
  - If `phases` is empty, emit a **warning** diagnostic (`VICTORY_CHECKPOINT_PHASES_EMPTY`) — an empty array means the checkpoint never fires, which is likely unintentional.
  - For each phase ID in `phases`, if it is not in the valid set, emit an **error** diagnostic (`VICTORY_CHECKPOINT_PHASE_UNKNOWN`) with a clear message naming the invalid phase and the checkpoint ID.

### 2. Validation tests

Add tests to the existing validation test file or create `packages/engine/test/unit/validate-terminal-phase-refs.test.ts`:

1. **Valid phases accepted**: A checkpoint with `phases: ['phaseA']` where `phaseA` exists in `turnStructure.phases` produces no diagnostics.
2. **Invalid phase rejected**: A checkpoint with `phases: ['nonExistent']` produces an error diagnostic with code `VICTORY_CHECKPOINT_PHASE_UNKNOWN`.
3. **Empty phases array warning**: A checkpoint with `phases: []` produces a warning diagnostic with code `VICTORY_CHECKPOINT_PHASES_EMPTY`.
4. **Mixed valid and invalid**: A checkpoint with `phases: ['validPhase', 'invalidPhase']` produces one error for `invalidPhase` and none for `validPhase`.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-extensions.ts` (modify)
- `packages/engine/test/unit/validate-terminal-phase-refs.test.ts` (new)

## Out of Scope

- Runtime phase gating logic (already in 66CHEPHAGAT-001)
- FITL game data changes (66CHEPHAGAT-003)
- CNL/spec-level validation (`validate-spec-core.ts`) — this is GameDef-level validation only
- Validation of phase ordering within the `phases` array (order is irrelevant for set membership)

## Acceptance Criteria

### Tests That Must Pass

1. Valid phase references produce no diagnostics
2. Invalid phase references produce `VICTORY_CHECKPOINT_PHASE_UNKNOWN` error
3. Empty `phases` array produces `VICTORY_CHECKPOINT_PHASES_EMPTY` warning
4. Mixed valid/invalid phases produce errors only for invalid entries
5. Existing validation test suite passes without modification

### Invariants

1. Checkpoints without `phases` field produce no new diagnostics (backward compat)
2. Diagnostic codes follow existing naming conventions (`VICTORY_CHECKPOINT_*`)
3. Error messages include both the invalid phase ID and the checkpoint ID for debuggability
4. Validation is purely static — no runtime state dependency

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-terminal-phase-refs.test.ts` — 4 test cases covering valid, invalid, empty, and mixed phase references

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/validate-terminal-phase-refs.test.js`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Added static checkpoint-phase validation in `packages/engine/src/kernel/validate-gamedef-extensions.ts` with two new diagnostics:
  - `VICTORY_CHECKPOINT_PHASE_UNKNOWN` as an error for undeclared phase ids
  - `VICTORY_CHECKPOINT_PHASES_EMPTY` as a warning for empty `phases` arrays
- Validation now accepts phase ids declared in either `turnStructure.phases` or `turnStructure.interrupts`, matching the live `GameDef` phase surface.
- Added focused validator coverage in `packages/engine/test/unit/validate-terminal-phase-refs.test.ts` for valid main/interrupt phases, omitted `phases`, unknown phases, empty arrays, and mixed valid/invalid arrays.
- Kept the ticket boundary intact: no runtime gating changes, no FITL data edits, and no schema artifact updates were needed here.

## Verification Run

- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/validate-terminal-phase-refs.test.js`
- `pnpm turbo test`
- `pnpm turbo typecheck`
- `pnpm turbo lint`
