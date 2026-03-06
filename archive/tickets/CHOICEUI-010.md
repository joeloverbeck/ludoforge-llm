# CHOICEUI-010: Deduplicate zonesById Map Construction in Render Model Derivation

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: CHOICEUI-007

## Problem

`deriveRenderModel()` builds `zonesById` at line 111 and passes it to `deriveChoiceContext` and `deriveChoiceBreadcrumb`. Independently, `deriveChoiceUi()` rebuilds the identical map at line 1331 from the `zones` array it receives. The same O(n) map construction runs twice per render cycle for the same data.

## Assumption Reassessment (2026-03-06)

1. `deriveRenderModel` (line 111): `const zonesById = new Map(zones.map((zone) => [zone.id, zone]));` — used by `deriveChoiceContext` and `deriveChoiceBreadcrumb`.
2. `deriveChoiceUi` (line 1325): accepts `zones: readonly RenderZone[]` parameter, then rebuilds `const zonesById = new Map(zones.map(...))` at line 1350 inside the `pending !== null` branch.
3. `deriveChoiceUi` also builds `tokensById` and `playersById` from array params — these maps are not built at the top level of `deriveRenderModel`, so only `zonesById` is duplicated today.
4. No other caller of `deriveChoiceUi` exists — it is called only from `deriveRenderModel`.
5. **Ordering correction**: `deriveChoiceUi` is called at line 110, *before* `zonesById` is constructed at line 111. The fix must move `zonesById` construction above the `deriveChoiceUi` call.

## Architecture Check

1. Passing the pre-built `zonesById` map eliminates redundant work and aligns `deriveChoiceUi` with how `deriveChoiceContext` and `deriveChoiceBreadcrumb` already receive it.
2. No game-specific branching involved — this is a pure runner-layer derivation optimization.
3. No backwards-compatibility shims — the function signature changes are internal to the module.

## What to Change

### 1. Change `deriveChoiceUi` signature to accept `zonesById` instead of `zones`

```typescript
function deriveChoiceUi(
  context: RenderContext,
  zonesById: ReadonlyMap<string, RenderZone>,
  tokens: readonly RenderToken[],
  players: readonly RenderModel['players'][number][],
): RenderChoiceUi
```

Remove the `const zonesById = new Map(zones.map(...))` line inside the function body.

### 2. Update the call site in `deriveRenderModel`

Move `zonesById` construction above `deriveChoiceUi` call (currently line 111 is after line 110), then pass the map:

```typescript
const zonesById = new Map(zones.map((zone) => [zone.id, zone]));
const choiceUi = deriveChoiceUi(context, zonesById, tokens, players);
```

## Files to Touch

- `packages/runner/src/model/derive-render-model.ts` (modify)

## Out of Scope

- Deduplicating `tokensById` / `playersById` (not built at top level today; could be a follow-up if more callers need them).
- Performance benchmarking (the map is small; this is about code hygiene, not measurable perf).

## Acceptance Criteria

### Tests That Must Pass

1. All existing `derive-render-model-state.test.ts` tests pass unchanged (behavior is identical).
2. Existing suite: `pnpm -F @ludoforge/runner test`.

### Invariants

1. `deriveChoiceUi` produces the same output for the same inputs.
2. `zonesById` is constructed exactly once per `deriveRenderModel` call.

## Test Plan

### New/Modified Tests

1. No new tests needed — this is a pure refactor with no behavioral change.

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner typecheck`

## Outcome

**Changed vs originally planned**: Implementation matched the ticket exactly, with one ordering correction discovered during reassessment: `deriveChoiceUi` was called *before* `zonesById` was constructed (line 110 vs 111), so the fix also reordered the statements. Three edits in `derive-render-model.ts`:

1. Moved `zonesById` construction above `deriveChoiceUi` call
2. Changed `deriveChoiceUi` signature: `zones: readonly RenderZone[]` → `zonesById: ReadonlyMap<string, RenderZone>`
3. Removed duplicate `const zonesById = new Map(zones.map(...))` inside the function body

All 147 test files (1444 tests) pass. Typecheck clean. No new tests needed — pure refactor.
