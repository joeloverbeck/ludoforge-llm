**Status**: COMPLETED

# Spec 63 — Compiler Zone ID Cross-Reference Validation

## 0. Problem Statement

The compiler validates zone **bases** (e.g., `deck`, `hand`, `available-VC`) via `canonicalizeZoneSelector`, but does not validate that fully-qualified zone IDs (e.g., `saigon:none`, `available-VC:none`) actually exist in the materialized zone list. An invalid zone ID passes compilation silently and only fails at runtime — either as a kernel error during game execution, or worse, as a silent no-op when the zone is referenced in a selector that returns zero matches.

### 0.1 Current Validation Architecture

The compiler has two layers of zone validation:

1. **Zone definition validation** (`validate-zones.ts`): Validates zone schema shape — enum fields (`owner`, `visibility`, `ordering`, `zoneKind`), rejects deprecated fields. Does not cross-reference zone IDs.

2. **Zone selector canonicalization** (`compile-zones.ts:canonicalizeZoneSelector`): Validates that the zone **base** exists in `ownershipByBase`, validates qualifier syntax, resolves ambiguity for player-owned zones. Binding references (`$space`) pass through unvalidated (correct — they are runtime values). Static literal zone IDs are canonicalized but their **existence is not checked**.

### 0.2 The Gap

`canonicalizeZoneSelector` receives `ownershipByBase` (a `Record<string, ZoneOwnershipKind>`) but NOT the materialized zone ID set. It can verify that a base like `available-VC` exists, but cannot verify that `available-VC:none` is an actual zone. For `owner: 'none'` bases this is trivially true (only one zone per base), but for `owner: 'player'` bases the qualifier determines which zone is selected, and for literal references to specific zones the check is missing entirely.

More importantly, the lowering contexts (`EffectLoweringContext`, `ConditionLoweringContext`) also lack the zone ID set, so no downstream lowering pass can perform this validation either.

### 0.3 Affected Contexts

Zone ID references that bypass existence validation:

| Context | Example | Risk |
|---------|---------|------|
| `adjacentTo[].to` in zone definitions | `to: non-existent:none` | Silent broken adjacency |
| `behavior.reshuffleFrom` in zone definitions | `reshuffleFrom: bad-deck` | Runtime crash on reshuffle |
| Literal zone in `moveToken.to` / `moveToken.from` | `to: quang-tri:none` | Runtime crash or silent no-op |
| Literal zone in `removeByPriority.to.zoneExpr` | `zoneExpr: invalid:none` | Runtime crash |
| Literal zone in `shiftMarker.space` | `space: invalid:none` | Runtime crash |
| Literal zone in `tokensInZone.zone` | `zone: wrong-name:none` | Silent zero results |
| Literal zone in `setMarker.space` | `space: invalid:none` | Runtime crash |
| Literal zone in condition `zoneProp` refs | `zone: invalid:none` | Runtime crash |
| Scenario card placements | `zone: bad-deck:none` | Already validated (separate path) |

### 0.4 Why This Matters

- **Silent failures**: A typo in a `tokensInZone.zone` reference produces zero results without error. Selectors built on this return empty option sets. The game plays differently from intended with no diagnostic.
- **Late errors**: Invalid zone IDs in effects that only trigger conditionally (e.g., rare event cards) may not surface until deep in playtesting — or never, if the branch is hard to reach.
- **Game-agnostic concern**: This affects any game built on the engine, not just FITL. As game specs grow in complexity, the probability of zone ID typos increases.

## 1. Design

### 1.1 Principle: Validate Static References at Compile Time, Dynamic References at Runtime

Zone references fall into two categories:

- **Static literals**: `saigon:none`, `available-VC:none`, `deck:0`. The compiler can and should validate these against the materialized zone set.
- **Dynamic bindings**: `$space`, `$targetProvince`, `{ zoneExpr: ... }`. These resolve at runtime. The compiler cannot validate them — the kernel's `resolveSingleZoneSel` already handles this.

The compiler should validate all static zone ID literals after canonicalization and emit a diagnostic error when a canonicalized zone ID does not exist in the materialized zone set.

### 1.2 Approach: Thread Zone ID Set Through Lowering Contexts

The materialized zone set is available in `compiler-core.ts` after `materializeZoneDefs` runs. The fix threads this set into the lowering contexts so `canonicalizeZoneSelector` (and callers) can validate existence.

#### 1.2.1 New Field on Lowering Contexts

Add an optional `zoneIdSet` field to both `ConditionLoweringContext` and `EffectLoweringContext`:

```typescript
// compile-conditions-shared.ts
export interface ConditionLoweringContext {
  readonly ownershipByBase: Readonly<Record<string, ZoneOwnershipKind>>;
  readonly zoneIdSet?: ReadonlySet<string>; // NEW
  // ... existing fields unchanged
}

// compile-effects-types.ts
export interface EffectLoweringContext {
  readonly ownershipByBase: Readonly<Record<string, ZoneOwnershipKind>>;
  readonly zoneIdSet?: ReadonlySet<string>; // NEW
  // ... existing fields unchanged
}
```

