# 138ENUTIMTEM-006: Redesign guided completion for multi-pick chooseN heads

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — classifier/head-guidance contract, `prepare-playable-moves`, guided completion tests
**Deps**: `archive/tickets/138ENUTIMTEM-002.md`

## Problem

`138ENUTIMTEM-003` was drafted around a true single-pick head: the classifier would emit a flat scalar `viableHeadSubset`, and `preparePlayableMoves` would steer the first `chooseN` draw onto one viable scalar option. Live implementation on 2026-04-19 invalidated that boundary. Re-running `node campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs --seed 1010 --max-turns 200` showed the still-failing `march` template's first pending head is `chooseN{min:1,max:27,optionCount:27}`, not `chooseN{min:1,max:1,...}`.

A flat scalar subset cannot encode the legal completion surface for a multi-pick head, and full viable-combination extraction would violate the boundedness bar from `docs/FOUNDATIONS.md` #10. This ticket therefore owns the corrected architecture: the classifier emits one canonical satisfiable head selection for a `chooseN` head, and guided completion only activates after a sampled `drawDeadEnd` / `notViable` miss proves that unguided sampling landed off the legal surface.

## Assumption Reassessment (2026-04-19)

1. `packages/engine/src/kernel/decision-sequence-satisfiability.ts` initially emitted only a scalar verdict plus the opt-in single-pick `viableHeadSubset?: readonly MoveParamScalar[]` added by `138ENUTIMTEM-002`. Corrected in the final implementation.
2. `packages/engine/src/agents/prepare-playable-moves.ts` remained the correct wiring seam: `attemptTemplateCompletion` feeds a `choose` callback into `completeTemplateMove`, so a corrected head-guidance contract could remain engine-internal. Confirmed.
3. `node campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs --seed 1010 --max-turns 200` on 2026-04-19 still ended with `stopReason=noPlayableMoveCompletion` and reported the failing `march` template's first pending head as `chooseN` with `min:1`, `max:27`, `optionCount:27`. This was the authoritative witness for the boundary correction.
4. The scalar subset shape was sufficient only for true single-pick heads. It could not express viable combinations or any other bounded representation needed for `chooseN{min:1,max:27}`. Full combination extraction was rejected during implementation because it widened the search surface beyond the intended bounded contract.
5. Runner worker bridge impact remained zero-touch: the guided-completion contract is still consumed only inside engine agent preparation. Confirmed via current call sites.

## Architecture Check

