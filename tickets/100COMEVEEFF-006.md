# 100COMEVEEFF-006: Add activeCardAnnotation runtime resolution

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — agents (policy-runtime.ts), possibly policy-preview.ts
**Deps**: `tickets/100COMEVEEFF-004.md`, `tickets/100COMEVEEFF-005.md`

## Problem

Parsed `activeCardAnnotation` surface refs must resolve to actual annotation values at runtime. The policy evaluator needs to look up the active event card's annotation from `GameDef.cardAnnotationIndex`, extract the requested side/metric/seat value, and return it for scoring. Without runtime resolution, parsed refs silently return `undefined` (or fail).

## Assumption Reassessment (2026-03-31)

1. `policy-runtime.ts` at `packages/engine/src/agents/policy-runtime.ts` already resolves `activeCardIdentity`, `activeCardTag`, `activeCardMetadata` refs using `resolveCurrentEventCardState` (imported from `kernel/event-execution.ts:209`). The annotation family follows the same resolution pattern.
2. `resolveCurrentEventCardState` returns `{ deckId, cardId, cardDef }` or `null`. The card ID is used to look up `gameDef.cardAnnotationIndex.entries[cardId]`.
3. `policy-preview.ts` at `packages/engine/src/agents/policy-preview.ts` has a parallel resolution path for preview surface refs. Must also handle `activeCardAnnotation`.
4. The `self` seat resolution needs the evaluating agent's seat ID, which is available in the resolution context as `input.seat` or equivalent.

## Architecture Check

1. Follows the exact same resolution pattern as Spec 99 families: resolve active card → look up index → extract value. No new resolution infrastructure needed.
2. `self` seat resolution: when the ref path ends with `.self`, substitute the evaluating agent's seat ID before looking up per-seat metrics. This is the only dynamic aspect.
3. Missing annotation (card has no annotation, side doesn't exist, metric is absent) → return `undefined`. Policies use `coalesce` to provide defaults. This matches existing ref resolution behavior.

## What to Change

### 1. Extend runtime resolution in `policy-runtime.ts`

Add a case for `activeCardAnnotation` family in the surface ref resolution logic:

```typescript
case 'activeCardAnnotation': {
  const current = resolveCurrentEventCardState(def, state);
  if (current === null) return undefined;
  const annotation = def.cardAnnotationIndex?.entries[current.cardId];
  if (annotation === undefined) return undefined;
  // Parse ref.id to extract side, metric, optional seat
  // e.g., "unshaded.tokenPlacements.us" → side="unshaded", metric="tokenPlacements", seat="us"
  return extractAnnotationValue(annotation, ref.id, evaluatingSeat);
}
```

Implement `extractAnnotationValue` helper:
- Split `ref.id` by `.` into `[side, metric, seat?]`
- Look up `annotation[side]` → `CompiledEventSideAnnotation`
- If `seat` is provided: look up `sideAnnotation[metric][seat]` (for per-seat record fields)
- If `seat` is `self`: substitute evaluating agent's seat ID
- Otherwise: return `sideAnnotation[metric]` directly (for scalar fields)

### 2. Extend preview resolution in `policy-preview.ts`

Add the same `activeCardAnnotation` case in the preview surface ref resolution path. Preview annotations resolve through the same `cardAnnotationIndex` — annotations are static (compile-time) so preview vs. current makes no difference for the annotation values themselves. The preview path is needed for `preview.activeCard.annotation.*` ref syntax.

### 3. Handle visibility gating

Ensure that when `activeCardAnnotation` visibility is `hidden`, the resolution returns `undefined` regardless of whether the annotation exists. This is handled by the existing visibility check infrastructure from ticket 005.

### 4. Unit tests

Test resolution scenarios:
- Resolve `activeCard.annotation.unshaded.tokenPlacements.us` with a known annotation → correct count
- Resolve `activeCard.annotation.unshaded.tokenPlacements.self` as different seats → different values
- Resolve scalar metric (e.g., `markerModifications`) → direct number
- Resolve boolean metric (e.g., `grantsOperation`) → boolean value
- No active card → `undefined`
- Active card not in annotation index → `undefined`
- Side doesn't exist on annotation → `undefined`
- `coalesce` fallback works with `undefined` annotation values
- Visibility `hidden` → returns `undefined`
- Preview path resolves correctly

## Files to Touch

- `packages/engine/src/agents/policy-runtime.ts` (modify)
- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/test/unit/agents/policy-runtime-annotation.test.ts` (new)

## Out of Scope

- The annotation builder itself (ticket 003)
- FITL agent profile YAML (ticket 007)
- Golden tests and cross-game validation (ticket 008)
- Surface ref parsing (ticket 005 — already done)

## Acceptance Criteria

### Tests That Must Pass

1. `activeCard.annotation.unshaded.tokenPlacements.us` resolves to correct numeric value
2. `activeCard.annotation.unshaded.tokenPlacements.self` resolves differently per evaluating seat
3. Scalar metrics (e.g., `markerModifications`) resolve to numbers
4. Boolean metrics (e.g., `grantsOperation`) resolve to booleans
5. Missing card / missing annotation / missing side → `undefined`
6. `coalesce` with annotation ref falls back correctly when annotation is missing
7. Preview path resolution works identically to current path
8. Visibility gating: `hidden` visibility returns `undefined`
9. Existing surface ref resolution tests continue passing
10. Existing suite: `pnpm turbo test`

### Invariants

1. Annotation resolution is read-only — never mutates GameDef or GameState
2. `self` seat resolution uses the evaluating agent's seat, not a hardcoded value
3. Missing annotations always produce `undefined` (never throw), enabling safe `coalesce` patterns
4. Same resolution logic for current and preview paths (annotations are compile-time static)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-runtime-annotation.test.ts` — resolution tests for all metric types, self-seat, missing data, visibility, and preview

### Commands

1. `node --test packages/engine/dist/test/unit/agents/policy-runtime-annotation.test.js`
2. `pnpm turbo typecheck`
3. `pnpm turbo test`
