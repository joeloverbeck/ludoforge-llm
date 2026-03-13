# DECINSARC-002: Migrate pending-choice identity to DecisionKey as one green vertical slice

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes
**Runner Changes**: Yes
**Deps**: None

## Problem

`DECINSARC-002` was originally written as a "types first, let the build fail" ticket. That no longer matches the repository.

`decision-scope.ts` and its codec tests already exist, but the runtime still uses the older `decisionId` + occurrence-metadata model in active code paths. Shipping only type mutations now would keep two competing identity systems alive at once and intentionally produce a red workspace. That is not the architecture we want.

The clean boundary is now an end-to-end migration slice:

1. producers emit one authoritative `decisionKey`
2. effect dispatch threads immutable `decisionScope`
3. consumers read and write `move.params` by `decisionKey`
4. helper/test infrastructure stops reconstructing identity from legacy occurrence fields

## Assumption Reassessment (2026-03-13)

1. The spec reference in the prior ticket was wrong. The relevant spec is [specs/60-decision-instance-architecture.md](/home/joeloverbeck/projects/ludoforge-llm/specs/60-decision-instance-architecture.md), not a `60-decision-input-architecture.md` file.
2. `packages/engine/src/kernel/decision-scope.ts` already exists and already has unit coverage. This is no longer a pre-codec ticket.
3. `ChoicePendingRequest` occurrence metadata is still live runtime data, not dead compatibility baggage. It is used by `effects-choice.ts`, `move-decision-sequence.ts`, `legal-choices.ts`, helpers, and tests.
4. `EffectContextBase` still carries `iterationPath` and `decisionOccurrences`, and top-level effect dispatch still seeds `DecisionOccurrenceContext`. The immutable scope model has not reached the runtime path yet.
5. A narrow two-file type change would knowingly break kernel, runner, and tests. That is not acceptable for this repository's current standards.

## Architecture Check

1. The target architecture from Spec 60 is still the right destination. One `DecisionKey` and one immutable `DecisionScope` are cleaner, more robust, and more extensible than the current alias-heavy occurrence model.
2. The old phased plan is not the right implementation boundary anymore. The repo is already midway through the migration, so a compile-breaking "types first" step now adds churn instead of reducing risk.
3. The correct ticket boundary is a green vertical slice that removes the old identity path from all migrated producers and consumers together.

## Scope

This ticket now owns the first complete runtime migration slice for decision identity.

### In Scope

- Collapse `ChoicePendingRequest` identity to `decisionKey: DecisionKey`
- Remove legacy occurrence metadata fields from `ChoicePendingRequest`
- Add `decisionScope` to `EffectContextBase` and `EffectResult`
- Thread immutable `DecisionScope` through effect dispatch and control flow
- Rewrite pending-choice production and consumption to use `decisionKey`
- Update runner/store/model code that consumes pending decisions
- Update helpers and tests that currently depend on `decisionId` or occurrence metadata
- Remove migrated runtime dependence on `decision-id.ts` and `decision-occurrence.ts`

### Out of Scope

- Any game-specific rule changes
- Any backwards-compatibility aliasing for old serialized move formats
- Incremental compatibility layers that preserve both identity models in the same runtime path

## What to Change

### 1. Kernel Types and Context

- Update `packages/engine/src/kernel/types-core.ts`
  - `ChoicePendingRequest` gets `readonly decisionKey: DecisionKey`
  - remove `decisionId`, `occurrenceIndex`, `occurrenceKey`, `nameOccurrenceIndex`, `nameOccurrenceKey`, `canonicalAlias`, `canonicalAliasOccurrenceIndex`, `canonicalAliasOccurrenceKey`
- Update `packages/engine/src/kernel/effect-context.ts`
  - `EffectContextBase` gets required `readonly decisionScope: DecisionScope`
  - remove `iterationPath` and `decisionOccurrences`
  - `EffectResult` gets optional `readonly decisionScope?: DecisionScope`
  - factory functions default to `emptyScope()`

### 2. Effect Runtime

- Update `packages/engine/src/kernel/effects-choice.ts`
  - use `advanceScope()` for identity generation
  - read `move.params` by `decisionKey`
  - emit pending requests with `decisionKey`
  - merge stochastic branches by `decisionKey`
- Update `packages/engine/src/kernel/effects-control.ts`
  - use `withIterationSegment()` instead of `iterationPath` string concatenation
- Update `packages/engine/src/kernel/effect-dispatch.ts`
  - thread `decisionScope` through effect sequences
  - seed top-level calls with `emptyScope()`

