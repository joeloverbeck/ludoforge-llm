# FITLOPEANDSPEACT-003 - Generic Operation Execution Engine: Legality, Cost, and Partial Policy

**Status**: Proposed  
**Spec**: `specs/18-fitl-operations-and-special-activities.md`  
**Depends on**: `FITLOPEANDSPEACT-001`, `FITLOPEANDSPEACT-002`

## Goal
Implement the runtime generic operation execution path that consumes compiled operation profiles and enforces legality checks, cost validation/spend, ordered resolution stages, and partial-execution policy.

## Scope
- Add operation execution entrypoint in kernel move application flow.
- Enforce legality predicates before side effects.
- Enforce resource-cost validation before execution unless profile explicitly allows partial execution.
- Implement resolution-stage execution ordering exactly as declared by compiled profiles.
- Emit trace-visible diagnostics for illegal attempts and blocked cost/partial-policy cases.

## File list it expects to touch
- `src/kernel/types.ts`
- `src/kernel/legal-moves.ts`
- `src/kernel/apply-move.ts`
- `src/kernel/effects.ts`
- `src/kernel/effect-context.ts`
- `src/kernel/effect-error.ts`
- `src/kernel/diagnostics.ts`
- `src/kernel/serde.ts`
- `test/unit/legal-moves.test.ts`
- `test/unit/apply-move.test.ts`
- `test/unit/effects-runtime.test.ts`
- `test/unit/effects.golden.test.ts`
- `test/integration/game-loop.test.ts`

## Out of scope
- FITL-specific operation definitions and faction rules.
- Tunnel/base removal die-roll gates.
- Monsoon/highland terrain restrictions.
- Special-activity linking windows and free-op mode details.

## Acceptance criteria
## Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/legal-moves.test.js`
- `node --test dist/test/unit/apply-move.test.js`
- `node --test dist/test/unit/effects-runtime.test.js`
- `node --test dist/test/unit/effects.golden.test.js`
- `node --test dist/test/integration/game-loop.test.js`

## Invariants that must remain true
- Illegal operations fail before mutating game state.
- Cost validation is deterministic and occurs before resolution unless policy explicitly allows partial execution.
- Trace output remains deterministic and serializable.
- Non-operation actions continue to resolve as before.
