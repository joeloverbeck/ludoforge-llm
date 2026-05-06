# 160PEROPTPREV-006: `chooseNStep` beam preview driver

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `agents/policy-preview-inner.ts`
**Deps**: `tickets/160PEROPTPREV-005.md`

## Problem

Phase B of Spec 160. For chooseN compound microturns (e.g., FITL March's `chooseN{min:1,max:27}`), enumerating all combinations is intractable. This ticket extends `policy-preview-inner.ts` with a marginal beam-search preview: at each step, retain the top `chooseNBeamWidth` partial selections by `policyGuided` score; advance up to `depthCap` steps. Total cost is bounded by `maxOptions × chooseNBeamWidth × depthCap` (ticket 003's hard cap). Pruned partial selections record `selectionReason: 'beamPruned'` (extended in ticket 001).

## Assumption Reassessment (2026-05-06)

1. Ticket 005 has landed `policy-preview-inner.ts` with the chooseOne driver and the per-option ref resolution + hidden-info plumbing. The beam driver extends the same module.
2. Ticket 001 has extended `SELECTION_REASONS` with `'beamPruned'` (closed `as const` at `policy-eval.ts:95`).
3. Ticket 003 has compiled the `preview.inner.chooseNStep`, `chooseNBeamWidth`, and `depthCap` config fields with triple-product validation.
4. `selectBestMicroturnChooseOneValue` lives at `packages/engine/src/agents/microturn-option-evaluator.ts:53` (Spec 159 helper). The beam scoring step calls it on each partial-selection draft.

## Architecture Check

1. **Bounded computation** (Foundation 10): the triple-product cap from ticket 003 enforces `maxOptions × chooseNBeamWidth × depthCap ≤ 256` at compile time. Beam runtime cost is bounded by this.
2. **Engine-agnostic** (Foundation 1): the beam search operates on generic published decisions and option values; no game-specific paths.
3. **Determinism** (Foundation 8): beam sort uses `(score desc, stableMoveKey asc)` for deterministic tie-breaking; replay produces byte-identical beam state.

## What to Change

### 1. Extend `policy-preview-inner.ts` with beam preview

Add `runChooseNStepBeamPreview(input)` to the module. Beam-search shape (from spec §3):

```
beam = [{ partialSelection: [], state: initialState }]
for step in 1..N:
  candidates = []
  for partial in beam:
    for option in legalOptions(partial.state):
      draft = applyPublishedDecision(partial.state, option)
      score = selectBestMicroturnChooseOneValue(draft, option, partial.partialSelection ++ [option])
      candidates.push({ partialSelection: partial.partialSelection ++ [option], state: draft, score })
  candidates.sort(by score desc, stableMoveKey asc)
  beam = candidates.slice(0, chooseNBeamWidth)
```

After the loop, expose `preview.option.*` refs from `beam[0].partialSelection`'s state.

### 2. Pruning trace

For each partial selection dropped at the beam-cutoff step, record a trace entry with `selectionReason: 'beamPruned'`. The trace integrates with synthetic-decision propagation (ticket 007 wires this into `chooseFrontierDecision`).

### 3. Reuse Spec 146 isolation

Each beam candidate's draft state is allocated via `createMutableState`; partial selections do not alias each other (per ticket 005's invariant).

## Files to Touch

- `packages/engine/src/agents/policy-preview-inner.ts` (modify — add beam preview)
- `packages/engine/test/unit/agents/policy-preview-inner-choosen-beam.test.ts` (new — beam width invariant; pruning trace)

## Out of Scope

- Trace integration into `chooseFrontierDecision` — ticket 007.
- Replay-identity tests for beam — covered by ticket 007's determinism tests at the integration layer.
- Per-option `preview.option.*` ref semantics — already wired in ticket 005.

## Acceptance Criteria

### Tests That Must Pass

1. New: a chooseN with 8 legal options and `beamWidth: 2, depthCap: 3` evaluates at most 48 per-option synthetic preview drives (beam candidates × steps; from spec §3).
2. New: beam pruning trace records pruned partial selections with `selectionReason: 'beamPruned'`.
3. New: replay identity — same input twice produces byte-identical beam state.
4. Existing `pnpm -F @ludoforge/engine test`.

### Invariants

1. (architectural-invariant) `Σ syntheticDecisions` across a chooseN beam-preview ≤ `maxOptions × chooseNBeamWidth × depthCap` (ticket 003's hard cap; Foundation 10).
2. (architectural-invariant) Beam sort uses `(score desc, stableMoveKey asc)` deterministically.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview-inner-choosen-beam.test.ts` (new) — `architectural-invariant`. Beam width invariant; pruning trace; deterministic ordering.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-preview-inner-choosen-beam.test.js`
2. `pnpm turbo typecheck`
3. `pnpm -F @ludoforge/engine test`
