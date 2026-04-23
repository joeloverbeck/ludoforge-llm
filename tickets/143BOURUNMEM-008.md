# 143BOURUNMEM-008: Resolve remaining FITL medium-diverse determinism OOM

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — exact surface to reassess against the current determinism-lane failure.
**Deps**: `archive/tickets/143BOURUNMEM-004.md`, `archive/tickets/86DETLANEHNG-003-rebudget-fitl-determinism-proof-corpus.md`

## Problem

Ticket 003's chooseN canonical-identity compaction is now implemented and its old `draft-state-determinism-parity` OOM no longer reproduces. The remaining acceptance blocker has moved later in the determinism lane:

- `pnpm -F @ludoforge/engine test:determinism`
- first green files: `draft-state-determinism-parity`, `fitl-policy-agent-canary-determinism`, `forked-vs-fresh-runtime-parity`, `helper-vs-canonical-run-parity`, `spec-140-replay-identity`, `zobrist-incremental-parity`
- new failing file: `dist/test/determinism/zobrist-incremental-property-fitl-medium-diverse.test.js`
- failure shape: `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`

That means the 003 slice is no longer the active production owner. A narrower remaining prerequisite still exists before 003 can close truthfully and before the later Spec 143 witness tickets (005/006) can be calibrated against the live post-fix runtime.

## Assumption Reassessment (2026-04-24)

1. The current failure is not the same as 003's earlier blocker: `draft-state-determinism-parity.test.js` now passes in about 2m56s on the live repo before the lane advances.
2. The failure occurs in the FITL medium-diverse Zobrist property sweep introduced by `archive/tickets/86DETLANEHNG-003-rebudget-fitl-determinism-proof-corpus.md`, so this is either a remaining retained-state/runtime-memory defect or a now-stale proof-budget assumption in that witness family.
3. Spec 143 still treats long-run memory growth and long-run runtime drift as the same architectural class; if the medium-diverse sweep OOMs because transient support state keeps growing with play length, the fix belongs to the remaining Spec 143 production boundary rather than to 005/006's later advisory witness authoring.
4. 005 and 006 should stay test-only tickets. They should not absorb a remaining production/runtime fix just because the failing witness is FITL-heavy.

## Architecture Check

1. **Narrow prerequisite over re-widening 003**: 003 already landed its owned canonical-key change. The truthful next step is a new prerequisite ticket for the remaining determinism-lane OOM rather than repeatedly widening 003's delivered slice.
2. **Live boundary first**: the first task is to classify whether the failure is a remaining engine retained-state bug or a stale determinism proof-budget assumption. Do not assume one or the other from ticket history alone.
3. **FOUNDATIONS alignment**: if the medium-diverse sweep is still exposing unbounded retained transient state, the fix must remain engine-generic and root-cause-oriented. If the runtime is sound and the witness itself is now mis-budgeted, the correction belongs in the determinism proof corpus with an explicit ticket rewrite.

## What to Change

### 1. Reproduce and isolate the live blocker

- Reproduce `pnpm -F @ludoforge/engine test:determinism`.
- Isolate `dist/test/determinism/zobrist-incremental-property-fitl-medium-diverse.test.js` as the focused failing witness.
- Confirm whether the OOM is driven by remaining runtime-retained state, by the current proof corpus budget, or by another concrete regression in the Zobrist incremental verification path.

### 2. Land the smallest truthful fix

- If the failure is a remaining runtime-memory / retained-state bug, fix that production seam with the narrowest direct regression proof.
- If the failure is instead a stale determinism-corpus budget or witness-shape issue, update the determinism witness family and its lane-policy expectations coherently.
- Do not absorb 005/006's advisory-witness authoring into this ticket.

### 3. Restore acceptance proof for the Spec 143 runtime tickets

- Get `pnpm -F @ludoforge/engine test:determinism` back to green.
- Update 003 and any affected sibling ticket/spec artifacts so the remaining ownership story is truthful.

## Files to Touch

Exact files depend on the reassessed root cause. Likely surfaces include one or more of:

- `packages/engine/src/kernel/**`
- `packages/engine/src/agents/**`
- `packages/engine/test/determinism/zobrist-incremental-property-fitl-medium-diverse.test.ts`
- `packages/engine/test/helpers/zobrist-incremental-property-helpers.ts`
- `packages/engine/test/unit/lint/engine-test-lane-taxonomy-policy.test.ts`
- `tickets/143BOURUNMEM-003.md`

## Out of Scope

- Authoring the new advisory heap witness from 005
- Authoring the new advisory cost-stability witness from 006
- The engine-generic scope-drop regression from 007 unless the root-cause fix directly changes its contract
- Reopening 003's already-landed chooseN canonical-key compaction unless new evidence proves it is causally involved

## Acceptance Criteria

### Tests That Must Pass

1. Focused failing witness: `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/zobrist-incremental-property-fitl-medium-diverse.test.js`
2. Full determinism lane: `pnpm -F @ludoforge/engine test:determinism`
3. Any newly added focused regression or lane-policy test required by the chosen fix

### Invariants

1. The ticket ends with a truthful classification of the medium-diverse OOM as either a remaining runtime bug or a proof-corpus budgeting issue.
2. 005/006 remain test-only witness tickets unless new evidence proves their ownership changed.
3. 003 closes only after this prerequisite is resolved or the active series is rewritten truthfully.
