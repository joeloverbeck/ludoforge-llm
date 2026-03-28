# Spec 91 — First-Decision-Domain Compilation

**Status**: Not started
**Dependencies**: Spec 90 (Compiled Condition Predicates) — the condition
compiler provides the foundation for compiling the cost-effect guard conditions
that precede the first decision point
**Blocked by**: None
**Enables**: Further reduction of `legalMoves` enumeration cost by replacing
the most expensive per-action operation (partial effect execution) with a direct
state query

## Problem

The dominant cost in `legalMoves` enumeration is
`isMoveDecisionSequenceAdmittedForLegalMove`, which calls
`legalChoicesDiscover → legalChoicesWithPreparedContextStrict →
legalChoicesWithPreparedContextInternal → executeDiscoveryEffectsStrict`. This
partially executes the action's ENTIRE effect tree up to the first
`chooseOne`/`chooseN` node, evaluating cost effects, forEach conditions, and
token queries along the way.

### Profiling Evidence

From the `fitl-perf-optimization` campaign (12 experiments, FITL benchmark):

- `legalMoves`: 86,127ms (76.3% of 112,827ms total)
- 96% of legalMoves is enumeration (~82,700ms)
- Decision sequence admission probing is estimated at ~55,000ms (47% of total)
- Each probe: ~5ms per pipeline action × 20 actions × 600 legalMoves calls

The partial effect execution involves:
1. Creating an effect execution context (EffectEnv + EffectCursor)
2. Executing cost effects (which may themselves involve condition evaluation,
   aggregate queries, and value resolution)
3. Executing the first stage's effects sequentially until a `chooseOne` or
   `chooseN` node is encountered
4. At the choice node: resolving the options query to determine the domain
5. Returning the choice request with the resolved domain

Steps 1-3 are overhead — the engine runs through potentially dozens of effects
just to REACH the first decision point. For FITL operations like Train, this
involves iterating zones, checking preconditions, evaluating cost deductions —
all via the AST interpreter.

### Why This Is Architecturally Solvable

The first decision point and its option domain are **structurally deterministic**
for a given action definition. The effect tree is a static AST — the path from
the root to the first `chooseOne`/`chooseN` node is known at compile time.

For many FITL operations, the first decision is "choose a target zone" with
domain determined by a token query + zone filter. The zone filter depends on
game state (which zones have qualifying tokens), but the STRUCTURE of the query
is fixed.

This is analogous to **query pushdown** in database engines: instead of
executing the full query plan and filtering results at the end, push the filter
as close to the data source as possible.

## Objective

At `createGameDefRuntime` time, statically analyze each pipeline action's effect
tree to extract the "first-decision-domain function" — a compiled closure that
directly queries game state for the first decision's option domain WITHOUT
executing the preceding effect chain.

When the first-decision-domain function returns a non-empty result, the decision
sequence is admissible. When it returns empty, the action has no legal options
and can be skipped.

## Design

### Static Analysis Phase

For each pipeline action, walk the effect AST from root to find the first
`chooseOne` or `chooseN` node. The walk follows the "always taken" path:

```
effects[0] → effects[1] → ... → effects[N]
  │
  ├── if: take BOTH branches (first decision in either counts)
  │     ├── then[0] → then[1] → ...
  │     └── else[0] → else[1] → ...
  │
  ├── forEach: first decision inside the forEach body
  │     └── forEach.effects[0] → ...
  │
  ├── let: walk into let.in
  │     └── let.in[0] → ...
  │
  ├── chooseOne: FOUND — extract options query
  ├── chooseN: FOUND — extract options query
  │
  └── setVar/moveToken/etc.: no decision — continue to next effect
```

### Compilation Output

```typescript
interface FirstDecisionDomainResult {
  /** Whether the compiled function can evaluate this action's first decision. */
  readonly compilable: boolean;
  /** When compilable, the direct domain check function. */
  readonly check?: (state: GameState, activePlayer: PlayerId) => boolean;
  /** Human-readable description of what was compiled (for diagnostics). */
  readonly description?: string;
}
```

