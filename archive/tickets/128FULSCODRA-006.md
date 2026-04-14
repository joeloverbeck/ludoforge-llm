# 128FULSCODRA-006: Prove draft-state external contract with live determinism and probe tests

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel test infrastructure
**Deps**: `archive/tickets/128FULSCODRA-003.md`, `archive/tickets/128FULSCODRA-004.md`, `archive/tickets/128FULSCODRA-005.md`

## Problem

Spec 128 (Constraint 3, Foundation 16) still requires proof that the widened draft-state optimization preserves the external contract: deterministic results and no caller-visible input mutation. However, the older draft wording in this ticket assumed there was still a live "former spread path" reference implementation to compare against. That path no longer exists after tickets 003, 004, and 005, so the correct proof surface is the current runtime contract: `applyMove`, `applyTrustedMove`, `probeMoveViability`, and the existing determinism harnesses.

## Assumption Reassessment (2026-04-14)

1. `probeMoveViability` at `apply-move.ts` remains a read-only validation probe and does not call `applyMoveCore`. Confirmed.
2. `freezeState` in `state-draft.ts` is still a zero-cost type cast, so external immutability must be proven with actual deep-frozen caller input, not by relying on `freezeState`. Confirmed.
3. There is no longer a live production or test-harness "former spread path" callable implementation for A/B equivalence testing. A literal draft-vs-spread comparison is therefore stale and not implementable as written. Confirmed.
4. Existing deterministic replay coverage already lives in `packages/engine/test/determinism/draft-state-determinism-parity.test.ts` and related lanes. This ticket should strengthen those live surfaces rather than inventing a legacy reference path. Confirmed.
5. Existing focused kernel coverage already includes one `applyMove` frozen-input test in `packages/engine/test/unit/kernel/apply-move.test.ts`, but does not yet prove `applyTrustedMove` immutability or `probeMoveViability` immutability/isolation in a dedicated regression lane. Confirmed.

## Architecture Check

1. Foundation 16 requires automated proof, but the proof must target live architecture. The clean boundary is to prove the current external contract, not to reconstruct a removed implementation path.
2. No game-specific logic — the new focused kernel tests use generic `GameState` fixtures, while the determinism lane continues to use production FITL/Texas fixtures as existing architectural proof surfaces.
3. No backwards-compatibility shims — this ticket adds test coverage only and does not revive a legacy spread-path implementation.

## What to Change

### 1. Dedicated kernel immutability regression lane

Add a focused kernel test file that proves:
1. `applyMove` does not mutate a deeply frozen input state
2. `applyTrustedMove` does not mutate a deeply frozen input state
3. both calls return distinct output state objects

### 2. Probe path isolation verification

In the same focused lane, add tests proving:
1. `probeMoveViability` does not modify a deeply frozen input state
2. `probeMoveViability` returns stable results for the same input state even after `applyMove` has executed elsewhere, proving no shared mutable leakage between the draft path and the probe path

### 3. Strengthen bounded determinism replay proof

Extend the existing `draft-state-determinism-parity` lane so that current production-scale replay determinism is proven across multiple curated seeds and repeated runs using the live engine path. The proof target is identical replay outcome for the same seed, not comparison against a removed pre-draft implementation.

## Files to Touch

- `packages/engine/test/unit/kernel/apply-move-immutability.test.ts` (new)
- `packages/engine/test/determinism/draft-state-determinism-parity.test.ts` (modify)

## Out of Scope

- Performance benchmarking (ticket 007)
- Reconstructing or reviving a legacy spread-path reference implementation
- Modifying kernel production code

## Acceptance Criteria

### Tests That Must Pass

1. Focused immutability test: deep-frozen input state survives both `applyMove` and `applyTrustedMove` without mutation
2. Probe isolation test: `probeMoveViability` does not modify input state and remains stable for identical inputs regardless of prior move execution elsewhere
3. Determinism lane: curated production seeds produce identical replay outcomes across repeated runs
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Foundation 8 (Determinism): same seed yields identical replay outcome in the strengthened determinism lane
2. Foundation 11 (Immutability — external contract): caller-provided frozen input state is never mutated by `applyMove`, `applyTrustedMove`, or `probeMoveViability`
3. Foundation 16 (Testing as Proof): the live external contract is verified by automated tests, not by assumed implementation history

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move-immutability.test.ts` — deep-freeze proofs for `applyMove`, `applyTrustedMove`, and `probeMoveViability`
2. `packages/engine/test/determinism/draft-state-determinism-parity.test.ts` — strengthen repeated-run determinism proof on live production seeds

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/apply-move-immutability.test.js dist/test/determinism/draft-state-determinism-parity.test.js`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Completed on 2026-04-14.
- The active ticket boundary was corrected during reassessment: there is no longer a live legacy spread-path implementation to compare against, so the proof surface was rewritten to target the current external contract instead of a removed A/B reference.
- Added [apply-move-immutability.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/apply-move-immutability.test.ts), which proves deep-frozen caller input is not mutated by `applyMove`, `applyTrustedMove`, or `probeMoveViability`, and that probe viability remains stable for identical inputs after move execution elsewhere.
- Strengthened [draft-state-determinism-parity.test.ts](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/determinism/draft-state-determinism-parity.test.ts) so the existing production FITL/Texas replay lane now proves identical outcomes across three repeated runs per curated seed.
- No production kernel code changed; this ticket landed as proof coverage only.
- Verification passed:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/apply-move-immutability.test.js dist/test/determinism/draft-state-determinism-parity.test.js`
  - `pnpm -F @ludoforge/engine test`
