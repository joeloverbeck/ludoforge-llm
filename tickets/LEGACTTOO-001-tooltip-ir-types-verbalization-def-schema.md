# LEGACTTOO-001: TooltipIR Types + VerbalizationDef Types + GameSpecDoc Schema Changes

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new type files + schema additions to GameSpecDoc and GameDef
**Deps**: None (foundation ticket)

## Problem

There is no semantic intermediate representation between EffectAST trees and human-readable English. Before any normalization or realization logic can be built, the type system must exist: TooltipIR message types, VerbalizationDef for game-specific labels, and the schema plumbing that wires verbalization into GameSpecDoc and GameDef.

## Assumption Reassessment (2026-03-06)

1. `GameSpecDoc` (at `packages/engine/src/cnl/game-spec-doc.ts:435`) has no `verbalization` field — confirmed absent.
2. `GameDef` (at `packages/engine/src/kernel/types-core.ts:252`) has no `verbalization` field — confirmed absent.
3. No `tooltip-ir.ts` or `tooltip-rule-card.ts` files exist anywhere in the engine.

## Architecture Check

1. Pure type definitions with no runtime behavior — minimal risk, maximal downstream enablement.
2. `VerbalizationDef` is game-agnostic (labels/stages/macros/sentencePlans/suppressPatterns are generic maps). Game-specific content lives in YAML data files, not in types.
3. No backwards-compatibility shims — `verbalization` is optional on both `GameSpecDoc` and `GameDef`.

## What to Change

### 1. Create `packages/engine/src/kernel/tooltip-ir.ts` (~100 lines)

Define `MessageBase` interface and all 22 message kind interfaces as a discriminated union `TooltipMessage`:
- `SelectMessage`, `PlaceMessage`, `MoveMessage`, `PayMessage`, `GainMessage`, `TransferMessage`, `ShiftMessage`, `ActivateMessage`, `DeactivateMessage`, `RemoveMessage`, `CreateMessage`, `DestroyMessage`, `RevealMessage`, `DrawMessage`, `ShuffleMessage`, `SetMessage`, `ChooseMessage`, `RollMessage`, `ModifierMessage`, `BlockerMessage`, `PhaseMessage`, `GrantMessage`, `SuppressedMessage`

Each extends `MessageBase` with `readonly kind` discriminant. All fields `readonly`.

### 2. Create `packages/engine/src/kernel/tooltip-rule-card.ts` (~120 lines, types only)

Define:
- `ContentStep` — step number, header, lines, optional sub-steps
- `ContentModifier` — condition, description, active flag
- `RuleCard` — synopsis, steps, modifiers arrays (all readonly)
- `BlockerDetail` — astPath, description, currentValue?, requiredValue?
- `BlockerInfo` — satisfied boolean, blockers array
- `RuleState` — available boolean, blockers, activeModifierIndices, limitUsage
- `ActionTooltipPayload` — `{ ruleCard: RuleCard; ruleState: RuleState }`

### 3. Add `VerbalizationDef` to `packages/engine/src/kernel/types-core.ts`

Add interface `VerbalizationDef` with fields: `labels`, `stages`, `macros`, `sentencePlans`, `suppressPatterns` (all using `ReadonlyMap` / `readonly` arrays). Add optional `verbalization?: VerbalizationDef` field to `GameDef`.

### 4. Add `verbalization` field to `packages/engine/src/cnl/game-spec-doc.ts`

Add `readonly verbalization: GameSpecVerbalization | null` to `GameSpecDoc`. Define `GameSpecVerbalization` interface with the raw YAML shape (plain objects, not Maps — Maps are the compiled form).

### 5. Export new modules from `packages/engine/src/kernel/index.ts`

Add barrel exports for `tooltip-ir.js` and `tooltip-rule-card.js`.

## Files to Touch

- `packages/engine/src/kernel/tooltip-ir.ts` (new)
- `packages/engine/src/kernel/tooltip-rule-card.ts` (new)
- `packages/engine/src/kernel/types-core.ts` (modify — add `VerbalizationDef`, add field to `GameDef`)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify — add `GameSpecVerbalization`, add field to `GameSpecDoc`)
- `packages/engine/src/kernel/index.ts` (modify — add exports)
- `packages/engine/test/unit/kernel/tooltip-ir.test.ts` (new)
- `packages/engine/test/unit/kernel/tooltip-rule-card.test.ts` (new)

## Out of Scope

- Verbalization compiler logic (LEGACTTOO-002)
- Normalizer, planner, realizer implementations (LEGACTTOO-003 through LEGACTTOO-007)
- Runner UI changes (LEGACTTOO-009)
- Actual verbalization YAML content for games (LEGACTTOO-010, LEGACTTOO-011)
- Any runtime behavior — this ticket is types only

## Acceptance Criteria

### Tests That Must Pass

1. `TooltipMessage` discriminated union: constructing each of the 22 kinds type-checks correctly.
2. `RuleCard` and `RuleState` can be constructed with readonly fields; mutation attempts fail at compile time.
3. `VerbalizationDef` can be assigned to `GameDef.verbalization` optional field.
4. `GameSpecDoc` accepts a `verbalization: null` field without breaking existing parsing.
5. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. All new types are fully `readonly` — no mutable fields.
2. `GameDef.verbalization` is optional — existing GameDefs without it remain valid.
3. `GameSpecDoc.verbalization` is nullable — existing specs without it parse unchanged.
4. No runtime code added — pure type definitions and construction tests only.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-ir.test.ts` — construct each message kind, verify discriminated union narrowing works.
2. `packages/engine/test/unit/kernel/tooltip-rule-card.test.ts` — construct RuleCard, RuleState, ActionTooltipPayload; verify readonly enforcement.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm turbo typecheck`
