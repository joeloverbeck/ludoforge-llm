# FITLCOUROUANDVIC-002 - Deterministic Score-Track Recompute Kernel

**Status**: ✅ COMPLETED  
**Spec**: `specs/19-fitl-coup-round-and-victory.md`  
**Depends on**: `FITLCOUROUANDVIC-001`

## Goal
Harden generic recompute foundations so derived score-track formulas remain deterministic functions of canonical runtime state (no drift from malformed derived identifiers).

## Assumption Reassessment (2026-02-11)
- The ticket's original FITL-specific recompute primitives (support/opposition/control/bases/available-force) are not modeled as dedicated kernel runtime fields in the current codebase.
- Current recompute mechanics are generic and already present through `ValueExpr` aggregates, `OptionsQuery`, and bounded `setVar`/`addVar` effects.
- `zones` owner filtering currently infers ownership from zone id qualifiers alone (`:<playerId>`), which can admit malformed unowned zones into owner-scoped aggregates if canonical ownership metadata is inconsistent.
- Scope correction: this ticket should tighten owner-scoped zone query behavior to use canonical `ZoneDef.owner` semantics (while preserving existing public APIs), and add regression coverage for deterministic aggregate inputs.

## Implementation Tasks
1. Update `evalQuery({ query: 'zones', filter.owner })` to require canonical player-owned zones when resolving owner filters.
2. Preserve deterministic ordering and existing selector semantics.
3. Add regression tests covering malformed ownership metadata + qualifier combinations.

## File List Expected To Touch
- `src/kernel/eval-query.ts`
- `test/unit/eval-query.test.ts`

## Out Of Scope
- Coup phase ordering and branching policy.
- FITL-specific support/opposition/control/base formula encoding.
- Final victory threshold and ranking resolution.
- Any new FITL-identifier runtime branching.

## Acceptance Criteria
## Specific Tests That Must Pass
- `npm run build`
- `node --test dist/test/unit/eval-query.test.js`
- `node --test dist/test/unit/eval-value.test.js`
- `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`

## Invariants That Must Remain True
- Recompute inputs remain pure and deterministic for equal canonical inputs.
- No mutable shadow scoreboard is introduced.
- Owner-scoped zone aggregates cannot be polluted by non-player canonical zone definitions.

## Outcome
- **Completion date**: 2026-02-11
- **What changed**:
  - Tightened `evalQuery({ query: 'zones', filter.owner })` so owner-filtered zone results require canonical `ZoneDef.owner === 'player'` in addition to numeric owner qualifier matching.
  - Added a regression unit test proving malformed unowned zones with player-like qualifiers do not leak into owner-scoped zone aggregates.
- **Deviations from original plan**:
  - Original ticket plan targeted FITL-specific support/control/base recompute primitives that are not represented as dedicated kernel runtime fields; delivered scope was narrowed to the concrete generic recompute determinism gap present in the current engine.
- **Verification results**:
  - `npm run build`
  - `node --test dist/test/unit/eval-query.test.js`
  - `node --test dist/test/unit/eval-value.test.js`
  - `node --test dist/test/unit/no-hardcoded-fitl-audit.test.js`
  - `npm run test:unit -- --coverage=false --test-name-pattern "eval-query"`
