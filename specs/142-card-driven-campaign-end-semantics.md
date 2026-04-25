# Spec 142: Card-Driven Campaign-End and Final-Coup Semantics

**Status**: Draft
**Priority**: P2
**Complexity**: S
**Dependencies**: Spec 17 [fitl-turn-sequence-eligibility-and-card-flow], Spec 19, Spec 140, Spec 141 (all completed; parallel-friendly)
**Estimated effort**: 0.5-1 day
**Source**: `archive/tickets/FITLDETBOUND-001.md` (completed). This spec formalizes the authored-pattern convention surfaced by that investigation and closes the remaining generic-test gap.

## Overview

Formalize the authored convention for expressing card-driven campaign-end conditions in GameSpecDoc YAML, and prove the convention generically with one non-FITL regression.

The engine already supports card-driven terminal semantics correctly: `terminalResult(def, state)` is the single kernel gate and runs before every card reveal (see `packages/engine/src/kernel/phase-advance.ts:687`). `FITLDETBOUND-001` exposed that the prior FITL encoding used an overly narrow phase gate and relied on zone-emptiness as a proxy for class exhaustion; the corrected encoding landed with the ticket as the canonical production witness at `data/games/fire-in-the-lake/90-terminal.md:273-315`. What remains is architectural-completeness work: name the pattern so authoring conventions (including LLM-generated specs) adopt it, and prove its genericness outside FITL fixtures.

## Problem

Prior to `FITLDETBOUND-001`, the FITL final-coup rule fired only when the currently played coup card was in a coup phase and both `deck:none` and `lookahead:none` were empty. That missed a real game state:

- the currently played card is the final coup
- no future coup cards remain
- ordinary event cards still remain in the future stream
- coup-round execution is suppressed because the previous round was already a coup

In that state the game drifted into further `main`-phase card flow and, on pathological seeds, into empty-card action publication.

The fix was a YAML encoding change, not an engine change. The ticket-landed encoding at `data/games/fire-in-the-lake/90-terminal.md:273-315` now fires in `phases: [coupRedeploy, main]` and counts future coup cards explicitly via `tokensInZone(zone, filter: {prop: isCoup, op: eq, value: true})` across `played:none`, `lookahead:none`, and `deck:none`.

### Existing coverage

- **Terminal-before-publication gating**: `packages/engine/src/kernel/phase-advance.ts:687` runs `while (terminalResult(def, nextState, cachedRuntime) === null) { ... }`. Once a terminal checkpoint fires, the loop exits before the next card is revealed or the next microturn is published.
- **Future-stream class queries**: the existing `tokensInZone(zone, filter: {...})` aggregate primitive expresses them; the FITL encoding is proof.
- **Multi-phase terminal gating**: the existing `phases: [list]` field on authored checkpoints expresses it; the FITL encoding uses `phases: [coupRedeploy, main]`.
- **FITL final-coup regressions**:
  - `packages/engine/test/integration/fitl-coup-victory-phase-gating.test.ts:153` — "resolves final-coup ranking after coupRedeploy when no future coup cards remain"
  - `packages/engine/test/integration/fitl-coup-victory-phase-gating.test.ts:197` — "resolves final-coup ranking in main when the last coup is played without a coup round"

No new engine primitives, compiler changes, or DSL keywords are required. The single remaining gap is a generic (non-FITL) regression proving the pattern outside the FITL witness.

## Goals

- Name the authored pattern so it is discoverable by convention in specs, tickets, and LLM prompts.
- Prove the pattern generically with one regression outside FITL fixtures.
- Keep the FITLDETBOUND-001 encoding as the canonical regression witness and cite it by file+line.

## Non-Goals

- Introducing new DSL keywords (`currentCard`, `futureCards`, `futureCardsMatching`, etc.). The production witness proves these are unnecessary; the root cause was data, not a missing primitive (Foundation 15).
- Hardcoding FITL-specific coup logic into the engine.
- Changing the `phase-advance` terminal gate. It already enforces "no publication after terminal" and is covered by the existing bounded-computation corpus under `packages/engine/test/determinism/`.
- Redesigning the card-driven turn-flow model from Spec 17.

## Foundations Alignment

