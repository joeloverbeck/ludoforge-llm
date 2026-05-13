# Spec 169 — Phase Boundary and Schedule Distance Refs

**Status**: COMPLETED
**Priority**: Medium — closes the most-tractable third of the cross-phase projection gap diagnosed in `reports/agent-cross-phase-projection-gap-2026-05-12.md`. Timing-aware considerations are the cheapest architectural improvement over the static `preferGovernWeighted=1000` prior, and they unblock the candidate-relative latent-value layer (deferred to a follow-up spec). Post-Spec-167 the harness wall-time is ~2 minutes for 15 seeds; this spec's runtime overhead is O(1) per ref lookup.
**Complexity**: M
**Date**: 2026-05-13
**Predecessors**: Spec 158 (microturn policy scope and ref-family registration shape), Spec 162 (Foundation #20 — preview signal integrity, status-bearing fallback contract), Spec 163 (generic microturn state-feature lookups, surface-tagged refs), Spec 165 (projected-state lookup refs — most recent surface-union-extension precedent), Spec 166 (candidate-parameter refs — most recent additive state-local ref family with fallback contract).
**Dependencies**: Spec 158 (closed); Spec 162 (closed); Spec 163 (closed); Spec 165 (closed); Spec 166 (closed).
**Trigger reports**:
- `reports/agent-cross-phase-projection-gap-2026-05-12.md` — internal gap report from the `fitl-arvn-agent-evolution` improve-loop campaign. Establishes the empirical evidence (exp-009 silent main-phase signal, exp-010 `-5.4` ablation) for the cross-phase projection gap.
- `reports/agent-cross-phase-proposal.md` — external deep-research proposal (ChatGPT-Pro). Reassessed against the codebase by this spec; per-recommendation dispositions in §12.

---

## 1. Goal

Expose a generic, observer-safe **schedule** for game-phase boundaries through two new state-local ref families: `phase.*` (phase identity) and `schedule.*` (distance to declared boundaries in declared units). Profile authors gain timing-aware considerations like "prefer Govern when there are ≥3 cards until the next coup phase" without invoking forward simulation, without per-game ref kinds, and without leaking hidden-information.

After this spec lands, a GameSpecDoc author can declare:

```yaml
phaseBoundaries:
  - id: coupEntry
    kind: phaseEntry
    phaseId: coupVictory          # first phase of FITL's coupPlan sequence
    schedule:
      kind: cardDraw
      deckId: eventDeck
      cardSelector:
        tags: [coup]              # data-authored tag on event cards
```

and a profile author can write:

```yaml
preferGovernEarlyInCoupCycle:
  scopes: [move]
  weight: 250
  when:
    ref: candidate.tag.govern
  value:
    ref: schedule.distance.toBoundary.coupEntry.cards
  scheduleFallback:
    onUnavailable: noContribution
```

The new families are **state-local, instantaneous reads**. They never invoke preview, never populate `unknownPreviewRefs[]`, and never trigger `tiebreakAfterPreviewNoSignal`. Foundation #20's status discipline is preserved: refs whose unit is statically unsupported for a boundary's schedule kind fail compilation; refs whose distance is dynamically unreachable (e.g., the last coup card has already been drawn) return status `unavailable` and require explicit fallback declaration when used in numeric considerations.

This spec is **Layer 1** of the three-layer architecture analyzed in the gap report. Layers 2 (candidate-relative latent-value features) and 3 (scoped horizon preview probe) are explicit follow-up work (§13).

## 2. Context (verified against codebase)

### 2.1 The cross-phase projection gap

`reports/agent-cross-phase-projection-gap-2026-05-12.md` documents that the current synthetic-completion preview driver (`packages/engine/src/agents/policy-eval.ts`, `policy-preview-drive.ts`, and the WASM port at `packages/engine-wasm/policy-vm/src/preview_drive.rs`) resolves only the action's immediate effect tree to depth `deep.depthCap` (16 with `deep1024`). It does NOT:

1. Advance through intervening factions' main-phase turns
2. Reach the next Coup phase, where ARVN-relevant control changes consolidate
3. Account for cumulative state changes across multiple actions

ARVN's victory formula is `coinControlPop + patronage > 50`. Patronage-gain actions (Govern, Patronage events) project correctly at depth 1; control-flip actions (Train, Patrol, Sweep, coup-resolving events) project as approximately zero-delta because their value materializes at Coup. The static `preferGovernWeighted=1000` consideration is a hand-tuned compensating prior for this systematic bias.

### 2.2 Empirical witnesses

Two ablation results from the gap report's exp-010 and exp-009 anchor this spec's empirical motivation:

- **exp-010** removed `preferGovernWeighted` entirely from `arvn-evolved.use.considerations`. CompositeScore regressed `-3.5333 → -8.9333` (delta `-5.4`); wins `3 → 2`. The static boost is load-bearing even with `deep1024 + continuedDeepening` enabled.
- **exp-009** added a `projectedControlPopGain` candidateFeature reading `preview.feature.coinControlPop` delta. At seed 1000, the consideration fired 222 times but contributed non-zero only on coup-phase forced actions — main-phase action candidates received contribution 0 across the board, because `coinControlPop` does not change within depth-16 reach for main-phase actions.

The pattern: the architectural gap is in *cross-phase value projection*, not in inner-preview depth (spec 164 already extended that) or candidate-param discrimination (spec 166 already closed that).

### 2.3 Phase machinery already in the kernel

The kernel already models phases as first-class structures (verified against `packages/engine/src/kernel/types-core.ts`):

- `PhaseDef { id: PhaseId, onEnter?: EffectAST[], onExit?: EffectAST[], actionDefaults? }` at lines 183-191.
- `TurnStructure { phases: readonly PhaseDef[], interrupts? }` at lines 193-196.
- `ActionDef.phase: readonly PhaseId[]` at line 202 — actions declare which phase(s) they belong to.
- `TriggerEvent` includes `{ type: 'phaseEnter', phase: PhaseId }` and `{ type: 'phaseExit', phase: PhaseId }` at lines 213-214.
- The `turnIntrinsic: 'phaseId'` ref already returns the current phase ID.
- `PhaseId` is a branded type at `packages/engine/src/kernel/branded.ts:7`.

The missing piece is the **boundary** abstraction: an identified target whose schedule distance is computable in declared units (cards, microturns, actions, turns, rounds). Boundaries are not phases; they reference phases (or other conditions) and add scheduling metadata.

### 2.4 FITL coup encoding (verified)

`data/games/fire-in-the-lake/30-rules-actions.md` declares coup as a sequence of six phases:

```
turnStructure.phases:
  - main, coupVictory, coupResources, coupSupport,
    coupRedeploy, coupCommitment, coupReset, ...
```

Coup actions declare `phase: [coupVictory]`, `phase: [coupResources]`, etc. The proposal's wording "phaseId: coup" does **not** match FITL: there is no single coup phase, and the boundary must target `coupVictory` (the first phase of the coup sequence) to signal "coup is about to fire". The trigger is event-card-identity-based — drawing a card tagged `coup` from `eventDeck` advances the kernel into the coup phase sequence. This is **not** a "deckMarker" abstraction (cards are not markers); it is a card-identity predicate against an event deck.

### 2.5 No existing schedule or boundary refs (verified)

Verified by grep: there is no `schedule.*` ref family, no `phase.next.*` ref, no boundary abstraction, and no deck-marker/scheduled-phase concept anywhere in the engine. `turnIntrinsic: 'phaseId'` is the closest extant primitive and only returns the current phase. Adding `phase.*` and `schedule.*` is purely additive — no overload, no rename, no compatibility shim.

### 2.6 Ref-family extension precedent (Specs 165 and 166)

Spec 165 added the `lookup.surface: 'policyState' | 'previewOptionState'` discriminator with surface-tagged ref resolution and explicit ready/unavailable status. Spec 166 added `candidate.params.<name>` as a state-local typed-scalar ref family with the `candidateParamFallback { onUnavailable }` contract parallel to `previewFallback`. The compile-agents.ts ref-validation surface (`packages/engine/src/cnl/compile-agents.ts:144,220,2144-2213` for `candidateParam`) is the canonical insertion point for the new families.

`packages/engine/src/kernel/types-core.ts:413-416,421-425` declares the `candidateParam` ref-AST node with `onMissing` enum. This spec follows the same shape for `scheduleDistance` and `phaseIntrinsic` ref-AST nodes.

### 2.7 No existing candidate-effect introspection or control-rule abstraction (verified)

Verified by grep: there is no `candidate.effect.*` ref family, no `space.control.*` operator, no `controlRule` abstraction in GameSpecDoc or the kernel, and no hypothetical-delta evaluator (`wouldFlipIf`-style). The proposal's Layer 2 surface would require substantial new compiler infrastructure (static analysis over effect ASTs, generic control-rule declaration, hypothetical evaluator), which this spec explicitly defers (§13).

### 2.8 Post-Spec-167 budget context

Spec 167 reduced the `fitl-arvn-agent-evolution` 15-seed harness wall-time from ~15 minutes to ~2 minutes via WASM bootstrap + worker-thread sharding + incremental TypeScript build. Spec 168 cut per-card kernel time from ~2051 ms to ≤1700 ms. The gap report's "B+C cheap, defer A" sequencing was written under the 13-minute baseline; the analytic conclusion still holds (forward-model preview is 20-50× per-decision cost, still too expensive to ship naively), but this spec's O(1) lookup cost is negligible against either baseline.

## 3. Non-goals

- **No candidate-effect introspection.** `candidate.effect.addPieces.*`, `candidate.effect.removePieces.*`, `candidate.effect.controlRelevantSpaces`, and all other Layer-2-style refs are deferred. They require static analysis over effect ASTs and a generic candidate-effect summary AST.
- **No control-rule abstraction.** `space.control.margin.<SideId>`, `space.control.requiredDeltaToFlip.<SideId>`, and `control.wouldFlipIf` are deferred. Control is currently implicit in FITL's state structure; lifting it to a data-authored rule with a hypothetical-delta evaluator is substantial new compiler work.
- **No horizon preview probe.** `preview.horizon.<ProbeId>.*` and forward-model-call budgets are deferred to a future spec (proposal's Layer 3 / Spec 170 equivalent).
- **No WASM forward-model primitives.** WASM kernel exports for `enumerateLegalActions` / `applyAction` / `advanceUntilDecision` are deferred (proposal's Spec 171 equivalent).
- **No profile refactor.** The `arvn-evolved` consideration set is not modified by this spec. Decomposing `preferGovernWeighted=1000` into named latent-value terms depends on Layer 2's candidate-relative features; the demonstration consideration in Phase 5 is illustrative only, not a promotion.
- **No new preview surface.** `phase.*` and `schedule.*` are state-local, never preview-derived. They do not interact with `previewFallback`, `unknownPreviewRefs[]`, or `tiebreakAfterPreviewNoSignal`. (They do introduce their own ready/unavailable status, with `scheduleFallback` for the unavailable case — see §4.4.)

## 4. Architecture

### 4.1 GameSpecDoc declaration: `phaseBoundaries`

A new top-level GameSpecDoc field, additive and optional. A GameSpec that omits `phaseBoundaries` is fully valid; refs against undeclared boundaries fail at compile time per §5.

```yaml
phaseBoundaries:
  - id: coupEntry                      # BoundaryId (branded, unique within game)
    kind: phaseEntry                   # 'phaseEntry' | 'phaseExit' | 'condition'
    phaseId: coupVictory               # required for phaseEntry/phaseExit kinds
    schedule:                          # optional; absence => distance refs unavailable
      kind: cardDraw                   # 'cardDraw' | 'turnCount' (extensible)
      deckId: eventDeck                # required for cardDraw kind
      cardSelector:                    # predicate over cards in the deck
        tags: [coup]                   # match-any-tag set
        # OR cardIds: [card-87, ...]
  - id: roundEnd
    kind: condition
    # Reserved for a future condition-schedule extension.
```

Validation rules (Phase 0 acceptance):

- `id` MUST be a unique BoundaryId within the GameSpec.
- For `kind: phaseEntry | phaseExit`: `phaseId` MUST resolve to a declared phase (in `turnStructure.phases` or `turnStructure.interrupts`).
- For `kind: condition`: condition payload validation is reserved for a future schedule-kind extension; no schedule distance refs are available for this kind in Phase 0 (only identity refs).
- For `schedule.kind: cardDraw`: `deckId` MUST resolve to a declared `eventDecks[]` entry; `cardSelector` MUST reference declared card tags or existing card ids in that deck.

The schedule kind is extensible by design: `cardDraw` covers FITL coup; `turnCount` covers games with N-turn-fixed phases. Additional kinds (`microturnSchedule`, `eventTrigger`, etc.) can be added without changing the boundary ID surface.

### 4.2 New ref families

Two new state-local ref families, registered in `compile-agents.ts` per the spec-166 precedent.

**Phase identity refs**:

| Ref | Type | Semantics | Status |
|---|---|---|---|
| `phase.current.id` | PhaseId | Current phase id (alias of existing `turn.phaseId`; included for grammar symmetry) | always `ready` |
| `phase.next.id` | PhaseId | The phase id that will be entered next per `turnStructure.phases` order | `ready` if known, `unavailable` if current phase is interrupt-state with no determinate successor |
| `schedule.nextBoundary.id` | BoundaryId | Identity of the earliest boundary whose distance is finite from the current state | `ready` if any boundary is finite, `unavailable` if none |

**Schedule distance refs**:

| Ref | Type | Compiler-validated when | Runtime status |
|---|---|---|---|
| `schedule.distance.toBoundary.<BoundaryId>.cards` | integer (≥0) | `<BoundaryId>` is declared AND its `schedule.kind` admits card-count distance (today: `cardDraw`) | `ready` if a triggering card remains in the targeted deck; `unavailable` if no triggering card remains in any visible portion of the deck |
| `schedule.distance.toPhase.<PhaseId>.cards` | integer (≥0) | `<PhaseId>` is declared AND the phase has at least one `phaseEntry` boundary with card-draw schedule | as above |

`.toPhase.<PhaseId>.cards` refs are convenience aliases that resolve at compile time to the first declared boundary of `kind: phaseEntry` targeting `<PhaseId>`. They fail at compile time if no such boundary is declared. Non-card units (`.microturns`, `.actions`, `.turns`, `.rounds`) are Phase 3b work and remain rejected until their unit semantics, counters, or schedule-rate substrate are defined.

Each new ref kind is registered in:

- `packages/engine/src/kernel/types-core.ts` — new AST node types (`PhaseIntrinsicRef`, `ScheduleDistanceRef`)
- `packages/engine/src/cnl/compile-agents.ts` — ref-kind validation, scope check, BoundaryId / PhaseId / unit cross-validation
- `packages/engine/src/agents/policy-runtime.ts` — runtime resolver dispatch
- `packages/engine/src/agents/policy-wasm-runtime.ts` — opcode mapping (Phase 4)

### 4.3 Status semantics and `scheduleFallback` contract

The new ref families are state-local but can become `unavailable`. The `unavailable` status occurs when:

1. The boundary is permanently unreachable (e.g., final coup card has been drawn this game, no further cards trigger the boundary).
2. The boundary's schedule kind cannot derive distance in the requested unit when that derivation depends on hidden information the agent's observer view does not include (see §4.6).
3. The condition-kind boundary's condition cannot be evaluated to a determinate distance.

Per Foundation #20's discipline, an `unavailable` ref MUST NOT silently coerce to a numeric contribution. Profile YAML using a schedule ref in a numeric consideration MUST declare a fallback:

```yaml
preferGovernEarlyInCoupCycle:
  scopes: [move]
  weight: 250
  when:
    ref: candidate.tag.govern
  value:
    ref: schedule.distance.toBoundary.coupEntry.cards
  scheduleFallback:
    onUnavailable: noContribution   # | { constant: 0 } | dropConsideration
```

The fallback options mirror the spec-166 `candidateParamFallback` enum:

- `noContribution` — the consideration emits zero contribution.
- `{ constant: <integer> }` — explicit numeric substitution.
- `dropConsideration` — the consideration is omitted entirely from the score (semantically distinct from `noContribution` for trace bookkeeping).

When a `when:` clause references a schedule ref that resolves `unavailable`, the consideration is treated as if `when:` evaluated false (consistent with existing condition-evaluator semantics for missing inputs). The fallback only applies to refs in the `value:` expression. This matches Foundation #20's "fallback path is explicit and trace-visible" guarantee.

### 4.4 Compiler validation

The compiler MUST reject (at compile time):

| Diagnostic code | Rejects |
|---|---|
| `PHASE_BOUNDARY_DUPLICATE_ID` | Two `phaseBoundaries[]` entries share an `id`. |
| `PHASE_BOUNDARY_UNKNOWN_PHASE` | `phaseId` references a phase not declared in `turnStructure.phases` or `turnStructure.interrupts`. |
| `PHASE_BOUNDARY_UNKNOWN_DECK` | `schedule.deckId` references a deck not declared in `eventDecks[]`. |
| `PHASE_BOUNDARY_UNKNOWN_CARD_TAG` | `schedule.cardSelector.tags[]` references a tag not declared on any card in the deck. |
| `PHASE_BOUNDARY_UNKNOWN_CARD_ID` | `schedule.cardSelector.cardIds[]` references a card id not in the deck. |
| `PHASE_BOUNDARY_INVALID_UNIT_RATE` | `schedule.unitRates.<unit>` is present but is not an exact positive integer. |
| `SCHEDULE_REF_UNKNOWN_BOUNDARY` | `schedule.distance.toBoundary.<X>.<unit>` references an undeclared BoundaryId. |
| `SCHEDULE_REF_UNKNOWN_PHASE` | `schedule.distance.toPhase.<X>.<unit>` references an undeclared PhaseId. |
| `SCHEDULE_REF_NO_PHASE_BOUNDARY` | `schedule.distance.toPhase.<X>.<unit>` references a phase with no declared `phaseEntry` boundary. |
| `SCHEDULE_REF_UNSUPPORTED_UNIT` | Requested unit is incompatible with the boundary's `schedule.kind` (e.g., `.cards` on a `kind: condition` boundary). The compiler treats unit-kind compatibility as a static fact derivable from the spec. |
| `PHASE_BOUNDARY_EMPTY_CARD_SELECTOR` | `schedule.cardSelector` declares neither a non-empty `tags[]` nor a non-empty `cardIds[]`. |

The compiler emits warning diagnostic `SCHEDULE_REF_AMBIGUOUS_PHASE_BOUNDARY` when `.toPhase.<PhaseId>.cards` matches multiple `phaseEntry` boundaries; declaration order remains authoritative and the first matching boundary is selected.

The compatibility matrix after Phase 3a:

| `schedule.kind` | `cards` | `microturns` | `actions` | `turns` | `rounds` |
|---|---|---|---|---|---|
| `cardDraw` | ✅ | ❌ | ❌ | ❌ | ❌ |
| (future `turnCount`) | ❌ | ❌ | ❌ | ❌ | ❌ |
| `condition` | ❌ | ❌ | ❌ | ❌ | ❌ |

A `condition`-kind boundary exposes only identity refs (`schedule.nextBoundary.id` if it is the nearest), not distance refs. Phase 3b owns any future expansion beyond `cardDraw` + `cards`; `turnCount` is reserved for the schedule-kind extension surface and not implemented in this spec.

Phase 3b selects the compiled-rate model for `cardDraw` non-card units:

```yaml
phaseBoundaries:
  - id: coupEntry
    kind: phaseEntry
    phaseId: coupVictory
    schedule:
      kind: cardDraw
      deckId: eventDeck
      cardSelector:
        tags: [coup]
      unitRates:
        actions: 2
        turns: 1
```

`unitRates` values are exact positive integers and mean "this many units per card of
distance to the next matching trigger card." Runtime resolution first computes the
same observer-safe card distance used by `.cards`; if the card distance is
`ready`, the requested non-card unit resolves to `cardDistance * unitRates[unit]`.
If the card distance is unavailable, the non-card unit returns the same
unavailable status. If a non-card unit has no declared rate, the compiler rejects
that ref with `SCHEDULE_REF_UNSUPPORTED_UNIT`.

The compatibility matrix after Phase 3b:

| `schedule.kind` | `cards` | `microturns` | `actions` | `turns` | `rounds` |
|---|---|---|---|---|---|
| `cardDraw` | ✅ | ✅ only with `unitRates.microturns` | ✅ only with `unitRates.actions` | ✅ only with `unitRates.turns` | ✅ only with `unitRates.rounds` |
| `turnCount` | ❌ | ❌ | ❌ | ❌ | ❌ |
| `condition` | ❌ | ❌ | ❌ | ❌ | ❌ |

### 4.5 Runtime state and resolution

Each declared boundary contributes a `BoundaryRuntimeState` entry to `GameDefRuntime.scheduleIndex` (a new field), built at compile time from the boundary's schedule kind. The runtime maintains:

- For `cardDraw` schedules: a per-deck index `{ deckId → cardId[] }` of currently-undrawn cards in deck order, and a per-boundary index of "next triggering card position" derived from `cardSelector`. Card-draw events (effect kind `drawFromDeck`) update the index by O(1) advancement.
- For `phaseEntry`/`phaseExit` identity: read directly from the kernel's phase-sequence state.
- For `condition` boundaries: lazy evaluation at ref-resolution time.

Resolution cost: O(1) per ref lookup. The schedule index is maintained as part of `GameDefRuntime` per the spec-143 ownership classification (sharedStructural where derived from immutable spec data; runLocal where it tracks per-run mutable state). The card-draw index is per-run (mutable) and lives under `forkGameDefRuntimeForRun` ownership.

### 4.6 Observer alignment (Foundation #4)

Schedule refs MUST respect observer visibility. Two FITL-relevant cases:

1. **FITL event deck order remains hidden in the live GameSpec** — drawn cards and the lookahead slot are face-up, but `deck:none` is still `visibility: hidden`. Under the Phase 0-4 resolver contract, `schedule.distance.toBoundary.coupEntry.cards` therefore resolves `unavailable` with reason `hiddenDeck` for ordinary player agents. Phase 5 demonstrates the authored boundary and the trace-visible `scheduleFallbackFired` path, not omniscient numeric countdowns.

2. **Hidden-deck games** — for a deck whose composition is private (including current FITL `deck:none`), card-draw distance is observer-dependent. The runtime resolver MUST consult the observer's visibility view; if the requested distance depends on unseen cards, status is `unavailable` (not `0`, never the omniscient distance).

This spec intentionally does not add an omniscient override in Phase 5. A future generic observer-policy extension may add explicit omniscient-analysis or partial-visibility semantics, but that is outside this FITL data ticket.

### 4.7 Trace surface

When a consideration uses a schedule or phase ref, the trace MUST expose the value or fallback path that affected scoring. The generic `inputRefs` row below is the intended ready-state trace shape and remains a trace-surface follow-up unless a later ticket wires that row into the emitted TypeScript trace.

```json
{
  "consideration": "preferGovernEarlyInCoupCycle",
  "inputRefs": {
    "schedule.distance.toBoundary.coupEntry.cards": {
      "status": "ready",
      "value": 5,
      "boundaryId": "coupEntry",
      "unit": "cards"
    }
  },
  "when": true,
  "weight": 250,
  "value": 5,
  "contribution": 1250
}
```

When the ref resolves `unavailable` and a numeric fallback fires, the current emitted TypeScript trace pins the fallback through candidate metadata:

```json
{
  "actionId": "govern",
  "scoreContributions": [
    { "termId": "preferGovernEarlyInCoupCycle", "contribution": 0 }
  ],
  "scheduleFallbackFired": {
    "termId": "preferGovernEarlyInCoupCycle",
    "kind": "noContribution"
  }
}
```

## 5. Compiler changes

The implementation lives in `packages/engine/src/cnl/compile-agents.ts` and its sibling modules:

- `compileGameSpec` accepts a new top-level `phaseBoundaries` array; validates against the rules in §4.4.
- The ref-kind validator (search for `candidateParam` validation as the template) gains two new kinds: `phaseIntrinsic` and `scheduleDistance`.
- The ref-AST union in `types-core.ts` gains `PhaseIntrinsicRef` and `ScheduleDistanceRef` nodes.
- Branded type `BoundaryId` added to `kernel/branded.ts` alongside existing brands.
- New diagnostic codes registered in `compile-agents.ts` per the spec-166 precedent (search `DIAGNOSTIC_CODES` or equivalent registry).

The compiler must reject schedule refs at scopes other than `move` and `microturn` (the same scopes that currently admit `candidate.tag.*` and `candidate.params.*`). State-local refs at preview-inner scopes do not need new dispatch because the preview drive snapshots the policy state and reads refs through the same resolver.

## 6. Runtime changes

The implementation lives in `packages/engine/src/agents/policy-runtime.ts`:

- The ref resolver dispatcher (search for `candidateParam` handling) gains two new branches.
- `GameDefRuntime` gains a `scheduleIndex` field; its initialization runs in `compileGameSpec` against the post-validation `phaseBoundaries`.
- `forkGameDefRuntimeForRun` (`packages/engine/src/kernel/gamedef-runtime.ts:84-95`) extends per-run state to include the per-deck card-draw index. The shared structural component is the boundary definitions; the runLocal component is the current draw position.
- Drawing a card from a tracked deck must update the corresponding boundary's "next triggering card position" in O(1). The kernel's `drawFromDeck` effect handler emits a runtime hook that the schedule index subscribes to.

## 7. Phases and acceptance criteria

This spec ships in five sequential phases with explicit acceptance criteria. Each phase produces a measurable artifact and may land independently.

| Phase | Scope | Acceptance |
|---|---|---|
| **0** | Types, branded `BoundaryId`, GameSpecDoc declaration, compiler validation, diagnostic codes. No ref resolution yet. | Architectural-invariant tests pass for: (a) duplicate id rejection, (b) unknown phase/deck/tag/cardId rejection, (c) unit-kind compatibility matrix, (d) byte-identical compile output for a GameSpec compiled twice with `phaseBoundaries` declared. |
| **1** | `phase.current.id`, `phase.next.id`, `schedule.nextBoundary.id` refs implemented. | Golden tests for each ref against a fixture GameSpec; replay-determinism test (same GameDef + seed produces identical ref readouts across a 20-turn trace). |
| **2** | `schedule.distance.toBoundary.<X>.cards` for `cardDraw` schedules. Card-draw index maintenance under `drawFromDeck`. | Golden distance tests at ≥5 distinct game positions (start of game, mid-cycle, immediately after coup card draw, end-game with no remaining coup cards [status: unavailable]). `scheduleFallback` paths exercised in trace output. |
| **3a** | `schedule.distance.toPhase.<PhaseId>.cards` compile-time aliases to the first matching `phaseEntry` boundary. | Alias rewrite test; runtime parity test against direct `.toBoundary.<picked>.cards`; ambiguity warning test. |
| **3b** | Real non-card units (`.microturns`, `.actions`, `.turns`, `.rounds`) for `cardDraw` boundaries with exact declared `unitRates`. Underived units remain compile-time unsupported. | Per-unit golden test; one cross-unit consistency test matching the declared-rate semantics. |
| **4** | WASM opcode integration: new ref kinds added to the policy VM ABI; Rust handlers in `lib.rs` resolve schedule refs from the encoded input. | WASM↔TS bytecode equivalence test (`policy-bytecode-equivalence.test.ts`) passes with the new ref kinds in a fixture profile. Equivalence holds across `wasmScoreRowRoute` and `wasmPreviewCandidateFeatureRowRoute` paths. |
| **5** | FITL `phaseBoundaries` authored in `data/games/fire-in-the-lake/`; one demonstration consideration in a sandbox profile (NOT promoted to `arvn-evolved`). | Demonstration consideration compiles and emits trace-visible `scheduleFallbackFired` metadata for the hidden FITL deck. No regression on the `policy-profile-quality` baseline. |

Phases 0-3 are engine-internal; Phase 4 is the WASM cross-cut; Phase 5 is the FITL data deliverable. Phases 0-4 must land before Phase 5 ships.

## 8. Test plan

Per `.claude/rules/testing.md`, each new test file declares its class.

### 8.1 architectural-invariant tests

- `phase-boundary-compile-validation.test.ts` — every rejection rule in §4.4 has a coverage row (duplicate id, unknown phase, unknown deck, unknown tag, unknown card id, unsupported unit per kind, schedule ref against undeclared boundary, schedule ref against phase with no entry boundary). Each row asserts both the rejection AND the diagnostic code.
- `phase-boundary-determinism.test.ts` — compile the same GameSpec twice with `phaseBoundaries` declared; assert byte-identical GameDef output, including identical iteration order of compiled boundary metadata.
- `schedule-ref-observer-view.test.ts` — schedule refs against publicly-observable decks resolve `ready`; against hidden decks (when `schedule.observerPolicy` is the default `observerView`) resolve `unavailable`. Asserts no information leak via numeric fallback.
- `schedule-ref-fallback-discipline.test.ts` — a profile using `schedule.distance.toBoundary.<X>.cards` in numeric context WITHOUT `scheduleFallback` fails compilation (`SCHEDULE_REF_MISSING_FALLBACK` diagnostic, parallel to `candidateParamFallback` discipline).
- `schedule-ref-card-draw-index-correctness.test.ts` — apply a sequence of `drawFromDeck` effects; assert the schedule index updates in O(1) and the post-draw distance matches the canonical recomputation from a fresh state.

### 8.2 golden-trace tests

- `phase-boundary-fitl-coup-distance.test.ts` — golden hidden-deck distance statuses at game positions: turn 1 start, just after first non-coup event card draw, immediately after a coup card draw, mid-final-round, end-game. Each readout is byte-pinned to `unavailable: hiddenDeck` because FITL's draw deck remains hidden.
- `schedule-ref-consideration-trace.test.ts` — a fixture profile uses `preferGovernEarlyInCoupCycle`; the trace row's score contribution and `scheduleFallbackFired` metadata are byte-pinned. The test does not require a generic ready-state `inputRefs` row unless a later trace-redesign ticket adds that surface.

### 8.3 convergence-witness tests

None mandated by this spec. The Phase 5 demonstration consideration is exercised in a non-promoting fixture profile; profile-quality witnesses on `arvn-evolved` remain owned by the active campaign.

### 8.4 WASM equivalence

`policy-bytecode-equivalence.test.ts` is extended with a new fixture exercising `phase.current.id`, `phase.next.id`, and `schedule.distance.toBoundary.coupEntry.cards`. WASM and TS paths must produce identical scoring rows for all 15 baseline seeds.

## 9. Foundation alignment

| Foundation | How this spec respects it |
|---|---|
| #1 Engine Agnosticism | The kernel knows `BoundaryId`, `PhaseId`, `cardDraw` schedule kind, and `cardSelector` predicates — generic primitives. It never knows about coup, ARVN, FITL, Patronage, or any game-specific phase name. The coup-vs-non-coup distinction lives entirely in GameSpecDoc data (`tags: [coup]` on cards; `phaseId: coupVictory` in the FITL boundary declaration). |
| #2 Evolution-First Design | `phaseBoundaries` is GameSpecDoc YAML; evolution can mutate boundary declarations to explore games with different scheduling structures. |
| #5 One Rules Protocol | Schedule refs are read by the same policy resolver in agents, simulator, and (post-Phase 4) WASM VM. No bypass paths. The boundary runtime state is part of `GameDefRuntime`, shared across all clients. |
| #6 Schema Ownership Stays Generic | No per-game schema files. `phaseBoundaries` is a generic GameSpecDoc field with declarative validation. |
| #7 Specs Are Data, Not Code | All schedule semantics expressed as declarative YAML (boundary kind, schedule kind, card selector). No callbacks, no embedded code. Future schedule kinds extend the declarative surface, not via plugins. |
| #8 Determinism Is Sacred | Schedule resolution is a pure function of `(GameState, observerView)`. Card-draw index updates are deterministic O(1) reads of the canonical deck state. No wall-clock, no hash-iteration-order, no ambient state. |
| #10 Bounded Computation | Every ref resolution is O(1). The schedule index sizes scale with `O(decks × boundaries)`, bounded by spec at compile time. No new cap class is needed because no new unbounded computation surface is introduced. |
| #12 Compiler-Kernel Validation | The compiler validates everything statically knowable (boundary id uniqueness, phase/deck/tag/card resolution, unit-kind compatibility). The kernel validates state-dependent semantics (current draw position, runtime status `ready` vs `unavailable`). The boundary is clean. |
| #13 Artifact Identity and Reproducibility | Compiled boundary metadata is part of the GameDef hash. A replay trace records the schedule index state at each ref read, so reproducibility is preserved across versions. |
| #16 Testing as Proof | Every validation rule, status path, and equivalence claim has a dedicated test (§8). The conformance corpus is extended with one fixture exercising the new ref family. |
| #17 Strongly Typed Domain Identifiers | `BoundaryId` is a new branded type alongside `PhaseId`. Ref AST nodes carry typed IDs, not raw strings. |
| #20 Preview Signal Integrity | Schedule refs are NOT preview-derived, so they do not interact with `previewFallback` or `tiebreakAfterPreviewNoSignal`. But they introduce a parallel ready/unavailable discipline with `scheduleFallback`, mirroring the spec-166 `candidateParamFallback` contract. Foundation #20's spirit (no silent coercion of non-ready status into numeric contribution) is preserved. |

## 10. Code anchors for implementers

- **Types**: `packages/engine/src/kernel/types-core.ts` — add `PhaseBoundaryDef`, `ScheduleKindDef`, `CardSelector`, `PhaseIntrinsicRef`, `ScheduleDistanceRef`. `packages/engine/src/kernel/branded.ts` — add `BoundaryId`.
- **Compiler validation**: `packages/engine/src/cnl/compile-agents.ts` — top-level `compileGameSpec` accepts `phaseBoundaries`; ref-kind validator (search for `candidateParam` template at lines ~2144-2213) extended with two new kinds. Diagnostic registry: search for existing diagnostic-code constants.
- **Runtime resolver**: `packages/engine/src/agents/policy-runtime.ts` — ref dispatcher extended with two new branches (search for `candidateParam` runtime resolution).
- **GameDefRuntime**: `packages/engine/src/kernel/gamedef-runtime.ts:84-95` — `forkGameDefRuntimeForRun` extends per-run state for the card-draw index. Architecture note in `docs/architecture.md` "Runtime Ownership" section.
- **Phase 3b unit rates**: `packages/engine/src/cnl/compile-phase-boundaries.ts` validates exact positive integer `cardDraw.schedule.unitRates`; `packages/engine/src/agents/policy-runtime.ts` resolves non-card units as exact multiples of the ready card distance.
- **WASM ABI**: `packages/engine-wasm/policy-vm/src/lib.rs` — new opcode slots and feature constants (search `FEATURE_CANDIDATE_PARAM` as template). `packages/engine/src/agents/policy-wasm-runtime.ts` — opcode-to-ref-kind mapping.
- **FITL data (Phase 5)**: `data/games/fire-in-the-lake/30-rules-actions.md` — append `phaseBoundaries:` block. Coup event cards must carry a `tags: [coup]` field, which may require a sweep across event card declarations.
- **Cookbook**: `docs/agent-dsl-cookbook.md` — new section documenting `phase.*` and `schedule.*` ref families with worked examples.

## 11. Open questions

1. **Phase-instance counting for `schedule.distance.toPhase.<PhaseId>.actions`.** FITL's coup is a 6-phase sequence; agents may want either "actions until the first coup phase fires" or "actions until the coup sequence completes". This spec ships only "actions until phase first enters" semantics (the boundary-anchored reading); cumulative-sequence distance is deferred.

2. **Boundary visibility for partially-revealed decks.** FITL's event deck is fully revealed (drawn cards stay face-up); other games may have decks where only the top N cards are visible. Phase 0 ships only fully-observable-deck support; partially-observable observability adds a `schedule.observerPolicy` enum entry (`topNVisible`) reserved for a follow-up.

3. **Multiple boundaries per phase.** A phase could plausibly have both a `phaseEntry` and a `phaseExit` boundary declared. The runtime resolver must disambiguate; this spec rules that distinct boundary ids resolve independently and `.toPhase.<PhaseId>` aliases the `phaseEntry` boundary (if any). If both `phaseEntry` and `phaseExit` boundaries exist for one phase, the alias resolves to `phaseEntry`. Compile-time warning suggested if ambiguity exists.

4. **Schedule-kind extension surface.** This spec ships `cardDraw` only; `turnCount` and `condition` are declared in the kind enum but not implemented. The extension contract is: a new kind adds (a) a new validator branch, (b) a new runtime index updater, (c) entries in the unit-compatibility matrix, (d) WASM opcode coverage. No new ref family is needed per extension.

5. **Interaction with `interrupts`.** `turnStructure.interrupts` declares phases that can preempt the normal sequence. The runtime's `phase.next.id` and `schedule.distance.*` must account for interrupt phases. Phase 1 acceptance includes a test confirming the resolver consults `interrupts` correctly.

## 12. Reassessment of source proposal

The external proposal at `reports/agent-cross-phase-proposal.md` ("Phase-Horizon Latent Value first, Scoped Horizon Preview second") proposes a five-spec roadmap (Specs 167–171 in the proposal's numbering). Per-recommendation disposition:

| Proposal recommendation | Disposition | Notes |
|---|---|---|
| Spec 167 — Phase Boundary and Schedule Refs | **Adopted with adjustment** as this spec (renumbered 169 because proposal's 167 number was consumed by the unrelated harness-performance spec that landed after the deep-research request). |
| Schedule abstraction `kind: deckMarker` with `markerTag` | **Adjusted** to `kind: cardDraw` with `cardSelector { tags, cardIds }`. FITL's coup trigger is event-card identity, not a deck-position marker; the generalized predicate covers both the proposal's mental model and FITL's actual mechanism. |
| Boundary `phaseId: coup` | **Corrected**. FITL has no `coup` phase; coup is a sequence of six phases (coupVictory, coupResources, coupSupport, coupRedeploy, coupCommitment, coupReset). The FITL boundary targets `phaseId: coupVictory` (the sequence's first phase). |
| `schedule.*` family naming (vs `turn.*`) | **Adopted**. The proposal's separation of `schedule.*` (countdowns) from `phase.*` (identity) from `turn.*` (current-turn state) is correct and clarifying. |
| Ref units `.cards`, `.microturns`, `.actions`, `.turns`, `.rounds`, `.playerDecisions` | **Adopted minus `.playerDecisions`** — its semantics are unclear under FITL's faction-eligibility windows. Reserved for a follow-up if a use case justifies it. |
| Status discipline (`ready` / `unavailable` / `hidden` / `stochastic` / `partial` / `budgetExhausted` / `boundaryNotReached`) | **Adopted in simplified form**: Phase 0 implements `ready` and `unavailable` only. `hidden` collapses into `unavailable` per observer view (no separate status). `stochastic` / `partial` / `budgetExhausted` / `boundaryNotReached` are horizon-probe concepts (proposal's Layer 3) and are deferred. |
| Compiler rejection of unknown BoundaryId / unsupported unit / unknown phase | **Adopted**. See §4.4. |
| `BoundaryId` and `PhaseId` as branded types per Foundation #17 | **Adopted**. New brand added; existing `PhaseId` reused. |
| Trace surface (`inputRefs[].status`, `value`, `provenance`) | **Adopted**. See §4.7. |
| Spec 168 — Candidate Local Effect Summary and Latent Control Features (`candidate.effect.*`, `space.control.*`, `control.wouldFlipIf`) | **Deferred to follow-up spec**. Requires substantial new compiler infrastructure (static effect-tree analysis + generic control-rule abstraction + hypothetical-delta evaluator). Worth scoping carefully on its own merits; not a trivial Layer-1 extension. |
| Spec 169 — FITL ARVN Profile Refactor (decompose `preferGovernWeighted`) | **Deferred** until Layer 2 lands. Without candidate-relative latent features, the decomposition would still bottom out at an opaque residual prior. The campaign is currently paused at `bff2babcc`; refactor urgency is low. |
| Spec 170 — Scoped Horizon Preview Probe (`preview.horizon.*` with forward-model budgets) | **Deferred per proposal's own sequencing**. The proposal explicitly recommends shipping L1+L2 first and escalating only if they plateau. Post-Spec-167 the harness budget is more permissive than the proposal assumed, but the 20-50× cost estimate is unchanged. |
| Spec 171 — WASM Forward Model Acceleration | **Deferred per proposal's own sequencing**. Conditional on Spec 170 proving value. |
| Heuristic state-features (`feature.fragileCoinControlPopulation`, `feature.patronagePressure`, etc.) | **Out of scope here**. These are pure GameSpecDoc YAML — authorable today with the existing aggregator infrastructure. No engine change required; profile authors can experiment without a spec. The campaign attempted `projectedControlPopGain` in exp-009 along these lines; failure was due to the cross-phase gap, not aggregator capability. |
| "Bytecode-only mid-tier" (bytecode traversing opponent turns) | **Adopted as rejected**. The proposal correctly rejects this pattern; the engine MUST NOT let policy bytecode own state transition semantics (Foundation #7). Noted here for traceability; no implementation surface. |
| WASM strategy (B+C in bytecode, defer kernel forward-model WASMification until horizon probe proves value) | **Adopted**. This spec's Phase 4 adds the schedule ref opcode slots in the existing policy VM; no kernel-WASM expansion. |
| Compiler trace output JSON shape | **Adopted minus horizon-specific fields** (`budgetExhausted`, `forwardModelCallsUsed` — those belong to the horizon-probe spec). |

The proposal's testing plan and experiment design (paired seeds, `governPriorDependencyScore` metric) are sound but operate at the campaign layer, not the engine layer. The campaign and improve-loop authors should adopt those experiment patterns when the L2 / profile-refactor specs ship; this spec's tests cover engine-side determinism, validation, and equivalence only.

## 13. Out of scope

- **Layer 2 surface** (candidate-effect introspection, control-rule abstraction, hypothetical-delta operators, named latent-value features). Deferred to a follow-up spec.
- **Layer 3 surface** (scoped horizon preview probe, `preview.horizon.*` ref family, forward-model-call budgets, projection policy declarations). Deferred to a follow-up spec.
- **Layer 4** (WASM kernel forward-model primitives: `enumerateLegalActions`, `applyAction`, `advanceUntilDecision`). Deferred to a follow-up spec conditional on Layer 3 proving value.
- **ARVN profile refactor.** The static `preferGovernWeighted=1000` consideration remains untouched. Decomposing it depends on Layer 2's candidate-relative latent features.
- **Heuristic state-features authored in YAML without engine change** (`feature.fragileCoinControlPopulation`, `feature.patronagePressure`, `feature.zonesNearCoinFlip`). These can be authored today with existing aggregators; their inclusion is a campaign deliverable, not a spec deliverable.
- **Schedule kinds beyond `cardDraw`** (`turnCount`, `condition`, `microturnSchedule`, `eventTrigger`). The enum is reserved; only `cardDraw` is implemented in Phase 0.
- **Per-observer schedule policies beyond `observerView` default.** `omniscient` and `topNVisible` are reserved for follow-up extensions.

## 14. Tickets

Decomposed via `/spec-to-tickets` on 2026-05-13:

- [`archive/tickets/169PHASCHREF-001.md`](../tickets/169PHASCHREF-001.md) — Phase 0 — types, BoundaryId, GameSpecDoc declaration & compiler validation (covers §7 Phase 0, §8.1 phase-boundary-compile-validation + phase-boundary-determinism)
- [`archive/tickets/169PHASCHREF-002.md`](../tickets/169PHASCHREF-002.md) — Phase 1 — phase identity refs (current.id, next.id, schedule.nextBoundary.id) (covers §7 Phase 1)
- [`archive/tickets/169PHASCHREF-003.md`](../tickets/169PHASCHREF-003.md) — Phase 2 — card-draw schedule index & schedule.distance.toBoundary.<X>.cards (covers §7 Phase 2, §8.1 schedule-ref-card-draw-index-correctness + schedule-ref-fallback-discipline + schedule-ref-observer-view)
- [`archive/tickets/169PHASCHREF-004.md`](../tickets/169PHASCHREF-004.md) — Phase 3a — schedule.distance.toPhase aliases (covers §7 Phase 3a)
- [`archive/tickets/169PHASCHREF-007.md`](../tickets/169PHASCHREF-007.md) — Phase 3b — real non-card schedule distance units (covers §7 Phase 3b)
- [`archive/tickets/169PHASCHREF-005.md`](../tickets/169PHASCHREF-005.md) — Phase 4 — WASM opcode integration for phase.* and currently implemented schedule.* refs (covers §7 Phase 4, §8.4 WASM equivalence)
- [`archive/tickets/169PHASCHREF-006.md`](../tickets/169PHASCHREF-006.md) — Phase 5 — FITL phaseBoundaries authoring & demonstration consideration (covers §7 Phase 5, §8.2 phase-boundary-fitl-coup-distance + schedule-ref-consideration-trace)

## Outcome

- Completion date: 2026-05-13.
- Spec 169 completed across archived tickets `169PHASCHREF-001` through `169PHASCHREF-007`.
- What landed: generic `phase.*` and `schedule.*` state-local ref families, `BoundaryId` and `phaseBoundaries[]` GameSpecDoc support, card-draw schedule indexing, `.toPhase` aliases, declared-rate non-card schedule units, WASM policy-VM parity, FITL `coupEntry` authoring, and the hidden-deck `scheduleFallbackFired` demonstration profile/test seam.
- Deviations from original plan: live FITL event-deck visibility required Foundation #4/#20 alignment. Phase 5 therefore proves authored FITL boundaries plus explicit hidden-deck fallback metadata instead of an omniscient ready numeric countdown. Generic ready-state `inputRefs` trace rows remain future trace-surface work.
- Deferred scope remains as listed in §13: Layer 2 candidate-effect/control features, Layer 3 horizon preview probes, Layer 4 forward-model WASM primitives, ARVN profile refactor, extra heuristic state-features, additional schedule kinds, and observer policies beyond the default observer-view contract.
- Verification is recorded in the archived implementation tickets linked in §14, with the final Phase 5 closeout in `archive/tickets/169PHASCHREF-006.md`.
