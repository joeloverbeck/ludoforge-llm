# 201FITLSHADOC-001F: Candidate-aware strategic condition refs

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — generic agent policy evaluation
**Deps**: `archive/tickets/201FITLSHADOC-002.md`

## Problem

Ticket `201FITLSHADOC-003` needs the shared condition:

```yaml
allyNearWin:
  target:
    gte:
      - { ref: preview.relationship.nominalAlly.victoryMargin }
      - -1
```

The compiler accepts the preview relationship ref after `201FITLSHADOC-001B`, but runtime strategic-condition evaluation currently resolves `condition.<id>.satisfied` without passing through the active candidate. Preview relationship refs require a candidate so they can read the candidate preview state and record preview signal status.

Forcing `allyNearWin` to use current-state relationship data would weaken the authored doctrine. Deferring the condition would leave the shared ally/rival module without its intended gate. This prerequisite makes strategic-condition evaluation preserve candidate context when a condition is referenced from candidate/module/consideration expressions.

## Assumption Reassessment (2026-05-28)

1. `packages/engine/src/agents/policy-evaluation-core.ts` resolves compiled `strategicCondition` refs via `resolveStrategicConditionRef(conditionId, field)`.
2. That resolver evaluates the condition target with `evaluateCompiledExpr(condition.target, undefined)`, so preview refs inside conditions cannot see the current candidate.
3. Strategy modules and candidate-aware score expressions already call `evaluateCompiledExpr(..., candidate)` for their own expressions; the context is lost only at the strategic-condition resolver boundary.
4. Strategic-condition cache keys currently include only condition id and field, so candidate-dependent condition values would be incorrectly reused across candidates unless the cache is candidate-scoped.

## Architecture Check

1. Foundation #2: preview-dependent strategic doctrine remains declarative GameSpecDoc YAML.
2. Foundation #12: the runtime evaluates compiled refs according to their semantic context instead of requiring authored workarounds.
3. Foundation #15: this fixes the generic evaluation gap exposed by Spec 201 rather than replacing the preview condition with current-state approximation.
4. Foundation #20: preview refs inside conditions keep candidate preview provenance and unavailable-signal recording because the candidate flows through the condition target evaluation.
5. Foundation #1: the change is game-agnostic and does not mention FITL factions, relationships, or condition ids.

## What to Change

### 1. Preserve candidate context in strategic condition evaluation

Update strategic-condition ref resolution so:

- `condition.<id>.satisfied` evaluates the target with the same candidate context that reached the ref;
- `condition.<id>.proximity` evaluates the proximity current expression with that same candidate context;
- state-only evaluations still work with no candidate.

### 2. Scope strategic-condition caching by candidate

Update the condition cache key so candidate-dependent condition results do not leak across candidates. State-only condition evaluations may continue to use a stable no-candidate key.

### 3. Add focused runtime coverage

Add or extend focused policy-evaluation coverage proving that a strategic condition over a preview relationship ref:

- resolves when evaluated with a candidate whose preview is ready;
- remains candidate-specific when two candidates have different preview states.

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — condition resolver candidate context/cache key)
- Focused test under `packages/engine/test/unit/agents/` or `packages/engine/test/integration/agents/` (modify/new)

## Out of Scope

- Authoring Spec 201 strategic conditions in `92-agents.md` (owned by ticket 003 after this prerequisite lands).
- FITL-specific relationship logic.
- New preview ref families.
- Strategy module authoring or profile bindings.

## Acceptance Criteria

### Tests That Must Pass

1. Strategic conditions can evaluate preview refs when reached with a candidate context.
2. Candidate-dependent condition values are cached per candidate, not globally.
3. State-only strategic-condition evaluation remains unchanged.
4. `pnpm -F @ludoforge/engine build` passes.

### Invariants

1. No game-specific ids or branches are introduced.
2. Preview relationship refs still return unavailable when no candidate context exists.
3. Existing condition dependency and proximity behavior remains intact for state-only conditions.

## Test Plan

### New/Modified Tests

1. Focused policy-evaluation test — two candidates with different preview relationship margins produce different `condition.<id>.satisfied` results.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Focused compiled node test for the changed policy-evaluation file
3. `pnpm -F @ludoforge/engine test:unit`
4. `pnpm run check:ticket-deps`

## Outcome (2026-05-28)

Implemented.

What landed:

1. `condition.<id>.satisfied` and `condition.<id>.proximity` now preserve the candidate context that reached the strategic-condition ref.
2. Strategic-condition cache entries are scoped by condition id, field, and candidate stable move key, with a stable no-candidate key for state-only evaluation.
3. Relationship activation checks still resolve strategic conditions without a candidate, preserving the existing state-only relationship path.
4. Added `packages/engine/test/unit/agents/strategic-condition-candidate-context.test.ts`, proving preview relationship refs inside strategic conditions evaluate differently for low/high candidate preview states and remain unavailable without a candidate.
5. Added the missing `@test-class` marker to `packages/engine/test/unit/cnl/active-card-tag-policy-typing.test.ts`; the final unit lane's first failure was the corpus marker invariant on that preexisting test file.

Source-size decision:

1. `packages/engine/src/agents/policy-evaluation-core.ts` remains preexisting-oversize, but this ticket reduced the file by three net lines (`git diff --numstat` showed `6 9`), so there is no active source-size growth.
2. New focused test file is 225 lines.
3. Marker hygiene test file is 119 lines.

Verification:

1. `pnpm -F @ludoforge/engine build` — passed.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/strategic-condition-candidate-context.test.js` — passed (`2/2`).
3. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/infrastructure/test-class-markers.test.js` — passed after adding the missing marker (`1/1`).
4. `pnpm -F @ludoforge/engine test:unit` — first post-build diagnostic run failed only on `dist/test/unit/infrastructure/test-class-markers.test.js`; final rerun after marker repair passed (`659/659`).
5. `pnpm run check:ticket-deps` — passed for 5 active tickets and 2545 archived tickets.
