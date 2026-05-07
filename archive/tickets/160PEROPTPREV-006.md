# 160PEROPTPREV-006: `chooseNStep` beam preview driver

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `agents/policy-preview-inner.ts`
**Deps**: `archive/tickets/160PEROPTPREV-005.md`

## Problem

Phase B of Spec 160. For chooseN compound microturns (e.g., FITL March's `chooseN{min:1,max:27}`), enumerating all combinations is intractable. This ticket extends `policy-preview-inner.ts` with a marginal beam-search preview: at each step, retain the top `chooseNBeamWidth` partial selections by `policyGuided` score; advance up to `depthCap` steps. Total cost is bounded by `maxOptions × chooseNBeamWidth × depthCap` (ticket 003's hard cap). Pruned partial selections record `selectionReason: 'beamPruned'` (extended in ticket 001).

## Assumption Reassessment (2026-05-06)

1. Ticket 005 has landed `policy-preview-inner.ts` with the chooseOne driver and the per-option ref resolution + hidden-info plumbing. The beam driver extends the same module.
2. Ticket 001 has extended `SELECTION_REASONS` with `'beamPruned'` (closed `as const` at `policy-eval.ts:95`).
3. Ticket 003 has compiled the `preview.inner.chooseNStep`, `chooseNBeamWidth`, and `depthCap` config fields with triple-product validation.
4. The live per-option scoring seam is `scoreMicroturnOptionWithContributions` in `packages/engine/src/agents/microturn-option-eval.ts`, with microturn consideration selection shared from `packages/engine/src/agents/microturn-option-evaluator.ts`. The beam scoring step scores each partial-selection draft through that same policy-guided microturn evaluator instead of reusing `selectBestMicroturnChooseOneValue`, because the beam needs the score for every candidate option, not only the current best option.

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
      score = scoreMicroturnOptionWithContributions(draft, option, partial.partialSelection ++ [option])
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

## Outcome

Completed on 2026-05-07.

- Landed boundary: added `runChooseNStepBeamPreview(input)` in `packages/engine/src/agents/policy-preview-inner.ts`. It expands legal `chooseNStep` add decisions from each retained partial, applies each add to an isolated Spec 146 draft, scores the resulting partial-selection draft with the existing policy-guided microturn option evaluator, sorts candidates by `(score desc, stableMoveKey asc)`, and retains `chooseNBeamWidth` candidates up to `depthCap`.
- Pruning trace: each candidate dropped at a beam cutoff is returned as a pruning trace entry with `selectionReason: 'beamPruned'`, its partial-selection stable keys, score, and score contributions. Ticket 007 still owns propagating this into `chooseFrontierDecision` / serialized inner-preview trace.
- Touched-file ledger: `packages/engine/src/agents/policy-preview-inner.ts` done; `packages/engine/test/unit/agents/policy-preview-inner-choosen-beam.test.ts` done; `packages/engine/src/agents/microturn-option-evaluator.ts` is owned fallout to export the existing microturn-consideration selector used by both chooseOne and chooseN scoring; no schema or generated artifacts expected.
- Ticket correction: the draft pseudocode named `selectBestMicroturnChooseOneValue`, but live beam scoring needs every candidate option's score. The implemented seam uses `scoreMicroturnOptionWithContributions` plus the existing profile microturn-consideration filter, preserving the same policy-guided scoring semantics without an O(options²) best-selection probe.
- Focused witness: the new unit test builds an 8-option exact-cardinality chooseN fixture with `chooseNBeamWidth: 2` and `depthCap: 3`; it asserts `evaluatedCandidateCount = 34`, which is within the ticket cap `8 × 2 × 3 = 48`, records `beamPruned` entries, and proves deterministic replay by comparing two same-input beam/pruning outputs byte-for-byte.
- Post-review correction: strengthened the replay witness to compare serialized retained beam states, resolved refs, outcome breakdown, pruned entries, score contributions, and candidate counts across two same-input runs instead of comparing only retained/pruned stable keys and scores.
- Source file size ledger: `policy-preview-inner.ts` was already above the typical 200-400 line band at 423 lines and is now 676 lines, still under the 800-line maximum. Splitting the chooseN driver now would create a new internal module boundary before ticket 007 wires the integration path, so extraction is deferred; residual owner is future Spec 160 integration cleanup if ticket 007 grows this module further.
- Runtime surface breadth: policy/agent-only inner preview helper. No game-specific logic, no kernel behavior change, and no serialized schema change in this ticket.
- Deferred sibling/spec scope: ticket 007 owns `chooseFrontierDecision` integration, trace propagation, and integration-layer replay identity/no-op default tests; tickets 008-010 remain unchanged.
- Final proof, serial order:
  1. `pnpm turbo typecheck` — passed, 3/3 tasks; rebuilt `packages/engine/dist`.
  2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-inner-choosen-beam.test.js` — passed after the Turbo rebuild, 1/1 test.
  3. `pnpm -F @ludoforge/engine test` — passed; `schema:artifacts:check` passed and the default lane reported `64/64 files passed`.
  4. `pnpm -F @ludoforge/engine build` — passed after the broad engine lane, satisfying the ticket's focused build prerequisite literally.
  5. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-inner-choosen-beam.test.js` — passed after the final package build, 1/1 test.
  6. `pnpm run check:ticket-deps` — passed for 5 active tickets and 2262 archived tickets.
- Post-review proof:
  1. `pnpm -F @ludoforge/engine build` — passed after strengthening the test.
  2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-inner-choosen-beam.test.js` — passed, 1/1 test.
  3. `pnpm -F @ludoforge/engine test` — passed; `schema:artifacts:check` passed and the default lane reported `64/64 files passed`.
- Command ledger:
  1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-preview-inner-choosen-beam.test.js` — split into package build plus focused compiled `node --test` lane; both cited green after final build.
  2. `pnpm turbo typecheck` — ran directly; cited green.
  3. `pnpm -F @ludoforge/engine test` — ran directly; cited green.
- No-invalidation: terminal status/proof transcription only; no code, test, schema, acceptance criteria, command semantics, touched-file ownership, sibling ownership, or dependency edge changed after the final proof lanes.
