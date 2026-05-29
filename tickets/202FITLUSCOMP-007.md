# 202FITLUSCOMP-007: P5 — replay-identity reattestation

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None
**Deps**: `archive/tickets/202FITLUSCOMP-005.md`, `tickets/202FITLUSCOMP-006.md`

## Problem

After the US baseline changes (002–006) and Spec 201's shared scaffolding are folded in, Spec 202 §6 P5 requires reattesting determinism: ARVN seed 1000 / FITL seed 2057 / the four-profile convergence canaries must be byte-identical with the US baseline doctrine in place. This is the final verification that the US authoring did not perturb cross-faction determinism.

## Assumption Reassessment (2026-05-29)

1. Spec 201 has landed (COMPLETED) and `us-baseline` already binds all 7 `shared.*` modules — the "after Spec 201 lands" gate is satisfied, so this reattestation runs unconditionally once 005/006 close.
2. The canary/determinism witnesses (ARVN seed 1000, FITL seed 2057, four-profile convergence) already exist in the engine test corpus; this ticket runs and confirms them, re-blessing only if a shift is legitimate and explicitly justified per `.claude/rules/testing.md`.
3. No source authoring remains — all doctrine is bound by ticket 005; this is a verification deliverable.

## Architecture Check

1. Determinism reattestation is the proof that the doctrine additions are behavior-preserving for unrelated factions/seeds (Foundation 8/16). It belongs after binding (005) and witnesses (006) so the full profile is in place.
2. No engine or data authoring — confirms existing invariants; no agnostic-boundary risk.
3. Any re-bless of a golden/canary trace requires an explicit `Re-bless golden trace: <file>` commit-body justification per the testing rules — no silent test softening (Foundation 16).

## What to Change

### 1. Run the determinism / canary reattestation

Execute the determinism corpus and the four-profile convergence canaries with the completed `us-baseline`. Confirm byte-identical outcomes for ARVN seed 1000 and FITL seed 2057.

### 2. Adjudicate any shift

If a canary shifts, evaluate legitimacy: distill to an architectural invariant or re-bless the witness with explicit justification per `.claude/rules/testing.md`; otherwise treat as a regression and fix the doctrine (do not soften the test).

## Files to Touch

- None expected (verification-only). If a legitimate trace shift requires re-blessing, the specific canary/golden fixture under `packages/engine/test/` is updated with a justified `Re-bless golden trace:` note.

## Out of Scope

- Any doctrine authoring or binding (002–005) and witness authoring (006).
- Softening or deleting determinism tests to accommodate an unexplained shift.

## Acceptance Criteria

### Tests That Must Pass

1. ARVN seed 1000, FITL seed 2057, and the four-profile convergence canaries are byte-identical with the US baseline changes folded in.
2. `pnpm turbo build` byte-identical (compiler determinism).
3. Full engine suite green: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. Determinism holds: same GameDef + seed + actions → identical canonical state (Foundation 8).
2. No determinism test is softened without an explicit, justified re-bless (Foundation 16).

## Test Plan

### New/Modified Tests

1. None new — reattests the existing determinism/canary corpus.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:all`
2. `pnpm turbo build && pnpm turbo test`
