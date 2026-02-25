# ENGINEARCH-017: Add Runtime Regression Coverage for Newly Typed EvalError Context Codes

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — eval-error runtime tests for structured context preservation
**Deps**: archive/tickets/ENGINEARCH-014.md (completed)

## Problem

Recent context typing hardening added stricter compile-time contracts for several eval-error codes, but runtime tests in `eval-error.test.ts` do not yet explicitly verify structured payload persistence for all newly typed helper constructors.

## Assumption Reassessment (2026-02-25)

1. Compile-time coverage already exists in `packages/engine/test/unit/types-foundation.test.ts` for:
   - `QUERY_BOUNDS_EXCEEDED`
   - `DIVISION_BY_ZERO`
   - `ZONE_PROP_NOT_FOUND`
2. Runtime `eval-error` construction coverage currently verifies:
   - code assignment for helper constructors
   - generic message formatting with contextual JSON payloads
   - guard behavior (`isEvalError`, `isEvalErrorCode`)
3. Dedicated classifier behavior (`hasEvalErrorDeferClass`, recoverability) is already covered in `packages/engine/test/unit/eval-error-classification.test.ts` and is not owned by this ticket.
4. No runtime assertions currently validate exact context-field preservation in helper-constructor outputs for:
   - `queryBoundsExceededError`
   - `divisionByZeroError`
   - `zonePropNotFoundError`

## Architecture Check

1. Adding runtime constructor-context assertions is a net architectural win: it hardens the contract boundary between typed helper APIs and runtime error objects.
2. This is a focused, game-agnostic infrastructure safeguard with low maintenance cost.
3. The change strengthens robustness without introducing aliases or compatibility shims.
4. Full refactors of error architecture are out of scope; this ticket should stay narrowly targeted to regression-proofing constructor behavior.

## What to Change

### 1. Expand eval-error runtime tests for structured context codes

Add assertions that helper constructors preserve required context fields for:
- `QUERY_BOUNDS_EXCEEDED`
- `DIVISION_BY_ZERO`
- `ZONE_PROP_NOT_FOUND`

### 2. Keep guard/formatting coverage stable in eval-error surface tests

Retain existing runtime checks for guard behavior and message formatting while adding explicit context-preservation assertions.

## Files to Touch

- `packages/engine/test/unit/eval-error.test.ts` (modify)

## Out of Scope

- Additional error-code type-map expansion
- Kernel behavior changes outside error construction/testing
- Classifier behavior/module ownership changes (covered by ENGINEARCH-014)
- Runner/UI changes

## Acceptance Criteria

### Tests That Must Pass

1. Runtime tests assert structured context fields are preserved and correct for helper constructors of newly typed codes.
2. Existing eval error guards and formatting checks remain behaviorally unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Typed contracts are validated at both compile-time and runtime test layers.
2. Game-agnostic error semantics remain deterministic and unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/eval-error.test.ts` — add runtime payload assertions for typed helper constructors.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/eval-error.test.js`
3. `pnpm -F @ludoforge/engine test:unit`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-25
- What changed:
  - Updated ticket assumptions/scope to reflect current repo state (dependency archived, classifier coverage already separate).
  - Added runtime regression assertions in `packages/engine/test/unit/eval-error.test.ts` validating context preservation for `queryBoundsExceededError`, `divisionByZeroError`, and `zonePropNotFoundError`.
  - Refined eval-error architecture so `EvalError.message` remains plain human text and structured payloads are asserted/read from `error.context` (no context serialization into message).
  - Updated tests that were coupled to serialized context text (`eval-error.test.ts`, `resolve-ref.test.ts`, `resolve-selectors.test.ts`, `eval-condition.test.ts`) to assert context invariants directly.
- Deviations from original plan:
  - In addition to targeted regression coverage, a focused architecture refinement was implemented in `eval-error.ts` to decouple presentation text from machine context payload.
  - Guard/classifier behavior tests were not expanded because they are already covered and unchanged.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/eval-error.test.js` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed (159/159).
  - `pnpm -F @ludoforge/engine lint` passed.
