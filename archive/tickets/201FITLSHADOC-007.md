# 201FITLSHADOC-007: Live schedule-distance lower-bound carrier for Monsoon policy conditions

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — generic policy expression handling for explicitly-authored schedule-distance lower-bound fallback
**Deps**: `archive/tickets/201FITLSHADOC-006.md`

## Problem

Ticket 006 added `shared.monsoonOperationalRestriction` and proved Spec 197 plan-template suppression when `condition.monsoonNow.satisfied` is active, but its Monsoon witness has to force the compiled condition target to `true` inside a cloned proposal catalog. At ticket start, the production FITL carrier was authored as:

```yaml
monsoonNow:
  type: boolean
  expr:
    lte:
      - coalesce:
          - { ref: schedule.distance.toBoundary.coupEntry.cards }
          - 999
      - 2
```

In the isolated proposal context, the top-N-visible schedule-distance provider reports a partial lower bound for the current played card plus lookahead Coup rather than a ready numeric value. That lower-bound metadata is preserved, but normal value-expression evaluation does not convert it into a number. The resulting condition cannot become live without the test-only forced-ready catalog.

This is a real gap for Foundation #15 and #16: the YAML is truthful about FITL's lookahead-Coup Monsoon carrier, but the generic policy expression layer lacks an explicit, traceable way for authored boolean conditions to opt into a safe lower-bound interpretation.

## Assumption Reassessment (2026-05-28)

1. `archive/tickets/201FITLSHADOC-006.md` delivered the shared Monsoon gating module and profile bindings, so this ticket must not re-own the module or the 31 P4 witness files.
2. Existing policy evaluation already distinguishes schedule-distance `ready` from `partial.lowerBound` and records lower-bound fallback for score considerations; this ticket should reuse that generic concept rather than inventing FITL-specific Monsoon code.
3. The current `coalesce(schedule.distance..., 999) <= 2` authoring is not enough, because partial lower-bound resolution is not a ready numeric value and must not be silently coerced under Foundation #20's provenance discipline.
4. The clean behavior target is a live `shared-monsoon-awareness-*` proposal witness that uses the production compiled `condition.monsoonNow` without replacing the condition target in a test-only catalog.

## Architecture Check

1. The implementation must stay engine-agnostic: add a generic schedule-distance partial-lower-bound opt-in usable by any game spec, with no FITL ids, card names, faction ids, or Monsoon branches in engine code.
2. The opt-in must be explicit in GameSpecDoc YAML and visible in compiled IR or trace evidence. Do not make all partial schedule-distance refs behave like ready numbers.
3. The change must preserve Foundation #20 semantics: partial, unknown, hidden, failed, and ready outcomes remain distinct; lower-bound use is allowed only when authored and surfaced as such.
4. The FITL YAML may then migrate `feature.monsoonNow` to the new explicit form, but `shared.monsoonOperationalRestriction` and profile bindings remain owned by ticket 006.

## What to Change

### 1. Generic schedule-distance lower-bound opt-in

Add a generic authored policy-expression mechanism that allows a schedule-distance ref to use `partial.lowerBound` as its numeric value for explicitly bounded boolean comparisons. Acceptable implementations include either:

- an expression-local option on schedule-distance refs such as `fallbackOnPartial: useLowerBound`, or
- a small generic expression wrapper that converts only `partial.lowerBound` schedule-distance resolutions to their lower-bound value.

The exact syntax should follow existing compiler and policy-surface conventions after implementation reassessment.

### 2. FITL Monsoon carrier migration

Update `data/games/fire-in-the-lake/92-agents.md` so `stateFeatures.monsoonNow` uses the new explicit lower-bound fallback instead of relying on plain `coalesce` over an unavailable partial.

### 3. Live Monsoon witness

Update the ticket-006 Monsoon witness helper so `assertMonsoonAwarenessWitness` proves template suppression from the production compiled `condition.monsoonNow` in a state with lookahead Coup. Remove the test-only condition-target replacement used by `catalogWithMonsoonConditionActive`.

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)
- `packages/engine/src/agents/policy-runtime.ts` (modify if provider/result typing changes)
- `packages/engine/src/agents/policy-surface.ts` or compiler-side policy expression parsing files (modify, exact owner to verify)
- `packages/engine/src/kernel/types-core.ts` and `packages/engine/src/kernel/schemas-core.ts` (modify if compiled IR shape changes)
- `packages/engine/test/integration/partial-visibility-*.test.ts` or `packages/engine/test/unit/agents/schedule-ref-*.test.ts` (modify/add)
- `packages/engine/test/policy-profile-quality/shared-doctrine-witness-helpers.ts` (modify)
- `data/games/fire-in-the-lake/92-agents.md` (modify)
- `specs/201-fitl-shared-doctrine-and-lifecycle.md` (modify if the final authored YAML syntax differs from the current draft)

## Out of Scope

