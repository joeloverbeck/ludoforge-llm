# LEGACTTOO-001: TooltipIR Types + VerbalizationDef Types + GameSpecDoc Schema Changes

**Status**: COMPLETED
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
4. `types-core.ts` is already 995 lines (over 800-line max) — adding VerbalizationDef there would worsen the problem. GameDef already imports types from many focused files (`types-ast.ts`, `types-events.ts`, `types-operations.ts`), so a new `verbalization-types.ts` file follows the existing pattern.
5. `GameDef` must be JSON-serializable (sent via Comlink to web worker). Every map-like field in GameDef uses `Readonly<Record<string, ...>>`, not `ReadonlyMap`. The spec's `ReadonlyMap` suggestion is incorrect for this context.

## Architecture Check

1. Pure type definitions with no runtime behavior — minimal risk, maximal downstream enablement.
2. `VerbalizationDef` is game-agnostic (labels/stages/macros/sentencePlans/suppressPatterns are generic maps). Game-specific content lives in YAML data files, not in types.
3. No backwards-compatibility shims — `verbalization` is optional on both `GameSpecDoc` and `GameDef`.
4. `VerbalizationDef` uses `Readonly<Record<string, ...>>` (not `ReadonlyMap`) to match `GameDef`'s JSON-serializable pattern.
5. `VerbalizationDef` lives in its own `verbalization-types.ts` file (not `types-core.ts`) to respect the 800-line file limit and follow existing type-separation patterns.

## What to Change

### 1. Create `packages/engine/src/kernel/tooltip-ir.ts` (~100 lines)

Define `MessageBase` interface and all 23 message kind interfaces as a discriminated union `TooltipMessage`:
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

### 3. Create `packages/engine/src/kernel/verbalization-types.ts` (~30 lines)

Define `VerbalizationDef` with fields: `labels`, `stages`, `macros`, `sentencePlans`, `suppressPatterns` — all using `Readonly<Record<string, ...>>` and `readonly` arrays to match GameDef's JSON-serializable pattern.

### 4. Add `verbalization` field to `packages/engine/src/kernel/types-core.ts`

Import `VerbalizationDef` from `verbalization-types.js` and add optional `verbalization?: VerbalizationDef` field to `GameDef`.

### 5. Add `verbalization` field to `packages/engine/src/cnl/game-spec-doc.ts`

Add `readonly verbalization: GameSpecVerbalization | null` to `GameSpecDoc`. Define `GameSpecVerbalization` interface with the raw YAML shape (plain Record objects matching the compiled form's structure but with all fields nullable/optional).

### 6. Export new modules from `packages/engine/src/kernel/index.ts`

Add barrel exports for `tooltip-ir.js`, `tooltip-rule-card.js`, and `verbalization-types.js`.

## Files to Touch

- `packages/engine/src/kernel/tooltip-ir.ts` (new)
- `packages/engine/src/kernel/tooltip-rule-card.ts` (new)
- `packages/engine/src/kernel/verbalization-types.ts` (new)
- `packages/engine/src/kernel/types-core.ts` (modify — import VerbalizationDef, add field to GameDef)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify — add GameSpecVerbalization, add field to GameSpecDoc)
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

1. `TooltipMessage` discriminated union: constructing each of the 23 kinds type-checks correctly.
2. `RuleCard` and `RuleState` can be constructed with readonly fields; mutation attempts fail at compile time.
3. `VerbalizationDef` can be assigned to `GameDef.verbalization` optional field.
4. `GameSpecDoc` accepts a `verbalization: null` field without breaking existing parsing.
5. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. All new types are fully `readonly` — no mutable fields.
2. `GameDef.verbalization` is optional — existing GameDefs without it remain valid.
3. `GameSpecDoc.verbalization` is nullable — existing specs without it parse unchanged.
4. No runtime code added — pure type definitions and construction tests only.
5. `VerbalizationDef` uses `Readonly<Record<...>>` (not `ReadonlyMap`) for JSON serializability.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-ir.test.ts` — construct each message kind, verify discriminated union narrowing works at runtime via switch on `kind`.
2. `packages/engine/test/unit/kernel/tooltip-rule-card.test.ts` — construct RuleCard, RuleState, ActionTooltipPayload; verify structure and field presence.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm turbo typecheck`

## Outcome

**Completion date**: 2026-03-06

**What actually changed**:
- Created `tooltip-ir.ts` (23 message kinds as discriminated union), `tooltip-rule-card.ts` (RuleCard/RuleState/ActionTooltipPayload), `verbalization-types.ts` (VerbalizationDef with Readonly<Record> pattern)
- Added `verbalization?: VerbalizationDef` to GameDef in `types-core.ts`
- Added `GameSpecVerbalization` and `verbalization: GameSpecVerbalization | null` to GameSpecDoc in `game-spec-doc.ts`
- Added `verbalization` to `CompileSectionResults` in `compiler-core.ts` (initialized to null, assembly wired)
- Barrel exports in `kernel/index.ts`
- Updated golden fixture, parser test, game-spec-doc test, and compiler-structured-results test for new field

**Deviations from original plan**:
1. VerbalizationDef moved from `types-core.ts` to its own `verbalization-types.ts` — `types-core.ts` was already 995 lines (over 800-line max)
2. All `ReadonlyMap` references replaced with `Readonly<Record<...>>` for JSON serializability (GameDef is sent via Comlink to web worker)
3. `GameSpecVerbalizationLabelEntry` and `GameSpecVerbalizationMacroEntry` deduplicated — `game-spec-doc.ts` imports shared types from `verbalization-types.ts`

**Verification**: build ✅, 2919/2919 unit tests ✅, typecheck ✅, lint ✅
