# Spec 201 FITL Metric Availability Survey

**Ticket**: `archive/tickets/201FITLSHADOC-001.md`
**Date**: 2026-05-27
**Scope**: audit-only survey for Spec 201 state/candidate feature authoring. No engine source, FITL YAML, or generated artifact is changed by this report.

## Summary

| Feature / ref | Verdict | Evidence | Follow-up owner |
|---|---|---|---|
| `metric.auto:victory:totalSupport` | available with adjustment | FITL victory standings declare `markerConfig: support` for the US formula, and the synthesis code creates marker-total ids as `auto:victory:<computation>:<markerName>:<activeState>:<passiveState>` rather than `auto:victory:totalSupport`. Use `metric.auto:victory:markerTotal:supportOpposition:activeSupport:passiveSupport`. | `201FITLSHADOC-002` may author `totalSupport` with the adjusted ref. |
| `metric.auto:victory:totalOpposition` | available with adjustment | FITL victory standings declare `markerConfig: opposition` for the VC formula; the same synthesis path produces `metric.auto:victory:markerTotal:supportOpposition:activeOpposition:passiveOpposition`, not `metric.auto:victory:totalOpposition`. | `201FITLSHADOC-002` may author `totalOpposition` with the adjusted ref. |
| `nvaBaseCount` | available | `92-agents.md` already uses `globalTokenAgg` with `tokenFilter.props.faction/type` for VC bases; `40-content-data-assets.md` declares NVA bases with `runtimeProps.faction: NVA` and `runtimeProps.type: base`. | `201FITLSHADOC-002` may author `nvaBaseCount` with the same pattern. |
| `availableUsTroops` | available with adjustment | US troop pieces expose `runtimeProps.faction: US` and `runtimeProps.type: troops`; `globalTokenAgg` supports `zoneFilter`, and `available-US:none` is a declared zone used by the US victory formula. | `201FITLSHADOC-002` may author this with `globalTokenAgg` plus `zoneFilter.zoneIds: [available-US:none]`, not token props alone. |
| `availableUsBases` | available with adjustment | US base pieces expose `runtimeProps.faction: US` and `runtimeProps.type: base`; the same `available-US:none` zone provides the standing-pool location filter. | `201FITLSHADOC-002` may author this with `globalTokenAgg` plus `zoneFilter.zoneIds: [available-US:none]`, not token props alone. |
| `sabotagedEcon` | unavailable - defer | Current data exposes global vars `totalEcon` and `terrorSabotageMarkersPlaced`; no authored state feature or derived metric currently materializes a sabotaged-econ aggregate for policy refs. | Defer until a faction spec proves the need and authors a concrete metric or feature. |
| `terrorMarkerCount` | unavailable - defer | Current data exposes `terrorSabotageMarkersPlaced` as a global var; there is no separate terror-marker-count derived metric or state feature today. | Defer; consumers can use `var.global.terrorSabotageMarkersPlaced` only if that is the intended noun. |
| `preview.relationship.nominalAlly.gainValueDelta` | unavailable - use fallback | Compiler ref parsing accepts current-state `relationship.<role>.seat` and `relationship.<role>.gainValue` only. Preview ref support enumerates preview victory, var, marker, metric, active-card, and option-delta refs; there is no `preview.relationship.*` family. | `201FITLSHADOC-002` should not author `projectedAllyMarginDelta` with `preview.relationship.nominalAlly.gainValueDelta`. Use direct per-seat projected margin delta refs in downstream bindings/conditions until a future engine ticket adds the preview relationship surface. |

## Evidence Notes

- `data/games/fire-in-the-lake/91-victory-standings.md:10-18` declares the support/opposition marker configs, and `:21-47` binds those configs into the US/VC victory formulas.
- `packages/engine/src/cnl/synthesize-derived-metrics.ts:22-37` maps marker formulas to `markerTotal` and controlled-population formulas to `controlledPopulation`; `:99-119` constructs ids from the computation, marker name/states, or control function. No `totalSupport` / `totalOpposition` id shape is synthesized.
- `data/games/fire-in-the-lake/92-agents.md:104-112` proves the current `globalTokenAgg` faction/type pattern for base counts.
- `data/games/fire-in-the-lake/40-content-data-assets.md:907-921` declares US troop/base runtime props; `data/games/fire-in-the-lake/91-victory-standings.md:26-27` confirms `available-US:none` is the current standing-pool zone used for US availability. `packages/engine/test/unit/agents/policy-expr.test.ts:373-421` and `packages/engine/src/cnl/lower-agent-considerations.ts:385-392` confirm `globalTokenAgg` accepts and lowers `zoneFilter`.
- `packages/engine/src/cnl/compile-agents.ts:3342-3357` parses only `relationship.<role>.<seat|gainValue>` refs; `:3803-3812` lowers them as current-state refs.
- `packages/engine/src/cnl/preview-seat-agg-refs.ts:74-87` enumerates the preview-surface ref families and does not include a relationship family.
- `packages/engine/src/agents/policy-relationship-eval.ts:45-60` resolves relationship `seat` or `gainValue` against current active relationships, not previewed post-option relationships.

## Authoring Guidance For Ticket 002

1. Author `totalSupport` and `totalOpposition` with the adjusted `metric.auto:victory:markerTotal:*` ids above.
2. Author `nvaBaseCount` with the existing `globalTokenAgg` faction/type pattern.
3. Author `availableUsTroops` and `availableUsBases` only if the policy-expression `globalTokenAgg.zoneFilter.zoneIds` form compiles in the authored YAML; otherwise keep them deferred rather than silently counting all US pieces.
4. Do not use `preview.relationship.nominalAlly.gainValueDelta`. For ally-rival scoring, use explicit per-seat projected margin deltas (`projectedUsMarginDelta`, `projectedArvnMarginDelta`, `projectedNvaMarginDelta`, `projectedVcMarginDelta`) or a later ticket that adds a generic preview relationship ref.

## Manual Completeness Check

Checked every item named by Spec 201 §11:

- Metric availability: `totalSupport`, `totalOpposition`, `nvaBaseCount`, `availableUsTroops`, `availableUsBases`, `sabotagedEcon`, `terrorMarkerCount`.
- Preview relationship ref: `preview.relationship.nominalAlly.gainValueDelta`.
- Priority tier calibration: intentionally unchanged; owned by `tickets/201FITLSHADOC-005.md`.
