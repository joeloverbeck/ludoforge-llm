# Spec 62: Prioritized Sourcing Query

**Status**: ✅ COMPLETED
**Priority**: P0
**Complexity**: M
**Dependencies**: Spec 25, Spec 25b
**Estimated effort**: 2-3 days
**Source sections**: FITL card implementation gap discovered during card 87 (`Nguyen Chanh Thi`)

## Status Note

This spec remains the source of truth for the `prioritized` query itself.

Its original interaction-model assumptions about `chooseN` were later found to be too optimistic. The incremental multi-selection protocol required to make prioritized legality clean and engine-owned is specified in [Spec 62b](/home/joeloverbeck/projects/ludoforge-llm/specs/62b-incremental-choice-protocol.md).

## Overview

Add a new `prioritized` variant to the `OptionsQuery` union that models ordered-tier sourcing with optional per-qualifier priority. Combined with tier-aware legality in `chooseN`, this lets the kernel enforce rules like FITL Rule 1.4.1 without any game-specific logic in the engine.

The player sees **one unified `chooseN` choice** — not sequential stages. Lower-tier items are dynamically marked illegal while same-qualifier higher-tier items remain available.

After this spec is implemented, card 87 (`Nguyen Chanh Thi`) must be reworked to use the new `prioritized` query.

## Rule 1.4.1 Verbatim (Source of Truth)

> Important: Players while executing an Operation, Special Activity, or Event to place their own forces may take them from elsewhere on the map (including a Tunneled Base, losing the Tunnel marker, 1.4.4) **if and only if the desired force type is not Available**. EXCEPTION: The US player may do so only with US-led Irregulars and any ARVN forces, not with US Troops nor with US Bases.

The key phrase is "if and only if the desired force **type** is not Available" — the qualifier is the piece's `type` property, and the fallback is per-qualifier, not global.

## Problem Statement

Current declarative sourcing can express:

- selecting from one source
- selecting from a concatenated pool of sources (`concat` query)
- filtering pieces by faction/type/zone

Current declarative sourcing **cannot** express:

- "take pieces of the desired type from Available; only if that type is unavailable there, source that same type from map spaces"
- "the fallback source is conditional on insufficiency of prior sources **per qualifier value**"
- "all of this is one unified player choice, not sequential stages"

As a result, card 87 currently uses a `concat` query that pools Available and map sources freely, allowing the player to select on-map ARVN pieces even when same-type ARVN pieces remain Available. This violates Rule 1.4.1.

## Existing Precedents

### `removeByPriority` (effects-control.ts:316-438)

The kernel already has `removeByPriority` — tier-ordered consumption with a budget over groups. Each group has an `over` query; the runtime walks groups in order, consuming from each until the budget is exhausted. The new `prioritized` query is conceptually the **selection-side counterpart** of `removeByPriority`: where `removeByPriority` removes tokens in tier order, `prioritized` + `chooseN` **selects** tokens in tier order.

### `place-from-available-or-map` macro (20-macros.md:1971-2034)

This macro already implements Rule 1.4.1 for **auto-placement** using staged `forEach` + conditional `chooseN`. It works for non-interactive placement (e.g., operations/special activities that auto-place). However, card 87 requires **interactive piece selection** — the player chooses which 3 ARVN pieces to place. The macro's staged `forEach` approach cannot express "one unified multi-select choice with tier-aware legality." That is why a new query-level primitive is needed.

## Proposed Design

### New `OptionsQuery` variant: `prioritized`

```typescript
| {
    readonly query: 'prioritized';
    readonly tiers: readonly [OptionsQuery, ...OptionsQuery[]];
    readonly qualifierKey?: string; // token property name, e.g. 'type'
  }
```

This extends the existing `OptionsQuery` union in `types-ast.ts` (lines 203-265) with one new variant.

### Semantics

#### In `evalQuery` (eval-query.ts)

Evaluate all tiers in order and concatenate the results. The result set is a flat array of all candidates from all tiers.

`evalQuery` stays a pure query evaluator. It owns:

- deterministic left-to-right tier ordering
- runtime-shape homogeneity across tiers
- combined-result bounds enforcement

