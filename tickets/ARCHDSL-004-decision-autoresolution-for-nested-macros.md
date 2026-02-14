# ARCHDSL-004 - Robust Decision Auto-Resolution for Nested Macro Pipelines

**Status**: Pending  
**Priority**: Medium  
**Depends on**: None

## 1) What needs to change / be added

Improve decision auto-resolution tooling so integration tests can execute deeply nested/macro-expanded pipelines as runtime tests without brittle manual param stitching.

### Required implementation changes

- Enhance decision helper(s) (currently used by integration tests) to:
  - discover pending decisions across nested macro-expanded paths
  - fill deterministic defaults for each discovered decision in order
  - support per-decision overrides by id/name pattern
- Normalize decision-id generation/documentation for nested macro contexts to keep ids stable and predictable.
- Ensure helper behavior is engine-agnostic and not FITL-specific.
- Replace structural-string assertions that existed only due unresolved nested decisions with runtime assertions where practical (initial target: momentum formula-mods coverage).

### Expected files to touch (minimum)

- `test/helpers/decision-param-helpers.ts`
- possibly kernel decision metadata emission path if ids are unstable
- `test/integration/fitl-momentum-formula-mods.test.ts` (convert structural checks to runtime where newly feasible)

## 2) Invariants that should pass

- Deterministic decision resolution for same state/seed.
- No special-casing by game/action id in helper logic.
- Existing tests that already pass with current helper remain stable.
- Decision IDs remain deterministic and traceable for debugging.

## 3) Tests that should pass

### New/updated unit tests

- `test/unit/kernel/move-decision-sequence.test.ts`
  - nested decisions are discovered and ordered deterministically.
- `test/unit/apply-move.test.ts` or helper-specific tests
  - auto-resolver fills all required decisions for nested macro branches.

### New/updated integration tests

- `test/integration/fitl-momentum-formula-mods.test.ts`
  - promote previously structural checks to runtime checks where helper now supports complete resolution.

### Full-suite gates

- `npm run build`
- `npm run lint`
- `npm test`

