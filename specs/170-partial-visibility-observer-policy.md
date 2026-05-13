# Spec 170 — Partial-Visibility Observer Policy for Schedule Refs

**Status**: PROPOSED
**Priority**: High — direct enabler for the `fitl-arvn-agent-evolution` campaign. Spec 169 shipped the timing-aware ref family but its binary observer model (deck-zone `visibility: 'public'` ⇒ ready; anything else ⇒ `unavailable: hiddenDeck`) treats FITL's partially-visible deck as fully hidden, zeroing the signal for every ARVN main-phase decision. Empirical evidence from campaign exp-001 (compositeScore −3.4 → −3.4, zero behavioral change across 15 deterministic seeds) confirms the gap blocks all spec-169-driven hypotheses.
**Complexity**: M (parallel to spec 169 in surface area; smaller in conceptual scope — one new observer-policy enum + one new resolution-status variant on existing ref family).
**Date**: 2026-05-13 (revised in same session after external-LLM cross-review).
**Predecessors**: Spec 158 (microturn policy scope), Spec 162 (Foundation #20 — preview signal integrity), Spec 163 (microturn state-feature lookups), Spec 165 (projected-state lookup refs / surface-tagged refs), Spec 166 (candidate-parameter refs with fallback contract), Spec 169 (phase boundary & schedule distance refs — this spec extends §11 open question #2).
**Dependencies**: Spec 169 (closed).
**Trigger reports**:
- `reports/fitl-arvn-spec-169-partial-visibility-gap-2026-05-13.md` — internal gap report from the `fitl-arvn-agent-evolution` improve-loop campaign. Establishes the empirical evidence (exp-001 zero-effect run at tier 15) and three implementation shapes A/B/C.
- `reports/spec-170-overhaul.md` — external LLM review (ChatGPT deep-research) of the initial spec-170 draft. Surfaced two load-bearing architectural corrections (multi-zone visible prefix; first-class `partial.lowerBound` status). See §11 for the per-recommendation reassessment.
- `reports/agent-cross-phase-projection-gap-2026-05-12.md` — original cross-phase projection report that motivated spec 169.

---

## 1. Goal

Extend `phaseBoundaries[].schedule` with an optional `observerPolicy.topNVisible` field whose `visiblePrefix.zones[]` declares the **ordered public zones** that expose the next-to-be-drawn cards of an otherwise-hidden deck. The resolver scans those zones in declaration order and emits one of three statuses:

- `ready` — a matching card was found in the visible prefix; distance is exact.
- `partial.lowerBound` — no matching card was found in the visible prefix, but a hidden tail remains; the partial signal carries a lower-bound distance (the length of the scanned prefix).
- `unavailable: hiddenDeck` — the boundary's deck declares no observer policy (preserves spec 169 default behavior verbatim).

`partial.lowerBound` is a **first-class semantic outcome distinct from `unavailable`** (Foundation #20). Profile authors opt into using it via a new `scheduleFallback.onPartial` discriminator, parallel to the existing `onUnavailable` contract.

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
        visiblePrefix:
          zones:
            - id: lookahead:none
            - id: leader:none
          maxItems: 2
```

…and the `preferGovernEarlyInCoupCycle` consideration from the spec 169 demonstration profile becomes a working timing-aware Govern boost:

- When a coup-tagged card is in either visible zone → `ready` with exact distance.
- When neither visible card is coup-tagged → `partial.lowerBound{ lowerBound: 2 }` (a strategically meaningful "at least 2 cards away" signal), with the profile's `scheduleFallback.onPartial.useLowerBound` extracting the lower bound as the consideration value.
- When the boundary declares no `observerPolicy` → existing `unavailable: hiddenDeck` behavior preserved exactly (spec 169 §8.2 golden trace remains pinned for non-policy-bearing boundaries).

The policy is **state-local, instantaneous, observer-safe**. The resolver inspects only zones whose `visibility: public` is compile-validated. It never peeks past the visible window.

## 2. Context (verified against codebase)

### 2.1 The deferred capability

`archive/specs/169-phase-boundary-and-schedule-refs.md`:

- §4.6 (Observer alignment): *"FITL event deck order remains hidden in the live GameSpec — drawn cards and the lookahead slot are face-up, but `deck:none` is still `visibility: hidden`. Under the Phase 0-4 resolver contract, `schedule.distance.toBoundary.coupEntry.cards` therefore resolves `unavailable` with reason `hiddenDeck` for ordinary player agents."*
- §11 open question #2: *"Boundary visibility for partially-revealed decks. … Phase 0 ships only fully-observable-deck support; partially-observable observability adds a `schedule.observerPolicy` enum entry (`topNVisible`) reserved for a follow-up."*

This spec implements the `topNVisible` half of that deferral.

### 2.2 The current binary resolver

`packages/engine/src/agents/policy-runtime.ts:296-329` — `resolveBoundaryCardDistance`:

```ts
const deck = (def.eventDecks ?? []).find((entry) => entry.id === cardDrawState.deckId);
const drawZoneVisibility = def.zones.find((zone) => String(zone.id) === deck?.drawZone)?.visibility;
if (drawZoneVisibility !== 'public') {
  return { kind: 'unavailable', reason: 'hiddenDeck' };
}
// … proceeds with full-deck card-position arithmetic …
```

The early exit at line 312-313 is the entire observer-visibility check. There is no per-boundary policy override. Grep confirms zero callers of `topNVisible`, `partialVisib`, or `observerPolicy` anywhere in `packages/engine/src/`.

### 2.3 FITL exposes TWO public face-up slots, not one

`data/games/fire-in-the-lake/10-vocabulary.md:62-73`:

```yaml
- id: leader
  owner: none
  visibility: public
  ordering: stack
- id: lookahead
  owner: none
  visibility: public
  ordering: stack
- id: played
  owner: none
  visibility: public
  ordering: stack
```

`data/games/fire-in-the-lake/30-rules-actions.md:29-31`:

```yaml
cardLifecycle:
  played: played:none
  lookahead: lookahead:none
  leader: leader:none
```

FITL's `cardLifecycle` (`packages/engine/src/kernel/turn-flow-lifecycle.ts:55-108`) advances cards through `lookahead → leader → played` as the turn flow progresses. At a steady-state main-phase decision, the `leader` slot holds the current turn's driving card and the `lookahead` slot holds the next-turn card — both are public, both are part of the agent-observable surface, both are load-bearing for FITL event scoring and action enumeration.

**This is what required the architectural correction during cross-review**: a single `visibleSlot` is undersized for FITL itself. The schema must be sequence-shaped (ordered zones list) from day one.

### 2.4 The observer projection layer already exists

`packages/engine/src/kernel/observation.ts` and `packages/engine/src/agents/policy-lookup-surface.ts` already implement observer-aware projections (`CompiledObserverProfile`, `isZoneVisible`, `projectZone`, `projectToken`, observer-grant resolution). The new resolver path consumes this existing surface; no new public projection service is created.

### 2.5 Foundation #20 names `partial` as a first-class status

Foundation #20 (Preview Signal Integrity): *"Ready, unknown, hidden, stochastic, unresolved, failed, depth-capped, and partial results are distinct semantic outcomes. Unavailable preview refs (any non-`ready` status) MUST NOT be silently coerced into numeric contributions; any consideration that converts an unavailable preview ref into a contribution MUST declare that fallback explicitly in profile YAML, and the chosen fallback MUST be visible in deterministic trace output."*

Collapsing "visible prefix exhausted, hidden tail remains" into `unavailable: behindHiddenPrefix` would discard a genuine partial signal — the lower-bound distance — that the agent is entitled to use. Foundation #20 prescribes the distinction; this spec implements it.

### 2.6 Empirical evidence from campaign exp-001

Reproduced in `reports/fitl-arvn-spec-169-partial-visibility-gap-2026-05-13.md` §2:

| Metric | Baseline | exp-001 (preferGovernEarlyInCoupCycle added) | Δ |
|---|---|---|---|
| `compositeScore` | −3.4 | −3.4 | 0 |
| `wins` | 4 / 15 | 4 / 15 | 0 |
| `avgMargin` | −6.0667 | −6.0667 | 0 |

Lines delta: +11. The consideration produced zero contribution on every Govern candidate because every `schedule.distance.toBoundary.coupEntry.cards` lookup returned `unavailable: hiddenDeck` and the `scheduleFallback: onUnavailable: noContribution` zeroed the resulting score.

### 2.7 Existing fallback infrastructure

`packages/engine/src/cnl/compile-agents.ts:2231-2232` already requires `scheduleFallback.onUnavailable` for schedule-distance refs; `packages/engine/src/agents/policy-evaluation-core.ts:78-90` defines the fallback kinds (`noContribution`, `constant`, `dropConsideration`). Adding `onPartial` is parallel to the existing pattern; the precedent is set.

## 3. Non-goals

- **No omniscient observer policy.** `observerPolicy: omniscient` (the other half of spec 169 §13's reserved extension) is a distinct semantic concern. Deferred.
- **No new ref families.** Existing `phase.*` and `schedule.*` ref kinds are reused. The observer-policy field changes how `schedule.distance.toBoundary.<X>.cards` resolves, nothing else.
- **No free-standing `observableSequences[]` top-level construct.** The external LLM review proposed elevating the visible-prefix declaration to a top-level GameSpecDoc primitive. Rejected: the visible-prefix concept does not yet have a second consumer outside schedule resolution; per Foundation #15, the abstraction is introduced where it is needed (the schedule's observation surface), not pre-built for hypothetical other ref families. A future spec may elevate the primitive once a second consumer (UI projection, candidate-effect introspection, future schedule kinds) materializes.
- **No `exposedFacets` decomposition.** The external review proposed `exposedFacets: [identity, tags]` to handle cases where card identity is hidden but tags are public. FITL exposes the full card identity in the visible slots (the slots ARE the card); no near-term game requires facet decomposition. Deferred.
- **No `hiddenTail: 'present' | 'unknown'` enum.** The hidden tail is always `'present'` for FITL until deck exhaustion; the alternative branch is unmotivated by any current game. Deferred.
- **No broader `ScheduleDistanceResolution` rewrite.** The external review proposed adding `unknown`, `stochastic`, `unresolved`, `depthCapped`, `failed` variants at the same time. Rejected: each variant belongs to the ref family that needs it; this spec adds `partial.lowerBound` because the schedule-distance family needs it, and defers the others to the spec authors that need them.
- **No new public projection service.** The existing `packages/engine/src/kernel/observation.ts` surface is used directly. No `resolveObservedSequence` API added.
- **No new schedule kinds.** `turnCount`, `condition`, `microturnSchedule`, `eventTrigger` remain reserved per spec 169 §4.4.
- **No Layer 2/3 surfaces** (candidate-effect introspection, scoped horizon preview probe). Still deferred per spec 169 §13.
- **No ARVN profile refactor.** This spec unblocks spec 169's existing demonstration consideration; whether the `arvn-evolved` profile adopts it is a campaign decision, not a spec deliverable.

## 4. Architecture

### 4.1 GameSpecDoc declaration: `observerPolicy` with multi-zone visible prefix

`phaseBoundaries[].schedule` gains an optional `observerPolicy` field. Absence of the field is exactly today's spec-169 default behavior. Presence of `kind: topNVisible` activates partial-visibility resolution.

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
        visiblePrefix:
          # Ordered list — index 0 is the next card to be drawn.
          zones:
            - id: lookahead:none
            - id: leader:none
          # Maximum number of cards to scan across all zones.
          # If a zone is empty at runtime, the resolver advances to the next zone.
          maxItems: 2
```

**Field semantics**:

- `observerPolicy.kind`: enum, currently `topNVisible` only. Compiler rejects unknown kinds (`OBSERVER_POLICY_UNKNOWN_KIND`).
- `visiblePrefix.zones`: ordered, non-empty list of zone references. Order is meaningful: index 0 is "next card to be drawn", index 1 is "card after that", etc. Each zone MUST be public, container-of-cards-shaped, and distinct from the deck's hidden draw zone.
- `visiblePrefix.maxItems`: positive integer (≥1). Hard cap on total cards scanned across the ordered zones; provides Foundation #10 bounded computation guarantee.

**Validation rules** (compiler-enforced, see §5):

1. `observerPolicy.kind` is in the supported enum.
2. `visiblePrefix.zones` is non-empty and length ≤ a declared cap class (matches `maxItems`).
3. Each zone resolves to a declared zone.
4. Each zone has `visibility: public`.
5. Each zone's behavior is container-of-cards-shaped (e.g., `ordering: stack` or `ordering: list`, not `ordering: set` for cards where order is undefined).
6. No zone in `visiblePrefix.zones` equals the deck's `drawZone` (a hidden zone cannot serve as its own visible prefix).
7. `maxItems` is a positive integer (≥1).
8. No duplicate zone ids in the list.
9. `cardSelector` semantics are unchanged: the same predicate evaluates against each visible card in declared order.

### 4.2 Runtime resolution branch

`packages/engine/src/agents/policy-runtime.ts:296-329` extends `resolveBoundaryCardDistance`:

```ts
const observerPolicy = boundary.definition.schedule?.observerPolicy;
if (observerPolicy?.kind === 'topNVisible') {
  const zones = observerPolicy.visiblePrefix.zones;
  const maxItems = observerPolicy.visiblePrefix.maxItems;
  let scanned = 0;
  for (const zoneRef of zones) {
    if (scanned >= maxItems) break;
    const slotCards = readPublicZoneCards(state, zoneRef.id);
    for (const card of slotCards) {
      if (scanned >= maxItems) break;
      if (matchesCardSelector(card, cardSelector, def)) {
        return {
          kind: 'ready',
          value: scanned,
          observerPolicy: { kind: 'topNVisible' },
          visiblePrefixLength: scanned + 1,
        };
      }
      scanned += 1;
    }
  }
  // Visible prefix exhausted; hidden tail remains.
  return {
    kind: 'partial',
    partialKind: 'lowerBound',
    lowerBound: scanned,
    observerPolicy: { kind: 'topNVisible' },
    visiblePrefixLength: scanned,
  };
}
// Fall through to existing public-deck resolution path (unchanged).
```

`readPublicZoneCards(state, zoneId)` is a thin helper that consults `state.zones[zoneId]` (or analogous canonical accessor) and returns the cards in zone-declared order. It does NOT consult any observer-profile state; the compiler has already proven each listed zone is public. The function lives next to `resolveBoundaryCardDistance` or in `packages/engine/src/agents/policy-zone-read.ts` if a sibling utility surfaces during implementation.

Resolution cost: O(maxItems) per ref read. FITL: O(2). Bounded per Foundation #10.

### 4.3 New resolution status: `partial.lowerBound`

Extend `PhaseScheduleResolution` (`packages/engine/src/agents/policy-runtime.ts:71-87`):

```ts
export type PhaseScheduleResolution =
  | {
      readonly kind: 'ready';
      readonly value: string | number;
      readonly observerPolicy?: { readonly kind: 'topNVisible' };
      readonly visiblePrefixLength?: number;
    }
  | {
      readonly kind: 'partial';
      readonly partialKind: 'lowerBound';
      readonly lowerBound: number;
      readonly observerPolicy: { readonly kind: 'topNVisible' };
      readonly visiblePrefixLength: number;
    }
  | {
      readonly kind: 'unavailable';
      readonly reason:
        | 'interruptStateNoSuccessor'
        | 'phaseSequenceExhausted'
        | 'noBoundaryReachable'
        | 'unsupportedScheduleDistance'
        | 'notCardScheduled'
        | 'noTriggeringCardRemaining'
        | 'hiddenDeck';
    };
```

The existing `unavailable: hiddenDeck` branch is preserved verbatim for boundaries without `observerPolicy`. No new `unavailable.reason` is introduced — partial is its own status kind, not a flavor of unavailable.

### 4.4 Fallback contract: `scheduleFallback.onPartial`

Extend the consideration-level `scheduleFallback` schema:

```yaml
scheduleFallback:
  onUnavailable: noContribution    # existing; required when ref is read
  onPartial:                       # NEW; required when boundary declares topNVisible
    visiblePrefixExhausted: useLowerBound    # OR: noContribution, dropConsideration, constant
```

**`onPartial.visiblePrefixExhausted` kinds**:

- `useLowerBound` — the consideration's `value` ref reads `lowerBound` as if it were the exact distance. This is the strategically meaningful path: "no coup card visible in the next 2 cards" becomes a value of 2, monotonically increasing in the deferral signal.
- `noContribution` — the consideration contributes 0, identical to today's behavior. The campaign trace records the partial signal but discards it.
- `dropConsideration` — the consideration is removed from the scoring sum entirely.
- `constant: <number>` — substitute a fixed value.

**Compiler enforcement** (extending `compile-agents.ts:2231-2232`): when a consideration reads a `schedule.distance.toBoundary.<X>.cards` ref whose target boundary declares `observerPolicy.kind === 'topNVisible'`, the consideration MUST declare `scheduleFallback.onPartial.visiblePrefixExhausted`. Diagnostic `SCHEDULE_FALLBACK_PARTIAL_REQUIRED`. The existing `onUnavailable` requirement is unchanged.

The `onPartial` requirement is statically derivable from boundary declarations; the compiler emits the diagnostic at consideration-compile time.

### 4.5 Trace surface

When a consideration uses a schedule ref under `topNVisible` and the prefix scan returns `ready`, the trace records:

```json
{
  "consideration": "preferGovernEarlyInCoupCycle",
  "inputRefs": {
    "schedule.distance.toBoundary.coupEntry.cards": {
      "status": "ready",
      "value": 1,
      "observerPolicy": "topNVisible",
      "visiblePrefixLength": 2
    }
  },
  "when": true,
  "weight": 250,
  "value": 1,
  "contribution": 250
}
```

When the prefix exhausts without finding a match, the trace pins both the partial signal and the fallback that consumed it:

```json
{
  "consideration": "preferGovernEarlyInCoupCycle",
  "inputRefs": {
    "schedule.distance.toBoundary.coupEntry.cards": {
      "status": "partial",
      "partialKind": "lowerBound",
      "lowerBound": 2,
      "observerPolicy": "topNVisible",
      "visiblePrefixLength": 2,
      "fallbackApplied": {
        "kind": "useLowerBound",
        "numericValue": 2
      }
    }
  },
  "when": true,
  "weight": 250,
  "value": 2,
  "contribution": 500
}
```

When `scheduleFallback.onPartial.visiblePrefixExhausted: noContribution` is declared:

```json
{
  "actionId": "govern",
  "scoreContributions": [
    { "termId": "preferGovernEarlyInCoupCycle", "contribution": 0 }
  ],
  "scheduleFallbackFired": {
    "termId": "preferGovernEarlyInCoupCycle",
    "kind": "noContribution",
    "reason": "partial.lowerBound.visiblePrefixExhausted"
  }
}
```

Existing pinned traces (spec 169 §8.2) MUST NOT regress — the `hiddenDeck` rows are preserved exactly for boundaries without `observerPolicy`.

### 4.6 Observer alignment

Foundation #4 (Authoritative State and Observer Views): the resolver consults only zone contents whose declared `visibility: public`. The compiler validates this at boundary-declaration time. No path leaks unobservable information.

Foundation #20 (Preview Signal Integrity): `partial.lowerBound` is a first-class status, distinct from `unavailable`. It does NOT silently coerce to a numeric value; profile authors MUST declare a `scheduleFallback.onPartial.visiblePrefixExhausted` to extract scoring contribution. The fallback is visible in deterministic trace output.

## 5. Compiler changes

`packages/engine/src/cnl/compile-agents.ts` (and the phase-boundary sibling per spec 169's `compile-phase-boundaries.ts` insertion point):

- Extend the `phaseBoundaries[].schedule` validator to accept the `observerPolicy` optional field with the structure from §4.1.
- New diagnostic codes:
  - `OBSERVER_POLICY_UNKNOWN_KIND` — `observerPolicy.kind` is not in the supported enum.
  - `OBSERVER_POLICY_EMPTY_VISIBLE_PREFIX` — `visiblePrefix.zones` is empty.
  - `OBSERVER_POLICY_INVALID_MAXITEMS` — `maxItems` is not a positive integer.
  - `OBSERVER_POLICY_UNKNOWN_ZONE` — a `visiblePrefix.zones[]` entry does not resolve.
  - `OBSERVER_POLICY_NON_PUBLIC_ZONE` — a resolved zone has `visibility != 'public'`.
  - `OBSERVER_POLICY_INVALID_ZONE_KIND` — a resolved zone's behavior is not container-of-cards-shaped.
  - `OBSERVER_POLICY_DRAW_ZONE_IN_PREFIX` — a `visiblePrefix.zones[]` entry equals the deck's `drawZone`.
  - `OBSERVER_POLICY_DUPLICATE_ZONE` — duplicate zone ids in the list.
  - `OBSERVER_POLICY_DEFERRED_KIND` — `omniscient` or `observerView` rejected (reserved).
- Extend the consideration-level `scheduleFallback` validator to require `onPartial.visiblePrefixExhausted` when the target boundary declares `observerPolicy.kind === 'topNVisible'`. Diagnostic: `SCHEDULE_FALLBACK_PARTIAL_REQUIRED`.

The compiler emits zero warnings for omitted `observerPolicy` — the default behavior (binary public-or-hidden) is unchanged.

## 6. Runtime changes

`packages/engine/src/agents/policy-runtime.ts`:

- Extend `PhaseScheduleResolution` per §4.3 (new `partial` kind; `observerPolicy` and `visiblePrefixLength` fields on `ready`).
- Extend `resolveBoundaryCardDistance` per §4.2 with the `topNVisible` branch and ordered-zone scan.
- Add `readPublicZoneCards` helper (or reuse if a sibling exists in `policy-lookup-surface.ts`).

`packages/engine/src/kernel/types-core.ts`:

- Add `ObserverPolicy` discriminated union (Phase 0 entry: `topNVisible` only).
- Add `ObserverVisiblePrefix` type carrying `zones: readonly ZoneRef[]` and `maxItems: number`.
- Extend `PhaseBoundaryDef.schedule` to include the optional `observerPolicy` field.

`packages/engine/src/agents/policy-evaluation-core.ts:78-90`:

- Extend `PolicyScheduleFallback` to carry the `onPartial.visiblePrefixExhausted` discriminator.
- Extend the fallback application path to handle `partial.lowerBound` resolutions: route through `onPartial.visiblePrefixExhausted` instead of `onUnavailable`.

`packages/engine/src/kernel/gamedef-runtime.ts:84-95`:

- No changes needed if the visible-zone read is stateless. The `scheduleIndex` already tracks per-deck card position; observer-policy resolution reads from canonical state.
- Defer any per-run partial-index until profiling shows the O(maxItems) read is hot.

`packages/engine/schemas/`:

- Re-emit JSON Schema artifacts. Existing `pnpm turbo schema:artifacts` workflow handles this.

## 7. Phases and acceptance criteria

| Phase | Scope | Acceptance |
|---|---|---|
| **0** | Types (`ObserverPolicy`, `ObserverVisiblePrefix`, `partial.lowerBound` resolution variant), GameSpecDoc declaration, compiler validation, all diagnostic codes from §5. No runtime resolution yet. | Architectural-invariant tests pass for: (a) every rejection rule in §5, (b) byte-identical compile output for a GameSpec compiled twice with `observerPolicy` declared, (c) `SCHEDULE_FALLBACK_PARTIAL_REQUIRED` raised when a consideration reads a `topNVisible`-bearing boundary without declaring `onPartial`. |
| **1** | Runtime resolver branch for `topNVisible`; `partial.lowerBound` resolution path; `scheduleFallback.onPartial` application; updated trace surface. | Golden tests for `topNVisible` resolution against a fixture GameSpec exposing 2 visible zones. Cases: (a) match at index 0 → `ready: value: 0, visiblePrefixLength: 1`, (b) match at index 1 → `ready: value: 1, visiblePrefixLength: 2`, (c) no match across 2 zones with cards → `partial.lowerBound: 2`, (d) one empty zone + one occupied non-matching → `partial.lowerBound: 1`, (e) all listed zones empty → `partial.lowerBound: 0`. Replay-determinism test (same GameDef + seed produces identical ref readouts across 20 turns). |
| **2** | WASM opcode integration: `topNVisible` resolution and `partial.lowerBound` status path implemented in the policy VM, parity with TS path. | `policy-bytecode-equivalence.test.ts` extended; passes across all 15 baseline seeds with the new resolver branch in a fixture profile that exercises both `ready` and `partial.lowerBound`. |
| **3** | FITL data: `observerPolicy: { kind: topNVisible, visiblePrefix: { zones: [lookahead:none, leader:none], maxItems: 2 } }` added to the `coupEntry` boundary in `data/games/fire-in-the-lake/30-rules-actions.md`. Cookbook update in `docs/agent-dsl-cookbook.md` documenting the `phase.*`, `schedule.*` ref families, the observer-policy variant, and the dual fallback contract. | The spec-169 demonstration profile (`sandbox-profiles/169-demonstration.md`) returns at least one `ready` AND at least one `partial.lowerBound` `schedule.distance.toBoundary.coupEntry.cards` reading at documented FITL game positions (test extended from spec 169 §8.2). Cookbook examples compile and lint-pass. |

Phases 0-2 are engine-internal; Phase 3 is the FITL data and documentation deliverable. Phases 0-2 must land before Phase 3 ships.

## 8. Test plan

Per `.claude/rules/testing.md`, each new test file declares its class.

### 8.1 architectural-invariant tests

- `partial-visibility-compile-validation.test.ts` — every rejection rule in §5 has a coverage row, asserting both rejection AND diagnostic code. Includes `OBSERVER_POLICY_EMPTY_VISIBLE_PREFIX`, `OBSERVER_POLICY_DUPLICATE_ZONE`, `OBSERVER_POLICY_DRAW_ZONE_IN_PREFIX`, `SCHEDULE_FALLBACK_PARTIAL_REQUIRED`.
- `partial-visibility-determinism.test.ts` — compile the same GameSpec twice with `observerPolicy` declared; assert byte-identical GameDef output.
- `partial-visibility-resolver-correctness.test.ts` — apply a sequence of `drawFromDeck` effects against a fixture deck with a 2-card public visible prefix; assert the `topNVisible` resolution updates correctly as cards advance through the zones, including transitions across the partial/ready boundary.
- `partial-visibility-fallback-routing.test.ts` — each `onPartial.visiblePrefixExhausted` kind (`useLowerBound`, `noContribution`, `dropConsideration`, `constant`) routes to the correct evaluator path. Includes assertion that `onUnavailable` is NOT consulted when the resolution status is `partial`.

### 8.2 golden-trace tests

- `partial-visibility-fitl-coup-distance.test.ts` — extends the spec 169 `phase-boundary-fitl-coup-distance.test.ts` fixture set. New rows pin: (a) `ready` when the lookahead slot exposes a coup card, (b) `ready` when the leader slot exposes a coup card and lookahead does not, (c) `partial.lowerBound` when neither slot exposes a coup card, (d) the prior `unavailable: hiddenDeck` rows preserved via a parametrized fixture against both the with-observer-policy and without-observer-policy boundary declarations.
- `schedule-ref-consideration-trace-topNVisible.test.ts` — exercise `preferGovernEarlyInCoupCycle` against a fixture profile that uses `topNVisible` with `onPartial.visiblePrefixExhausted: useLowerBound`. Pin the per-candidate trace with `inputRefs[].observerPolicy`, `visiblePrefixLength`, and `fallbackApplied` metadata for both ready and partial cases.

### 8.3 convergence-witness tests

None mandated by this spec. The campaign-side effect (whether `arvn-evolved` adopts the unblocked consideration and what compositeScore that produces) is owned by `fitl-arvn-agent-evolution`, not by this spec's tests.

### 8.4 WASM equivalence

`policy-bytecode-equivalence.test.ts` extended with a fixture exercising `schedule.distance.toBoundary.<X>.cards` resolution under `topNVisible`. WASM and TS paths must produce identical scoring rows for all 15 baseline seeds across both `ready` and `partial.lowerBound` resolutions.

### 8.5 Leakage test

`partial-visibility-no-leak.test.ts` — for a fixture state where the hidden deck contains a coup card BEYOND the visible prefix, assert the resolver returns `partial.lowerBound: maxItems` (never the exact distance). The kernel cannot leak hidden deck composition through the schedule-ref family.

## 9. Foundation alignment

| Foundation | How this spec respects it |
|---|---|
| #1 Engine Agnosticism | `ObserverPolicy.topNVisible` is a generic predicate (ordered list of public zones, count cap). The kernel knows zone visibility, deck contents, and predicates over card identity — no game-specific logic. FITL is a consumer, not the implementation surface. |
| #2 Evolution-First Design | `observerPolicy` is GameSpecDoc YAML — evolution can author it on any boundary declaration. |
| #4 Authoritative State and Observer Views | The resolver inspects only `visibility: public` zones; the compiler enforces this. The §8.5 leakage test proves it. |
| #5 One Rules Protocol | Same resolver path serves agents, simulator, and (post-Phase 2) WASM VM. No bypass paths. |
| #6 Schema Ownership Stays Generic | No per-game schema files; observer policy is a generic GameSpecDoc field. |
| #7 Specs Are Data | All semantics declarative (kind enum, zone list, maxItems, fallback discriminators). No callbacks. |
| #8 Determinism | Resolver is a pure function of `(GameState, observerView)`. O(maxItems) deterministic ordered scan. |
| #10 Bounded Computation | O(maxItems) per ref read; `maxItems` is compile-time bounded. FITL: O(2). |
| #12 Compiler-Kernel Validation | Compile-time validation of zone refs, visibility, kind, list shape, and fallback-required-when-topNVisible. Runtime validates state-dependent matching. |
| #13 Artifact Identity | Observer policy is part of GameDef hash. Replay trace records the policy and visible-prefix length under which each ref read resolved. |
| #15 Architectural Completeness | Closes spec 169 §11 open question #2; addresses Foundation #20's distinction between partial and unavailable directly rather than collapsing them. |
| #16 Testing as Proof | Every validation rule, status path, fallback route, and equivalence claim has a dedicated test (§8). |
| #17 Strongly Typed Domain Identifiers | `ObserverPolicy` is a tagged union; `ObserverVisiblePrefix` carries `ZoneRef[]`. New status kind is a typed discriminant. |
| #20 Preview Signal Integrity | `partial.lowerBound` is a first-class status, distinct from `unavailable`. The lower-bound numeric value is observable to fallback consumers under `useLowerBound`, and the fallback route is recorded in deterministic trace output. No silent coercion. |

## 10. Code anchors for implementers

- **Types**: `packages/engine/src/kernel/types-core.ts` — extend `PhaseBoundaryDef`/`ScheduleKindDef` with optional `observerPolicy`. Add `ObserverPolicy` discriminated union and `ObserverVisiblePrefix` record. `packages/engine/src/agents/policy-runtime.ts:71-87` — extend `PhaseScheduleResolution` with `partial.lowerBound` kind and `observerPolicy`/`visiblePrefixLength` fields on `ready`.
- **Compiler validation**: `packages/engine/src/cnl/compile-agents.ts` (and `compile-phase-boundaries.ts` if applicable — search for spec 169's diagnostic registry). Extend phase-boundary validator and consideration-level fallback validator. Add diagnostic codes from §5.
- **Runtime resolver**: `packages/engine/src/agents/policy-runtime.ts:296-329` — extend `resolveBoundaryCardDistance` with the `topNVisible` branch and ordered-zone scan (§4.2). Visible-card-read helper goes in the same file or a sibling utility.
- **Fallback evaluator**: `packages/engine/src/agents/policy-evaluation-core.ts:78-90` — extend `PolicyScheduleFallback` with `onPartial.visiblePrefixExhausted`. `packages/engine/src/agents/microturn-option-eval.ts:107-156` — extend the schedule-option fallback application path to route `partial.lowerBound` through `onPartial`.
- **Status union**: see Types row.
- **WASM ABI**: `packages/engine-wasm/policy-vm/src/lib.rs` — extend the schedule-distance opcode handler with the topNVisible-aware resolution branch including partial.lowerBound result type. Encoded input must include observer-policy metadata.
- **FITL data**: `data/games/fire-in-the-lake/30-rules-actions.md:18-26` — add `observerPolicy: { kind: topNVisible, visiblePrefix: { zones: [lookahead:none, leader:none], maxItems: 2 } }` to the `coupEntry` boundary.
- **FITL profile** (acceptance test only, not deliverable): `data/games/fire-in-the-lake/sandbox-profiles/169-demonstration.md` — extend `preferGovernEarlyInCoupCycle.scheduleFallback` with `onPartial.visiblePrefixExhausted: useLowerBound` so the demonstration produces a non-zero contribution under the new behavior.
- **Cookbook**: `docs/agent-dsl-cookbook.md` — new section documenting `phase.*` and `schedule.*` ref families (parallel to existing `candidate.params.*` section per spec 166), with the observer-policy variant and the dual `scheduleFallback.onUnavailable`/`onPartial` contract worked through end-to-end.

## 11. Reassessment of source proposals

This spec was authored, externally reviewed (ChatGPT deep-research), and revised in the same session. Per-recommendation dispositions:

| Source recommendation | Disposition | Rationale |
|---|---|---|
| Multi-zone `visiblePrefix.zones[]` from day one | **Adopted** | Verified: FITL's `cardLifecycle` exposes BOTH `leader:none` AND `lookahead:none` as public stack-shaped zones (§2.3). A single `visibleSlot` is undersized for FITL itself. The schema must be sequence-shaped from the start. |
| First-class `partial.lowerBound` status distinct from `unavailable` | **Adopted** | Verified: Foundation #20 explicitly names `partial` as a distinct semantic outcome (§2.5). The prior spec-170 draft collapsed partial-evidence into `unavailable: behindHiddenPrefix`, violating #20. |
| `scheduleFallback.onPartial` discriminator split from `onUnavailable` | **Adopted** | Verified: parallel to the existing `previewFallback`/`lookupFallback`/`candidateParamFallback` patterns in `compile-agents.ts:2187-2220`. Profiles can opt into `useLowerBound` to extract strategic signal from prefix exhaustion. |
| Compile-time validation includes ordered-zones, public-only, non-duplicate, no-draw-zone-overlap | **Adopted (with adjustment)** | Adopted. Adjustment: the source proposed an `OBSERVER_POLICY_FACET_HIDDEN` rule for `exposedFacets`; rejected (see below) so the diagnostic is dropped. |
| Trace surface includes `observerScope`, `observationSource`, `visiblePrefixLength`, `fallbackApplied` | **Adopted (with adjustment)** | Adopted in substance. Adjustment: `observerScope` is not separately recorded because the policy-kind alone identifies the scope (`topNVisible` implies public-observer for this spec); `observationSource` is not separately recorded because the boundary id already identifies it. The recorded fields are `observerPolicy`, `visiblePrefixLength`, and `fallbackApplied` — sufficient for replay and audit. |
| FITL acceptance test must verify lookahead-slot identity against `cardLifecycle` | **Adopted** | Phase 3 requires authoring `lookahead:none` and `leader:none` per the verified FITL `cardLifecycle` (§2.3). |
| Leakage test that hidden deck composition cannot be recovered | **Adopted** | §8.5 covers this directly. |
| Free-standing `observableSequences[]` top-level GameSpecDoc construct | **Rejected** | No second consumer outside schedule resolution exists yet. Per Foundation #15, the abstraction is introduced at the level where the problem lives (schedule's observation surface). A future spec may elevate the primitive once a second consumer (UI projection, candidate-effect introspection, additional schedule kinds) materializes. Tracked as a deferred consolidation candidate. |
| `exposedFacets: [identity, tags]` decomposition | **Rejected** | FITL exposes full card identity in the visible slots; no near-term game requires facet decomposition. YAGNI per `CLAUDE.md` coding guidelines. |
| `hiddenTail: 'present' \| 'unknown'` enum | **Rejected** | FITL's hidden tail is always `'present'` until deck exhaustion. The `'unknown'` branch is unmotivated by any current game. |
| Full `ScheduleDistanceResolution` rewrite with `unknown`, `stochastic`, `unresolved`, `depthCapped`, `failed` variants | **Rejected (deferred per-variant)** | Each variant belongs to the ref family that requires it. This spec adds `partial.lowerBound` because schedule-distance needs it; other variants are added by the specs that own them. Not a refusal-of-direction, just scope discipline. |
| Separate `resolveObservedSequence` public projection service | **Rejected** | The existing `packages/engine/src/kernel/observation.ts` and `packages/engine/src/agents/policy-lookup-surface.ts` already provide zone-visibility projection and observer-aware queries. Creating a new public service duplicates the surface; the resolver uses the existing projection directly. |
| Phase ordering: types → compile → projection → schedule integration → fallback/trace → WASM → FITL → campaign | **Adopted with consolidation** | Spec collapses projection (no new service) and schedule integration into Phase 1; consolidates fallback and trace into Phase 1 as well; preserves the WASM-before-FITL ordering. 4 phases vs source's 7 reflects the rejection of the speculative projection service. |
| `partialKind: minimumDistance` value reserved for future | **Adopted (renamed)** | `partial.lowerBound` IS minimumDistance under a clearer name. The lower-bound IS the minimum distance to a possible matching card. |
| Conformance corpus extension (5-game proof) | **Rejected (out of scope)** | Foundation #16's conformance-corpus requirement is project-wide, not per-spec. This spec ships FITL coverage; the conformance-corpus extension is owned by the next spec that adds a partial-visibility-bearing game outside FITL. |

## 12. Open questions

1. **Empty-zone advance vs. miss semantics.** When `visiblePrefix.zones[0]` is empty at runtime and `zones[1]` has a non-matching card, the spec currently treats the empty zone as zero scanned items and advances to zone[1], counting one card scanned. Alternative reading: the empty zone counts as `maxItems_for_zone_0 = 1` regardless of occupancy, treating "no card revealed yet" as "card present but unmatched". The spec adopts the advancing-on-empty reading because it preserves the "exact distance through visible cards" semantics; flagging for review during Phase 1 implementation.
2. **`maxItems` per-zone vs. aggregate.** The spec uses an aggregate `maxItems` across all listed zones. An alternative is per-zone caps (`zones: [{ id, max: 1 }, …]`). Aggregate is simpler and sufficient for FITL (no zone has more than 1 card in practice); flagging for review if a game emerges where per-zone caps matter.
3. **Lookahead-slot vs. leader-slot ordering.** The spec orders `lookahead:none` before `leader:none` because the lookahead slot holds the NEXT turn's card (later draw position from the deck) and the leader slot holds the CURRENT turn's card (earlier draw position from the deck)… or does it? FITL's `turn-flow-lifecycle.ts` orders the lifecycle as `lookahead → leader → played` (`packages/engine/src/kernel/turn-flow-lifecycle.ts:55-108`). The "next card to be drawn from the deck" semantics depends on whether the deck draws into `lookahead` (then promotes to `leader` on turn boundary) or directly into `leader`. The Phase 3 implementer MUST verify against the FITL `cardLifecycle` advancement code and pin the correct order in the test fixture; if the documented order in §4.1 is wrong, the example YAML is updated before authoring against FITL data. This open question does not block the engine work in Phases 0-2.
4. **Reusing the visible-prefix concept for other ref families.** If/when a second consumer materializes (UI projection, additional schedule kinds, candidate-effect introspection), the visible-prefix declaration should be promoted to a shared primitive (per the rejected `observableSequences[]` proposal). Tracked as a deferred consolidation candidate; not in scope here.
5. **Interaction with `omniscient` observer policy (future).** When `omniscient` lands, it must respect the same compile-time validation surface (kind enum) and runtime-dispatch shape; the patterns established by this spec should be reusable.

## 13. Out of scope

- `observerPolicy: omniscient` — deferred to a future spec per spec 169 §13.
- `observableSequences[]` top-level primitive — see §11 rejection rationale.
- `exposedFacets` partial-identity decomposition — see §11.
- `hiddenTail` present/unknown enum — see §11.
- Layer 2 (candidate-effect introspection, control-rule abstraction) — still deferred per spec 169 §13.
- Layer 3 (scoped horizon preview probe) — still deferred per spec 169 §13.
- Schedule kinds beyond `cardDraw` — `turnCount`, `condition`, `microturnSchedule`, `eventTrigger` remain reserved per spec 169 §4.4.
- ARVN profile refactor — the campaign decides whether the (now-unblocked) `preferGovernEarlyInCoupCycle` consideration belongs in `arvn-evolved`, not this spec.
- Conformance-corpus extension proving partial-visibility across multiple games — owned by whichever follow-up spec introduces a second partial-visibility-bearing game.
- Other status variants of `ScheduleDistanceResolution` (`unknown`, `stochastic`, `unresolved`, `depthCapped`, `failed`) — owned by the specs that introduce the corresponding ref behaviors.

## 14. Tickets

Decomposed via `/spec-to-tickets` on 2026-05-13:

- [`archive/tickets/170PARTVISOBS-001.md`](../archive/tickets/170PARTVISOBS-001.md) — Types, `ObserverPolicy` union, and compiler validation (covers §7 Phase 0, §8.1 partial-visibility-compile-validation + partial-visibility-determinism)
- [`tickets/170PARTVISOBS-002.md`](../tickets/170PARTVISOBS-002.md) — Runtime resolver branch, `partial.lowerBound` status, fallback evaluator, trace (covers §7 Phase 1, §8.1 partial-visibility-resolver-correctness + partial-visibility-fallback-routing, §8.2 schedule-ref-consideration-trace-topNVisible, §8.5 partial-visibility-no-leak)
- [`tickets/170PARTVISOBS-003.md`](../tickets/170PARTVISOBS-003.md) — WASM opcode parity for `topNVisible` and `partial.lowerBound` (covers §7 Phase 2, §8.4 WASM equivalence)
- [`tickets/170PARTVISOBS-004.md`](../tickets/170PARTVISOBS-004.md) — FITL `observerPolicy` authoring with verified slot order + cookbook + golden trace (covers §7 Phase 3, §8.2 partial-visibility-fitl-coup-distance, cookbook section)
