# ENGINEARCH-081: Consolidate scoped decision-ID composition and complete parity coverage

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel decision-id + choice effects + unit tests
**Deps**: None

## Problem

Decision-ID scoping logic was extracted into `scopeDecisionIdForIteration`, but call sites still compose and scope in two steps, and test coverage is not fully symmetric across `chooseOne` and `chooseN` for static vs templated bind behavior under `iterationPath`.

## Assumption Reassessment (2026-02-26)

1. `effects-choice.ts` currently calls `composeDecisionId(...)` and then `scopeDecisionIdForIteration(...)` in both `applyChooseOne` and `applyChooseN`.
2. Current tests cover:
   - `chooseOne` static bind + `iterationPath` suffixing,
   - `chooseN` templated bind + no extra suffixing.
3. Mismatch + correction: remaining matrix cases (`chooseN` static + suffix, `chooseOne` templated + no suffix) are not directly asserted; API shape still allows split-step misuse in future call sites.

## Architecture Check

1. A single API (`composeScopedDecisionId`) is cleaner than requiring callers to sequence two low-level helpers.
2. This remains game-agnostic kernel infrastructure; no game-specific identifiers/branches are introduced.
3. No backwards-compatibility aliasing/shims: migrate call sites to canonical API and remove split-step usage where not needed.

## What to Change

### 1. Add canonical one-step helper in `decision-id.ts`

Introduce:
```ts
composeScopedDecisionId(internalDecisionId, bindTemplate, resolvedBind, iterationPath)
```

It should internally call composition + iteration scoping and become the preferred call-site API.

### 2. Migrate choice-effect call sites to canonical helper

Update `applyChooseOne` and `applyChooseN` to use `composeScopedDecisionId` directly.

### 3. Complete parity test matrix

Add effect-level tests to cover missing matrix cases:
- `chooseN` static bind + `iterationPath` => suffixed ID
- `chooseOne` templated bind + `iterationPath` => no extra suffix

Optionally add a compact table-driven helper in tests to make matrix completeness explicit.

## Files to Touch

- `packages/engine/src/kernel/decision-id.ts` (modify)
- `packages/engine/src/kernel/effects-choice.ts` (modify)
- `packages/engine/test/unit/decision-id.test.ts` (modify)
- `packages/engine/test/unit/effects-choice.test.ts` (modify)

## Out of Scope

- Any change to decision ID string format semantics
- Changing move-param transport or choice payload schemas
- Game-specific behavior additions

## Acceptance Criteria

### Tests That Must Pass

1. `chooseOne` and `chooseN` both assert static+iteration suffix and templated+no-extra-suffix behavior.
2. Choice effect call sites use canonical one-step decision-id helper.
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. Decision-ID generation/scoping contract is centralized in one canonical API.
2. Static-bind iteration uniqueness and templated-bind uniqueness remain deterministic and unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-choice.test.ts` — add the two missing matrix cases and keep existing cases.
2. `packages/engine/test/unit/decision-id.test.ts` — add direct tests for `composeScopedDecisionId` parity with existing semantics.

### Commands

1. `pnpm turbo build`
2. `cd packages/engine && node --test dist/test/unit/decision-id.test.js dist/test/unit/effects-choice.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`