1. The corrected design preserves a single kernel-authoritative rules protocol (Foundation #5). The classifier and sampler share one head-guidance representation.
2. The representation stays bounded and finitely enumerable (Foundation #10). The redesign reuses the classifier's existing bounded recursion to find one satisfiable head selection; it does not enumerate every viable combination.
3. No backwards-compatibility alias or shim around `viableHeadSubset` remains (Foundation #14). The stale field was replaced in the same slice.
4. This ticket fixes the real live design gap instead of narrowing scope around it (Foundation #15). Single-pick guidance is a special case of the broader `chooseN` contract.

## What Changed

### 1. Redesign the head-guidance result for multi-pick `chooseN`

Replaced the stale scalar-only head-guidance shape with a bounded contract that can truthfully guide a multi-pick `chooseN` head. The landed representation is `canonicalViableHeadSelection?: MoveParamValue`: the first satisfiable full head selection found by the existing exhaustive recursion, in canonical option order.

This keeps the contract deterministic, serializable within existing engine types, and expressive enough for the live `chooseN{min:1,max:27}` witness without attempting to enumerate every viable combination. `viableHeadSubset` was removed rather than aliased.

### 2. Wire the corrected contract into guided completion

`preparePlayableMoves` / `attemptTemplateCompletion` now consume the redesigned head-guidance result for both true single-pick heads and multi-pick heads. The landed path does not pre-guide every template upfront; it samples once using the existing chooser policy, and only after a `drawDeadEnd` / `notViable` miss on a `chooseN` head does it ask the classifier for `canonicalViableHeadSelection` and retry with that head selection forced.

Downstream decisions remain under the existing chooser policy. Any residual guided miss after a positive classification is surfaced as the runtime-warning tripwire `GUIDED_COMPLETION_UNEXPECTED_MISS`.

### 3. Restore proof around the corrected contract

The proof plan was reworked around the multi-pick design:
- classifier contract tests for the canonical-selection representation
- guided completion convergence tests on representative multi-pick fixtures
- FITL regression coverage proving seeds `1002` and `1010` no longer terminate via `noPlayableMoveCompletion`
- determinism/replay assertions for unaffected seeds under the corrected guidance path

## Files Touched

- `packages/engine/src/kernel/decision-sequence-satisfiability.ts`
- `packages/engine/src/kernel/move-decision-sequence.ts`
- `packages/engine/src/agents/prepare-playable-moves.ts`
- `packages/engine/src/agents/policy-agent.ts`
- `packages/engine/src/kernel/types-core.ts`
- `packages/engine/src/kernel/schemas-core.ts`
- `packages/engine/test/unit/kernel/decision-sequence-satisfiability.test.ts`
- `packages/engine/test/unit/agents/prepare-playable-moves-retry.test.ts`
- `packages/engine/test/integration/prepare-playable-moves-guided-convergence.test.ts`
- `packages/engine/test/integration/fitl-seed-guided-classifier-coverage.test.ts`
- `packages/engine/test/determinism/fitl-seed-guided-sampler-replay-identity.test.ts`
- `specs/138-enumerate-time-template-viability-classifier.md`

## Out of Scope

- Foundation 14 stop-reason/error-class deletion remains owned by `138ENUTIMTEM-004`.
- Caching/performance gating remains owned by `138ENUTIMTEM-005`.
- FITL-specific rule patches or action-definition changes are not allowed.

## Acceptance Criteria

### Tests That Must Pass

1. Targeted guided-completion tests pass for the corrected multi-pick contract, including a case that exercises a real multi-pick `chooseN` head.
2. FITL regression coverage proves seeds `1002` and `1010` no longer end with `stopReason=noPlayableMoveCompletion` under the default guided path.
3. Existing suite: `pnpm turbo build test lint typecheck`
4. `pnpm run check:ticket-deps`

### Invariants

1. The classifier/sampler contract for head guidance is expressive enough for both true single-pick and multi-pick `chooseN` heads without FITL-specific branches.
2. Guided completion remains deterministic with respect to canonical option order and the existing RNG stream contract.
3. No production code depends on a stale scalar-only head-guidance contract once this ticket lands.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/decision-sequence-satisfiability.test.ts` — prove the redesigned head-guidance representation on both single-pick and multi-pick fixtures.
2. `packages/engine/test/integration/prepare-playable-moves-guided-convergence.test.ts` — convergence proof for the corrected guided-completion path.
3. `packages/engine/test/determinism/fitl-seed-guided-sampler-replay-identity.test.ts` — determinism/replay proof for unaffected seeds.
4. `packages/engine/test/integration/fitl-seed-guided-classifier-coverage.test.ts` — live-seed regression proof for the corrected boundary.

### Commands

1. `node campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs --seed 1010 --max-turns 200`
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/decision-sequence-satisfiability.test.js`
4. `pnpm turbo build test lint typecheck`
5. `pnpm run check:ticket-deps`

## Implementation Notes

- Replaced `emitViableHeadSubset` with `emitCanonicalViableHeadSelection` in `decision-sequence-satisfiability.ts` and `move-decision-sequence.ts`.
- Replaced `viableHeadSubset` with `canonicalViableHeadSelection?: MoveParamValue`, populated with the first satisfiable full head selection for `chooseN`.
- Updated `preparePlayableMoves` to activate guided completion only after a sampled miss on a `chooseN` head, then force the canonical head selection on retries while preserving the existing downstream chooser policy.
- Added `disableGuidedChooser?: boolean` plumbing on `PolicyAgent` / `preparePlayableMoves` for determinism proof lanes.
- Added runtime warning code `GUIDED_COMPLETION_UNEXPECTED_MISS` to the kernel warning/schema contract.

## Outcome

Completed on 2026-04-19.

- Live boundary corrected: seed `1010` is handled via multi-pick `chooseN` guidance rather than the stale single-pick subset model.
- The guided-completion path no longer terminates seeds `1002` or `1010` via `noPlayableMoveCompletion`.
- The landed contract is bounded and Foundation-aligned: emit one canonical satisfiable head selection, not an exhaustive viable-combination set.
- Replay identity is preserved for unaffected seeds through the test-only `disableGuidedChooser` proof lane.

## Proof

Executed on 2026-04-19:

1. `node campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs --seed 1010 --max-turns 200`
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/decision-sequence-satisfiability.test.js`
4. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/prepare-playable-moves-retry.test.js`
5. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/prepare-playable-moves-guided-convergence.test.js`
6. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-seed-guided-classifier-coverage.test.js`
7. `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/fitl-seed-guided-sampler-replay-identity.test.js`
8. `pnpm turbo schema:artifacts`
