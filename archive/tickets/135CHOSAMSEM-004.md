# 135CHOSAMSEM-004: Remove `sampledMin` from `selectFromChooseN`; migrate test fixtures

**Status**: DEFERRED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel move completion (`packages/engine/src/kernel/move-completion.ts`), completion tests
**Deps**: `archive/tickets/135CHOSAMSEM-003.md`

## Problem

This draft ticket's owned slice was absorbed on 2026-04-18 by `135CHOSAMSEM-001` through a user-directed boundary rewrite required for `docs/FOUNDATIONS.md` alignment. It remains only as a historical record of the original planned split.

With the retry-layer bias fully wired in 135CHOSAMSEM-001 through -003, the hardcoded `sampledMin` rewrite inside `selectFromChooseN` becomes redundant and, by Spec 135 Contract §1, architecturally wrong — it is the engine-level policy leak that the spec exists to eliminate. This ticket executes the atomic relocation: delete `sampledMin`, and in the same change migrate tests that depended on the first-attempt bias to instead observe the retry-layer warning from 135CHOSAMSEM-003.

After this ticket, first-attempt sampling becomes uniform in `[min, max]`. Retries continue to carry the bias via `retryBiasNonEmpty` from 135CHOSAMSEM-003. Spec 135 Contract §1 is now enforced. Foundation 14 is satisfied — no shim remains.

## Assumption Reassessment (2026-04-18)

1. `sampledMin` lives at exactly `packages/engine/src/kernel/move-completion.ts:67` with its only use at line 68 (confirmed via grep during spec 135 reassessment).
2. `move-completion-retry.test.ts §2` ("prefers non-empty optional chooseN branches when they are satisfiable") currently passes because `sampledMin` prevents the first-attempt empty sample. After this ticket, first attempts may sample empty, then the retry loop (135CHOSAMSEM-003) biases subsequent attempts. The test's assertion shifts from "first attempt is never empty" to "eventually completes with non-empty, and the warning was observed at least once across the seed range".
3. `completion-contract-invariants.test.ts` exists at `packages/engine/test/unit/kernel/completion-contract-invariants.test.ts`. An audit is required as part of this ticket: any assertion that implicitly assumes first-attempt non-empty bias must be migrated to use the retry-warning observation pattern (or dropped if the assertion is already covered by another test).
4. No production YAML references `preferNonEmpty` or equivalent — the bias was universal and engine-enforced; no GameSpecDoc author opted in.

## Architecture Check

1. **Why this approach is cleaner**: This is the completion cut for Spec 135's central architectural invariant (sampler purity). `selectFromChooseN` becomes what it has always claimed to be: a uniform sampler over `[min, max]`. All bias lives at the retry layer where it is observable via warning. Foundation 7 (Specs Are Data) and Foundation 15 (Architectural Completeness) fully satisfied.
2. **Agnostic boundaries**: No game-specific logic remains anywhere in the sampler path. Foundation 1 preserved.
3. **No backwards-compatibility shims**: `sampledMin` is deleted outright. The test fixtures that relied on it are migrated in the same change — Foundation 14 is honored.

The Foundation 14 exception for mechanical-uniform type replacements does not apply here — the change is not mechanically uniform (it touches both sampler logic and test assertions with differing shapes). The ticket remains Medium effort because the modification surface is narrow (one logic line removed, a handful of test assertions rewritten).

## What to Change

### 1. Delete the `sampledMin` clamp

In `packages/engine/src/kernel/move-completion.ts:selectFromChooseN`, remove the `sampledMin` computation and pass `min` directly to `nextInt`:

```ts
// Before:
const sampledMin = min === 0 && max > 0 && options.length > 0 ? 1 : min;
const [count, rng1] = nextInt(rng, sampledMin, max);

// After:
const [count, rng1] = nextInt(rng, min, max);
```

### 2. Migrate `move-completion-retry.test.ts §2`

