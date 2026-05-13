# FITL ARVN Spec-169 Partial-Visibility Gap

**Date**: 2026-05-13
**Campaign**: fitl-arvn-agent-evolution
**Trigger**: exp-001 (preferGovernEarlyInCoupCycle, spec-169 demonstration consideration applied to arvn-evolved)
**Outcome**: ZERO behavioral change — `compositeScore=-3.4`, `wins=4/15`, `avgMargin=-6.0667` (identical to baseline byte-for-byte across all 15 deterministic seeds)
**Prior reports**: `reports/agent-cross-phase-projection-gap-2026-05-12.md` (the gap report spec 169 was authored to close); `reports/agent-cross-phase-proposal.md` (external deep-research proposal).
**Predecessor spec**: `archive/specs/169-phase-boundary-and-schedule-refs.md` — closes Layer 1 (phase/schedule identity & distance refs); leaves Layers 2–4 deferred, plus partial-visibility observer policy reserved in §11 open question #2.
**Follow-up spec commissioned**: `specs/170-partial-visibility-observer-policy.md` — adopts §6's Option A (`observerPolicy: topNVisible`). Authored 2026-05-13 in response to this report. The campaign loop is halted pending spec 170 implementation.

---

## 1. Executive summary

Spec 169 shipped the `phase.*` and `schedule.*` ref families with a binary observer-visibility model: a deck's draw zone is either `visibility: public` (schedule distance ref returns `ready` with a numeric distance) or anything else (returns `unavailable: hiddenDeck`). FITL's main event deck (`zone id: deck`, `visibility: hidden`) is fully covered by the latter branch, so every `schedule.distance.toBoundary.coupEntry.cards` lookup at every ARVN main-phase decision returns `unavailable: hiddenDeck`. With `scheduleFallback: onUnavailable: noContribution`, the spec's recommended fallback for FITL, the consideration zeros out across every candidate — the argmax is invariant.

The deferred capability is **partial-visibility observer policy**: FITL exposes drawn cards face-up (the "played" / "leader" / "lookahead" slots) while keeping the underlying deck composition private. This is a partial-visibility surface, not a fully-public surface — but spec 169's observer code treats anything-not-public as fully-hidden. The `topNVisible` observer-policy enum entry from spec 169 §11 open question #2 is the canonical extension hook the implementation needs.

Until partial-visibility lands, **the FITL ARVN campaign cannot benefit from spec 169's schedule refs at all** — the agent surface is structurally identical to pre-spec-169 capabilities. Lessons-global lines 132 ("preferControlPopGain dead at main-phase scope") and 133 ("preferGovernWeighted=1000 load-bearing because preview cannot project across phases") were confirmed NOT stale by exp-001.

This report scopes the gap so a follow-up spec (Layer 1.5 — partial-visibility observer policy) can be commissioned. Layers 2 (candidate-relative latent value) and 3 (scoped horizon preview probe) remain deferred per spec 169 §13 and are independent of this report.

## 2. Empirical evidence

### 2.1 exp-001 design