It does **not** attach hidden per-result tier metadata. Tier-aware legality should be derived from the `prioritized` query AST at the `chooseN` legality layer, not by mutating `QueryResult` items or threading a side-channel map through query evaluation.

#### In `chooseN` legality (legal-choices.ts)

When the options of a `chooseN` come from a `prioritized` query, tier-aware legality applies:

**With `qualifierKey`** (e.g., `qualifierKey: 'type'`):
- Extract the qualifier value Q from each candidate (e.g., `token.props.type`)
- An item from tier N with qualifier value Q is **illegal** while any unselected item from tiers 1..N-1 with qualifier value Q exists
- As the player selects items (multi-select), legality is dynamically re-evaluated per remaining candidates

**Without `qualifierKey`** (simpler case):
- An item from tier N is **illegal** while any unselected item from tiers 1..N-1 exists
- Equivalent to "exhaust tier 1 before tier 2, exhaust tier 2 before tier 3, etc."

**Example**: 2 ARVN Troops available, 1 ARVN Police available, 5 ARVN Troops on map near Hue. Player must select 3 ARVN pieces with `qualifierKey: 'type'`:
- All 2 Available Troops and 1 Available Police are legal (tier 1)
- Map Troops are **illegal** (tier 2, qualifier `troop`, and tier 1 still has Troops)
- Player selects both Available Troops — now map Troops become **legal** (tier 1 exhausted for qualifier `troop`)
- Player selects 1 map Troop to reach count 3. Available Police was always legal since no tier-1 Police conflict exists... wait, Police IS in tier 1, so map Police (tier 2) would be illegal while Available Police exists. But Available Troops being exhausted only unlocks map Troops. Each qualifier is independent.

### UX Specification

The player sees **one unified `chooseN` multi-select interface**. All candidates from all tiers appear in the option list. Items that are currently illegal due to tier priority are marked as illegal (grayed out in the UI). As the player makes selections, legality updates dynamically. This is NOT sequential stages — it is one choice with constrained legality.

### Combination Pruning (Performance)

`chooseN` legality probing has `MAX_CHOOSE_N_OPTION_LEGALITY_COMBINATIONS = 1024` (legal-choices.ts:54). Tier-aware legality can be computed as a **pre-filter before combination enumeration**, not during it:

1. Before enumerating combinations, compute which items are currently illegal based on tier priority
2. Remove illegal items from the candidate set
3. Enumerate combinations only over the legal subset
4. This reduces the combination space rather than expanding it

When legality depends on the selection state (dynamic re-evaluation during multi-select), the runtime already handles this via the existing `chooseN` incremental selection model — each selection step re-evaluates legality on the remaining candidates.

## Card 87 Rewrite

With the `prioritized` query, card 87's unshaded `chooseN` becomes:

```yaml
- chooseN:
    bind: $nguyenChanhThiArvnPieces
    options:
      query: prioritized
      qualifierKey: type
      tiers:
        - query: tokensInZone
          zone: available-ARVN:none
          filter:
            prop: faction
            op: eq
            value: ARVN
        - query: tokensInMapSpaces
          filter:
            op: and
            args:
              - { prop: faction, op: eq, value: ARVN }
              - field: { kind: tokenZone }
                op: in
                value:
                  - hue:none
                  - da-nang:none
                  - quang-nam:none
                  - quang-tri-thua-thien:none
                  - quang-tin-quang-ngai:none
                  - central-laos:none
                  - southern-laos:none
                  - loc-hue-da-nang:none
                  - loc-hue-khe-sanh:none
                  - loc-da-nang-dak-to:none
                  - loc-da-nang-qui-nhon:none
    min:
      op: min
      left: 3
      right:
        aggregate:
          op: count
          query:
            query: prioritized
            qualifierKey: type
            tiers:
              - query: tokensInZone
                zone: available-ARVN:none
                filter: { prop: faction, op: eq, value: ARVN }
              - query: tokensInMapSpaces
                filter:
                  op: and
                  args:
                    - { prop: faction, op: eq, value: ARVN }
                    - field: { kind: tokenZone }
                      op: in
                      value: [hue:none, da-nang:none, quang-nam:none, quang-tri-thua-thien:none, quang-tin-quang-ngai:none, central-laos:none, southern-laos:none, loc-hue-da-nang:none, loc-hue-khe-sanh:none, loc-da-nang-dak-to:none, loc-da-nang-qui-nhon:none]
    max:
      op: min
      left: 3
      right:
        aggregate:
          op: count
          query:
            query: prioritized
            qualifierKey: type
            tiers:
              - query: tokensInZone
                zone: available-ARVN:none
                filter: { prop: faction, op: eq, value: ARVN }
              - query: tokensInMapSpaces
                filter:
                  op: and
                  args:
                    - { prop: faction, op: eq, value: ARVN }
                    - field: { kind: tokenZone }
                      op: in
                      value: [hue:none, da-nang:none, quang-nam:none, quang-tri-thua-thien:none, quang-tin-quang-ngai:none, central-laos:none, southern-laos:none, loc-hue-da-nang:none, loc-hue-khe-sanh:none, loc-da-nang-dak-to:none, loc-da-nang-qui-nhon:none]
```

