# Spec 56 — Human-Readable Action Tooltips

**Status**: ✅ COMPLETED
**Depends on**: Spec 55 (Tooltip Pipeline)
**Ticket prefix**: LEGACTTOOHUM

---

## Motivation

Spec 55 implemented the tooltip pipeline (EffectAST → TooltipMessage → ContentPlan → RuleCard). While structurally sound, three classes of bugs produce unreadable output:

1. **`<value>` placeholders** in conditions — missing Reference type coverage
2. **Ambiguous `Select up to N items`** — no domain context in ChooseN normalization
3. **Raw macro binding paths** — compiler-internal names leaking into user-visible text

This spec fixes all three systematically.

---

## Problem 1: `<value>` Placeholders

### Root Cause

`humanizeValue()` in `tooltip-modifier-humanizer.ts` and `stringifyValueExpr()` in `tooltip-normalizer.ts` / `tooltip-normalizer-compound.ts` only handle 4 of 12 Reference types. Missing: `markerState`, `zoneCount`, `tokenProp`, `assetField`, `zoneProp`, `activePlayer`, `tokenZone`, `zoneVar`. All fall through to `<value>` or `<ref>`.

### Solution — Contextual Descriptions

**A. Extract canonical `stringifyValueExpr`** into `tooltip-value-stringifier.ts`. Handle all 12 ref types:

| Ref type | Output |
|----------|--------|
| `gvar` | `expr.var` |
| `pvar` | `expr.var` |
| `binding` | `expr.displayName ?? expr.name` |
| `globalMarkerState` | `expr.marker` |
| `markerState` | `"{marker} of {space}"` |
| `zoneCount` | `"pieces in {zone}"` |
| `tokenProp` | `"{token}.{prop}"` |
| `assetField` | `"{field}"` |
| `zoneProp` | `"{zone}.{prop}"` |
| `activePlayer` | `"activePlayer"` |
| `tokenZone` | `"zone of {token}"` |
| `zoneVar` | `"{var} of {zone}"` |

Also handle arithmetic (`{left} {op} {right}`) and aggregates (`count/sum of ...`). Remove duplicated copies from normalizer and normalizer-compound.

**B. Update `humanizeValue`** in `tooltip-modifier-humanizer.ts` — same ref coverage but with `resolveLabel()` for verbalization-aware display names. E.g., `markerState` → `"{resolveLabel(marker)} of {resolveLabel(space)}"`.

**C. Update `extractValueNames`** — add extraction for missing ref types so suppression checks cover them.

---

## Problem 2: Ambiguous `Select up to N items`

### Root Cause

`normalizeChooseN()` classifies all non-space, non-token queries as `target: 'items'` with no domain context. Template realizer renders `Select up to N items`.

### Solution

**A. Expand `SelectMessage.target`** vocabulary: `'spaces' | 'zones' | 'items' | 'players' | 'values' | 'markers' | 'rows'`

**B. Add `optionHints?: readonly string[]`** to `SelectMessage` — populated from enum query values.

**C. Update `normalizeChooseN` classification**:

| Query type | target |
|------------|--------|
| `mapSpaces`, `zones`, `adjacentZones`, `connectedZones`, `tokenZones` | `'spaces'` |
| `tokensInZone`, `tokensInMapSpaces`, `tokensInAdjacentZones` | `'zones'` |
| `players` | `'players'` |
| `intsInRange`, `intsInVarRange` | `'values'` |
| `globalMarkers` | `'markers'` |
| `assetRows` | `'rows'` |
| `enums` | `'items'` + populate `optionHints` |
| fallback | `'items'` |

**D. Update `realizeSelect`**: When `optionHints` present (<=5 items), render `"Choose from: {options}"`. Expand `singularTarget` for new target types.

---

## Problem 3: Raw Macro Binding Names

### Root Cause

After macro expansion, binding names carry compiler paths like `__macro_place_from_available_or_map_action Pipelines_0__stages_1__effects_0__piece`. These leak into `tokenFilter` on MoveMessage/RemoveMessage.

### Solution — Semantic Summarization

**A. New `SummaryMessage` type** in `tooltip-ir.ts`:

```typescript
interface SummaryMessage extends MessageBase {
  readonly kind: 'summary';
  readonly text: string;
  readonly macroClass?: string;
}
```

