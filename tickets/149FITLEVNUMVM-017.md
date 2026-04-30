# 149FITLEVNUMVM-017: Resolve Phase 1 encoded-read measured-gate miss

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — likely `packages/engine/src/agents/*` and/or `packages/engine/src/kernel/encoded-state/*`
**Deps**: `tickets/149FITLEVNUMVM-006.md`

## Problem

Ticket 006 landed the generic encoded read-path implementation for root-state policy evaluation, including scalar token-property support and score-equivalence coverage. The correctness slice is green, but the Phase 1 one-card smoke remains above the spec's 5500 ms acceptance threshold:

- `phase1-smoke`: `elapsedMs=6015.47`, threshold `<=5500`.
- `phase1-smoke-buckets`: `elapsedMs=5986.48`, `agent:evaluatePolicyExpression=3455.01 ms`, threshold `<=5500`.
- `phase1-smoke-layout-cache`: `elapsedMs=5999.65`, `agent:evaluatePolicyExpression=3477.36 ms`, threshold `<=5500`.
- `phase1-resume-check` on 2026-04-30: `elapsedMs=5925.83`, `agent:evaluatePolicyExpression=3418.81 ms`, threshold `<=5500`.
- `phase1-final-check` on 2026-04-30: `elapsedMs=6146.47`, `agent:evaluatePolicyExpression=3547.43 ms`, threshold `<=5500`.

Spec 149 §12 says a Phase 1 miss after encoded-state read-path wiring should trigger a reassessment rather than more speculative local tuning. This ticket owns that measured-gate resolution before `149FITLEVNUMVM-007` can add the 5500 ms perf gate or the Phase 2 entry ticket (`149FITLEVNUMVM-008`) can proceed with apply/undo work that may be re-speced, skipped, or reordered.

## What to Change

1. Run a focused profile/diagnostic pass on the post-006 encoded path.
2. Classify the root cause as one of:
   - encoded read path is active but insufficient because closure-tree dispatch / AST shape still dominates;
   - encoded read path is active but missing a generic aggregate/cache/index that is justified by measured hot samples;
   - encoded read path is not active on the intended production surface;
   - measurement variance or harness shape requires re-specification.
3. If a small generic optimization is directly supported by the profile, implement it and rerun the one-card smoke.
4. If the miss proves Spec 149 §12's Phase 1 stop condition, update the spec and dependent tickets to skip/reorder/re-spec the remaining phase plan instead of forcing the 5500 ms gate.
5. Update `149FITLEVNUMVM-007` only after the 5500 ms gate is either made truthful or replaced by a user-approved corrected gate.
6. Update `149FITLEVNUMVM-008` and any affected downstream Phase 2 tickets if the corrected plan re-specs, skips, or reorders apply/undo work.

## Files to Touch

- `tickets/149FITLEVNUMVM-017.md` (outcome)
- `specs/149-fitl-evolution-readiness-numeric-substrate-bytecode-vm.md` (if the stop condition fires)
- `tickets/149FITLEVNUMVM-007.md` (dependency/status after resolution)
- Engine profiling/encoded-read files only if the measured root cause justifies a generic optimization.

## Out of Scope

- Adding the `fitl-per-card-cost.perf.test.ts` gate itself. That remains ticket 007.
- Apply/undo preview scope work. That remains tickets 008-010.
- Bytecode VM implementation. That remains tickets 011-016 unless this ticket's reassessment explicitly changes the phase plan.

## Acceptance Criteria

1. The ticket records the decisive profile evidence and root-cause classification.
2. Either:
   - the one-card smoke reaches `elapsedMs <= 5500`, with the exact command and metrics recorded; or
   - Spec 149 and dependent tickets are updated to a user-approved corrected plan because the Phase 1 stop condition fired.
3. `149FITLEVNUMVM-007` is unblocked only when its 5500 ms gate is truthful.
4. `149FITLEVNUMVM-008` is unblocked only when the Phase 2 entry boundary remains valid under the corrected plan.
5. Any implemented optimization is generic, GameDef-derived, and proven score-equivalent against the encoded/object-walk policy path.

## Test Plan

1. `pnpm -F @ludoforge/engine build`.
2. Focused correctness proof for any touched encoded/policy path.
3. `node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase1-gate-resolution`.
4. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck` when code changes land.
