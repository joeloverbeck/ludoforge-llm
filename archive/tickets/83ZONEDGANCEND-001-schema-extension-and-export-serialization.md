# 83ZONEDGANCEND-001: Schema Extension and Export Serialization

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None - runner-only
**Deps**: None (foundational ticket)

## Problem

Zone connection endpoints in `visual-config.yaml` have no way to specify where on a zone's boundary a connector attaches. The `ZoneConnectionEndpointSchema` only stores `kind` and `zoneId`, always resolving to the zone center. This ticket adds the `anchor` field to the schema and ensures the new endpoint metadata survives every runner-side clone/snapshot/export path that currently serializes route definitions.

## Assumption Reassessment (2026-03-26)

1. `ZoneConnectionEndpointSchema` is defined in `packages/runner/src/config/visual-config-types.ts` as `z.object({ kind: z.literal('zone'), zoneId: z.string() }).strict()`.
2. `ZoneConnectionEndpoint` and `ConnectionEndpoint` are inferred from the schema, so adding `anchor` at the schema layer automatically extends the exported TypeScript surface.
3. `packages/runner/src/map-editor/map-editor-export.ts` has a local `cloneRouteDefinition()` that strips unknown endpoint fields from zone endpoints during export.
4. `packages/runner/src/map-editor/map-editor-store.ts` has its own route cloning path plus `cloneEndpoint()` and `endpointsEqual()` helpers; they currently compare and copy zone endpoints by `zoneId` only, so any new endpoint metadata would be dropped from snapshots and ignored by dirty-state/equality checks.
5. Existing test coverage is not where the original ticket claimed:
   - schema coverage belongs in `packages/runner/test/config/visual-config-schema.test.ts`
   - export coverage belongs in `packages/runner/test/map-editor/map-editor-export.test.ts`
   - store coverage belongs in `packages/runner/test/map-editor/map-editor-store.test.ts`

## Architecture Check

1. The `anchor` field is additive and `.optional()`, but under F9 that does not justify partial support. Every runner clone/equality/export path that models a connection endpoint must understand the field in the same change.
2. This remains purely visual presentation data in `visual-config.yaml` - no engine/GameSpecDoc changes (F1, F3).
3. The clean architecture for this ticket is to preserve endpoint data structurally, not to special-case export only. Otherwise the editor store becomes lossy and future endpoint metadata additions repeat the same bug.
4. No mutation - clone functions and snapshot comparisons must continue to operate on copied data (F7).

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

### 2. Preserve endpoint metadata in export cloning

In `packages/runner/src/map-editor/map-editor-export.ts`, include `anchor` when present on zone endpoints:

```typescript
point.kind === 'zone'
  ? {
      kind: 'zone' as const,
      zoneId: point.zoneId,
      ...(point.anchor !== undefined ? { anchor: point.anchor } : {}),
    }
  : { kind: 'anchor' as const, anchorId: point.anchorId }
```

### 3. Preserve endpoint metadata in store cloning and equality

In `packages/runner/src/map-editor/map-editor-store.ts`:

- update route cloning so zone endpoints retain `anchor`
- update endpoint equality so `{ kind: 'zone', zoneId, anchor }` compares both `zoneId` and `anchor`

Without the equality update, anchor-only edits would not reliably affect `dirty`, undo/saved-snapshot comparisons, or any logic that depends on route equality.

## Files to Touch

- `packages/runner/src/config/visual-config-types.ts` (modify)
- `packages/runner/src/map-editor/map-editor-export.ts` (modify)
- `packages/runner/src/map-editor/map-editor-store.ts` (modify)
- `packages/runner/test/config/visual-config-schema.test.ts` (modify)
- `packages/runner/test/map-editor/map-editor-export.test.ts` (modify)
- `packages/runner/test/map-editor/map-editor-store.test.ts` (modify)

## Out of Scope

- Edge position math (`getEdgePointAtAngle`) - ticket 002
- Resolver integration - ticket 003
- Map editor route geometry changes - ticket 004
- Store actions (`setEndpointAnchor`, `previewEndpointAnchor`) - ticket 005
- Drag UX changes - ticket 006
- FITL visual config YAML updates - ticket 007
- Any engine/kernel/compiler changes

## Acceptance Criteria

### Tests That Must Pass

1. Schema validation: a zone endpoint with `anchor: 90` parses successfully through `VisualConfigSchema`
2. Schema validation: a zone endpoint without `anchor` still parses
3. Schema validation: `anchor: -1` and `anchor: 361` are rejected
4. Export: route points with `anchor` retain the field in built/exported config
5. Export: route points without `anchor` produce clean output with no `anchor` key
6. Store initialization/cloning preserves `anchor` on zone endpoints
7. Store equality/dirty tracking treats anchor-only route changes as real document changes
8. Existing suite: `pnpm -F @ludoforge/runner test`
9. Existing suite: `pnpm -F @ludoforge/runner typecheck`
10. Existing suite: `pnpm -F @ludoforge/runner lint`

### Invariants

1. All existing YAML files without `anchor` continue to parse without error.
2. `ConnectionEndpoint` discriminated union remains a two-variant union (`zone` | `anchor`).
3. Store snapshots and exports are lossless for authored endpoint metadata.
4. No mutation - clone functions return new objects.
5. Exported YAML is clean - no `anchor: undefined` or `anchor: null` in output.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/config/visual-config-schema.test.ts` - schema parse/reject tests for endpoint `anchor`
2. `packages/runner/test/map-editor/map-editor-export.test.ts` - export/build round-trip with and without endpoint `anchor`
3. `packages/runner/test/map-editor/map-editor-store.test.ts` - initialization and dirty-state coverage for anchor-preserving route snapshots

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-03-26
- What actually changed:
  - added optional `anchor` support to zone connection endpoints in `packages/runner/src/config/visual-config-types.ts`
  - updated map-editor export route cloning to preserve endpoint metadata during YAML export
  - updated map-editor store route cloning and endpoint equality so snapshotting, undo, and dirty-state logic preserve and compare endpoint anchors correctly
  - added schema, export, and store tests covering valid anchors, invalid anchors, export round-trip preservation, and snapshot/undo preservation
- Deviations from original plan:
  - instead of only conditionally spreading `anchor` in clone paths, endpoint cloning now uses structural object copies (`{ ...endpoint }`) so future endpoint metadata is less likely to be dropped by the same architecture
  - the scope expanded slightly beyond export/store clone paths to include store endpoint equality, because without that change anchor-aware snapshots would still be lossy in practice
- Verification results:
  - `pnpm -F @ludoforge/runner test` passed (`195` files, `1947` tests)
  - `pnpm -F @ludoforge/runner typecheck` passed
  - `pnpm -F @ludoforge/runner lint` passed
