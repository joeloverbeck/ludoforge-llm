# LEGACTTOO-004: Core Normalizer — Variable, Token, Marker Effect Rules

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — new kernel module (`tooltip-normalizer.ts`), minor type extensions
**Deps**: LEGACTTOO-001, LEGACTTOO-003

## Problem

The core normalizer converts individual `EffectAST` nodes into semantic `TooltipMessage` instances. Rules cover the three simplest effect categories (variable, token, marker) where each AST node maps to exactly one message. Without these, no tooltip can describe what an action's effects do.

## Assumption Reassessment (2026-03-06, corrected)

1. `EffectAST` is a discriminated union in `packages/engine/src/kernel/types-ast.ts`. Effect kinds include `addVar`, `setVar`, `transferVar`, `moveToken`, `setTokenProp`, `createToken`, `destroyToken`, `moveAll`, `moveTokenAdjacent`, `draw`, `reveal`, `conceal`, `shuffle`, `shiftMarker`, `setMarker`, `setGlobalMarker`, `flipGlobalMarker`, `shiftGlobalMarker`, plus compound/turn-flow effects.
2. `addVar` payload uses `ScopedVarPayloadContract` with `scope: 'global' | 'pvar' | 'zoneVar'`, `var: string`, `delta: NumericValueExpr`. `setVar` has `value: ValueExpr` instead of `delta`.
3. `transferVar` has `from`/`to` as `TransferVarEndpoint` (scoped, with `var` field), and `amount: NumericValueExpr`.
4. Zone naming conventions: `available-*` for supply zones, `casualties-*` for casualty zones. String pattern matching, not hardcoded names.
5. Token properties include `activity` with values like `active`, `underground`, `inactive`. The normalizer checks for `activity` prop name generically.
6. **Original ticket errors corrected**:
   - AST has dedicated `moveTokenAdjacent` effect — no adjacency heuristic needed (rule 11).
   - AST has dedicated `draw` effect `{ from, to, count }` — not detected via `moveToken` (rule 18).
   - Effect key is `reveal` (not `revealToken`/`revealZone`) with `{ zone, to, filter? }` (rule 19).
   - Effect key is `shuffle` (not `shuffleZone`) with `{ zone }` (rule 20).
   - `conceal` is a leaf effect not covered in original rules — added as rule 23b.
   - `shiftGlobalMarker` is a leaf effect not covered in original rules — added as rule 28.
   - `flipGlobalMarker.marker` is `ValueExpr`, not `string` — needs stringification.
   - `SetMessage` had no `toggle` field — added `toggle?: boolean`.

## Architecture Check

1. The normalizer is a pure function: `normalizeEffect(effect: EffectAST, context: NormalizerContext, astPath: string) → readonly TooltipMessage[]`. Context provides VerbalizationDef and suppress patterns.
2. Engine-agnostic: rules match on AST structure (effect kind, zone name prefixes, property names), not on game-specific identifiers.
3. Dispatch uses `'key' in effect` checks — direct and type-safe on the discriminated union.
4. Scaffolding effects are caught first via `isScaffoldingEffect` from tooltip-suppression.
5. Compound/control-flow effects return a `SuppressedMessage(reason: 'unhandled')` placeholder for LEGACTTOO-005.

## What to Change

### 1. Extend `packages/engine/src/kernel/tooltip-ir.ts` (minor)

- Add `toggle?: boolean` to `SetMessage`
- Add `ConcealMessage` type: `{ kind: 'conceal', target: string, astPath, ... }`
- Add `'conceal'` to `TooltipMessage` union and `TOOLTIP_MESSAGE_KINDS`

### 2. Create `packages/engine/src/kernel/tooltip-normalizer.ts` (~280 lines)

**Variable rules (1-8)**:
- Rule 1: `addVar` + negative literal → `PayMessage`
- Rule 2: `addVar` + positive literal → `GainMessage`
- Rule 3: `transferVar` → `TransferMessage`
- Rule 4-6: `setVar` + suppress match → `SuppressedMessage`
- Rule 7: `setVar` generic → `SetMessage`
- Rule 8: `addVar` + non-literal → `SetMessage`

**Token rules (9-23b)**:
- Rule 9: `moveToken` from `available-*` → `PlaceMessage`
- Rule 10: `moveToken` to `available-*`/`casualties-*` → `RemoveMessage`
- Rule 11: `moveTokenAdjacent` → `MoveMessage(variant: 'adjacent')` — direct AST node
- Rule 12: `moveToken` generic → `MoveMessage`
- Rule 13: `setTokenProp` activity=active/underground → `ActivateMessage`
- Rule 14: `setTokenProp` activity=inactive → `DeactivateMessage`
- Rule 15: `setTokenProp` generic → `SetMessage`
- Rule 16: `createToken` → `CreateMessage`
- Rule 17: `destroyToken` → `DestroyMessage`
- Rule 18: `draw` → `DrawMessage` — direct AST node
- Rule 19: `reveal` → `RevealMessage`
- Rule 20: `shuffle` → `ShuffleMessage`
- Rule 21-23: `moveAll` variants (same zone-prefix logic as moveToken rules 9-10, 12)
- Rule 23b: `conceal` → `ConcealMessage`

