# Spec 57 — Action Tooltip Humanization Gaps

## Status: COMPLETED

## Problem

The tooltip pipeline (`EffectAST → TooltipMessage IR → ContentPlan → RuleCard`) generates human-readable action instructions from DSL definitions. The architecture is sound but has 5 coverage gaps producing unreadable output:

1. **`<value>` placeholders** in conditions/modifiers — incomplete `ValueExpr` humanization leaves raw placeholder tokens in display text.
2. **Vague "Select up to N items"** — `classifyQueryTarget()` doesn't cover enum, binding, or concat query types, and a grammar bug produces "1 items".
3. **`__macro_*` binding paths** leaking into display text — `stringifyZoneRef()` doesn't handle binding refs, and not all normalizer paths call `stripMacroBindingPrefix`.
4. **Duplicate lines** from macro expansion — no dedup pass in the content planner collapses structurally identical messages.
5. **Conditions baked into `SelectMessage` filter strings** — the filter is pre-rendered text, so the realizer can't re-resolve labels with full `LabelContext`.

## Goal

Close all 5 gaps so that every tooltip produced by the pipeline reads as natural English with no placeholder leaks, no raw binding paths, no duplicates, and proper grammar.

## Design Constraints

- No game-specific logic — all changes are in the generic tooltip pipeline.
- Backwards-compatible — existing tooltip output that is already correct must not regress.
- All changes are in `packages/engine/src/kernel/tooltip-*.ts` files.

## Dependency Graph

```
TIPHUMAN-001 (value humanization)
    ├──→ TIPHUMAN-002 (select targets + grammar)   ─┐
    ├──→ TIPHUMAN-003 (macro binding sanitization)   ├──→ TIPHUMAN-005 (structured conditions)
    └──→ TIPHUMAN-004 (dedup pass)                  ─┘
```

001 must land first. 002, 003, 004 are independent of each other. 005 depends on 001's `humanizeValueExpr`.

---

## TIPHUMAN-001: Unify value humanization with LabelContext

### Problem

Multiple call-sites stringify `ValueExpr` nodes independently, producing inconsistent output. Some shapes (arithmetic, aggregate, concat, conditional) fall through to a raw `<value>` placeholder. A single authoritative humanizer with label resolution is needed.

### Deliverables

1. **Create `humanizeValueExpr(expr: ValueExpr, ctx: LabelContext): string`** in `packages/engine/src/kernel/tooltip-value-stringifier.ts`.
   - Handles all `ValueExpr` shapes: `literal`, `varRef`, `arithmetic`, `aggregate`, `concat`, `conditional`, `bindingRef`, `count`, `query`.
   - Resolves labels via `LabelContext` from `packages/engine/src/kernel/tooltip-label-resolver.ts`.
   - Falls back to a descriptive string (e.g. `"total of <field>"`) rather than raw `<value>`.

2. **Delete the duplicate `humanizeValue()` helper** from `packages/engine/src/kernel/tooltip-modifier-humanizer.ts` and replace all call-sites with `humanizeValueExpr`.

3. **Unit tests** for every `ValueExpr` shape, including edge cases (nested arithmetic, aggregate over binding, concat with mixed literal/ref).

### Files

| File | Change |
|------|--------|
| `packages/engine/src/kernel/tooltip-value-stringifier.ts` | Add `humanizeValueExpr`, export it |
| `packages/engine/src/kernel/tooltip-modifier-humanizer.ts` | Remove duplicate `humanizeValue`, rewire to `humanizeValueExpr` |
| `packages/engine/src/kernel/tooltip-label-resolver.ts` | Ensure `LabelContext` is exported and usable by the new function |

### Acceptance Criteria

- [ ] `humanizeValueExpr` handles all `ValueExpr` discriminant shapes without producing `<value>`.
- [ ] No duplicate `humanizeValue` function remains in the codebase.
- [ ] All existing tooltip tests continue to pass (no regression).
- [ ] New unit tests cover every `ValueExpr` shape with at least one test each.

---

## TIPHUMAN-002: Enrich SelectMessage targets and fix grammar

### Problem

`classifyQueryTarget()` only handles a subset of query types. Enum, binding, and concat queries fall through to the generic `'items'` label. Additionally, "Select up to 1 items" is ungrammatical.

### Deliverables

1. **Expand `classifyQueryTarget()`** in `packages/engine/src/kernel/tooltip-normalizer-compound.ts` to classify enum, binding, and concat query types into meaningful target labels.

2. **Expand `SelectMessage.target` union type** in `packages/engine/src/kernel/tooltip-ir.ts` to include `'options'` and `'tokens'` (and any other needed labels).

3. **Fix singular/plural grammar** in `packages/engine/src/kernel/tooltip-template-realizer.ts`:
   - "Select up to 1 item" (not "1 items").
   - Use proper pluralization for all target labels.

4. **Unit tests** for each new query type classification and for singular/plural edge cases.

### Files

| File | Change |
|------|--------|
| `packages/engine/src/kernel/tooltip-ir.ts` | Expand `SelectMessage.target` union |
| `packages/engine/src/kernel/tooltip-normalizer-compound.ts` | Expand `classifyQueryTarget()` |
| `packages/engine/src/kernel/tooltip-template-realizer.ts` | Fix singular/plural rendering |

### Acceptance Criteria

- [ ] Enum, binding, and concat queries produce descriptive target labels (not `'items'`).
- [ ] "Select up to 1 ..." uses singular noun form.
- [ ] All new target labels have corresponding pluralization rules in the realizer.
- [ ] Unit tests cover each new classification path and the singular edge case.

---

## TIPHUMAN-003: Consistent macro binding sanitization

### Problem

