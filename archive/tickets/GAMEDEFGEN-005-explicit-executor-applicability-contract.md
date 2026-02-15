# GAMEDEFGEN-005: Explicit Executor Applicability Contract (No Error-Driven Gating)

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Medium  
**Backwards Compatibility**: None (intentional internal behavior tightening)

## Reassessed Baseline (Current Code/Test Reality)

Current behavior in `src/kernel/legal-moves.ts` still uses error-driven branching for executor applicability:

1. Param enumeration path catches `MISSING_BINDING` and `MISSING_VAR` from `resolveActionExecutorPlayer`.
2. Pipeline path catches `MISSING_VAR` from `resolveActionExecutorPlayer`.
3. `resolveActionExecutorPlayer` currently returns only `PlayerId` and signals applicability via thrown `EvalError`.

Existing coverage already present:

1. `test/unit/legal-moves.test.ts` already asserts fixed executor outside current `playerCount` is skipped without throw.
2. `test/unit/legal-moves.test.ts` already covers deterministic move ordering for valid actions.
3. `test/unit/compile-selectors.test.ts` already covers malformed executor selector diagnostics at compile normalization time.

Gap still open:

1. Runtime legality still relies on EvalError categories (`MISSING_VAR`, `MISSING_BINDING`) for normal branching.

## Updated Scope (Ticket Deliverables)

Refactor executor applicability handling so legality flow no longer depends on EvalError codes for normal control flow.

1. Introduce an explicit executor resolution contract in `src/kernel/action-executor.ts`:
   - `applicable` with `executionPlayer`
   - `notApplicable` for valid-but-not-currently-applicable selectors (for example, fixed `id` outside current `playerCount`)
   - `invalidSpec` for true misconfiguration/runtime-invalid selector state
2. Update `src/kernel/legal-moves.ts` to branch on the explicit contract in both param and pipeline paths.
3. Preserve deterministic legal-move ordering and all currently valid behavior.
4. Keep compile/validation diagnostics as the primary source for static selector misconfiguration; runtime should only surface `invalidSpec` when it cannot be caught earlier.
5. Do not broaden this ticket into `applyMove`/`legalChoices` behavior changes unless required for compilation.

## Architecture Rationale

This change is more robust than the current architecture because applicability becomes typed domain logic instead of implicit error taxonomy coupling. It also localizes selector fault interpretation to one module (`action-executor`) and makes `legalMoves` deterministic and explicit without `try/catch` policy spread.

## Invariants

1. Legal-move enumeration never crashes because an executor resolves outside current `playerCount`.
2. `notApplicable` actions are skipped deterministically.
3. Misconfigurations are surfaced as diagnostics/errors, not silently swallowed.
4. Runtime legality no longer depends on EvalError categories for normal branching.

## Tests To Add / Update

1. **Unit (update/add)**: fixed executor outside `playerCount` is skipped via explicit `notApplicable`, without throw.
2. **Unit (add)**: executor `invalidSpec` path is surfaced as error (not silently skipped).
3. **Unit (regression)**: valid executors still enumerate legal moves in existing deterministic order.
4. **Integration**: run representative FITL/executor suites to confirm behavior parity for valid specs.

## Outcome

- Completion date: 2026-02-15
- Actually changed:
  - Added explicit executor applicability contract in `src/kernel/action-executor.ts` (`applicable`, `notApplicable`, `invalidSpec`).
  - Updated `src/kernel/legal-moves.ts` to branch on resolver contract directly (no EvalError-code control flow in legality branching).
  - Preserved legality-time fallback for unresolved binding-derived executors only during param enumeration.
  - Added `test/unit/legal-moves.test.ts` coverage to ensure invalid executor specs are surfaced (not silently skipped).
- Deviations from original plan:
  - Existing tests already covered fixed out-of-range executor skipping and deterministic ordering, so those were retained rather than duplicated.
  - Compile-time malformed selector diagnostics were already in place (`test/unit/compile-selectors.test.ts`), so no new compile diagnostics work was needed.
- Verification:
  - `node --test dist/test/unit/legal-moves.test.js`
  - `node --test dist/test/integration/executor-cross-faction-action.test.js`
  - `npm test`
  - `npm run lint`