The remainder of card 87 (destination selection, movement, support shift) is unchanged.

**Key difference from current implementation**: The current `concat` query pools both sources freely. The new `prioritized` query enforces that map-sourced ARVN pieces of a given type are only selectable when Available pieces of that same type are exhausted.

## Goals

1. Add a `prioritized` OptionsQuery variant that models ordered fallback selection.
2. Keep `GameDef`, simulation, and runtime fully game-agnostic.
3. Preserve game-specific rules in GameSpecDoc/YAML only.
4. Implement as a query-level + legality-level concern, not compiler lowering.
5. One unified player choice, not sequential stages.

## Non-Goals

- Do not implement FITL-specific hardcoded "desired type" rules in the kernel.
- Do not add special event-only codepaths.
- Do not solve visual presentation concerns in this spec.
- Do not implement extensible qualifier extraction (zone properties, bound value expressions, table lookups). Start with optional token property name only; extend later if a real use case emerges (YAGNI).
- Do not use compiler lowering into sequential `chooseN` stages — this changes UX and adds unnecessary complexity.

## Design Requirements

### A. Game-agnostic IR

The `prioritized` query variant is fully generic. It composes existing `OptionsQuery` variants as tiers and adds an optional `qualifierKey` string. No FITL-specific concepts leak into the type system.

### B. No hidden rule coupling

The runtime does not infer FITL concepts. `qualifierKey: 'type'` is authored data — the engine just reads a token property name. Any game could use `qualifierKey: 'color'` or `qualifierKey: 'rank'` for their own prioritized sourcing needs.

### C. Qualifier scope

Qualifier is an optional token property name (`qualifierKey?: string`). This covers Rule 1.4.1 ("desired force type") and any analogous rule in other games that qualifies by a single token property. If a future game needs multi-property qualifiers or computed qualifiers, that extension can be added then.

### D. Diagnostics

Compilation and validation must reject:

- `prioritized` query with empty `tiers` array
- `qualifierKey` referencing a property not present on any token type in the tier queries (warning, not error — runtime may have dynamic tokens)

### E. Testability

The design supports:

- unit tests on `evalQuery` for the `prioritized` variant (concatenation, empty-tier behavior, passthrough behavior, bounds enforcement)
- unit tests on `chooseN` legality with tier-aware constraints
- unit tests on dynamic re-evaluation as selections are made
- integration tests on real FITL cards (card 87)
- synthetic fixture tests demonstrating prioritized sourcing outside FITL terminology

## Invariants

1. Prioritized sourcing behavior is deterministic.
2. Lower-priority tiers never contribute while higher tiers can still satisfy the same qualified remainder.
3. Qualifier matching is driven entirely by authored data (`qualifierKey` property name).
4. No FITL-specific identifiers appear in shared compiler/kernel logic.
5. Resolved final bindings are stable and consumable by ordinary downstream effects.
6. Legal choice generation and move application agree on admissibility.
7. The player sees one unified choice, not sequential stages.

## Implementation Plan