`stringifyZoneRef()` in `tooltip-value-stringifier.ts` doesn't handle binding refs — it falls back to `'<expr>'`. Not all normalizer paths call `stripMacroBindingPrefix`, so `__macro_*` prefixed identifiers leak into display text.

### Deliverables

1. **Enhance `stringifyZoneRef()`** in `packages/engine/src/kernel/tooltip-value-stringifier.ts` to detect and humanize binding refs (strip `__macro_` prefix, convert to readable label).

2. **Audit all normalizer paths** in `packages/engine/src/kernel/tooltip-normalizer.ts` and ensure every path that can encounter a macro binding calls `stripMacroBindingPrefix` before emitting display text.

3. **Unit tests** with `__macro_`-prefixed bindings, confirming no raw `__macro_*` strings appear in output.

### Files

| File | Change |
|------|--------|
| `packages/engine/src/kernel/tooltip-value-stringifier.ts` | Handle binding refs in `stringifyZoneRef()` |
| `packages/engine/src/kernel/tooltip-normalizer.ts` | Ensure all paths sanitize macro bindings |

### Acceptance Criteria

- [ ] No tooltip output contains `__macro_` prefixed strings.
- [ ] `stringifyZoneRef()` produces human-readable text for binding refs.
- [ ] All normalizer code paths that can encounter bindings call `stripMacroBindingPrefix`.
- [ ] Unit tests confirm sanitization across all affected paths.

---

## TIPHUMAN-004: Deduplicate structurally identical messages

### Problem

Macro expansion can produce structurally identical `TooltipMessage` entries (same effect, same wording, different `astPath` or `macroOrigin`). These appear as duplicate lines in the final rule card.

### Deliverables

1. **Add `deduplicateMessages(messages: TooltipMessage[]): TooltipMessage[]`** in `packages/engine/src/kernel/tooltip-content-planner.ts`.
   - Fingerprint each message ignoring `astPath` and `macroOrigin` metadata fields.
   - Collapse duplicates, keeping the first occurrence.

2. **Integrate the dedup pass** into the content planner pipeline, after message collection and before grouping/rendering.

3. **Unit tests** with deliberately duplicated messages confirming collapse, and with near-duplicates (same text, different semantic content) confirming they are preserved.

### Files

| File | Change |
|------|--------|
| `packages/engine/src/kernel/tooltip-content-planner.ts` | Add `deduplicateMessages()`, integrate into pipeline |

### Acceptance Criteria

- [ ] Structurally identical messages (differing only in `astPath`/`macroOrigin`) are collapsed to one.
- [ ] Messages with different semantic content are preserved even if their text is similar.
- [ ] Dedup pass is positioned correctly in the pipeline (after collection, before rendering).
- [ ] Unit tests cover exact duplicates, near-duplicates, and no-duplicate inputs.

---

## TIPHUMAN-005: Structured conditions on SelectMessage

### Problem

`SelectMessage.filter` is a pre-rendered string. When the realizer needs to re-resolve condition labels with full `LabelContext` (e.g., to replace zone IDs with display names), it can't — the structure is lost.

### Deliverables

1. **Add optional `conditionAST: ConditionAST` field** to `SelectMessage` in `packages/engine/src/kernel/tooltip-ir.ts`.

2. **Store raw condition AST** in the normalizer (`packages/engine/src/kernel/tooltip-normalizer-compound.ts`) alongside the existing pre-rendered `filter` string.

3. **Re-render conditions in the realizer** (`packages/engine/src/kernel/tooltip-template-realizer.ts`): when `conditionAST` is present and a `LabelContext` is available, re-render the condition with full label resolution instead of using the pre-rendered string.

4. **Export `humanizeConditionWithLabels(ast: ConditionAST, ctx: LabelContext): string`** from `packages/engine/src/kernel/tooltip-modifier-humanizer.ts`, using `humanizeValueExpr` from TIPHUMAN-001 for embedded value expressions.

5. **Unit tests** comparing pre-rendered vs. re-rendered conditions, confirming label resolution produces readable output.

### Files

| File | Change |
|------|--------|
| `packages/engine/src/kernel/tooltip-ir.ts` | Add `conditionAST` to `SelectMessage` |
| `packages/engine/src/kernel/tooltip-normalizer-compound.ts` | Store raw AST alongside filter string |
| `packages/engine/src/kernel/tooltip-template-realizer.ts` | Re-render conditions with `LabelContext` when AST present |
| `packages/engine/src/kernel/tooltip-modifier-humanizer.ts` | Export `humanizeConditionWithLabels` |

### Acceptance Criteria

- [ ] `SelectMessage` carries optional `conditionAST` field without breaking existing consumers.
- [ ] Normalizer populates `conditionAST` for all select messages that have conditions.
- [ ] Realizer prefers re-rendered condition text when `conditionAST` and `LabelContext` are available.
- [ ] Falls back to pre-rendered `filter` string when AST is absent (backwards compatibility).
- [ ] `humanizeConditionWithLabels` uses `humanizeValueExpr` for embedded value nodes.
- [ ] Unit tests verify label resolution produces human-readable condition text.

## Outcome

- **Completion date**: 2026-03-08
- **What changed**: All 5 tooltip humanization gaps closed (ACTTOOHUMGAP-001 through 006). Canonical `humanizeValueExpr` unified value humanization with LabelContext. Select targets enriched with grammar fixes. Macro binding sanitization made consistent. Dedup pass added to content planner. Structured conditions on SelectMessage implemented. Blocker-extractor consolidated to use canonical humanizer.
- **Deviations**: ACTTOOHUMGAP-006 (blocker consolidation) was added during implementation as a natural follow-on to close the last duplicate value humanizer.
- **Verification**: 507/507 tooltip tests pass, typecheck clean, no `<value>` placeholders or `__macro_` leaks in output.
