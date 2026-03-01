# CROGAMPRIELE-004: Per-player zone templates compiler pass (A4)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler pipeline (new expansion pass), GameSpecDoc types
**Deps**: None (independent compiler pass)

## Problem

FITL hand-types 8 per-faction zones following a `{prefix}-{seatId}` naming pattern (~40 lines). Texas Hold'em uses runtime `zoneExpr: { concat: ['hand:', ...] }` to reference per-player hand zones, introducing runtime string concatenation where compile-time expansion suffices. A `template:` syntax with `perSeat: true` on the `zones` array should expand into individual zone declarations at compile time.

## Assumption Reassessment (2026-03-01, verified)

1. `GameSpecZoneDef` exists in `game-spec-doc.ts:51-66` with `id`, `zoneKind?`, `isInternal?`, `owner`, `visibility`, `ordering`, `adjacentTo?`, `category?`, `attributes?`.
2. `GameSpecDoc.zones` is `readonly GameSpecZoneDef[] | null` (`game-spec-doc.ts:402`).
3. Seats come from `seatCatalog` data assets, resolved via `SeatIdentityContract` (`cnl/seat-identity-contract.ts`). There is no top-level `seats` field on `GameSpecDoc`.
4. `buildSeatIdentityContract` in `seat-identity-contract.ts:21-44` expects `seatCatalogSeatIds: readonly string[] | undefined`.
5. `SeatCatalogPayload` in `types-core.ts:289-291` has `seats: readonly SeatDef[]` where `SeatDef` has `id: string`.
6. Existing expand-* passes (expand-batch-markers, expand-batch-vars) use **in-place** expansion — batch entries are replaced where they appear, preserving interleaving order with individual entries. Owner valid values are `'none'` or `'player'` only (`compile-zones.ts:44`).

## Architecture Check

1. Compile-time zone expansion is cleaner than runtime `zoneExpr` concatenation — eliminates a runtime indirection.
2. Pre-scanning `doc.dataAssets` for `seatCatalog` follows the canonical `SeatIdentityContract` pattern already established in the codebase.
3. No backwards-compatibility shims — template and individual zone entries coexist via union type.

## What to Change

### 1. Add `GameSpecZoneTemplateDef` type and widen zones array type in `game-spec-doc.ts`

```typescript
export interface GameSpecZoneTemplateDef {
  readonly template: {
    readonly idPattern: string;
    readonly perSeat: true;
    readonly owner: string;
    readonly visibility: string;
    readonly ordering: string;
    readonly zoneKind?: 'board' | 'aux';
    readonly isInternal?: boolean;
    readonly category?: string;
    readonly attributes?: Readonly<Record<string, AttributeValue>>;
  };
}

// Change zones field type:
readonly zones: readonly (GameSpecZoneDef | GameSpecZoneTemplateDef)[] | null;
```

### 2. Create `expand-zone-templates.ts`

New file implementing `expandZoneTemplates(doc: GameSpecDoc): { doc: GameSpecDoc; diagnostics: Diagnostic[] }`.

Algorithm:
1. Pre-scan `doc.dataAssets` for entries with `kind === 'seatCatalog'`. Extract `payload.seats[].id` to get seat IDs. If no seatCatalog found and templates exist, emit diagnostic error.
2. If `doc.zones` is null or has no template entries, return doc unchanged.
3. Iterate entries. Individual entries (`id` key) pass through.
4. For template entries (`template` key with `perSeat: true`):
   a. Validate: `idPattern` contains `{seat}`.
   b. For each seat ID, substitute `{seat}` in `idPattern` to produce zone ID.
   c. Emit individual `GameSpecZoneDef`:
      - `id`: substituted pattern
      - `owner`: if `template.owner === 'player'`, set to `'player'`; otherwise copy as-is
      - All other fields copied from template.
5. Collect all zone IDs (individual + expanded). Check for duplicates.
6. Return new doc with expanded `zones`.

### 3. Create unit tests

