# ARCDECANDGEN-010: Cross-Reference Validation Pass

**Phase**: 3A (Cross-Reference Validation)
**Priority**: P1
**Complexity**: L
**Dependencies**: ARCDECANDGEN-008 (CompileSectionResults must exist)

## Goal

Add a `crossValidateSpec` function that checks references between compiled sections. Runs after individual section lowering but before final assembly. Catches broken inter-section references (action → phase, profile → action, trigger → action, victory → faction, setup → zone, etc.) with helpful diagnostics including closest-match suggestions.

## File List (files to touch)

### New files to create
- `src/cnl/cross-validate.ts` — the `crossValidateSpec(sections: CompileSectionResults): readonly Diagnostic[]` function

### Files to modify
- `src/cnl/compiler-core.ts` — call `crossValidateSpec(sections)` after all lowering, append results to diagnostics
- `src/cnl/index.ts` — export `crossValidateSpec`

### New test file to create
- `test/unit/cross-validate.test.ts`

## Cross-References to Validate

| Source | References | Target | Diagnostic Code |
|--------|-----------|--------|-----------------|
| `actions[].phase` | phase ID | `turnStructure.phases[].id` | `CNL_XREF_ACTION_PHASE_MISSING` |
| `actionPipelines[].actionId` | action ID | `actions[].id` | `CNL_XREF_PROFILE_ACTION_MISSING` |
| `actionPipelines[].linkedWindows[]` | window ID | `turnOrder.config.eligibility.overrideWindows[].id` | `CNL_XREF_PROFILE_WINDOW_MISSING` |
| `triggers[].event.phase` | phase ID | `turnStructure.phases[].id` | `CNL_XREF_TRIGGER_PHASE_MISSING` |
| `triggers[].event.action` | action ID | `actions[].id` | `CNL_XREF_TRIGGER_ACTION_MISSING` |
| `terminal.checkpoints[].faction` | faction ID | `turnOrder.config.eligibility.factions[]` | `CNL_XREF_VICTORY_FACTION_MISSING` |
| `terminal.margins[].faction` | faction ID | `turnOrder.config.eligibility.factions[]` | `CNL_XREF_MARGIN_FACTION_MISSING` |
| `turnOrder.config.coupPlan.phases[].id` | phase ID | `turnStructure.phases[].id` | `CNL_XREF_COUP_PHASE_MISSING` |
| `setup[].createToken.zone` | zone ID | `zones[].id` | `CNL_XREF_SETUP_ZONE_MISSING` |
| `setup[].createToken.type` | token type ID | `tokenTypes[].id` | `CNL_XREF_SETUP_TOKEN_TYPE_MISSING` |
| `actions[].effects[]` (moveToken/draw refs) | zone IDs | `zones[].id` | `CNL_XREF_EFFECT_ZONE_MISSING` |
| `turnOrder.config.cardLifecycle.played` | zone ID | `zones[].id` | `CNL_XREF_LIFECYCLE_ZONE_MISSING` |
| `turnOrder.config.passRewards[].resource` | var name | `globalVars[].name` | `CNL_XREF_REWARD_VAR_MISSING` |

**Note**: At the time this ticket is implemented, the field names may still use pre-rename forms (e.g., `operationProfiles` instead of `actionPipelines`, `victory` instead of `terminal`). Implement against whatever names exist at implementation time; later rename tickets will update this code.

## Out of Scope

- **No changes to** `src/kernel/`
- **No changes to** `data/games/fire-in-the-lake.md`
- **No changes to** GameSpecDoc YAML format
- **No new GameDef fields** — this is validation only
- **No changes to** individual `lower*` functions

## Acceptance Criteria

### Tests that must pass
- All existing tests pass
- `npm run typecheck` — passes
- `npm run lint` — passes

### New tests (in `test/unit/cross-validate.test.ts`)
1. **"valid spec produces zero cross-ref diagnostics"** — compile `compile-valid.md`, assert empty result
2. **"action referencing nonexistent phase emits CNL_XREF_ACTION_PHASE_MISSING"** — with suggestion for closest phase
3. **"profile referencing nonexistent action emits CNL_XREF_PROFILE_ACTION_MISSING"** — with suggestion
4. **"victory checkpoint referencing nonexistent faction emits CNL_XREF_VICTORY_FACTION_MISSING"** — with suggestion
5. **"turnFlow.cardLifecycle.played referencing nonexistent zone emits CNL_XREF_LIFECYCLE_ZONE_MISSING"**
6. **"cross-ref skips validation when target section is null"** — broken section already has errors, no cascading cross-ref errors
7. **"FITL production spec produces zero cross-ref diagnostics"** — `compileProductionSpec()`
8. **"multiple cross-ref errors are sorted deterministically"** — same input → same output order, twice
9. **"setup createToken referencing nonexistent zone emits CNL_XREF_SETUP_ZONE_MISSING"**
10. **"passRewards referencing nonexistent globalVar emits CNL_XREF_REWARD_VAR_MISSING"**
11. **"setup createToken referencing nonexistent tokenType emits CNL_XREF_SETUP_TOKEN_TYPE_MISSING"** — with suggestion
12. **"trigger event referencing nonexistent action emits CNL_XREF_TRIGGER_ACTION_MISSING"** — with suggestion

### Invariants that must remain true
- Cross-ref diagnostics are only emitted when BOTH source and target sections are non-null
- Every cross-ref diagnostic has a `path` pointing to the source field (e.g., `operationProfiles[3].actionId`)
- Every cross-ref diagnostic has a `suggestion` with the closest valid target (Levenshtein)
- Cross-ref validation is idempotent and deterministic
- Valid specs produce zero cross-ref diagnostics
- The FITL production spec produces zero cross-ref diagnostics
