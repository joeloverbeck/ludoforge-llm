# LEGACTTOO-005: Compound Normalizer — Control Flow, Macros, Recursive Children

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium (reduced from Large after assumption reassessment)
**Engine Changes**: Yes — extend `tooltip-normalizer.ts` with compound rules
**Deps**: LEGACTTOO-004

## Problem

The normalizer from LEGACTTOO-004 handles leaf effects (rules 1-27) but returns `SuppressedMessage(reason: 'unhandled')` for all compound/control-flow AST nodes. This ticket adds proper normalization for compound structures: choice nodes (`chooseN`, `chooseOne`), iteration (`forEach`), conditionals (`if`), random rolls, priority removal, grant operations, and macro-level compression.

## Assumption Reassessment (2026-03-06, corrected against codebase)

1. `EffectAST` includes: `chooseN`, `chooseOne`, `forEach`, `if`, `rollRandom`, `removeByPriority`, `grantFreeOperation`, `reduce`, `evaluateSubset`. ~~`repeat` does not exist.~~ ~~`concat` is a `ValueExpr`/`OptionsQuery`, not an `EffectAST`.~~
2. `macroOrigin` is typed as `EffectMacroOrigin = { macroId: string; stem: string }`, NOT a bare string. Lookup uses `macroOrigin.macroId`.
3. `grantFreeOperation` has fields `{ seat, operationClass, actionIds?, ... }` — NOT `{ operation, targetPlayer }`.
4. `let`/`bindValue` are already suppressed by `isScaffoldingEffect()` in LEGACTTOO-004. No additional work needed.
5. `setActivePlayer`/`advancePhase`/`gotoPhaseExact`/`pushInterruptPhase`/`popInterruptPhase` are already suppressed as scaffolding. The original references to `setNextPlayer`/`advanceTurn` were wrong names.
6. `ActionDef` has no pipeline stages — effects are a flat `readonly EffectAST[]`. Pipeline stage tagging is deferred (no structural basis).

## Architecture Check

1. Compound rules recursively call `normalizeEffect` on children, producing flattened message arrays.
2. Macro override is the highest-priority rule: if `macroOrigin.macroId` matches a `VerbalizationDef.macros` entry with a `summary`, emit one message and skip child normalization.
3. Engine-agnostic: no game-specific identifiers in any rule. All constructs are generic AST.
4. `reduce` and `evaluateSubset` are internal computation — suppress them like scaffolding.

## What to Change

### 1. Extend `packages/engine/src/kernel/tooltip-normalizer.ts`

Add handling for compound EffectAST nodes that currently fall through to `unhandled`:

**Control flow rules:**
- Rule 28: `chooseN` over `mapSpaces` query → `SelectMessage { target: 'spaces', bounds }`
- Rule 29: `chooseN` over `tokensInZone`/`tokensInMapSpaces` → `SelectMessage { target: 'zones' }`
- Rule 29b: `chooseN` generic → `SelectMessage` with generic target
- Rule 30: `chooseOne` over `enums` → `ChooseMessage { options, paramName }`
- Rule 30b: `chooseOne` generic → `ChooseMessage` with binding name
- Rule 31: `forEach` → recursively normalize `effects` children
- Rule 32: `if` with `globalMarkerState` condition → `ModifierMessage` + recurse `then`/`else`
- Rule 33: `if` generic → `ModifierMessage` + recurse `then`/`else`
- Rule 34: `rollRandom` → `RollMessage { range, bindTo }` + recurse `in` children
- Rule 35: `removeByPriority` → `RemoveMessage` + recurse `in` children

**Turn flow rule:**
- Rule 41: `grantFreeOperation` → `GrantMessage { operation: operationClass, targetPlayer: seat }`

**Additional suppressions:**
- `reduce` → `SuppressedMessage` (internal computation)

**Macro override (highest priority):**
- Before dispatching to any rule, check if the effect has `macroOrigin` and `macroOrigin.macroId` exists in `ctx.verbalization.macros` with a `summary`. If so, return a single summary message and skip children.

