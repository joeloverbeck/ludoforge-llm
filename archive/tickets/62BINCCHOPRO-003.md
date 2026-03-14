# 62BINCCHOPRO-003: Wire prioritized tier-admissibility into initial chooseN legality and final-array validation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel runtime (`effects-choice.ts`, `legal-choices.ts`)
**Deps**: archive/tickets/62BINCCHOPRO-002.md, specs/62b-incremental-choice-protocol.md

## Problem

`chooseN` built from `prioritized` queries still behaves like a flat domain at both ends of the current protocol:

- apply-time validation accepts final arrays that violate tier ordering
- initial legality evaluation can advertise lower-tier values as legal even when a higher tier is still active

The engine should use the shared `computeTierAdmissibility` helper in both places so initial legality and final-array validation agree.

## Assumption Reassessment (2026-03-14)

1. `computeTierAdmissibility` already exists in `packages/engine/src/kernel/prioritized-tier-legality.ts`, and it already has direct unit coverage. The original ticket phrasing implied it was still future work. Incorrect.
2. `ChoicePendingRequest` already includes engine-owned `selected` and `canConfirm` for `chooseN`, but the current non-incremental protocol still only discovers the initial empty selection state. There is no stepwise `chooseN` progression yet. Confirmed in `types-core.ts`, `effects-choice.ts`, and Spec 62b.
3. `applyChooseN` validates cardinality, uniqueness, and domain membership for submitted arrays, but does not yet enforce prioritized tier-admissibility. Confirmed.
4. `legal-choices.ts` computes initial `chooseN` option legality by probing completed combinations, but it has no concept of prioritized tier gating. Confirmed.
5. `applyChooseN` has direct access to the authored `chooseN.options` AST. `mapChooseNOptions` does not. So discovery-time integration cannot be implemented purely inside `legal-choices.ts` without either:
   - carrying additional authored metadata through the pending request, or
   - preserving tier-gated legality that is computed earlier when the request is created.
6. Because ticket `62BINCCHOPRO-004` is not implemented yet, this ticket cannot make discovery-time legality stateful across partial `chooseN` selections. Any wording that assumes “current partial selection state” is ahead of the architecture.

## Architecture Check

1. The shared helper should remain the single source of truth for prioritized admissibility. No duplicated tier logic in `effects-choice.ts` and `legal-choices.ts`.
2. `evalQuery` should remain unchanged. It must continue flattening `prioritized` tiers without attaching hidden metadata.
3. Until incremental `chooseN` exists, discovery-time work should target the initial empty-selection request only. This ticket should not invent stepwise selection state or emulate ticket `004`.
4. The cleanest seam is:
   - derive prioritized admissibility when `applyChooseN` creates the pending `chooseN` request
   - preserve those illegal statuses during `legalChoicesEvaluate`
   - use the same helper again when validating a submitted final array
5. Combination probing in `legal-choices.ts` is still needed for downstream satisfiability and pipeline legality. Tier gating should narrow or short-circuit probing, not replace it wholesale.

## What to Change

### 1. Wire prioritized helper into `effects-choice.ts`

In `applyChooseN`:

- When building the initial pending request in discovery mode, detect prioritized `chooseN.options` and mark tier-inadmissible options `illegal`
- When validating a submitted array, detect prioritized `chooseN.options` and validate the selection sequence against `computeTierAdmissibility`
- Reject with a descriptive runtime error if the submitted array violates tier ordering

### 2. Preserve tier gating in `legal-choices.ts`

In `mapChooseNOptions` / `mapOptionsForPendingChoice`:

- Respect any precomputed tier-illegal options already present on the pending request
- Do not let combination probing “upgrade” a tier-illegal option back to legal
- Skip probing combinations that include options already known to be tier-inadmissible, where possible

## Files to Touch

