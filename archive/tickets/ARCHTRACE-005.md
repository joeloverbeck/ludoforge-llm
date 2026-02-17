# ARCHTRACE-005: Replace `commitResource` With Generic `transferVar` Effect

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — effect-surface generalization
**Deps**: ARCHTRACE-003 (satisfied; archived at `archive/tickets/ARCHTRACE-003.md`)

## Problem Statement

`commitResource` is semantically narrow and domain-flavored (`commit`) while core runtime contracts should be game-agnostic. We now have a generic `resourceTransfer` trace primitive, but effect authoring still routes through a specialized effect shape.

## Goal

Introduce a fully generic variable-transfer effect in GameDef/runtime so GameSpecDoc can express transfer semantics across arbitrary games without domain-specific effect names.

## Reassessed Assumptions (Code/Test Reality Check)

Validated against current `src/`, `schemas/`, and `test/`:

1. `commitResource` is still the only transfer effect across AST, CNL lowering, runtime dispatch, validation, binder-surface contracts, and schema artifacts.
2. Current transfer execution is structurally non-generic because `commitResource.from` is constrained to per-player scope only (`from.scope: 'pvar'`).
3. ARCHTRACE-003 already introduced `resourceTransfer` trace entries, so this ticket is an effect-contract migration/generalization, not a trace-primitive addition.
4. Existing tests are broad and deeply coupled to `commitResource` naming and semantics; migration must include compiler, validator, binding, runtime, schema, and representative integration fixtures.
5. Some existing game/spec artifacts still mention `commitResource`; ticket scope must include updating those fixtures where they are part of verified behavior.

## Updated Scope

1. Add a new canonical effect AST node: `transferVar` with generic endpoints:
- `from`: `{ scope: 'global' | 'pvar', var, player? }`
- `to`: `{ scope: 'global' | 'pvar', var, player? }`
- `amount`, optional `min`, `max`, optional `actualBind`
2. Enforce explicit endpoint contracts:
- `player` is required when endpoint scope is `pvar`.
- `player` is not used when endpoint scope is `global`.
3. Generalize transfer execution logic into one runtime path used by `transferVar` for all scope combinations (`global->global`, `global->pvar`, `pvar->global`, `pvar->pvar`).
4. Remove `commitResource` from engine contracts (AST/compiler/runtime/validation/binder/schemas/tests), with no backward compatibility aliases.
5. Keep transfer tracing generic and stable:
- emit `resourceTransfer` + paired `varChange` entries for actual transfers.
6. Update CNL lowering and binder-surface contracts to expose `transferVar.actualBind` identically to current sequential binding behavior.
7. Regenerate schema artifacts and migrate tests from `commitResource` to `transferVar`, adding coverage for newly supported endpoint combinations.

## Architectural Rules

1. No game-specific branching in transfer runtime logic.
2. Endpoint contracts stay generic and explicit; runtime does not infer transfer intent from unrelated effects.
3. One canonical transfer effect in engine-level AST/runtime to prevent semantic drift.

## Architecture Assessment

Replacing `commitResource` with canonical `transferVar` is more beneficial than the current architecture because:

1. It removes domain-flavored naming from core engine contracts.
2. It makes transfer semantics uniformly expressible across games (including global-origin transfers) without introducing new effect kinds later.
3. It aligns authoring, runtime behavior, and tracing around one generic primitive, reducing long-term contract drift.

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

1. This is a contract-level rename/generalization; all producer paths (CNL/macros/spec fixtures/tests/schema artifacts) must be updated in lockstep.
2. Runtime safety must remain strict for non-int targets and invalid/missing player selectors on per-player endpoints.
3. No staged aliasing: remove `commitResource` once `transferVar` migration is complete.

## Outcome

- Completion date: 2026-02-17
- What was actually changed vs originally planned:
1. Replaced `commitResource` with canonical `transferVar` across AST/schema/compiler/runtime/validation/binder contracts, with no compatibility alias.
2. Generalized runtime transfer execution to support all endpoint combinations (`global->global`, `global->pvar`, `pvar->global`, `pvar->pvar`) while preserving deterministic clamp/conservation semantics.
3. Enforced explicit endpoint contracts in validation (`pvar` endpoints require `player`; `global` endpoints forbid `player`).
4. Migrated Texas Hold'em production GameSpecDoc fragments from `commitResource` to `transferVar` so integration/property suites compile and execute against the new contract.
5. Regenerated schema artifacts to align `GameDef`/`Trace`/`EvalReport` contracts with `transferVar`.
6. Added/updated tests for compiler lowering and validator/runtime matrix coverage of newly supported global-origin transfers and endpoint invariants.
- Verification results:
1. `npm run lint` passed.
2. `npm test` passed.
