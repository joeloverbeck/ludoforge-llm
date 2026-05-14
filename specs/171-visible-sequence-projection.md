# Spec 171 — Visible Sequence Projection for Schedule Observer Policies

**Status**: PROPOSED
**Priority**: High — unblocks the `fitl-arvn-agent-evolution` campaign, which is HALTED per `reports/fitl-arvn-spec-170-discard-zone-coverage-gap-2026-05-14.md`. Spec 170's `topNVisible` observer policy is silently non-functional under the production FITL configuration: 138/138 ARVN Govern candidates that read `schedule.distance.toBoundary.coupEntry.cards` resolved `partial.lowerBound = 2`, zero `ready` resolutions, across 15 deterministic seeds.
**Complexity**: M — single observer-policy schema reshape (`zones` → `sources` with required per-source `take`), parallel TS + WASM resolver rewrite, breaking migration of all owned artifacts. No new ref family, no new resolution status.
**Date**: 2026-05-14
**Predecessors**: Spec 169 (phase boundary & schedule distance refs), Spec 170 (partial-visibility observer policy — this spec corrects spec 170 §4.1's `visiblePrefix` schema and reverses §12 open question #2).
**Dependencies**: Spec 170 (closed, archived).
**Trigger reports**:
- `reports/fitl-arvn-spec-170-discard-zone-coverage-gap-2026-05-14.md` — internal gap report from the `fitl-arvn-agent-evolution` improve-loop campaign. Establishes the empirical evidence (138/138 partial coverage) and five implementation options A–E.
- `reports/spec-171-proposal.md` — external LLM review (ChatGPT-Pro deep research, no codebase access) of the gap report. Recommended "Option C+": rename `zones` → `sources` with required per-source `take`. See §11 for the per-recommendation reassessment.

---

## 1. Goal

Replace spec 170's `phaseBoundaries[].schedule.observerPolicy.topNVisible.visiblePrefix.zones[]` + aggregate `maxItems` schema with a **visible-sequence-source** schema: an ordered list of `sources`, each carrying a **required per-source `take`** cap.

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
          sources:
            - id: played:none
              take: 1
            - id: lookahead:none
              take: 1
```

The resolver composes a bounded **visible sequence** by taking at most `take` cards from the top of each source zone, in declaration order, then matches the boundary's `cardSelector` against that composed sequence. Cards in a source zone beyond its `take` are **public-but-excluded-by-policy** — they are not hidden, and they do not participate in the forward schedule horizon.

The bound on resolution cost is `sum(source.take)`, statically known at compile time (Foundation #10). There is no aggregate `maxItems` field: a per-source `take` cap is the bound.

After this spec lands, the FITL `coupEntry` boundary observes exactly `[played:none top, lookahead:none top]` — the current driving card and the next-to-be-played card — regardless of how many discards have accumulated on `played:none`. When `lookahead:none` exposes a Coup card, the ref resolves `ready: 1` instead of the spurious `partial.lowerBound: 2`.

The three statuses from spec 170 are unchanged:
- `ready` — a matching card was found in the composed visible sequence; distance is exact.
- `partial.lowerBound` — the composed visible sequence was exhausted without a match; a hidden tail remains; the lower-bound distance is the composed sequence length.
- `unavailable: hiddenDeck` — the boundary declares no `observerPolicy` (spec 169 default behavior, preserved exactly).

## 2. Context (verified against codebase)

### 2.1 The spec 170 resolver scans entire zones, not bounded sources

`packages/engine/src/agents/policy-runtime.ts:349-383` — `resolveVisiblePrefixBoundaryCardDistance`:

```ts
let scanned = 0;
const maxItems = schedule.observerPolicy!.visiblePrefix.maxItems;
for (const zoneRef of schedule.observerPolicy!.visiblePrefix.zones) {
  if (scanned >= maxItems) break;
  const slotCards = readPublicZoneCards(def, state, zoneRef.id);
  for (const card of slotCards) {            // iterates ALL cards in the zone
    if (scanned >= maxItems) break;
    if (matchesCardSelector(def, card, schedule.cardSelector)) {
      return { kind: 'ready', value: scanned, /* ... */ };
    }
    scanned += 1;
  }
}
return { kind: 'partial', partialKind: 'lowerBound', lowerBound: scanned, /* ... */ };
```

The inner `for (const card of slotCards)` consumes the aggregate `maxItems` budget against every card in the first zone before the loop ever advances to the second zone.

### 2.2 FITL's played slot is also its discard pile

All four FITL event-deck files (`data/games/fire-in-the-lake/41-events/001-032.md`, `033-064.md`, `065-096.md`, `097-130.md`) declare:

```yaml
eventDecks:
  - id: fitl-events-initial-card-pack
    drawZone: deck:none
    discardZone: played:none
```

`packages/engine/src/kernel/turn-flow-lifecycle.ts:69-82` (`resolveDiscardZone`) returns `played:none` as the discard zone for this deck. `applyTurnFlowCardBoundary` (`turn-flow-lifecycle.ts:430-441`) therefore hits the accumulating branch: when `slots.discard === slots.played` and the played top is not a coup-handoff, the popped card is left on `played:none` and the promoted card prepends above it. After N non-coup turns, `played:none` holds `[active, discard₁, discard₂, …]`.

This is rules-faithful. FITL rule 2.2: *"All played cards and the number of cards in the draw deck are open to inspection."* Rule 2.3.8: *"the Pivotal Event stays in the played card pile, as normal."* `played:none` is the single accumulated public play history. Splitting it (gap report Option A) conflicts with the rules.

### 2.3 The aggregate `maxItems` trap

With `played:none` accumulating and `visiblePrefix.zones: [played:none, lookahead:none]`, `maxItems: 2`, the resolver spends both budget units on `played:none` entries (active card + first accumulated discard) and never reads `lookahead:none`. Empirically: 138/138 `partial.lowerBound = 2`, zero `ready`, across 15 seeds × 426 ARVN action-selections (`reports/fitl-arvn-spec-170-discard-zone-coverage-gap-2026-05-14.md` §4). Per FITL rules 2.3.7 and 2.3.9 (Monsoon Season), a Coup card in `lookahead` is a regularly recurring, gameplay-altering state — expected roughly 1 turn in 11.

This **reverses spec 170 §12 open question #2**, which deferred per-zone caps with the rationale *"Aggregate is simpler and sufficient for FITL (no zone has more than 1 card in practice)."* The premise — that `played:none` holds at most one card — is false for the production lifecycle. Per-source `take` is required.

### 2.4 The spec 170 integration test never exercised the production state

`packages/engine/test/integration/partial-visibility-fitl-coup-distance.test.ts:41-53` — `withVisibleCards` replaces `state.zones['played:none']` with exactly one synthetic card token before resolving. The accumulating production lifecycle is never driven. The test passes; the production configuration is broken. Foundation #16: an architectural property must be proven against the real execution path, not an artificial fixture.

### 2.5 Existing implementation surface (all owned, all migrated under Foundation #14)

- **Types**: `packages/engine/src/kernel/types-core.ts:206-214` (`ObserverPolicy`, `ObserverVisiblePrefix`), `:222` (`observerPolicy` on `ScheduleKindDef`), `:1857-1874` (`PolicyScheduleInputRefTrace` ready/partial variants), `:383-395` (`AgentScheduleFallback.onPartial`). `packages/engine/src/cnl/game-spec-doc.ts:169-185` (`GameSpecObserverPolicyDef`, `GameSpecObserverVisiblePrefixDef`).
- **Zod schemas**: `packages/engine/src/kernel/schemas-core.ts:218-228` (`ObserverPolicySchema`, `.strict()`), `:2183-2191` (trace), `:1144-1151` (fallback).
- **Compiler validation**: `packages/engine/src/cnl/compile-phase-boundaries.ts:198-319` (`validateObserverPolicy`). Diagnostic codes in `compiler-diagnostic-codes.ts:304-319`. `packages/engine/src/cnl/compile-agents.ts:2239-2252` (`SCHEDULE_FALLBACK_PARTIAL_REQUIRED` — keys only on whether the boundary is `topNVisible`; does NOT introspect the prefix shape, so the rename requires type updates only, no logic change).
- **TS resolver**: `packages/engine/src/agents/policy-runtime.ts:349-391`.
- **WASM seam**: `packages/engine/src/agents/policy-wasm-phase-schedule-encoding.ts:142-264` (host-side `resolveVisiblePrefixBoundaryCardDistance` — a parallel copy of the TS resolver), `policy-wasm-runtime.ts:778-1022` (fallback application).
- **Fallback evaluator**: `packages/engine/src/agents/policy-evaluation-core.ts:88-99,711-759`, `microturn-option-eval.ts:41,109-159`.
- **JSON schema artifacts**: `packages/engine/schemas/GameDef.schema.json`, `Trace.schema.json` (re-emitted by `pnpm turbo schema:artifacts`).
- **FITL data**: `data/games/fire-in-the-lake/30-rules-actions.md:18-33` (`coupEntry` boundary).
- **Cookbook**: `docs/agent-dsl-cookbook.md:315-359` ("Visible Prefix Declaration", "FITL Coup Timing Example").
- **Tests**: `partial-visibility-compile-validation.test.ts`, `partial-visibility-determinism.test.ts`, `partial-visibility-resolver-correctness.test.ts`, `partial-visibility-fallback-routing.test.ts`, `partial-visibility-no-leak.test.ts`, `partial-visibility-fitl-coup-distance.test.ts`, `schedule-ref-consideration-trace-topNVisible.test.ts`, `policy-bytecode-equivalence-partial-visibility.test.ts`.

The `ObserverPolicySchema` is `.strict()`, so a migrated GameSpec still carrying the legacy `zones`/`maxItems` keys fails zod validation cleanly (unknown key / missing required `sources`). No compatibility shim is needed (Foundation #14).

## 3. Non-goals

- **No `order` field per source.** The external proposal suggested `order: topFirst`. Rejected: the compiler already rejects `ordering: set` zones (`OBSERVER_POLICY_INVALID_ZONE_KIND`), and the resolver always reads from index 0 outward in the zone's declared `ordering`. A separate `order` field is redundant with the zone declaration and would let a spec contradict it. No current or near-term game motivates a non-top read.
- **No `role` field per source.** The external proposal suggested `role: current | next` as diagnostic metadata. Rejected: it has zero effect on resolution, legality, or transitions. The boundary id, source declaration index, and `zoneId` already identify each source in the trace. This is consistent with spec 170 §11, which rejected separately recording `observerScope`/`observationSource` for the same reason.
- **No aggregate `maxItems` cap.** Removed entirely. `sum(source.take)` is the resolution bound, statically known. Retaining a redundant aggregate cap that admits `maxItems < sum(take)` would re-introduce the exact starvation bug class this spec exists to eliminate (Foundation #15).
- **No `OBSERVER_VISIBLE_SEQUENCE_SOURCE_UNREACHED` runtime advisory.** The external proposal suggested a runtime advisory for configs where an earlier source starves a later one. With `maxItems` removed there is no aggregate budget, so no source can be starved by another — each source's contribution is independently bounded by its own `take`. The advisory has nothing to fire on.
- **No `omniscient` observer policy.** `observerPolicy.kind: omniscient` / `observerView` remain reserved and rejected via the existing `OBSERVER_POLICY_DEFERRED_KIND` diagnostic. No behavior change.
- **No new ref families or resolution statuses.** `ready`, `partial.lowerBound`, and `unavailable: hiddenDeck` from spec 170 are unchanged. Only the `visiblePrefix` schema and the composed-sequence resolution mechanics change.
- **No `observableSequences[]` top-level primitive.** Still deferred per spec 170 §11 — no second consumer outside schedule resolution exists yet.
- **No `exposedFacets` / `hiddenTail` enum.** Still deferred per spec 170 §11.
- **No schedule kinds beyond `cardDraw`.** `turnCount`, `condition` remain reserved.
- **No ARVN profile changes.** Whether `arvn-evolved` adopts the (now-functional) `preferGovernEarlyInCoupCycle` consideration is a `fitl-arvn-agent-evolution` campaign decision, not a spec deliverable.

## 4. Architecture

### 4.1 GameSpecDoc declaration: `visiblePrefix.sources`

`phaseBoundaries[].schedule.observerPolicy.topNVisible.visiblePrefix` carries an ordered, non-empty `sources` list. Each source is `{ id: ZoneId, take: positive integer }`.

```yaml
observerPolicy:
  kind: topNVisible
  visiblePrefix:
    sources:
      # Ordered. Index 0 of the composed sequence is the top of the first source.
      - id: played:none
        take: 1        # only the top (active) card; accumulated discards are excluded
      - id: lookahead:none
        take: 1        # the revealed next card
```

**Field semantics**:

- `observerPolicy.kind`: enum, `topNVisible` only. `omniscient` / `observerView` rejected as deferred.
- `visiblePrefix.sources`: ordered, non-empty list. Order is meaningful — the composed visible sequence concatenates each source's taken cards in declaration order.
- `source.id`: a zone reference. MUST resolve to a declared zone, MUST be `visibility: public`, MUST have deterministic order (`ordering` is `stack` or `queue`, not `set`), MUST NOT equal the deck's `drawZone`, MUST be distinct from every other `source.id` in the list.
- `source.take`: **required** positive integer (≥1). The maximum number of cards taken from the top of this source's public zone contents (index 0 outward in the zone's declared `ordering`). A source contributes `min(take, zoneLength)` cards to the composed sequence at runtime.

The resolution cost bound is `sum(source.take)` — a compile-time constant. Foundation #10 is satisfied without an aggregate cap.

### 4.2 Runtime resolution: composed visible sequence

`resolveVisiblePrefixBoundaryCardDistance` (`policy-runtime.ts:349-383`) is rewritten to compose a bounded visible sequence:

```ts
let distance = 0;
const sourceTrace: { zoneId: string; availablePublic: number; taken: number }[] = [];
for (const source of schedule.observerPolicy!.visiblePrefix.sources) {
  const slotCards = readPublicZoneCards(def, state, source.id);
  const taken = Math.min(source.take, slotCards.length);
  sourceTrace.push({ zoneId: source.id, availablePublic: slotCards.length, taken });
  for (let i = 0; i < taken; i += 1) {
    if (matchesCardSelector(def, slotCards[i]!, schedule.cardSelector)) {
      return {
        kind: 'ready',
        value: distance,
        observerPolicy: { kind: 'topNVisible' },
        visiblePrefixLength: distance + 1,
        visibleSequenceSources: sourceTrace,
      };
    }
    distance += 1;
  }
}
return {
  kind: 'partial',
  partialKind: 'lowerBound',
  lowerBound: distance,
  observerPolicy: { kind: 'topNVisible' },
  visiblePrefixLength: distance,
  visibleSequenceSources: sourceTrace,
};
```

The behavioral change vs. spec 170: each source contributes **at most `take`** cards, independent of zone length. For FITL with `played:none = [active, discard₁, discard₂, …]` and `lookahead:none = [next]`, both `take: 1`, the composed sequence is `[active, next]` — exactly the current driving card and the next card. A Coup in `lookahead:none` resolves `ready: 1`; no Coup in either resolves `partial.lowerBound: 2`.

**Empty-zone semantics** (resolves spec 170 §12 open question #1, now scoped per-source): a source contributes `min(take, zoneLength)` cards. An empty zone contributes 0 cards and 0 to `distance`. Example: `played:none` empty + `lookahead:none` holds one non-coup card, both `take: 1` → composed sequence length 1 → `partial.lowerBound: 1`. This preserves spec 170's "exact distance through visible cards" semantics, scoped per source instead of per aggregate budget.

`readPublicZoneCards(def, state, zoneId)` is unchanged — it returns `state.zones[zoneId]` in zone-declared order after compile-validating public visibility. No observer-profile state is consulted; the compiler has already proven each source zone public.

### 4.3 Trace surface: per-source breakdown

`PolicyScheduleInputRefTrace` (`types-core.ts:1857-1874`) ready and partial variants gain `visibleSequenceSources`:

```ts
readonly visibleSequenceSources: readonly {
  readonly zoneId: string;
  readonly availablePublic: number;   // cards present in the public zone
  readonly taken: number;             // cards contributed to the composed sequence (min(take, availablePublic))
}[];
```

`availablePublic - taken` is the count of **public-but-excluded-by-policy** cards — auditable, and explicitly distinct from hidden cards (Foundation #20). The trace does not record `role`, `order`, `skipReason`, or a separate `observerScope` (the `topNVisible` policy kind identifies the scope; the boundary id identifies the observation source). `visiblePrefixLength` is retained — it equals the composed sequence length scanned.

The `scheduleFallbackFired` trace shape (`policy-evaluation-core.ts:94-99`) and the `onPartial.visiblePrefixExhausted` fallback routing are unchanged — the resolver still emits the same three statuses, so fallback consumers see no contract change.

### 4.4 Observer alignment

Foundation #4: the resolver consults only `visibility: public` zone contents; the compiler validates this per source. No path leaks the hidden deck tail or the `deck:none` ordering.

Foundation #20: `partial.lowerBound` remains a first-class status distinct from `unavailable`. Cards beyond a source's `take` are recorded in `visibleSequenceSources` as public-but-excluded — never silently conflated with hidden information, never silently coerced into a numeric contribution.

## 5. Compiler changes

`packages/engine/src/cnl/compile-phase-boundaries.ts` — `validateObserverPolicy` (`:198-319`) rewritten for the `sources` schema:

- `visiblePrefix.sources` non-empty ordered list. Missing or empty → `OBSERVER_POLICY_EMPTY_VISIBLE_PREFIX` (message updated: `zones` → `sources`).
- Each `source.take` required positive integer:
  - Missing → **new** `OBSERVER_POLICY_MISSING_TAKE`.
  - Present but not a positive integer → **new** `OBSERVER_POLICY_INVALID_TAKE`.
- Each `source.id`: existing per-zone rules, applied to `source.id`, with existing diagnostic codes retained (a source's `id` *is* a zone reference, so the `_ZONE` codes remain accurate):
  - Unresolved → `OBSERVER_POLICY_UNKNOWN_ZONE`.
  - Non-public → `OBSERVER_POLICY_NON_PUBLIC_ZONE`.
  - `ordering: set` → `OBSERVER_POLICY_INVALID_ZONE_KIND`.
  - Equals the deck's `drawZone` → `OBSERVER_POLICY_DRAW_ZONE_IN_PREFIX`.
  - Duplicate `source.id` → `OBSERVER_POLICY_DUPLICATE_ZONE`.
- `OBSERVER_POLICY_INVALID_MAXITEMS` is **removed** — `maxItems` no longer exists.
- `OBSERVER_POLICY_UNKNOWN_KIND` / `OBSERVER_POLICY_DEFERRED_KIND` unchanged.

`packages/engine/src/cnl/compile-agents.ts:2239-2252` — `SCHEDULE_FALLBACK_PARTIAL_REQUIRED` keys only on whether the target boundary is `topNVisible`; it does not introspect the prefix shape. **Logic unchanged**; only the underlying `ObserverPolicy` type reference is updated.

`compiler-diagnostic-codes.ts:304-319` — add `OBSERVER_POLICY_MISSING_TAKE`, `OBSERVER_POLICY_INVALID_TAKE`; remove `OBSERVER_POLICY_INVALID_MAXITEMS`.

The compiler emits zero warnings for boundaries that omit `observerPolicy` — spec 169 default behavior is unchanged.

## 6. Runtime and type changes

`packages/engine/src/kernel/types-core.ts`:
- `ObserverVisiblePrefix` → `{ readonly sources: readonly ObserverVisibleSource[] }` (drop `maxItems`).
- New `ObserverVisibleSource = { readonly id: string; readonly take: number }`.
- `PolicyScheduleInputRefTrace` ready + partial variants gain `visibleSequenceSources` (§4.3).

`packages/engine/src/kernel/schemas-core.ts`:
- `ObserverPolicySchema` — `visiblePrefix.sources` array of `{ id, take }` (`take` positive integer), drop `maxItems`. Keep `.strict()`.
- Trace schema (`:2183-2191`) gains `visibleSequenceSources`.

`packages/engine/src/cnl/game-spec-doc.ts:169-185` — `GameSpecObserverVisiblePrefixDef` → `sources`.

`packages/engine/src/agents/policy-runtime.ts:349-391` — `resolveVisiblePrefixBoundaryCardDistance` rewritten per §4.2; `PhaseScheduleResolution` ready/partial variants gain `visibleSequenceSources`.

`packages/engine/src/agents/policy-wasm-phase-schedule-encoding.ts:142-264` — the host-side parallel resolver copy rewritten identically to the TS resolver. The `[number, number]` encoding seam is unchanged (`ready` value and `partial` lowerBound encode as before). `visibleSequenceSources` is host-side trace metadata; confirm during Phase 2 whether the WASM-path trace emits it or only the TS path does (see §12).

`packages/engine/schemas/` — re-emit `GameDef.schema.json` and `Trace.schema.json` via `pnpm turbo schema:artifacts`.

The fallback evaluator (`policy-evaluation-core.ts`, `microturn-option-eval.ts`, `policy-wasm-runtime.ts`) needs **no logic change** — the three resolution statuses and the `onPartial.visiblePrefixExhausted` routing are unchanged.

## 7. Phases and acceptance criteria

| Phase | Scope | Acceptance | Effort |
|---|---|---|---|
| **0** | Types (`ObserverVisibleSource`, `ObserverVisiblePrefix.sources`, `visibleSequenceSources` on the trace types), zod schemas, `game-spec-doc.ts`, compiler validation rewrite (`validateObserverPolicy`), new/removed diagnostic codes. No runtime resolution change yet. | Architectural-invariant tests pass for: every §5 rejection rule including `OBSERVER_POLICY_MISSING_TAKE` and `OBSERVER_POLICY_INVALID_TAKE`; `SCHEDULE_FALLBACK_PARTIAL_REQUIRED` still raised for `topNVisible`-bearing boundaries; byte-identical compile output for a GameSpec compiled twice with `sources` declared; legacy `zones`/`maxItems` keys rejected by the strict zod schema. | S |
| **1** | TS runtime resolver rewrite (`resolveVisiblePrefixBoundaryCardDistance`, §4.2 composed-sequence semantics); `visibleSequenceSources` trace surface; `PhaseScheduleResolution` extension. | Golden + resolver-correctness tests: match in source 0 → `ready: 0, visiblePrefixLength: 1`; match in source 1 → `ready: 1, visiblePrefixLength: 2`; a source with `take: 1` and 5 cards contributes exactly 1 to `distance`; accumulated non-matching history beneath `take` does not starve a later source → `ready` still reached; empty source 0 + non-matching source 1 → `partial.lowerBound: 1`; all sources empty → `partial.lowerBound: 0`; no-leak test (coup beyond every source's `take` → `partial.lowerBound`, never exact). Replay-determinism test across 20 turn-indexed states. | M |
| **2** | WASM host-side resolver parity rewrite (`policy-wasm-phase-schedule-encoding.ts`). | `policy-bytecode-equivalence-partial-visibility.test.ts` (migrated) passes: WASM and TS paths produce identical score rows for all 15 baseline seeds across `ready` and every `partial.lowerBound` fallback kind. | S |
| **3** | FITL `coupEntry` data migration to the `sources` schema; cookbook rewrite; **new** FITL production-flow regression test. | The new production-flow test drives the real `applyTurnFlowInitialReveal` + `applyTurnFlowCardBoundary` lifecycle until `played:none` accumulates ≥2 cards with a Coup in `lookahead:none`, and asserts `schedule.distance.toBoundary.coupEntry.cards` resolves `ready: 1` (NOT `partial.lowerBound: 2`). Cookbook examples compile and lint-pass. `pnpm turbo build`, `lint`, `typecheck`, `test`, `schema:artifacts` all green. | S |

Phases 0–2 are engine-internal and must land before Phase 3. Phase 3 is the FITL data + documentation + regression-proof deliverable.

## 8. Test plan

Per `.claude/rules/testing.md`, each test file declares its class.

### 8.1 Migrated tests (Foundation #14 — all owned test artifacts updated in the same change)

All eight existing spec-170 test files are migrated to the `sources` schema:
- `partial-visibility-compile-validation.test.ts` — rejection rows updated; `OBSERVER_POLICY_INVALID_MAXITEMS` row removed; `OBSERVER_POLICY_MISSING_TAKE` / `OBSERVER_POLICY_INVALID_TAKE` rows added.
- `partial-visibility-determinism.test.ts` — fixture GameSpec uses `sources`.
- `partial-visibility-resolver-correctness.test.ts` — fixtures use `sources` with explicit `take`; the five status cases re-expressed against composed-sequence semantics.
- `partial-visibility-fallback-routing.test.ts` — fixture boundary uses `sources`; routing assertions unchanged (statuses are stable).
- `partial-visibility-no-leak.test.ts` — fixture uses `sources`.
- `partial-visibility-fitl-coup-distance.test.ts` — the `assert.deepEqual(boundary?.schedule, { … })` literal is updated to the `sources` shape (a schema migration, not a trajectory re-bless). The `withVisibleCards` artificial-state cases are retained as valid one-card-per-zone coverage.
- `schedule-ref-consideration-trace-topNVisible.test.ts` — trace assertions add `visibleSequenceSources`.
- `policy-bytecode-equivalence-partial-visibility.test.ts` — fixture profile/boundary use `sources`.

### 8.2 New tests

- **`partial-visibility-fitl-production-flow.test.ts`** (golden-trace) — the linchpin regression test. Construct a FITL initial state, drive the real `applyTurnFlowInitialReveal` + `applyTurnFlowCardBoundary` lifecycle (no `withVisibleCards`) until `played:none` holds ≥2 cards and `lookahead:none` holds a Coup card, then assert the resolver returns `ready: 1`. This closes the gap between the spec 170 integration test's artificial state and the production accumulating state (§2.4). A second case: drive the lifecycle to a state with no Coup in either visible position and assert `partial.lowerBound: 2` — confirming the partial path still fires correctly when it *should*.
- **`partial-visibility-source-take-cap.test.ts`** (architectural-invariant) — for `sources: [{ id, take: 1 }, …]` against a source zone holding N > 1 cards, assert exactly 1 card contributes to `distance` and `visibleSequenceSources[0]` records `{ availablePublic: N, taken: 1 }`. Proves accumulated public history cannot starve a later source — the property that makes the FITL trap structurally impossible under this schema.

### 8.3 convergence-witness tests

None mandated. The campaign-side effect (whether `arvn-evolved` adopts the unblocked consideration, and what `compositeScore` results) is owned by `fitl-arvn-agent-evolution`, not this spec.

## 9. Foundation alignment

| Foundation | How this spec respects it |
|---|---|
| #1 Engine Agnosticism | `visiblePrefix.sources` is a generic ordered list of `{ public zone id, take cap }`. The kernel knows zone visibility, deck contents, and card-identity predicates — no FITL-specific logic. FITL is a consumer. |
| #2 Evolution-First Design | `observerPolicy` is GameSpecDoc YAML; evolution can author `sources`/`take` on any boundary. |
| #4 Authoritative State and Observer Views | The resolver inspects only `visibility: public` source zones; the compiler enforces this per source. The §8.1 no-leak test proves the hidden tail is never revealed. |
| #8 Determinism | The resolver is a pure function of `(GameState, observerPolicy)`. The composed-sequence scan is an `O(sum(take))` deterministic ordered walk. |
| #10 Bounded Computation | Resolution cost is `sum(source.take)`, a compile-time constant — no aggregate cap needed, no unbounded zone scan. FITL: `O(2)`. |
| #12 Compiler-Kernel Validation Boundary | Source-id resolution, visibility, ordering, draw-zone-overlap, duplicates, and `take` integrality are all compile-validated. The runtime validates only state-dependent card matching. The starvation condition that spec 170 left to runtime is eliminated at the schema level, not pushed to a runtime advisory. |
| #14 No Backwards Compatibility | The `zones`/`maxItems` schema is replaced, not aliased. Every owned artifact — types, zod schemas, JSON schema artifacts, compiler, TS resolver, WASM resolver, FITL data, cookbook, all eight test files — is migrated in the same change. The strict zod schema rejects the legacy shape with no shim. |
| #15 Architectural Completeness | Root cause: the aggregate `maxItems` budget conflated "current card", "accumulated public history", and "future schedule horizon" into one scan. Per-source `take` separates them. Dropping `maxItems` (rather than retaining it as the external proposal suggested) removes the starvation bug *class*, not just the FITL instance. |
| #16 Testing as Proof | The new production-flow test drives the real lifecycle, proving the property against the execution path that the spec 170 test bypassed. Every validation rule, status path, and equivalence claim has a dedicated test. |
| #17 Strongly Typed Domain Identifiers | `ObserverVisibleSource` is a typed record; `source.id` is a zone reference validated at compile time. |
| #20 Preview Signal Integrity | `partial.lowerBound` stays a first-class status distinct from `unavailable`. `visibleSequenceSources` records public-but-excluded cards explicitly — never conflated with hidden information, never silently coerced. |

## 10. Code anchors for implementers

- **Types**: `packages/engine/src/kernel/types-core.ts:206-214` (`ObserverPolicy`, `ObserverVisiblePrefix` → `sources`; add `ObserverVisibleSource`), `:222` (`ScheduleKindDef.observerPolicy`), `:1857-1874` (`PolicyScheduleInputRefTrace` → add `visibleSequenceSources`). `packages/engine/src/cnl/game-spec-doc.ts:169-185` (`GameSpecObserverVisiblePrefixDef` → `sources`).
- **Zod schemas**: `packages/engine/src/kernel/schemas-core.ts:218-228` (`ObserverPolicySchema`), `:2183-2191` (trace schema).
- **Compiler validation**: `packages/engine/src/cnl/compile-phase-boundaries.ts:198-319` (`validateObserverPolicy` rewrite). `packages/engine/src/cnl/compiler-diagnostic-codes.ts:304-319` (add `OBSERVER_POLICY_MISSING_TAKE`, `OBSERVER_POLICY_INVALID_TAKE`; remove `OBSERVER_POLICY_INVALID_MAXITEMS`). `packages/engine/src/cnl/compile-agents.ts:2239-2252` (type reference update only).
- **TS resolver**: `packages/engine/src/agents/policy-runtime.ts:349-391` (`resolveVisiblePrefixBoundaryCardDistance`, `PhaseScheduleResolution`).
- **WASM resolver**: `packages/engine/src/agents/policy-wasm-phase-schedule-encoding.ts:142-264` (host-side parallel copy — rewrite identically).
- **JSON schema artifacts**: `packages/engine/schemas/GameDef.schema.json`, `Trace.schema.json` — re-emit via `pnpm turbo schema:artifacts`.
- **FITL data**: `data/games/fire-in-the-lake/30-rules-actions.md:18-33` (`coupEntry` boundary → `sources` schema). `eventDecks.discardZone: played:none` is UNCHANGED — the played pile stays the accumulated public history; the policy just takes its top card.
- **Cookbook**: `docs/agent-dsl-cookbook.md:315-359` ("Visible Prefix Declaration", "FITL Coup Timing Example") — rewrite for `sources`/`take`, explain the public-but-excluded vs. hidden distinction.
- **Tests**: the eight migrated files (§8.1) and the two new files (§8.2).

## 11. Reassessment of source proposals

This spec was produced by reassessing `reports/spec-171-proposal.md` (ChatGPT-Pro deep research, no codebase access) and `reports/fitl-arvn-spec-170-discard-zone-coverage-gap-2026-05-14.md` (the internal gap report) against the verified codebase. Per-recommendation dispositions:

| Source recommendation | Disposition | Rationale |
|---|---|---|
| Gap-report diagnosis: resolver iterates all cards per zone; FITL `discardZone: played:none`; aggregate `maxItems` consumed on `played:none` | **Adopted** | Verified against `policy-runtime.ts:349-383`, all four `41-events/*.md` files, and `turn-flow-lifecycle.ts:430-441`. The 138/138 evidence is consistent with the code. |
| Reject Option A (split FITL `discardZone`) | **Adopted** | Verified: conflicts with FITL rules 2.2 and 2.3.8 (the played pile is the single accumulated public history; pivotal events stay in it). |
| Reject Option B (reverse `[played, lookahead]` order) | **Adopted** | Semantic rot — "distance 0" would mean "next card" — and does not generalize. |
| Reject Option D (top-of-every-zone universal semantic) | **Adopted** | Too blunt as a universal rule; a future game with a public top-N tableau legitimately needs >1 card per zone in the horizon. Per-source `take` expresses this without forcing the semantic globally. |
| Proposal: rename `visiblePrefix.zones` → `sources` | **Adopted** | The naming is the root fix. `zones` reads as "scan these containers"; `sources` + `take` reads as "compose a bounded visible sequence from named public sources" — which is what the resolver must do. |
| Proposal: required per-source `take` cap | **Adopted** | This is gap-report Option C, which the report itself rated STRONG and generalizing. Per-source `take` makes the FITL starvation trap structurally impossible. |
| Proposal: breaking schema change, no compatibility shim | **Adopted** | Foundation #14. The `.strict()` zod schema rejects the legacy `zones`/`maxItems` shape cleanly; all owned artifacts migrate in the same change. |
| Proposal: per-source `order` field (`order: topFirst`) | **Rejected** | Redundant with the zone's own `ordering` declaration, which the compiler already validates (`OBSERVER_POLICY_INVALID_ZONE_KIND` rejects `ordering: set`). The resolver always reads index-0-outward. An `order` field adds a way for a spec to contradict the zone declaration, with no motivated use case. YAGNI. |
| Proposal: per-source `role` field (`role: current \| next`) | **Rejected** | Pure diagnostic ornamentation — explicitly "not rule logic" in the proposal. The boundary id, source index, and `zoneId` already identify each source in the trace. Consistent with spec 170 §11, which rejected separately recording `observerScope`/`observationSource` for the same reason. |
| Proposal: retain aggregate `maxItems` (with `maxItems <= sum(take)`) | **Rejected (corrected)** | Dropped entirely. `sum(source.take)` is the resolution bound, statically known — `maxItems` is always redundant (the proposal admits it always equals `sum(take)` for FITL). Retaining a cap that *admits* `maxItems < sum(take)` re-introduces the starvation bug class in a new form, violating Foundation #15. |
| Proposal: `OBSERVER_VISIBLE_SEQUENCE_SOURCE_UNREACHED` runtime advisory | **Rejected** | With `maxItems` removed there is no aggregate budget, so no source can starve another — each source's contribution is bounded only by its own `take`. The advisory has no condition to fire on. Any residual arithmetic constraint would be compile-time per Foundation #12, not a runtime advisory. |
| Proposal: trace per-source `availablePublic` / `taken` / `skippedPublic` / `skipReason` | **Adopted (with adjustment)** | `visibleSequenceSources` records `zoneId`, `availablePublic`, `taken`. `skippedPublic` is dropped (derivable as `availablePublic - taken`); `skipReason` is dropped (with `maxItems` gone, the only exclusion reason is "beyond source `take`" — a constant string carries no information); `role`/`order` dropped with the rejected fields. |
| Proposal: deterministic FITL production-flow regression test (not a probabilistic "1-of-15-seeds" check) | **Adopted** | `partial-visibility-fitl-production-flow.test.ts` (§8.2) drives the real lifecycle deterministically. This is the linchpin — it exercises the execution path the spec 170 test bypassed. |
| Proposal: negative legacy-shape compiler test with a bespoke "use `sources`" error message | **Adopted (with adjustment)** | Covered by the strict zod schema rejecting the legacy `zones`/`maxItems` keys (unknown-key / missing-required-`sources`). No bespoke legacy-key special-casing is added — Foundation #14 forbids compatibility-aware code paths. |
| Proposal: `omniscient` as a separate observer scope, not a `topNVisible` reinterpretation | **Adopted as direction; out of scope here** | Spec 171 keeps `omniscient` / `observerView` rejected via the existing `OBSERVER_POLICY_DEFERRED_KIND` diagnostic. The future spec that lands `omniscient` should follow the proposal's separate-scope direction. No behavior change in this spec. |
| Proposal: 6-test plan including trace-golden, no-leak, determinism | **Adopted** | Folded into §8 — partly via migrated spec-170 tests (no-leak, determinism, trace-golden already exist) and partly via the two new tests. |
| Proposal/report: external prior-art framing (OpenSpiel, GDL-II, IS-MCTS — authoritative state vs. observation are distinct artifacts) | **Adopted as framing** | Consistent with Foundation #4. Cited as motivation, not as a schema requirement. |

## 12. Open questions

1. **WASM-path trace metadata.** Confirm during Phase 2 whether the `visibleSequenceSources` trace breakdown is emitted on the WASM resolution path or only the TS path. The `[number, number]` encoding seam carries only the scalar distance; per-source trace metadata is host-side. If the WASM path does not currently attach equivalent host-side trace metadata, decide whether Phase 2 adds it or whether `visibleSequenceSources` is documented as TS-path-only (the bytecode-equivalence test asserts scalar score-row parity regardless).
2. **`take > 1` consumers.** FITL uses `take: 1` for both sources. `take` is kept as a general positive integer (and required, for authoring explicitness), but no current game motivates `take > 1`. If no `take > 1` consumer materializes, a future spec may consider whether `take` should default — but it stays required here, because the whole point is forcing the author to consciously bound each source.

## 13. Out of scope

- `observerPolicy: omniscient` / `observerView` — reserved, rejected via `OBSERVER_POLICY_DEFERRED_KIND`.
- Per-source `order` and `role` fields — rejected, see §3 and §11.
- `observableSequences[]` top-level GameSpecDoc primitive — still deferred per spec 170 §11.
- `exposedFacets` partial-identity decomposition, `hiddenTail` present/unknown enum — still deferred per spec 170 §11.
- Schedule kinds beyond `cardDraw`.
- Additional `PhaseScheduleResolution` status variants (`unknown`, `stochastic`, `unresolved`, `depthCapped`, `failed`) — owned by the specs that introduce the corresponding ref behaviors.
- ARVN profile changes — a `fitl-arvn-agent-evolution` campaign decision.
- Conformance-corpus extension proving partial-visibility across a non-FITL game — owned by the follow-up spec that introduces a second partial-visibility-bearing game.

## 14. Tickets

Decomposed via `/spec-to-tickets` on 2026-05-14:

- [`archive/tickets/171VISSEQPROJ-001.md`](../archive/tickets/171VISSEQPROJ-001.md) — Visible-sequence-source schema and resolver atomic cut (covers §4, §5, §6, Phases 0–2, Phase 3 FITL data, §8.1)
- [`archive/tickets/171VISSEQPROJ-002.md`](../archive/tickets/171VISSEQPROJ-002.md) — Cookbook rewrite for `visiblePrefix.sources` (covers Phase 3 docs)
- [`tickets/171VISSEQPROJ-003.md`](../tickets/171VISSEQPROJ-003.md) — New regression tests for visible-sequence projection (covers Phase 3 regression test, §8.2)