- `tickets/62BINCCHOPRO-003.md` (modify — correct assumptions/scope first)
- `packages/engine/src/kernel/effects-choice.ts` (modify — initial pending legality + final-array validation)
- `packages/engine/src/kernel/legal-choices.ts` (modify — preserve tier-illegal status during legality evaluation)
- `packages/engine/test/unit/kernel/legal-choices.test.ts` (modify — add tier-aware discovery tests)
- `packages/engine/test/unit/effects-choice.test.ts` (modify — add prioritized apply-time tests)

## Out of Scope

- The shared helper implementation (ticket 62BINCCHOPRO-002)
- Stateful incremental `chooseN` progression or recomputation after each partial selection step (ticket 62BINCCHOPRO-004)
- `evalQuery` changes — it must not be modified
- Runner changes
- `ChoicePendingRequest` type changes
- Card 87 re-authoring (ticket 62BINCCHOPRO-008)
- Any attempt to backfill stepwise legality by inventing alias fields, hidden metadata, or compatibility layers

## Acceptance Criteria

### Tests That Must Pass

1. Apply-time: a submitted prioritized `chooseN` array that violates tier ordering is rejected with a descriptive error
2. Apply-time: a submitted prioritized `chooseN` array that respects tier ordering is accepted
3. Apply-time: non-prioritized `chooseN` behavior is unchanged
4. Initial legality evaluation: prioritized lower-tier values that are inadmissible from the empty selection state are not reported as legal
5. Initial legality evaluation: prioritized admissible values retain their downstream legality behavior
6. Initial legality evaluation: non-prioritized `chooseN` behavior is unchanged
7. Parity: an option/value that is tier-inadmissible at initial discovery is also rejected when submitted as a one-element final array
8. `pnpm turbo build --filter=@ludoforge/engine` succeeds
9. `pnpm turbo lint --filter=@ludoforge/engine` succeeds
10. `pnpm -F @ludoforge/engine test` passes

### Invariants

1. Discovery-time and apply-time use the same shared helper — no duplicated logic
2. `evalQuery` remains pure — no modifications
3. Non-prioritized `chooseN` behavior is completely unchanged
4. No FITL-specific identifiers in kernel code
5. No tier metadata attached to query results
6. This ticket does not attempt to simulate ticket `004`'s incremental protocol

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-choices.test.ts` — initial prioritized `chooseN` legality cases, including qualifier-aware gating
2. `packages/engine/test/unit/effects-choice.test.ts` — prioritized apply-time acceptance/rejection and non-prioritized control case
3. Parity coverage using the same prioritized fixture at both legality-evaluation and apply-time validation

### Commands

1. `pnpm turbo build --filter=@ludoforge/engine`
2. `pnpm turbo lint --filter=@ludoforge/engine`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-14
- What actually changed:
  - Corrected the ticket to match the current codebase before implementation: archived dependency path, existing shared helper, existing `selected` / `canConfirm`, and the fact that ticket `004` has not introduced incremental `chooseN` state yet.
  - Updated [`effects-choice.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/effects-choice.ts) so prioritized `chooseN` requests compute initial tier-admissibility from the authored query and reject final submitted arrays that violate prioritized tier ordering.
  - Updated [`legal-choices.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-choices.ts) so precomputed tier-illegal `chooseN` options stay illegal during option-legality probing instead of being upgraded by downstream combination checks.
  - Added focused tests in [`effects-choice.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/effects-choice.test.ts) and [`legal-choices.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-choices.test.ts) for prioritized apply-time validation and initial legality evaluation, including qualifier-aware gating.
- Deviations from original plan:
  - Did not implement stateful per-step `chooseN` legality recomputation; that still belongs to ticket `62BINCCHOPRO-004`.
  - Did not add new public metadata or alias fields to carry authored query state through `ChoicePendingRequest`.
  - Preserved the existing combination-probing architecture in `legal-choices.ts`; tier-admissibility now constrains that probing instead of replacing it.
- Verification results:
  - `pnpm turbo build --filter=@ludoforge/engine`
  - `pnpm turbo lint --filter=@ludoforge/engine`
  - `node --test packages/engine/dist/test/unit/effects-choice.test.js packages/engine/dist/test/unit/kernel/legal-choices.test.js`
  - `pnpm -F @ludoforge/engine test`
