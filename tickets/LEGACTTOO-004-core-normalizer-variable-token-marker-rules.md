# LEGACTTOO-004: Core Normalizer — Variable, Token, Marker Effect Rules (1-27)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — new kernel module (`tooltip-normalizer.ts`)
**Deps**: LEGACTTOO-001, LEGACTTOO-003

## Problem

The core normalizer converts individual `EffectAST` nodes into semantic `TooltipMessage` instances. Rules 1-27 cover the three simplest effect categories (variable, token, marker) where each AST node maps to exactly one message. Without these, no tooltip can describe what an action's effects do.

## Assumption Reassessment (2026-03-06)

1. `EffectAST` is a discriminated union in `packages/engine/src/kernel/types-core.ts`. Effect kinds include `addVar`, `setVar`, `transferVar`, `moveToken`, `setTokenProp`, `createToken`, `destroyToken`, `moveAll`, `shiftMarker`, `setMarker`, `setGlobalMarker`, `flipGlobalMarker`, `revealToken`, `shuffleZone`, etc.
2. Zone naming conventions: `available-*` for supply zones, `casualties-*` for casualty zones. These are identifier conventions, not enforced by schema.
3. Token properties include `activity` with values like `active`, `underground`, `inactive`. These are game-defined but the normalizer checks for the `activity` prop name generically.

## Architecture Check

1. The normalizer is a pure function: `normalizeEffect(effect: EffectAST, context: NormalizerContext) → TooltipMessage[]`. Context provides VerbalizationDef and suppress patterns.
2. Engine-agnostic: rules match on AST structure (effect kind, zone name prefixes, property names), not on game-specific identifiers.
3. Rules are ordered by priority — first match wins. This ticket implements rules 1-27; compound/control-flow rules (28-43) are in LEGACTTOO-005.

## What to Change

### 1. Create `packages/engine/src/kernel/tooltip-normalizer.ts` (~250 lines for rules 1-27)

Define `NormalizerContext`:
```typescript
interface NormalizerContext {
  readonly verbalization: VerbalizationDef | undefined;
  readonly suppressPatterns: readonly string[];
}
```

Export `normalizeEffect(effect: EffectAST, ctx: NormalizerContext, astPath: string): readonly TooltipMessage[]`:

**Variable rules (1-8)**:
- Rule 1: `addVar` + negative literal → `PayMessage`
- Rule 2: `addVar` + positive literal → `GainMessage`
- Rule 3: `transferVar` → `TransferMessage`
- Rule 4-6: `setVar` + suppress match → `SuppressedMessage`
- Rule 7: `setVar` generic → `SetMessage`
- Rule 8: `addVar` + non-literal → `SetMessage`

**Token rules (9-23)**:
- Rule 9: `moveToken` from `available-*` → `PlaceMessage`
- Rule 10: `moveToken` to `available-*`/`casualties-*` → `RemoveMessage`
- Rule 11: `moveToken` adjacent → `MoveMessage(variant: 'adjacent')`
- Rule 12: `moveToken` generic → `MoveMessage`
- Rule 13: `setTokenProp` activity=active/underground → `ActivateMessage`
- Rule 14: `setTokenProp` activity=inactive → `DeactivateMessage`
- Rule 15: `setTokenProp` generic → `SetMessage`
- Rule 16: `createToken` → `CreateMessage`
- Rule 17: `destroyToken` → `DestroyMessage`
- Rule 18: `moveToken` from deck zone → `DrawMessage`
- Rule 19: `revealToken`/`revealZone` → `RevealMessage`
- Rule 20: `shuffleZone` → `ShuffleMessage`
- Rule 21-23: `moveAll` variants (same logic as moveToken rules 9-12)

**Marker rules (24-27)**:
- Rule 24: `shiftMarker` → `ShiftMessage`
- Rule 25: `setMarker` → `SetMessage`
- Rule 26: `setGlobalMarker` → `SetMessage`
- Rule 27: `flipGlobalMarker` → `SetMessage(toggle: true)`

### 2. Export from `packages/engine/src/kernel/index.ts`

Add barrel export for `tooltip-normalizer.js`.

## Files to Touch

- `packages/engine/src/kernel/tooltip-normalizer.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify — add export)
- `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` (new)

## Out of Scope

- Control flow rules 28-36 (LEGACTTOO-005)
- Suppression rules 37-40 as normalizer integration (LEGACTTOO-005 — the suppression utility from LEGACTTOO-003 is called but the normalizer integration for `let`/`bindValue`/`forEach` is compound)
- Turn flow rules 41-43 (LEGACTTOO-005)
- Macro override (LEGACTTOO-005)
- Content planner, template realizer (LEGACTTOO-006, LEGACTTOO-007)
- Zone adjacency detection for rule 11 (use a simple heuristic: if `fromZone` AST contains `adjacentZones` reference, emit `variant: 'adjacent'`)

## Acceptance Criteria

### Tests That Must Pass

1. Rule 1: `addVar` with literal `-3` on `aid` → `PayMessage { resource: 'aid', amount: 3 }`
2. Rule 2: `addVar` with literal `+5` on `resources` → `GainMessage { resource: 'resources', amount: 5 }`
3. Rule 3: `transferVar` → `TransferMessage` with correct from/to/resource
4. Rules 4-6: `setVar` on `sweepCount`, `__temp`, `rallyTracker` → `SuppressedMessage`
5. Rule 7: `setVar` on `patronage` → `SetMessage`
6. Rule 9: `moveToken` from `available-us` → `PlaceMessage`
7. Rule 10: `moveToken` to `casualties-us` → `RemoveMessage`
8. Rule 13: `setTokenProp` activity=`underground` → `ActivateMessage`
9. Rule 14: `setTokenProp` activity=`inactive` → `DeactivateMessage`
10. Rule 16: `createToken` → `CreateMessage`
11. Rule 20: `shuffleZone` → `ShuffleMessage`
12. Rule 24: `shiftMarker` → `ShiftMessage` with direction and amount
13. Rule 27: `flipGlobalMarker` → `SetMessage` with toggle flag
14. All messages include correct `astPath` traces
15. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. `normalizeEffect` is pure — no side effects, no state mutation.
2. Every EffectAST node produces at least one TooltipMessage (even if `SuppressedMessage`).
3. `astPath` is set on every returned message — never empty.
4. No game-specific identifiers in normalizer logic (zone prefix checks like `available-*` use string pattern matching, not hardcoded zone names).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` — one test per rule (1-27) with synthetic EffectAST fixtures. Tests construct minimal AST nodes and verify the returned message kind and key fields.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm turbo typecheck`
