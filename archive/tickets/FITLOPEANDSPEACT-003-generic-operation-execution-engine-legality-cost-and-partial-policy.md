# FITLOPEANDSPEACT-003 - Generic Operation Execution Engine: Legality, Cost, and Partial Policy

**Status**: ✅ COMPLETED  
**Spec**: `specs/18-fitl-operations-and-special-activities.md`  
**Depends on**: `FITLOPEANDSPEACT-001`, `FITLOPEANDSPEACT-002`

## Goal
Implement the runtime generic operation execution path that consumes compiled operation profiles and enforces legality checks, cost validation/spend, ordered resolution stages, and partial-execution policy.

## Assumption reassessment (2026-02-11)
- `operationProfiles` compile/validation contracts already exist (`src/cnl/*`, `src/kernel/validate-gamedef.ts`), but runtime execution in `src/kernel/apply-move.ts` does not consume them yet.
- Existing legality enforcement is currently only `legalMoves` + `actions[].pre`; operation-profile legality is not evaluated at execution time.
- Existing runtime cost handling applies `actions[].cost` directly with clamped arithmetic and no pre-spend validation gate tied to `operationProfiles[].partialExecution.mode`.
- Existing trace payload shape is `ApplyMoveResult.triggerFirings`; no dedicated diagnostics stream exists for failed moves, so failure diagnostics must remain error-attached metadata without breaking public APIs.
- The originally listed file/test surface is broader than required for this gap. Minimal closure is concentrated in move application runtime and unit coverage.

## Scope
- Add operation-profile-aware execution path in kernel move application flow.
- Enforce operation-profile legality predicates before side effects.
- Enforce operation-profile cost validation before spend when `partialExecution.mode === "forbid"`.
- Allow declared partial execution (`mode === "allow"`) to continue resolution without applying spend when cost validation fails.
- Execute operation-profile resolution stages in declared order.
- Keep diagnostics deterministic and serializable via structured illegal-move error metadata (no public API break).

## File list it expects to touch
- `src/kernel/apply-move.ts`
- `test/unit/apply-move.test.ts`

## Out of scope
- FITL-specific operation definitions and faction rules.
- Tunnel/base removal die-roll gates.
- Monsoon/highland terrain restrictions.
- Special-activity linking windows and free-op mode details.
- Expanding `legalMoves` enumeration to pre-filter operation-profile cost/legality failures (execution-time enforcement is sufficient for this ticket).
- Introducing a new trace or diagnostics API surface.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/apply-move.test.js`

## Invariants that must remain true
- Illegal operations fail before mutating game state.
- Cost validation is deterministic and occurs before resolution unless policy explicitly allows partial execution.
- Trace output remains deterministic and serializable.
- Non-operation actions continue to resolve as before.

## Outcome
- Completion date: 2026-02-11
- Actual changes:
  - Added a generic operation-profile execution adapter in `src/kernel/apply-move.ts` that:
    - evaluates profile legality predicates before any side effects,
    - enforces profile cost validation for `partialExecution.mode = "forbid"`,
    - allows resolution without spend when `mode = "allow"` and validation fails,
    - executes profile resolution stages in declared order.
  - Added deterministic structured illegal-move metadata for blocked legality/cost profile cases.
  - Added focused runtime coverage in `test/unit/apply-move.test.ts` for legality gate, forbid/allow partial-cost behavior, and stage ordering.
- Deviations from original plan:
  - No changes were needed in `src/kernel/legal-moves.ts`, `effects.ts`, `effect-context.ts`, `effect-error.ts`, `diagnostics.ts`, or `serde.ts`.
  - Diagnostics remain error-attached metadata instead of introducing a new trace diagnostics channel (preserves public API).
- Verification:
  - `npm run build`
  - `node --test dist/test/unit/apply-move.test.js`
  - `node --test dist/test/unit/legal-moves.test.js`
  - `node --test dist/test/unit/effects-runtime.test.js`
