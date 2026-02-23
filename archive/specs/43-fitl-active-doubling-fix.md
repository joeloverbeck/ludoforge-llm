# Spec 43 — FITL Active Support/Opposition Doubling Fix

**Status**: COMPLETED
**Type**: Bug fix (data-only, no engine changes)
**Game**: Fire in the Lake

## Problem

Rule 1.6.2 of the FITL rulebook states:

> "Active Support or Opposition counts double Population for Total Support or Opposition"

The correct formulas are:

- **Total Support** = 2 x Pop(Active Support spaces) + 1 x Pop(Passive Support spaces)
- **Total Opposition** = 2 x Pop(Active Opposition spaces) + 1 x Pop(Passive Opposition spaces)

The implementation in `data/games/fire-in-the-lake/90-terminal.md` treats Active and Passive states identically, summing raw population for any space with support/opposition. A Pop 2 space with Active Support contributes 2 instead of the correct 4.

This affects:
- **US victory** (Total Support component) — checkpoint and margin
- **VC victory** (Total Opposition component) — checkpoint and margin

NVA and ARVN victories are unaffected (they use piece-count-based Control, not Support/Opposition).

## Fix

Change the `valueExpr` in 4 aggregation blocks from:

```yaml
valueExpr: { ref: zoneProp, zone: $zone, prop: population }
```

To a conditional that doubles population for Active states:

**US/Support blocks** (checkpoint `us-victory` + margin seat `'0'`):

```yaml
valueExpr:
  if:
    when: { op: '==', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: activeSupport }
    then: { op: '*', left: { ref: zoneProp, zone: $zone, prop: population }, right: 2 }
    else: { ref: zoneProp, zone: $zone, prop: population }
```

**VC/Opposition blocks** (checkpoint `vc-victory` + margin seat `'3'`):

```yaml
valueExpr:
  if:
    when: { op: '==', left: { ref: markerState, space: $zone, marker: supportOpposition }, right: activeOpposition }
    then: { op: '*', left: { ref: zoneProp, zone: $zone, prop: population }, right: 2 }
    else: { ref: zoneProp, zone: $zone, prop: population }
```

## Affected Blocks

| # | Location | Type | Line |
|---|----------|------|------|
| 1 | `us-victory` checkpoint | Total Support sum | ~37 |
| 2 | `vc-victory` checkpoint | Total Opposition sum | ~221 |
| 3 | Margin seat `'0'` | Total Support sum | ~265 |
| 4 | Margin seat `'3'` | Total Opposition sum | ~398 |

## Files Modified

- `data/games/fire-in-the-lake/90-terminal.md` — 4 `valueExpr` changes

## Verification

1. `pnpm turbo build` passes
2. `pnpm turbo test` passes (existing FITL tests compile via `compileProductionSpec()`)
3. Manual review: 4 changed `valueExpr` blocks match the correct doubling formula

## Out of Scope

- POLITBURO/SOVEREIGNTY combined-player variant rules (Rule 1.5)
- NVA and ARVN victory calculations (unaffected — use Control, not Support/Opposition)

## Outcome

**Completed**: 2026-02-23

### Changes Made
- `data/games/fire-in-the-lake/90-terminal.md` — 4 `valueExpr` blocks updated with `if/when/then/else` conditional to double population for active support/opposition states
- `packages/engine/test/integration/fitl-active-doubling-victory.test.ts` — 10 new tests covering:
  - US victory checkpoint: active support doubles population, passive does not, mixed active/passive sums correctly, comparative active-vs-passive threshold behavior
  - VC victory checkpoint: active opposition doubles population, passive does not
  - Final-coup margin ranking: active support/opposition produces higher margins than passive, exact margin values verified for multi-zone mixed scenarios
  - Neutral spaces contribute zero to both support and opposition totals

### Verification Results
- `pnpm turbo build` passes
- `pnpm turbo test` passes — 2355 tests (10 new), 0 failures
