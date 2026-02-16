# GAMESPECDOC-004: Binding and Parameter Semantics Specification

**Status**: ✅ COMPLETED  
**Priority**: MEDIUM  
**Effort**: Small  
**Backwards Compatibility**: None (intentional strictness increase in validation + documentation lock-in)

## Assumption Reassessment (Updated)

The original draft assumed binding/parameter semantics were still in a broad "strict-contract migration" phase. That is no longer accurate.

Current code already has mature runtime behavior and coverage in:
- `src/kernel/legal-moves.ts`
- `src/kernel/legal-choices.ts`
- `src/kernel/move-decision-sequence.ts`
- `src/kernel/apply-move.ts`
- `src/kernel/action-executor.ts`
- `test/unit/kernel/legal-choices.test.ts`
- `test/unit/action-executor-binding.test.ts`
- `test/unit/action-executor-semantics.test.ts`
- `test/unit/apply-move.test.ts`
- `test/integration/decision-sequence.test.ts`

However, static validation is still intentionally lighter for binding semantics and mostly checks references/types rather than binder scope invariants:
- `src/kernel/validate-gamedef-core.ts`
- `src/kernel/validate-gamedef-behavior.ts`
- `src/kernel/validate-gamedef-structure.ts`

This ticket should therefore focus on codifying the existing runtime contract and tightening only high-confidence static checks.

## Scope (Updated)

1. Create one normative semantics spec doc that describes current behavior (not aspirational behavior) for:
   - declaration (`actions[].params`, effect binders such as `chooseOne.bind`, `chooseN.bind`, `let.bind`, `forEach.bind`)
   - scope and shadowing rules during effect traversal
   - lookup order / binding materialization (`move.params`, emitted decision ids, resolved binds)
   - executor resolution behavior with binding-aware selectors
   - legality-time vs execution-time binding resolution boundaries
2. Cross-link this doc to concrete implementation modules and validation modules.
3. Add static validation checks only where deterministic and architecture-safe (no game-specific rules).
4. Add/strengthen unit tests for each added static check and for any clarified invariant not currently pinned by tests.

## Out Of Scope

1. Introducing compatibility aliases or dual semantics.
2. Game-specific semantics in kernel/compiler logic.

## Invariants

1. One authoritative semantics source exists for binding/param behavior.
2. Documented semantics match implementation and tests in-repo today.
3. Static diagnostics enforce only invariants that are reliably checkable without execution.
4. Semantics remain game-agnostic and reusable for arbitrary board/card games.

## Tests

1. **Unit**: new/updated validator tests for each new static check.
2. **Unit/Integration**: confirm clarified runtime semantics are already covered or add focused coverage.
3. **Regression**: run existing binding/decision/executor suites plus project lint/test gates.

## Outcome

- Completion date: 2026-02-15
- Actually changed:
  - Added normative semantics document: `docs/reference/binding-and-parameter-semantics.md`.
  - Centralized runtime move-binding materialization into `src/kernel/move-runtime-bindings.ts` and reused it in:
    - `src/kernel/apply-move.ts`
    - `src/kernel/legal-choices.ts`
    - `src/kernel/turn-flow-eligibility.ts`
    - `src/kernel/validate-gamedef-structure.ts` (shared reserved-name source)
    - `src/kernel/index.ts` (export surface)
  - Added static validation hardening in `src/kernel/validate-gamedef-structure.ts`:
    - `DUPLICATE_ACTION_PARAM_NAME` for duplicate `actions[].params[].name` within one action.
    - `ACTION_PARAM_RESERVED_NAME` for reserved runtime bindings (`__freeOperation`, `__actionClass`) used as action params.
  - Added unit coverage in `test/unit/validate-gamedef.test.ts` for both new diagnostics.
  - Added dedicated unit coverage for centralized binding semantics in `test/unit/move-runtime-bindings.test.ts`.
- Deviations from original plan:
  - Did not introduce broad binder-scope static analysis; kept static checks to deterministic, architecture-safe invariants only.
  - Reframed away from “strict-contract migration” wording and documented current runtime contract as implemented.
- Verification results:
  - Targeted tests passed:
    - `node --test dist/test/unit/move-runtime-bindings.test.js dist/test/unit/validate-gamedef.test.js dist/test/unit/kernel/legal-choices.test.js dist/test/unit/apply-move.test.js`
    - `node --test dist/test/unit/validate-gamedef.test.js`
    - `node --test dist/test/unit/kernel/legal-choices.test.js dist/test/unit/kernel/move-decision-sequence.test.js dist/test/unit/action-executor-binding.test.js dist/test/unit/action-executor-semantics.test.js dist/test/unit/apply-move.test.js dist/test/integration/decision-sequence.test.js`
  - Full gates passed:
    - `npm run lint`
    - `npm test`
