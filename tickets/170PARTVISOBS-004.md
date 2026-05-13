# 170PARTVISOBS-004: FITL `observerPolicy` authoring, cookbook section, and golden trace

**Status**: PENDING
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

1. FITL declares both `leader:none` and `lookahead:none` as `visibility: public, ordering: stack` (verified in `data/games/fire-in-the-lake/10-vocabulary.md:62-69` this session). The 2-zone visible prefix is the structurally correct authoring.
2. FITL's `cardLifecycle` maps `lookahead → leader → played` per `packages/engine/src/kernel/turn-flow-lifecycle.ts:55-108`. **Open question per spec 170 §12.3**: the "next card to be drawn" semantics depend on whether the deck draws into `lookahead` (then promotes to `leader` on turn boundary) or directly into `leader`. Implementation MUST verify the actual lifecycle advancement order against `turn-flow-lifecycle.ts` and `phase-advance.ts:339-353` before authoring `visiblePrefix.zones[]` order. If the documented order in spec 170 §4.1 (`[lookahead:none, leader:none]`) is wrong relative to lifecycle advancement, correct the FITL data AND update spec 170's example before authoring tests.
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

### 1. Verify FITL lookahead-slot identity (per spec 170 §12 open question 3)

Before authoring, run a focused inspection of:

- `data/games/fire-in-the-lake/30-rules-actions.md` (cardLifecycle declaration).
- `packages/engine/src/kernel/turn-flow-lifecycle.ts:55-108` (lifecycle advancement order).
- `packages/engine/src/kernel/phase-advance.ts:339-353` (slot transition handling).

Determine whether `lookahead` precedes `leader` in draw order (i.e., the deck draws into `lookahead` first, then promotes to `leader` on turn boundary) or whether `leader` is the "current top of deck" with `lookahead` being "the card after". The visible-prefix ordering in `observerPolicy.visiblePrefix.zones[]` MUST reflect draw order: index 0 is the NEXT card to be drawn from the deck, index 1 is the card after that.

If the spec 170 example (`zones: [lookahead:none, leader:none]`) is inverted relative to lifecycle advancement, correct the FITL data to the verified order. Note the correction in commit body and (if needed) propose an editorial correction to spec 170 §4.1 via a follow-up doc edit.

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
            - id: <verified-first-slot>:none
            - id: <verified-second-slot>:none
          maxItems: 2
```

Where `<verified-first-slot>` and `<verified-second-slot>` come from §1's verification.

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
3. Existing suite: `pnpm turbo test` — spec 169's `phase-boundary-fitl-coup-distance.test.ts` continues to pass unchanged (the spec-169 fixture is preserved as the without-observerPolicy parametrization counterpart).
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