1. **Add `prioritized` variant to `OptionsQuery`** in `types-ast.ts`. Add corresponding Zod schema in the compiler's validation layer.
2. **Implement `evalQuery` handler** for `prioritized`: evaluate each tier's sub-query, concatenate results, and enforce the same recursive-query runtime contracts as `concat`.
3. **Implement tier-aware legality in `chooseN`** in `legal-choices.ts`: when options originate from a `prioritized` query, compute per-item legality based on tier priority and qualifier. Use pre-filtering to avoid combination explosion.
4. **Add unit tests**: query evaluation, legality computation, dynamic re-evaluation, edge cases (empty tiers, missing qualifier property, partial fulfillment).
5. **Rework card 87** to use `prioritized` query instead of `concat`.
6. **Add integration tests**: card 87 exact Rule 1.4.1 behavior, synthetic non-FITL fixture.

## Required Tests

### Unit Tests

Query evaluation:
- `prioritized` with 2 tiers returns concatenated results
- `prioritized` with 3 tiers returns concatenated results in tier order
- `prioritized` with an empty tier returns only results from non-empty tiers
- single-tier `prioritized` behaves like a passthrough
- combined `maxQueryResults` enforcement applies to the flattened result
- `qualifierKey` does not change `evalQuery` output

Legality (with `qualifierKey`):
- tier-2 item with qualifier Q is illegal while tier-1 item with qualifier Q is unselected
- tier-2 item with qualifier Q becomes legal once all tier-1 items with qualifier Q are selected
- tier-2 item with qualifier R is legal even if tier-1 items with qualifier Q remain (independent qualifiers)
- partial fulfillment across tiers works correctly
- dynamic re-evaluation after each selection step

Legality (without `qualifierKey`):
- tier-2 items are illegal while any tier-1 item is unselected
- tier-2 items become legal once all tier-1 items are selected

### Integration Tests

FITL:
- card 87 unshaded: with Available ARVN Troops, player cannot select map ARVN Troops
- card 87 unshaded: with no Available ARVN Troops, player can select map ARVN Troops
- card 87 unshaded: qualifier independence — Available Police status does not affect map Troop legality

Non-FITL/generic:
- synthetic spec fixture demonstrating prioritized sourcing with a non-FITL qualifier (e.g., `qualifierKey: 'color'`)

## Acceptance Criteria

This spec is complete when:

1. `OptionsQuery` union includes a `prioritized` variant with optional `qualifierKey`.
2. `evalQuery` correctly evaluates `prioritized` queries by concatenating tier results without embedding legality metadata in query results.
3. `chooseN` legality correctly enforces tier priority with per-qualifier independence.
4. Card 87 is re-authored to use `prioritized` query instead of `concat`.
5. Card 87 no longer allows selecting on-map ARVN pieces of a type that is still Available.
6. The player experiences one unified multi-select choice, not sequential stages.
7. All unit and integration tests pass.
8. The full relevant engine test suite passes.
9. No FITL-specific identifiers appear in any engine source file touched by this implementation.

## Follow-up Requirement

After implementing this spec, the current implementation of card 87 in:

- [065-096.md](/home/joeloverbeck/projects/ludoforge-llm/data/games/fire-in-the-lake/41-events/065-096.md)

must be reviewed and reworked to use the new sourcing model. The present implementation should be treated as an interim encoding that intentionally over-approximates Rule 1.4.1 and must not be considered final once this capability exists.

## Outcome

- **Completion date**: 2026-03-14
- **What actually changed**:
  - Added the generic `prioritized` `OptionsQuery` variant and compiler/runtime support.
  - Enforced tier-aware `chooseN` legality in the kernel, including qualifier-aware behavior and incremental add/remove/confirm recomputation.
  - Re-authored FITL card 87 to use `prioritized` in production data.
  - Added generic synthetic prioritized integration coverage and FITL card 87 integration coverage, then strengthened the FITL suite with an explicit “no Available ARVN Troops” legality case during finalization.
- **Deviations from original plan**:
  - The synthetic proof point stayed as an inline test fixture rather than a shared fixture file because there was no demonstrated reuse need.
  - Final integration coverage lived in existing suites rather than the exact file split sketched in the original spec/ticket.
- **Verification results**:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm turbo test`
  - `pnpm turbo lint`
  - `pnpm turbo typecheck`
