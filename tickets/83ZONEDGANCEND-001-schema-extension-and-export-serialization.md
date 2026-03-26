# 83ZONEDGANCEND-001: Schema Extension and Export Serialization

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None (foundational ticket)

## Problem

Zone connection endpoints in `visual-config.yaml` have no way to specify where on a zone's boundary a connector attaches. The `ZoneConnectionEndpointSchema` only stores `kind` and `zoneId`, always resolving to the zone center. This ticket adds the `anchor` field to the schema and ensures it round-trips through export serialization.

## Assumption Reassessment (2026-03-26)

1. `ZoneConnectionEndpointSchema` is defined in `packages/runner/src/config/visual-config-types.ts` (lines 112-115) as `z.object({ kind: z.literal('zone'), zoneId: z.string() }).strict()`.
2. `ConnectionEndpoint` discriminated union (line 608) and `ZoneConnectionEndpoint` type (line 606) are inferred from the schema — adding `anchor` to the schema automatically extends both.
3. `cloneRouteDefinition` in `packages/runner/src/map-editor/map-editor-export.ts` (lines 88-106) clones zone endpoints as `{ kind: 'zone', zoneId: point.zoneId }` — omitting any new fields.
4. A second `cloneRouteDefinition` exists in `packages/runner/src/map-editor/map-editor-store.ts` (lines 401-419) with the same omission pattern — both must be updated.

## Architecture Check

1. The `anchor` field is additive and `.optional()` — no migration or backwards-compatibility shim needed (F9).
2. This is purely visual presentation data in `visual-config.yaml` — no engine/GameSpecDoc changes (F1, F3).
3. No mutation — clone functions return new objects (F7).

## What to Change

### 1. Add `anchor` to `ZoneConnectionEndpointSchema`

In `packages/runner/src/config/visual-config-types.ts`, extend the schema:

```typescript
const ZoneConnectionEndpointSchema = z.object({
  kind: z.literal('zone'),
  zoneId: z.string(),
  anchor: z.number().min(0).max(360).optional(),
}).strict();
```

The inferred `ZoneConnectionEndpoint` and `ConnectionEndpoint` types automatically gain the optional `anchor` field.

### 2. Update `cloneRouteDefinition` in export

In `packages/runner/src/map-editor/map-editor-export.ts`, include `anchor` when present:

```typescript
point.kind === 'zone'
  ? {
      kind: 'zone' as const,
      zoneId: point.zoneId,
      ...(point.anchor !== undefined ? { anchor: point.anchor } : {}),
    }
  : { kind: 'anchor' as const, anchorId: point.anchorId }
```

### 3. Update `cloneRouteDefinition` in store

In `packages/runner/src/map-editor/map-editor-store.ts`, apply the same conditional spread for `anchor` in the zone endpoint clone path.

## Files to Touch

- `packages/runner/src/config/visual-config-types.ts` (modify)
- `packages/runner/src/map-editor/map-editor-export.ts` (modify)
- `packages/runner/src/map-editor/map-editor-store.ts` (modify)

## Out of Scope

- Edge position math (`getEdgePointAtAngle`) — ticket 002
- Resolver integration — ticket 003
- Map editor route geometry changes — ticket 004
- Store actions (`setEndpointAnchor`, `previewEndpointAnchor`) — ticket 005
- Drag UX changes — ticket 006
- FITL visual config YAML updates — ticket 007
- Any engine/kernel/compiler changes

## Acceptance Criteria

### Tests That Must Pass

1. Schema validation: a zone endpoint with `anchor: 90` parses successfully via `ConnectionEndpointSchema`
2. Schema validation: a zone endpoint without `anchor` still parses (backward compat)
3. Schema validation: `anchor: -1` and `anchor: 361` are rejected
4. Export: `cloneRouteDefinition` on a route with `anchor: 45` includes the anchor in the cloned output
5. Export: `cloneRouteDefinition` on a route without `anchor` produces clean output (no anchor key)
6. Store: `cloneRouteDefinition` in store preserves `anchor` when present
7. Existing suite: `pnpm -F @ludoforge/runner test`
8. Existing suite: `pnpm -F @ludoforge/runner typecheck`

### Invariants

1. All existing YAML files without `anchor` continue to parse without error.
2. `ConnectionEndpoint` discriminated union remains a two-variant union (`zone` | `anchor`).
3. No mutation — clone functions return new objects.
4. Exported YAML is clean — no `anchor: undefined` or `anchor: null` in output.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-types.test.ts` — schema parse/reject tests for `anchor` field
2. `packages/runner/test/map-editor/map-editor-export.test.ts` — clone round-trip with/without anchor
3. `packages/runner/test/map-editor/map-editor-store.test.ts` — clone preserves anchor

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`