The test block titled "prefers non-empty optional chooseN branches when they are satisfiable" currently asserts that across seeds 0n–15n, every completion is `{ kind: 'completed', … }` with non-empty selection on the first attempt. Post-migration, the assertion becomes:

- Across the same seed range, every completion eventually reaches `{ kind: 'completed', … }` with the non-empty selection (may require retries).
- Across the same seed range, at least one seed triggers a `MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY` warning on the diagnostic channel — proving the retry-layer bias is operative.

The test exercises the full caller → completion → retry chain, not just `completeTemplateMove` in isolation. If the current test uses `completeTemplateMove` directly (no retry caller), adapt it to exercise `attemptTemplateCompletion` (from 135CHOSAMSEM-003) so the warning pathway is reachable.

### 3. Audit and migrate `completion-contract-invariants.test.ts`

Read every assertion in this file. For each assertion that implicitly depends on `sampledMin`'s first-attempt bias (e.g., asserts "optional chooseN never samples empty" as an invariant rather than as a retry-layer behavior), migrate to the retry-warning pattern or drop the assertion if it is redundant with a surviving test.

Document the audit outcome in the ticket's completion notes: which assertions were migrated, which were dropped, and why.

### 4. Update snapshots and golden fixtures if affected

Run the full test suite. If any replay/trace fixtures or snapshot-based tests fail because sampling trajectories shifted on the first attempt, evaluate each failure:

- If the fixture encodes a specific sampled count that was a consequence of `sampledMin`, update the fixture to reflect the new uniform-sampling trajectory.
- If the fixture encodes an architectural property that is preserved (e.g., bounded termination, canonical state hash equality), investigate whether the shift is legitimate and re-bless per the Re-bless golden trace rule in `.claude/rules/testing.md`.

## Files to Touch

- `packages/engine/src/kernel/move-completion.ts` (modify)
- `packages/engine/test/unit/kernel/move-completion-retry.test.ts` (modify — §2)
- `packages/engine/test/unit/kernel/completion-contract-invariants.test.ts` (modify or leave unchanged pending audit)

## Out of Scope

- New sampler-purity unit test (135CHOSAMSEM-005).
- Changes to `selectFromChooseN` other than the `sampledMin` deletion.
- Changes to `chooseAtRandom`, `TemplateMoveCompletionOptions`, or `prepare-playable-moves.ts` — those belong to 135CHOSAMSEM-002 and -003.
- Changes to the `MOVE_COMPLETION_RETRY_BIASED_NON_EMPTY` warning or its diagnostic channel — defined in 135CHOSAMSEM-003.
- Follow-up investigation of `distributeTokens` compiler lowering defaults (explicitly deferred by Spec 135 §Out of Scope to a separate spec).

## Acceptance Criteria

### Tests That Must Pass

1. Migrated `move-completion-retry.test.ts §2` passes under the new retry-warning-observation assertions.
2. Audited `completion-contract-invariants.test.ts` passes — either unchanged (if no first-attempt-bias assertions were present) or with migrated assertions asserting retry-layer behavior.
3. Existing suite: `pnpm turbo test` — no canary regression. Any FITL canary trajectory that shifts due to the sampling-layer change must be explicitly evaluated and documented.

### Invariants

1. Grep for `sampledMin` in `packages/engine/src/` returns zero matches after this ticket.
2. `selectFromChooseN` samples uniformly in `[min, max]` — no internal clamping.
3. Existing retry-layer bias (from 135CHOSAMSEM-003) continues to operate: dead-ends from count=0 on optional chooseN still trigger biased retries with the warning.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/move-completion-retry.test.ts` (modify) — migrate §2 assertions as described in §2 above.
2. `packages/engine/test/unit/kernel/completion-contract-invariants.test.ts` (audit + possible modify) — per §3 above.
3. Replay/golden fixtures (potential modifications) — per §4 above.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e` — verify no canary replay regression
3. `pnpm turbo build test lint typecheck`
4. Post-change grep verification: `! grep -r "sampledMin" packages/engine/src/` should exit non-zero (no matches).