The `check` function returns `true` if the first decision has at least one legal
option (admissible), `false` if empty (not admissible).

### Compilable Patterns

#### Pattern 1: Direct token query domain

The first decision is `chooseOne` with options query `{ query: 'tokens', ... }`.
The compiled function resolves the token query directly against game state.

```yaml
# Effect tree: chooseOne { options: { query: 'tokens', zone: 'provinces:active', ... } }
# Compiles to: (state, player) => tokenQueryHasResults(state, querySpec, player)
```

#### Pattern 2: Guard condition + token query

The first decision is preceded by an `if` guard. The compiled function evaluates
the guard condition (via Spec 90 compiled conditions) and, if passed, checks the
token query domain.

```yaml
# Effect tree: if { when: condition } → then: [chooseOne { options: ... }]
# Compiles to: (state, player) => compiledCondition(state, player) && tokenQueryHasResults(...)
```

#### Pattern 3: ForEach zone iteration + nested decision

The first decision is inside a `forEach` over zones. The compiled function
checks if ANY zone in the iteration produces a non-empty decision domain.

```yaml
# Effect tree: forEach { query: zones, effects: [chooseOne { options: ... }] }
# Compiles to: (state, player) => zones.some(zone => tokenQueryHasResults(state, querySpec, zone))
```

#### Fallback

Actions whose first-decision path doesn't match any compilable pattern fall
through to the existing `legalChoicesDiscover` interpreter.

### Integration Point

In `enumerateRawLegalMoves`, the admission check for pipeline actions
(legal-moves.ts ~line 1287) currently calls
`isMoveDecisionSequenceAdmittedForLegalMove`. The compiled first-decision-domain
function would be checked BEFORE this call:

```typescript
// Try compiled first-decision-domain check
const domainCheck = getCompiledFirstDecisionDomain(def, action.id);
if (domainCheck !== undefined) {
  if (!domainCheck(state, state.activePlayer)) {
    continue; // No legal options — skip without partial effect execution
  }
  // Domain has options — still need full admission check for multi-step sequences
  // OR: if the action has exactly 1 decision, the domain check IS the admission check
}
```

**Critical consideration**: The compiled domain check replaces the
`legalChoicesDiscover` call ONLY for actions where the first decision IS the
admission gate. For actions with multiple decision steps, the compiled check
confirms the first decision has options, but subsequent decisions still need the
full admission check. The spec must define precisely when the compiled check
is sufficient vs. when the full check is still needed.

### Sufficiency Analysis

The admission check (`isMoveDecisionSequenceAdmittedForLegalMove`) returns
`true` if the classification is NOT `unsatisfiable`. Classification is:
- `satisfiable` — all decisions have options and the sequence completes
- `unknown` — evaluation hit a missing binding or deferred predicate
- `unsatisfiable` — a decision has 0 options

For the first decision, if the compiled domain check returns non-empty, the
first decision is satisfiable. But subsequent decisions might be unsatisfiable.

**Safe optimization**: use the compiled domain check as a **fast rejection
filter** only. If the first decision has 0 options → skip (same as current).
If non-empty → still call the full admission check (but the discovery cache
from Spec 87 will have the first-decision result cached, making subsequent
steps cheaper).

**Aggressive optimization** (future): for actions with exactly 1 decision in
the effect tree, the compiled domain check IS the admission check. No fallback
needed.

### V8 Safety Analysis

- The compiled closures are called from `enumerateRawLegalMoves` — the
  top-level enumeration function. From the campaign, this function already has
  complex control flow (earlyExitAfterFirst, trivial action checks, pipeline
  dispatch). Adding one more conditional is a LOW-RISK change because:
  1. The condition is a FUNCTION CALL (not a new branch pattern), which V8
     handles efficiently
  2. The condition is checked BEFORE the expensive `isMoveDecisionSequenceAdmittedForLegalMove`
     call — it's a guard, not a restructuring
