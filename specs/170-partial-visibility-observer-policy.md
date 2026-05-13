# Spec 170 — Partial-Visibility Observer Policy for Schedule Refs

**Status**: PROPOSED
**Priority**: High — direct enabler for the `fitl-arvn-agent-evolution` campaign. Spec 169 shipped the timing-aware ref family but its binary observer model (deck-zone `visibility: 'public'` ⇒ ready; anything else ⇒ `unavailable: hiddenDeck`) treats FITL's partially-visible deck as fully hidden, zeroing the signal for every ARVN main-phase decision. Empirical evidence from campaign exp-001 (compositeScore −3.4 → −3.4, zero behavioral change across 15 deterministic seeds) confirms the gap blocks all spec-169-driven hypotheses.
**Complexity**: M (parallel to spec 169 in surface area; smaller in conceptual scope — single new observer-policy enum on an existing field).
**Date**: 2026-05-13
**Predecessors**: Spec 158 (microturn policy scope), Spec 162 (Foundation #20 — preview signal integrity), Spec 163 (microturn state-feature lookups), Spec 165 (projected-state lookup refs / surface-tagged refs), Spec 166 (candidate-parameter refs with fallback contract), Spec 169 (phase boundary & schedule distance refs — this spec extends §11 open question #2).
**Dependencies**: Spec 169 (closed).
**Trigger reports**:
- `reports/fitl-arvn-spec-169-partial-visibility-gap-2026-05-13.md` — internal gap report from the `fitl-arvn-agent-evolution` improve-loop campaign. Establishes the empirical evidence (exp-001 zero-effect run at tier 15) and the three implementation shapes A/B/C considered. This spec adopts Option A.
- `reports/agent-cross-phase-projection-gap-2026-05-12.md` (Layer-1.5 follow-up) — original cross-phase projection report that motivated spec 169; this spec addresses the residual blocker for FITL.

---

## 1. Goal

Extend the `phaseBoundaries[].schedule` declaration with an `observerPolicy` field whose `topNVisible` variant lets the resolver compute schedule distance over the **publicly-observable visible-card prefix** of a deck whose underlying composition is hidden. This bridges the partial-visibility surface that spec 169 §11 open question #2 explicitly deferred and makes spec 169's `schedule.distance.toBoundary.<X>.cards` ref family usable for FITL ARVN (and any other game whose decks expose a face-up lookahead window).

After this spec lands, a GameSpecDoc author can declare:

```yaml
phaseBoundaries:
  - id: coupEntry
    kind: phaseEntry
    phaseId: coupVictory
    schedule:
      kind: cardDraw
      deckId: fitl-events-initial-card-pack
      cardSelector:
        tags: [coup]
      observerPolicy:
        kind: topNVisible
        n: 1                          # how many cards are publicly observable past the current draw position
        visibleSlot: leader:none      # zone id that holds the publicly-observable card(s)
```

and the same `preferGovernEarlyInCoupCycle` consideration from the spec 169 demonstration profile becomes a working timing-aware Govern boost: it returns `ready` with a card distance when the visible slot exposes a coup-tagged card (or when the visible window provably contains no coup card, surfacing a derived `unavailable: behindHiddenPrefix` status that the profile's `scheduleFallback` handles explicitly).

The new policy is **state-local, instantaneous, observer-safe**. It never peeks past the visible window. The new status reason `behindHiddenPrefix` is parallel to `hiddenDeck` — explicit, trace-visible, and non-coercive, preserving Foundation #20's discipline.

## 2. Context (verified against codebase)

### 2.1 The deferred capability

`archive/specs/169-phase-boundary-and-schedule-refs.md`:

- §4.6 (Observer alignment): *"FITL event deck order remains hidden in the live GameSpec — drawn cards and the lookahead slot are face-up, but `deck:none` is still `visibility: hidden`. Under the Phase 0-4 resolver contract, `schedule.distance.toBoundary.coupEntry.cards` therefore resolves `unavailable` with reason `hiddenDeck` for ordinary player agents."*
- §11 open question #2: *"Boundary visibility for partially-revealed decks. … Phase 0 ships only fully-observable-deck support; partially-observable observability adds a `schedule.observerPolicy` enum entry (`topNVisible`) reserved for a follow-up."*
- §13 out of scope: *"Per-observer schedule policies beyond `observerView` default. `omniscient` and `topNVisible` are reserved for follow-up extensions."*

This spec implements the `topNVisible` half of that deferral. The `omniscient` variant is out of scope here (separate concern; see §3).

### 2.2 The current binary resolver

`packages/engine/src/agents/policy-runtime.ts:296-329` — `resolveBoundaryCardDistance`:

```ts
function resolveBoundaryCardDistance(
  def: GameDef,
  runtime: GameDefRuntime,
  boundaryId: BoundaryId,
  unit: 'cards' | 'microturns' | 'actions' | 'turns' | 'rounds',
): PhaseScheduleResolution {
  const boundary = runtime.scheduleIndex.boundaries.get(boundaryId);
  if (boundary === undefined) {
    return { kind: 'unavailable', reason: 'notCardScheduled' };
  }
  const cardDrawState = boundary.cardDrawState;
  if (cardDrawState === undefined) {
    return { kind: 'unavailable', reason: 'notCardScheduled' };
  }
  const deck = (def.eventDecks ?? []).find((entry) => entry.id === cardDrawState.deckId);
  const drawZoneVisibility = def.zones.find((zone) => String(zone.id) === deck?.drawZone)?.visibility;
  if (drawZoneVisibility !== 'public') {
    return { kind: 'unavailable', reason: 'hiddenDeck' };
  }
  // … proceeds with full-deck card-position arithmetic …
}
```

The early exit at line 312-313 is the entire observer-visibility check. There is no per-boundary policy override. Grep confirms zero callers of `topNVisible`, `partialVisib`, or `observerPolicy` anywhere in `packages/engine/src/`.

### 2.3 FITL's authoring side is already partial-visibility-shaped

`data/games/fire-in-the-lake/10-vocabulary.md:5-7` — the source-of-truth deck zone:

```yaml
zones:
  - id: deck
    owner: none
    visibility: hidden
```

`data/games/fire-in-the-lake/41-events/033-064.md:4-6` (and the three sibling files 001-032, 065-096, 097-130) — eventDeck declaration:

```yaml
eventDecks:
  - id: fitl-events-initial-card-pack
    drawZone: deck:none
```

`data/games/fire-in-the-lake/30-rules-actions.md` — the `turnFlow.cardLifecycle` maps drawn cards into face-up slots (`played:none`, `lookahead:none`, `leader:none`). These slots are zones with `visibility: public` and load-bearing for FITL gameplay (agents already observe their contents in event scoring, action enumeration, and the runner UI). The boundary declaration at `30-rules-actions.md:18-26` is already correct and complete; only the engine resolver needs to learn how to consume the visible-slot signal.

### 2.4 Empirical evidence from campaign exp-001

Reproduced in `reports/fitl-arvn-spec-169-partial-visibility-gap-2026-05-13.md` §2:

| Metric | Baseline | exp-001 (preferGovernEarlyInCoupCycle added) | Δ |
|---|---|---|---|
| `compositeScore` | −3.4 | −3.4 | 0 |
| `wins` | 4 / 15 | 4 / 15 | 0 |
| `avgMargin` | −6.0667 | −6.0667 | 0 |

Lines delta: +11. The consideration produced zero contribution on every Govern candidate because every `schedule.distance.toBoundary.coupEntry.cards` lookup returned `unavailable: hiddenDeck` and the `scheduleFallback: onUnavailable: noContribution` zeroed the resulting score. This is the per-game integration consequence of the per-position behavior already pinned by spec 169 §8.2's golden-trace test (`phase-boundary-fitl-coup-distance.test.ts`).

### 2.5 Ref-family extension precedent

This spec extends an existing GameSpecDoc field (`phaseBoundaries[].schedule.observerPolicy`) and an existing runtime resolver branch; it does not add a new ref family or AST node. The precedent for declarative observer-policy enums is spec 165's `lookup.surface` discriminator (`'policyState' | 'previewOptionState'`) — a fixed enum on the ref/resolution path that the compiler validates and the runtime branches on. The shape parallels spec 165's surface discriminator and spec 166's `candidateParamFallback.onUnavailable` enum.

## 3. Non-goals

- **No omniscient observer policy.** `observerPolicy: omniscient` (the other half of spec 169 §13's reserved extension) is a distinct semantic concern — it implies the resolver inspects full deck state regardless of agent observer view. Some games may want it for analysis modes; FITL ARVN does not need it. Deferred.
- **No new ref families.** Existing `phase.*` and `schedule.*` ref kinds are reused. The observer-policy field changes how `schedule.distance.toBoundary.<X>.cards` resolves, nothing else.
- **No new schedule kinds.** `turnCount` and `condition` remain reserved per spec 169 §4.4.
- **No Layer 2 surface** (candidate-effect introspection, control-rule abstraction) — still deferred per spec 169 §13.
- **No Layer 3 surface** (scoped horizon preview probe) — still deferred per spec 169 §13.
- **No ARVN profile refactor.** This spec unblocks spec 169's existing demonstration consideration; whether the `arvn-evolved` profile adopts it is a campaign decision, not a spec deliverable.

## 4. Architecture

### 4.1 GameSpecDoc declaration: `observerPolicy` on schedule

`phaseBoundaries[].schedule` gains an optional `observerPolicy` field. Absence of the field is exactly today's spec-169 default behavior (binary public-or-hidden). Presence of `kind: topNVisible` activates partial-visibility resolution.

```yaml
phaseBoundaries:
  - id: coupEntry
    kind: phaseEntry
    phaseId: coupVictory
    schedule:
      kind: cardDraw
      deckId: fitl-events-initial-card-pack
      cardSelector:
        tags: [coup]
      observerPolicy:
        kind: topNVisible
        n: 1
        visibleSlot: leader:none
        # Optional — the unavailable-when-not-found status:
        beyondHorizon: behindHiddenPrefix    # default; alternative reserved entries TBD
```

Validation rules:

- `observerPolicy.kind` MUST be `topNVisible` (this spec); `omniscient` and `observerView` reserved.
- `n` MUST be a positive integer (≥1). The compiler rejects `n: 0` and non-integer values.
- `visibleSlot` MUST resolve to a declared zone with `visibility: public`. The compiler rejects unknown zone ids and zones with non-public visibility (with a clear diagnostic — "topNVisible policy must point at a public zone").
- `visibleSlot`'s zone behavior MUST be one that contains cards (compiler validates against `zone.behavior.type` or analogous discriminator; FITL slots are container-shaped, not stacks).
- `cardSelector` semantics are unchanged: the same predicate (`tags` or `cardIds`) evaluates against each visible card in order.

### 4.2 Runtime resolution branch

`packages/engine/src/agents/policy-runtime.ts:296-329` extends `resolveBoundaryCardDistance`:

```ts
const observerPolicy = boundary.definition.schedule?.observerPolicy;
if (observerPolicy?.kind === 'topNVisible') {
  // Inspect the visible slot zone (compile-validated to be public).
  const slotZone = def.zones.find(z => String(z.id) === observerPolicy.visibleSlot);
  // Treat slotZone.contents as the visible-prefix card list (engine-agnostic: zone behavior must be container-of-cards).
  const visibleCards = readVisibleCards(state, slotZone.id, observerPolicy.n);
  // Apply cardSelector to the visible prefix in order.
  for (let i = 0; i < visibleCards.length; i++) {
    if (matchesCardSelector(visibleCards[i], cardSelector, def)) {
      return { kind: 'ready', value: i };   // distance 0 = the next card to draw
    }
  }
  return { kind: 'unavailable', reason: 'behindHiddenPrefix' };
}
// Fall through to existing public-deck resolution path (unchanged).
```

Resolution cost: O(n) per ref read, where n is the spec-declared visible-window size (FITL: n=1, so O(1)). Bounded per Foundation #10.

The `readVisibleCards` helper is a generic kernel utility — it reads a zone's contents through the existing observer projection. It does NOT inspect the underlying deck composition.

### 4.3 New status reason: `behindHiddenPrefix`

Add to the `PhaseScheduleResolution` discriminated union (`packages/engine/src/agents/policy-runtime.ts:85` registry):

```ts
type ScheduleUnavailableReason =
  | 'hiddenDeck'              // existing — full hidden, no observer policy
  | 'noTriggeringCardRemaining'
  | 'notCardScheduled'
  | 'unsupportedScheduleDistance'
  | 'behindHiddenPrefix';     // NEW — visible prefix exhausted without finding a matching card
```

The `scheduleFallback: onUnavailable: <fallback>` contract is preserved exactly as in spec 169 §4.3. Profiles that want to distinguish "no visible coup card found" from "deck is hidden" can use `scheduleFallback: onUnavailable: { constant: <large-value> }` to express "treat far-distance as the default" semantics; or `dropConsideration` to opt out entirely when the visible window is exhausted.

### 4.4 Trace surface

When a consideration uses a schedule ref under `topNVisible` and the prefix scan returns `ready`, the trace records:

```json
{
  "consideration": "preferGovernEarlyInCoupCycle",
  "inputRefs": {
    "schedule.distance.toBoundary.coupEntry.cards": {
      "status": "ready",
      "value": 0,
      "boundaryId": "coupEntry",
      "unit": "cards",
      "observerPolicy": { "kind": "topNVisible", "n": 1, "visibleSlot": "leader:none" }
    }
  },
  "when": true,
  "weight": 250,
  "value": 0,
  "contribution": 0
}
```

When the prefix scan exhausts without finding a match, the trace pins the new fallback path:

```json
{
  "actionId": "govern",
  "scoreContributions": [
    { "termId": "preferGovernEarlyInCoupCycle", "contribution": 0 }
  ],
  "scheduleFallbackFired": {
    "termId": "preferGovernEarlyInCoupCycle",
    "kind": "noContribution",
    "reason": "behindHiddenPrefix"
  }
}
```

The `reason` field is new; existing pinned traces (spec 169 §8.2) MUST NOT regress (the old `hiddenDeck` pin is preserved exactly for boundaries without `observerPolicy`).

### 4.5 Observer alignment

Foundation #4 (Authoritative State and Observer Views): the resolver consults only zone contents whose declared `visibility: public`. The compiler validates this at boundary-declaration time. There is no path by which the resolver can leak unobservable information through this ref family.

Foundation #20 (Preview Signal Integrity): the `behindHiddenPrefix` status is a first-class fallback-eligible status. It does NOT silently coerce to `0` or any other numeric value; profile authors MUST declare a `scheduleFallback` to extract scoring contribution from this case.

## 5. Compiler changes

`packages/engine/src/cnl/compile-agents.ts` (or its phase-boundary sibling per spec 169's `compile-phase-boundaries.ts` insertion point):

- Extend the `phaseBoundaries[].schedule` validator to accept `observerPolicy` optional field.
- Add new diagnostic codes:
  - `OBSERVER_POLICY_UNKNOWN_KIND` — `observerPolicy.kind` is not in the supported enum.
  - `OBSERVER_POLICY_INVALID_N` — `n` is not a positive integer.
  - `OBSERVER_POLICY_UNKNOWN_SLOT` — `visibleSlot` does not resolve to a declared zone.
  - `OBSERVER_POLICY_NON_PUBLIC_SLOT` — the resolved zone has `visibility != 'public'`.
  - `OBSERVER_POLICY_INVALID_SLOT_KIND` — the resolved zone's behavior is not container-of-cards-shaped.
- Validate that `observerPolicy.kind === 'topNVisible'` is supported (the only one in this spec); reject `omniscient` / `observerView` with diagnostic `OBSERVER_POLICY_DEFERRED_KIND`.

The compiler emits zero warnings for omitted `observerPolicy` — the default behavior (binary public-or-hidden) is unchanged.

## 6. Runtime changes

`packages/engine/src/agents/policy-runtime.ts`:

- Extend `resolveBoundaryCardDistance` per §4.2 with the `topNVisible` branch.
- Extend the `PhaseScheduleResolution` unavailable-reason union per §4.3.
- Add a small zone-reading helper (or reuse existing observer-projection utilities) for `readVisibleCards`.

`packages/engine/src/kernel/types-core.ts`:

- Add `ObserverPolicy` discriminated union (Phase 0 entry: `topNVisible` only).
- Extend the `PhaseBoundaryDef.schedule` type to include the optional `observerPolicy` field.

`packages/engine/src/kernel/gamedef-runtime.ts:84-95`:

- No changes needed if the visible-slot read is stateless O(n) — the scheduleIndex already tracks per-deck card position; observer-policy resolution reads from canonical state.
- Defer any per-run partial-index until profiling shows the O(n) read is hot (very unlikely for FITL's n=1).

`packages/engine/schemas/`:

- Re-emit JSON Schema artifacts if schema-bound types change. Existing `pnpm turbo schema:artifacts` workflow handles this.

## 7. Phases and acceptance criteria

| Phase | Scope | Acceptance |
|---|---|---|
| **0** | Types (`ObserverPolicy`), GameSpecDoc declaration, compiler validation, diagnostic codes. No runtime resolution yet. | Architectural-invariant tests pass for: (a) unknown-kind rejection, (b) invalid-n rejection, (c) unknown-slot / non-public-slot / invalid-slot-kind rejections, (d) byte-identical compile output for a GameSpec compiled twice with and without `observerPolicy` declared. |
| **1** | Runtime resolver branch for `topNVisible`; new `behindHiddenPrefix` status reason; updated trace surface. | Golden tests for `topNVisible` resolution against a fixture GameSpec exposing 1 visible card. Cases: (a) matching card in visible slot → `ready` with `value: 0`, (b) non-matching card in visible slot → `unavailable: behindHiddenPrefix`, (c) empty visible slot → `unavailable: behindHiddenPrefix`. Replay-determinism test (same GameDef + seed produces identical ref readouts across 20 turns). |
| **2** | WASM opcode integration: `topNVisible` resolution implemented in the policy VM, parity with TS path. | WASM↔TS bytecode equivalence test extended; `policy-bytecode-equivalence.test.ts` passes with the new resolver branch in a fixture profile. Equivalence holds across all 15 baseline seeds. |
| **3** | FITL data: `observerPolicy: { kind: topNVisible, n: 1, visibleSlot: <FITL's lookahead slot> }` added to the `coupEntry` boundary in `data/games/fire-in-the-lake/30-rules-actions.md`. Cookbook update in `docs/agent-dsl-cookbook.md` documenting the `phase.*`, `schedule.*` ref families and the new observer policy. | The spec-169 demonstration profile (`sandbox-profiles/169-demonstration.md`) now returns at least one `ready` `schedule.distance.toBoundary.coupEntry.cards` reading at the documented FITL game positions (test extended from spec 169 §8.2). Cookbook examples compile and lint-pass. |

Phases 0-2 are engine-internal; Phase 3 is the FITL data and documentation deliverable. Phases 0-2 must land before Phase 3 ships.

## 8. Test plan

Per `.claude/rules/testing.md`, each new test file declares its class.

### 8.1 architectural-invariant tests

- `partial-visibility-compile-validation.test.ts` — every rejection rule in §5 has a coverage row (unknown kind, invalid n, unknown slot, non-public slot, invalid slot kind). Each row asserts both the rejection AND the diagnostic code.
- `partial-visibility-determinism.test.ts` — compile the same GameSpec twice with `observerPolicy` declared; assert byte-identical GameDef output.
- `partial-visibility-resolver-correctness.test.ts` — apply a sequence of `drawFromDeck` effects against a fixture deck with a 1-card public lookahead slot; assert the `topNVisible` resolution updates correctly as cards advance through the slot.

### 8.2 golden-trace tests

- `partial-visibility-fitl-coup-distance.test.ts` — extends the spec 169 `phase-boundary-fitl-coup-distance.test.ts` fixture set. New rows pin both `ready` (when the lookahead slot exposes a coup card) and `unavailable: behindHiddenPrefix` (when the slot exposes a non-coup card). The existing `unavailable: hiddenDeck` rows from spec 169's test are preserved by parametrizing the test against both the with-observer-policy and without-observer-policy boundary declarations.
- `schedule-ref-consideration-trace-topNVisible.test.ts` — exercise `preferGovernEarlyInCoupCycle` against a fixture profile that uses `topNVisible`. Pin the per-candidate trace with `inputRefs[].observerPolicy` metadata and the new `scheduleFallbackFired.reason: 'behindHiddenPrefix'` field.

### 8.3 convergence-witness tests

None mandated by this spec. The campaign-side effect (whether `arvn-evolved` adopts the unblocked consideration and what compositeScore that produces) is owned by `fitl-arvn-agent-evolution`, not by this spec's tests.

### 8.4 WASM equivalence

`policy-bytecode-equivalence.test.ts` extended with a new fixture exercising `schedule.distance.toBoundary.<X>.cards` resolution under `topNVisible`. WASM and TS paths must produce identical scoring rows for all 15 baseline seeds.

## 9. Foundation alignment

| Foundation | How this spec respects it |
|---|---|
| #1 Engine Agnosticism | `ObserverPolicy.topNVisible` is a generic predicate (visible-slot id, count). The kernel knows zone visibility, deck contents, and predicates over card identity — no game-specific logic. FITL is a consumer, not the implementation surface. |
| #2 Evolution-First Design | `observerPolicy` is GameSpecDoc YAML — evolution can author it on any boundary declaration. |
| #4 Authoritative State and Observer Views | The resolver inspects only `visibility: public` zones; the compiler enforces this. No information leak. |
| #5 One Rules Protocol | Same resolver path serves agents, simulator, and (post-Phase 2) WASM VM. No bypass paths. |
| #6 Schema Ownership Stays Generic | No per-game schema files; observer policy is a generic GameSpecDoc field. |
| #7 Specs Are Data | All semantics declarative (kind enum, n, slot id, optional beyondHorizon). No callbacks. |
| #8 Determinism | Resolver is a pure function of `(GameState, observerView)`. O(n) deterministic read of canonical state. |
| #10 Bounded Computation | O(n) per ref read where n is spec-bounded at compile time. FITL: O(1). |
| #12 Compiler-Kernel Validation | Compile-time validation of slot id, visibility, kind, n. Runtime validates state-dependent matching. |
| #13 Artifact Identity | Observer policy is part of GameDef hash. Replay trace records the policy under which each ref read resolved. |
| #15 Architectural Completeness | Closes spec 169 §11 open question #2; eliminates the silent-no-signal trap that exp-001 surfaced. |
| #16 Testing as Proof | Every validation rule, status path, and equivalence claim has a dedicated test (§8). |
| #17 Strongly Typed Domain Identifiers | `ObserverPolicy` is a tagged union. New status reason is a typed enum member. |
| #20 Preview Signal Integrity | New `behindHiddenPrefix` status is parallel to `hiddenDeck` — explicit, trace-visible, fallback-required. No silent coercion. |

## 10. Code anchors for implementers

- **Types**: `packages/engine/src/kernel/types-core.ts` — extend `PhaseBoundaryDef`/`ScheduleKindDef` with optional `observerPolicy` field. Add `ObserverPolicy` discriminated union with the `topNVisible` variant.
- **Compiler validation**: `packages/engine/src/cnl/compile-agents.ts` (or `compile-phase-boundaries.ts` — search for spec 169's diagnostic registry insertion point). Extend the phase-boundary validator and the diagnostic registry with the new codes from §5.
- **Runtime resolver**: `packages/engine/src/agents/policy-runtime.ts:296-329` — extend `resolveBoundaryCardDistance` with the `topNVisible` branch. Visible-card-read helper goes in the same file unless a sibling kernel utility is more appropriate.
- **Status union**: `packages/engine/src/agents/policy-runtime.ts:85` — extend `ScheduleUnavailableReason` with `'behindHiddenPrefix'`.
- **WASM ABI**: `packages/engine-wasm/policy-vm/src/lib.rs` — extend the schedule-distance opcode handler with the policy-aware resolution branch. The encoded input must include observer-policy metadata so the Rust side dispatches identically to the TS side.
- **FITL data**: `data/games/fire-in-the-lake/30-rules-actions.md:18-26` — add `observerPolicy: { kind: topNVisible, n: 1, visibleSlot: <verified-lookahead-slot-id> }` to the `coupEntry` boundary. The lookahead-slot id must be verified against the FITL `cardLifecycle` declaration before authoring.
- **Cookbook**: `docs/agent-dsl-cookbook.md` — new section documenting `phase.*` and `schedule.*` ref families (parallel to the existing `candidate.params.*` section per spec 166), with the observer-policy variants and the `scheduleFallback` contract worked through end-to-end.

## 11. Open questions

1. **Beyond-horizon status alternatives.** The default `unavailable: behindHiddenPrefix` is parallel to `hiddenDeck` and forces explicit fallback. An alternative reading is "the visible window did not contain a match, so the boundary is statistically far" — a few games may want a `partial:{ kind: minimumDistance, value: n+1 }` ready-like status. Reserved for a follow-up.
2. **Lookahead slot identity in FITL.** The FITL `cardLifecycle` declares three face-up slots (`played:none`, `lookahead:none`, `leader:none`). The "next card to be drawn" semantics for this spec is the `lookahead:none` slot (or whichever slot the FITL lifecycle designates as "next-up"). The implementing ticket must verify the exact slot id against `30-rules-actions.md` rather than guessing.
3. **Multi-slot visible windows.** Some games may expose two or more visible slots (e.g., a face-up draft row of N cards). Phase 0 ships single-slot `topNVisible`; multi-slot variants are reserved (`visibleSlot` becomes `visibleSlots: <list>` in a follow-up if needed).
4. **Cardinality semantics under `n > slot.contents.length`.** If the declared `n` exceeds the actual slot occupancy, the resolver reads what's available and treats the remainder as hidden. Compile-time `n` is the declared maximum; runtime occupancy is what's actually scanned. Document explicitly in §4.2.
5. **Interaction with `omniscient` observer policy (future).** When `omniscient` lands, it must respect the same compile-time validation surface (kind enum) and runtime-dispatch shape; the patterns established by this spec should be reusable. Coordinate at follow-up-spec authoring time.

## 12. Out of scope

- `observerPolicy: omniscient` — deferred to a future spec per spec 169 §13.
- Layer 2 (candidate-effect introspection, control-rule abstraction) — still deferred per spec 169 §13.
- Layer 3 (scoped horizon preview probe) — still deferred per spec 169 §13.
- Schedule kinds beyond `cardDraw` — `turnCount`, `condition`, `microturnSchedule`, `eventTrigger` remain reserved per spec 169 §4.4.
- ARVN profile refactor — the campaign decides whether the (now-unblocked) `preferGovernEarlyInCoupCycle` consideration belongs in `arvn-evolved`, not this spec.
- Game-specific observer-policy authoring beyond FITL — other games can adopt `topNVisible` independently; this spec ships the engine surface and the FITL data deliverable only.

## 13. Tickets

Decomposition pending. Anticipated shape (parallel to spec 169's PHASCHREF-001..007):

- Ticket 1 — Phase 0: types, `ObserverPolicy` discriminated union, GameSpecDoc declaration, compiler validation. (covers §7 Phase 0, §8.1 partial-visibility-compile-validation + partial-visibility-determinism)
- Ticket 2 — Phase 1: runtime resolver branch for `topNVisible`, `behindHiddenPrefix` status, trace surface. (covers §7 Phase 1, §8.1 partial-visibility-resolver-correctness, §8.2 schedule-ref-consideration-trace-topNVisible)
- Ticket 3 — Phase 2: WASM opcode parity for `topNVisible`. (covers §7 Phase 2, §8.4 WASM equivalence)
- Ticket 4 — Phase 3: FITL `observerPolicy` authoring + cookbook update. (covers §7 Phase 3, §8.2 partial-visibility-fitl-coup-distance, cookbook section)

Run `/spec-to-tickets specs/170-partial-visibility-observer-policy.md` after this spec is accepted to generate the canonical ticket files.
