# 63COMZONIDCROREFVAL-004 — Zone Definition Cross-Reference Validation Pass

## Summary

Add a post-materialization pass in `materializeZoneDefs` that validates zone-internal cross-references: `adjacentTo[].to` targets and `behavior.reshuffleFrom` sources must exist in the materialized zone set.

## Prerequisites

- 63COMZONIDCROREFVAL-001 (diagnostic codes exist)

## File List

| File | Change |
|------|--------|
| `packages/engine/src/cnl/compile-zones.ts` | Add post-materialization cross-reference validation after the zone loop in `materializeZoneDefs` |

## Implementation Details

### Where to add the pass

In `materializeZoneDefs`, after the existing `for (const [index, zone] of sourceZones.entries())` loop completes (line ~129) and before the `return` (line ~131), add a post-pass that iterates over `outputZones` to validate cross-references.

### Build the zone ID set

```typescript
const zoneIdSet = new Set(outputZones.map(z => z.id));
```

### Validate adjacency targets

For each zone in `outputZones` that has `adjacentTo`:
```typescript
for (const zone of outputZones) {
  if (zone.adjacentTo === undefined) continue;
  for (const adj of zone.adjacentTo) {
    if (!zoneIdSet.has(adj.to)) {
      diagnostics.push({
        code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_ADJACENCY_TARGET_UNKNOWN,
        path: `${pathPrefix}.[${zone.id}].adjacentTo`,
        severity: 'error',
        message: `Adjacency target "${adj.to}" on zone "${zone.id}" does not exist.`,
        suggestion: 'Check zone definitions for the correct zone ID.',
        alternatives: [...zoneIdSet].sort(),
      });
    }
  }
}
```

### Validate reshuffle sources

For each zone in `outputZones` that has `behavior.reshuffleFrom`:
```typescript
for (const zone of outputZones) {
  if (zone.behavior?.reshuffleFrom === undefined) continue;
  const reshuffleTarget = zone.behavior.reshuffleFrom;
  // reshuffleFrom is a zone base, not a fully-qualified ID — check if any zone starts with that base
  const reshuffleZoneExists = zoneIdSet.has(`${reshuffleTarget}:none`) ||
    [...zoneIdSet].some(id => id.startsWith(`${reshuffleTarget}:`));
  if (!reshuffleZoneExists) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_BEHAVIOR_RESHUFFLE_TARGET_UNKNOWN,
      path: `${pathPrefix}.[${zone.id}].behavior.reshuffleFrom`,
      severity: 'error',
      message: `Reshuffle source "${reshuffleTarget}" on zone "${zone.id}" does not match any zone.`,
      suggestion: 'Use a zone base declared in doc.zones.',
      alternatives: [...new Set([...zoneIdSet].map(id => id.split(':')[0]))].sort(),
    });
  }
}
```

**Note**: `reshuffleFrom` stores a zone ID (branded string via `asZoneId`), so verify whether it's a base or a fully-qualified ID by checking how it's used in the existing `compileBehavior` function. Currently (line ~445) it does `reshuffleFrom: asZoneId(zone.behavior.reshuffleFrom)` — so the raw value from the spec is stored directly. It could be either a base or a fully-qualified ID depending on the spec author. Check both.

## Out of Scope

- Changes to `canonicalizeZoneSelector` (ticket 003).
- Changes to lowering context interfaces (ticket 002).
- Wiring into `compiler-core.ts` (ticket 005).
- The `normalizeAdjacentTo` helper — it already validates shape; this pass validates existence.
- Test files — tests are in ticket 008.

## Acceptance Criteria

### Tests That Must Pass
- `pnpm turbo typecheck` passes.
- `pnpm turbo build` succeeds.
- All existing tests continue to pass (`pnpm turbo test`) — production specs have correct zone references, so no new diagnostics should be emitted.

### Invariants
- The post-pass runs after ALL zones are materialized (not during).
- Only emits diagnostics for targets that don't exist in the materialized set.
- Does not modify the `outputZones` array — read-only validation pass.
- The `zoneIdSet` is local to `materializeZoneDefs` (not returned or stored on the result).
- Existing `normalizeAdjacentTo` shape validation is unchanged.
