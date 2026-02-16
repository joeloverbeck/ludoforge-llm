# Spec 32: Binding and Parameter Semantics

**Status**: Draft  
**Scope**: Normative runtime semantics and statically-enforceable constraints for binding/parameter behavior.

## Purpose

Define one authoritative, game-agnostic contract for how action params, effect binders, and decision params are declared, resolved, and consumed.

This spec describes **current engine behavior** in:
- `src/kernel/legal-moves.ts`
- `src/kernel/legal-choices.ts`
- `src/kernel/move-decision-sequence.ts`
- `src/kernel/apply-move.ts`
- `src/kernel/action-executor.ts`

Static validation boundaries are defined by:
- `src/kernel/validate-gamedef-core.ts`
- `src/kernel/validate-gamedef-behavior.ts`
- `src/kernel/validate-gamedef-structure.ts`

## Declarations

Bindings originate from these declaration surfaces:

1. Action parameters:
   - `actions[].params[].name`
   - Enumerated in `legalMoves()` and injected into runtime bindings.
2. Effect binders:
   - `chooseOne.bind`
   - `chooseN.bind`
   - `let.bind`
   - `forEach.bind`
   - `forEach.countBind`
   - `removeByPriority.groups[].bind`
   - `removeByPriority.groups[].countBind`
   - `removeByPriority.remainingBind`
   - `rollRandom.bind`
3. Runtime system bindings:
   - `__freeOperation`
   - `__actionClass`

## Scope and Shadowing

Bindings use lexical, nested scope during effect traversal in `legalChoices()` and runtime effect execution:

1. Entering `let`, `forEach`, `removeByPriority ... in`, `choose*` resolution, or other nested effect blocks extends binding scope.
2. Inner scopes may shadow outer bindings with the same name.
3. Shadowing is local to that nested traversal frame; outer bindings are preserved outside the frame.
4. `rollRandom.in` is intentionally not traversed during decision discovery; stochastic branches do not participate in legality-time choice discovery.

## Lookup and Materialization Order

Runtime binding maps are materialized in this order:

1. Start from submitted `move.params`.
2. Add resolved decision bindings derived from decision ids (for example `decision:$x` -> `$x`) and profile-declared decision bind metadata.
3. Add runtime-reserved system bindings (`__freeOperation`, `__actionClass`) last.

Consequence: runtime-reserved names are authoritative and cannot be overridden by submitted move params.

## Executor Semantics

Executor resolution (`resolveActionExecutorPlayer`) is binding-aware:

1. At legality-time, executor resolution may run repeatedly while params are being enumerated.
2. For non-pipeline actions, legality uses the currently enumerated param bindings.
3. For pipeline actions, legality begins from empty move params, then decision discovery validates/extends bindings.
4. At execution-time, executor resolution uses the concrete move bindings selected by the player and/or decision sequence.

## Legality-Time vs Execution-Time

1. `legalMoves()` decides whether an action template/param combination is generally legal in current state.
2. `resolveMoveDecisionSequence()` + `legalChoices()` enforce sequential decision completeness and domain validity.
3. `applyMove()` revalidates legality and decision completeness before effect execution.
4. If a decision param is missing at apply time, the move is rejected as incomplete.
5. If a decision param is present but outside computed domain, the move is rejected as invalid params.

## Enumeration Budgets and Observability

Move and decision discovery are bounded by engine-generic budgets:

1. `maxTemplates`: max legal move templates emitted during enumeration.
2. `maxParamExpansions`: max parameter-domain expansions traversed during recursive param enumeration.
3. `maxDecisionProbeSteps`: max sequential discovery steps while probing unresolved decisions.
4. `maxDeferredPredicates`: max deferred pipeline predicate evaluations allowed during discovery probing.

Budget hits are deterministic truncation points and emit structured runtime warnings through the legal move diagnostics surface. No game-specific logic is encoded in these controls.

## Static Validation Boundaries

Static validation intentionally enforces only deterministic, execution-independent invariants.

Current static coverage includes:

1. Structure/reference/type checks for actions, effects, queries, zones, vars, markers.
2. Action param-level invariants:
   - duplicate names in one action are rejected (`DUPLICATE_ACTION_PARAM_NAME`)
   - reserved runtime names are rejected (`ACTION_PARAM_RESERVED_NAME`)
3. Definite-binding control-flow guarantees:
   - conditionally introduced binders are rejected at compile time when not guaranteed at use-site (`CNL_COMPILER_BINDING_UNBOUND`)
   - post-`if` visibility uses branch intersection semantics, including implicit fallthrough when `else` is omitted.

Runtime binding errors remain relevant only for dynamic/runtime-selected paths (for example deferred pipeline discovery and malformed runtime payloads), not for statically knowable control-flow liveness misses.

## Tests

Behavior is pinned by focused suites, including:

- `test/unit/kernel/legal-choices.test.ts`
- `test/unit/kernel/move-decision-sequence.test.ts`
- `test/unit/apply-move.test.ts`
- `test/unit/action-executor-binding.test.ts`
- `test/unit/action-executor-semantics.test.ts`
- `test/unit/compile-bindings.test.ts`
- `test/unit/binder-surface-registry.test.ts`
- `test/integration/decision-sequence.test.ts`
- `test/integration/production-spec-strict-binding-regression.test.ts`
