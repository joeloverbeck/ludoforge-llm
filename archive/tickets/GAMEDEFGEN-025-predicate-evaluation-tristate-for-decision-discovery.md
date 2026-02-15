# GAMEDEFGEN-025: Predicate Evaluation Tri-State for Decision Discovery

**Status**: ✅ COMPLETED  
**Priority**: HIGH  
**Effort**: Medium

## 0) Reassessed Baseline (Code/Test Reality)

1. Typed predicate evaluation runtime errors already exist (`ACTION_PIPELINE_PREDICATE_EVALUATION_FAILED` via `pipelinePredicateEvaluationError`).
2. The exception-driven fallback currently exists in `legalChoices` only, where any predicate-evaluation throw during pipeline viability causes a broad retry with `includeCostValidation: false`.
3. `legalMoves` and `applyMove` already treat predicate-evaluation failures as fatal (no broad catch fallback).
4. Existing tests cover predicate error wrapping and many legality surfaces, but do not explicitly encode a discovery tri-state contract (`passed`/`failed`/`deferred`) for `legalChoices` pipeline viability.

## 1) What must be added/fixed

1. Replace broad exception-driven fallback in `legalChoices` decision discovery with explicit predicate result states:
   - `passed`
   - `failed`
   - `deferred` (only when discovery lacks required bindings/context)
2. Reuse existing typed runtime/eval errors; add explicit discovery classification of recoverable-vs-fatal predicate failures instead of introducing duplicate parallel error systems.
3. Update decision discovery viability logic so `deferred` is handled deterministically without broad `catch` blocks.
4. Document discovery deferral contract in code-level contracts/types: defer only explicitly classified recoverable evaluation failures.

## 2) Invariants that must pass

1. Discovery-time predicate evaluation failures never silently downgrade real runtime defects.
2. Only explicitly classified recoverable cases can produce `deferred`.
3. Legality and cost-validation decisions remain deterministic for fully bound moves.
4. Event-heavy and pipeline-heavy flows remain stable under partial decision parameter states.

## 3) Scope Clarification

1. Primary codepath in scope: `legalChoices` pipeline viability evaluation.
2. Out of scope for this ticket:
   - behavioral changes to `applyMove` and `legalMoves` fatal predicate handling,
   - introducing game-specific predicate handling,
   - backwards-compatibility alias paths for old fallback behavior.
3. Architecture intent: a single generic, reusable predicate viability policy that supports discovery tri-state semantics without hardcoded game behavior.

## 4) Tests that must pass

1. Unit: discovery predicate tri-state behavior for bound (`passed`/`failed`), unbound-recoverable (`deferred`), and unbound-nonrecoverable (`throws typed runtime error`) contexts.
2. Unit: `legalChoices` handles deferred discovery predicates without throwing and without masking nonrecoverable errors.
3. Integration: event decision-discovery flows (including event side/branch selection) pass without predicate-evaluation crashes.
4. Regression: determinism and pipeline viability suites pass.

## Outcome

- Completion date: February 15, 2026
- What was actually changed:
  - Added discovery tri-state predicate status in pipeline viability policy (`passed`/`failed`/`deferred`).
  - Classified only `MISSING_BINDING` discovery predicate failures as `deferred`; other failures remain typed runtime errors.
  - Removed broad `catch` fallback from `legalChoices` and switched to explicit discovery tri-state viability handling.
  - Added a shared discovery predicate evaluator in `action-pipeline-predicates` so discovery classification no longer depends on wrapped error `cause` inspection.
  - Added focused unit tests for tri-state policy behavior and `legalChoices` deferred/nonrecoverable predicate cases.
- Deviations from original plan:
  - No new parallel error taxonomy was introduced because typed eval/runtime error envelopes already existed and were reused.
  - Deferral contract is encoded in runtime policy/types and tests; no separate external docs were added in this ticket.
- Verification results:
  - `npm run build` passed.
  - Targeted kernel tests passed for updated behavior.
  - Full `npm test` passed.
  - `npm run lint` passed.