**Marker rules (24-29)**:
- Rule 24: `shiftMarker` → `ShiftMessage`
- Rule 25: `setMarker` → `SetMessage`
- Rule 26: `setGlobalMarker` → `SetMessage`
- Rule 27: `flipGlobalMarker` → `SetMessage(toggle: true)`
- Rule 28: `shiftGlobalMarker` → `ShiftMessage`
- Rule 29: Unhandled leaf effects → `SuppressedMessage(reason: 'unhandled')`

### 3. Export from `packages/engine/src/kernel/index.ts`

Add barrel export for `tooltip-normalizer.js`.

## Files to Touch

- `packages/engine/src/kernel/tooltip-ir.ts` (modify — add ConcealMessage, toggle field)
- `packages/engine/src/kernel/tooltip-normalizer.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify — add export)
- `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` (new)

## Out of Scope

- Control flow rules (chooseOne, chooseN, forEach, if, rollRandom, removeByPriority, repeat, reduce) → LEGACTTOO-005
- Suppression rules for `let`/`bindValue`/`concat`/`evaluateSubset` as normalizer integration → LEGACTTOO-005 (already handled by `isScaffoldingEffect`)
- Turn flow rules (grantFreeOperation, gotoPhaseExact, advancePhase, pushInterruptPhase, popInterruptPhase) → LEGACTTOO-005
- Macro override → LEGACTTOO-005
- Content planner, template realizer → LEGACTTOO-006, LEGACTTOO-007

## Acceptance Criteria

### Tests That Must Pass

1. Rule 1: `addVar` with literal `-3` on `aid` → `PayMessage { resource: 'aid', amount: 3 }`
2. Rule 2: `addVar` with literal `+5` on `resources` → `GainMessage { resource: 'resources', amount: 5 }`
3. Rule 3: `transferVar` → `TransferMessage` with correct from/to/resource
4. Rules 4-6: `setVar` on `sweepCount`, `__temp`, `rallyTracker` → `SuppressedMessage`
5. Rule 7: `setVar` on `patronage` → `SetMessage`
6. Rule 8: `addVar` with non-literal expr → `SetMessage`
7. Rule 9: `moveToken` from `available-us` → `PlaceMessage`
8. Rule 10: `moveToken` to `casualties-us` → `RemoveMessage`
9. Rule 11: `moveTokenAdjacent` → `MoveMessage(variant: 'adjacent')`
10. Rule 12: `moveToken` generic → `MoveMessage`
11. Rule 13: `setTokenProp` activity=`underground` → `ActivateMessage`
12. Rule 14: `setTokenProp` activity=`inactive` → `DeactivateMessage`
13. Rule 16: `createToken` → `CreateMessage`
14. Rule 17: `destroyToken` → `DestroyMessage`
15. Rule 18: `draw` → `DrawMessage`
16. Rule 19: `reveal` → `RevealMessage`
17. Rule 20: `shuffle` → `ShuffleMessage`
18. Rule 21: `moveAll` from `available-*` → `PlaceMessage`
19. Rule 23b: `conceal` → `ConcealMessage`
20. Rule 24: `shiftMarker` → `ShiftMessage` with direction and amount
21. Rule 25: `setMarker` → `SetMessage`
22. Rule 27: `flipGlobalMarker` → `SetMessage` with toggle flag
23. Rule 28: `shiftGlobalMarker` → `ShiftMessage`
24. All messages include correct `astPath` traces
25. Scaffolding effects (`let`, `bindValue`, etc.) → `SuppressedMessage`
26. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. `normalizeEffect` is pure — no side effects, no state mutation.
2. Every EffectAST node produces at least one TooltipMessage (even if `SuppressedMessage`).
3. `astPath` is set on every returned message — never empty.
4. No game-specific identifiers in normalizer logic (zone prefix checks like `available-*` use string pattern matching, not hardcoded zone names).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` — one test per rule with synthetic EffectAST fixtures. Tests construct minimal AST nodes and verify the returned message kind and key fields.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm turbo typecheck`

## Outcome

**All deliverables implemented as planned.** Key deviations from the original (pre-reassessment) ticket:

- **8 assumption corrections**: The original ticket assumed heuristic detection for adjacency moves, draw, reveal, shuffle, and missed `conceal` and `shiftGlobalMarker` entirely. The reassessment phase corrected these against the actual AST before any code was written.
- **`ConcealMessage` added to IR**: New message type not in the original ticket scope, added after discovering `conceal` is a leaf effect in the AST.
- **`toggle?: boolean` on `SetMessage`**: Added to support `flipGlobalMarker` semantics cleanly.
- **44 tests** covering all 29 rules plus invariant checks (astPath presence, purity, at-least-one-message guarantee).
- **No architectural deviations**: The normalizer is pure, engine-agnostic, and uses `'key' in effect` dispatch as planned. Scaffolding effects delegate to `isScaffoldingEffect` from tooltip-suppression. Compound effects return `SuppressedMessage` placeholders for LEGACTTOO-005.
- **Build, unit tests, and typecheck all pass.**
