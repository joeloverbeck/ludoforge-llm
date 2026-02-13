# ARCDECANDGEN-012: Rename Operation Runtime + Kernel Code to Pipeline

**Phase**: 4A — part 2 (Unified Action Resolution Pipeline — runtime layer)
**Priority**: P1
**Complexity**: M
**Dependencies**: ARCDECANDGEN-011 (type renames must be done first), ARCDECANDGEN-007 (apply-move split)

## Goal

Update all runtime/kernel code to use the new `ActionPipelineDef` types and field names. This ticket completes the operation → pipeline rename in the kernel layer.

## File List (files to touch)

### Files to modify
- `src/kernel/apply-move.ts` — update references: `resolveOperationProfile` → `resolveActionPipeline`, field accesses (`legality.when` → `legality`, `cost.validate` → `costValidation`, etc.)
- `src/kernel/apply-move-pipeline.ts` — rename `resolveOperationProfile` → `resolveActionPipeline`, `toOperationExecutionProfile` → `toExecutionPipeline`, update all field references
- `src/kernel/legal-moves.ts` — update profile resolution references
- `src/kernel/legal-choices.ts` — update profile references (if any)

### Test files to modify
- All test files referencing `operationProfiles`, `resolveOperationProfile`, operation-specific field names — update to pipeline equivalents

## Out of Scope

- **No compiler changes** (ARCDECANDGEN-013)
- **No YAML changes** (ARCDECANDGEN-013)
- **No GameSpecDoc changes** (ARCDECANDGEN-013)
- **No new features** — pure rename
- **No changes to** `src/cnl/`, `src/agents/`, `src/sim/`

## Acceptance Criteria

### Tests that must pass
- `npm test` — all tests pass (with updated field names in test code)
- `npm run typecheck` — passes
- `npm run lint` — passes

### New tests (in `test/unit/action-pipeline.test.ts`)
1. **"action without pipeline executes inline effects"** — GameDef with action, no pipelines → `applyMove` uses `action.effects`
2. **"action with pipeline executes pipeline stages"** — pipeline with 2 stages → both executed, `action.effects` NOT executed
3. **"pipeline costValidation blocks move when unaffordable"** — `costValidation` requiring resource >= 5, state has 3 → rejected
4. **"pipeline atomicity 'atomic' rejects partial execution"**
5. **"pipeline atomicity 'partial' allows partial execution"**
6. **"multiple pipelines with applicability select correct one"** — two pipelines, different conditions → correct one chosen
7. **"pipeline targeting.tieBreak determines ordering"**

### Invariants that must remain true
- No `operationProfile` (lowercase) or `OperationProfile` (capitalized) string appears anywhere in `src/kernel/`
- `resolveActionPipeline` is identical in behavior to old `resolveOperationProfile`
- Simple games without pipelines are unaffected (`actionPipelines` defaults to `[]`)
- Pipeline resolution precedence: single candidate → use it; multiple → first where `applicability` is true
