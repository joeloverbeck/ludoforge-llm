# Spec 49: FITL Section 7 Rules Gaps

**Status**: ACTIVE
**Priority**: P1
**Complexity**: M
**Dependencies**: Spec 26 (terminal/victory), Spec 29 (event card encoding)
**Estimated effort**: 2-3 days
**Source sections**: FITL Rules Section 7 (Victory) gap analysis

## Overview

Gap analysis of FITL Rules Section 7 (Victory) and related rules 1.6.2/1.7 against the FITL implementation (`data/games/fire-in-the-lake/90-terminal.md`) and the engine kernel (`packages/engine/src/kernel/terminal.ts`).

Six confirmed gaps: wrong comparison operators, wrong thresholds, missing margin subtractions, wrong tie-break order, and missing engine support for during-coup margin ranking.

## Gap Analysis Summary

| # | Gap | Rule | Status | Action |
|---|-----|------|--------|--------|
| 1 | Victory checks use `>=`, should use `>` ("exceeds") | 7.2 | TODO | FITLSEC7RULGAP-001 |
| 2 | NVA threshold is 25, should be 18 | 7.2 | TODO | FITLSEC7RULGAP-001 |
| 3 | VC threshold is 25, should be 35 | 7.2 | TODO | FITLSEC7RULGAP-001 |
| 4 | Margins don't subtract thresholds (50, 18, 50, 35) | 7.3 | TODO | FITLSEC7RULGAP-001 |
| 5 | Tie-break order NVA>VC>ARVN>US, should be VC>ARVN>NVA>US | 7.1 | TODO | FITLSEC7RULGAP-001 |
| 6 | DuringCoup uses first-match instead of margin ranking | 7.1 | TODO | FITLSEC7RULGAP-002 |

## Verified Correct (No Changes Needed)

| Rule | Section | Status |
|------|---------|--------|
| 1.6.2 | Active Support/Opposition doubling | Correct — `activeSupport` maps to `pop * 2`, `passiveSupport` to `pop * 1` |
| 1.7 | COIN Control: US+ARVN > NVA+VC | Correct — sum of US+ARVN tokens > sum of NVA+VC tokens |
| 1.7 | NVA Control: NVA alone > all others incl. VC | Correct — NVA count > US+ARVN+VC count |
| 7.2 | US victory formula structure (Total Support + Available US) | Correct |
| 7.2 | ARVN victory formula structure (COIN-Controlled Pop + Patronage) | Correct |
| 7.2 | NVA victory formula structure (NVA-Controlled Pop + NVA Bases on map) | Correct |
| 7.2 | VC victory formula structure (Total Opposition + VC Bases on map) | Correct |
| 7.3 | FinalCoup checkpoint trigger (deck empty + lookahead empty + isCoup) | Correct |
| 7.3 | FinalCoup already uses margin ranking | Correct |

## Scope

### In Scope

- Fix comparison operators, thresholds, margin subtractions, and tie-break order in `90-terminal.md`
- Engine enhancement: `duringCoup` checkpoint uses margin ranking when margins are defined
- Update/add integration tests for correct thresholds, operators, margins, and tie-breaking

### Out of Scope

- Victory formula structure changes (formulas are correct)
- Active Support/Opposition doubling changes (already correct)
- Control definition changes (already correct)
- FinalCoup checkpoint trigger changes (already correct)
- Compiler source changes

---

## FITLSEC7RULGAP-001: Victory Data Fixes

**Priority**: P1
**Estimated effort**: Small-Medium (1 day)
**Rule references**: 7.1, 7.2, 7.3
**Depends on**: None

### Summary

Fix six data errors in `data/games/fire-in-the-lake/90-terminal.md`: wrong comparison operators, wrong NVA/VC thresholds, missing margin subtractions, and wrong tie-break order.

### Changes

1. **Fix comparison operators** in all 4 during-coup checkpoints: `>=` to `>`
2. **Fix NVA threshold**: `right: 25` to `right: 18`
3. **Fix VC threshold**: `right: 25` to `right: 35`
4. **Fix margin expressions** — wrap each with subtraction of the threshold:
   - US (seat 0): `op: '-'`, left: current expression, right: 50
   - ARVN (seat 1): `op: '-'`, left: current expression, right: 50
   - NVA (seat 2): `op: '-'`, left: current expression, right: 18
   - VC (seat 3): `op: '-'`, left: current expression, right: 35
5. **Fix tie-break order**: `['2', '3', '1', '0']` to `['3', '1', '2', '0']`

### Files

| File | Change |
|------|--------|
| `data/games/fire-in-the-lake/90-terminal.md` | Fix operators, thresholds, margins, tie-break |
| `packages/engine/test/integration/fitl-production-terminal-victory.test.ts` | Update test expectations |
| `packages/engine/test/integration/fitl-coup-victory.test.ts` | Update test expectations if affected |

### Tests

- Verify `>` operator: value equal to threshold does NOT trigger victory
- Verify `>` operator: value one above threshold DOES trigger victory
- Verify NVA threshold is 18 (not 25)
- Verify VC threshold is 35 (not 25)
- Verify margins subtract thresholds (e.g., score 0 with threshold 50 gives margin -50)
- Verify tie-break order: VC > ARVN > NVA > US

---

## FITLSEC7RULGAP-002: DuringCoup Margin Ranking

**Priority**: P1
**Estimated effort**: Small-Medium (1 day)
**Rule reference**: 7.1
**Depends on**: FITLSEC7RULGAP-001

### Summary

Rule 7.1 says when any player passes a victory check, the faction with the highest victory margin wins (not just the first checkpoint that triggers). Currently, `evaluateVictory()` returns the first matching `duringCoup` checkpoint's seat as the winner, ignoring margins.

### Change

In `evaluateVictory()` in `packages/engine/src/kernel/terminal.ts`, when a `duringCoup` checkpoint triggers:

1. Check if margins are defined in `def.terminal.margins`
2. If yes, call `finalVictoryRanking()` to evaluate all margins
3. Use the top-ranked seat as the winner (instead of `duringCheckpoint.seat`)
4. Include the full ranking in the victory metadata

This is a generic engine enhancement — no game-specific logic. It mirrors what `finalCoup` already does.

### Files

| File | Change |
|------|--------|
| `packages/engine/src/kernel/terminal.ts` | `evaluateVictory()`: use margin ranking for duringCoup when margins defined |
| `packages/engine/test/unit/terminal.test.ts` | Add duringCoup + margin ranking tests |
| `packages/engine/test/integration/fitl-production-terminal-victory.test.ts` | Update expectations to include ranking metadata |

### Tests

- DuringCoup with margins uses ranking to pick winner
- DuringCoup without margins falls back to checkpoint seat (backward compatible)
- Multiple factions passing simultaneously: highest margin wins
- Tie-breaking works correctly for during-coup

---

## Verification

```bash
pnpm turbo build
pnpm -F @ludoforge/engine test
pnpm -F @ludoforge/engine test:e2e
```
