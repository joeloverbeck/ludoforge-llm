# GAMEDEFGEN-004: Generic Board/Control Query Primitives for Rich Rule Targeting

**Status**: Draft  
**Priority**: P1  
**Complexity**: M  
**Depends on**: Existing eval-query/eval-condition architecture

## 1) What needs to change / be implemented

Introduce generic query/condition primitives that let specs express board game rule constraints precisely (for example, control, location classes, route classes) without game-specific hacks.

- Add generic, reusable selectors for:
  - space classification tags/types
  - control predicates (parameterized by coalition/faction policy supplied by spec data)
  - route/location classes (for example LoCs or equivalent game-defined classes)
- Ensure selectors are data-driven from `GameSpecDoc`/compiled `GameDef`, not hardcoded to FITL.
- Provide compile-time and runtime validation diagnostics for invalid selector references.
- Remove need for broad approximations (for example country-only filters when rules require control/location classes).

## 2) Invariants that should pass

- Query primitives remain game-agnostic and reusable across different games.
- Control/location semantics come from game data, not kernel literals.
- Selector behavior is deterministic and validated.
- Existing queries remain stable unless intentionally replaced.

## 3) Tests that should pass

### New tests
- `test/unit/eval-query-control-and-space-class.test.ts`
  - control and class-based selection behavior.
- `test/unit/compile-selectors-control-primitives.test.ts`
  - compile/validation diagnostics for malformed selectors.
- `test/integration/query-primitives-cross-game-fixture.test.ts`
  - same primitive shape works for two different fixture games.

### Existing tests
- `npm run build`
- `npm run lint`
- `npm test`

