# ENGINEARCH-113: Discriminated Decision-Authority Context Contract

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel `EffectContext`/authority typing and constructor paths
**Deps**: tickets/ENGINEARCH-098-effect-context-authority-constructor-hardening.md

## Problem

`DecisionAuthorityContext` currently allows `ownershipEnforcement: 'strict' | 'probe'` as a free union independent of interpreter mode, so invalid combinations are still representable and only guarded by runtime checks in effect handlers. This weakens long-term contract robustness.

## Assumption Reassessment (2026-02-27)

1. Current code sets strict authority in execution paths and probe authority in legality-probe paths, but the type system does not enforce this separation.
2. `effects-choice.ts` currently gates probe-only mismatch reasons with `ctx.mode === 'discovery'` plus `ownershipEnforcement === 'probe'`, which is a runtime safeguard rather than a compile-time contract.
3. Mismatch: architecture intent is explicit probe vs resolution separation, but context typing still permits incoherent states. Corrected scope: make authority/mode compatibility explicit and enforced by types and canonical constructors.

## Architecture Check

1. A discriminated context contract is cleaner and more extensible than relying on ad hoc runtime conditionals for impossible states.
2. This change is game-agnostic and keeps GameDef/simulation generic; it does not encode game-specific logic or visual concerns.
3. No backwards-compatibility shims or aliasing; contract is tightened in place and invalid states are removed.

## What to Change

### 1. Introduce discriminated authority/context types

Refactor effect-context typing so probe authority is only available in discovery probe contexts, while execution/strict contexts cannot represent probe authority.

### 2. Centralize context construction through typed constructors

Add or tighten context constructors/builders that produce only valid context variants (for example strict execution context and probe discovery context), then migrate call sites.

### 3. Simplify ownership mismatch logic using stronger types

Use the discriminated types to remove redundant mixed-mode checks in `effects-choice` and keep probe-only reason emission tied to the probe context variant.

## Files to Touch

- `packages/engine/src/kernel/effect-context.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/effects-choice.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/initial-state.ts` (modify)
- `packages/engine/src/kernel/phase-lifecycle.ts` (modify)
- `packages/engine/src/kernel/trigger-dispatch.ts` (modify)
- `packages/engine/src/kernel/event-execution.ts` (modify)
- `packages/engine/test/unit/kernel/effect-context-contracts.test.ts` (add/modify)
- `packages/engine/test/unit/kernel-source-ast-guard.test.ts` (modify if constructor usage is contract-enforced there)

## Out of Scope

- Choice option-domain validation policy changes.
- GameSpecDoc schema or visual-config schema changes.
- Runner transport/UI behavior.

## Acceptance Criteria

### Tests That Must Pass

1. Invalid authority/mode combinations are unrepresentable or rejected at compile-time in context construction paths.
2. Probe-only mismatch reason emission remains reachable only from probe discovery contexts.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Effect context authority semantics are explicit, deterministic, and centrally constructed.
2. Kernel/runtime remains game-agnostic with no game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-context-contracts.test.ts` — verifies constructors/types enforce valid authority/mode combinations.
2. `packages/engine/test/unit/kernel/effects-choice.test.ts` — ensures probe-only mismatch reason is emitted only through probe discovery context variant.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-context-contracts.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/effects-choice.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`
