# Spec 205 P0 — ARVN Selector Vocabulary Baseline

**Ticket**: `archive/tickets/205FITLARVSEL-001.md`
**Date**: 2026-06-01
**Status**: completed P0 baseline for downstream authoring

## Summary

Spec 205's selector-body examples use the right architectural target — item-local
`zoneProp`, `lookup`, and token-count features — but the concrete selector
policy-expression surface is not the same as the kernel condition/value-expression
surface used inside `postState.predicate.condition`.

For selector `quality.components[].value`, use these live authoring forms:

- Existing zone attributes: `zoneProp: { zone: { ref: selector.item.key }, prop: <attribute> }`.
- Marker state: inline `lookup` over `policyState.zones[*].markers`.
- Item-local unfiltered owner-bucket token aggregates: `zoneTokenAgg` with
  `zone: { ref: selector.item.key }`.
- Already shipped global/projected quality tiebreakers: existing `feature.*` refs, only where the spec explicitly preserves them.

Do not copy Spec 205's inline `aggregate: { query: { query: tokensInZone, ... } }`
examples directly into selector components. That shape is valid in condition/value
contexts such as `postState.predicate.condition`, while selector policy
expressions do not currently expose filtered `tokensInZone` counts.

## Evidence

- `data/games/fire-in-the-lake/40-content-data-assets.md:4-220` authors map
  zone attributes including `population`, `econ`, `terrainTags`, `country`,
  `coastal`, and `category`.
- `data/games/fire-in-the-lake/92-agents.md:576-609` uses selector-scope
  `lookup` for `markers.supportOpposition` and selector-scope `zoneProp` for
  `population`.
- `data/games/fire-in-the-lake/92-agents.md:612-636` uses selector-scope
  `zoneProp` for `econ` and `category`.
- `packages/engine/src/agents/policy-expr.ts:60-92` lists policy-expression
  operators. It includes `zoneTokenAgg`, `globalTokenAgg`, `zoneProp`, and
  `lookup`; it does not include inline `aggregate`.
- `packages/engine/src/agents/policy-expr.ts:1080-1145` defines
  `zoneTokenAgg`, but only with `zone`, `owner`, `prop`, and `op`; it does not
  accept `tokenFilter`, `faction`, `type`, or `activity` filters.
- `packages/engine/src/cnl/compile-agents.ts:3781-3787` makes
  `selector.item.key` an id-valued ref in selector scope.
- `packages/engine/src/cnl/compile-agents.ts:3563-3577` allows `lookup` in
  selector expressions.
- `packages/engine/src/cnl/game-spec-doc.ts:732-742` defines selector
  component values as `GameSpecPolicyExpr`, not kernel `ValueExpr`.
- `packages/engine/src/cnl/compile-conditions-queries.ts:109-132` lowers
  `tokensInZone` for condition/value-query contexts.
- `data/games/fire-in-the-lake/40-content-data-assets.md:907-983` confirms
  token runtime property values: `faction: US|ARVN|NVA|VC`, `type: troops`,
  `type: police`, `type: base`, `type: guerrilla`, `type: ranger`, and
  `type: irregular`.
- `packages/engine/src/cnl/compile-agent-posture-evaluators.ts:141-210` and
  `packages/engine/src/cnl/game-spec-doc.ts:892-908` show posture `prefer`
  terms use `fallback.contribution`, not `previewFallback`.

## Placeholder Classification

