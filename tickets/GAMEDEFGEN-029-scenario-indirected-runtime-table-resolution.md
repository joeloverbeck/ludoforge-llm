# GAMEDEFGEN-029: Scenario-Indirected Runtime Table Resolution (No Scenario-ID Literals in Macros)

**Status**: TODO
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-015
**Blocks**: Future multi-scenario game specs

## 1) What needs to change/be added

Introduce a game-agnostic indirection layer so GameSpec logic does not hardcode scenario asset ids inside table references.

Scope:
- Add a canonical table reference form in GameSpec/GameDef that addresses runtime tables by logical name/alias (for example `blindSchedule`) rather than `<scenarioAssetId>::<path>` literals.
- During compile/lowering, resolve logical table refs against the selected scenario (`metadata.defaultScenarioAssetId` or explicit scenario selection) and emit concrete GameDef runtime table contracts.
- Ensure runtime query/ref surfaces (`assetRows`, `assetField`) can consume the logical form without any game-specific branching.
- Refactor Texas `escalate-blinds` to use scenario-indirected table reference form.
- Reject ambiguous resolution (for example multiple matching scenario tables) with explicit diagnostics.

Out of scope:
- Backward compatibility aliases for old literal refs. If specs still use old forms, they should fail and be migrated.

## 2) Invariants that must pass

1. GameSpec macros/rules can reference scenario tables without embedding concrete scenario asset ids.
2. Selected scenario uniquely determines runtime table resolution.
3. Resolution failures are deterministic and explicit (no fallback/guessing).
4. Kernel runtime remains game-agnostic; no per-game table routing logic.

## 3) Tests that must pass

1. Unit: compiler resolves logical table refs to selected scenario contracts.
2. Unit: ambiguous/missing logical table refs produce deterministic diagnostics.
3. Unit: Texas production spec compiles with logical table refs and no scenario-id literals in escalation macro.
4. Integration: changing default scenario changes blind behavior without macro rewrites.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
