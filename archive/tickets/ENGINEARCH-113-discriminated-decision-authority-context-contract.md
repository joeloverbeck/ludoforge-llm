# ENGINEARCH-113: Discriminated Decision-Authority Context Contract

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel `EffectContext`/authority typing and constructor paths
**Deps**: archive/tickets/ENGINEARCH-098-effect-context-authority-constructor-hardening.md

## Problem

`DecisionAuthorityContext` currently allows `ownershipEnforcement: 'strict' | 'probe'` as a free union independent of interpreter mode, so invalid combinations are still representable and only guarded by runtime checks in effect handlers. This weakens long-term contract robustness.

## Assumption Reassessment (2026-02-27)

1. Current code sets strict authority in execution paths and probe authority in legality-probe paths, but the type system does not enforce this separation.
2. `effects-choice.ts` currently gates probe-only mismatch reasons with `ctx.mode === 'discovery'` plus `ownershipEnforcement === 'probe'`, which is a runtime safeguard rather than a compile-time contract.
3. Mismatch: architecture intent is explicit probe vs resolution separation, but context typing still permits incoherent states. Corrected scope: make authority/mode compatibility explicit and enforced by types and canonical constructors.
4. Test-plan discrepancy found: `packages/engine/test/unit/kernel/effect-context-contracts.test.ts` and `packages/engine/test/unit/kernel/effects-choice.test.ts` do not exist. Existing coverage lives in `packages/engine/test/unit/kernel/choice-authority-runtime-invariants.test.ts`, `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts`, and `packages/engine/test/unit/effects-choice.test.ts`.
5. File-scope discrepancy found: `apply-move.ts`, `initial-state.ts`, `phase-lifecycle.ts`, `trigger-dispatch.ts`, and `event-execution.ts` already route through canonical constructors and do not need direct edits for this ticket unless constructor signatures force callsite changes.

## Architecture Check

1. A discriminated context contract is cleaner and more extensible than relying on ad hoc runtime conditionals for impossible states.
2. This change is game-agnostic and keeps GameDef/simulation generic; it does not encode game-specific logic or visual concerns.
3. No backwards-compatibility shims or aliasing; contract is tightened in place and invalid states are removed.

## What to Change

### 1. Introduce discriminated authority/context types

Refactor effect-context typing so probe authority is only available in discovery probe contexts, while execution contexts cannot represent probe authority.

### 2. Centralize context construction through typed constructors

Tighten context constructors/builders to produce only valid context variants (strict execution context, strict discovery context, and explicit probe discovery context), then migrate the single discovery probe call path in legal-choices.

### 3. Simplify ownership mismatch logic using stronger types

Use the discriminated types to remove redundant mixed-mode checks in `effects-choice` and keep probe-only reason emission tied to the probe discovery context variant.

## Files to Touch

- `packages/engine/src/kernel/effect-context.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/effects-choice.ts` (modify)
- `packages/engine/test/unit/kernel/choice-authority-runtime-invariants.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` (modify)
- `packages/engine/test/unit/effects-choice.test.ts` (modify)
- `packages/engine/test/helpers/effect-context-test-helpers.ts` (modify if stricter typing requires explicit probe helper)

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

1. `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` — verifies constructor surface and default authority wiring remain centralized and explicit.
2. `packages/engine/test/unit/kernel/choice-authority-runtime-invariants.test.ts` — ensures probe-only mismatch reason is emitted only through probe discovery context variant.
3. `packages/engine/test/unit/effects-choice.test.ts` — exercises choice behavior under strict vs probe discovery contexts through runtime effect application.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-context-construction-contract.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/choice-authority-runtime-invariants.test.js`
4. `node --test packages/engine/dist/test/unit/effects-choice.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-28
- What actually changed:
  - Introduced discriminated decision-authority types (`strict` vs `probe`) and discriminated effect-context variants in kernel typing.
  - Added explicit strict/probe discovery constructor paths in `effect-context.ts`, while keeping a canonical `createDiscoveryEffectContext` boundary for callsites.
  - Updated discovery effect-context construction in `legal-choices.ts` to route ownership enforcement through typed constructor selection.
  - Simplified choice owner-mismatch reason branching in `effects-choice.ts` by relying on discriminated ownership enforcement.
  - Extended test helpers with an explicit discovery-probe context constructor and tightened helper typing.
  - Strengthened contract/invariant tests for constructor surface and strict-vs-probe mismatch behavior.
- Deviations from original plan:
  - Original plan referenced non-existent test files and over-scoped runtime boundary modules; this was corrected before implementation.
  - No edits were needed in `apply-move.ts`, `initial-state.ts`, `phase-lifecycle.ts`, `trigger-dispatch.ts`, or `event-execution.ts`.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - Targeted tests passed:
    - `node --test packages/engine/dist/test/unit/kernel/effect-context-construction-contract.test.js`
    - `node --test packages/engine/dist/test/unit/kernel/choice-authority-runtime-invariants.test.js`
    - `node --test packages/engine/dist/test/unit/effects-choice.test.js`
    - `node --test packages/engine/dist/test/unit/effect-context-test-helpers.test.js`
  - Full engine suite passed: `pnpm -F @ludoforge/engine test` (315/315).
  - Engine lint passed: `pnpm -F @ludoforge/engine lint`.