The field is optional so that existing tests and internal callers that construct a minimal context without zones continue to compile without changes. When absent, the existence check is skipped (compile-time validation degrades gracefully to the current behavior).

#### 1.2.2 Enhanced `canonicalizeZoneSelector` Signature

Add an optional `zoneIdSet` parameter:

```typescript
// compile-zones.ts
export function canonicalizeZoneSelector(
  selector: unknown,
  ownershipByBase: Readonly<Record<string, ZoneOwnershipKind>>,
  path: string,
  seatIds?: readonly string[],
  zoneIdSet?: ReadonlySet<string>, // NEW
): ZoneCompileResult<string | null>
```

After successful canonicalization (existing logic unchanged), add a final existence check:

```typescript
// After line 238 (successful return path):
const canonicalId = `${zoneBase}:${normalizedQualifier.value}`;
if (zoneIdSet !== undefined && !canonicalId.startsWith('$') && !zoneIdSet.has(canonicalId)) {
  return {
    value: null,
    diagnostics: [{
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_ZONE_ID_UNKNOWN,
      path,
      severity: 'error',
      message: `Zone "${canonicalId}" does not exist.`,
      suggestion: 'Check zone definitions for the correct zone ID.',
      alternatives: [...zoneIdSet].filter(id => id.startsWith(zoneBase + ':')).sort(),
    }],
  };
}
```

The same check applies to the `owner: 'none'` auto-qualification path (line 180), where `${normalizedSelector}:none` is produced.

#### 1.2.3 New Diagnostic Code

Add to `COMPILER_DIAGNOSTIC_CODES_ZONES`:

```typescript
CNL_COMPILER_ZONE_ID_UNKNOWN: 'CNL_COMPILER_ZONE_ID_UNKNOWN',
```

