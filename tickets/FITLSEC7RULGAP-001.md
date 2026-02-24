# FITLSEC7RULGAP-001: Victory Data Fixes

**Status**: TODO
**Priority**: HIGH
**Effort**: Small-Medium
**Engine Changes**: No (data + tests only)
**Deps**: None

## Problem

Six data errors in `data/games/fire-in-the-lake/90-terminal.md` cause incorrect victory evaluation:

1. **Wrong operators**: All 4 during-coup checkpoints use `>=` but Rule 7.2 says "exceeds" (strictly greater than, `>`).
2. **Wrong NVA threshold**: `right: 25` should be `right: 18` (Rule 7.2: "exceeds 18").
3. **Wrong VC threshold**: `right: 25` should be `right: 35` (Rule 7.2: "exceeds 35").
4. **Missing margin subtractions**: Margin expressions compute raw scores without subtracting thresholds. Rule 7.3 defines margins as "the amount a Faction is beyond or short of its condition":
   - US: Total Support + Available US **- 50**
   - ARVN: COIN-Controlled Pop + Patronage **- 50**
   - NVA: NVA-Controlled Pop + NVA Bases **- 18**
   - VC: Total Opposition + VC Bases **- 35**
5. **Wrong tie-break order**: Current `['2', '3', '1', '0']` (NVA>VC>ARVN>US). Rule 7.1 says "Ties go to ... the VC, then the ARVN, then the NVA": should be `['3', '1', '2', '0']` (VC>ARVN>NVA>US).

## What to Change

### 1. Fix comparison operators in 90-terminal.md

In all 4 during-coup checkpoint `when` blocks, change the outer comparison from `op: '>='` to `op: '>'`:

- `us-victory` checkpoint (line ~22): `op: '>='` → `op: '>'`
- `arvn-victory` checkpoint (line ~67): `op: '>='` → `op: '>'`
- `nva-victory` checkpoint (line ~136): `op: '>='` → `op: '>'`
- `vc-victory` checkpoint (line ~210): `op: '>='` → `op: '>'`

### 2. Fix NVA threshold

Line ~193: `right: 25` → `right: 18`

### 3. Fix VC threshold

Line ~238: `right: 25` → `right: 35`

### 4. Fix margin expressions

Wrap each margin's `value` in a subtraction expression. For each margin entry, the current `value` becomes the `left` operand of `op: '-'`, and the threshold becomes `right`:

- Seat '0' (US): wrap with `op: '-'`, right: 50
- Seat '1' (ARVN): wrap with `op: '-'`, right: 50
- Seat '2' (NVA): wrap with `op: '-'`, right: 18
- Seat '3' (VC): wrap with `op: '-'`, right: 35

### 5. Fix tie-break order

Line ~425: `tieBreakOrder: ['2', '3', '1', '0']` → `tieBreakOrder: ['3', '1', '2', '0']`

## Files to Touch

- `data/games/fire-in-the-lake/90-terminal.md` (modify)
- `packages/engine/test/integration/fitl-production-terminal-victory.test.ts` (modify — update expectations)
- `packages/engine/test/integration/fitl-coup-victory.test.ts` (check if affected)

## Out of Scope

- Engine kernel changes (handled by FITLSEC7RULGAP-002)
- Victory formula structure changes (formulas are correct)
- Compiler changes
- FinalCoup checkpoint trigger changes

## Acceptance Criteria

1. `>` operator: value equal to threshold does NOT trigger during-coup victory
2. `>` operator: value one above threshold DOES trigger during-coup victory
3. NVA threshold is 18
4. VC threshold is 35
5. All 4 margin expressions subtract their respective thresholds
6. Tie-break order is VC > ARVN > NVA > US (`['3', '1', '2', '0']`)
7. `pnpm turbo build` passes
8. `pnpm -F @ludoforge/engine test` passes
9. `pnpm turbo typecheck` passes

## Test Plan

### Updated Tests

1. Update `fitl-production-terminal-victory.test.ts` expectations for new tie-break order and margin values
2. Update during-coup threshold test to use value > threshold (not >=)
3. Add test verifying value == threshold does NOT trigger victory

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
