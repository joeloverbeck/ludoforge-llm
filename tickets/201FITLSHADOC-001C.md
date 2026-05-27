# 201FITLSHADOC-001C: Exact zone-id filters for policy token aggregates

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — generic agent policy expression compiler/runtime/schema
**Deps**: `archive/tickets/201FITLSHADOC-001B.md`

## Problem

Spec 201 ticket 002 needs exact `availableUsTroops` and `availableUsBases` state features. The survey classified those counts as available with adjustment if authored as `globalTokenAgg` over the exact Available pool zone (`available-US:none`), but the live `globalTokenAgg.zoneFilter` contract only supports `category`, `attribute`, and `variable`. It has no way to target specific zone ids.

Using `zoneScope: aux` would count all auxiliary zones, including out-of-play or staging zones, and would not be a truthful Available-pool count. Deferring the features would leave a known generic expressiveness gap in a spec-owned feature. This prerequisite adds a generic zone-id filter so ticket 002 can keep the semantics in GameSpecDoc YAML.

## Assumption Reassessment (2026-05-27)

1. `packages/engine/src/agents/policy-expr.ts` parses `globalTokenAgg.zoneFilter` through `analyzePolicyAggregationZoneFilter`, which currently accepts `category`, `attribute`, and `variable` only.
2. `packages/engine/src/agents/policy-evaluation-core.ts` applies zone filters through `matchesZoneFilter`, so runtime support belongs in the generic policy evaluation path rather than FITL-specific code.
3. `packages/engine/src/kernel/types-core.ts` and `packages/engine/src/kernel/schemas-core.ts` mirror the compiled policy expression shape; adding a zone-id filter must update both typed and schema surfaces.
4. FITL's Available US pool is an aux zone with id `available-US:none`; token props alone distinguish US troops/bases but not their exact pool location.

## Architecture Check

1. Foundation #2: exact Available-pool counts remain declarative GameSpecDoc YAML instead of engine code or approximate profile logic.
2. Foundation #12: the compiler validates the new `zoneFilter.zoneIds` shape statically.
3. Foundation #15: this fixes the generic policy-expression gap exposed by Spec 201 instead of papering over it with an aux-zone approximation.
4. Foundation #14: no compatibility alias is introduced; owned authored usage lands after the generic contract exists.
5. Foundation #1: the engine support is game-agnostic and does not mention FITL zones or token ids.

## What to Change

### 1. Extend policy aggregation zone filters

Add optional `zoneIds` support to the generic zone filter shape used by `globalTokenAgg` and `globalZoneAgg`:

```yaml
zoneFilter:
  zoneIds:
    - available-US:none
```

The compiler must reject malformed values, including non-arrays, empty arrays, and non-string entries.

### 2. Apply zone-id filters at runtime

Update the generic zone-filter predicate so only zones whose canonical ids appear in `zoneFilter.zoneIds` pass when the field is present. Existing `category`, `attribute`, and `variable` filters continue to compose conjunctively.

### 3. Keep schema/type mirrors aligned

Update compiled policy expression types and zod schemas so compiled GameDef artifacts accept and validate the new filter field.

## Files to Touch

- `packages/engine/src/agents/policy-expr.ts` (modify — parse/validate `zoneFilter.zoneIds`)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — runtime zone-id predicate)
- `packages/engine/src/kernel/types-core.ts` (modify — compiled filter type)
- `packages/engine/src/kernel/schemas-core.ts` (modify — schema mirror)
- Focused tests under `packages/engine/test/unit/agents/` and/or `packages/engine/test/unit/schemas-top-level.test.ts` (modify/new)

## Out of Scope

- Authoring Spec 201 FITL features in `92-agents.md` (owned by ticket 002 after this prerequisite lands).
- FITL-specific engine logic or hardcoded zone ids.
- Selector, route, or visual filtering changes.
- New aggregation operators.

## Acceptance Criteria

### Tests That Must Pass

1. `globalTokenAgg.zoneFilter.zoneIds` compiles for a valid non-empty string list and is retained in compiled policy expression IR.
2. Malformed `zoneIds` values fail compilation with targeted diagnostics.
3. Runtime aggregation counts only tokens in the named zone ids when `zoneFilter.zoneIds` is present.
4. Compiled schema validation accepts the new zone filter field.
5. `pnpm -F @ludoforge/engine build` passes.

### Invariants

1. Zone-id filtering composes conjunctively with existing `category`, `attribute`, and `variable` filters.
2. No game-specific zone ids are hardcoded in engine code.
3. Existing aggregations without `zoneIds` retain current behavior.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-expr.test.ts` — parser/IR coverage and malformed `zoneIds` diagnostics.
2. `packages/engine/test/unit/property/policy-aggregation.property.test.ts` or nearest runtime aggregate test — exact runtime count over named zones.
3. `packages/engine/test/unit/schemas-top-level.test.ts` — compiled schema accepts `zoneFilter.zoneIds`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Focused compiled node tests for the changed unit files.
3. `pnpm -F @ludoforge/engine test:unit`
4. `pnpm run check:ticket-deps`
