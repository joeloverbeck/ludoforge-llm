# DECINSARC-007: Finish runner DecisionKey alignment and remove residual key-shape heuristics

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: DECINSARC-001, DECINSARC-002, DECINSARC-006

## Problem

The broad runner migration to `decisionKey` is already in place. The remaining gap is architectural cleanup: the runner still contains residual key-shape heuristics and a few overly-loose `string` types that let pre-Spec-60 assumptions survive in source and tests.

The most important remaining issue is `packages/runner/src/model/iteration-context.ts`: it uses `parseDecisionKey()`, but still falls back to runner-local regex parsing and dual behavior based on whether a key looks templated. That is weaker than the current engine architecture, which treats `DecisionKey` codec output as the authoritative identity/shape contract.

## Assumption Reassessment (2026-03-13)

1. `PartialChoice` in `store-types.ts` already uses `decisionKey: DecisionKey` — confirmed, no migration needed there.
2. `game-store.ts` already builds params from `choice.decisionKey` and reads `state.choicePending.decisionKey` — confirmed, no store migration remains.
3. `iteration-context.ts` already imports `parseDecisionKey`, but still uses a local `ITERATION_INDEX_PATTERN` regex and bifurcated logic for templated vs non-templated keys — confirmed, this is the primary remaining code issue.
4. `derive-render-model.ts` already threads `decisionKey`, but helper signatures still accept plain `string` and therefore do not encode the stronger `DecisionKey` contract in runner internals.
5. `render-model.ts` still exposes several `decisionKey` fields as plain `string`; this is survivable at runtime but weaker than the shared architecture and invites drift.
6. Worker bridge still passes `Move`/`ChoiceRequest` transparently — confirmed, no changes needed.
7. Runner tests still encode outdated assumptions:
   - some tests still assert `decisionKey.startsWith('decision:')`
   - `iteration-context.test.ts` still centers old key examples that omit canonical loop `iterationPath` for templated keys
8. Runner code/tests must not assume every `DecisionKey` starts with `decision:`: simple binds legitimately serialize to raw keys, and loop context should be derived from codec semantics rather than ad hoc prefix checks.

## Architecture Check

1. Runner should use the same `DecisionKey` type from engine anywhere the value is still a decision identity rather than a generic display string.
2. `parseDecisionKey()` from the engine codec should be the sole parser for decision identity; runner-local regex parsing should not reinterpret key structure.
3. No backwards-compatibility shims, aliasing, or legacy key-shape assumptions in runner logic or tests.

## What to Change

### 1. Clean up `packages/runner/src/model/iteration-context.ts`

- Remove `ITERATION_INDEX_PATTERN`
- Change `parseIterationContext()` to accept `decisionKey: DecisionKey`
- Derive loop index from parsed codec output rather than runner-local key-shape regex
- Preserve the useful behavior of resolving the current entity against the most recent array choice in the breadcrumb, but only as a consumer of parsed key semantics

### 2. Tighten runner `DecisionKey` typing

- Update `packages/runner/src/model/derive-render-model.ts` helper signatures that still take plain `string` decision identities
- Update `packages/runner/src/model/render-model.ts` decision identity fields to use `DecisionKey` where appropriate
- Keep UI/display-oriented values as plain strings only where they are no longer semantic decision identities

### 3. Update runner tests to match the actual architecture

- Remove assertions that every pending decision key begins with `decision:`
- Rewrite/add iteration-context coverage around canonical parsed-key behavior, including loop `iterationPath`
- Strengthen tests around raw-key and templated-key cases so the runner stays aligned with Spec 60 semantics

## Files to Touch

- `packages/runner/src/model/iteration-context.ts` (modify)
- `packages/runner/src/model/derive-render-model.ts` (modify)
- `packages/runner/src/model/render-model.ts` (modify)
- `packages/runner/test/model/iteration-context.test.ts` (modify)
- `packages/runner/test/store/game-store-async-serialization.test.ts` (modify)
- Additional runner tests as needed for typed `DecisionKey` propagation

## Out of Scope

- Repeating already-completed runner migration work in `store-types.ts` or `game-store.ts` unless a newly discovered defect requires it
- Modifying engine kernel source files
- Modifying engine tests
- Worker bridge changes
- Visual config or CSS changes
- Game-specific UI behavior
- Animation system changes

## Acceptance Criteria

### Tests That Must Pass

1. Runner unit tests pass: `pnpm -F @ludoforge/runner test`
2. `parseIterationContext()` uses codec-parsed `DecisionKey` semantics only; no local regex parser remains
3. Runner-facing render-model decision identity fields use `DecisionKey` where they still represent canonical decision identity
4. Tests do not assume every `DecisionKey` starts with `decision:`
5. Iteration-context coverage includes canonical loop-path cases and raw-key/static-bind cases
6. Runner typecheck passes: `pnpm -F @ludoforge/runner exec tsc --noEmit`
7. Runner lint passes: `pnpm -F @ludoforge/runner lint`

### Invariants

1. No runner-local regex-based decision identity parsing.
2. Runner imports `DecisionKey` and codec functions from `@ludoforge/engine` public API.
3. Render/model code does not weaken canonical decision identities back to generic strings without need.
4. Worker bridge remains unchanged.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/iteration-context.test.ts` — rewrite around canonical parsed-key semantics, including iteration-path cases
2. `packages/runner/test/store/game-store-async-serialization.test.ts` — remove invalid `decision:` prefix assumptions
3. Any render-model tests needed to lock `DecisionKey` propagation and grouping behavior

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner exec tsc --noEmit`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Outcome amended: 2026-03-13
- Completion date: 2026-03-13
- What actually changed:
  - corrected the ticket scope before implementation because the store-level `decisionKey` migration was already complete
  - removed the residual runner-local key regex from `iteration-context.ts` and made it consume parsed `DecisionKey` semantics instead
  - removed the remaining templated-key fallback that inferred iteration UI context from prior array choices when no canonical `iterationPath` was present
  - aligned render-model tests with canonical loop keys so iteration labels now come only from codec-backed loop identity
  - tightened runner render-model decision identity fields and helper signatures to use `DecisionKey`
  - updated runner tests to stop assuming all decision keys begin with `decision:`
  - added regression coverage ensuring templated keys with loop `iterationPath` use the canonical path rather than a first-match lookup
- Deviations from original plan:
  - did not modify `packages/runner/src/store/store-types.ts` or `packages/runner/src/store/game-store.ts` because those migrations had already landed
  - did not make worker-bridge or UI architecture changes beyond the type-tightening required to keep canonical decision identity intact through the render model
- Verification results:
  - `pnpm -F @ludoforge/runner test` passed
  - `pnpm -F @ludoforge/runner exec tsc --noEmit` passed
  - `pnpm -F @ludoforge/runner lint` passed with pre-existing warnings only
  - `pnpm turbo test` passed
  - `pnpm turbo typecheck` passed
  - `pnpm turbo lint` passed with pre-existing warnings only
