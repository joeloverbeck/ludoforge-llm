# 102SHAOBSMOD-002: Add observability section to GameSpecDoc schema

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `game-spec-doc.ts`
**Deps**: `archive/tickets/102SHAOBSMOD-001.md`, `specs/102-shared-observer-model.md`

## Problem

The GameSpecDoc has no `observability:` section. Observer profiles must be declarable in YAML before the compiler can validate or compile them. This ticket adds the TypeScript types and the `observability` field to `GameSpecDoc`.

## Assumption Reassessment (2026-04-01)

1. `GameSpecDoc` is defined in `packages/engine/src/cnl/game-spec-doc.ts` — confirmed.
2. `GameSpecAgentsSection` currently has a `visibility` field — confirmed at line 629. This field is NOT removed in this ticket (that happens in ticket 006).
3. `GameSpecPolicySurfaceVisibilityClass` exists in `game-spec-doc.ts` at line 514 — this will be the basis for observer surface visibility values in the new types.
4. No `observability` field exists on `GameSpecDoc` today — confirmed.

## Architecture Check

1. Adds declarative schema types only — no compilation or runtime behavior.
2. Types are game-agnostic: any game can declare observers with arbitrary surface overrides.
3. No shims — the `observability` field is optional on `GameSpecDoc` so existing specs compile unchanged.

## What to Change

### 1. Add observer types to `packages/engine/src/cnl/game-spec-doc.ts`

Add the following types:

```typescript
// Re-use existing GameSpecPolicySurfaceVisibilityClass for visibility values

// Full per-variable surface entry (current + optional preview override)
export interface GameSpecObserverSurfaceEntryDef {
  readonly current?: GameSpecPolicySurfaceVisibilityClass;
  readonly preview?: GameSpecPolicySurfacePreviewVisibilityDef;
}

// A surface family value can be:
// - shorthand: 'public' | 'seatVisible' | 'hidden'
// - full: { current, preview }
// - map-type with _default + per-variable overrides
export type GameSpecObserverSurfaceValue =
  | GameSpecPolicySurfaceVisibilityClass
  | GameSpecObserverSurfaceEntryDef
  | Readonly<Record<string, GameSpecPolicySurfaceVisibilityClass | GameSpecObserverSurfaceEntryDef>>;

export interface GameSpecObserverSurfacesDef {
  readonly globalVars?: GameSpecObserverSurfaceValue;
  readonly perPlayerVars?: GameSpecObserverSurfaceValue;
  readonly derivedMetrics?: GameSpecObserverSurfaceValue;
  readonly victory?: {
    readonly currentMargin?: GameSpecPolicySurfaceVisibilityClass | GameSpecObserverSurfaceEntryDef;
    readonly currentRank?: GameSpecPolicySurfaceVisibilityClass | GameSpecObserverSurfaceEntryDef;
  };
  readonly activeCardIdentity?: GameSpecPolicySurfaceVisibilityClass | GameSpecObserverSurfaceEntryDef;
  readonly activeCardTag?: GameSpecPolicySurfaceVisibilityClass | GameSpecObserverSurfaceEntryDef;
  readonly activeCardMetadata?: GameSpecPolicySurfaceVisibilityClass | GameSpecObserverSurfaceEntryDef;
  readonly activeCardAnnotation?: GameSpecPolicySurfaceVisibilityClass | GameSpecObserverSurfaceEntryDef;
}

export interface GameSpecObserverProfileDef {
  readonly extends?: string;
  readonly description?: string;
  readonly surfaces?: GameSpecObserverSurfacesDef;
  // 'zones' reserved for Spec 106 — compiler rejects if present
}

export interface GameSpecObservabilitySection {
  readonly observers?: Readonly<Record<string, GameSpecObserverProfileDef>>;
}
```

### 2. Add `observability` field to `GameSpecDoc`

Add `readonly observability: GameSpecObservabilitySection | null;` to the `GameSpecDoc` interface.

### 3. Update parser to pass through `observability`

In the parser/assembler that constructs `GameSpecDoc` from parsed YAML sections, pass the `observability` section through (or `null` if absent).

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- Parser/assembler file that constructs `GameSpecDoc` (modify — grep for `GameSpecDoc` construction)

## Out of Scope

- Validation of observer profiles — that is ticket 003
- Compilation of observer profiles — that is ticket 004
- Removing `agents.visibility` — that is ticket 006
- Adding `observer` field to `GameSpecAgentProfileDef` — that is ticket 006

## Acceptance Criteria

### Tests That Must Pass

1. Existing specs (FITL, Texas Hold'em) compile unchanged — `observability` is `null`
2. `pnpm turbo typecheck` passes with new types
3. A spec with an `observability:` YAML section parses into `GameSpecDoc.observability` correctly

### Invariants

1. `GameSpecDoc.observability` is `null` when the YAML section is absent — no implicit defaults at the schema level
2. New types are game-agnostic — no game-specific surface names or visibility rules

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/parse-observability.test.ts` — parse a minimal observer profile YAML, verify `GameSpecDoc.observability` structure

### Commands

1. `pnpm -F @ludoforge/engine test` — full engine test suite
2. `pnpm turbo typecheck` — type correctness
