# Spec 170 / FITL — `visiblePrefix` Coverage Gap from Accumulating `played:none`

**Author**: Claude Opus 4.7 (`/improve-loop` skill on `campaigns/fitl-arvn-agent-evolution`)
**Date**: 2026-05-14
**Status**: Architectural-gap halt per Step 7.7 of `improve-loop`. Loop paused awaiting external research.
**Audience**: External LLM researcher (e.g., ChatGPT-Pro). Treat this report as self-contained — the reader has no access to the codebase.
**Prerequisites**: Familiarity with `archive/specs/170-partial-visibility-observer-policy.md` would help but is not assumed.

---

## 1. TL;DR

Spec 170 ships a generic `observerPolicy.kind: topNVisible` schedule-resolver extension whose declared semantic is "the next N visible scheduled cards across an ordered list of public zones." FITL adopts it on its `coupEntry` boundary with `visiblePrefix.zones: [played:none, lookahead:none]` and `maxItems: 2`, intending to surface "is a Coup card the currently-being-played card OR the next card?" as a strategically meaningful timing signal.

**Empirical reality**: across 15 deterministic seeds × 426 ARVN action-selections × 138 Govern candidates that read `schedule.distance.toBoundary.coupEntry.cards`, the resolver returned `partial.lowerBound = 2` **138/138 times (100%)**. The `ready` resolutions (Coup card visible at distance 0 or 1) **never fire**. Per FITL rules §2.3.7 + §2.3.9 (Monsoon Season), a Coup card in `lookahead` is a normal, regularly recurring game state — it should be observed approximately 1 in every 11 turns.

**Root cause**: FITL declares `discardZone: played:none` on its event deck. After every non-coup card resolves, the previously-played card stays in `played:none`. The resolver iterates `visiblePrefix.zones` IN DECLARED ORDER and accumulates scanned-cards until `maxItems` is reached. After even a single turn, `played:none` contains ≥2 non-coup cards (active card on top + accumulated discards beneath). The resolver consumes its full `maxItems: 2` budget on `played:none` entries — and **never reaches `lookahead:none`** at all.

The capability is technically implemented correctly per its declared semantics; the configuration it is being driven with produces silent partial coverage that profile authors have no signal to detect.

**Severity**: Architectural — Foundation 15 ("Architectural Completeness"). The capability is documented as functional; the agent trace evidence proves it is silently non-functional under the production FITL configuration; profile authors writing against the cookbook (`archive/specs/170-partial-visibility-observer-policy.md` §1, §4.5) have no way to know their consideration is broken.

**Asks of the external researcher**:
1. Validate the diagnosis against the cited code + trace evidence.
2. Evaluate the proposed fix options (§7) and recommend one or surface a better option.
3. Identify any second-order semantic consequences I missed (e.g., how a fix interacts with `omniscient` observer policy if/when that lands per spec 170 §13).

---

## 2. Background

### 2.1 LudoForge-LLM (the host project)

LudoForge-LLM compiles **Structured Game Specifications** (DSL embedded in Markdown with fenced YAML) into **GameDef JSON** that runs on a deterministic kernel engine. Agents author **PolicyAgent profiles** that score legal moves via composable **considerations** — each consideration is a `{when, value, weight}` triple referencing typed `ref`s into game state, candidate features, preview output, etc.

The engine is **game-agnostic**: it knows zones, decks, schedules, considerations, refs, fallbacks. It does NOT know about Fire in the Lake specifically. FITL is one consumer of the engine, declared entirely in YAML under `data/games/fire-in-the-lake/`.

The system's normative foundations are documented in `docs/FOUNDATIONS.md`. The two relevant ones for this report:

- **Foundation 4 (Authoritative State and Observer Views)**: zones declare `visibility: public | hidden`. Agents observe only public state. The compiler validates that schedule observer policies inspect only public zones.
- **Foundation 15 (Architectural Completeness)**: silent no-ops, partial-coverage gaps, and documented-but-non-functional capabilities are root-cause issues that must be reported as specs/reports rather than worked around in profile YAML.
- **Foundation 20 (Preview Signal Integrity)**: `ready`, `unknown`, `hidden`, `stochastic`, `unresolved`, `failed`, `depth-capped`, and `partial` are distinct semantic outcomes. Unavailable preview refs MUST NOT be silently coerced into numeric contributions.

### 2.2 Spec 170 (partial-visibility observer policy)

