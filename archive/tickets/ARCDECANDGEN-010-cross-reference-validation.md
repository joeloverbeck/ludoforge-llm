# ARCDECANDGEN-010: Cross-Reference Validation Pass

**Status**: ✅ COMPLETED

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
| `operationProfiles[].actionId` | action ID | `actions[].id` | `CNL_XREF_PROFILE_ACTION_MISSING` |
| `operationProfiles[].linkedSpecialActivityWindows[]` | window ID | `turnFlow.eligibility.overrideWindows[].id` | `CNL_XREF_PROFILE_WINDOW_MISSING` |
| `triggers[].event.phase` | phase ID | `turnStructure.phases[].id` | `CNL_XREF_TRIGGER_PHASE_MISSING` |
| `triggers[].event.action` | action ID | `actions[].id` | `CNL_XREF_TRIGGER_ACTION_MISSING` |
| `victory.checkpoints[].faction` | faction ID | `turnFlow.eligibility.factions[]` | `CNL_XREF_VICTORY_FACTION_MISSING` |
| `victory.margins[].faction` | faction ID | `turnFlow.eligibility.factions[]` | `CNL_XREF_MARGIN_FACTION_MISSING` |
| `setup[].createToken.zone` | zone ID | `zones[].id` | `CNL_XREF_SETUP_ZONE_MISSING` |
| `setup[].createToken.type` | token type ID | `tokenTypes[].id` | `CNL_XREF_SETUP_TOKEN_TYPE_MISSING` |
| `actions[].effects[]` (moveToken/draw refs) | zone IDs | `zones[].id` | `CNL_XREF_EFFECT_ZONE_MISSING` |
| `turnFlow.cardLifecycle.played/lookahead/leader` | zone ID | `zones[].id` | `CNL_XREF_LIFECYCLE_ZONE_MISSING` |
| `turnFlow.passRewards[].resource` | var name | `globalVars[].name` | `CNL_XREF_REWARD_VAR_MISSING` |

### Current-Code Assumptions (Reassessed)

- Field names are already post-rename in code: `operationProfiles`, `turnFlow`, `victory`, `coupPlan`.
- `CompileSectionResults` currently includes `turnFlow`, `operationProfiles`, `coupPlan`, `victory`, and `eventCards`.
- `operationProfiles[].linkedSpecialActivityWindows` is the active window-link field.
- Trigger action references are encoded as `triggers[].event.type === "actionResolved"` with optional `event.action`.
- Cross-validation must be section-aware: emit diagnostics only when both source and target sections are non-null.
- `coupPlan.phases[].id` are symbolic coup workflow ids in existing fixtures, not turn-structure phase ids; phase cross-check is deferred.
- `turnFlow.cardLifecycle` zones and `passRewards[].resource` are now treated as strict references and must resolve during compilation.

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
- Every cross-ref diagnostic has a `path` pointing to the source field (e.g., `doc.operationProfiles.3.actionId`)
- Every cross-ref diagnostic has a `suggestion` with the closest valid target (Levenshtein)
- Cross-ref validation is idempotent and deterministic
- Valid specs produce zero cross-ref diagnostics
- The FITL production spec produces zero cross-ref diagnostics

## Outcome

- **Completion date**: February 13, 2026
- **Actually changed**:
  - Added `src/cnl/cross-validate.ts` with a post-lowering cross-reference pass over `CompileSectionResults`.
  - Integrated `crossValidateSpec(sections)` in `src/cnl/compiler-core.ts` before final `GameDef` assembly.
  - Exported `crossValidateSpec` from `src/cnl/index.ts`.
  - Added strict turn-flow cross references:
    - `turnFlow.cardLifecycle.played/lookahead/leader` must reference declared zones.
    - `turnFlow.passRewards[].resource` must reference declared global vars.
  - Updated affected fixtures/tests to satisfy the strict references.
  - Added `test/unit/cross-validate.test.ts` with coverage for valid specs, missing phase/action/faction refs, lifecycle/reward refs, setup zone/token-type refs, null-target suppression, deterministic ordering, and FITL production no-xref regressions.
- **Deviations from original plan**:
  - Deferred only the `coupPlan.phases[].id` cross-check against `turnStructure.phases[].id` because those are different domains in current architecture.
  - Follow-up design/implementation captured in `tickets/ARCDECANDGEN-011-coup-workflow-cross-reference-contract.md`.
- **Verification results**:
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm test` passed.
