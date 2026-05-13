# 169PHASCHREF-003: Phase 2 — card-draw schedule index & schedule.distance.toBoundary.<X>.cards

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel runtime ownership, card-draw effect hook, policy ref resolver, fallback discipline
**Deps**: `tickets/169PHASCHREF-002.md`

## Problem

The empirical motivation for Spec 169 (gap report §2.2 — exp-009's `projectedControlPopGain` silent for main-phase candidates, exp-010's `-5.4` regression on `preferGovernWeighted` removal) hinges on the agent being able to read "cards until the next coup phase". This ticket implements the first distance unit — `schedule.distance.toBoundary.<BoundaryId>.cards` — along with the supporting card-draw schedule index in `GameDefRuntime`, the `drawFromDeck` effect hook that maintains the index, the `scheduleFallback` runtime contract for `unavailable` status, and the observer-view discipline that prevents hidden-deck information leaks.

This is the largest ticket in the 169 chain because it crosses several seams: `GameDefRuntime` ownership (sharedStructural vs runLocal per spec-143), the `drawFromDeck` effect handler, the policy-runtime resolver, the `scheduleFallback` AST → trace contract, and the observer-view authorization layer.

## Assumption Reassessment (2026-05-13)

1. **`GameDefRuntime.scheduleIndex` is a new field**: confirmed by grep — no existing `scheduleIndex` in the runtime. This ticket adds the field, its sharedStructural seed (boundary definitions from compile time) and its runLocal mutable state (per-run draw position).
2. **`forkGameDefRuntimeForRun` extension point exists**: confirmed at `packages/engine/src/kernel/gamedef-runtime.ts:84-95`. The fork helper already classifies sharedStructural vs runLocal members per spec-143; new fields plug into the existing pattern.
3. **`drawFromDeck` effect handler exists**: confirmed by grep in kernel effect interpreter — handler is the canonical entry point for advancing deck state. The schedule-index update hook attaches here.
4. **Observer-view machinery exists**: confirmed in policy-runtime.ts (agents read state through an observer projection, not raw kernel state). The card-draw schedule index must consult observer visibility before returning a distance — Foundation #4 requires it.
5. **`scheduleFallback` AST field present from 001**: identity refs in 002 do not exercise it; distance refs in this ticket are the first to trigger `unavailable` status and the first to require `scheduleFallback` enforcement at both compile time (numeric-context-without-fallback → reject) and runtime (fallback resolution + trace emission).

## Architecture Check

1. **Foundation #4 (Observer views)**: card-draw distance MUST be computed against the consuming agent's visibility, not raw kernel state. For FITL's publicly-tracked event deck, all observers see the same distance. For a hypothetical hidden-deck game, distance is `unavailable` to observers without visibility. This ticket adds the compile-time check: `schedule.distance.toBoundary.<X>.cards` compiles only if the targeted deck is publicly observable for the consuming scope, OR `schedule.observerPolicy: omniscient` is explicitly opted into in the GameSpecDoc. Phase 0 ships `observerView` default only (per spec §4.6).
2. **Foundation #8 (Determinism)**: card-draw schedule index updates are deterministic O(1) reads/writes against the canonical deck state. No hash-map iteration order leakage; the index is an array of card positions, not a Map.
3. **Foundation #10 (Bounded)**: distance resolution is O(1) per ref lookup against the maintained index. Index size scales with `O(decks × boundaries × cards-per-deck)`, bounded by spec at compile time.
4. **Foundation #20 (Preview integrity)**: schedule refs are NOT preview-derived (no preview surface involvement), but they introduce a parallel ready/unavailable discipline. Numeric considerations referencing distance refs MUST declare `scheduleFallback`; the compiler rejects missing fallback (new diagnostic code `SCHEDULE_REF_MISSING_FALLBACK`). The fallback path is trace-visible.
5. **Spec-143 runtime ownership boundary**: boundary definitions (sharedStructural) flow from compile-time index built in 001; per-run draw position (runLocal) lives under `forkGameDefRuntimeForRun` ownership. No cross-run contamination.

## What to Change

### 1. Extend `GameDefRuntime` with `scheduleIndex`

In `packages/engine/src/kernel/gamedef-runtime.ts`:

- Add `scheduleIndex: ScheduleIndex` field to `GameDefRuntime`.
- `ScheduleIndex` shape:
  ```ts
  interface ScheduleIndex {
    readonly boundaries: ReadonlyMap<BoundaryId, BoundaryRuntimeState>;  // sharedStructural
  }
  interface BoundaryRuntimeState {
    readonly definition: PhaseBoundaryDef;  // sharedStructural — from compile
    readonly cardDrawState?: CardDrawRuntimeState;  // runLocal — only for cardDraw kind
  }
  interface CardDrawRuntimeState {
    readonly deckId: DeckId;
    readonly triggeringCardPositions: readonly number[];  // sorted ascending; the deck-positions of cards matching cardSelector
    readonly currentDrawPosition: number;  // mutable per run; runLocal
  }
  ```
- Initialize `scheduleIndex.boundaries` from compiled `phaseBoundaries[]` at GameDef compile time.
- Initialize `cardDrawState.triggeringCardPositions` from the deck's compiled card sequence + cardSelector evaluation; deterministic, derived once per compile.

### 2. Extend `forkGameDefRuntimeForRun`

In the same file:

- Per-run fork: deep-clone `BoundaryRuntimeState.cardDrawState.currentDrawPosition` per boundary (runLocal); preserve `triggeringCardPositions` and `definition` references (sharedStructural).
- Update `docs/architecture.md` "Runtime Ownership" section to document the new field's classification.

### 3. Attach the `drawFromDeck` effect hook

In the kernel effect handler for `drawFromDeck` (locate via grep):

- After advancing the deck's draw position, iterate `scheduleIndex.boundaries` and, for each boundary with `cardDrawState.deckId === draw.deckId`, increment `currentDrawPosition`.
- Maintain immutability per Foundation #11: the handler returns a new `GameDefRuntime` (or its mutable runLocal scope per the scoped-mutation exception in Foundation #11).

### 4. Distance resolver in `policy-runtime.ts`

Extend the `scheduleDistance` resolver branch (added in 002 for `nextBoundary.id`) to dispatch on `target.kind === 'boundary'` + `unit === 'cards'`:

- Look up `BoundaryRuntimeState` by `boundaryId`.
- If `cardDrawState` is absent (boundary is not `cardDraw` kind) → diagnostic violation, should have been caught by 001's compile-time matrix. Defensive `unavailable` with reason `notCardScheduled`.
- Compute distance: find the smallest position in `triggeringCardPositions` strictly greater than `currentDrawPosition`. If none → status `unavailable`, reason `noTriggeringCardRemaining`. Otherwise distance = `position - currentDrawPosition`, status `ready`.
- Consult observer view: if the deck is not publicly observable for the consuming scope and `schedule.observerPolicy !== 'omniscient'` → status `unavailable`, reason `hiddenDeck`.

### 5. `scheduleFallback` compile-time enforcement