Added `preferGovernEarlyInCoupCycle` to `arvn-evolved.use.considerations` by lifting the spec-169 demonstration consideration verbatim from `data/games/fire-in-the-lake/sandbox-profiles/169-demonstration.md` into the production library + active profile:

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
```

Game data declaration is already in place: `data/games/fire-in-the-lake/30-rules-actions.md:18-26` declares `phaseBoundaries: - id: coupEntry, kind: phaseEntry, phaseId: coupVictory, schedule: { kind: cardDraw, deckId: fitl-events-initial-card-pack, cardSelector: { tags: [coup] } }`.

### 2.2 exp-001 result

Harness output at tier 15 (seeds 1000–1014):

| Metric | Baseline | exp-001 | Δ |
|---|---|---|---|
| `compositeScore` | -3.4 | -3.4 | 0 |
| `wins` | 4 / 15 | 4 / 15 | 0 |
| `avgMargin` | -6.0667 | -6.0667 | 0 |
| `winRate` | 0.2667 | 0.2667 | 0 |
| `completed` | 15 | 15 | 0 |
| `truncated` | 0 | 0 | 0 |
| `errors` | 0 | 0 | 0 |

Lines delta: +11 (consideration definition + use-list inclusion). NEAR_MISS status (within NOISE_TOLERANCE of best, lines_delta > 0, no simplification). Result stashed at `stash@{0}` for combine-strategy retention. Reproducible: deterministic fixed seeds, regression gate passed (including the `schedule-ref-consideration-trace.test.ts` golden which itself pins `scheduleFallbackFired: { kind: 'noContribution' }`).

### 2.3 Why exp-001 is dispositive (not just one trial)

- **Determinism**: tier 15 uses 15 fixed seeds. Byte-identical outputs across all metrics at this seed count is not noise; it is invariance.
- **Mechanism is known and pre-validated**: spec 169's own §8.2 golden-trace test (`phase-boundary-fitl-coup-distance.test.ts`) pins exactly this `unavailable: hiddenDeck` resolution for FITL at five game positions. The exp-001 result is the per-game integration consequence of the test-pinned per-position behavior.
- **No partial-signal escape hatch**: `scheduleFallback: onUnavailable: { constant: N }` would substitute a constant value, but a constant is information-free (it does not vary with game state); using it is mechanically equivalent to a static `preferGovernWeighted` re-tuning, which the campaign has already explored exhaustively (see lessons-global line 133).

## 3. The gap — source-code citations

### 3.1 The observer-policy decision is in the runtime resolver, not in DSL

`packages/engine/src/agents/policy-runtime.ts:296-329` — `resolveBoundaryCardDistance`:

```ts
const deck = (def.eventDecks ?? []).find((entry) => entry.id === cardDrawState.deckId);
const drawZoneVisibility = def.zones.find((zone) => String(zone.id) === deck?.drawZone)?.visibility;
if (drawZoneVisibility !== 'public') {
  return { kind: 'unavailable', reason: 'hiddenDeck' };
}
```

The check is a single point at line 312-313. The branching is binary: `'public'` ⇒ proceed; anything else (including `'hidden'`) ⇒ unavailable. Per `packages/engine/src/agents/policy-runtime.ts:85`, the `hiddenDeck` reason is the only `unavailable` branch related to deck visibility — there is no `topNVisible` / `lookaheadVisible` / `partialDeck` reason or check.

### 3.2 No observer-policy enum on the boundary declaration

Grep across `packages/engine/src/` confirms zero callers of `topNVisible`, `partialVisib`, or `observerPolicy`:

```
$ grep -rln "topNVisible\|partialVisib\|observerPolicy" packages/engine/src/
(no results)
```

The compiler validation surface (`packages/engine/src/cnl/compile-agents.ts:144,220,2144-2213` for `candidateParam`; analogous insertion point for `scheduleDistance` introduced by spec 169) has no parsing for an observer-policy field on `phaseBoundaries[].schedule`.

### 3.3 Spec 169 acknowledges the gap explicitly

`archive/specs/169-phase-boundary-and-schedule-refs.md`:

- §4.6 (Observer alignment): "FITL event deck order remains hidden in the live GameSpec — drawn cards and the lookahead slot are face-up, but `deck:none` is still `visibility: hidden`. Under the Phase 0-4 resolver contract, `schedule.distance.toBoundary.coupEntry.cards` therefore resolves `unavailable` with reason `hiddenDeck` for ordinary player agents."
- §11 open question #2: "**Boundary visibility for partially-revealed decks.** FITL's event deck is fully revealed (drawn cards stay face-up); other games may have decks where only the top N cards are visible. Phase 0 ships only fully-observable-deck support; partially-observable observability adds a `schedule.observerPolicy` enum entry (`topNVisible`) reserved for a follow-up."
- §13 out of scope: "**Per-observer schedule policies beyond `observerView` default.** `omniscient` and `topNVisible` are reserved for follow-up extensions."

The spec author explicitly deferred this; the post-spec-169 campaign run is the first work that demonstrates the deferral blocks the spec's main intended use case (informing the ARVN campaign).

### 3.4 FITL's authoring side is already partial-visibility-shaped

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

`data/games/fire-in-the-lake/30-rules-actions.md` — the turnFlow's `cardLifecycle` maps drawn cards into face-up slots (`played:none`, `lookahead:none`, `leader:none`). These slots have `visibility: public` (verified separately in `10-vocabulary.md`). FITL agents already observe drawn cards in trace, action enumeration, and event scoring; the partial-visibility property is real and load-bearing for FITL gameplay.

What is missing is a generic engine-side bridge that lets a `phaseBoundaries[].schedule.observerPolicy` declaration tell the resolver: "this deck's composition is hidden, but the next N cards are observable via slot Z, so compute the distance over the visible prefix and surface `unavailable: behindHiddenPrefix` only when the boundary's triggering card is past the observable horizon."

## 4. Ticket archaeology

- Spec 169 PHASCHREF-001..007 (archived 2026-05-13) implemented Phases 0–5 as scoped. None included partial-visibility support; the deferral was explicit and consistent across all seven tickets.
- `reports/agent-cross-phase-proposal.md` §3 (external proposal) does not call out partial visibility either — the proposal assumes either fully-observable decks or omniscient resolution; the lookahead-slot semantics of FITL are FITL-specific and were not surveyed.
- `reports/agent-cross-phase-projection-gap-2026-05-12.md` §4.3 "Option C — Phase-cycle awareness refs" (the option spec 169 implemented) lists `turn.cardsUntilNextPhase.<phaseId>` as the canonical example. The author noted "FITL's lookahead slot" only in §4.2 of the report (Option B's discussion of discounting); §4.3's discussion assumes a known card distance without addressing how the agent observes it.
- No archived ticket or spec proposes the partial-visibility extension. The follow-up is unscheduled.

## 5. Adjacent concerns surfaced during the audit

These are flagged but NOT primary; they merit investigation only if a follow-up spec touches the observer-policy surface.

### 5.1 Phase identity refs are similarly toothless under the current resolver for FITL

`phase.current.id` and `phase.next.id` are state-local and always ready (per spec 169 §4.2). For FITL's `turnStructure.phases: [main, coupVictory, coupResources, coupSupport, coupRedeploy, coupCommitment, coupReset, ...]`:

- `phase.current.id` is `main` for every ARVN action-selection decision (Govern is a main-phase-only action).
- `phase.next.id` is structurally `coupVictory` from `main` (the next entry in the sequence array).

Both refs are **time-invariant within a single decision context**. A consideration that conditions on `phase.current.id == main` is structurally identical to a consideration without that condition (for actions tagged main-phase-only). No new strategic signal is unlocked by phase identity refs alone in FITL — they only become useful in combination with the schedule distance (gated by the partial-visibility gap).

This is not a bug; it is a consequence of FITL's specific turn structure interacting with spec 169's structural-next semantics. Other games with branching turn flows might find `phase.next.id` immediately useful. But the FITL ARVN campaign cannot rely on it as a value driver.

### 5.2 `schedule.nextBoundary.id` is also unavailable in FITL

Per spec 169 §4.2: "`schedule.nextBoundary.id` is `ready` if any boundary is finite, `unavailable` if none." With only one declared boundary (`coupEntry`) and its distance unavailable, `schedule.nextBoundary.id` is unavailable for FITL agents. This is the documented consequence and not a separate gap, but it does mean spec 169's identity surface is effectively offline for FITL until partial-visibility lands.

### 5.3 Cookbook coverage is incomplete

`docs/agent-dsl-cookbook.md` has no section documenting the `phase.*` or `schedule.*` ref families, the `scheduleFallback` contract, or the visibility constraints under which schedule refs become `unavailable`. Operators authoring against the cookbook would not learn that schedule refs are useless on FITL without inspecting the demonstration sandbox profile or reading spec 169 §4.6 directly. This is a documentation gap, not an architectural gap — `/improve-loop` skill conventions classify it under "DSL gap authorable into existing surface" only insofar as the cookbook needs an update; it cannot fix the partial-visibility limitation.

(Per user directive, documentation-only gaps are NOT what was asked to be reported. Flagging here for traceability only.)

## 6. Proposed fix — partial-visibility observer policy

### 6.1 Three implementation shapes

**Option A — `observerPolicy: topNVisible` on boundary schedule** (spec 169 §11 #2's canonical shape)

```yaml
phaseBoundaries:
  - id: coupEntry
    kind: phaseEntry
    phaseId: coupVictory
    schedule:
      kind: cardDraw
      deckId: fitl-events-initial-card-pack
      cardSelector: { tags: [coup] }
      observerPolicy:
        kind: topNVisible
        n: 1                # FITL's lookahead slot exposes 1 card
        visibleSlot: leader:none
        hiddenDistanceStatus: unavailable    # or { kind: partial, status: behindHiddenPrefix }
