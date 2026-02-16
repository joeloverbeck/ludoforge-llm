# ARCHTRACE-005: Replace `commitResource` With Generic `transferVar` Effect

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — effect-surface generalization
**Deps**: ARCHTRACE-003

## Problem Statement

`commitResource` is semantically narrow and domain-flavored (`commit`) while core runtime contracts should be game-agnostic. We now have a generic `resourceTransfer` trace primitive, but effect authoring still routes through a specialized effect shape.

## Goal

Introduce a fully generic variable-transfer effect in GameDef/runtime so GameSpecDoc can express transfer semantics across arbitrary games without domain-specific effect names.

## Proposed Scope

1. Add new effect AST node: `transferVar` with generic endpoints:
- `from`: `{ scope: 'global' | 'pvar', var, player? }`
- `to`: `{ scope: 'global' | 'pvar', var, player? }`
- `amount`, optional `min`, `max`, optional `actualBind`
2. Move transfer execution logic to a generic runtime path used by `transferVar`.
3. Remove `commitResource` from compiler/runtime effect surfaces (no backward compatibility requirement).
4. Keep transfer trace emission generic and unchanged in principle:
- emit `resourceTransfer` + paired `varChange` entries for actual transfers.
5. Update validation, binder surface contracts, CNL lowering, and schema artifacts accordingly.
6. Update tests from `commitResource` semantics to `transferVar` semantics.

## Architectural Rules

1. No game-specific branching in transfer runtime logic.
2. Endpoint contracts stay generic and explicit; runtime does not infer transfer intent from unrelated effects.
3. One canonical transfer effect in engine-level AST/runtime to prevent semantic drift.

## Invariants

1. Any valid transfer between integer vars (global/per-player combinations) is representable in GameDef.
2. Transfer behavior is deterministic, conservative (source decrease equals destination increase), and clamped by bounds.
3. `resourceTransfer` trace remains game-agnostic and provenance-complete.
4. No domain-specific transfer effect names remain in engine contracts.

## Tests Required

1. Unit: transfer matrix coverage for endpoint combinations (`global->global`, `global->pvar`, `pvar->global`, `pvar->pvar`).
2. Unit: no-op policy coverage (`actualAmount == 0`, same-cell endpoints).
3. Unit: min/max clamp behavior + `actualBind` behavior.
4. Unit: trace emission/ordering + delta coherence invariants.
5. Integration: representative compiled GameSpecDoc paths execute with `transferVar` only.
6. Regression: full lint + test suites pass.

## Risks / Notes

1. This is a contract-level rename/generalization; all producer paths (CNL/macros/spec fixtures) must be updated in lockstep.
2. If staged delivery is needed, stage by introducing `transferVar` first and migrating callsites before deleting `commitResource`.