- **Foundation 2**: rule-authoritative campaign-end semantics continue to live in YAML.
- **Foundation 5**: terminal evaluation continues to use the single `terminalResult` kernel pipeline.
- **Foundation 10**: the existing bounded `phase-advance` loop (with `maxAutoAdvancesPerMove` cap and `STALL_LOOP_DETECTED` guard) already enforces bounded retirement.
- **Foundation 15**: the architectural lesson is named as an authoring convention rather than patched with new engine machinery the production game does not need.
- **Foundation 16**: the convention is proven by a new generic regression exercising it outside the FITL witness.

## Design

### Future-Stream Class-Filter Pattern

For terminal conditions over a class of future cards (e.g. "no future coup cards remain", "no future monsoon cards remain", "no future `era=late` cards remain"):

1. Gate the checkpoint with `phases: [<every-phase-where-the-boundary-can-arise>]`. If the boundary can arise in a non-coup phase because a coup-round is suppressed, include that phase. Do not assume a single phase is sufficient.
2. Express "no future X cards remain" by counting matching tokens across EVERY future-stream zone (typically `lookahead:*` and `deck:*`), using the existing `tokensInZone(<zone>, filter: {<class-predicate>})` aggregate. Do not rely on zone-emptiness of a single zone as a proxy for class exhaustion.
3. Express "the currently played card is the final X" by counting matching tokens in the played zone (typically `played:*`) with the same class filter.

The canonical production witness is `data/games/fire-in-the-lake/90-terminal.md:273-315` (checkpoint id `final-coup-ranking`). Treat it as the reference encoding.

### Why not new DSL keywords

An earlier draft proposed `currentCard`, `futureCards`, `futureCardsMatching(<predicate>)` as authored concepts. The production FITL encoding demonstrates that `tokensInZone(zone, filter)` already expresses each of these unambiguously across the full future stream. Introducing new keywords would add compiler/schema/engine surface without reducing authoring error — the canonical witness proves the existing primitive is sufficient. Foundation 15 argues for the convention-level fix, not new engine machinery.

## Required Changes

1. **Convention documentation.** Add the Future-Stream Class-Filter Pattern to the authored-game conventions documentation (co-locate with existing FITL/card-flow guidance). Cite the FITL witness at `data/games/fire-in-the-lake/90-terminal.md:273-315` and the regressions at `fitl-coup-victory-phase-gating.test.ts:153,197`.
2. **Generic non-FITL regression.** Add one kernel/terminal test exercising the pattern against a synthetic GameDef whose future-stream class is NOT coup-specific (e.g. a small fixture with `lookahead:* + deck:*` tokens tagged by an arbitrary property) and whose terminal checkpoint fires when the class is exhausted across the full future stream. The test must prove:
   - the checkpoint fires in the asserted phase when the class is exhausted,
   - once the checkpoint fires, `phase-advance` does not publish further decisions,
   - the fixture is not dependent on any FITL-specific construct.

## Acceptance Criteria

1. A named authored convention (Future-Stream Class-Filter Pattern) exists in repository docs with a citation to the canonical FITL witness (`data/games/fire-in-the-lake/90-terminal.md:273-315`) and the existing regressions (`fitl-coup-victory-phase-gating.test.ts:153,197`).
2. A generic non-FITL regression test exercises the pattern and proves (a) class exhaustion → checkpoint fires in the expected phase and (b) no decision publication after the checkpoint fires.
3. No new DSL keywords, compiler changes, or engine primitives are introduced.
4. FITL final-coup behavior (existing coverage at `fitl-coup-victory-phase-gating.test.ts:153,197`) is unchanged.

## Testing Requirements

- **Existing coverage (no new work):**
  - `packages/engine/test/integration/fitl-coup-victory-phase-gating.test.ts:153` — final-coup in `coupRedeploy` with leftover non-coup future cards.
  - `packages/engine/test/integration/fitl-coup-victory-phase-gating.test.ts:197` — final-coup in `main` when the coup round is suppressed.
  - `packages/engine/src/kernel/phase-advance.ts:687` bounded-loop behavior — covered by the existing determinism/canary corpus under `packages/engine/test/determinism/`.
- **New (this spec):** one generic kernel/terminal regression exercising the Future-Stream Class-Filter Pattern against a synthetic non-FITL fixture, proving (a) the checkpoint fires on class exhaustion and (b) no decision publication occurs afterwards.

## Follow-On Tickets

**Ticket namespace**: `142CARDENDS-*`

- `142CARDENDS-001`: Document the Future-Stream Class-Filter Pattern in the authored-conventions documentation, citing the FITL witness and existing regressions.
- `142CARDENDS-002`: Add the generic non-FITL regression for the Future-Stream Class-Filter Pattern.
