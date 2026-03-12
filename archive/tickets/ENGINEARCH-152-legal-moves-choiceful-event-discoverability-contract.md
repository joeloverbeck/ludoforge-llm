# ENGINEARCH-152: Reassess `legalMoves()` choiceful event discoverability contract

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No kernel behavior change expected; reassess architecture, correct stale assumptions, and add missing discoverability regression coverage if warranted
**Deps**: `tickets/README.md`, `packages/engine/src/kernel/legal-moves.ts`, `packages/engine/src/kernel/move-decision-sequence.ts`, `packages/engine/src/kernel/decision-sequence-satisfiability.ts`, `packages/engine/test/unit/kernel/legal-moves.test.ts`, `packages/engine/test/integration/fitl-commitment-phase.test.ts`, `packages/engine/test/integration/fitl-events-international-forces.test.ts`

## Problem

This ticket was opened on the assumption that `legalMoves()` still hid some legal `event` moves whenever completion required unresolved player choice with multiple valid branches. Before changing code, that assumption needs to be revalidated against current `HEAD`, because recent kernel work already routes legal-move discovery through canonical decision-sequence satisfiability helpers.

## Assumption Reassessment (2026-03-12)

1. Current kernel code already routes event, pipeline, plain-action, and free-operation discovery through `isMoveDecisionSequenceAdmittedForLegalMove(...)`, which delegates to the canonical satisfiability classifier in `move-decision-sequence.ts` / `decision-sequence-satisfiability.ts`.
2. Existing unit coverage already proves that `legalMoves()` preserves event templates when decision satisfiability is `unknown` and suppresses them only when the sequence is truly unsatisfiable. Existing FITL integration coverage already proves cross-faction chooser ownership for International Forces shaded via the surfaced move from `legalMoves()`.
3. The main discrepancy is in ticket assumptions, not current architecture: the kernel contract already appears cleaner than the ticket describes. What is still missing is explicit regression coverage for a satisfiable, non-forced, multi-completion event discoverability case in the exact scenarios called out by the ticket.
4. The old ticket command examples were also stale: this repo does not have a root-level `scripts/run-tests.mjs`. The current verified command shape is `pnpm -F @ludoforge/engine build` followed by `node --test packages/engine/dist/...` or the package scripts in `packages/engine/package.json`.

## Architecture Check

1. The current architecture is already the right one: if at least one legal completion exists for a canonical move, `legalMoves()` should surface that move even when completion remains choiceful. The existing satisfiability-based admission path is cleaner than adding aliases, UI synthesis, or event-specific exceptions.
2. Because the kernel already follows that architecture, the beneficial work here is to harden regression coverage around the contract rather than reworking the implementation.
3. No backwards-compatibility shim or alternate move form should be introduced. Canonical move shapes remain the right boundary.

## What to Change

### 1. Revalidate the current contract against the named scenarios

Confirm whether the Great Society / International Forces scenarios actually diverge from the kernel contract on current `HEAD`. If they do not, do not rewrite the kernel just to match stale ticket assumptions.

### 2. Encode the missing regression coverage explicitly in tests

Add focused assertions for the still-valuable gaps:
- satisfiable choiceful event discoverability from `legalMoves()`,
- the corresponding pending chooser-owned decision surfaced through canonical choice APIs,
- FITL integration coverage for the exact named scenario if it was previously only exercising `resolveMoveDecisionSequence()` from a hand-authored move.

### 3. Remove stale implementation assumptions from the ticket

Update scope, file list, and commands so the ticket reflects the real architecture and current repo command surface.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (read/confirm only unless reassessment proves a real bug)
- `packages/engine/src/kernel/move-decision-sequence.ts` (read/confirm only unless reassessment proves a real bug)
- `packages/engine/src/kernel/decision-sequence-satisfiability.ts` (read/confirm only unless reassessment proves a real bug)
- `packages/engine/test/integration/fitl-commitment-phase.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-international-forces.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)

## Out of Scope

- Rewriting the kernel when reassessment shows the contract already holds.
- Re-authoring individual FITL cards beyond what is required to prove the contract.
- UI workarounds that synthesize hidden moves outside the engine.
- Any game-specific branching in event compilation or simulation.

## Acceptance Criteria

### Tests That Must Pass

1. A satisfiable choiceful event with multiple valid completions is surfaced by `legalMoves()` as a legal base move.
2. The same surfaced move yields the expected pending chooser-owned decision through `legalChoicesDiscover()` or `resolveMoveDecisionSequence()`.
3. No kernel code changes are made unless reassessment proves a real discoverability gap on current `HEAD`.
4. Existing suite: `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
5. Existing suite: `node --test packages/engine/dist/test/integration/fitl-commitment-phase.test.js packages/engine/dist/test/integration/fitl-events-international-forces.test.js`
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `legalMoves()` discoverability must not depend on whether a pending decision tree has one completion or many.
2. Kernel legality remains game-agnostic; no Fire in the Lake identifiers or branches leak into engine logic.
3. Canonical move shapes remain stable: unresolved decisions are completed through choice APIs, not by inventing alternate hidden move forms.

## Tests

### New/Modified Tests

1. `packages/engine/test/integration/fitl-commitment-phase.test.ts` — lock in that Great Society shaded is discoverable as an event move even when several 3-of-N US-piece selections exist.
2. `packages/engine/test/integration/fitl-events-international-forces.test.ts` — retain the already-correct cross-faction chooser-owned discoverability coverage if a clarifying assertion is still useful after reassessment.
3. `packages/engine/test/unit/kernel/legal-moves.test.ts` — add a minimal game-agnostic satisfiable choiceful-event discoverability regression if current coverage is still implicit rather than explicit.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-commitment-phase.test.js packages/engine/dist/test/integration/fitl-events-international-forces.test.js`
4. `pnpm -F @ludoforge/engine lint`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-12
- What actually changed:
  - Reassessed the ticket against current `HEAD` and confirmed the kernel already uses the satisfiability-based legal-move admission architecture that the ticket proposed.
  - Corrected the ticket’s stale assumptions, narrowed scope away from speculative kernel rewrites, and fixed the stale command examples to match the repo’s actual build/test entrypoints.
  - Added an explicit game-agnostic unit regression proving that a satisfiable choiceful event with multiple legal completions is surfaced by `legalMoves()`.
  - Added FITL integration coverage for Great Society shaded discoverability from `legalMoves()` using a turn-flow-valid setup, while keeping the original chooser-ownership scenario as a direct `resolveMoveDecisionSequence()` / `applyMove()` test.
- Deviations from original plan:
  - No kernel source changes were needed. The original ticket overstated the implementation gap.
  - The apparent Great Society discrepancy came from an integration setup with a turn-flow-ineligible active seat, which is valid for direct choice-surface probing but not for `legalMoves()` discovery.
  - `packages/engine/test/integration/fitl-events-international-forces.test.ts` did not need modification because it already covered shaded discoverability via `legalMoves()`.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js packages/engine/dist/test/integration/fitl-commitment-phase.test.js packages/engine/dist/test/integration/fitl-events-international-forces.test.js`
  - `pnpm -F @ludoforge/engine lint` (passes with pre-existing warnings, no errors)
  - `pnpm -F @ludoforge/engine test`
  - `pnpm run check:ticket-deps`