Test file covering:
- Template with 4 seats (FITL factions) produces 4 zones.
- Template with 10 seats (Texas Hold'em players) produces 10 zones.
- `{seat}` substitution in idPattern works correctly.
- `owner: player` sets owner correctly on each expanded zone.
- `owner: none` is preserved on each expanded zone.
- Mixed template + individual entries in same array.
- Missing seatCatalog data asset produces diagnostic when templates exist.
- `idPattern` without `{seat}` produces diagnostic.
- Zone ID collision between template expansion and individual zones produces diagnostic.
- Zone ID collision between two template expansions produces diagnostic.
- No template entries = no-op (even without seatCatalog).
- Template properties (`zoneKind`, `category`, `attributes`) are copied to each expanded zone.

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify — add zone template type, widen `zones` array type)
- `packages/engine/src/cnl/expand-zone-templates.ts` (new)
- `packages/engine/test/unit/expand-zone-templates.test.ts` (new)

## Out of Scope

- Modifying `SeatIdentityContract` or `buildSeatIdentityContract` — we only read seatCatalog data assets, we don't change the contract
- Wiring into `compiler-core.ts` (CROGAMPRIELE-008)
- `expandTemplates` orchestrator (CROGAMPRIELE-008)
- Any other expansion passes
- `materializeZoneDefs` in `compile-zones.ts` — the expanded zones are standard `GameSpecZoneDef` entries, so downstream compilation handles them unchanged
- Kernel type changes
- JSON Schema updates
- Game spec migrations

## Acceptance Criteria

### Tests That Must Pass

1. Template with `perSeat: true` produces one zone per seat ID from seatCatalog.
2. `{seat}` in `idPattern` is correctly substituted with each seat ID.
3. `owner: player` template zones get `owner: 'player'` on each expansion.
4. Template properties (`zoneKind`, `category`, `attributes`, `visibility`, `ordering`) are faithfully copied.
5. Mixed template + individual zones are correctly combined.
6. Missing seatCatalog when templates exist produces a diagnostic error.
7. Missing `{seat}` in `idPattern` produces a diagnostic error.
8. Zone ID collisions produce a diagnostic error.
9. No templates and no seatCatalog = doc passes through unchanged (no error).
10. Existing suite: `pnpm turbo test`

### Invariants

1. `expandZoneTemplates` is a pure function: same input doc produces same output doc.
2. Output doc's `zones` contains only individual `GameSpecZoneDef` entries — no `template` entries remain.
3. No mutation of the input `GameSpecDoc`.
4. Seat ID resolution is read-only from `doc.dataAssets` — does not modify data assets.
5. Order: in-place expansion — template entries are replaced where they appear, preserving interleaving order with individual entries. Within a template, seats expand in seat-catalog order.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/expand-zone-templates.test.ts` — covers all scenarios above. Rationale: validates template expansion with seat resolution, property propagation, and error conditions.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/expand-zone-templates.test.js`
3. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

### What changed vs originally planned

**Implemented as planned:**
- `GameSpecZoneTemplateDef` type added to `game-spec-doc.ts`
- `zones` field widened to `readonly (GameSpecZoneDef | GameSpecZoneTemplateDef)[] | null`
- `expand-zone-templates.ts` created with `expandZoneTemplates` function
- 3 diagnostic codes added: `ZONE_TEMPLATE_DUPLICATE_ID`, `ZONE_TEMPLATE_ID_PATTERN_MISSING_SEAT`, `ZONE_TEMPLATE_SEAT_CATALOG_MISSING`
- 22 unit tests covering all acceptance criteria

**Deviated from plan:**
- **Ordering invariant**: Changed from "individuals first, then templates" to in-place expansion (consistent with `expand-batch-markers.ts` pattern).
- **Type widening ripple fixes**: Added type assertion in `compiler-core.ts:331` (with SAFETY comment referencing CROGAMPRIELE-008) and narrowed zone type access in 2 integration tests (`parse-validate-full-spec.test.ts`, `texas-holdem-spec-structure.test.ts`).
- **Assumption line numbers**: Corrected stale line numbers from pre-CROGAMPRIELE-001/002/003 state.

### Files touched
- `packages/engine/src/cnl/game-spec-doc.ts` — added `GameSpecZoneTemplateDef`, widened `zones` type
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` — added 3 zone template diagnostic codes
- `packages/engine/src/cnl/expand-zone-templates.ts` — new expansion pass
- `packages/engine/src/cnl/compiler-core.ts` — added `GameSpecZoneDef` import + type assertion
- `packages/engine/test/unit/expand-zone-templates.test.ts` — 22 new tests
- `packages/engine/test/integration/parse-validate-full-spec.test.ts` — narrowed zone type
- `packages/engine/test/integration/texas-holdem-spec-structure.test.ts` — narrowed zone type
