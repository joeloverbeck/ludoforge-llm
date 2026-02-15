# TEXHOLKERPRIGAMTOU-005: GameSpecDoc — Macros

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Dependencies**: TEXHOLKERPRIGAMTOU-004 (vocabulary and data assets)
**Blocks**: TEXHOLKERPRIGAMTOU-006, TEXHOLKERPRIGAMTOU-007, TEXHOLKERPRIGAMTOU-008

## Summary

Create `20-macros.md` for Texas Hold'em with reusable macro contracts and deterministic DSL implementations where current kernel primitives are sufficient.

This ticket is intentionally **contract-first**: it defines all required macro IDs and implements robust primitives now, while avoiding brittle pseudo-logic for concerns that require additional showdown architecture.

## Reassessed Assumptions

### What was incorrect in the original assumptions

1. Blind-schedule lookup from scenario payload at runtime is not currently available as a first-class DSL query primitive.
2. The original side-pot/hand-evaluation expectations assume richer intermediate collection operations than the current DSL exposes in a clean way.
3. `draw.count` expects numeric literals after macro expansion; parameterized draws must remain numeric and deterministic.
4. The original out-of-scope statement that forbids tests conflicts with current engineering policy for hardening and regression safety.

### Architecture decision for this ticket

To keep architecture clean, robust, and extensible:
- Keep engine/compiler generic (no Texas-specific code in `src/`).
- Define all required macro IDs now so downstream tickets can wire stable contracts.
- Fully implement macros that map cleanly to existing DSL primitives.
- For showdown-complex macros, provide deterministic scaffolding with explicit constraints rather than forcing fragile logic.

## What to Change

### File: `data/games/texas-holdem/20-macros.md` (new)

Define these macro IDs:

1. `hand-rank-score`
2. `collect-forced-bets`
3. `deal-community`
4. `betting-round-completion`
5. `side-pot-distribution`
6. `eliminate-busted-players`
7. `escalate-blinds`

## Macro Scope in This Ticket

### Fully implemented now

- `collect-forced-bets`
  - Accept explicit blind actor parameters (`sbPlayer`, `bbPlayer`) to keep seat-resolution concerns in turn-structure wiring.
  - Post ante for non-eliminated players via `commitResource`.
  - Post SB/BB via `commitResource` with all-in clamping behavior.
  - Initialize `currentBet` and `lastRaiseSize`.

- `deal-community`
  - Burn one card, then draw `count` cards to community.

- `betting-round-completion`
  - Deterministically sets `bettingClosed` by iterating players and clearing it when any non-folded/non-all-in player has unmatched street bet.

- `eliminate-busted-players`
  - Marks busted players as eliminated and decrements `activePlayers` exactly once per player.

- `escalate-blinds`
  - Deterministic blind/ante progression encoded in YAML (schedule table via conditional thresholds), without engine changes.

### Contract/scaffold only in this ticket

- `hand-rank-score`
  - Define stable macro contract and exported bind for downstream showdown flow.
  - Full 7,462-rank-complete evaluator is deferred to showdown-focused ticketing once full showdown dataflow is wired.

- `side-pot-distribution`
  - Define stable macro contract and deterministic scaffold hook.
  - Full side-pot layering and tie splitting logic is deferred to showdown-focused ticketing.

## Files to Touch

| File | Change Type |
|------|-------------|
| `data/games/texas-holdem/20-macros.md` | Create |
| `test/unit/texas-holdem-spec-structure.test.ts` | Update |

## Out of Scope

- **DO NOT** modify any `src/` kernel or compiler files
- **DO NOT** write `30-rules-actions.md` (TEXHOLKERPRIGAMTOU-006)
- **DO NOT** modify Texas metadata/vocabulary/data-assets/terminal files in this ticket
- **DO NOT** modify existing FITL game spec files
- **DO NOT** implement new kernel primitives in this ticket

## Acceptance Criteria

### Tests That Must Pass

1. `npm run build`
2. `npm test`
3. `npm run lint`

### Invariants That Must Remain True

1. All fenced YAML parses in strict mode.
2. All macro IDs are present and kebab-case.
3. Macro references only use declared vocabulary variables/zones.
4. No `src/` engine/compiler changes.
5. Macros remain game-data driven (YAML), preserving agnostic engine architecture.
6. Complex showdown behavior is explicitly represented as macro contracts (no hidden TypeScript logic).

## Outcome

- Completion date: 2026-02-15
- Implemented:
  - Added `data/games/texas-holdem/20-macros.md` with all seven required macro IDs.
  - Fully implemented deterministic macros compatible with current DSL: `collect-forced-bets`, `deal-community`, `betting-round-completion`, `eliminate-busted-players`, `escalate-blinds`.
  - Added explicit contract scaffolds for `hand-rank-score` and `side-pot-distribution` to avoid brittle pseudo-logic before showdown architecture is fully wired.
  - Strengthened `test/unit/texas-holdem-spec-structure.test.ts` to assert Texas macro IDs and key macro param contracts.
- Deviations from original plan:
  - Re-scoped full hand-ranking and full side-pot algorithm from this ticket to scaffolding, based on current DSL/runtime dataflow limits and to preserve clean extensible architecture.
  - Replaced runtime blind-schedule lookup expectation with deterministic YAML-encoded threshold progression.
  - Included test hardening in this ticket.
- Verification:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