```

The resolver inspects the visible slot (a `zone.id` with `visibility: public`) for the next N cards' identities; if the triggering card is in the visible prefix, returns `ready` with the prefix-based distance; otherwise returns `unavailable: behindHiddenPrefix` (a new status reason). Profile authors declare a fallback as today.

**Foundations alignment**:
- #4 Observer Visibility: the policy is declarative and observer-safe (no peeking past the visible slot).
- #5 One Rules Protocol: the resolver inspects the same kernel state agents observe.
- #20 Preview Signal Integrity: the new `behindHiddenPrefix` status is parallel to `hiddenDeck` — explicit, trace-visible, non-coercive.

**Engine touch surface**:
- `packages/engine/src/kernel/types-core.ts` — add `ObserverPolicy` discriminated union (`topNVisible` | `omniscient` | `observerView` default).
- `packages/engine/src/cnl/compile-agents.ts` — extend boundary validator to accept and type-check the new field, including zone-ref validation (slot id must resolve to a `visibility: public` zone).
- `packages/engine/src/agents/policy-runtime.ts:296-329` — extend `resolveBoundaryCardDistance` to take a different branch when `boundary.definition.schedule?.observerPolicy?.kind === 'topNVisible'`: inspect `state.zones.get(visibleSlot).contents[0..n-1]` (or analogous traversal), evaluate `cardSelector` against the visible prefix, return ready if found, return new `unavailable: behindHiddenPrefix` reason otherwise.
- `packages/engine/src/kernel/gamedef-runtime.ts:84-95` — `forkGameDefRuntimeForRun` extension if a per-run partial-index is desired (likely not needed; the visible-slot traversal is O(n) for small n).
- `packages/engine-wasm/policy-vm/src/lib.rs` — Phase 4 parity: the WASM bytecode opcodes must support the new partial-visibility branch.
- `data/games/fire-in-the-lake/30-rules-actions.md` — author `observerPolicy: { kind: topNVisible, n: 1, visibleSlot: <FITL's lookahead slot id> }` on the `coupEntry` boundary.

**Pros**: directly addresses the spec 169 §11 #2 deferral. Bounded O(n) per ref read where n is small (FITL: 1). Trace-stable (new status reason is the only new surface). Game-agnostic — works for any deck with a public visible-prefix mechanism.

**Cons**: needs WASM port to keep `policy-bytecode-equivalence` passing. Requires partial-visibility resolver code paths that did not exist in spec 169's Phase 2 implementation. Authoring requires correct identification of FITL's lookahead-slot zone id (likely `leader:none` or `lookahead:none` — must be verified against `30-rules-actions.md` cardLifecycle).

**Option B — `cardSelector` operates over a configurable composite zone**

Instead of adding a new observer-policy field, change `cardSelector` semantics so it can target either the deck OR a sequence of public slots:

```yaml
cardSelector:
  tags: [coup]
  observableFrom:
    - leader:none      # current top-of-deck face-up
    - lookahead:none   # next face-up
```

The resolver computes distance by scanning the listed slots in declaration order, returning `ready` if a match is found and `unavailable: noTriggeringCardObserved` otherwise.

**Pros**: smaller declarative surface — no new enum. Reuses existing `cardSelector` plumbing.

**Cons**: muddles deck/slot semantics in `cardSelector` (currently a deck-internal predicate). Operators may find this confusing. Less generic — assumes the visible portion is named slot ids; doesn't directly support "top N cards of a partially-revealed deck" without enumerating slot ids.

**Option C — Generic visible-prefix index in `GameDefRuntime`**

Maintain a per-deck index of currently-visible cards (across drawn/played/lookahead slots) in `GameDefRuntime.deckVisibility[deckId]`. Schedule resolution reads this index. The index is built at compile time from each deck's declared composition + lifecycle and updated O(1) by `drawFromDeck` / `discardCard` effect handlers.

**Pros**: most general — supports any partial-visibility shape any game declares, not just card-draw decks with public face-up slots. Foundation #5 friendly (the index is the canonical observable substrate).

**Cons**: substantially more compiler infrastructure. Requires every deck/lifecycle declaration to expose what's visible at each lifecycle stage, which is mostly true today but not always (some lifecycle stages may be partially-hidden in some games).

### 6.2 Recommendation

**Option A** is the most direct realization of spec 169 §11 #2's intent. It is bounded, additive, declarative, and game-agnostic. Option B is tempting for surface economy but pays cost in cardSelector semantics. Option C is correct in the long run but is a Layer-2 architectural commitment that should not block a fast Layer-1.5 fix.

Implementation order:
1. **Phase 0**: declare the `ObserverPolicy` type, the `topNVisible` enum entry, and the compiler validation for the new field. Architectural-invariant tests for boundary validation (parallel to spec 169 §8.1).
2. **Phase 1**: runtime resolver branch for `topNVisible`, with golden-trace tests against FITL's actual lookahead-slot configuration. The test should pin both `ready` (when a coup card is in the visible slot) and `unavailable: behindHiddenPrefix` (when the visible slot holds a non-coup card).
3. **Phase 2**: WASM opcode parity (`policy-bytecode-equivalence.test.ts` extension).
4. **Phase 3**: FITL data — author the `observerPolicy` field on the `coupEntry` boundary in `30-rules-actions.md`. Cookbook update for the `phase.*` and `schedule.*` families including the observer-policy variants.
5. **Phase 4**: rerun the spec-169 demonstration profile (`sandbox-profiles/169-demonstration.md`) and confirm at least one game position now returns `ready` for `schedule.distance.toBoundary.coupEntry.cards` — the post-Phase-3 spec-169 demonstration becomes a genuinely informative trace, not a fallback-only proof.
6. **Phase 5 (campaign deliverable, not spec)**: re-run `fitl-arvn-agent-evolution` exp-001 (or equivalent) against the post-fix baseline to measure whether timing-aware Govern boosting moves the metric.

### 6.3 Out of scope for the proposed follow-up spec

- Layer 2 (candidate-effect introspection, control-rule abstraction) — still deferred per spec 169 §13.
- Layer 3 (scoped horizon preview probe) — still deferred per spec 169 §13.
- `omniscient` observer policy — separate concern; partial-visibility is the FITL-blocking one.
- Schedule kinds beyond `cardDraw` — `turnCount`, `condition` are still reserved.

## 7. Foundations alignment matrix (for the proposed Option A)

| Foundation | Compliance | Notes |
|---|---|---|
| #1 Engine Agnosticism | ✅ | `ObserverPolicy.topNVisible` is a generic predicate (visible-slot id, count); no game-specific logic. |
| #4 Observer Visibility | ✅ | Resolver inspects only zones with `visibility: public`. No information leak. |
| #5 One Rules Protocol | ✅ | The same resolver path serves agents, sim, and WASM (Phase 2 of the follow-up). |
| #7 Specs Are Data | ✅ | Observer policy declared in YAML; no callbacks. |
| #8 Determinism | ✅ | Visible-slot read is a pure function of `(GameState, observerView)`. |
| #10 Bounded Computation | ✅ | O(n) per ref read; n is bounded by spec-author declaration. |
| #12 Compiler-Kernel Validation | ✅ | Compile-time validation of slot id; runtime evaluates state-dependent predicate. |
| #13 Artifact Identity | ✅ | Observer policy is part of GameDef hash. |
| #15 Architectural Completeness | ✅ | Closes the spec 169 §11 #2 deferral; eliminates the silent-unavailability gap for FITL. |
| #16 Testing as Proof | ✅ | Every new status reason and validation rule gets a dedicated test. |
| #17 Strongly Typed Domain Identifiers | ✅ | `ObserverPolicy` is a tagged union. |
| #20 Preview Signal Integrity | ✅ | New status reason `behindHiddenPrefix` is parallel to `hiddenDeck` — explicit, trace-visible, non-coercive. |

## 8. Decision points for the user

1. **Spec or campaign-workaround**: does the user want a follow-up spec (Layer 1.5 — partial-visibility observer policy) commissioned now, or should the `fitl-arvn-agent-evolution` campaign proceed by exploring other hypotheses (e.g., un-promoted action-type signals like `preferAdvise`, parameter sweeps on existing considerations, valueCapabilityGain re-test at the post-PR-257 baseline) and revisit schedule refs after Layers 2 land?
2. **Option preference**: if a spec is commissioned, prefer Option A (recommended) / B / C / different shape entirely.
3. **Cookbook update**: does the user want a separate `infra:` commit on the campaign branch documenting `phase.*` and `schedule.*` in `docs/agent-dsl-cookbook.md`? This is documentation-only and authorable in current surface (not the architectural gap the user asked to be reported), but the cookbook gap is real and operators authoring future campaigns will hit it.

The campaign loop is paused at `arch-gap-001` per Step 7.7. The exp-001 YAML+fixture is stashed at `stash@{0}` for combine-strategy retention or post-fix re-test. The `infra:` commit decoupling `schedule-ref-consideration-trace.test.ts` from arvn-evolved's exact list (commit `40a8dca6`) lands on the campaign branch regardless of campaign outcome — it improves test resilience to profile evolution and is independent of this report's recommendations.
