# 116PRORESBEH-003: Migrate complex consumers to resolveProbeResult and verify complete migration

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel consumer refactoring (3 files, 9 sites)
**Deps**: `archive/tickets/116PRORESBEH-001.md`

## Problem

Three kernel files contain multiple `outcome === 'inconclusive'` checks (4+4+1 = 9 sites) with more complex context than the simple consumers migrated in 002. After this ticket, zero `outcome === 'inconclusive'` checks should remain in consumer files — only `probe-result.ts` itself may reference `outcome` directly.

- `legal-choices.ts` — 4 sites (lines 472, 491, 662, 678)
- `choose-n-option-resolution.ts` — 4 sites (lines 327, 357, 486, 507)
- `legal-moves.ts` — 1 site (line 547, context-specific `state.activePlayer` fallback)

## Assumption Reassessment (2026-04-07)

1. `legal-choices.ts` has 4 `outcome === 'inconclusive'` checks at lines 472, 491, 662, 678 — confirmed via grep. Two pairs follow a pattern: first check `probedResult`, then check `classificationResult`.
2. `choose-n-option-resolution.ts` has 4 checks at lines 327, 357, 486, 507 — confirmed. Same paired pattern as `legal-choices.ts`.
3. `legal-moves.ts:547` has a ternary with `state.activePlayer` fallback — confirmed. This is a legitimately different strategy requiring a context-specific inline policy.
4. All three files import from `probe-result.ts` or `kernel/index.ts` — confirmed.
5. After 001, `resolveProbeResult` will be available.

## Architecture Check

1. **Pure refactoring**: Each migration replaces ad-hoc `outcome` checks with `resolveProbeResult()`. Behavioral output is identical.
2. **Paired checks**: In `legal-choices.ts` and `choose-n-option-resolution.ts`, the paired `probedResult`/`classificationResult` checks may share a common inline policy or require two separate calls. Read the full context to determine the right factoring.
3. **Context-specific policy for `legal-moves.ts`**: The `state.activePlayer` fallback is a legitimate per-site strategy. The inline policy pattern supports this — no need to force a generic constant.
4. **Game-agnostic**: No game-specific logic introduced. All policies are kernel-level strategies.
5. **No backwards compatibility**: Old checks are removed entirely.

## What to Change

### 1. Migrate `legal-choices.ts` (4 sites)

Read the full context around lines 472, 491, 662, 678. For each `outcome === 'inconclusive'` check:
- Identify the existing legal, illegal, and inconclusive handling
- Replace with `resolveProbeResult()` using an inline policy that preserves identical behavior
- The paired checks (probedResult then classificationResult) may benefit from a shared local policy constant within the function to avoid repeating the same inline policy

### 2. Migrate `choose-n-option-resolution.ts` (4 sites)

Read the full context around lines 327, 357, 486, 507. Same paired pattern as `legal-choices.ts`:
- Replace each `outcome === 'inconclusive'` check with `resolveProbeResult()`
- Preserve the existing `kind: 'ambiguous'` handling where applicable
- Consider a shared local policy constant for repeated patterns within the same function

### 3. Migrate `legal-moves.ts` (1 site)

Read the full context around line 547. Replace the ternary:
```typescript
// Before:
const executionPlayer = executionPlayerResult.outcome === 'inconclusive'
  ? state.activePlayer
  : executionPlayerResult.value!;

// After:
const executionPlayer = resolveProbeResult(executionPlayerResult, {
  onLegal: (value) => value,
  onIllegal: () => /* preserve existing behavior */,
  onInconclusive: () => state.activePlayer,
});
```

Read surrounding code to determine illegal-case handling.

### 4. Update imports

Add `resolveProbeResult` to imports in each file. Clean up unused imports.

### 5. Final grep verification

After all migrations, run grep to confirm zero `outcome === 'inconclusive'` checks remain in any consumer file under `packages/engine/src/kernel/` (excluding `probe-result.ts` itself).

### 6. Remove migration bridge from `probe-result.ts`

After all consumers use `resolveProbeResult()` and no longer access `result.value` directly, remove the `readonly value?: never` fields from `ProbeResultIllegal` and `ProbeResultInconclusive` in `probe-result.ts`. These were added in 001 as a temporary migration bridge (Foundation 14) to keep consumer compilation intact during the phased rollout. Verify compilation after removal.

## Files to Touch

- `packages/engine/src/kernel/legal-choices.ts` (modify)
- `packages/engine/src/kernel/choose-n-option-resolution.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/probe-result.ts` (modify — remove `value?: never` bridge fields)

## Out of Scope

- Changing any behavioral outcome — this is a pure refactoring
- Adding new policies, outcomes, or reason types
- Migrating `decision-sequence-satisfiability.ts` — it uses `'unknown'` classification directly, not `ProbeResult`
- Changing `classifyMissingBindingProbeError()` or `shouldDeferMissingBinding()` logic

## Acceptance Criteria

### Tests That Must Pass

1. All existing tests that exercise `legal-choices.ts`, `choose-n-option-resolution.ts`, and `legal-moves.ts` pass with zero diff in behavior.
2. Full test suite: `pnpm -F @ludoforge/engine test` passes with zero failures.
3. Determinism canary: seeds 1001-1004 produce identical outcomes.
4. Typecheck: `pnpm turbo typecheck` passes.

### Invariants

1. Zero `outcome === 'inconclusive'` checks in consumer files under `packages/engine/src/kernel/` (excluding `probe-result.ts`).
2. `resolveProbeResult()` is the canonical way to handle probe results in all consumer files.
3. Behavioral output is identical to pre-migration for all three outcomes across all 9 migrated sites.

## Test Plan

### New/Modified Tests

No new test files. Existing tests validate behavioral identity. The final grep verification is a one-time check, not a persistent test.

### Commands

1. `pnpm -F @ludoforge/engine test --force` — full engine test suite
2. `pnpm turbo typecheck` — verify type correctness
3. `pnpm -F @ludoforge/engine test:e2e` — determinism canary seeds
4. `grep -rn "outcome === 'inconclusive'" packages/engine/src/kernel/ --include="*.ts" | grep -v probe-result.ts` — should return zero results
