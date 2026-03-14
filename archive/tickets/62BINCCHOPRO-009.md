# 62BINCCHOPRO-009: Finish narrowing pending choice cardinality fields to `chooseN`

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel type contract cleanup plus focused consumer/test updates
**Deps**: archive/tickets/62BINCCHOPRO-001.md, archive/tickets/62BINCCHOPRO-004.md, archive/tickets/62BINCCHOPRO-007.md

## Problem

Archived ticket 001 established the important part of the incremental `chooseN` surface by splitting pending choice requests and making `selected` / `canConfirm` explicit on the `chooseN` variant. However, `min` and `max` still live on the shared pending-choice base.

That means the public API still implies `chooseOne` may have cardinality bounds, which is semantically false. The current shape is workable, but it preserves ambiguity in exactly the part of the contract that should be compiler-enforced.

## Assumption Reassessment (2026-03-14)

1. In `packages/engine/src/kernel/types-core.ts`, `ChoicePendingRequestBase` still carries `min?` and `max?`, while only `selected` and `canConfirm` are narrowed to `ChoicePendingChooseNRequest`. Confirmed.
2. There is no `ChoicePendingRequest` runtime Zod schema in `packages/engine/src/kernel/schemas-core.ts` today. Scope correction: this ticket is a TypeScript/public-contract cleanup, not a schema-artifact task.
3. Kernel production code is only partially narrowed today. Some call sites already branch on `request.type === 'chooseN'`, but `choice-option-policy.ts`, `move-completion.ts`, `free-operation-viability.ts`, and `decision-sequence-satisfiability.ts` still read cardinality from a generic `ChoicePendingRequest`. Confirmed.
4. The runner production impact is narrower than originally implied. The main production consumer is `packages/runner/src/model/derive-render-model.ts`, which projects multi-select bounds from pending `chooseN`; the rest of the runner ripple is mostly typed test fixtures. Confirmed discrepancy with the ticket's broader runner wording.
5. Remaining incremental-protocol tickets (`004` through `007`) already landed. None of them owns this stricter type-contract cleanup, so this ticket still has value as a dedicated contract-tightening slice. Confirmed.

## Architecture Check

1. Narrowing `min` and `max` to the `chooseN` variant is beneficial because it removes a false capability from `chooseOne` at the type level. That makes the public API more truthful and forces correct discrimination at compile time.
2. This remains a generic kernel/runtime cleanup. It does not add game-specific behavior, authored-data assumptions, or compatibility shims.
3. No backwards-compatibility aliasing should be introduced. If a consumer breaks because it relied on the ambiguous shared shape, the consumer should be updated to branch on `type === 'chooseN'`.
4. The current architecture after tickets `001` through `007` is already cleaner than the ticket originally implied. This ticket should preserve that architecture and tighten the contract surgically rather than reworking the incremental protocol again.

## What to Change

### 1. Move `min` and `max` off the shared pending-choice base

In `packages/engine/src/kernel/types-core.ts`:

- remove `min?` and `max?` from `ChoicePendingRequestBase`
- add them to `ChoicePendingChooseNRequest`

The result should be:

- `chooseOne`: no cardinality fields
- `chooseN`: `min?`, `max?`, `selected`, `canConfirm`

### 2. Update all consumers to discriminate before reading bounds

Audit engine and runner compile surfaces and update them to read bounds only inside a `type === 'chooseN'` branch.

This is confirmed to include:

- `packages/engine/src/kernel/choice-option-policy.ts`
- `packages/engine/src/kernel/move-completion.ts`
- `packages/engine/src/kernel/free-operation-viability.ts`
- `packages/engine/src/kernel/decision-sequence-satisfiability.ts`
- engine helpers/tests that format or inspect pending decisions
- FITL integration tests that currently read `request.min` / `request.max` without narrowing
- `packages/runner/src/model/derive-render-model.ts`
- typed runner test fixtures that construct `ChoicePendingRequest` literals

### 3. Strengthen contract tests

Add or update tests so the stricter contract is pinned explicitly:

- `chooseOne` fixtures should no longer accept `min` / `max`
- helper code that needs cardinality must narrow to `chooseN`
- public pending-choice fixtures should model the real discriminated contract

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/choice-option-policy.ts` (modify)
- `packages/engine/src/kernel/move-completion.ts` (modify)
- `packages/engine/src/kernel/free-operation-viability.ts` (modify)
- `packages/engine/src/kernel/decision-sequence-satisfiability.ts` (modify)
- `packages/runner/src/model/derive-render-model.ts` (modify)
- engine and runner tests/helpers that construct or inspect `ChoicePendingRequest` without narrowing (modify)

## Out of Scope

- New incremental `chooseN` runtime behavior
- `advanceChooseN` protocol semantics
- Tier-admissibility logic
- Runner UX changes beyond the compile-surface cleanup required by the narrower type
- Any schema or authored-data changes

## Acceptance Criteria

### Tests That Must Pass

1. `ChoicePendingChooseOneRequest` no longer exposes `min` or `max` in the public type contract
2. All engine and runner consumers that need bounds compile by discriminating on `type === 'chooseN'`
3. Existing behavior remains unchanged at runtime; this is a contract-tightening change only
4. `pnpm turbo build` succeeds
5. `pnpm turbo typecheck` succeeds
6. `pnpm turbo lint` succeeds
7. Existing suites: `pnpm -F @ludoforge/engine test` and `pnpm -F @ludoforge/runner test`

### Invariants

1. `chooseOne` pending requests cannot pretend to have cardinality fields
2. `chooseN` remains the only pending-choice variant that carries cardinality and incremental-selection state
3. No compatibility aliases or duplicate field surfaces are added

## Test Plan

### New/Modified Tests

1. `packages/engine/test/helpers/decision-param-helpers.ts` and related helper tests — force explicit narrowing before using bounds
2. `packages/engine/test/unit/kernel/choice-option-policy.test.ts` and `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — update typed request fixtures so bounds live only on `chooseN`
3. FITL integration tests that inspect pending request cardinality — narrow to `chooseN` before asserting bounds
4. `packages/runner/test/model/derive-render-model-state.test.ts` and related runner fixtures — verify multi-select bounds are consumed only from `chooseN`

### Commands

1. `pnpm turbo build`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/runner test`
6. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-14
- What actually changed:
  - Narrowed pending-choice cardinality so `min` / `max` now live only on `ChoicePendingChooseNRequest` in [`packages/engine/src/kernel/types-core.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/types-core.ts).
  - Updated the remaining generic consumers to narrow before reading bounds, preserving the existing incremental architecture instead of adding new compatibility layers.
  - Strengthened engine and runner tests/helpers so pending-choice fixtures and assertions now model bounds as `chooseN`-only state.
- Deviations from original plan:
  - The ticket was corrected before implementation. There is no `ChoicePendingRequest` runtime Zod schema in `schemas-core.ts`, so no schema-artifact work was required.
  - Runner production impact was smaller than the original ticket implied; the only production runner change was in the render-model projection, with the rest of the ripple confined to tests/fixtures.
- Verification results:
  - `pnpm turbo build`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm run check:ticket-deps`
