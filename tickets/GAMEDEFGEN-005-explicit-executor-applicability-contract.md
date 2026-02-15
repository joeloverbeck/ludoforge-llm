# GAMEDEFGEN-005: Explicit Executor Applicability Contract (No Error-Driven Gating)

**Status**: TODO  
**Priority**: HIGH  
**Effort**: Medium  
**Backwards Compatibility**: None (intentional internal behavior tightening)

## What To Change / Add

Refactor action executor resolution in legal-move generation to remove error-code-based control flow.

1. Introduce an explicit resolver result contract for executor applicability:
   - `applicable(executionPlayer)`
   - `notApplicable` (e.g., fixed executor outside current playerCount)
   - `invalidSpec` (true misconfiguration)
2. Update `legalMoves` enumeration to branch on this result directly rather than catching `MISSING_VAR` to skip actions.
3. Preserve deterministic legal-move ordering and behavior for valid actions.
4. Ensure invalid executor specs are diagnosed in compile/validation phases where possible.

## Invariants

1. Legal-move enumeration never crashes because an executor resolves outside current `playerCount`.
2. `notApplicable` actions are skipped deterministically.
3. Misconfigurations are surfaced as diagnostics/errors, not silently swallowed.
4. Runtime no longer depends on EvalError categories for normal legality branching.

## Tests

1. **Unit**: fixed executor outside `playerCount` is skipped without throw.
2. **Unit**: valid executor still resolves and enumerates legal moves correctly.
3. **Unit**: malformed executor selector path produces explicit failure/diagnostic.
4. **Regression unit**: legal move order unchanged for existing valid fixtures.
5. **Integration**: representative FITL suites involving fixed executors pass.
