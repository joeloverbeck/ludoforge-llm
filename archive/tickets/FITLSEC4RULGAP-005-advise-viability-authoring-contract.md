# FITLSEC4RULGAP-005: Advise Viability Authoring Contract

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: No expected engine changes; regression coverage only unless a generic contract gap is proven
**Deps**: reports/fire-in-the-lake-rules-section-4.md, reports/fire-in-the-lake-rules-section-5.md, data/games/fire-in-the-lake/20-macros.md, data/games/fire-in-the-lake/30-rules-actions.md

## Problem

The current FITL `Advise` authoring does not encode an explicit "meaningful branch required" gate beyond geographic space selection plus optional Aid. The generic free-operation probe therefore treats `Advise` as usable whenever a legal decision path exists under that authored contract. Before changing code, this ticket must determine whether the existing permissive contract is actually wrong or whether the real gap is missing regression coverage around that contract.

## Assumption Reassessment (2026-03-12)

1. In `data/games/fire-in-the-lake/20-macros.md`, `advise-select-spaces` currently filters only by geography (`province|city`, not North Vietnam) and requires `min: 1`; it does not encode "space must have a meaningful Advise branch".
2. In `data/games/fire-in-the-lake/30-rules-actions.md`, `advise-profile` always offers per-space mode choices after space selection and then separately offers optional `+6 Aid`; no stage-level legality requires a state-changing branch.
3. Direct runtime behavior already matches that permissive authoring: `Advise` can be executed on an otherwise empty legal space and still resolves successfully.
4. Free-operation runtime behavior already matches the same permissive contract: under MACV, a US free special activity grant is considered usable even on an otherwise empty board because `advise` is discoverable as a legal free move.
5. FITL rules extracts confirm that `Advise` includes a separate Aid rider, but they do not unambiguously require at least one selected space to have a state-changing Sweep/Assault/activate-remove outcome before the special activity is legal.
6. Existing tests cover concrete `Advise` effects, accompanying-op guards, overlap guards, and MACV sequence behavior, but they do not explicitly lock the permissive "geography + optional Aid is enough" contract or the parity between direct legality and free-operation probing for that edge case.

## Architecture Check

1. The current architecture is cleaner if `Advise` remains permissive unless the rules text clearly proves otherwise: the free-operation layer already consumes the declared action/profile contract generically, with no FITL-specific kernel branching.
2. Tightening `Advise` to require a "meaningful branch" would demand additional declarative predicates that duplicate Sweep/Assault/activate-remove readiness semantics in FITL data. That is only beneficial if the rules text clearly requires it; otherwise it is extra authored complexity and a new drift risk.
3. `GameDef` and simulation must remain game-agnostic. If FITL ever does need a stricter legality contract, it must still be authored declaratively in FITL `GameSpecDoc`, not in runtime branches keyed on `advise`, MACV, or FITL seats.
4. No backwards-compatibility aliasing is needed. Choose one canonical interpretation, lock it with tests, and keep the contract singular across direct action discovery and free-operation probing.

## What to Change

### 1. Make the canonical FITL interpretation explicit

For this ticket, the canonical interpretation is:

- `Advise` is legal whenever at least one non-North-Vietnam province/city can be selected under the authored profile contract.
- Optional `+6 Aid` remains part of that contract.
- This ticket does **not** redefine legality to require a guaranteed state-changing per-space branch, because the rules extracts do not prove that stricter interpretation and the current architecture already implements the permissive contract coherently.

### 2. Lock the existing contract with regression coverage

Add explicit tests that prove:

- direct `advise` action legality remains available in the permissive edge case,
- free-operation issuance/viability scenarios where `advise` affects event usability decisions such as `MACV` follow the same contract.

The same contract must hold in both ordinary action discovery and free-operation probing.

### 3. Do not expand into authoring or kernel changes without proof

Do not modify FITL data authoring or kernel code unless the new tests demonstrate an actual mismatch between:

- the declared FITL `Advise` contract,
- direct legality/discovery,
- free-operation usability probing.

## Files to Touch

- `packages/engine/test/integration/fitl-us-arvn-special-activities.test.ts` (modify)
- `packages/engine/test/integration/fitl-events-macv.test.ts` (modify)
- `packages/engine/test/helpers/legality-surface-parity-helpers.ts` (reuse if helpful; modify only if a generic assertion helper gap is proven)
- `data/games/fire-in-the-lake/20-macros.md` (do not modify unless regression evidence proves authoring is wrong)
- `data/games/fire-in-the-lake/30-rules-actions.md` (do not modify unless regression evidence proves authoring is wrong)
- `packages/engine/src/kernel/free-operation-viability.ts` (do not modify unless regression evidence proves a generic viability mismatch)

## Out of Scope

- Game-specific branches in the kernel keyed on `advise`, `MACV`, FITL factions, or FITL card IDs.
- Visual presentation changes in `visual-config.yaml`.
- Reworking unrelated FITL special activities.

## Acceptance Criteria

### Tests That Must Pass

1. The ticket states one explicit canonical FITL interpretation for `Advise` viability and implementation matches that interpretation.
2. Direct `advise` legality/discovery and free-operation usability probing agree for the chosen contract, including the permissive edge case.
3. `MACV` reflects the same `Advise` contract without engine-side FITL hacks.
4. Existing suite: `pnpm turbo test` passes.

### Invariants

1. FITL-specific legality semantics for `Advise` are authored in FITL `GameSpecDoc`, not in generic kernel branching.
2. If kernel changes are needed, they provide generic action/profile viability support reusable by any game, with no FITL identifiers in agnostic layers.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-us-arvn-special-activities.test.ts` — pin the chosen direct-action legality contract for edge-case `Advise` states.
2. `packages/engine/test/integration/fitl-events-macv.test.ts` — verify `MACV` free-operation issuance matches the chosen `Advise` viability semantics.
3. Add or reuse equivalent legality-surface coverage only if needed to prove parity; do not touch `fitl-option-matrix.test.ts` unless it materially improves signal.

### Commands

1. `pnpm -F @ludoforge/engine test -- fitl-us-arvn-special-activities.test.ts fitl-events-macv.test.ts`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo test`

## Outcome

- Completed: 2026-03-12
- Actual changes:
  - Reassessed the ticket against the current FITL authoring, rules extracts, and MACV runtime behavior.
  - Narrowed the ticket from a possible data/kernel change into a regression-contract ticket because current architecture already implements a coherent permissive `Advise` contract.
  - Added direct regression coverage proving `Advise` remains legal on an otherwise empty eligible space.
  - Added MACV regression coverage proving free-operation usability sees the same permissive `Advise` contract.
- Deviations from original plan:
  - No changes were made to `data/games/fire-in-the-lake/20-macros.md`, `data/games/fire-in-the-lake/30-rules-actions.md`, or `packages/engine/src/kernel/free-operation-viability.ts`.
  - `fitl-option-matrix.test.ts` was left untouched because it does not materially cover the edge case this ticket is about; the stronger signal lives in the dedicated FITL special-activity and MACV tests.
  - The ticket now explicitly rejects adding a stricter "meaningful branch required" contract without stronger rules evidence, because that would duplicate action readiness semantics in FITL data and would not be a cleaner architecture today.
- Verification:
  - `pnpm -F @ludoforge/engine test -- fitl-us-arvn-special-activities.test.ts fitl-events-macv.test.ts`
  - `pnpm -F @ludoforge/engine test:e2e`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm turbo test`