- No fields added to GameDefRuntime (stored in module-level WeakMap)
- No changes to any kernel computation function
- No changes to the effect execution pipeline

## FOUNDATIONS Alignment

| Foundation | Alignment |
|-----------|-----------|
| F1 (Agnosticism) | Static analysis operates on generic EffectAST/ConditionAST — no game-specific patterns. Any action with a compilable first-decision structure benefits. |
| F5 (Determinism) | Compiled domain checks are pure functions of state, producing identical results to the interpreter. |
| F6 (Bounded Computation) | Static analysis is bounded by the finite effect tree depth. Compiled functions execute bounded queries (same as interpreter). |
| F7 (Immutability) | Compiled closures are read-only. Cache is populated once per GameDef. |
| F8 (Compiler-Kernel Boundary) | The static analysis operates at KERNEL level (on compiled EffectASTs from GameDef), not at COMPILER level (on GameSpecDoc YAML). This is an optimization of kernel evaluation, not a compiler change. |
| F10 (Completeness) | Addresses root cause (expensive partial effect execution for admission checks) rather than symptom. |
| F11 (Testing as Proof) | Equivalence test: for every compilable action, verify compiled domain check agrees with interpreter admission result across N random states. |

## Acceptance Criteria

1. Static analysis correctly identifies the first `chooseOne`/`chooseN` node in
   each pipeline action's effect tree.
2. Compiled domain check functions produce identical admissibility results to
   `isMoveDecisionSequenceAdmittedForLegalMove` for all game states (proven by
   equivalence test).
3. Actions with non-compilable first-decision patterns fall through to the
   existing interpreter without error.
4. No fields added to GameDefRuntime or any hot-path object.
5. All existing tests pass without weakening assertions.
6. Performance benchmark shows measurable reduction in `legalMoves` time.

## Estimated Impact

**Conservative estimate: 10-25% reduction in total benchmark time.**

Decision sequence admission accounts for ~47% of total runtime. If 50-70% of
FITL pipeline actions have compilable first-decision patterns, and the compiled
check is 10-50x faster than partial effect execution (direct state query vs.
full interpreter chain), the admission cost drops significantly.

Even as a FAST REJECTION FILTER only (skipping actions with 0 first-decision
options), the savings are proportional to the fraction of pipeline actions that
are rejected per `legalMoves` call. For FITL where many operations are
state-dependent (not all operations are legal in every state), a significant
fraction of the 20 pipeline actions are rejected — each rejection saves ~5ms
of partial effect execution.

## Files to Create

- `packages/engine/src/kernel/first-decision-analysis.ts` — static analysis of
  effect trees to find first decision point
- `packages/engine/src/kernel/first-decision-compiler.ts` — compiles
  first-decision domain checks into closures
- `packages/engine/src/kernel/first-decision-cache.ts` — WeakMap cache for
  compiled domain checks

## Files to Modify

- `packages/engine/src/kernel/legal-moves.ts` — add compiled domain check
  before `isMoveDecisionSequenceAdmittedForLegalMove`
- `packages/engine/test/unit/` — add equivalence tests
- `packages/engine/test/integration/` — add benchmark test

## Risks

- **False negatives**: The compiled domain check might determine "no options"
  when the interpreter would find options (due to bindings or runtime context
  not captured by the static analysis). Mitigation: start with the fast-rejection-
  only strategy — a false positive (compiled says "has options" but interpreter
  rejects) is safe, while a false negative (compiled says "no options" but
  interpreter would accept) would incorrectly filter legal moves. The
  equivalence test must prove zero false negatives.
- **Compilation coverage**: Some FITL operations have deeply nested effect trees
  with multiple guard conditions before the first decision. These may not match
  any compilable pattern, limiting the optimization's coverage. This can be
  iteratively improved by adding more patterns to the compiler.