- Adding FITL-specific engine branches or hardcoded `monsoonNow` behavior.
- Re-authoring `shared.monsoonOperationalRestriction` or changing its profile bindings.
- Broad partial-value coercion for non-schedule refs.
- Changing hidden-information policy or widening observer visibility to make the schedule ref ready.

## Acceptance Criteria

### Tests That Must Pass

1. A generic schedule-distance partial-visibility test proves an authored lower-bound fallback converts only `partial.lowerBound` schedule-distance results into a numeric value, while un-authored expressions still treat partials as unavailable.
2. The FITL Monsoon policy-profile witnesses pass without replacing `condition.monsoonNow` in a cloned catalog.
3. Existing partial-visibility fallback routing tests continue to pass and still distinguish ready, partial, and unavailable outcomes.
4. `pnpm -F @ludoforge/engine build`
5. `node --test packages/engine/dist/test/policy-profile-quality/shared-monsoon-awareness-*.test.js`
6. `pnpm turbo schema:artifacts`

### Invariants

1. No game-specific ids are introduced into engine, compiler, schema, or runtime code.
2. Partial lower-bound use is explicit and traceable; it is not a default coercion path.
3. The production FITL catalog, not a forced-ready test clone, drives Monsoon plan-template suppression.

## Test Plan

### New/Modified Tests

1. Generic schedule-distance expression test — proves explicit lower-bound fallback behavior and the no-fallback unavailable path.
2. `packages/engine/test/policy-profile-quality/shared-monsoon-awareness-{us,arvn,nva,vc}.test.ts` via the shared helper — proves live FITL Monsoon suppression without test-only condition replacement.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/policy-profile-quality/shared-monsoon-awareness-*.test.js`
3. `node --test packages/engine/dist/test/integration/partial-visibility-*.test.js packages/engine/dist/test/unit/agents/schedule-ref-*.test.js`
4. `pnpm turbo schema:artifacts`

## Outcome

Completed on 2026-05-28.

Implemented a generic, explicit `scheduleLowerBound` policy expression operator for schedule-distance refs:

- Added `scheduleLowerBound` to the agent policy operator union and runtime schemas.
- Added compiler analysis that accepts only numeric expressions containing a schedule-distance ref.
- Added direct runtime evaluation that preserves ready values and converts only `partial.lowerBound` schedule-distance results to the lower-bound value, recording `fallbackApplied: useLowerBound` on the schedule input trace.
- Kept the WASM bytecode path fail-closed to dynamic evaluation for this operator until a dedicated VM opcode exists.
- Migrated FITL `stateFeatures.monsoonNow` to `scheduleLowerBound(schedule.distance.toBoundary.coupEntry.cards) <= 2`.
- Removed the forced-ready Monsoon condition override from the shared Monsoon witness helper; the production compiled condition now drives Spec 197 template suppression.
- Regenerated `packages/engine/schemas/GameDef.schema.json`.

No `policy-runtime.ts` or `policy-surface.ts` edit was needed after live reassessment: the existing schedule-distance provider already exposes ready/partial/unavailable resolution, and the operator belongs in generic policy-expression analysis/evaluation.

Source-size decision: user approved option 2 on 2026-05-28. Several touched shared source owners are preexisting oversized files (`policy-evaluation-core.ts`, `policy-expr.ts`, `schemas-core.ts`, `types-core.ts`). This ticket's active additions are small and cohesive inside those existing owners; broad extraction is intentionally deferred rather than mixed into the semantic lower-bound carrier fix.

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/integration/partial-visibility-expression-lower-bound.test.js packages/engine/dist/test/policy-profile-quality/shared-monsoon-awareness-us.test.js packages/engine/dist/test/policy-profile-quality/shared-monsoon-awareness-arvn.test.js packages/engine/dist/test/policy-profile-quality/shared-monsoon-awareness-nva.test.js packages/engine/dist/test/policy-profile-quality/shared-monsoon-awareness-vc.test.js` — passed, 6 tests.
- `node --test packages/engine/dist/test/integration/partial-visibility-*.test.js packages/engine/dist/test/unit/agents/schedule-ref-*.test.js` — passed, 43 tests.
- `pnpm turbo schema:artifacts` — passed; regenerated `GameDef.schema.json`.
- `node --test packages/engine/dist/test/policy-profile-quality/shared-*.test.js packages/engine/dist/test/architecture/shared-modules-bound-by-all-profiles.test.js packages/engine/dist/test/architecture/no-per-faction-block-immediate-win.test.js` — passed, 31 tests.
- `node --test dist/test/unit/json-schema.test.js` from `packages/engine/` — passed, 36 tests.
- `node --test packages/engine/dist/test/unit/schemas-top-level.test.js` — passed, 71 tests.

Known verification note: running `node --test packages/engine/dist/test/unit/json-schema.test.js packages/engine/dist/test/unit/schemas-top-level.test.js` from repo root failed before executing `json-schema.test.js` because that test expects `schemas/*.schema.json` relative to the package cwd. The same JSON-schema test passed from `packages/engine/`.
