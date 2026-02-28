# ENGINEARCH-115: Effect-Context Constructor Behavior Contract Tests

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Test-only expected — kernel effect-context constructor runtime contract coverage
**Deps**: None

## Problem

Current constructor contract coverage in `effect-context-construction-contract.test.ts` is AST/source-shape oriented. That verifies code structure, but it does not directly execute constructor functions to assert runtime output contracts (defaults and overrides).

## Assumption Reassessment (2026-02-28)

1. `createExecutionEffectContext` and `createDiscoveryEffectContext` are the canonical top-level runtime constructor entry points used by engine boundary code.
2. The current constructor contract test is source/AST-based and does not execute constructors directly.
3. Runtime behavior is partially covered indirectly in downstream tests (for example choice-authority invariants), but constructor output contracts themselves are not asserted directly in a focused unit test.
4. Corrected scope: add direct runtime constructor behavior assertions for defaults and override paths; keep broader source-guard precision work in `ENGINEARCH-116`.

## Architecture Check

1. Runtime contract tests are the right long-lived boundary for constructor semantics; they are less brittle than source-shape assertions for behavior guarantees.
2. This remains game-agnostic kernel test coverage and does not encode any game-specific rules/data.
3. No compatibility shims/aliases. Canonical constructors remain the only contract surface.

## What to Change

### 1. Add direct execution-constructor behavior tests

Assert forced `mode: 'execution'`, `decisionAuthority.source: 'engineRuntime'`, strict ownership enforcement default, and active-player authority default.

### 2. Add direct discovery-constructor behavior tests

Assert forced `mode: 'discovery'`, `decisionAuthority.source: 'engineRuntime'`, and strict/probe enforcement paths.

### 3. Add override-path behavior tests

Assert `decisionAuthorityPlayer` override is honored for execution and discovery constructors, and wrapper ownership-enforcement selection is deterministic.

## Files to Touch

- `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` (modify)

## Out of Scope

- Kernel runtime behavior changes outside constructor outputs.
- Changing ownership error classification semantics.
- New effect runtime entry points.
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

1. `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` — migrate constructor contract assertions to direct runtime behavior checks (defaults + overrides + wrapper selection).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-context-construction-contract.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-02-28
- **What Changed**:
  - Replaced AST/source-shape constructor checks in `effect-context-construction-contract.test.ts` with direct runtime contract assertions.
  - Added explicit coverage for execution defaults, discovery strict/probe paths, wrapper strict/probe selection, and `decisionAuthorityPlayer` override behavior.
- **Deviations from Original Plan**:
  - No kernel source changes were needed in `packages/engine/src/kernel/effect-context.ts`; ticket completed with test-only changes.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/effect-context-construction-contract.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`315` tests, `0` failures).
  - `pnpm -F @ludoforge/engine lint` passed.