**B. Update `tryMacroOverride`** to produce `SummaryMessage` instead of `SetMessage`. Add `{slotName}` interpolation using `VerbalizationMacroEntry.slots`.

**C. Add `sanitizeBindingName()`** — for macro-expanded binding names that leak past the override:

- Detect `__macro_` prefix
- Extract final semantic segment (after last `__`)
- Pass through `resolveLabel()`
- Apply in `stringifyValueExpr` (binding refs), `normalizeRemoveByPriority` (group.bind), and wherever binding names surface as user-visible strings.

**D. Update content planner** — add `'summary'` to `SUB_STEP_HEADER_BY_KIND` with contextual header from `macroClass`.

**E. Update template realizer** — add `realizeSummary(msg) => msg.text` and dispatch entry.

---

## Ticket Breakdown

| # | Title | Scope |
|---|-------|-------|
| 001 | Canonical ValueExpr stringification | Extract `tooltip-value-stringifier.ts`, handle all 12 ref types + arithmetic + aggregates. Remove duplicates from normalizer and normalizer-compound. |
| 002 | Condition humanization for all ref types | Update `humanizeValue` + `extractValueNames` in modifier-humanizer. |
| 003 | ChooseN domain context | Expand `SelectMessage.target`, add `optionHints`, update `normalizeChooseN` + `realizeSelect`. |
| 004 | SummaryMessage + macro override | New IR type, update `tryMacroOverride`, slot interpolation, planner + realizer. |
| 005 | Binding name sanitization | `sanitizeBindingName()`, apply across normalizer and compound normalizer. |

---

## Critical Files

| File | Changes |
|------|---------|
| `packages/engine/src/kernel/tooltip-ir.ts` | Expand `SelectMessage.target`, add `optionHints`, add `SummaryMessage` |
| `packages/engine/src/kernel/tooltip-value-stringifier.ts` | **NEW** — canonical `stringifyValueExpr` + `stringifyNumericExpr` + `stringifyZoneRef` |
| `packages/engine/src/kernel/tooltip-normalizer.ts` | Import from value-stringifier, remove local copies |
| `packages/engine/src/kernel/tooltip-normalizer-compound.ts` | Import from value-stringifier, remove local copies; update `normalizeChooseN`; update `tryMacroOverride` |
| `packages/engine/src/kernel/tooltip-modifier-humanizer.ts` | Update `humanizeValue` + `extractValueNames` for all ref types |
| `packages/engine/src/kernel/tooltip-template-realizer.ts` | Update `realizeSelect`, add `realizeSummary` |
| `packages/engine/src/kernel/tooltip-content-planner.ts` | Add `'summary'` to `SUB_STEP_HEADER_BY_KIND` |
| `packages/engine/src/kernel/verbalization-types.ts` | No changes (slots field already exists) |

---

## Testing Strategy

### Unit Tests (per ticket)

- `tooltip-value-stringifier.test.ts` — each ref type, arithmetic, aggregates
- `tooltip-modifier-humanizer.test.ts` — each ref type in condition context
- `tooltip-normalizer-compound.test.ts` — chooseN classification for all query types
- `tooltip-template-realizer.test.ts` — expanded targets, optionHints, SummaryMessage
- `tooltip-binding-sanitizer.test.ts` — macro prefix stripping, non-macro passthrough

### Integration Tests

- FITL Train: `<value> is city or <value> is province` → readable zone property conditions
- FITL Train: `Select up to 2 items` → `Choose from: Place Irregulars, Place at Base`
- FITL Sweep: macro binding path → clean "Place US Troops" summary
- Texas Hold'em: no regressions

### Verification

```bash
pnpm turbo build && pnpm turbo test
```

## Outcome

- **Completion date**: 2026-03-08
- **What changed**: All 5 tickets (HUMREAACTTOO-001 through 005) implemented. Canonical ValueExpr stringifier with all 12 ref types, condition humanization for all ref types, ChooseN domain context with expanded SelectMessage targets and optionHints, SummaryMessage + macro override with slot interpolation, and binding name sanitization with split `stripMacroBindingPrefix`/`sanitizeBindingName` functions.
- **Deviations from original plan**: Ticket 005 split the proposed single `sanitizeBindingName` into two functions to avoid double-processing with downstream `resolveLabel` in the template realizer.
- **Verification**: 4449 engine tests pass. Typecheck clean.
