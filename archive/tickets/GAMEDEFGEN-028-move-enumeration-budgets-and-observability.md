# GAMEDEFGEN-028: Move Enumeration Budgets and Observability Controls

**Status**: ✅ COMPLETED  
**Priority**: MEDIUM  
**Effort**: Medium

## Reassessed Assumptions (Current Code Reality)

1. `resolveMoveDecisionSequence` already has a probe guard (`maxSteps`, default 128), but it throws on overflow and does not expose structured telemetry.
2. `legalMoves` and `enumerateParams` currently have no configurable enumeration budgets for template count or parameter expansion count.
3. Discovery-time deferred predicates exist (`evalActionPipelinePredicateForDiscovery` returns `deferred`) but there is no budget/telemetry around deferred accumulation during probing.
4. Runtime warning infrastructure already exists (`ExecutionCollector` + `RuntimeWarning`) and is the correct engine-generic observability surface; move enumeration currently does not expose it.
5. There is no current API returning legal moves together with diagnostics/warnings.

## Architecture Decision

Adopt one generic budget policy surface for move enumeration/probing and route observability through structured runtime warnings (not ad-hoc per-game diagnostics).

This is better than current architecture because it:

1. Centralizes safety controls for branching behavior.
2. Uses existing engine-generic telemetry primitives (`RuntimeWarning`/collector) instead of introducing parallel channels.
3. Keeps behavior deterministic via bounded traversal/truncation rather than unbounded recursion or runtime hangs.

## 1) What must be added/fixed

1. Add engine-generic move-enumeration budget controls:
   - max templates emitted
   - max parameter expansions
   - max decision probe steps
   - max deferred predicate evaluations during probe
2. Add a legal-move enumeration API that returns both moves and structured warnings so budget hits are observable.
3. Make budget reach behavior deterministic and bounded (truncate deterministically + warning), replacing throw-on-overflow in probing.
4. Thread budget options through free-operation template probing so all template generation paths are bounded consistently.
5. Document budget semantics as engine-generic constraints.

## 2) Invariants that must pass

1. Enumeration remains deterministic given same state/seed/config.
2. Budget enforcement never produces malformed moves; it yields explicit bounded outputs with structured warnings.
3. Small/normal specs remain unaffected under default budgets.
4. Large branching specs terminate predictably with actionable telemetry rather than uncontrolled explosion.

## 3) Tests that must pass

1. Unit: deterministic budget cutoff behavior for param enumeration and decision probing.
2. Unit: diagnostics emitted with stable codes and payloads when each budget threshold is exceeded.
3. Unit/integration: representative high-branching fixtures complete within configured bounds and produce stable outputs.
4. Regression: existing legal move and decision sequence suites pass under default config.

## Outcome

- Completion date: 2026-02-15
- Implemented:
  - Added shared move-enumeration budget model (`maxTemplates`, `maxParamExpansions`, `maxDecisionProbeSteps`, `maxDeferredPredicates`).
  - Added deterministic truncation and warning emission for decision probing and legal move enumeration budget hits.
  - Added `enumerateLegalMoves()` diagnostics surface returning `{ moves, warnings }`; retained `legalMoves()` as wrapper returning moves.
  - Threaded budget options through free-operation variant probing for consistent bounded behavior.
  - Extended runtime warning taxonomy with stable budget warning codes.
  - Documented budget semantics in Spec 32 as engine-generic constraints.
- Deviations from original plan:
  - Used runtime warnings/collector-compatible warning schema instead of introducing a separate diagnostics subsystem.
  - Replaced throw-on probe-step overflow with deterministic incomplete result + warning for bounded behavior consistency.
- Verification:
  - `npm run build` passed.
  - Focused tests passed:
    - `node --test dist/test/unit/kernel/move-decision-sequence.test.js dist/test/unit/kernel/legal-moves.test.js`
  - Full regression + lint passed:
    - `npm test`
    - `npm run lint`
