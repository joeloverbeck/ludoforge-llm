# 116PRORESBEH-002: Migrate simple consumers to resolveProbeResult

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel consumer refactoring (3 files, 3 sites)
**Deps**: `archive/tickets/116PRORESBEH-001.md`

## Problem

Three kernel files each contain a single `outcome === 'inconclusive'` check with straightforward fallback logic. These are the simplest migration targets and serve as a validation batch before tackling the more complex consumers.

- `move-decision-sequence.ts:202` — ternary returning `'unknown'`
- `action-pipeline-predicates.ts:57` — if-block returning `'deferred'`
- `pipeline-viability-policy.ts:143` — if-block returning `'deferred'`

## Assumption Reassessment (2026-04-07)

1. `move-decision-sequence.ts:202` has `result.outcome === 'inconclusive' ? 'unknown' : result.value!` — confirmed.
2. `action-pipeline-predicates.ts:57` has `if (result.outcome === 'inconclusive') { return 'deferred'; }` — confirmed at line 57-58.
3. `pipeline-viability-policy.ts:143` has `if (compiledResult.outcome === 'inconclusive') { ... }` returning `'deferred'` — confirmed.
4. All three files import `ProbeResult` from `probe-result.ts` or `index.ts` — confirmed.
5. After 001, `resolveProbeResult` will be available from `probe-result.ts` / `index.ts`.

## Architecture Check

1. **Pure refactoring**: Each migration replaces an ad-hoc `outcome` check with `resolveProbeResult()` using an inline policy. Behavioral output is identical.
2. **Game-agnostic**: No game-specific logic introduced. The policies (`'unknown'`, `'deferred'`) are kernel-level degradation strategies.
3. **No backwards compatibility**: Old `outcome === 'inconclusive'` checks are removed, not aliased.

## What to Change

### 1. Migrate `move-decision-sequence.ts`

Replace the ternary at line ~202:
```typescript
// Before:
return result.outcome === 'inconclusive' ? 'unknown' : result.value!;

// After:
return resolveProbeResult(result, {
  onLegal: (value) => value,
  onIllegal: () => /* preserve existing illegal behavior */,
  onInconclusive: () => 'unknown',
});
```

Read the full context around line 202 to determine the existing `illegal` handling and preserve it exactly.

### 2. Migrate `action-pipeline-predicates.ts`

Replace the if-block at line ~57:
```typescript
// Before:
if (result.outcome === 'inconclusive') { return 'deferred'; }

// After: use resolveProbeResult with inline policy
```

Read the surrounding code to capture the existing legal/illegal handling and wrap the full outcome dispatch in `resolveProbeResult()`.

### 3. Migrate `pipeline-viability-policy.ts`

Replace the if-block at line ~143:
```typescript
// Before:
if (compiledResult.outcome === 'inconclusive') { ... return 'deferred'; }

// After: use resolveProbeResult with inline policy
```

Read the surrounding code to capture the existing legal/illegal handling and wrap in `resolveProbeResult()`.

### 4. Update imports

Add `resolveProbeResult` to the import statement in each migrated file. Remove `ProbeResult` from imports if it's no longer directly referenced (only used as the parameter type to `resolveProbeResult`, which infers it).

## Files to Touch

- `packages/engine/src/kernel/move-decision-sequence.ts` (modify)
- `packages/engine/src/kernel/action-pipeline-predicates.ts` (modify)
- `packages/engine/src/kernel/pipeline-viability-policy.ts` (modify)

## Out of Scope

- Migrating `legal-choices.ts`, `choose-n-option-resolution.ts`, or `legal-moves.ts` (ticket 003)
- Changing any behavioral outcome — this is a pure refactoring
- Adding new policies or outcome types
- Modifying `probe-result.ts` itself (done in 001)

## Acceptance Criteria

### Tests That Must Pass

1. All existing tests that exercise `move-decision-sequence.ts`, `action-pipeline-predicates.ts`, and `pipeline-viability-policy.ts` pass with zero diff in behavior.
2. Full test suite: `pnpm -F @ludoforge/engine test` passes with zero failures.
3. Typecheck: `pnpm turbo typecheck` passes.

### Invariants

1. No `outcome === 'inconclusive'` checks remain in the three migrated files.
2. Each migrated site uses `resolveProbeResult()` with an inline policy.
3. Behavioral output is identical to pre-migration for all three outcomes.

## Test Plan

### New/Modified Tests

No new test files. Existing tests validate behavioral identity.

### Commands

1. `pnpm -F @ludoforge/engine test --force` — full engine test suite
2. `pnpm turbo typecheck` — verify type correctness
3. `grep -rn "outcome === 'inconclusive'" packages/engine/src/kernel/move-decision-sequence.ts packages/engine/src/kernel/action-pipeline-predicates.ts packages/engine/src/kernel/pipeline-viability-policy.ts` — should return zero results