This is semantically distinct from `CNL_COMPILER_ZONE_SELECTOR_UNKNOWN_BASE` (base doesn't exist) — here the base exists but the fully-qualified ID doesn't.

#### 1.2.4 Zone Definition Internal Cross-References

In `materializeZoneDefs`, after all zones are materialized, validate:

1. **`adjacentTo[].to`**: Each adjacency target must exist in the materialized zone set. Emit `CNL_COMPILER_ZONE_ADJACENCY_TARGET_UNKNOWN`.
2. **`behavior.reshuffleFrom`**: The reshuffle source zone base must resolve to an existing zone. Emit `CNL_COMPILER_ZONE_BEHAVIOR_RESHUFFLE_TARGET_UNKNOWN`.

These validations run as a post-pass after the initial zone materialization loop, since all zones must be materialized before cross-references can be checked.

New diagnostic codes in `COMPILER_DIAGNOSTIC_CODES_ZONES`:

```typescript
CNL_COMPILER_ZONE_ADJACENCY_TARGET_UNKNOWN: 'CNL_COMPILER_ZONE_ADJACENCY_TARGET_UNKNOWN',
CNL_COMPILER_ZONE_BEHAVIOR_RESHUFFLE_TARGET_UNKNOWN: 'CNL_COMPILER_ZONE_BEHAVIOR_RESHUFFLE_TARGET_UNKNOWN',
```

#### 1.2.5 Compiler Core Wiring

In `compiler-core.ts`, after zone materialization:

```typescript
const zoneIdSet = new Set(zones.map(z => z.id));

const loweringContext: EffectLoweringSharedContext = {
  ownershipByBase,
  zoneIdSet, // NEW — threaded into all downstream lowering
  // ... existing fields
};
```

All callers of `canonicalizeZoneSelector` that have access to a lowering context pass `context.zoneIdSet` as the new parameter.

### 1.3 Scope Boundaries

**In scope:**
- Static literal zone IDs in effects, conditions, event cards, macros, zone definitions
- New diagnostic codes with `alternatives` suggestions listing valid zone IDs for the same base

**Out of scope:**
- Dynamic binding validation (`$space`, `$targetProvince`) — these are runtime values, correctly validated by the kernel
- `zoneExpr` validation — these are computed expressions, not static literals
- `concat` expressions that produce zone IDs from dynamic parts — already handled by `tryStaticConcatResolution` when fully static; when dynamic, deferred to runtime

### 1.4 Backwards Compatibility

Not a concern per project constraints. Invalid zone IDs are bugs. Any GameSpecDoc that fails this new validation was already broken — it would crash at runtime. The new errors surface existing bugs earlier.

## 2. Affected Files

| File | Change |
|------|--------|
| `packages/engine/src/cnl/compiler-diagnostic-codes.ts` | Add `CNL_COMPILER_ZONE_ID_UNKNOWN`, `CNL_COMPILER_ZONE_ADJACENCY_TARGET_UNKNOWN`, `CNL_COMPILER_ZONE_BEHAVIOR_RESHUFFLE_TARGET_UNKNOWN` |
| `packages/engine/src/cnl/compile-zones.ts` | Add `zoneIdSet` param to `canonicalizeZoneSelector`; add post-materialization cross-reference pass for adjacency targets and reshuffle sources |
| `packages/engine/src/cnl/compile-conditions-shared.ts` | Add `zoneIdSet` to `ConditionLoweringContext`; pass to `canonicalizeZoneSelector` calls |
| `packages/engine/src/cnl/compile-effects-types.ts` | Add `zoneIdSet` to `EffectLoweringContext` |
| `packages/engine/src/cnl/compile-effects-utils.ts` | Pass `zoneIdSet` from context to `canonicalizeZoneSelector` in `lowerZoneSelector` |
| `packages/engine/src/cnl/compiler-core.ts` | Build `zoneIdSet` from materialized zones; include in `loweringContext` |
| All callers of `canonicalizeZoneSelector` | Thread `zoneIdSet` from their context (mechanical change) |

## 3. Testing Strategy

### 3.1 Unit Tests: `canonicalizeZoneSelector` with Zone ID Set

New test cases in the existing `canonicalizeZoneSelector` test file:

- **Valid literal zone ID** with `zoneIdSet` provided → passes (no diagnostic)
- **Invalid literal zone ID** with `zoneIdSet` provided → error diagnostic with code `CNL_COMPILER_ZONE_ID_UNKNOWN` and `alternatives` listing valid IDs for that base
- **Binding reference** (`$space`) with `zoneIdSet` provided → passes (bindings skip validation)
- **No `zoneIdSet` provided** (undefined) → existing behavior unchanged, no existence check
- **Valid `owner: 'none'` auto-qualification** → `deck` canonicalizes to `deck:none`, validated against `zoneIdSet`
- **Invalid auto-qualified zone** → base exists in `ownershipByBase` but `base:none` not in `zoneIdSet` → error

### 3.2 Unit Tests: Zone Definition Cross-References

- **Valid adjacency targets** → no diagnostics
- **Invalid adjacency target** → `CNL_COMPILER_ZONE_ADJACENCY_TARGET_UNKNOWN` with alternatives
- **Valid reshuffle source** → no diagnostics
- **Invalid reshuffle source** → `CNL_COMPILER_ZONE_BEHAVIOR_RESHUFFLE_TARGET_UNKNOWN`

### 3.3 Integration Tests: Full Compilation Pipeline

- Compile a minimal GameSpecDoc with a deliberate zone ID typo in an effect → verify compilation produces the expected diagnostic error
- Compile the production FITL spec → verify zero new diagnostics (the production data has correct zone IDs)
- Compile the production Texas Hold'em spec → verify zero new diagnostics

### 3.4 Regression Safety

The production specs already compile and pass all tests. Adding this validation must not produce false positives on correct specs. The integration tests in 3.3 serve as regression gates.

## 4. Implementation Order

1. Add diagnostic codes to `compiler-diagnostic-codes.ts`
2. Add `zoneIdSet` to `ConditionLoweringContext` and `EffectLoweringContext`
3. Enhance `canonicalizeZoneSelector` with zone ID existence check
4. Add post-materialization cross-reference pass in `materializeZoneDefs`
5. Wire `zoneIdSet` into `compiler-core.ts` lowering context
6. Update all `canonicalizeZoneSelector` call sites to thread `zoneIdSet`
7. Write unit tests for `canonicalizeZoneSelector` zone existence
8. Write unit tests for zone definition cross-references
9. Write integration tests against production specs
10. Verify `pnpm turbo build && pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

Completed: 2026-03-16

What actually changed:
- Added the zone ID diagnostics `CNL_COMPILER_ZONE_ID_UNKNOWN`, `CNL_COMPILER_ZONE_ADJACENCY_TARGET_UNKNOWN`, and `CNL_COMPILER_ZONE_BEHAVIOR_RESHUFFLE_TARGET_UNKNOWN`.
- Threaded `zoneIdSet` through compiler lowering contexts so static literal zone selectors are validated against materialized zone IDs during compilation.
- Added post-materialization validation for zone adjacency targets and reshuffle sources in zone definitions.
- Added unit coverage in `packages/engine/test/unit/compile-zones.test.ts` and integration coverage in `packages/engine/test/integration/zone-id-cross-reference-validation.test.ts`, including production FITL and Texas Hold'em regression checks.

Deviations from original plan:
- The implementation also threads `zoneIdSet` through `compile-lowering.ts` paths that participate in shared lowering helpers, beyond the narrower file list called out in the design.
- Existing validation layers in `validate-extensions.ts` and `validate-spec-core.ts` now overlap with this compiler-side protection for some paths; this spec's implementation keeps the compile-time validation rather than relying on those later checks alone.

Verification results:
- `pnpm -F @ludoforge/engine build`
- `node --test dist/test/unit/compile-zones.test.js dist/test/integration/zone-id-cross-reference-validation.test.js`
