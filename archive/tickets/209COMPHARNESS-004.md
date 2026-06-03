# 209COMPHARNESS-004: Adversarial-alternative + preview-status assertion helpers

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — test infrastructure only
**Deps**: `archive/tickets/209COMPHARNESS-001.md`

## Problem

Spec §3.4 and §3.5 are two decision-point integrity guards that both consume the same run's published frontier + plan trace, so they ship together:
- **§3.4 Adversarial bad-but-legal alternative**: assert that at least one explicitly-named bad-but-legal alternative root was present in the published frontier and the agent did **not** select it. The test must fail if the trap alternative is *absent* (never passes vacuously) or if the agent chose it.
- **§3.5 Preview-status**: for every preview-derived ref decisive to the asserted outcome, require its status to be `ready` or an explicitly-traced non-`ready` outcome — no silent numeric certainty (FOUNDATIONS #20).

Grouping rationale: both are small assertion helpers operating on the same run output (frontier + trace), both are "did the agent's selection stay honest" guards; splitting them would create an artificial boundary across one cohesive review.

## Assumption Reassessment (2026-06-03)

1. The runner (001) surfaces the published frontier (`microturn.legalActions`) and the selected decision, so §3.4 can check trap presence + non-selection by stable move key — confirmed.
2. Preview status values are emitted in trace via the real unions in `packages/engine/src/kernel/types-core.ts`: `PolicyPreviewSeatMatrixStatusTrace` = `ready | stochastic | random | hidden | unresolved | failed | depthCap | postGrantCap | freeOperationCap | grantFlowPartial | noPreviewDecision | gated`; candidate status = `'ready' | 'partial' | 'unavailable'`. **The spec reassessment corrected `depthCapped` → `depthCap`** and confirmed `unknown` is not a member of these unions. The advisory `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` and the selection marker `tiebreakAfterPreviewNoSignal` exist.
3. Both non-FITL corpus games (texas-holdem, generic-control) declare preview considerations in their `92-agents.md`, so §3.5 is exercisable cross-family; §3.4 needs only move considerations (present in all three corpus games).

## Architecture Check

1. §3.4 asserts adversarial dominance (trap present AND not chosen) rather than a single arbitrary "best" key — robust against strategically-equivalent moves (spec §5).
2. §3.5 enforces FOUNDATIONS #20 directly: an unavailable preview ref (any non-`ready` status) is never silently coerced into a numeric contribution; the helper requires the decisive ref's status be `ready` or an explicitly-named non-`ready` outcome from the real emitted union.
3. Both helpers are game-agnostic — trap move keys and decisive ref names are supplied by the fixture (FOUNDATIONS #1).

## What to Change

### 1. Adversarial-alternative helper

`packages/engine/test/helpers/competence/adversarial-alternative.ts`:
- `assertAdversarialAlternativeAvoided(runResult, trapStableMoveKeys)`: assert each named trap key is present in the published frontier (fail if absent — non-vacuous guard) and that the selected decision's stable move key is none of them.

### 2. Preview-status helper

`packages/engine/test/helpers/competence/preview-status.ts`:
- `assertPreviewStatuses(runResult, decisiveRefs)`: for each decisive preview-derived ref, read its emitted status from the run's trace and assert it is `ready` or one of the explicitly-traced non-`ready` outcomes (per the FOUNDATIONS #20 taxonomy / the real emitted union); fail if a non-`ready` ref was silently treated as a numeric contribution without a declared fallback.

### 3. Barrel exports

Append both helper exports to `packages/engine/test/helpers/competence/index.ts`.

## Files to Touch

- `packages/engine/test/helpers/competence/adversarial-alternative.ts` (new)
- `packages/engine/test/helpers/competence/preview-status.ts` (new)
- `packages/engine/test/helpers/competence/index.ts` (modify — append two exports; serialize with sibling tickets)

## Out of Scope

- New preview depth/cap classes (spec Non-Goal — deferred until a fixture proves the current bounded preview cannot distinguish a required choice; FOUNDATIONS #10, #20).
- The reference fixture exercising these helpers — ticket 007 (per spec AC#2). Behavioral exercise attaches to 007; no standalone `.test.ts` here.

## Acceptance Criteria

### Tests That Must Pass

1. Exercised by ticket 007's reference fixture: §3.4 passes when a named trap root is present in the frontier and unselected, and fails when the trap is absent or selected; §3.5 passes when each decisive preview ref carries a `ready`/explicitly-traced status and fails on silent coercion.
2. Existing suite: `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:unit`

### Invariants

1. The adversarial helper fails when the trap alternative is absent — no vacuous pass (spec §5).
2. No non-`ready` preview ref is coerced into a numeric certainty without a declared, trace-visible fallback (FOUNDATIONS #20).
3. Both helpers carry zero game-specific identifiers (FOUNDATIONS #1).

## Test Plan

### New/Modified Tests

1. None standalone — behavioral exercise lands in `packages/engine/test/architecture/competence-harness-reference.test.ts` (ticket 007) per spec AC#2's single-reference-fixture bundling.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine typecheck`
2. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Completion date: 2026-06-03

Implemented `packages/engine/test/helpers/competence/adversarial-alternative.ts` and `packages/engine/test/helpers/competence/preview-status.ts`, and exported both through the competence helper barrel.

The adversarial helper asserts fixture-authored trap stable move keys are present in the published frontier and are not selected. The preview-status helper inspects existing policy decision trace data for decisive preview refs, selected/target candidates, seat-matrix cells, and turn-shape preview statuses; non-ready decisive refs must be explicitly traced and carry trace-visible preview fallback evidence.

Verification completed:

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine typecheck`
3. `pnpm -F @ludoforge/engine test:unit` — 6110 tests, 0 failures
4. `pnpm turbo build`
5. `pnpm turbo lint`
6. `pnpm turbo typecheck`
7. `pnpm run check:ticket-deps`
8. `git diff --check`
9. No game-specific identifier matches in the helper/barrel sweep
