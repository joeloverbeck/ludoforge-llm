# ENGINEARCH-122: Free-Operation Zone-Filter Deferral Generic Binding Classifier

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — turn-flow eligibility zone-filter evaluation policy
**Deps**: archive/tickets/ENGINEARCH-106-free-operation-denial-cause-mapping-exhaustiveness.md

## Problem

Discovery-time free-operation zone-filter deferral currently depends on a hardcoded binding name (`$zone`). This leaks naming assumptions into kernel policy and can reject otherwise valid GameSpecDocs that use different zone binding identifiers.

## Assumption Reassessment (2026-02-27)

1. `evaluateZoneFilterForMove` currently defers `MISSING_BINDING` only when `binding === '$zone'` on `legalChoices` surface.
2. Game-authored zone-filter expressions can reference arbitrary binding names and should not require engine-reserved naming.
3. Mismatch: current deferral predicate is not binding-name agnostic; corrected scope is to introduce a generic classifier for deferrable unresolved zone-filter bindings.

## Architecture Check

1. A typed deferral classifier is cleaner and more robust than string-literal binding checks in the evaluator.
2. This preserves agnostic boundaries: GameSpecDoc controls rule data, while kernel stays generic across naming choices.
3. No backwards-compatibility aliasing/shims; one canonical deferral policy path.

## What to Change

### 1. Add a canonical deferrable zone-filter resolution policy helper

Create a kernel helper that classifies whether a zone-filter evaluation failure is deferrable during discovery probing (for unresolved binding scenarios).

### 2. Replace hardcoded `$zone` check

Refactor free-operation zone-filter evaluation catch handling to call the new helper instead of checking `cause.context?.binding === '$zone'`.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/` (new helper module for deferral classification)
- `packages/engine/test/unit/kernel/` (modify/add targeted tests)

## Out of Scope

- Changing denial-cause taxonomy.
- Reworking GameSpecDoc schema.

## Acceptance Criteria

### Tests That Must Pass

1. Discovery deferral works for unresolved zone bindings regardless of binding identifier string.
2. Non-deferrable zone-filter errors remain hard failures with typed diagnostics.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Kernel behavior remains game-agnostic with no binding-name conventions encoded in policy.
2. Free-operation denial projection semantics remain deterministic across surfaces.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — add unresolved non-`$zone` binding scenario to ensure discovery deferral remains generic.
2. `packages/engine/test/unit/kernel/legal-choices.test.ts` — assert legal/illegal projection still behaves correctly after classifier refactor.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/move-decision-sequence.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`