| Spec placeholder | Classification | Concrete authoring form | Evidence / notes |
| --- | --- | --- | --- |
| `zoneProp.pacificationEligible` (§4.1) | (d) new derived metric or existing action-specific proxy required | Do not author as `zoneProp.pacificationEligible`; no such map attribute is authored. Downstream 002 should either use existing local proxies already available (`population`, `supportOpposition` marker, and city category) or stop for a follow-up if true pacification legality is required as a selector feature. | Map attributes at `40-content-data-assets.md:4-220`; US Spec 202 comments at `92-agents.md:926-929` note control/terror are proxied by population + support marker in the current agent selector surface. |
| `lookup: { path: [markers, terror] }` (§4.1) | (d) not currently a marker lookup path in the selector surface | Do not author this exact path without adding a durable marker/zone-variable exposure first. Current authored selectors use `path: [markers, supportOpposition]`; terror appears as zone variable `terrorCount` in rules, not as an existing selector marker lookup. | `supportOpposition` lookup exemplars at `92-agents.md:580-587`; terror rules mutate `var: terrorCount` in `30-rules-actions.md`. |
| `zoneProp.controlSwingPossible` (§4.2) | (d) no existing zoneProp | Use existing projected feature refs where Spec 205 explicitly preserves them, or create a derived metric/follow-up if local control-swing truth is required. | Existing ARVN selectors use `feature.projectedSelfMargin` / `feature.coinControlPop` as low-weight tiebreakers; no `controlSwingPossible` zone attribute exists in map data. |
| `tokenProp.zone.controlSwingFromRemoval` (§4.7) | (d) invalid token/zone-scope notation | Do not author this notation. For `arvn.pieceRemovalPriority`, use token-local properties and existing projected feature refs, or add a concrete derived metric if removal-specific control swing must be local and token-sensitive. | `arvn.pieceRemovalPriority` is token-scoped at `92-agents.md:741-755`; `selector.item.key` is only the token key in this selector. |
| `zoneProp.hasInsurgentBase` (§4.2, §4.3) | (d) filtered local token count not currently expressible in selector policy surface | Requires either a new authored derived metric/candidate feature or a generic selector policy-expression extension for filtered local token counts. Do not approximate bases with unfiltered token counts. | Base token type is confirmed in the piece catalog, but selector `zoneTokenAgg` cannot filter by `faction`/`type`. |
| `zoneProp.hasUndergroundEnemy` / `zoneProp.undergroundGuerrillaCount` (§4.2, §4.3) | (d) filtered local token count not currently expressible in selector policy surface | Requires either a new authored derived metric/candidate feature or a generic selector policy-expression extension for filtered local token counts. Do not author a synthetic zero or unfiltered count. | NVA/VC guerrilla runtime type values are confirmed in the piece catalog, but selector `zoneTokenAgg` cannot filter by `faction`/`type`/`activity`. |
| `zoneProp.hasArvnTroops` / `zoneProp.arvnTroopCount` (§4.4) | (d) filtered local token count not currently expressible in selector policy surface | Requires either a new authored derived metric/candidate feature or a generic selector policy-expression extension for filtered local token counts. | ARVN troop runtime props are confirmed at `40-content-data-assets.md:937-943`, but selector `zoneTokenAgg` cannot filter by `faction`/`type`. |
| `zoneProp.arvnControlCritical` (§4.4) | (d) no existing local control-critical metric | Keep existing `preserveOriginControl` tiebreaker if the ticket preserves it, and let 003's `postState.predicate.condition` own actual origin-control admissibility. Add a derived metric only through a follow-up if selector-side control criticality remains required after 003. | Existing transport guardrail/comment at `92-agents.md:3456-3468`; 003 owns constraint-time control preservation. |
| `zoneProp.arvnCubesExceedUsCubes` (§4.6) | (d) filtered local token-count comparison not currently expressible in selector policy surface | The desired comparison is ARVN cubes (`faction: ARVN`, `type in [troops, police]`) versus US cubes (`faction: US`, `type: troops`), but current selector policy expressions cannot filter local token aggregates by runtime props. 004 should stop for a boundary reset or implement a generic filtered local-token-count surface before authoring the term. | Token type values confirmed in the piece catalog; plural `troops` is the live type spelling. |

## Selector-Scope Token Count Finding

No existing authored selector component in `data/games/**/*.md` uses a kernel-style
inline `aggregate.query.tokensInZone` block. The live selector compiler supports
only unfiltered owner-bucket token aggregation through `zoneTokenAgg`:

```yaml
value:
  zoneTokenAgg:
    zone: { ref: selector.item.key }
    owner: none
    prop: strength
    op: count
```

That is not enough for Spec 205's filtered local counts. `zoneTokenAgg` requires
`zone`, `owner`, `prop`, and `op`, and accepts no `tokenFilter`.

The concrete baseline is:

- selector item zone id: `zone: { ref: selector.item.key }`
- unfiltered owner-bucket operator: `zoneTokenAgg`
- filtered local token counts by `faction`, `type`, and `activity`: not
  currently expressible in selector policy expressions
- token type spellings: `troops`, `police`, `base`, `guerrilla`, `ranger`,
  `irregular`

## `previewFallback` / Posture Finding

`previewFallback` is supported for candidate features, considerations, and
selector quality components that reference preview-derived refs. Posture
`prefer` terms do not use `previewFallback`; they require:

```yaml
fallback:
  contribution: 0
```

This is already authored in posture evaluators such as
`arvn.preserveAidAndMargin` and `us.preserveSupportAndAvailability`. The
deferred Sweep+Raid preview-derived posture composition should therefore use
posture `fallback.contribution`, not `previewFallback`, unless a future spec
changes the posture schema.

## Downstream Authoring Notes

- 205FITLARVSEL-002 should not synthesize unavailable `pacificationEligible`,
  `terror`, `controlSwingPossible`, `controlSwingFromRemoval`, or filtered
  local token-count values as zero contributions. Use current local proxies only
  where the ticket/spec permits them, or stop for a follow-up if exact semantics
  are required.
- 205FITLARVSEL-002 and 205FITLARVSEL-004 should not author filtered token
  counts as `zoneTokenAgg` unless the selector policy surface is first extended
  generically and proven by tests.
- 205FITLARVSEL-004 should use token type `troops` for US/ARVN troops and
  `police` for ARVN police.
- 205FITLARVSEL-003 is unaffected by this selector baseline because its
  `postState.predicate.condition` lives in the kernel condition/value-expression
  surface where `aggregate.query.tokensInZone` is already used.
