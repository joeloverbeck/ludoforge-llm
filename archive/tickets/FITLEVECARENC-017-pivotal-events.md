# FITLEVECARENC-017: Pivotal Event Cards (#121-124)

**Status**: ✅ COMPLETED
**Priority**: P3
**Complexity**: M
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.6, Phase 5b)
**Depends on**: FITLEVECARENC-001

## Description

Encode the 4 pivotal event cards. Each has:
- `sideMode: "single"` (no shaded side)
- `tags: ["pivotal", "{faction}"]`
- `playCondition` (precondition for playing)
- Complex multi-step effects
- Trumping chain: VC Tet Offensive > NVA Easter Offensive > ARVN Vietnamization > US Linebacker II

Assumption reassessment against current repo state:
- Cards `card-121`..`card-124` are currently missing from `data/games/fire-in-the-lake/41-content-event-decks.md`.
- Existing ticket text claiming "no kernel/compiler changes needed" is inaccurate: current query AST cannot directly count filtered tokens across map-space subsets, which is required to encode conditions like "NVA Troops on map" and "VC Guerrillas in South" without hardcoded piece-total constants.
- No existing production convention consumes a `metadata.trumps` field. Encoding trumping as metadata/tags would be inert and brittle. Keep trumping semantics in generic turn-flow interrupt/cancellation config when implemented, not ad-hoc card metadata.

| # | Title | Faction | Play Condition |
|---|-------|---------|----------------|
| 121 | Linebacker II | US | 2+ cards in RVN Leader box AND Support + Available > 40 |
| 122 | Easter Offensive | NVA | 2+ cards in RVN Leader box AND more NVA Troops than US Troops on map |
| 123 | Vietnamization | ARVN | 2+ cards in RVN Leader box AND < 20 US Troops on map |
| 124 | Tet Offensive | VC | 2+ cards in RVN Leader box AND > 20 VC Guerrillas in South |

## Files to Touch

- `data/games/fire-in-the-lake/41-content-event-decks.md` — Add 4 pivotal card definitions.
- `src/kernel/types-ast.ts` — Extend `OptionsQuery` for map-space token aggregation support.
- `src/kernel/schemas-ast.ts` — Mirror AST query extension in schema.
- `src/cnl/compile-conditions.ts` — Lower new query variant.
- `src/kernel/eval-query.ts` — Evaluate new query variant.
- `test/integration/fitl-events-pivotal.test.ts` — **New file**. Integration tests.
- Unit tests for AST/condition/query coverage (`test/unit/compile-conditions.test.ts`, `test/unit/schemas-ast.test.ts`, `test/unit/eval-query.test.ts`, `test/unit/types-exhaustive.test.ts`).

## Out of Scope

- Coup cards.
- Event-side effect fidelity beyond baseline text/effect scaffolding for cards 121-124.
- Full event-effect implementation for cards 121-124 (this ticket focuses on card presence + preconditions + baseline text/effect scaffolding).

## Encoding Guidance

### playCondition Pattern
All pivotal events share the "2+ cards in RVN Leader box" precondition:

```yaml
playCondition:
  op: "and"
  args:
    - { op: ">=", left: { ref: "gvar", var: "leaderBoxCardCount" }, right: 2 }
    - # Faction-specific condition
```

### Trumping Chain Encoding
Do **not** introduce `metadata.trumps` or custom trump tags. Those are not interpreted by engine flow and would create dead data. Use existing generic turn-flow pivotal interrupt/cancellation config in the appropriate turn-flow ticket.

### Required Query Capability
Add a generic query variant to count/filter tokens across map spaces with an optional map-space condition filter. This removes reliance on FITL-specific constants and keeps the engine game-agnostic.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-pivotal.test.ts`:
   - All 4 cards compile, `sideMode: "single"`, tags include `"pivotal"`.
   - Each card has a `playCondition` with the correct preconditions.
   - Card 121: `playCondition` checks `leaderBoxCardCount >= 2` AND support + available > 40.
   - Card 122: `playCondition` checks `leaderBoxCardCount >= 2` AND NVA troops on map > US troops on map.
   - Card 123: `playCondition` checks `leaderBoxCardCount >= 2` AND US troops on map < 20.
   - Card 124: `playCondition` checks `leaderBoxCardCount >= 2` AND VC guerrillas in South (`country: southVietnam`) > 20.
   - Cross-validation produces no `CNL_XREF_PIVOTAL_PLAY_CONDITION_MISSING` warnings for these cards.
2. Unit tests cover the new query variant in compile/schema/eval/type-exhaustiveness suites.
3. `npm run build` passes.
4. `npm test` passes.

### Invariants That Must Remain True

- All existing cards unchanged. Card IDs unique.
- Production spec compiles without errors.
- Cross-validation warnings for pivotal cards without `playCondition` remain active (tested by existing tests).

## Outcome

- Completion date: 2026-02-15
- What was changed:
  - Added cards `card-121`..`card-124` in `data/games/fire-in-the-lake/41-content-event-decks.md` with `sideMode: single`, pivotal tags, and concrete `playCondition` definitions.
  - Added a new generic AST query variant `tokensInMapSpaces` across parser/compiler/runtime layers (`src/kernel/types-ast.ts`, `src/kernel/schemas-ast.ts`, `src/cnl/compile-conditions.ts`, `src/kernel/eval-query.ts`) so map-scoped token-count preconditions are expressible without FITL-specific engine code or hardcoded totals.
  - Implemented generic pivotal interrupt cancellation selectors in turn-flow (`winner`/`canceled` selector objects in `src/kernel/types-turn-flow.ts`, `src/cnl/game-spec-doc.ts`, `src/kernel/schemas-extensions.ts`, `src/cnl/compile-turn-flow.ts`, `src/cnl/cross-validate.ts`, `src/kernel/legal-moves-turn-order.ts`, `schemas/GameDef.schema.json`) so trumping is executable engine behavior rather than inert metadata.
  - Added integration coverage in `test/integration/fitl-events-pivotal.test.ts` and unit coverage in `test/unit/compile-conditions.test.ts`, `test/unit/schemas-ast.test.ts`, `test/unit/eval-query.test.ts`, and `test/unit/types-exhaustive.test.ts`.
  - Added selector-level cancellation tests in `test/unit/legal-moves.test.ts`, including event-card-tag selector precedence coverage for interrupt windows.
- Deviations from original ticket:
  - Original ticket assumed no kernel/compiler updates; this was corrected because exact pivotal preconditions required a missing generic query capability.
  - Original ticket suggested trump-chain metadata/tags; this was intentionally not implemented because that data is inert in the current architecture. The final implementation uses generic turn-flow interrupt/cancellation selector config instead.
- Verification results:
  - `npm run build` passed.
  - `npm run test:unit -- --coverage=false` passed.
  - `npm test` passed.
  - `npm run lint` passed.