`archive/specs/170-partial-visibility-observer-policy.md` (already archived; spec is implemented and the four `170PARTVISOBS-001..004` tickets all landed).

Spec 170 extends `phaseBoundaries[].schedule` with an optional `observerPolicy` field whose `kind: topNVisible` activates a partial-visibility resolution branch. The resolver scans a declared `visiblePrefix.zones[]` in declared order and returns one of:

- `ready` — a card matching the boundary's `cardSelector` (e.g., `tags: [coup]`) was found at index N in the visible prefix; the schedule distance is N.
- `partial.lowerBound` — the visible prefix was exhausted without finding a match; a hidden tail remains; the lower-bound distance is the length of the scanned prefix.
- `unavailable: hiddenDeck` — the boundary has no `observerPolicy` declared (preserves the pre-spec-170 default for boundaries that haven't opted in).

The spec also adds a parallel `scheduleFallback.onPartial.visiblePrefixExhausted` discriminator (`useLowerBound | noContribution | dropConsideration | constant`) for consideration authors to extract — or discard — the partial signal.

### 2.3 FITL (Fire in the Lake) consumption

`data/games/fire-in-the-lake/30-rules-actions.md:18-33` (the FITL spec's `phaseBoundaries` declaration):

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
            - id: played:none
            - id: lookahead:none
          maxItems: 2
```

The intent (per the spec's verified `cardLifecycle` analysis at §2.3 and the §11 disposition row labeled "Played-slot vs. lookahead-slot ordering"): when a Coup card is the currently-active card or the next-to-be-played card, agents read distance 0 or 1 respectively; otherwise the partial.lowerBound = 2 signal kicks in.

### 2.4 The `fitl-arvn-agent-evolution` campaign

A long-running `/improve-loop` campaign that evolves an `arvn-evolved` PolicyAgent profile for the ARVN seat against three baseline-faction agents (US/NVA/VC). The campaign tests new engine capabilities by adding considerations to `arvn-evolved` and measuring `compositeScore = avgMargin + 10*winRate` across 15 deterministic seeds (1000–1014). Baseline at the time of this report: compositeScore = −3.4, 4 wins / 15.

The user-flagged motivation for the current session was: "in the latest PR merge we included the ability for AI agent policies to take into account the played cards and those in lookahead (to a point). If there are global lessons about this, they may be stale, so check their current state."

The prior `lessons-global` entry ("FITL ARVN agent evolution cannot benefit from spec 169 schedule refs until partial-visibility observer policy lands") was structurally obsolete because spec 170 had landed.

---

## 3. Symptom

`exp-001` of this session added `preferGovernEarlyInCoupCycle` (cloned verbatim from `data/games/fire-in-the-lake/sandbox-profiles/169-demonstration.md`) to `arvn-evolved.use.considerations`:

```yaml
preferGovernEarlyInCoupCycle:
  scopes: [move]
  costClass: state
  weight: 250
  when:
    ref: candidate.tag.govern
  value:
    ref: schedule.distance.toBoundary.coupEntry.cards
  scheduleFallback:
    onUnavailable: noContribution
    onPartial:
      visiblePrefixExhausted: useLowerBound
```

Result: compositeScore −3.4 → −3.6 (regression). The seed-1000 first-decision Govern candidate score moved −3500 → −3000 (+500), confirming the consideration mechanism IS wired end-to-end. But every single trace reading of `scheduleFallbackFired` recorded `value: 2` (i.e., `partial.lowerBound` at the maxItems-2 boundary). No `ready: 0` or `ready: 1` rows.

Subsequent experiments (`exp-002` weight=250 with inverted formula `sub(2, distance)` targeting Train; `exp-003` weight=600 with same formula) produced **identical aggregate metrics to baseline** (compositeScore −3.4) despite mechanically should-have-flipped Train > Govern when distance=1. The mechanism was firing but the value was always 0 (i.e., `2 - 2`).

---

## 4. Trace Evidence

For a clean reproducibility witness, I re-applied `preferGovernEarlyInCoupCycle` to `arvn-evolved` and ran the tournament with `--trace-default all`, dumping 15 per-seed traces. Aggregating `agentDecision.candidates[].scheduleFallbackFired` across every ARVN actionSelection decision:

```
TOTAL ARVN action-selections (15 seeds):       426
TOTAL Govern candidates with scheduleFallbackFired: 138
distance value distribution:
  value=0 (ready, coup in played):    0    (expected ~0% — coup-in-played triggers coup phase, not action-selection — see §6 below)
  value=1 (ready, coup in lookahead): 0    (EXPECTED ~10% per FITL rules — see §5 below)
  value=2 (partial.lowerBound):       138  (100%)
```

Per-seed breakdown (all 15 seeds, every seed = 100% partial):

```
seed 1000 : actionSelections=20, ready0=0, ready1=0, partial2=4
seed 1001 : actionSelections=25, ready0=0, ready1=0, partial2=7
seed 1002 : actionSelections=33, ready0=0, ready1=0, partial2=12
seed 1003 : actionSelections=25, ready0=0, ready1=0, partial2=6
seed 1004 : actionSelections=40, ready0=0, ready1=0, partial2=13
seed 1005 : actionSelections=39, ready0=0, ready1=0, partial2=17
seed 1006 : actionSelections=27, ready0=0, ready1=0, partial2=10
seed 1007 : actionSelections=26, ready0=0, ready1=0, partial2=8
seed 1008 : actionSelections=23, ready0=0, ready1=0, partial2=6
seed 1009 : actionSelections=35, ready0=0, ready1=0, partial2=14
seed 1010 : actionSelections=35, ready0=0, ready1=0, partial2=9
seed 1011 : actionSelections=25, ready0=0, ready1=0, partial2=7
seed 1012 : actionSelections=24, ready0=0, ready1=0, partial2=7
seed 1013 : actionSelections=25, ready0=0, ready1=0, partial2=9
seed 1014 : actionSelections=24, ready0=0, ready1=0, partial2=9
```

The number of Govern candidates per seed (4-17) is less than total action-selections per seed (20-40) because not every action-selection has a Govern candidate (some main-phase decisions have no province where ARVN can govern).

Sample trace fragment from `trace-1000.json` first ARVN action-selection (seed 1000, decision 0, action-selection at game start):

```json
{
  "decisionKind": "actionSelection",
  "actionId": "govern",
  "agentDecision": {
    "seatId": "arvn",
    "candidates": [
      {
        "actionId": "govern",
        "score": -3000,
        "scoreContributions": [],
        "scheduleFallbackFired": {
          "termId": "preferGovernEarlyInCoupCycle",
          "kind": "useLowerBound",
          "value": 2,
          "reason": "partial.lowerBound.visiblePrefixExhausted"
        }
      },
      // ... other candidates
    ]
  }
}
```

Note `scoreContributions: []` for action-selection candidates is a pre-existing trace gap caused by the WASM scoring fast-path bypassing the diagnostic-collecting callback in `policy-eval.ts:756-769`. It is NOT related to this report; the campaign-relevant witness `scheduleFallbackFired` IS populated.

---

## 5. Why FITL Rules Predict Coup-in-Lookahead Frequently

`rules/fire-in-the-lake/fire-in-the-lake-rules-section-2.md:8-14` (rule 2.2 "Start"):

> "Begin play by revealing the top card of the draw deck and placing it onto a played cards pile. Then reveal the next card on top of the draw deck. The card on the played card stack is played first; the card on top of the draw deck will be played next. NOTE: Players will see **1 card ahead into the deck** (2.3.7). All played cards and the number of cards in the draw deck are open to inspection."

`rules/fire-in-the-lake/fire-in-the-lake-rules-section-2.md:78-81` (rule 2.3.7 "Next Card"):

> "After adjusting Eligibility, move the draw deck's top card onto the played card pile face-up and reveal the draw deck's next card (even if the played card is Coup!, 2.4). Play the played card, proceeding with the appropriate sequence."

`rules/fire-in-the-lake/fire-in-the-lake-rules-section-2.md:104-111` (rule 2.3.9 "Monsoon Season"):

> "On the last Event card before each Coup Card (2.4), Operations may not include Sweep (3.2.3, even via Advise, 4.2.1) nor March (3.3.2), US Air Strikes and Air Lifts are limited to 2 spaces (4.2.2-.3), and no Pivotal Events allowed (2.3.8). … NOTE: Keep the 'Monsoon' marker near the deck and place it on the played Event card as a reminder while a Coup is showing as the next card."

These rules make Coup-in-lookahead a **first-class, repeatedly-occurring, gameplay-altering state**. The Monsoon restrictions (rule 2.3.9) literally only fire when "a Coup is showing as the next card." A simulation in which agents never observe a Coup card in lookahead is operating outside the rules' intended visibility surface.

Expected frequency: the FITL Full scenario has ~6 Coup cards across ~70 event cards. Roughly 1 in every ~12 turns has Coup in lookahead. Across 15 seeds × ~25 turns/seed × ~25% ARVN action-selection share, the expected ARVN action-selection-with-coup-in-lookahead count is roughly 15-40. Observed: 0.

---

## 6. Root Cause Analysis

### 6.1 The FITL data declaration

`data/games/fire-in-the-lake/41-events/001-032.md:1-7` (and identical entries in `033-064.md`, `065-096.md`, `097-130.md`):

```yaml
eventDecks:
  - id: fitl-events-initial-card-pack
    drawZone: deck:none
    discardZone: played:none
```

**`played:none` IS the discard pile.** Played cards do not go to a separate discard zone; they remain in `played:none` after resolution.

This matches the FITL board: physically there is one "played cards pile" face-up, with the most recently played card on top. The pile is the canonical play history (rule 2.2: "All played cards and the number of cards in the draw deck are open to inspection.").

### 6.2 The kernel turn-flow lifecycle

`packages/engine/src/kernel/turn-flow-lifecycle.ts:55-82` — `resolveDiscardZone`:

```ts
const resolveDiscardZone = (def: GameDef, played, lookahead, leader): string => {
  const drawPileId = resolveDrawPileFromZones(def, played, lookahead, leader);
  const eventDecks = def.eventDecks ?? [];
  if (drawPileId !== null && eventDecks.length > 0) {
    const matching = eventDecks.filter((deck) => deck.drawZone === drawPileId);
    if (matching.length === 1) {
      return matching[0]!.discardZone;
    }
  }
  // Fallback: accumulating semantic — discard pile IS the played slot.
  return played;
};
```

`packages/engine/src/kernel/turn-flow-lifecycle.ts:387-479` — `applyTurnFlowCardBoundary`:

```ts
// (1) Handle the current played-top
if (canRunCoupHandoff && playedTop !== null) {
  // Coup-handoff: pop played top → leader (not discard)
  const popResult = popTopToken(nextState, slots.played, options?.tracker);
  nextState = prependToken(popResult.state, slots.leader, playedTop, ...);
} else if (playedTop !== null && slots.discard !== slots.played) {
  // Non-accumulating: pop played top → discardZone
  ...
}
// else (slots.discard === slots.played AND not a coup): leave the popped card
// on top of played; the new card prepends above it. This is the accumulating
// case where the played slot IS the discard pile.

// (2) Promote lookahead → played
const promoted = moveTopToken(nextState, slots.lookahead, slots.played, ...);

// (3) Reveal new deck top → lookahead
const revealed = moveTopToken(nextState, drawPileId, slots.lookahead, ...);
```

Because FITL's `discardZone == played:none == slots.played`, the lifecycle hits the `else` branch of comment block (1). Old played cards stay on the played stack with the new card prepended on top.

After N turns of play, `played:none` contains: `[active_card, previously_played_card, previously_previously_played, ...]`. Coup cards are NOT in this stack (they go to `leader:none` via coup-handoff, see line 420-429 of `turn-flow-lifecycle.ts`).

### 6.3 The spec-170 resolver

`packages/engine/src/agents/policy-runtime.ts:200-232` (approximate; the lines may have shifted post-implementation):

```ts
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
        return { kind: 'ready', value: scanned, observerPolicy: { kind: 'topNVisible' }, visiblePrefixLength: scanned + 1 };
      }
      scanned += 1;
    }
  }
  return { kind: 'partial', partialKind: 'lowerBound', lowerBound: scanned, observerPolicy: { kind: 'topNVisible' }, visiblePrefixLength: scanned };
}
```

The crucial detail: `for (const card of slotCards)` iterates ALL cards in the zone, in zone order. For `played:none` with accumulated discards, this means scanning the top, then beneath-the-top, etc. With `maxItems: 2` and `played:none` always holding ≥2 cards (active + ≥1 discarded) after the first card boundary, the resolver always exhausts its budget on `played:none` entries — never reaching `lookahead:none`.

The pre-first-boundary case (action-selection on the very first card, before any discards have accumulated) might in principle reach `lookahead:none`. But (a) at game start the first turn's lookahead is whatever the shuffle produced — statistically unlikely to be one of the 6 Coup cards, and (b) the empirical 138/138 evidence across 15 deterministic seeds shows it never reads a Coup card even in this case.

### 6.4 Why this is "code/architectural", not "DSL authoring"

- The cookbook (`docs/agent-dsl-cookbook.md`, per spec 170 ticket 170PARTVISOBS-004) and spec 170 §1 example present the `schedule.distance.toBoundary.<X>.cards` ref as "the next visible scheduled card distance." A profile author authoring against the cookbook reasonably expects the read to surface the next-to-be-played card from `lookahead:none`.
- The fact that the FITL configuration silently never reaches `lookahead:none` is invisible to the profile author. There is no compiler diagnostic, no runtime warning, no trace anomaly that would let them notice.
- The integration test that pinned the spec 170 contract (`packages/engine/test/integration/partial-visibility-fitl-coup-distance.test.ts`) **artificially constructs the state** via `withVisibleCards(baseState, { played: ids.nonCoup[0], lookahead: ids.coup[0] })`. The test replaces `state.zones['played:none']` with exactly one non-coup card token. **The production simulation state, where `played:none` accumulates, is never exercised by the test.**
- Foundation 15 names exactly this case ("partial-coverage gaps … must be reported as specs/reports rather than worked around"). The spec 170 capability is documented as functional for FITL; the trace evidence proves it is silently non-functional under the production configuration.

---

## 7. Proposed Fix Options

Each option is evaluated against:

- **Game-rules fidelity** — does it preserve FITL's "played card pile is a single accumulated stack open to inspection" semantic (rule 2.2)?
- **Engine agnosticism (Foundation 1)** — does it stay generic, or does it bake FITL-specific reasoning into the engine?
- **Blast radius** — how many components (kernel, compiler, runtime, profile YAML, game spec YAML, tests) must change?
- **Future flexibility** — does it block or enable the `omniscient` observer policy (spec 170 §13) and other games that may have different played-pile semantics?

### Option A — Separate `discardZone` in FITL data

Change `data/games/fire-in-the-lake/41-events/*.md`:

```yaml
eventDecks:
  - id: fitl-events-initial-card-pack
    drawZone: deck:none
    discardZone: discardPile:none   # NEW zone
```

Add `discardPile:none` to `10-vocabulary.md` zone declarations (public, stack-ordered).

**Pros**: lowest engine surface change (zero engine code modifications). Maintains the lifecycle's non-accumulating branch (turn-flow-lifecycle.ts:430-441), which moves the popped card to a separate zone.

**Cons** (the user has flagged this concern specifically):

- **FITL rule 2.2**: "All played cards and the number of cards in the draw deck are open to inspection." The played card pile IS the history-of-play stack. Splitting active card from history would semantically diverge from the rules even though the physical board state would still be representable. Any future rules dependency on the played pile as a single object (lingering effects, "previously played" lookups, RVN Leader equivalents for non-coup cards) would have to switch to the new zone.
- **FITL rule 2.3.8 (Pivotal Events)**: "the Pivotal Event stays in the played card pile, as normal." A pivotal event is a non-coup event that explicitly remains in `played:none` per the rules. With option A's split, the pivotal would go to `discardPile:none`, which conflicts with the rules' explicit handling.
- Any existing game-spec YAML, observability spec (`93-observability.md`), or test that references `played:none` as the source of truth for "all played cards" would need migration.
- An external observer (e.g., another player's UI projection, an unsupervised agent training pipeline) inspecting "the played pile" would now see only 1 card instead of the history.

**Game-rules fidelity**: WEAK. Direct conflict with rules 2.2 and 2.3.8.

**Recommendation**: do not adopt unless rules 2.2/2.3.8 can be re-interpreted as "the union of `played:none` and `discardPile:none` is the played card pile" — but that's an authoring sleight-of-hand that complicates every consumer.

### Option B — Reverse `visiblePrefix.zones` order in FITL data

Change `data/games/fire-in-the-lake/30-rules-actions.md:18-33` to:

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
            - id: lookahead:none   # SCAN FIRST
            - id: played:none      # then played (consumes maxItems on discards)
          maxItems: 2
```

**Pros**: pure data fix. Zero engine code change. The resolver now scans `lookahead:none` (1 card) first; if it's a Coup, returns `ready: 0` (which logically means "next-card-distance = 0" with this ordering). Otherwise scans 1 from `played:none` (active card; non-coup at action-selection time); returns `partial.lowerBound: 2`.

**Cons**:

- The semantic of "distance 0" now means "Coup is the NEXT card" rather than "Coup is the CURRENTLY-being-played card." Profile authors have to mentally remap.
- Spec 170 §11 explicitly chose `[played, lookahead]` order with the rationale: "FITL's live turn-flow-lifecycle.ts promotes lookahead -> played and draws the next card into lookahead; leader is coup-handoff storage. The visible-prefix order is therefore played:none first and lookahead:none second for FITL's current-driving-card and next-card readout." Reversing it contradicts the spec's authored intent, even if it produces a working signal.
- It only papers over the issue — the resolver still hits `played:none` and scans 1 discarded card. The semantic ambiguity ("does distance 1 mean 'next card' or 'one card ago'?") remains. For a 3-zone visiblePrefix this would be even worse.
- Does NOT fix the deeper architectural issue: any future game where the same accumulating-discard pattern + 2+ visible zones occurs will hit the same trap.

**Game-rules fidelity**: NEUTRAL. Doesn't conflict with rules but reinterprets "distance" semantics.

**Recommendation**: viable as a tactical fix for FITL specifically, but does not generalize and leaves the engine's behavior counter-intuitive for future authors.

### Option C — Per-zone `maxItems` cap in Spec 170 schema

Extend the spec 170 declaration to support per-zone caps:

```yaml
visiblePrefix:
  zones:
    - { id: played:none,    maxItems: 1 }   # only the top (active) card
    - { id: lookahead:none, maxItems: 1 }   # only the top (revealed-next) card
```

Or keep the aggregate `maxItems` AND add per-zone:

```yaml
visiblePrefix:
  zones:
    - { id: played:none,    max: 1 }
    - { id: lookahead:none, max: 1 }
  maxItems: 2   # aggregate cap (matches sum of per-zone or ≤ sum)
```

Engine changes:
- `policy-runtime.ts` resolver respects per-zone `max` in addition to aggregate `maxItems`.
- `compile-agents.ts` validates per-zone `max` (positive integer, sum ≤ aggregate).
- `kernel/types-core.ts` extends `ObserverVisiblePrefix` zones with optional `max`.
- Schema artifacts re-emit.
- Cookbook + spec 170 §4.1, §10 documentation update.

**Pros**: cleanest abstraction extension. Each zone can be capped independently per its physical semantics. Generalizes: any future game with an accumulating discard-as-played-slot pattern can declare `max: 1` on it.

**Cons**:

- Spec 170 §12 open question 2 ("`maxItems` per-zone vs. aggregate") was flagged but deferred ("Aggregate is simpler and sufficient for FITL"). The empirical evidence in this report reverses that disposition: aggregate is NOT sufficient for FITL.
- Requires a follow-up spec (call it 170.1 or 171). Engine code change with compiler + types + tests.
- Slightly raises the conceptual surface for profile authors (two cap knobs instead of one).

**Game-rules fidelity**: STRONG. Preserves played-pile semantics; just adds an authoring knob.

**Recommendation**: a strong candidate. Solves the immediate FITL gap and generalizes to future games.

### Option D — Engine semantic: visiblePrefix scans only the TOP of each stack-ordered zone

Change the resolver semantic so `visiblePrefix` zones contribute at most 1 card each (the top of each stack-ordered zone). `maxItems` stays as the aggregate cap across all zones.

Engine changes:
- `policy-runtime.ts` resolver scans only the top card of each `slotCards` collection (replaces `for (const card of slotCards)` with `if (slotCards.length > 0) { const card = slotCards[0]; ... }`).
- All existing tests that pinned multi-card-per-zone scans need re-blessing or re-thinking.
- Spec 170 §4.2 semantic re-specification.
- Cookbook documentation update.

**Pros**: most ontologically clean. "Visible prefix" should semantically mean "the next N upcoming cards we can see," and only the top of each zone is "upcoming" — the rest is history. This realizes the spec's intent more honestly than the current implementation.

**Cons**:

- Hardest engine semantic change. Existing integration test (`partial-visibility-fitl-coup-distance.test.ts`) currently uses `withVisibleCards` to set a 1-card played:none. That test would still pass, BUT any future test that wanted to model a multi-card visible zone would no longer work the same way.
- Could be a breaking change for any not-yet-landed game whose physical semantics genuinely IS multi-card-per-zone visibility (e.g., a card game with a "discard pile public, top 3 visible to all"). Such a game would need to model the 3 visible cards as 3 separate single-slot zones rather than 1 multi-card zone.
- Spec 170 §13 reserves `omniscient` observer policy for the future; the relationship between `topNVisible` per-zone-top-only and `omniscient` per-zone-everything would need explicit documentation.

**Game-rules fidelity**: STRONG. Matches the "next-visible-cards" mental model.

**Recommendation**: arguably the most architecturally honest fix, but the highest blast radius and requires re-thinking spec 170's visiblePrefix contract.

### Option E — Runtime augmentation: "active card slot" hint on zones

Add an optional `activeCardSlot` declaration on a zone (or on the lifecycle), indicating "the top of this zone is the currently-active card; older entries are history and should not count in visiblePrefix scans."

```yaml
zones:
  - id: played
    owner: none
    visibility: public
    ordering: stack
    semantic: activeCardSlot   # NEW
```

Resolver checks the semantic and reads only 1 card from such zones during visiblePrefix scans.

**Pros**: declarative; the game spec can opt into the active-card semantic explicitly.

**Cons**:

- Adds a new authoring concept that's specific to card-driven games. Foundation 1 (Engine Agnosticism) tension — is "activeCardSlot" generic enough?
- Overlaps conceptually with `cardLifecycle.played` from `30-rules-actions.md` (which already names which zone is the active card slot). Possibly redundant.
- Roughly the same engine + compiler + spec surface as Option C, but with a less direct fix.

**Recommendation**: less attractive than Option C — the same surface change for a more game-specific abstraction.

### Comparison table

| Option | Game-rules fidelity | Engine surface | Compiler surface | Spec surface | Generalizes | Open spec needed |
|---|---|---|---|---|---|---|
| A. Separate discardZone | WEAK (conflicts r2.2/2.3.8) | 0 lines | 0 lines | FITL data + 10-vocabulary | N/A (FITL-only) | No |
| B. Reverse zones order | NEUTRAL | 0 lines | 0 lines | FITL data | No | No |
| C. Per-zone maxItems | STRONG | ~20 lines | ~30 lines | Spec 170 §4.1, §4.2, §5; cookbook | Yes | Yes (170.1 or 171) |
| D. Top-of-zone semantic | STRONG | ~10 lines (resolver) | 0 lines | Spec 170 §4.2 rewrite; cookbook | Yes | Yes (170.2 or 172) |
| E. activeCardSlot zone hint | MEDIUM | ~20 lines | ~30 lines | Spec, FITL data | Partial | Yes (171) |

---

## 8. Diagnostic & Verification Recipe

For an independent reproduction of the 138/138 evidence:

1. Check out the worktree branch state described in §10 (`improve/fitl-arvn-agent-evolution` at the baseline post-spec-170 commit).
2. Add the consideration from §3 to `data/games/fire-in-the-lake/92-agents.md` `library.considerations` and append `preferGovernEarlyInCoupCycle` to `arvn-evolved.use.considerations`.
3. Build: `pnpm -F @ludoforge/engine build`.
4. Run the tournament with full traces:
   ```bash
   node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs \
     --seeds 15 --players 4 --evolved-seat arvn --max-turns 200 \
     --concurrency 8 --trace-default all
   ```
5. The 15 per-seed traces land in `campaigns/fitl-arvn-agent-evolution/traces/trace-{1000..1014}.json`.
6. Aggregate `scheduleFallbackFired` values across all traces using the per-seed Node one-liner in §4 above.

For testing a proposed fix:

- After the fix, the same recipe should produce at least 1 `ready: 0` or `ready: 1` row across 15 seeds with high probability. Cross-seed: with 6 Coup cards / ~70 cards / ~15 seeds, the expected count is ~15-40 `ready` resolutions.
- Existing test `packages/engine/test/integration/partial-visibility-fitl-coup-distance.test.ts` must still pass.
- Existing FITL canary tests (`packages/engine/test/integration/fitl-*.test.ts`) must still pass.
- A NEW production-flow regression test should be added: simulate one seed for N turns, assert that across some recorded ARVN action-selections, at least one `scheduleFallbackFired` carries `value: 1` or `kind != 'useLowerBound'` (i.e., a `ready` resolution). This closes the gap between the spec-170 integration test's artificial `withVisibleCards` state and the production state.

---

## 9. What Has Been Done On The Worktree Branch (current state)

Branch: `improve/fitl-arvn-agent-evolution` in `.claude/worktrees/improve-fitl-arvn-agent-evolution/`.

Commits:
1. `improve-loop: baseline (compositeScore=-3.4, wins=4/15, tier 15)` — empty baseline commit after STATE-EVOLVED stale-baseline recovery.

Working-tree changes (uncommitted):
- `campaigns/fitl-arvn-agent-evolution/musings.md` — session narrative (tracked file; will be reverted to main baseline before any squash-merge per the skill's tracked-musings policy).
- `campaigns/lessons-global.jsonl` — 5 new global lessons promoted from this session's findings (1 STALE-LESSON CORRECTION for the prior lesson 134; 1 architectural confirmation that spec 170 IS wired correctly for arvn-evolved; 1 finding about "always-positive scheduling considerations on dominant action classes"; 1 finding about the action-selection `scoreContributions` trace observability gap; 1 finding about FITL distance=0 unreachability).

Runtime / diagnostic files (gitignored):
- `campaigns/fitl-arvn-agent-evolution/results.tsv` — 5 rows: baseline + exp-001 REJECT + exp-002/003/004 NEAR_MISS.
- `campaigns/fitl-arvn-agent-evolution/checkpoints.jsonl` — baseline checkpoint only.
- `campaigns/fitl-arvn-agent-evolution/traces/trace-1000..1014.json` — full per-seed traces from the verification run.
- `campaigns/fitl-arvn-agent-evolution/lessons.jsonl` — local lesson history.

Stashes (worktree-local, will be lost on `git worktree remove --force`):
- `stash@{0}: near-miss-exp-003: preferTrainAsCoupApproaches weight=600 — zero-effect because distance=1 never occurs at ARVN action-selection`
- `stash@{1}: near-miss-exp-002: preferTrainAsCoupApproaches weight=250 (zero-effect on corpus)`
- `stash@{2}: near-miss-exp-001: preferGovernEarlyInCoupCycle (spec-169 schedule ref) — zero behavioral change due to hidden-deck visibility` (from prior session, predates spec 170)

The mutable game-data file `data/games/fire-in-the-lake/92-agents.md` is reverted to baseline. No engine source changes were made.

---

## 10. Recommended Next Step

The user has confirmed (in the conversation that triggered this report) that:

- Option A (separate discardZone) is problematic — FITL rules treat played pile as the single accumulated history stack.
- A detailed report should be passed to an external LLM researcher for evaluation.

Once the external researcher's recommendation lands, the campaign loop should resume via the Step 7.7 / After-Campaign-Completes "Suspended Campaign Resume" path. The blocking fix lands first (likely as Spec 171 or 170.1 depending on chosen option); the worktree branch's recorded baseline is preserved; the `STATE-EVOLVED` stale-baseline-recovery path in Phase 0 of `improve-loop` re-baselines at tier 15 against the new engine state.

In the meantime, the campaign is HALTED. The squash-merge of the worktree branch into main is expected to be a degenerate-flow termination (no accepted experiments; only infrastructure/lesson promotions); see the `improve-loop` skill's "After Campaign Completes — Degenerate campaign" section for the cleanup procedure.

---

## 11. Acknowledgements / Caveats For The External Reviewer

- I (Claude Opus) wrote this report as part of the `/improve-loop` skill's Step 7.7 architectural-gap halt. The conversation thread that produced it is part of the project's session memory but is not included; this report is intended to stand alone.
- All file paths, line numbers, and code excerpts in this report were verified against the worktree's `dd108b75d` (main HEAD) snapshot. Line numbers may drift slightly if the engine source has been edited since.
- The trace evidence in §4 (138/138 partial.lowerBound = 2) is reproducible via the recipe in §8. The aggregator one-liner is in §4 ABOVE the per-seed table; copy it into Node and point it at the saved traces directory.
- I am NOT recommending one specific option in §7 — the user explicitly asked for "issues found, possible options, and all necessary context" with the external researcher making the recommendation. My biases: I find Option C most aesthetically clean and Option D most ontologically honest, but I do not have visibility into other not-yet-landed games whose visibility semantics might be affected by Option D's broader engine semantic change.
- One area I did NOT fully explore: whether the `omniscient` observer policy (reserved per spec 170 §13) has any pre-existing design constraints that would interact with the chosen fix. The external researcher should consider this before recommending.
