# ENGINEARCH-115: Effect-Context Constructor Behavior Contract Tests

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel effect-context constructor contract tests
**Deps**: None

## Problem

Current constructor hardening relies heavily on source-text/AST guard checks. That protects structure, but does not directly assert runtime constructor behavior (defaults and overrides) with executable assertions.

## Assumption Reassessment (2026-02-27)

1. `createExecutionEffectContext` and `createDiscoveryEffectContext` are now canonical runtime constructors for top-level effect boundaries.
2. Existing tests verify call-site routing and source-level constructor defaults, but do not directly execute constructors to assert semantic output contracts.
3. Mismatch: constructor semantics are critical runtime contract but under-covered behaviorally. Corrected scope: add focused behavior tests for constructor outputs under default and override paths.

## Architecture Check

1. Behavioral contract tests are more robust than source-regex-only checks for semantic guarantees.
2. This is game-agnostic kernel-contract testing and does not encode any GameSpecDoc/visual-config data or branching.
3. No backwards-compatibility shims; contracts are asserted against canonical constructors directly.

## What to Change

### 1. Add direct execution-constructor behavior tests

Assert default authority source/player/enforcement and forced execution mode.

### 2. Add direct discovery-constructor behavior tests

Assert default authority source/player/enforcement and forced discovery mode.

### 3. Add override-path behavior tests

Assert `decisionAuthorityPlayer` and `ownershipEnforcement` overrides are honored deterministically.

## Files to Touch

- `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` (modify)
- `packages/engine/src/kernel/effect-context.ts` (modify only if testability/typing exposure needs tightening)

## Out of Scope

- Changing how choice ownership errors are classified.
- Adding new effect runtime entry points.
- Game-specific schema/runtime behavior.

## Acceptance Criteria

### Tests That Must Pass

1. Constructor default behavior is covered by direct runtime assertions for execution and discovery variants.
2. Constructor override behavior for authority player/enforcement is covered by direct runtime assertions.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Constructor output semantics remain deterministic and centrally enforced.
2. Authority defaults remain engine-owned and strict unless explicitly overridden.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` — adds direct constructor behavior assertions (defaults and override paths).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-context-construction-contract.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
