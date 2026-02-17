# STATEMOD-007: Implement `deriveRenderModel()` — Players, Phases, Turn Order, Actions, Choices, Terminal, Warnings

**Status**: PENDING
**Priority**: HIGH
**Effort**: L
**Spec**: 37 — State Management & Render Model (D3 items 9-13, 15; D7, D8, D10)
**Deps**: STATEMOD-004, STATEMOD-006

## Objective

Complete the remaining `deriveRenderModel()` derivation: players, phase/turn info, action grouping, choice extraction with selectability/highlighting, terminal result mapping, and move enumeration warnings.

## Files to Touch

- `packages/runner/src/model/derive-render-model.ts` — add player, phase, turn order, action, choice, terminal, warning, selectability derivation
- `packages/runner/test/model/derive-render-model-ui.test.ts` — **new file**: tests for players, actions, choices, terminal, selectability

## Out of Scope

- Zone/token base derivation (STATEMOD-004)
- Hidden information filtering (STATEMOD-005)
- Variables, markers, tracks, effects, interrupts, event decks (STATEMOD-006)
- Store integration (STATEMOD-008)
- Animation processing (Spec 40)
- Visual config overrides (Spec 42)
- Any engine changes

## What to Do

### 1. Players derivation

- Create `RenderPlayer[]` from `def.metadata.players` range (0 to playerCount-1).
- `id`: `asPlayerId(i)`.
- `displayName`: Look up faction name from turn order state if card-driven, else `formatIdAsDisplayName(String(i))`.
- `isHuman`: `context.playerSeats.get(id) === 'human'`.
- `isActive`: `id === state.activePlayer`.
- `isEliminated`: Determine from per-player vars (game-agnostic: check for `eliminated` var if present, else `false`).
- `factionId`: Derive from turn order faction assignment if available, else `null`.

### 2. Phase and turn order

- `phaseName`: `String(state.currentPhase)`.
- `phaseDisplayName`: `formatIdAsDisplayName(String(state.currentPhase))`.
- `activePlayerID`: `state.activePlayer`.
- `turnOrder`: Derive player order from `state.turnOrderState`. For `roundRobin`/`fixedOrder`, list all players in order. For `cardDriven`, derive from runtime eligibility. For `simultaneous`, list all.
- `turnOrderType`: `state.turnOrderState.type`.
- `simultaneousSubmitted`: For `simultaneous` type, extract player IDs with `submitted === true`. Empty for other types.

### 3. Action grouping (D7)

Implement the algorithm from the spec:
1. Iterate over `context.legalMoveResult.moves`.
2. Group by `move.actionClass` (or `"Actions"` fallback).
3. Deduplicate actions by `actionId` within each group.
4. `RenderAction.isAvailable = true` if at least one legal move exists for that action.
5. `RenderAction.displayName = formatIdAsDisplayName(actionId)`.
6. `RenderActionGroup.groupName = formatIdAsDisplayName(actionClass)` or `"Actions"`.

### 4. Choice extraction

When `context.choicePending` is non-null:
- `choiceType`: `context.choicePending.type` (`'chooseOne'` or `'chooseN'`).
- `choiceMin`: `context.choicePending.min ?? null`.
- `choiceMax`: `context.choicePending.max ?? null`.
- `currentChoiceOptions`: Map `context.choicePending.options` to `RenderChoiceOption[]`. Each option has `value` (the `MoveParamValue`), `displayName` (`formatIdAsDisplayName(String(value))`), `isLegal = true`, `illegalReason = null` (illegal options are not currently surfaced by the engine at this level).
- `currentChoiceDomain`: `null` (domain-based choices are a future extension).
- `choiceBreadcrumb`: Map `context.choiceStack` to `RenderChoiceStep[]` with display names.

### 5. Selectability and highlighting

Based on `context.choicePending`:
- If `choicePending` has options that reference zone IDs (as `MoveParamValue`), set those zones' `isSelectable = true`.
- If `choicePending` has options that reference token IDs, set those tokens' `isSelectable = true`.
- `isHighlighted`: Zones adjacent to a selected zone (if the choice context is spatial). For now, keep `false` — full adjacency highlighting is a Spec 38/40 concern.

### 6. Terminal mapping (D8)

Map `context.terminal` to `RenderTerminal | null` per the spec table:
- `'win'` → `{ type: 'win', player, message: "Player N wins!", victory?: RenderVictoryMetadata }`
- `'lossAll'` → `{ type: 'lossAll', message: "All players lose." }`
- `'draw'` → `{ type: 'draw', message: "The game is a draw." }`
- `'score'` → `{ type: 'score', ranking: RenderPlayerScore[], message: "Game over — final rankings." }`

For `RenderVictoryMetadata`: map from `VictoryTerminalMetadata` fields.

### 7. Move enumeration warnings

Map `context.legalMoveResult?.warnings` to `RenderWarning[]`.

## Acceptance Criteria

### Tests that must pass

- [ ] Players: correct count, `isHuman` from playerSeats, `isActive` matches `state.activePlayer`
- [ ] Phase: `phaseName` and `phaseDisplayName` derived from `state.currentPhase`
- [ ] Turn order type: `turnOrderType` matches `state.turnOrderState.type`
- [ ] Action grouping: moves with same `actionClass` group together
- [ ] Action grouping: moves without `actionClass` go to `"Actions"` fallback group
- [ ] Action grouping: duplicate `actionId` within a group deduplicated
- [ ] Action grouping: `isAvailable = true` when at least one legal move exists
- [ ] Action grouping: no legal moves → empty `actionGroups`
- [ ] Choice extraction: `choicePending` maps to `currentChoiceOptions` with correct display names
- [ ] Choice extraction: `chooseN` type exposes `choiceMin` and `choiceMax`
- [ ] Choice breadcrumb: `choiceStack` maps to `RenderChoiceStep[]` with display names
- [ ] Selectability: zone IDs in choice options make corresponding zones `isSelectable = true`
- [ ] Selectability: token IDs in choice options make corresponding tokens `isSelectable = true`
- [ ] Terminal win: maps to `RenderTerminal` with `type: 'win'`, correct player, message
- [ ] Terminal draw: maps to `{ type: 'draw', message }`
- [ ] Terminal score: ranking maps to `RenderPlayerScore[]`
- [ ] Terminal null: no terminal → `renderModel.terminal = null`
- [ ] Warnings: `legalMoveResult.warnings` mapped to `RenderWarning[]`
- [ ] `pnpm -F @ludoforge/runner typecheck` passes
- [ ] `pnpm -F @ludoforge/runner test` passes

### Invariants

- `deriveRenderModel()` remains a pure function
- Action grouping follows the exact algorithm from D7 — no other grouping logic
- `RenderTerminal` type discriminant exactly matches spec (`'win' | 'lossAll' | 'draw' | 'score'`)
- All display names via `formatIdAsDisplayName()` — no hardcoded strings except terminal messages
- `PlayerId` branded number throughout, never string
- No game-specific logic
- No engine source files modified
