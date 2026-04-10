# 123BATREDENU-002: Fix legalChoicesDiscover to traverse forEach loop bodies

**Status**: NOT IMPLEMENTED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel probing pipeline (`move-decision-sequence.ts`, possibly `legal-choices.ts`)
**Deps**: `archive/tickets/123BATREDENU-001.md`

## Problem

Blocked by `archive/tickets/123BATREDENU-001.md`, which verified on 2026-04-10 that the claimed probing gap is not reproducible on current `main`.

`legalChoicesDiscover` (called within `resolveMoveDecisionSequence` at line ~89 of `move-decision-sequence.ts`) does not instantiate `forEach` loop bodies during probing. When a parameterless action's effects contain `forEach.over` with embedded `chooseOne`/`chooseN`, the probe never enters the loop body, never discovers the decision, and returns "complete" — causing the move to be filtered as a no-op. This violates F5 (One Rules Protocol): `applyMove` and `enumerateLegalMoves` must agree on legality.

## Archival Note

Archived without implementation on 2026-04-10 because the prerequisite bug premise was disproved by `archive/tickets/123BATREDENU-001.md`.

## Boundary Correction (2026-04-10)

Ticket `001` disproved the active bug premise. Do not implement this ticket unless a new live reproducer re-establishes the need for an engine fix.

## Assumption Reassessment (2026-04-10)

1. `legalChoicesDiscover` is the entry point for decision discovery during probing — confirmed via code trace this session.
2. The non-pipeline path for parameterless actions routes through `enumerateParams` → `isMoveDecisionSequenceAdmittedForLegalMove` → `classifyMoveDecisionSequenceSatisfiability` → `resolveMoveDecisionSequence` → `legalChoicesDiscover` — confirmed.
3. The pipeline path (lines 1371-1382 in `legal-moves.ts`) already skips the probe for `compilable: false` first decisions — confirmed. This fix targets the non-pipeline path.
4. `forEach` loop evaluation in the execution path lives in `effects-control.ts` (lines 144-231) — confirmed. The probing path must replicate the loop traversal logic.
5. `forEach` iterates over finite collections (F10 Bounded Computation) — the probing traversal is bounded by the same finite iteration sets.

## Architecture Check

1. The fix is game-agnostic — any game using `forEach` + embedded decisions benefits. No game-specific logic introduced.
2. The fix addresses the root cause (F15 Architectural Completeness): the probing pipeline's inability to traverse `forEach` loop bodies. It does not route around the broken probe via pipeline compatibility or a special-case fast path.
3. No backwards-compatibility shims — the change extends the probing pipeline's capability.

## What to Change

### 1. Extend `legalChoicesDiscover` to traverse `forEach` effects

In the decision discovery path, when encountering a `forEach` effect:
- Evaluate the `forEach.over` query against the current probing state to determine the iteration set
- If the iteration set is non-empty, enter the loop body with the first iteration's binding context to discover decisions within
- If a `chooseOne`/`chooseN` is found inside, return it as the `nextDecision` with appropriate context
- If the iteration set is empty, the `forEach` produces no effects — continue to the next effect (this is a legitimate no-op)

### 2. Ensure bounded computation during probing

- The probing traversal must respect the same bounded computation guarantees as the execution path (F10)
- `forEach` iterates over finite collections — no risk of unbounded iteration
- Add a depth guard if `forEach` loops can be nested (they can — outer zones × inner tokens) to prevent unbounded nesting during probing

### 3. Turn RED tests GREEN

- The synthetic unit test from 001 (`probe-foreach-decision.test.ts`) must now pass: `probeMoveViability` discovers the embedded decision, `enumerateLegalMoves` returns the action
- The FITL integration test from 001 (`fitl-probe-foreach-redeploy.test.ts`) must now pass

### 4. Add property test — applyMove/enumerateLegalMoves parity

Add a property test that verifies: for any action in a GameDef, if `applyMove` accepts a move template as legal, `enumerateLegalMoves` must include it (no false negatives in enumeration). Run against FITL GameDef with multiple game states.

## Files to Touch

- `packages/engine/src/kernel/move-decision-sequence.ts` (modify — `resolveMoveDecisionSequence` or `legalChoicesDiscover`)
- `packages/engine/src/kernel/legal-choices.ts` (modify — if decision discovery logic lives here)
- `packages/engine/test/unit/kernel/probe-foreach-decision.test.ts` (modify — flip assertions from RED to GREEN)
- `packages/engine/test/integration/fitl-probe-foreach-redeploy.test.ts` (modify — flip assertions from RED to GREEN)
- `packages/engine/test/unit/kernel/enumerate-applymove-parity.test.ts` (new — property test)

## Out of Scope

- Migrating FITL YAML to parameterless form (ticket 003)
- Updating existing FITL redeploy tests or golden fixtures (ticket 004)
- Changes to the pipeline path probe-skip optimization (lines 1371-1382 in `legal-moves.ts`) — that path already works correctly

## Acceptance Criteria

### Tests That Must Pass

1. `probe-foreach-decision.test.ts` — `probeMoveViability` discovers embedded `chooseOne` inside `forEach`, `enumerateLegalMoves` returns the parameterless action
2. `fitl-probe-foreach-redeploy.test.ts` — parameterless redeploy template appears in enumeration results
3. `enumerate-applymove-parity.test.ts` — no false negatives: `applyMove` legality implies `enumerateLegalMoves` viability
4. Existing suite: `pnpm turbo test` — all existing tests continue to pass

### Invariants

1. `applyMove` behavior is unchanged — it already works correctly
2. The pipeline path probe-skip optimization is untouched
3. Enumeration budgets (`maxTemplates`, `maxParamExpansions`) still apply
4. Probing traversal of `forEach` is bounded by finite iteration sets (F10)
5. No game-specific logic in the fix (F1)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/probe-foreach-decision.test.ts` (modify) — flip RED→GREEN assertions
2. `packages/engine/test/integration/fitl-probe-foreach-redeploy.test.ts` (modify) — flip RED→GREEN assertions
3. `packages/engine/test/unit/kernel/enumerate-applymove-parity.test.ts` (new) — property test for enumeration/execution parity

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/kernel/probe-foreach-decision.test.js`
2. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/integration/fitl-probe-foreach-redeploy.test.js`
3. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/kernel/enumerate-applymove-parity.test.js`
4. `pnpm turbo test`
