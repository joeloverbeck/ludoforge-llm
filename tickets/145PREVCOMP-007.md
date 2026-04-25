# 145PREVCOMP-007: Post-preview ARVN profile-quality audit

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None expected — profile-quality audit and possible profile config edit
**Deps**: `archive/tickets/145PREVCOMP-003.md`

## Problem

`145PREVCOMP-003` removed the retired `scopes: [completion]` / `option.value` shipped-profile residue from `arvn-evolved` and restored the Spec 140 migrated-profile integration smoke. The required Spec 145 profile audit still needs a full current-vs-`agentGuided` comparison for ARVN profiles and a decision about the policy-profile-quality witness now failing in `fitl-march-dead-end-recovery.test.js`.

Exploratory evidence from `145PREVCOMP-003`:

- `pnpm -F @ludoforge/engine test:policy-profile-quality` fails immediately on `dist/test/policy-profile-quality/fitl-march-dead-end-recovery.test.js`; the reporter classifies it as `convergence-witness` / `profile-level quality witness`, not an architectural-invariant failure.
- `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 1 --max-turns 50 --trace-all false` reports seed 1000 as terminal with ARVN margin 36 and `compositeScore=46`.
- The matching two-seed probe with `--seeds 2 --max-turns 50` timed out after recording seed 1000, so seed 1001 and `agentGuided` comparison remain unmeasured.

## Assumption Reassessment (2026-04-25)

1. `145PREVCOMP-003` resolved the blocking integration failures but did not complete the full profile-quality measurement matrix originally drafted there.
2. `packages/engine/test/policy-profile-quality/fitl-march-dead-end-recovery.test.ts` is a profile-quality/convergence witness, not an architectural invariant; failures here should not block engine legality or integration closure unless the audit proves a deeper kernel issue.
3. `arvn-evolved` and `arvn-baseline` are the only shipped FITL profiles named by Spec 145 for `agentGuided` comparison. The remaining shipped profiles still need one-line current metrics or an explicit no-comparable-metric rationale.
4. `vc-baseline projectedMarginWeight: 5` is currently dead config because `vc-baseline` does not use `preferProjectedSelfMargin` in `use.considerations`; cleanup is only warranted if the audit proves direct value.

## Architecture Check

1. **F#8 / F#16 distinction** — profile-quality witnesses are advisory convergence signals, not determinism or legality proof. The audit must not promote profile regression to engine failure without evidence.
2. **F#10 (Bounded Computation)** — any measurement harness must use explicit seed, turn, and timeout bounds; long-running probes should be narrowed before they become routine proof.
3. **F#14 (No Backwards Compatibility)** — if the audit chooses a profile config edit, it must be a direct current-profile change, not a compatibility alias for retired completion refs.

## What to Change

1. Run the smallest reliable ARVN audit harness that reports current greedy-preview metrics for seeds 1000 and 1001.
2. Run the same harness with `arvn-evolved` and, if useful, `arvn-baseline` using `preview.completion: agentGuided`.
3. Decide whether the `fitl-march-dead-end-recovery.test.js` profile-quality witness should be re-blessed, distilled, or replaced.
4. Keep `vc-baseline projectedMarginWeight: 5` documented as dead-but-harmless unless the audit proves a direct cleanup is warranted.

## Files to Touch

- `packages/engine/test/policy-profile-quality/fitl-march-dead-end-recovery.test.ts` (modify if the witness is re-blessed, distilled, or replaced)
- `data/games/fire-in-the-lake/92-agents.md` (modify only if measured evidence supports a direct profile config edit)
- `tickets/145PREVCOMP-007.md` (record audit outcome and verification)
- Possibly campaign/audit artifacts under `campaigns/fitl-arvn-agent-evolution/` if a durable checked-in report is needed

## Out of Scope

- Engine driver or top-K gate changes; those belong to `145PREVCOMP-001` / `145PREVCOMP-002` or a new production bug ticket if the audit proves a real engine issue.
- Cross-game conformance; owned by `145PREVCOMP-004`.
- Trace diagnostics; owned by `145PREVCOMP-005`.
- Performance harness and top-K derivation; owned by `145PREVCOMP-006`.

## Acceptance Criteria

1. The ticket records one-line metrics for `us-baseline`, `arvn-baseline`, `arvn-evolved`, `nva-baseline`, `vc-baseline`, and Texas Hold'em baseline, or explicitly narrows why a profile has no meaningful comparable metric in the current harness.
2. Any `arvn-evolved` / `arvn-baseline` `agentGuided` benefit is either applied as a direct profile edit or documented as a follow-up recommendation with measured evidence.
3. `fitl-march-dead-end-recovery.test.js` is either green after a justified re-bless/distillation or remains classified as a non-blocking profile-quality regression with a durable rationale.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/fitl-march-dead-end-recovery.test.ts` — modify only if the audit changes the witness.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:policy-profile-quality`
3. `pnpm turbo lint`
4. `pnpm turbo typecheck`
