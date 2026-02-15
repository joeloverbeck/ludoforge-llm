# GAMEDEFGEN-009: Tighten Compile-Time Guarantees for Actor/Executor and Related Selectors

**Status**: ✅ COMPLETED  
**Priority**: MEDIUM  
**Effort**: Small-Medium

## 1) Reassessed Baseline (Current Reality)

This ticket was reassessed against current code/tests before implementation.

1. Already implemented:
   - `normalizePlayerSelector` / `normalizeActionExecutorSelector` already reject malformed selector shapes with deterministic diagnostics.
   - Executor selector cardinality constraints (`all`/`allOther` invalid for executor) are compile-time enforced.
   - Executor binding declarations are compile-time enforced (`CNL_COMPILER_ACTION_EXECUTOR_BINDING_MISSING`).
   - Pipelined actions already reject binding-derived executor selectors in cross-validation (`CNL_XREF_ACTION_EXECUTOR_PIPELINE_UNSUPPORTED`).
2. Remaining gap:
   - Actor selector bindings (`actor: "$binding"` / `{ chosen: "$binding" }`) are not compile-time validated against declared action params.
   - Missing actor bindings currently surface later as runtime `invalidSpec` paths.

## 2) Updated Scope

1. Add compile-time actor binding declaration validation in action lowering, symmetric with existing executor binding validation.
2. Keep selector contracts game-agnostic in shared compiler/kernel modules (no game-specific branches).
3. Preserve no-aliasing behavior: binding names must match exactly as declared in params.

Out of scope:
1. Re-architecting selector runtime resolution.
2. Changing existing selector syntax or introducing compatibility aliases.

## 3) Required Changes

1. Compiler:
   - In `lowerActions`, when `actor` resolves to a binding-derived selector, verify binding exists in action params binding scope.
   - Emit a dedicated deterministic diagnostic when missing (new code for actor-binding-missing).
2. Tests:
   - Add/extend compile action unit tests to assert actor binding:
     - accepted when declared.
     - rejected when undeclared with expected diagnostic code/path.
   - Keep existing executor and pipeline behavior unchanged.

## 4) Invariants That Must Hold

1. Invalid actor binding selectors are rejected at compile time with actionable diagnostics.
2. Valid actor/executor selector forms and existing successful fixtures compile unchanged.
3. Runtime `invalidSpec` due to missing actor binding from compiler-produced `GameDef` is eliminated.
4. Diagnostics remain deterministic (stable code/path/severity semantics).

## 5) Validation / Test Gates

1. Run focused unit tests for action selector compilation behavior.
2. Run broader unit/integration regression suites relevant to compiler + legality surfaces.
3. Run lint and ensure clean pass before finalization.

## Outcome

- Completion date: 2026-02-15
- What changed:
  - Added compile-time actor binding declaration validation in `lowerActions`.
  - Added diagnostic `CNL_COMPILER_ACTION_ACTOR_BINDING_MISSING` for undeclared actor binding selectors.
  - Extracted selector binding checks into shared table-driven compiler module `src/cnl/selector-binding-contracts.ts`.
  - Added unit coverage for binding-derived actor selectors (declared and undeclared cases).
  - Added deterministic multi-diagnostic test for simultaneous actor/executor missing bindings.
- Deviations from original plan:
  - Scope narrowed after reassessment: executor selector guarantees were already implemented, so only the remaining actor-binding gap was addressed.
- Verification results:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
