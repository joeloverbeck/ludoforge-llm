# ARCDECANDGEN-020: Generic Event Deck Type Definitions

**Phase**: 8A (Generic Event Deck Subsystem — types)
**Priority**: P2
**Complexity**: M
**Dependencies**: ARCDECANDGEN-001 (types-events.ts must exist from Phase 1A split)

## Goal

Replace all `Record<string, unknown>` in event card types with proper ASTs. Define `EventDeckDef`, `EventCardDef`, `EventSideDef`, `EventBranchDef`, `EventTargetDef`, `EventLastingEffectDef`, `EventTargetCardinality`, and `ActiveLastingEffect` with full compile-time type safety using `ConditionAST`, `EffectAST`, and `OptionsQuery`.

## File List (files to touch)

### Files to modify
- `src/kernel/types-events.ts` — replace/redefine all event types with proper ASTs:
  - `EventSideDef.effects`: `Record<string, unknown>[]` → `readonly EffectAST[]`
  - `EventTargetDef.selector`: `Record<string, unknown>` → `OptionsQuery`
  - `EventLastingEffectDef.setupEffects`: `Record<string, unknown>` → `readonly EffectAST[]`
  - Add `EventLastingEffectDef.teardownEffects?: readonly EffectAST[]`
  - Add `EventDeckDef` with `drawZone`, `discardZone`, `shuffleOnSetup`
- `src/kernel/types-core.ts` — add `GameDef.eventDecks?: readonly EventDeckDef[]`; add `GameState.activeLastingEffects?: readonly ActiveLastingEffect[]`; remove old `GameDef.eventCards` if it exists

## Out of Scope

- **No kernel execution** (ARCDECANDGEN-021)
- **No compiler changes** (ARCDECANDGEN-022)
- **No cross-validation changes** (ARCDECANDGEN-022)
- **No YAML changes** to `fire-in-the-lake.md`
- **No changes to** `src/cnl/`, `src/agents/`, `src/sim/`

## Acceptance Criteria

### Tests that must pass
- `npm run typecheck` — passes (primary gate for types-only changes)
- `npm run lint` — passes
- `npm test` — all tests pass (may require minor fixture adjustments where tests construct event types)

### Invariants that must remain true
- No `Record<string, unknown>` remains in event card type definitions
- `EventDeckDef` has `drawZone: string` and `discardZone: string` (zone ID references)
- `EventSideDef.effects` is `readonly EffectAST[]`
- `EventTargetDef.selector` is `OptionsQuery`
- `EventLastingEffectDef.setupEffects` is `readonly EffectAST[]`
- `ActiveLastingEffect` is defined for runtime tracking
- `GameState.activeLastingEffects` is an array (empty for games without events)
