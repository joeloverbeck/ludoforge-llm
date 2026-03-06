# LEGACTTOO-005: Compound Normalizer — Control Flow, Macros, Pipeline Stages (28-43)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — extend `tooltip-normalizer.ts` with compound rules
**Deps**: LEGACTTOO-004

## Problem

Rules 28-43 handle compound AST structures: choice nodes (`chooseN`, `chooseOne`), iteration (`forEach`, `repeat`), conditionals (`if`), random rolls, suppression of scaffolding effects, turn flow, and the macro override that compresses entire macro expansions into a single message. These are structurally more complex than the 1:1 effect-to-message rules in LEGACTTOO-004 because they involve recursive children and container wrapping.

## Assumption Reassessment (2026-03-06)

1. `EffectAST` includes `chooseN`, `chooseOne`, `forEach`, `if`, `rollRandom`, `repeat`, `removeByPriority`, `let`, `bindValue`, `concat`, `grantFreeOperation` kinds.
2. Macro-expanded effects carry a `macroOrigin` identifier linking back to the source macro id.
3. Action pipeline stages have a `stage` name field. The normalizer needs to tag messages with their stage for the content planner to group by.

## Architecture Check

1. Compound rules recursively call `normalizeEffect` on children, wrapping results in container structures or attaching stage metadata.
2. Macro override is the highest-priority rule: if `macroOrigin` matches a verbalization macro with a `summary`, emit one `SetMessage`-like summary and skip child normalization.
3. Engine-agnostic: no game-specific identifiers in any rule. `forEach`, `if`, `chooseN` are generic AST constructs.

## What to Change

### 1. Extend `packages/engine/src/kernel/tooltip-normalizer.ts` (~150 additional lines)

Add top-level `normalizeAction(action: ActionDef, ctx: NormalizerContext): readonly TooltipMessage[]` that:
- Checks for macro override first (highest priority)
- Walks the action's effect tree, dispatching to existing rules 1-27 for leaf effects
- Adds compound rules 28-43:

**Control flow rules (28-36)**:
- Rule 28: `chooseN` over `mapSpaces` → `SelectMessage(target: 'spaces')`
- Rule 29: `chooseN` over tokens → `SelectMessage(target: 'tokens')`
- Rule 30: `chooseOne` over enums → `ChooseMessage`
- Rule 31: `forEach` → container wrapping children with iteration binding
- Rule 32: `if` on `globalMarkerState` → `ModifierMessage`
- Rule 33: `if` generic → `ModifierMessage`
- Rule 34: `rollRandom` → `RollMessage`
- Rule 35: `removeByPriority` → `RemoveMessage`
- Rule 36: `repeat` → container wrapping children with "Repeat N times"

**Suppression rules (37-40)**:
- Rule 37: `let`/`bindValue` → `SuppressedMessage`
- Rule 38: `concat` for zone construction → `SuppressedMessage`
- Rule 39: name matches `suppressPatterns` → `SuppressedMessage` (delegates to `isSuppressed` from LEGACTTOO-003)
- Rule 40: telemetry var → `SuppressedMessage` (delegates to `isSuppressed`)

**Turn flow rules (41-43)**:
- Rule 41: `grantFreeOperation` → `GrantMessage`
- Rule 42: phase transition → `PhaseMessage`
- Rule 43: `setNextPlayer`/`advanceTurn` → `SuppressedMessage`

**Macro override**:
- Before normalizing any effect, check if it has `macroOrigin` and that macro id exists in `VerbalizationDef.macros` with a `summary`. If so, return a single message with the summary text.

### 2. Add pipeline stage tagging

When normalizing effects within an action pipeline stage, set the `stage` field on all produced messages.

## Files to Touch

- `packages/engine/src/kernel/tooltip-normalizer.ts` (modify — add rules 28-43, macro override, `normalizeAction`)
- `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` (modify — add tests for rules 28-43)

## Out of Scope

- Content planner grouping by stage (LEGACTTOO-006)
- Template realization of compound messages (LEGACTTOO-007)
- Blocker extraction (LEGACTTOO-007)
- Runner UI (LEGACTTOO-009)

## Acceptance Criteria

### Tests That Must Pass

1. Rule 28: `chooseN` over `mapSpaces` → `SelectMessage { target: 'spaces', bounds }` with correct bounds.
2. Rule 30: `chooseOne` over `['attack', 'defend']` → `ChooseMessage { options: ['attack', 'defend'] }`.
3. Rule 31: `forEach` wraps children — child messages include iteration context.
4. Rule 32: `if` on `globalMarkerState` → `ModifierMessage { condition, description }`.
5. Rule 34: `rollRandom` → `RollMessage { range }`.
6. Rule 37: `let` binding → `SuppressedMessage`.
7. Rule 41: `grantFreeOperation` → `GrantMessage { operation, targetPlayer }`.
8. Rule 43: `advanceTurn` → `SuppressedMessage`.
9. Macro override: effect with `macroOrigin: 'trainUs'` where verbalization has `macros.trainUs.summary` → single message with summary text, no child normalization.
10. Pipeline stage: effects within stage `selectSpaces` → all messages have `stage: 'selectSpaces'`.
11. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Macro override is checked before any other rule — it takes absolute priority.
2. `forEach`/`repeat` containers never produce empty children arrays (at least one child message or one `SuppressedMessage`).
3. Recursion depth bounded by AST depth (which is itself bounded by `maxTriggerDepth`).
4. All `stage` tags propagate to child messages when normalizing within a pipeline stage.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` — add tests for rules 28-43, macro override, pipeline stage tagging. Use synthetic AST fixtures with nested effects.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm turbo typecheck`