### 3. Move Construction and Legality

- Update `packages/engine/src/kernel/move-decision-sequence.ts`
  - write selections directly to `move.params[request.decisionKey]`
  - remove occurrence reconstruction
- Update `packages/engine/src/kernel/legal-choices.ts`
  - write probe selections by `decisionKey`
  - ensure synthesized pending requests use the new shape
- Update any adjacent kernel consumer still assuming `decisionId`-shaped move param keys

### 4. Runner and Helper Surface

- Update runner store/model/UI files that still expose `decisionId`
- Rewrite helper code that reconstructs occurrence state from pending requests
- Prefer codec-based parsing over regex heuristics where iteration grouping is needed

## Files to Touch

- `packages/engine/src/kernel/types-core.ts`
- `packages/engine/src/kernel/effect-context.ts`
- `packages/engine/src/kernel/effects-choice.ts`
- `packages/engine/src/kernel/effects-control.ts`
- `packages/engine/src/kernel/effect-dispatch.ts`
- `packages/engine/src/kernel/move-decision-sequence.ts`
- `packages/engine/src/kernel/legal-choices.ts`
- `packages/engine/src/kernel/move-runtime-bindings.ts`
- `packages/engine/src/kernel/apply-move.ts`
- `packages/engine/test/helpers/decision-param-helpers.ts`
- `packages/engine/test/helpers/effect-context-test-helpers.ts`
- relevant engine unit/integration tests
- relevant runner files under `packages/runner/src/`

## Acceptance Criteria

### Runtime

1. `ChoicePendingRequest` exposes a single authoritative identity field: `decisionKey`
2. `EffectContextBase` requires `decisionScope`
3. top-level effect execution starts from `emptyScope()`
4. repeated, nested, and stochastic decision identity is derived through `DecisionScope`
5. `move.params` is keyed by canonical `DecisionKey` strings, not legacy alias fallbacks

### Architecture

1. the migrated runtime path does not depend on `decision-id.ts`
2. the migrated runtime path does not depend on `decision-occurrence.ts`
3. no temporary dual-model aliasing remains in the migrated path
4. the migration remains game-agnostic

### Verification

1. engine build passes
2. runner typecheck/build passes
3. relevant unit tests pass
4. relevant integration tests covering repeated/nested/stochastic choices pass
5. lint passes

## Test Plan

### New or Updated Coverage Required

1. `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts`
   - contexts default to `emptyScope()`
2. `packages/engine/test/unit/effects-choice.test.ts`
   - pending requests expose `decisionKey`
   - repeated and iterated decisions produce canonical keys
   - stochastic merge behavior keys by `decisionKey`
3. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts`
   - selections populate `move.params` by `decisionKey`
4. `packages/engine/test/unit/kernel/legal-choices.test.ts`
   - legality probing writes candidate params by `decisionKey`
5. any regression/integration tests that previously asserted occurrence metadata
   - update them to assert canonical `decisionKey` behavior instead

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner test`
5. `pnpm turbo lint`

## Rationale for the Rewrite

The earlier ticket asked for an intentionally incomplete intermediate state. That would have been acceptable before `decision-scope.ts` existed. It is no longer acceptable now that the new codec is present and the remaining work is producer/consumer migration.

This rewritten ticket is stricter, but cleaner:

- one identity model
- one passing build
- one migration slice that can actually be reviewed and trusted

## Outcome

- Completion date: 2026-03-13
- What actually changed:
  - migrated engine pending-choice/runtime identity from legacy `decisionId` + occurrence metadata to canonical `decisionKey`
  - threaded immutable `DecisionScope` through effect dispatch, control flow, move application, legality discovery, satisfiability, and free-operation viability
  - updated move binding recovery to parse canonical `DecisionKey` params instead of reconstructing legacy occurrence state
  - updated runner store/model/UI surfaces to consume `decisionKey`
  - strengthened engine and runner tests around iterated, templated, stochastic, and compiled decision flows
- Deviations from original plan:
  - the ticket was first rewritten before implementation because its earlier assumptions were stale and its prior phased plan would have forced an intentionally red workspace
  - the migration slice touched additional adjacent consumers (`apply-move`, satisfiability, free-operation viability, runner rendering/store code) so the runtime path could be made clean in one pass
  - helper coverage was expanded to preserve canonical-key behavior for templated and macro-expanded decisions under real `node --test` execution
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine test`
  - `node --test --experimental-test-isolation=none packages/engine/dist/test/integration/effects-complex.test.js`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm turbo lint`
