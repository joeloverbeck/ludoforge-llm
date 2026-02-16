# TEXHOLKERPRIGAMTOU-014: Full Showdown Architecture in GameSpec (Hand Ranking + Side Pots)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: XL
**Dependencies**: TEXHOLKERPRIGAMTOU-010, TEXHOLKERPRIGAMTOU-011, TEXHOLKERPRIGAMTOU-012, TEXHOLKERPRIGAMTOU-013
**Blocks**: TEXHOLKERPRIGAMTOU-006, TEXHOLKERPRIGAMTOU-007, TEXHOLKERPRIGAMTOU-008, TEXHOLKERPRIGAMTOU-009

## 0) Assumption Reassessment (Current Code/Test Reality)

Corrected assumptions before implementation:
- Showdown wiring could not be completed without `30-rules-actions.md` (handled jointly with ticket `-006`).
- Archived dependencies `-010` through `-013` were completed, so needed primitives (`assetRows`/`assetField`, `concat`, generalized aggregates, `reduce`) were available.
- Existing Texas macros still contained showdown scaffolds and required replacement.

Architecture decision:
- Implement showdown semantics fully in Texas YAML macros/rules.
- Keep kernel/compiler generic and reusable.
- No game-specific simulator/kernel branches; no alternate showdown alias paths.

## 1) What was implemented

1. Replaced scaffolded `hand-rank-score` macro with deterministic 5-card scoring logic:
- Flush/straight detection (including wheel A-2-3-4-5)
- Rank-frequency based hand class detection (quads/full house/trips/two pair/pair/high card)
- Deterministic kicker component scoring
- Composite strict score encoding for compare ordering

2. Replaced scaffolded `side-pot-distribution` macro with layered tier payout logic:
- Iterative contribution tiers (`totalBet` based)
- Eligible winner filtering via `handActive` + `showdownScore`
- Split-pot base-share with deterministic odd-chip assignment by `seatIndex`
- Pot decrement and contribution decrement per tier

3. Added showdown dataflow support in vocabulary and rules:
- Added per-player `showdownScore`
- Added global `oddChipRemainder`
- Wired showdown phase to evaluate each active hand via `evaluateSubset` over hole+community cards and invoke side-pot distribution

## 2) Invariants satisfied

1. Showdown evaluation and payout logic now execute from Texas YAML (no placeholders).
2. Side-pot payout is deterministic and chip-layer accounting is explicit.
3. Odd-chip policy is deterministic via seat-order traversal.
4. Engine/compiler remain game-agnostic.

## 3) Tests added/updated

1. `test/unit/texas-holdem-spec-structure.test.ts`
- Updated macro inventory assertions (includes new `advance-after-betting` macro)
- Added assertions for parsed Texas phases/actions and multi-phase action declarations

2. `test/unit/compile-top-level.test.ts`
- Added explicit compiler coverage for `action.phase` list lowering

3. `test/unit/kernel/legal-moves.test.ts`
- Added runtime applicability coverage for multi-phase actions in legal-move enumeration

## Outcome

- **Completion date**: 2026-02-16
- **What was actually changed vs originally planned**:
  - Work was coordinated with ticket `-006` because showdown wiring required the rules/actions fragment.
  - A generic multi-phase action architecture improvement was implemented to avoid action-id duplication across betting streets.
- **Verification results**:
  - `npm run build` ✅
  - `npm test` ✅
  - `npm run lint` ✅
