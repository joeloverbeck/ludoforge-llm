# 170PARTVISOBS-004: FITL `observerPolicy` authoring, cookbook section, and golden trace

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None (data + docs + test). FITL game data file, sandbox profile YAML, cookbook markdown, one extended golden-trace test.
**Deps**: `archive/tickets/170PARTVISOBS-002.md`, `archive/tickets/170PARTVISOBS-003.md`

## Problem

Tickets 001–003 land the engine surface and prove correctness against synthetic fixtures. This ticket exercises the new capability against real FITL data and documents the authoring surface for future game authors:

1. Declares `observerPolicy: topNVisible` on FITL's `coupEntry` boundary so `schedule.distance.toBoundary.coupEntry.cards` returns `ready` / `partial.lowerBound` instead of `unavailable: hiddenDeck` for ordinary ARVN agents — unblocking the spec-169 demonstration consideration.
2. Updates the spec-169 demonstration profile (`sandbox-profiles/169-demonstration.md`) with `scheduleFallback.onPartial.visiblePrefixExhausted: useLowerBound` so the demonstration produces a non-zero contribution under the new behavior.
3. Documents `phase.*` and `schedule.*` ref families end-to-end in the agent DSL cookbook (parallel to spec 166's `candidate.params.*` section), covering both `onUnavailable` and `onPartial` fallback discriminators.
4. Extends `partial-visibility-fitl-coup-distance.test.ts` (parametrized from spec 169's existing fixture) to pin `ready`, `partial.lowerBound`, and the preserved `unavailable: hiddenDeck` rows for FITL.

The campaign-side rerun of `fitl-arvn-agent-evolution` exp-001 is profile-quality regression, not part of this ticket — it lives in the campaign harness, not the engine suite.

## Assumption Reassessment (2026-05-13)

1. FITL declares `played:none`, `lookahead:none`, and `leader:none` as `visibility: public, ordering: stack` (verified in `data/games/fire-in-the-lake/10-vocabulary.md:62-69` this session). The 2-zone visible prefix is the structurally correct authoring.
2. FITL's live `cardLifecycle` maps `lookahead -> played` per `packages/engine/src/kernel/turn-flow-lifecycle.ts:348-470`; `leader` is coup-handoff storage, not the current draw-order slot. The verified visible-prefix order is `[played:none, lookahead:none]`: index 0 is the current driving card and index 1 is the next visible card. Spec 170's stale `[lookahead:none, leader:none]` example is corrected by this ticket.
3. `data/games/fire-in-the-lake/30-rules-actions.md:18-26` currently declares `coupEntry` without `observerPolicy` — confirmed earlier this session.
4. `data/games/fire-in-the-lake/sandbox-profiles/169-demonstration.md` exists and uses `scheduleFallback.onUnavailable: noContribution` — pre-spec-170 shape; this ticket adds `onPartial.visiblePrefixExhausted: useLowerBound`.
5. `docs/agent-dsl-cookbook.md` does not yet have a section documenting `phase.*` or `schedule.*` ref families (per spec 170 §10 and spec 169 §10). The new section parallels the existing `candidate.params.*` section from spec 166.
6. `packages/engine/test/integration/phase-boundary-fitl-coup-distance.test.ts` exists (spec 169 §8.2's golden-trace test, verified by find this session). The new test file `partial-visibility-fitl-coup-distance.test.ts` parametrizes the same fixture set with the new boundary declaration.

## Architecture Check

1. **Engine agnosticism (Foundation #1)**: All changes in this ticket are game data, profile data, or documentation. No engine code changes. FITL becomes the first declared consumer of the generic `observerPolicy.topNVisible` surface.
2. **Evolution-first design (Foundation #2)**: `observerPolicy` is authored in YAML; any evolution pass can mutate it.
3. **Specs are data (Foundation #7)**: The declaration is pure data — no callbacks, no executable hooks.
4. **Testing as proof (Foundation #16)**: The extended golden-trace test pins the three resolver paths (`ready`, `partial.lowerBound`, preserved `unavailable: hiddenDeck`) against FITL's actual cardLifecycle state, proving end-to-end integration.
5. **Cookbook precedent**: The new cookbook section parallels existing structure per spec 166, so authoring conventions are uniform.

## What to Change

### 1. Verify FITL visible-slot identity (per spec 170 §12 open question 3)

Before authoring, run a focused inspection of:

- `data/games/fire-in-the-lake/30-rules-actions.md` (cardLifecycle declaration).
- `packages/engine/src/kernel/turn-flow-lifecycle.ts:348-470` (lifecycle advancement order).
- `packages/engine/src/kernel/phase-advance.ts:339-353` (slot transition handling).

Determine whether `played`, `lookahead`, or `leader` owns the current and next visible card slots. The visible-prefix ordering in `observerPolicy.visiblePrefix.zones[]` MUST reflect FITL's policy readout order: index 0 is the current driving card, index 1 is the next visible card.

The live verification result is `[played:none, lookahead:none]`; update FITL data, spec 170 examples, and tests to that order.

### 2. FITL game data authoring

Edit `data/games/fire-in-the-lake/30-rules-actions.md`. The current `coupEntry` boundary (lines 18-26 per the spec):

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
```

Becomes:

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

The verified order comes from §1's lifecycle inspection: `played:none` is the current driving-card slot and `lookahead:none` is the next visible card slot.

### 3. FITL demonstration profile update

Edit `data/games/fire-in-the-lake/sandbox-profiles/169-demonstration.md`. Locate the `preferGovernEarlyInCoupCycle` consideration and extend its `scheduleFallback`:

```yaml
scheduleFallback:
  onUnavailable: noContribution
  onPartial:
    visiblePrefixExhausted: useLowerBound
```

`onUnavailable` is preserved exactly so non-policy-bearing boundaries continue to drop their contribution; `onPartial.useLowerBound` extracts the new partial signal as the consideration value.

### 4. Cookbook section in `docs/agent-dsl-cookbook.md`

Add a new section (parallel to `candidate.params.*`) documenting:

- `phase.current.id`, `phase.next.id` (spec 169 ref family).
- `schedule.distance.toBoundary.<X>.cards|microturns|actions|turns|rounds` (spec 169 ref family).
- `schedule.nextBoundary.id` (spec 169 ref family).
- The `scheduleFallback` contract: `onUnavailable: { noContribution | constant | dropConsideration }` and `onPartial.visiblePrefixExhausted: { useLowerBound | noContribution | dropConsideration | constant }`.
- The `phaseBoundaries[].schedule.observerPolicy.topNVisible` declaration with `visiblePrefix.zones[]` and `maxItems`.
- A worked end-to-end example using FITL's `coupEntry` boundary.

Section structure mirrors the existing `candidate.params.*` section: terms-and-definitions table, declaration example, fallback contract, worked example, links to relevant specs (169 + 170).

### 5. Extended golden-trace test

Author `packages/engine/test/integration/partial-visibility-fitl-coup-distance.test.ts` (new file). Parametrize the existing spec-169 fixture from `phase-boundary-fitl-coup-distance.test.ts` against both:

- **With `observerPolicy`** (the post-spec-170 FITL data): pin `ready` when a coup card is in the verified-first slot, `ready` when a coup card is in the verified-second slot (and verified-first is non-coup), `partial.lowerBound: 2` when neither slot exposes a coup card.
- **Without `observerPolicy`** (synthetic counterfactual matching the pre-spec-170 declaration): pin the preserved `unavailable: hiddenDeck` rows verbatim.

Both branches use the same FITL `(seed, ply)` positions from spec 169's fixture so the test is a direct extension.

### 6. Cookbook examples must lint-pass

Run the cookbook example through the agent-DSL compiler (or equivalent doc-test mechanism) to confirm the YAML compiles cleanly.

## Files to Touch

- `data/games/fire-in-the-lake/30-rules-actions.md` (modify) — add `observerPolicy` to `coupEntry` boundary, with verified slot order.
- `data/games/fire-in-the-lake/sandbox-profiles/169-demonstration.md` (modify) — extend `preferGovernEarlyInCoupCycle.scheduleFallback` with `onPartial.visiblePrefixExhausted: useLowerBound`.
- `docs/agent-dsl-cookbook.md` (modify) — new section for `phase.*` / `schedule.*` ref families, including the observer-policy variant and dual fallback contract.
- `packages/engine/test/integration/partial-visibility-fitl-coup-distance.test.ts` (new) — extends spec-169 fixture set, parametrized over with/without observerPolicy.

## Out of Scope

- Engine code changes — landed in tickets 001–003.
- WASM changes — landed in ticket 003.
- ARVN profile refactor (`arvn-evolved`) — campaign decision, not a spec deliverable per spec 170 §3.
- Campaign rerun of `fitl-arvn-agent-evolution` exp-001 — profile-quality regression, owned by the campaign harness.
- Other games adopting `topNVisible` — out of scope; each game's adoption is its own data ticket.

## Acceptance Criteria

### Tests That Must Pass

1. `partial-visibility-fitl-coup-distance.test.ts` — three new rows per spec §7 Phase 3 acceptance:
   - (a) coup card in verified-first slot → `ready` with `value: 0, visiblePrefixLength: 1`.
   - (b) coup card in verified-second slot only → `ready` with `value: 1, visiblePrefixLength: 2`.
   - (c) neither slot exposes a coup card → `partial.lowerBound: 2`.
2. Same test file — `unavailable: hiddenDeck` rows preserved verbatim under the without-observerPolicy parametrization.
3. Existing suite: `pnpm turbo test` — spec 169's `phase-boundary-fitl-coup-distance.test.ts` continues to pass by preserving the spec-169 hidden-deck fixture through a without-observerPolicy parametrization counterpart.
4. Cookbook examples compile against the agent-DSL compiler.
5. `pnpm turbo lint && pnpm turbo typecheck` clean.

### Invariants

1. **Spec 169 golden traces remain pinned**: the existing `unavailable: hiddenDeck` rows from spec 169 §8.2 are observable in the without-observerPolicy parametrization of the new test.
2. **No regression in non-FITL games**: `topNVisible` is opt-in per boundary; games without `observerPolicy` declarations are unchanged.
3. **FITL determinism preserved**: same FITL GameDef + seed produces identical resolver readouts and trace output across runs.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/partial-visibility-fitl-coup-distance.test.ts` (new) — golden-trace. Parametrized over with/without observerPolicy variants of FITL's `coupEntry` boundary.

Test class header per `.claude/rules/testing.md`:
- `// @test-class: golden-trace`

### Commands

1. `pnpm -F @ludoforge/engine test packages/engine/test/integration/partial-visibility-fitl-coup-distance.test.ts`
2. `pnpm -F @ludoforge/engine test packages/engine/test/integration/phase-boundary-fitl-coup-distance.test.ts` — regression check.
3. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`.
4. `pnpm turbo test` — full suite.
5. Cookbook example validation: re-compile FITL GameSpec end-to-end after data changes to confirm YAML accepts the new field.

## Outcome (2026-05-13)

Terminal state: COMPLETED.

What landed:

- Verified the live FITL lifecycle order from `turn-flow-lifecycle.ts`: `lookahead -> played`; `leader` is coup-handoff storage. Corrected the active spec and this ticket from the stale `[lookahead:none, leader:none]` example to `[played:none, lookahead:none]`.
- Added `observerPolicy.kind: topNVisible` to FITL `coupEntry` with `visiblePrefix.zones: [played:none, lookahead:none]` and `maxItems: 2`.
- Extended the spec-169 sandbox profile with `scheduleFallback.onPartial.visiblePrefixExhausted: useLowerBound`, preserving `onUnavailable: noContribution`.
- Added the cookbook section for `phase.*`, `schedule.*`, `scheduleFallback.onUnavailable`, `scheduleFallback.onPartial.visiblePrefixExhausted`, and `observerPolicy.topNVisible`.
- Added `partial-visibility-fitl-coup-distance.test.ts` to pin ready value 0, ready value 1, `partial.lowerBound: 2`, preserved without-policy `unavailable: hiddenDeck`, and same-seed deterministic resolver readouts.
- Updated `phase-boundary-fitl-coup-distance.test.ts` to keep the spec-169 hidden-deck golden through a cloned without-observerPolicy fixture after production FITL gained the observer policy.
- Updated `schedule-ref-consideration-trace.test.ts` so the sandbox demonstration now pins `useLowerBound` contribution and trace metadata instead of the old hidden-deck no-contribution row.

Ticket corrections applied:

- `visiblePrefix.zones: [lookahead:none, leader:none]` -> `[played:none, lookahead:none]`, based on live lifecycle advancement.
- `phase-boundary-fitl-coup-distance.test.ts continues unchanged` -> the hidden-deck invariant continues through an explicit without-observerPolicy fixture.
- Cookbook example validation has no standalone doc-test lane; the substitute proof is sandbox YAML parse plus compiled sandbox-profile trace witness and FITL production compilation through the engine test/build lanes.

Generated/schema fallout:

- None expected; this ticket changes authored FITL data, markdown docs, and tests only. No schema artifacts or generated goldens are expected to persist.

Deferred scope:

- Engine runtime/compiler/WASM surfaces remain completed by archived tickets 001-003.
- ARVN production profile adoption and campaign rerun remain out of scope.

Command ledger:

| ticket section | literal command/shorthand | ran directly/subsumed/split/not run | final citation |
| --- | --- | --- | --- |
| Test Plan | `pnpm -F @ludoforge/engine test packages/engine/test/integration/partial-visibility-fitl-coup-distance.test.ts` | replaced by build plus focused compiled Node lane | `pnpm -F @ludoforge/engine exec node --test dist/test/integration/partial-visibility-fitl-coup-distance.test.js dist/test/integration/phase-boundary-fitl-coup-distance.test.js dist/test/integration/schedule-ref-consideration-trace.test.js` passed |
| Test Plan | `pnpm -F @ludoforge/engine test packages/engine/test/integration/phase-boundary-fitl-coup-distance.test.ts` | replaced by build plus focused compiled Node lane | same focused compiled Node lane passed |
| Test Plan | `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck` | split and run serially | all three passed |
| Test Plan | `pnpm turbo test` | run directly | passed, 5 successful tasks |
| Test Plan | cookbook example validation | substituted | sandbox-profile trace witness passed; FITL production compile/build passed through focused tests, `pnpm turbo build`, and `pnpm turbo test` |

Invariant proof matrix:

| invariant | witness/assertion | status | proof lane |
| --- | --- | --- | --- |
| ready in first visible slot | `played:none` coup card resolves `ready` value 0 and `visiblePrefixLength: 1` | proven | `partial-visibility-fitl-coup-distance.test.ts` |
| ready in second visible slot | non-coup `played:none` plus coup `lookahead:none` resolves `ready` value 1 and `visiblePrefixLength: 2` | proven | `partial-visibility-fitl-coup-distance.test.ts` |
| visible prefix exhausted | neither visible slot is coup, producing `partial.lowerBound: 2` | proven | `partial-visibility-fitl-coup-distance.test.ts` |
| spec-169 hiddenDeck preserved | cloned without-observerPolicy boundary returns `unavailable: hiddenDeck` | proven | new test plus `phase-boundary-fitl-coup-distance.test.ts` |
| sandbox profile uses lower bound | `preferGovernEarlyInCoupCycle` emits `useLowerBound` fallback, `value: 2`, and contribution 500 | proven | `schedule-ref-consideration-trace.test.ts` |
| no non-FITL regression | `observerPolicy` is opt-in and broad engine suite remains green | proven | `pnpm turbo test` |
| FITL determinism preserved | same seed/state gives identical resolver readout | proven | `partial-visibility-fitl-coup-distance.test.ts` |

Verification:

- `pnpm -F @ludoforge/engine build` — passed after implementation edits.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/partial-visibility-fitl-coup-distance.test.js dist/test/integration/phase-boundary-fitl-coup-distance.test.js dist/test/integration/schedule-ref-consideration-trace.test.js` — passed before broad lanes and again after `pnpm turbo test`.
- `pnpm turbo lint` — passed; runner lint was a cache hit replay, engine lint ran directly.
- `pnpm turbo typecheck` — passed.
- `pnpm turbo build` — passed; engine and engine-wasm build were cache-hit replays, runner build ran directly.
- `pnpm turbo test` — passed, 5 successful tasks; engine default summary 79/79 files passed.
- `pnpm run check:ticket-deps` — passed for 1 active ticket and 2332 archived tickets.

Late-edit proof validity:

- The terminal status/proof transcription and ticket-dependency check transcription only record the just-run green lanes and do not change scope, acceptance, command semantics, touched-file ownership, deferred ownership, or dependency classification. No-invalidation: terminal status/proof transcription only.
