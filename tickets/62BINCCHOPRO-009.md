# 62BINCCHOPRO-009: Finish narrowing pending choice cardinality fields to `chooseN`

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel type contract cleanup plus compile-surface updates
**Deps**: archive/tickets/62BINCCHOPRO-001.md, archive/tickets/62BINCCHOPRO-004.md, archive/tickets/62BINCCHOPRO-007.md

## Problem

Archived ticket 001 established the important part of the incremental `chooseN` surface by splitting pending choice requests and making `selected` / `canConfirm` explicit on the `chooseN` variant. However, `min` and `max` still live on the shared pending-choice base.

That means the public API still implies `chooseOne` may have cardinality bounds, which is semantically false. The current shape is workable, but it preserves ambiguity in exactly the part of the contract that should be compiler-enforced.

## Assumption Reassessment (2026-03-14)

1. In `packages/engine/src/kernel/types-core.ts`, `ChoicePendingRequestBase` still carries `min?` and `max?`, while only `selected` and `canConfirm` are narrowed to `ChoicePendingChooseNRequest`. Confirmed.
2. Most kernel runtime code already branches on `request.type === 'chooseN'` before treating a pending request as cardinality-bearing state. Confirmed in `move-completion.ts`, `legal-choices.ts`, `free-operation-viability.ts`, and `decision-sequence-satisfiability.ts`.
3. The main blockers today are compile-surface consumers and tests that read `request.min` / `request.max` from a generic `ChoicePendingRequest` without narrowing first. Confirmed across engine test helpers and several FITL integration tests.
4. Remaining incremental-protocol tickets (`004` through `007`) will touch the same conceptual area, but none of them explicitly owns this stricter type-contract cleanup. Scope correction: this needs a dedicated ticket so it is not silently skipped.

## Architecture Check

1. Narrowing `min` and `max` to the `chooseN` variant is beneficial because it removes a false capability from `chooseOne` at the type level. That makes the public API more truthful and forces correct discrimination at compile time.
2. This is purely a kernel/runtime contract cleanup. It does not add game-specific behavior, authored-data assumptions, or compatibility shims.
3. No backwards-compatibility aliasing should be introduced. If a consumer breaks because it relied on the ambiguous shared shape, the consumer should be updated to branch on `type === 'chooseN'`.
4. Doing this after the incremental protocol tickets land is cleaner than forcing the extra compile ripple into those behavior-focused tickets.

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

This likely includes:

- engine helpers/tests that format or inspect pending decisions
- FITL integration tests that currently read `request.min` / `request.max` without narrowing
- runner render-model and UI helpers that consume multi-select bounds

### 3. Strengthen contract tests

Add or update tests so the stricter contract is pinned explicitly:

- `chooseOne` fixtures should no longer accept `min` / `max`
- helper code that needs cardinality must narrow to `chooseN`
- public pending-choice fixtures should model the real discriminated contract

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/*` and `packages/runner/src/*` consumers that still rely on shared `min` / `max` access (modify as needed)
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
6. Existing suites: `pnpm -F @ludoforge/engine test` and `pnpm -F @ludoforge/runner test`

### Invariants

1. `chooseOne` pending requests cannot pretend to have cardinality fields
2. `chooseN` remains the only pending-choice variant that carries cardinality and incremental-selection state
3. No compatibility aliases or duplicate field surfaces are added

## Test Plan

### New/Modified Tests

1. `packages/engine/test/helpers/decision-param-helpers.ts` and related helper tests — force explicit narrowing before using bounds
2. `packages/engine/test/unit/*` pending-choice fixture tests — update fixtures so `chooseOne` cannot carry `min` / `max`
3. `packages/runner/test/*` choice/render-model tests — verify multi-select bounds are consumed only from `chooseN`

### Commands

1. `pnpm turbo build`
2. `pnpm turbo typecheck`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/runner test`
5. `pnpm run check:ticket-deps`
