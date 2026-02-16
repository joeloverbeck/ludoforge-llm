# GAMSPEPARVAL-010: Runtime Table Constraints and Key Contracts

**Status**: TODO
**Priority**: HIGH
**Effort**: Large
**Dependencies**: GAMEDEFGEN-029, KERCONVALQUEEVA-009
**Blocks**: Robust data-contract validation for arbitrary games

## 1) What needs to change/be added

Add generic runtime table contract constraints so data invariants are validated structurally rather than assumed in game macros.

Scope:
- Extend runtime table contract schema with optional generic constraints:
  - unique key fields (single or composite),
  - optional monotonic ascending/descending numeric fields,
  - optional contiguous integer key ranges.
- Validate constraints at compile/validate time against selected runtime data assets.
- Emit deterministic diagnostics with offending table + row context.
- Encode Texas blind schedule constraints via generic contract (for example unique/contiguous `level`, positive `handsUntilNext`).

Out of scope:
- Game-specific validators hardcoded in kernel/compiler.

## 2) Invariants that must pass

1. Constraint evaluation is table-generic and reusable across games.
2. Violations fail compilation/validation deterministically.
3. No runtime fallback when declared constraints are violated.
4. Constraint metadata is represented in GameDef, not hidden in game-specific code.

## 3) Tests that must pass

1. Unit: unique key validation catches duplicates.
2. Unit: monotonic and contiguous validations catch malformed order/gaps.
3. Unit: valid constrained tables pass without diagnostics.
4. Integration: malformed Texas blind schedule fixture fails with explicit diagnostics.
5. Regression: `npm run build`, `npm test`, `npm run lint`.
