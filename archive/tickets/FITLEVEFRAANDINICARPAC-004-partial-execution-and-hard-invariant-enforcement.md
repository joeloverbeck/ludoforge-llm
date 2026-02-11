# FITLEVEFRAANDINICARPAC-004 - Partial Execution and Hard-Invariant Enforcement

**Status**: ✅ COMPLETED  
**Spec**: `specs/20-fitl-event-framework-and-initial-card-pack.md`  
**Depends on**: `FITLEVEFRAANDINICARPAC-003`

## Goal
Harden generic partial-execution behavior for operation-profile resolution so skipped cost execution in `partialExecution: allow` mode is trace-visible with deterministic reasons.

## Reassessed assumptions (2026-02-11)
- The original ticket assumed dedicated event-step skipped/unapplied trace modeling already existed in runtime data structures. It does not.
- The current generic partial-execution behavior exists at operation-profile cost validation in `applyMove`:
  - `partialExecution: forbid` blocks execution when cost validation fails.
  - `partialExecution: allow` executes resolution stages and skips cost spending when validation fails.
- The current gap is trace visibility: cost-spend skipping in allow mode is currently silent.
- Hard invariants in the original wording are over-scoped for current generic runtime:
  - Track clamping is already enforced via variable min/max in `setVar`/`addVar`.
  - FITL-specific stacked placement/removal and Tunneled Base removal constraints are not represented as generic kernel invariants yet and cannot be implemented here without new data contracts.
- `src/kernel/effects.ts`, `src/kernel/effect-context.ts`, `src/kernel/effect-error.ts`, and `src/kernel/apply-move.ts` do not need broad runtime refactors for this ticket.

## Scope
- Add a generic trigger-log trace entry when operation-profile cost spend is skipped due to failed cost validation under `partialExecution: allow`.
- Keep behavior deterministic and API-compatible.
- Align kernel runtime schemas and JSON schema artifact for the new trace entry.
- Add focused regression tests for the new trace visibility contract.

## Implementation tasks
1. Add a new generic `TriggerLogEntry` variant for operation partial-execution skips.
2. Emit one deterministic trace entry in `applyMove` when `cost.validate` fails and `partialExecution.mode === 'allow'`.
3. Update runtime Zod schemas and `schemas/Trace.schema.json` to include the new trace entry shape.
4. Add/strengthen unit tests for runtime emission and schema acceptance.

## File list it expects to touch
- `src/kernel/apply-move.ts`
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `schemas/Trace.schema.json`
- `test/unit/apply-move.test.ts`
- `test/unit/json-schema.test.ts`

## Out of scope
- Event-effect-level skipped-step tracing for every sub-effect.
- New FITL-specific invariant enforcement keyed on card/piece/map identifiers.
- Compiler/runtime additions for tunneled-base or stacked-removal special rules.

## Acceptance criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/apply-move.test.js`
- `node --test dist/test/unit/json-schema.test.js`

### Invariants that must remain true
- `partialExecution: forbid` still blocks when cost validation fails.
- `partialExecution: allow` still skips cost spending and executes resolution stages.
- A skipped cost spend in allow mode emits deterministic trace-visible reason metadata.
- Engine behavior remains generic and independent of FITL-specific identifiers.

## Outcome
- Completion date: 2026-02-11.
- What changed:
  - Added a new generic trigger-log entry kind, `operationPartial`, for operation-profile partial execution visibility.
  - Emitted deterministic trace entries from `applyMove` when `cost.validate` fails under `partialExecution: allow` and cost spend is skipped.
  - Updated runtime schema contracts and `schemas/Trace.schema.json` for the new trace entry.
  - Strengthened tests for `applyMove` partial-execution tracing and JSON-schema acceptance of serialized traces containing the new entry.
- Deviations from original plan:
  - Did not implement event-effect-level skipped-step tracing; current runtime only supports operation-profile partial semantics in this scope.
  - Did not add FITL-specific hard invariant enforcement (stacking/tunneled-base rules) because that requires broader generic data contracts not present yet.
- Verification results:
  - `npm run build` passed.
  - `node --test dist/test/unit/apply-move.test.js` passed.
  - `node --test dist/test/unit/json-schema.test.js` passed.
  - Additional hard check: `npm test` passed.