Add to `compile-agents.ts` validation (extends 001's `scheduleDistance` ref-kind branch):

- New diagnostic `SCHEDULE_REF_MISSING_FALLBACK`: a consideration whose `value:` expression references a `scheduleDistance` ref (any unit) without declaring `scheduleFallback` on the consideration → reject. Parallels the `candidateParamFallback` discipline from spec 166.
- `when:` clauses referencing schedule refs are exempt — `unavailable` collapses to `false` per existing condition-evaluator semantics; no fallback required.

### 6. Fallback resolution + trace emission

Extend the trace emission per spec §4.7:

- When a `scheduleDistance` ref resolves `unavailable` and a numeric fallback fires (`noContribution` | `{ value: N }` | `dropConsideration`), the trace row includes `"status": "unavailable"`, `"reason": <reason>`, `"fallback": { "kind": <kind>, ... }`, and `"contribution": <computed>`.

### 7. Public-deck observability check

The compile-time observability check requires the GameSpecDoc to declare which decks are publicly observable. Reuse the existing `dataAsset` visibility declaration (if present), or add a new `publiclyObservable: boolean` field to the deck dataAsset shape. Choose the path that minimizes new surface — preferred: extend dataAsset.

## Files to Touch

- `packages/engine/src/kernel/gamedef-runtime.ts` (modify) — `ScheduleIndex` field, fork helper.
- `packages/engine/src/kernel/effects/draw-from-deck.ts` (modify — exact path TBD via grep) — schedule index update hook.
- `packages/engine/src/agents/policy-runtime.ts` (modify) — distance resolver, fallback resolution, observer-view check.
- `packages/engine/src/cnl/compile-agents.ts` (modify) — `SCHEDULE_REF_MISSING_FALLBACK` diagnostic, observer-view compile-time check, deck-observability schema extension.
- `docs/architecture.md` (modify) — Runtime Ownership section update for `scheduleIndex`.
- `packages/engine/test/unit/agents/schedule-ref-card-draw-index-correctness.test.ts` (new) — architectural-invariant: apply `drawFromDeck` sequence; assert index updates in O(1) and post-draw distance matches recomputation from fresh state.
- `packages/engine/test/unit/agents/schedule-ref-fallback-discipline.test.ts` (new) — architectural-invariant: missing `scheduleFallback` in numeric context → compile failure; fallback paths exercised in trace output.
- `packages/engine/test/unit/agents/schedule-ref-observer-view.test.ts` (new) — architectural-invariant: hidden-deck → `unavailable` status; public-deck → `ready`.
- `packages/engine/test/unit/agents/schedule-distance-cards-golden.test.ts` (new) — golden-trace tests at 5+ game positions (start, mid-cycle, post-draw, end-game, terminal).

## Out of Scope

- Non-card units (`.microturns`, `.actions`, `.turns`, `.rounds`) — 004 ticket.
- `schedule.distance.toPhase.<PhaseId>.<unit>` aliases — 004 ticket.
- WASM opcode integration — 005 ticket.
- FITL `phaseBoundaries` data authoring — 006 ticket; this ticket's tests use synthetic fixtures.
- `omniscient` and `topNVisible` observer policies — reserved enum entries, not implemented.
- `turnCount` and `condition` schedule kinds — reserved, not implemented.

## Acceptance Criteria

### Tests That Must Pass

1. `schedule-ref-card-draw-index-correctness.test.ts` — fixture with 2 boundaries on the same deck; apply a sequence of 10+ `drawFromDeck` effects; assert per-step distance matches canonical recomputation; index update cost is O(1) per draw (measured via mutation count, not wall-clock).
2. `schedule-ref-fallback-discipline.test.ts` — three cases: (a) missing `scheduleFallback` in numeric context → compile failure with `SCHEDULE_REF_MISSING_FALLBACK`; (b) `noContribution` fallback path → trace shows `contribution: 0` with fallback kind; (c) `{ value: 0 }` fallback → trace shows the explicit value.
3. `schedule-ref-observer-view.test.ts` — fixture with a public deck and a hidden deck; same boundary structure on each; assert `ready` for public, `unavailable` (reason `hiddenDeck`) for hidden; no numeric leak.
4. `schedule-distance-cards-golden.test.ts` — byte-pinned distances at 5+ fixture positions.
5. Existing suite: `pnpm -F @ludoforge/engine test:unit` and `pnpm -F @ludoforge/engine test:e2e` pass — no regression.

### Invariants

1. Card-draw index update under `drawFromDeck` is O(1) per boundary per draw. Total per-draw cost is O(boundaries-on-deck), bounded by spec at compile time.
2. Observer view is consulted on every distance resolution. Hidden-deck distance is never numerically coerced unless `omniscient` policy is declared.
3. `scheduleFallback` resolution is deterministic and trace-visible. Same `(GameState, observerView, scheduleFallback)` → same trace row, every time.
4. The `scheduleIndex.boundaries` map's iteration order is part of the GameDef hash (Foundation #13).
5. The `currentDrawPosition` field is runLocal per Foundation #11's runtime-ownership corollary — never shared across runs; `forkGameDefRuntimeForRun` produces fresh copies.

## Test Plan

### New/Modified Tests

1. `schedule-ref-card-draw-index-correctness.test.ts` — `@test-class: architectural-invariant`; covers index correctness across draw sequence.
2. `schedule-ref-fallback-discipline.test.ts` — `@test-class: architectural-invariant`; covers compile-time discipline + runtime fallback paths.
3. `schedule-ref-observer-view.test.ts` — `@test-class: architectural-invariant`; covers Foundation #4.
4. `schedule-distance-cards-golden.test.ts` — `@test-class: golden-trace`; byte-pinned distances.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- --test-name-pattern schedule-ref` — new schedule tests in isolation.
2. `pnpm -F @ludoforge/engine test:unit -- --test-name-pattern schedule-distance` — golden tests.
3. `pnpm turbo test --filter=@ludoforge/engine` — full engine test gate.
4. `pnpm turbo typecheck` — cross-package typecheck.
5. `pnpm turbo lint` — lint gate.
