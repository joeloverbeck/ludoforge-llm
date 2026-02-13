# ARCDECANDGEN-018: Merge `endConditions`, `victory`, `scoring` into `TerminalEvaluationDef`

**Phase**: 6A (Unified Terminal Evaluation)
**Priority**: P1
**Complexity**: L
**Dependencies**: ARCDECANDGEN-001 (types split), ARCDECANDGEN-005 (validate-gamedef split), ARCDECANDGEN-006 (schemas split), ARCDECANDGEN-002 (compiler split)

## Goal

Three separate `GameDef` fields (`endConditions`, `victory`, `scoring`) merge into one `TerminalEvaluationDef`:

```typescript
interface TerminalEvaluationDef {
  readonly conditions: readonly EndConditionDef[];
  readonly checkpoints?: readonly VictoryCheckpointDef[];
  readonly margins?: readonly VictoryMarginDef[];
  readonly ranking?: VictoryRankingDef;
  readonly scoring?: ScoringDef;
}

// GameDef gains:
readonly terminal: TerminalEvaluationDef;
// GameDef removes: endConditions, victory, scoring
```

**Evaluation priority**: checkpoints → conditions → scoring (matches current behavior, now explicit).

## File List (files to touch)

### Files to modify (kernel types)
- `src/kernel/types-core.ts` — add `TerminalEvaluationDef`; remove `endConditions`, `victory`, `scoring` from `GameDef`; add `terminal: TerminalEvaluationDef`
- `src/kernel/types-victory.ts` — move `VictoryDef` contents into `TerminalEvaluationDef`; remove `VictoryDef` wrapper

### Files to modify (kernel runtime)
- `src/kernel/terminal.ts` — unify `terminalResult` to read from `def.terminal.*`; remove separate dispatch for `evaluateVictory` + `evaluateEndConditions` + `scoreRanking`

### Files to modify (kernel validation + schemas)
- `src/kernel/validate-gamedef-core.ts` or `validate-gamedef-structure.ts` — validate `terminal` field instead of three separate fields
- `src/kernel/validate-gamedef-extensions.ts` — move victory-related validation under `terminal`
- `src/kernel/schemas-core.ts` / `schemas-extensions.ts` — update JSON Schema

### Files to modify (compiler)
- `src/cnl/compile-lowering.ts` — `lowerEndConditions` output → `terminal.conditions`
- `src/cnl/compile-victory.ts` — `lowerVictory` output → `terminal.checkpoints` + `terminal.margins` + `terminal.ranking`
- `src/cnl/compiler-core.ts` — assemble `terminal` from separate lowered sections
- `src/cnl/game-spec-doc.ts` — keep separate YAML sections (`endConditions`, `victory`, `scoring`) for authoring ergonomics; compiler merges them into `terminal`

### Files to modify (data)
- `data/games/fire-in-the-lake.md` — no change if YAML sections stay separate (recommended)

### Test files to update
- All tests referencing `def.endConditions` → `def.terminal.conditions`
- All tests referencing `def.victory` → `def.terminal.checkpoints` / `def.terminal.margins` / `def.terminal.ranking`
- All tests referencing `def.scoring` → `def.terminal.scoring`

### New test file to create
- `test/unit/terminal-evaluation.test.ts`

## Out of Scope

- **No changes to** GameSpecDoc YAML sections — keep `endConditions`, `victory`, `scoring` as separate authoring sections
- **No changes to** `src/agents/`, `src/sim/`
- **No new terminal evaluation features** — same semantics, unified type

## Acceptance Criteria

### Tests that must pass
- `npm test` — all tests pass (with updated references)
- `npm run typecheck` — passes
- `npm run lint` — passes

### New tests (in `test/unit/terminal-evaluation.test.ts`)
1. **"condition-only terminal: first matching condition wins"**
2. **"checkpoint-only terminal: checkpoint fires before conditions"** — checkpoints have priority
3. **"scoring fallback when no condition matches"** — score-based ranking
4. **"empty terminal returns null (game continues)"**
5. **"FITL coup victory through unified terminal"** — reuse fitl-coup-victory scenario
6. **"margins and ranking produce same final-coup result as old victory field"**

### Invariants that must remain true
- `terminal.conditions` behaves identically to old `endConditions`
- `terminal.checkpoints` + `terminal.margins` + `terminal.ranking` behave identically to old `victory`
- `terminal.scoring` behaves identically to old `scoring`
- Evaluation priority is: checkpoints → conditions → scoring (deterministic, documented)
- GameSpecDoc can still use separate YAML sections
- All FITL tests pass
