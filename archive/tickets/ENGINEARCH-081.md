# ENGINEARCH-081: Consolidate scoped decision-ID composition and complete parity coverage

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel decision-id + choice effects + unit tests
**Deps**: None

## Problem

Decision-ID scoping logic was extracted into `scopeDecisionIdForIteration`, but call sites still compose and scope in two steps. This leaves a footgun for future call sites and obscures intent in effect code. Test coverage is also not fully symmetric across `chooseOne` and `chooseN` for static vs templated bind behavior under `iterationPath`.

## Assumption Reassessment (2026-02-26)

1. `effects-choice.ts` currently calls `composeDecisionId(...)` and then `scopeDecisionIdForIteration(...)` in both `applyChooseOne` and `applyChooseN`.
2. There are no additional runtime call sites using this split-step pattern.
3. Current effect-level tests directly cover:
   - `chooseOne` static bind + `iterationPath` suffixing,
   - `chooseN` templated bind + no extra suffixing.
4. Missing direct matrix coverage remains:
   - `chooseN` static bind + `iterationPath` suffixing,
   - `chooseOne` templated bind + no extra suffixing.
5. `decision-id.test.ts` currently validates the two low-level helpers independently, but does not validate a canonical one-step API.

## Architecture Reassessment

1. A one-step helper (`composeScopedDecisionId`) is a net architectural improvement over requiring callers to sequence two helpers correctly.
2. Centralizing this contract reduces misuse risk and makes future effect call sites easier to audit.
3. This is purely game-agnostic kernel infrastructure; no game-specific identifiers, branching, or schema coupling is introduced.
4. No backward-compatibility aliasing or shims are required. Existing helpers can remain as low-level primitives for focused unit tests, while call sites migrate to the canonical helper.

## What to Change

### 1. Add canonical one-step helper in `decision-id.ts`

Introduce:
```ts
composeScopedDecisionId(internalDecisionId, bindTemplate, resolvedBind, iterationPath)
```

It must compose and apply iteration scoping in one place, preserving existing semantics.

### 2. Migrate choice-effect call sites to canonical helper

Update `applyChooseOne` and `applyChooseN` to use `composeScopedDecisionId` directly.

### 3. Complete parity test matrix

Add effect-level tests for the two missing matrix cases:
- `chooseN` static bind + `iterationPath` => suffixed ID
- `chooseOne` templated bind + `iterationPath` => no extra suffix

Add `decision-id` unit tests for `composeScopedDecisionId` parity with existing behavior.

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
2. Choice-effect call sites use canonical one-step decision-id helper.
3. `pnpm turbo build`
4. `node --test` run for affected engine unit tests from built output
5. `pnpm turbo test --force`
6. `pnpm turbo lint`

### Invariants

1. Decision-ID generation/scoping contract is centralized in one canonical call-site API.
2. Static-bind iteration uniqueness and templated-bind uniqueness remain deterministic and unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-choice.test.ts` — add missing matrix cases for `chooseN` static+iteration suffix and `chooseOne` templated+no-extra-suffix.
2. `packages/engine/test/unit/decision-id.test.ts` — add direct tests for `composeScopedDecisionId` parity with existing semantics.

### Commands

1. `pnpm turbo build`
2. `cd packages/engine && node --test dist/test/unit/decision-id.test.js dist/test/unit/effects-choice.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-02-26
- **What actually changed**:
  - Added `composeScopedDecisionId(...)` in `packages/engine/src/kernel/decision-id.ts`.
  - Migrated `applyChooseOne` and `applyChooseN` in `packages/engine/src/kernel/effects-choice.ts` to the canonical one-step helper.
  - Added direct unit tests for `composeScopedDecisionId` static-vs-templated parity.
  - Added missing effect-level matrix tests:
    - `chooseOne` templated bind + `iterationPath` (no extra suffix),
    - `chooseN` static bind + `iterationPath` (suffix applied).
- **Deviations from original plan**:
  - None. The reassessment only tightened assumptions/scope before implementation.
- **Verification results**:
  - `pnpm turbo build` passed.
  - `cd packages/engine && node --test dist/test/unit/decision-id.test.js dist/test/unit/effects-choice.test.js` passed.
  - `pnpm turbo test --force` passed.
  - `pnpm turbo lint` passed.
