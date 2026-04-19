# 138ENUTIMTEM-003: Historical single-pick guided chooser draft for prepare-playable-moves

**Status**: NOT IMPLEMENTED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/prepare-playable-moves.ts`, new runtime warning code
**Deps**: `archive/tickets/138ENUTIMTEM-002.md`, `archive/tickets/138ENUTIMTEM-006.md`

## Problem

This draft assumed the live failing FITL heads were effectively single-pick `chooseN` requests, so the scalar `viableHeadSubset` emitted by 138ENUTIMTEM-002 would be sufficient to guide `attemptTemplateCompletion`. Live reassessment during implementation invalidated that assumption: on 2026-04-19, failing seed `1010` still exposed `noPlayableMoveCompletion`, and the live first pending head on the failing `march` template was `chooseN{min:1,max:27,optionCount:27}`. A flat scalar subset cannot encode the legal completion surface for that head shape, so this ticket cannot be completed truthfully under its current boundary.

The ticket is retained as a blocked historical draft-series record only. The corrected implementation boundary now lives in `138ENUTIMTEM-006`, which owns the multi-pick head-guidance redesign needed to satisfy `docs/FOUNDATIONS.md` #5 and #15.

## Assumption Reassessment (2026-04-19)

1. `packages/engine/src/agents/prepare-playable-moves.ts:218` defines `attemptTemplateCompletion`. Confirmed.
2. `attemptTemplateCompletion` reaches `evaluatePlayableMoveCandidate` and passes a `choose` callback through `TemplateMoveCompletionOptions`. Confirmed — the eventual corrected head-guidance path still plugs into this seam.
3. `completeTemplateMove` composes caller-provided `choose` with internal random sampling. Confirmed, but a head-guidance contract that returns only a single scalar is insufficient when the live head is multi-pick.
4. `decisionKey` uniquely identifies a choice request within a move (`packages/engine/src/kernel/decision-scope.ts` exports `DecisionKey`). Confirmed.
5. On 2026-04-19, `node campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs --seed 1010 --max-turns 200` reported the failing `march` template's live first pending head as `chooseN` with `min:1`, `max:27`, `optionCount:27`, and the run still terminated with `stopReason=noPlayableMoveCompletion`.
6. The scalar `viableHeadSubset?: readonly MoveParamScalar[]` emitted by `138ENUTIMTEM-002` can prove single-option viability, but it cannot encode viable 27-pick combinations or a constrained multi-pick subspace. That is a blocking architectural mismatch, not a small implementation bug.
7. Runner worker bridge (`packages/runner/src/worker/game-worker-api.ts`) still consumes `LegalMoveEnumerationResult` only; no runner code touches `preparePlayableMoves` directly. Confirmed.

## Architecture Check

1. A single-pick guided chooser would be clean for true `chooseN{min:1,max:1}` heads, but it is not architecturally complete for the live `chooseN{min:1,max:27}` witness. Forcing that narrower design through would violate Foundation #15.
2. Foundation #5 requires one shared legality/completion contract between classifier and sampler. The current scalar subset shape is not expressive enough for the live multi-pick head, so the contract must be redesigned before sampler wiring can land.
3. The runner-consumer inventory remains zero-touch, so the corrected redesign can stay engine-internal once the head-guidance contract is fixed.

## What to Change

This ticket is blocked. The owned implementation work was not started because the live head-guidance contract must first be widened in `138ENUTIMTEM-006` to handle multi-pick `chooseN` heads truthfully.

## Files to Touch

- none until `138ENUTIMTEM-006` lands

## Out of Scope

- Multi-pick head-guidance redesign is owned by `138ENUTIMTEM-006`.
- Foundation 14 stop-reason/error-class deletion remains owned by `138ENUTIMTEM-004`.
- Caching and performance gating remain owned by `138ENUTIMTEM-005`.

## Acceptance Criteria

### Tests That Must Pass

Blocked by `138ENUTIMTEM-006`. This ticket cannot truthfully close under its original acceptance criteria because live seed `1010` requires multi-pick head guidance.

### Invariants

Blocked. The single-pick invariants above are not sufficient for the live multi-pick witness.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/prepare-playable-moves-guided-convergence.test.ts` (new) — T2 convergence invariant.
2. `packages/engine/test/determinism/fitl-seed-guided-sampler-replay-identity.test.ts` (new) — T4 replay identity over passing corpus.
3. `packages/engine/test/unit/agents/prepare-playable-moves-retry.test.ts` (modify) — add T5 tripwire warning case.

### Commands

1. `node campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs --seed 1010 --max-turns 200`

## Outcome

- Completed: 2026-04-19
- Changed:
  - no standalone implementation was performed for this ticket
- Deviations from original plan:
  - the ticket's owned single-pick guided-chooser slice was invalidated by live evidence on 2026-04-19
  - the real implementation boundary moved to `138ENUTIMTEM-006`, which landed and was archived at `archive/tickets/138ENUTIMTEM-006.md`
  - this ticket is retained only as the archived historical record of the superseded split
- Verification:
  - live evidence: `node campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs --seed 1010 --max-turns 200` showed seed `1010` still ending with `stopReason=noPlayableMoveCompletion`
  - live head shape: first pending decision on the failing `march` template was `chooseN{min:1,max:27,optionCount:27}`
  - consistency proof: `pnpm run check:ticket-deps`
