# ARCDECANDGEN-014: Introduce `TurnOrderStrategy` Discriminated Union and Migrate `cardDriven`

**Phase**: 5A (Generalized Turn Order Strategy)
**Priority**: P1
**Complexity**: XL
**Dependencies**: ARCDECANDGEN-001 (types split), ARCDECANDGEN-002 (compiler split), ARCDECANDGEN-003 (validate-spec split)

## Goal

Replace the monolithic `TurnFlowDef` with a discriminated union `TurnOrderStrategy`. `GameDef.turnFlow` → `GameDef.turnOrder`. `GameState.turnFlow` → `GameState.turnOrderState`. The existing FITL turn flow becomes `{ type: 'cardDriven', config: CardDrivenTurnConfig }`. `CoupPlan` moves from a root `GameDef.coupPlan` field into `turnOrder.config.coupPlan`.

This is the largest single ticket. It touches the most files because `turnFlow` is referenced across the entire kernel.

## File List (files to touch)

### Files to modify (kernel types)
- `src/kernel/types-turn-flow.ts` — add `TurnOrderStrategy`, `TurnOrderRuntimeState`, `CardDrivenTurnConfig`, `CardDrivenRuntimeState`; remove old `TurnFlowDef`, `TurnFlowRuntimeState`
- `src/kernel/types-core.ts` — `GameDef.turnFlow` → `GameDef.turnOrder`; `GameDef.coupPlan` REMOVED (now in `turnOrder.config.coupPlan`); `GameState.turnFlow` → `GameState.turnOrderState`

### Files to modify (kernel runtime)
- `src/kernel/turn-flow-eligibility.ts` — functions dispatch on `turnOrder.type === 'cardDriven'`; receive `CardDrivenTurnConfig` + `CardDrivenRuntimeState`
- `src/kernel/turn-flow-lifecycle.ts` — dispatch on `turnOrder.type === 'cardDriven'`
- `src/kernel/legal-moves.ts` — `isMoveAllowedByTurnFlowOptionMatrix` checks `turnOrderState?.type === 'cardDriven'`
- `src/kernel/legal-moves-turn-order.ts` — update references
- `src/kernel/apply-move.ts` — `applyTurnFlowEligibilityAfterMove` dispatches on turn order type
- `src/kernel/phase-advance.ts` — `advanceToDecisionPoint` dispatches on turn order type
- `src/kernel/initial-state.ts` — initialize `turnOrderState` based on `turnOrder.type`; `roundRobin` games get `{ type: 'roundRobin' }`
- `src/kernel/terminal.ts` — `resolveFactionPlayer` checks `turnOrderState.type === 'cardDriven'`
- `src/kernel/zobrist.ts` — hash `turnOrderState` discriminated union

### Files to modify (kernel validation + schemas)
- `src/kernel/validate-gamedef-extensions.ts` — validate `turnOrder` union, validate `coupPlan` only inside `cardDriven`
- `src/kernel/schemas-extensions.ts` — update JSON Schema for `turnOrder` discriminated union

### Files to modify (compiler)
- `src/cnl/compile-turn-flow.ts` — `lowerTurnFlow` → `lowerTurnOrder`, output `TurnOrderStrategy`; `lowerCoupPlan` output folded into `turnOrder.config.coupPlan`
- `src/cnl/validate-extensions.ts` — validate `coupPlan` only inside `turnOrder.config` for `cardDriven`; reject root-level `coupPlan`
- `src/cnl/game-spec-doc.ts` — `turnFlow` → `turnOrder` in GameSpecDoc; remove root `coupPlan` field
- `src/cnl/compiler-core.ts` — update section wiring
- `src/cnl/section-identifier.ts` — update section name recognition

### Files to modify (data)
- `data/games/fire-in-the-lake.md` — rename YAML `turnFlow` → `turnOrder`, wrap in `type: cardDriven` + `config:`; move `coupPlan` inside `turnOrder.config`

### Test files to update
- All test files referencing `turnFlow`, `state.turnFlow`, `def.turnFlow`, `def.coupPlan` — update to `turnOrder`/`turnOrderState`/`turnOrder.config.coupPlan`

## Out of Scope

- **`fixedOrder` runtime** (ARCDECANDGEN-015)
- **`simultaneous` stub** (ARCDECANDGEN-016)
- **No new turn order types** beyond what's defined in the spec
- **No changes to** `src/agents/`, `src/sim/`
- **Internal type names** like `TurnFlowDuration`, `TurnFlowCardLifecycleDef` MAY keep their `TurnFlow` prefix (they describe card-driven sub-concepts, not the top-level strategy)

## Acceptance Criteria

### Tests that must pass
- `npm test` — all tests pass (with updated references)
- `npm run typecheck` — passes
- `npm run lint` — passes

### Invariants that must remain true
- `roundRobin` behavior identical to current default when no `turnFlow` declared
- `cardDriven` behavior identical to current `TurnFlowDef` — same eligibility, option matrix, monsoon, pivotal logic
- `GameState.turnOrderState` is always present (even `roundRobin` games get `{ type: 'roundRobin' }`)
- Discriminated union dispatch is exhaustive — TypeScript `switch` on `turnOrder.type` with `never` default
- All FITL tests pass
- No `turnFlow` string appears in type definitions (except internal sub-type names)
- Zobrist hashing produces equivalent results for same state
- `coupPlan` only valid inside `cardDriven` config — compiler rejects root-level `coupPlan`
