# GAMEDEFGEN-027: Remove Hardcoded Event Action Id Routing

**Status**: TODO  
**Priority**: HIGH  
**Effort**: Medium

## 1) What must be added/fixed

1. Remove hardcoded `'event'` action-id checks from move discovery and choice resolution paths.
2. Introduce explicit action-role metadata (or equivalent generic contract) in compiled `GameDef` for event behavior routing.
3. Route event-specific logic by declared capability/role, not by literal action id.
4. Validate compiler output so malformed/ambiguous role declarations fail deterministically.

## 2) Invariants that must pass

1. Event routing behavior remains deterministic and equivalent for existing event decks.
2. Non-event actions named `event` receive no special behavior unless role metadata declares it.
3. Event behavior is portable to any game spec without relying on reserved action ids.
4. Engine modules remain game-agnostic and free of game-specific string special cases.

## 3) Tests that must pass

1. Unit: action-role routing tests for event and non-event actions (including misleading ids).
2. Integration: event decision-side/branch flows continue to work using role-based routing.
3. Integration: determinism and card-flow suites pass with role-based event routing.
4. Regression: compile/validate diagnostics catch missing/invalid role metadata.
