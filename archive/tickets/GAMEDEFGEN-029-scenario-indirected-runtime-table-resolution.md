# GAMEDEFGEN-029: Scenario-Indirected Runtime Table Resolution (No Scenario-ID Literals in Macros)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: TEXHOLKERPRIGAMTOU-015
**Blocks**: Future multi-scenario game specs

## 0) Reassessed assumptions (based on current code/tests)

- Current AST/schema/compiler surfaces (`assetRows.tableId`, `assetField.tableId`) are plain strings and tests currently encode concrete runtime IDs (`<assetId>::<tablePath>`).
- Runtime table contracts are generated for all runtime data assets as concrete IDs only; runtime evaluation/validation resolves by exact `tableId` and has no logical indirection layer.
- Scenario selection already exists at compile time via `metadata.defaultScenarioAssetId`, with deterministic diagnostics for unknown/ambiguous scenario selection.
- Texas `escalate-blinds` currently hardcodes `tournament-standard::settings.blindSchedule` and therefore leaks scenario asset IDs into macros.

Ticket correction:
- Implement indirection strictly in compiler lowering (GameSpec input -> concrete GameDef output), not in runtime kernel evaluation.
- Canonical GameSpec table reference form is **scenario-relative dotted table path** (example: `settings.blindSchedule`), not `assetId::tablePath`.
- Do not add backward compatibility aliases. Legacy `assetId::tablePath` in GameSpec should be rejected with migration diagnostics.

## 1) What needs to change/be added

Introduce a game-agnostic indirection layer so GameSpec logic does not hardcode scenario asset ids inside table references.

Scope:
- Add a canonical table reference form in GameSpec that addresses scenario tables by **scenario-relative table path** (for example `settings.blindSchedule`) rather than `<scenarioAssetId>::<path>` literals.
- During compile/lowering, resolve scenario-relative refs against the selected scenario (`metadata.defaultScenarioAssetId` or deterministic single-scenario selection) and emit concrete GameDef refs (`<scenarioAssetId>::<path>`).
- Keep runtime query/ref surfaces (`assetRows`, `assetField`) game-agnostic by consuming already-lowered concrete table IDs only.
- Refactor Texas `escalate-blinds` to use scenario-indirected table reference form.
- Reject unresolved scenario-relative refs and legacy `assetId::tablePath` literals with explicit diagnostics.

Out of scope:
- Backward compatibility aliases for old literal refs.
- Runtime alias routing tables or game-specific kernel branching.

## 2) Invariants that must pass

1. GameSpec macros/rules can reference scenario tables without embedding concrete scenario asset ids.
2. Compiler deterministically resolves scenario-relative table refs to concrete runtime table IDs using the selected scenario.
3. Legacy GameSpec `assetId::tablePath` refs are rejected (no fallback/aliasing).
4. Resolution failures are deterministic and explicit (no fallback/guessing).
5. Kernel runtime remains game-agnostic; no per-game table routing logic.

## 3) Tests that must pass

1. Unit: compiler resolves scenario-relative table refs to selected-scenario concrete contracts for `assetRows` and `assetField`.
2. Unit: compiler rejects legacy `assetId::tablePath` table refs in GameSpec surfaces with deterministic diagnostics.
3. Unit: missing scenario-relative table paths produce deterministic diagnostics.
4. Unit: Texas production spec macro uses scenario-relative table refs (no scenario-id literal in `escalate-blinds`).
5. Integration: changing `metadata.defaultScenarioAssetId` changes resolved runtime table IDs/behavior without macro rewrites.
6. Regression: `npm run build`, `npm test`, `npm run lint`.

## Outcome

- **Completion date**: 2026-02-16
- **What was changed**:
  - Added compiler-side scenario table-ref resolution pass (`src/cnl/resolve-scenario-table-refs.ts`) that:
    - resolves scenario-relative `tableId` paths to concrete `<scenarioAssetId>::<tablePath>` runtime IDs,
    - rejects legacy GameSpec literals with embedded scenario ids,
    - emits deterministic diagnostics for unresolved scenario-relative paths.
  - Wired resolution into compile flow before lowering (`src/cnl/compiler-core.ts`), preserving game-agnostic runtime behavior.
  - Exposed selected scenario id from data-asset derivation for deterministic table-ref resolution (`src/cnl/compile-data-assets.ts`).
  - Migrated Texas `escalate-blinds` macro to scenario-relative table refs (`data/games/texas-holdem/20-macros.md`).
  - Updated affected Texas/runtime tests and added dedicated resolver coverage.
- **Deviations from original plan**:
  - Canonical input form is scenario-relative table path (for example `settings.blindSchedule` / `blindSchedule.levels`) rather than free-form alias names; this avoids alias registries and keeps resolution deterministic and generic.
  - Indirection is compile-only; runtime kernel still resolves concrete table IDs only.
- **Verification results**:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
