# FITLEVEFRAANDINICARPAC-004 - Partial Execution and Hard-Invariant Enforcement

**Status**: Proposed  
**Spec**: `specs/20-fitl-event-framework-and-initial-card-pack.md`  
**Depends on**: `FITLEVEFRAANDINICARPAC-003`

## Goal
Implement generic `execute what can` event semantics with deterministic skipped-step tracing, while enforcing hard invariants (stacking, track bounds, tunneled-base restriction, legal piece source constraints).

## Scope
- Support partial event resolution when full effect execution is impossible.
- Emit deterministic skipped/unapplied step trace entries with explicit reasons.
- Enforce event hard invariants during event-effect execution.
- Keep resource/aid/patronage track clamping inside declared bounds.

## Implementation tasks
1. Add skipped-step reason model in runtime trace data for event execution.
2. Extend effect runtime validation to support partial-step outcomes rather than hard fail where allowed.
3. Add invariant guards for stacked placement/removal legality, track clamping, and tunneled-base removal rule.
4. Add unit tests for constrained-state partial execution and invariant enforcement.

## File list it expects to touch
- `src/kernel/effects.ts`
- `src/kernel/effect-context.ts`
- `src/kernel/effect-error.ts`
- `src/kernel/apply-move.ts`
- `src/kernel/types.ts`
- `src/kernel/schemas.ts`
- `schemas/Trace.schema.json`
- `test/unit/effects-runtime.test.ts`
- `test/unit/effects-lifecycle.test.ts`
- `test/unit/effects.golden.test.ts`
- `test/unit/apply-move.test.ts`

## Out of scope
- Dual-use side selection contracts.
- Lasting-effect persistence windows (`capability` vs `momentum` expiration).
- FITL card authoring for Domino Theory/Phoenix Program.
- Turn-sequence option matrix and non-event move legality rules.

## Acceptance criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/effects-runtime.test.js`
- `node --test dist/test/unit/effects-lifecycle.test.js`
- `node --test dist/test/unit/effects.golden.test.js`
- `node --test dist/test/unit/apply-move.test.js`

### Invariants that must remain true
- When an event cannot fully resolve, all legal sub-effects still execute in deterministic order.
- Every skipped sub-effect produces a trace-visible reason.
- Hard invariants always hold after event execution:
  - track bounds remain within defined limits,
  - no illegal forced removal of Tunneled Bases,
  - no illegal placement/removal source resolution.
- Engine behavior remains generic and independent of FITL-specific identifiers.

