# 100COMEVEEFF-001: Add annotation types and GameDef field

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel types (`types-core.ts`)
**Deps**: `archive/specs/99-event-card-policy-surface.md`

## Problem

The compiler needs typed data structures to hold per-card, per-side strategic feature vectors extracted from event effect ASTs. Without these types, the annotation builder (ticket 003) and surface ref resolution (tickets 005/006) have no contracts to implement against.

## Assumption Reassessment (2026-03-31)

1. `CompiledAgentPolicySurfaceRefFamily` exists at `packages/engine/src/kernel/types-core.ts:338` with 8 families (Spec 99 families already landed: `activeCardIdentity`, `activeCardTag`, `activeCardMetadata`). Confirmed.
2. `GameDef` type in `types-core.ts` already has `cardMetadataIndex` optional field. `cardAnnotationIndex` follows the same pattern.
3. `CompiledAgentPolicySurfaceCatalog` exists and includes visibility entries for all current families.

## Architecture Check

1. Flat numeric feature vectors are the simplest possible representation — no nested ASTs, no game-specific fields. Each field maps directly to a generic effect AST node kind.
2. Types are kernel-level contracts consumed by both the compiler (producer) and agents (consumer). No game-specific logic — all fields derive from generic `EffectAST` `_k` discriminant tags.
3. No backwards-compatibility shims. New optional field on GameDef; existing GameDefs without `cardAnnotationIndex` continue working.

## What to Change

### 1. Add annotation interfaces to `types-core.ts`

Add after the existing `CompiledCardMetadataIndex` type block:

```typescript
export interface CompiledEventSideAnnotation {
  readonly tokenPlacements: Readonly<Record<string, number>>;
  readonly tokenRemovals: Readonly<Record<string, number>>;
  readonly tokenCreations: Readonly<Record<string, number>>;
  readonly tokenDestructions: Readonly<Record<string, number>>;
  readonly markerModifications: number;
  readonly globalMarkerModifications: number;
  readonly globalVarModifications: number;
  readonly perPlayerVarModifications: number;
  readonly varTransfers: number;
  readonly drawCount: number;
  readonly shuffleCount: number;
  readonly grantsOperation: boolean;
  readonly grantOperationSeats: readonly string[];
  readonly hasEligibilityOverride: boolean;
  readonly hasLastingEffect: boolean;
  readonly hasBranches: boolean;
  readonly hasPhaseControl: boolean;
  readonly hasDecisionPoints: boolean;
  readonly effectNodeCount: number;
}

export interface CompiledEventCardAnnotation {
  readonly cardId: string;
  readonly unshaded?: CompiledEventSideAnnotation;
  readonly shaded?: CompiledEventSideAnnotation;
}

export interface CompiledEventAnnotationIndex {
  readonly entries: Readonly<Record<string, CompiledEventCardAnnotation>>;
}
```

### 2. Add `cardAnnotationIndex` to `GameDef`

Add an optional field to the `GameDef` interface, parallel to `cardMetadataIndex`:

```typescript
readonly cardAnnotationIndex?: CompiledEventAnnotationIndex;
```

### 3. Add `activeCardAnnotation` to `CompiledAgentPolicySurfaceRefFamily`

Extend the union type at line 338:

```typescript
export type CompiledAgentPolicySurfaceRefFamily =
  | 'globalVar'
  | 'perPlayerVar'
  | 'derivedMetric'
  | 'victoryCurrentMargin'
  | 'victoryCurrentRank'
  | 'activeCardIdentity'
  | 'activeCardTag'
  | 'activeCardMetadata'
  | 'activeCardAnnotation';
```

### 4. Extend `CompiledAgentPolicySurfaceCatalog`

Add an `activeCardAnnotation` visibility entry to the catalog type, following the same pattern as `activeCardMetadata`.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)

## Out of Scope

- JSON Schema for the new types (ticket 002)
- Effect AST walker implementation (ticket 003)
- Surface ref parsing or resolution (tickets 005/006)
- Any runtime or compiler logic

## Acceptance Criteria

### Tests That Must Pass

1. TypeScript compiles cleanly with the new types (`pnpm turbo typecheck`)
2. Existing test suite passes unchanged (`pnpm turbo test`)
3. A synthetic `CompiledEventSideAnnotation` value type-checks with all required fields

### Invariants

1. All annotation fields are `readonly` — immutability enforced at the type level
2. `cardAnnotationIndex` is optional on `GameDef` — existing GameDefs without it remain valid
3. `CompiledAgentPolicySurfaceRefFamily` union is exhaustive — any downstream switch/dispatch that was exhaustive before will now require an `activeCardAnnotation` case (compile errors are expected and desirable until tickets 005/006 handle them)

## Test Plan

### New/Modified Tests

1. No new test files needed — this is a types-only change. Typecheck is the primary validation.

### Commands

1. `pnpm turbo typecheck`
2. `pnpm turbo test`

## Outcome

- **Completion date**: 2026-03-31
- **What changed**: Added `CompiledEventSideAnnotation`, `CompiledEventCardAnnotation`, `CompiledEventAnnotationIndex` interfaces to `types-core.ts`. Added `'activeCardAnnotation'` to `CompiledAgentPolicySurfaceRefFamily` union, `activeCardAnnotation` field to `CompiledAgentPolicySurfaceCatalog`, and `cardAnnotationIndex?` to `GameDef`. Updated all downstream source files (`compile-agents.ts`, `policy-surface.ts`, `policy-runtime.ts`, `policy-preview.ts`, `schemas-core.ts`, `validate-agents.ts`, `game-spec-doc.ts`) and 17 test files (28 catalog construction sites) plus 2 golden fixtures and 3 regenerated schema artifacts.
- **Deviations**: Ticket stated "compile errors are expected and desirable until tickets 005/006" but also required existing tests to pass unchanged. Resolved by adding `activeCardAnnotation` entries to all catalog construction sites (source + tests + goldens) with default hidden visibility, rather than leaving compile errors.
- **Verification**: `pnpm turbo typecheck` clean, `pnpm turbo lint` clean, `pnpm turbo test` 5213/5213 pass.
