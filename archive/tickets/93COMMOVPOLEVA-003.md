# 93COMMOVPOLEVA-003: Verify PolicyAgent trustedMoveIndex production path

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-agent.ts`
**Deps**: `archive/tickets/93COMMOVPOLEVA-002.md`

## Problem

The original ticket assumed the production caller still needed wiring. That assumption is now stale: `PolicyAgent.chooseMove` already builds `trustedMoveIndex` from the selected playable moves and passes it to `evaluatePolicyMove`.

The remaining risk is weaker than an implementation gap but still real: the code path should be proven at the production caller boundary, not only in lower-level `policy-preview` and `policy-eval` tests. This ticket is therefore narrowed to validating the architecture already in place, correcting the record, and adding any missing production-path coverage if the current tests do not prove the invariant strongly enough.

## Assumption Reassessment (2026-03-29)

1. `PolicyAgent.chooseMove` already calls `preparePlayableMoves()` and receives `{ completedMoves, stochasticMoves, rng }`. Confirmed.
2. The agent already selects `playableMoves = completedMoves.length > 0 ? completedMoves : stochasticMoves`. Confirmed.
3. `policy-agent.ts` already imports `toMoveIdentityKey`, builds `trustedMoveIndex`, and forwards it into `evaluatePolicyMove`. Confirmed.
4. `EvaluatePolicyMoveInput` already requires `trustedMoveIndex`. Confirmed.
5. Lower-level tests already cover the preview-runtime fast path and `evaluatePolicyMove` trusted-move scoring, but the ticket assumption that no production caller coverage existed needs reassessment against `packages/engine/test/unit/agents/policy-agent.test.ts` and production golden tests.

## Architecture Check

1. **Current design remains sound**: index-injection of `ReadonlyMap<string, TrustedExecutableMove>` is cleaner than threading trusted wrappers through every policy candidate type. It keeps preview/runtime generic and avoids type pollution across the evaluation pipeline.
2. **Agnosticism (F1)**: the trusted index stays in generic agent/runtime code and is keyed by generic move identity, not game-specific data.
3. **Immutability (F7)**: the map is constructed once and treated as read-only input.
4. **No shims (F9)**: the architecture already uses the direct path; no aliasing or compatibility fallback is required.
5. **Architecture recommendation**: no broader rewrite is justified here. The existing split between move preparation, policy evaluation, and preview runtime is robust. The only justified work is making the ticket and tests accurately reflect that architecture.

## What to Change

### 1. Correct the ticket assumptions and scope

Update this ticket so it documents the current reality: the production plumbing is already implemented.

### 2. Verify the production caller boundary

Reassess whether `packages/engine/test/unit/agents/policy-agent.test.ts` proves that `PolicyAgent` can select among completed template moves using preview-driven scoring from the trusted-move fast path.

If that proof is weak or absent, add the smallest focused test that:

- starts from a pending/template classified move
- lets `PolicyAgent.chooseMove` complete it
- requires preview evaluation of the completed move to distinguish candidates
- asserts the selected move reflects projected outcome, not tie-break coincidence

## Files to Touch

- `tickets/93COMMOVPOLEVA-003.md` (modify — correct stale assumptions and scope)
- `packages/engine/test/unit/agents/policy-agent.test.ts` (optional/likely modify — strengthen production-path coverage if needed)

## Out of Scope

- Re-implementing `trustedMoveIndex` plumbing in `policy-agent.ts` (already done)
- Any changes to `policy-preview.ts`, `policy-eval.ts`, or `policy-runtime.ts` unless verification exposes a real bug
- Kernel code changes
- Golden fixture updates unless a real behavioral regression is uncovered
- Performance optimization of the map construction
- Changes to `preparePlayableMoves` or move completion logic

## Acceptance Criteria

### Tests That Must Pass

1. `PolicyAgent` production-path coverage is accurate: either existing tests are shown to prove the invariant, or a focused new test is added
2. Relevant existing tests covering `policy-agent`, `policy-eval`, preview behavior, and policy properties pass
3. Full suite: `pnpm turbo test`
4. TypeScript compiles: `pnpm turbo typecheck`
5. Lint passes: `pnpm turbo lint`

### Invariants

1. `PolicyAgent.chooseMove` contract remains unchanged
2. Any code changes stay outside the kernel unless a real defect is found
3. Determinism (F5): the production path continues to derive trusted lookup keys from deterministic `toMoveIdentityKey`
4. Bounded computation (F6): any added validation test must stay within the existing bounded move-completion architecture
5. The production caller path is explicitly proven for completed/template moves, not only inferred from lower-level units

## Test Plan

### New/Modified Tests

To be determined by reassessment:

- If existing `policy-agent` tests already prove production-path trusted preview scoring, no test changes are required
- Otherwise, add one focused `policy-agent` unit test that proves `chooseMove` uses completed trusted moves to drive preview-based candidate ranking

### Commands

1. `pnpm -F @ludoforge/engine test` (targeted)
2. `pnpm turbo test` (full suite)
3. `pnpm turbo typecheck` (type safety)
4. `pnpm turbo lint` (style)

## Outcome

- Completion date: 2026-03-29
- Actual change: corrected the ticket to reflect that `PolicyAgent.chooseMove` already builds and forwards `trustedMoveIndex`; no production agent/runtime code changes were needed for this ticket.
- Actual change: strengthened production-boundary coverage in `packages/engine/test/unit/agents/policy-agent.test.ts` with a verbose-trace test that proves `PolicyAgent` evaluates preview surfaces for completed template moves in the production path.
- Deviation from original plan: the original ticket proposed implementing plumbing that was already present in `packages/engine/src/agents/policy-agent.ts`. The completed work focused on reassessment, scope correction, and test proof instead of duplicating architecture that already matched the intended design.
- Verification results:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