### Dropped from original ticket (invalid assumptions):
- ~~Rule 36: `repeat`~~ — no such EffectAST kind
- ~~Rule 37: `let`/`bindValue`~~ — already scaffolding-suppressed
- ~~Rule 38: `concat`~~ — not an EffectAST
- ~~Rule 39-40: suppress patterns/telemetry~~ — already handled by rules 4-6
- ~~Rule 42: phase transition~~ — already scaffolding-suppressed
- ~~Rule 43: `setNextPlayer`/`advanceTurn`~~ — wrong names; already suppressed
- ~~Pipeline stage tagging~~ — no structural basis in ActionDef

## Files to Touch

- `packages/engine/src/kernel/tooltip-normalizer.ts` (modify — add compound rules + macro override)
- `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` (modify — add compound rule tests)

## Out of Scope

- Content planner grouping by stage (LEGACTTOO-006)
- Template realization of compound messages (LEGACTTOO-007)
- Blocker extraction (LEGACTTOO-007)
- Runner UI (LEGACTTOO-009)
- Pipeline stage tagging (deferred — no ActionDef.stages)

## Acceptance Criteria

### Tests That Must Pass

1. Rule 28: `chooseN` over `mapSpaces` → `SelectMessage { target: 'spaces', bounds }` with correct bounds.
2. Rule 29: `chooseN` over `tokensInZone` → `SelectMessage { target: 'zones' }`.
3. Rule 30: `chooseOne` over `enums` → `ChooseMessage { options }`.
4. Rule 31: `forEach` wraps children — child messages produced via recursion.
5. Rule 32: `if` with globalMarkerState condition → messages include `ModifierMessage`.
6. Rule 33: `if` generic → `ModifierMessage` + child messages from `then` branch.
7. Rule 34: `rollRandom` → `RollMessage { range }` + child messages from `in`.
8. Rule 35: `removeByPriority` → `RemoveMessage`.
9. Rule 41: `grantFreeOperation` → `GrantMessage { operation: operationClass, targetPlayer: seat }`.
10. Macro override: effect with `macroOrigin.macroId: 'trainUs'` where verbalization has `macros.trainUs.summary` → single message with summary text, no child normalization.
11. `reduce` → `SuppressedMessage`.
12. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Macro override is checked before any other rule — it takes absolute priority.
2. `forEach` containers produce at least one child message (leaf or suppressed).
3. Recursion depth bounded by AST depth (which is itself bounded by `maxTriggerDepth`).
4. All new rules produce messages with non-empty `astPath`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` — add compound rule tests with synthetic AST fixtures.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm turbo typecheck`

## Outcome

### What Changed vs Originally Planned

**Scope reduced** from 16 rules (28-43) to 10 effective rules after assumption reassessment:
- Rules 28-35 + 41 implemented as compound normalizer rules with recursive child processing
- `reduce` → suppressed (added, not in original plan)
- Macro override implemented using actual `EffectMacroOrigin.macroId` (not bare string)

**Dropped** (invalid assumptions in original ticket):
- Rule 36 (`repeat`) — EffectAST has no `repeat` kind
- Rules 37-38 (`let`/`bindValue`, `concat`) — already scaffolding-suppressed or not an EffectAST
- Rules 39-40 (suppress patterns/telemetry at effect level) — already handled by existing rules 4-6
- Rules 42-43 (phase transitions, `setNextPlayer`/`advanceTurn`) — wrong names; already scaffolding-suppressed
- Pipeline stage tagging — `ActionDef` has no stages field

**Type corrections applied:**
- `macroOrigin`: `EffectMacroOrigin { macroId, stem }` not bare string
- `grantFreeOperation`: `{ seat, operationClass }` not `{ operation, targetPlayer }`
- `chooseN` bounds: union type `{ n } | { min?, max }` handled via dedicated `getChooseNBounds`

### Files Modified

- `packages/engine/src/kernel/tooltip-normalizer.ts` — added ~180 lines: compound rules, macro override, condition stringification, recursive child normalization
- `packages/engine/test/unit/kernel/tooltip-normalizer.test.ts` — added 19 new tests (16 compound + 3 macro override), updated 2 existing tests

### Verification

- `pnpm -F @ludoforge/engine build`: passes
- `pnpm -F @ludoforge/engine test:unit`: 3061/3061 pass
- `pnpm turbo typecheck`: all 3 packages pass
