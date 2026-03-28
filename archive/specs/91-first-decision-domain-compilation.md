# Spec 91 — First-Decision-Domain Compilation

**Status**: ✅ COMPLETED
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
partially executes the action's effect tree up to the first
`chooseOne`/`chooseN` node, evaluating conditions, forEach iterations, and
token queries along the way.

### Profiling Evidence

From the `fitl-perf-optimization` campaign (12 experiments, FITL benchmark):

- `legalMoves`: 86,127ms (76.3% of 112,827ms total)
- 96% of legalMoves is enumeration (~82,700ms)
- Decision sequence admission probing is estimated at ~55,000ms (47% of total)
- Each probe: ~5ms per pipeline action × 20 actions × 600 legalMoves calls

The partial effect execution involves:
1. Creating an effect execution context (EffectEnv + EffectCursor)
2. Executing the stage's effects sequentially until a `chooseOne` or
   `chooseN` node is encountered
3. At the choice node: resolving the options query to determine the domain
4. Returning the choice request with the resolved domain

**Clarification on pipeline actions**: For pipeline actions, `costEffects` are
NOT executed during discovery. The pipeline-level and stage-level predicates
(`legality`, `costValidation`) are evaluated instead — and these are already
compiled into fast boolean predicates by Spec 90. The remaining overhead is in
step 2: executing `stage.effects` up to the first choice node via the AST
interpreter. This is the target of this optimization.

**Non-pipeline actions**: For plain actions and event card actions, the
discovery path executes `action.effects` (or the resolved event effect list)
through the same interpreter. The same overhead applies — the interpreter walks
through effects sequentially until it hits a choice node.

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

At `createGameDefRuntime` time, statically analyze each action's effect tree to
extract the "first-decision-domain function" — a compiled closure that directly
queries game state for the first decision's option domain WITHOUT executing the
preceding effect chain.

When the first-decision-domain function returns a non-empty domain, the decision
sequence is admissible. When it returns empty, the action has no legal options
and can be skipped.

**Scope**: All three admission check call sites in `legal-moves.ts`:
1. Plain action feasibility probe (~line 480)
2. Event card decision sequence validation (~line 1097)
3. Pipeline action decision sequence validation (~line 1287)

The analysis/compiler operates on generic `EffectAST[]` and is agnostic to the
call site context (F1). Each call site wraps the compiled check with the same
guard pattern.

## Design

### Effect Tree Walk Order

The static analysis must account for the structural differences between action
types:

**Pipeline actions** (`pipelineDispatch.kind === 'matched'`):
- Pipeline predicates (`legality`, `costValidation`) are already compiled by
  Spec 90 and evaluated before stage effects. These are NOT walked by this spec.
- `pipeline.costEffects` are execution-only — NOT executed during discovery.
  They are irrelevant to this optimization.
- Walk order: `stages[0].effects → stages[1].effects → ... → stages[N].effects`
- The first `chooseOne`/`chooseN` encountered in this walk is the first
  decision point.

**Plain actions** (no pipeline match):
- Walk `action.effects` directly.
- Precondition (`action.pre`) is evaluated before effects. It is a
  `ConditionAST` — if compilable by Spec 90, it can be composed with the
  first-decision check.

**Event card actions** (`isCardEventActionId`):
- The discovery path resolves event effects via `resolveEventEffectList`, then
  walks the resolved effect list.
- Event effects are resolved at runtime (depend on which card is active), so
  static analysis is limited. These MAY fall through to the interpreter.

### Static Analysis Phase

For each action, walk the effect AST from root to find the first
`chooseOne` or `chooseN` node. The walk follows the "always taken" path:

```
effects[0] → effects[1] → ... → effects[N]
  │
  ├── if (_k: 28): take BOTH branches (first decision in either counts)
  │     ├── then[0] → then[1] → ...
  │     └── else[0] → else[1] → ...
  │
  ├── forEach (_k: 29): first decision inside the forEach body
  │     └── forEach.effects[0] → ...
  │
  ├── let (_k: 32): walk into let.in
  │     └── let.in[0] → ...
  │
  ├── evaluateSubset (_k: 33): walk into evaluateSubset.effects
  │     └── evaluateSubset.effects[0] → ...
  │
  ├── reduce (_k: 30): walk into reduce.effects
  │     └── reduce.effects[0] → ...
  │
  ├── chooseOne (_k: 15): FOUND — extract options query
  ├── chooseN (_k: 16): FOUND — extract options query
  │
  └── setVar/addVar/moveToken/etc.: no decision — continue to next effect
```

For pipeline actions with multiple stages, the walk proceeds through stages in
order: if `stages[0].effects` contains no decision, continue to
`stages[1].effects`, etc. Stage predicates (legality, costValidation) are
pre-filters — if a stage predicate is a compiled Spec 90 predicate, compose it
with the first-decision check.

### Compilation Output

```typescript
interface FirstDecisionDomainResult {
  /** Whether the compiled function can evaluate this action's first decision. */
  readonly compilable: boolean;
  /**
   * When compilable, the direct domain check function.
   * Returns { admissible: true, domain } when the first decision has options.
   * Returns { admissible: false } when the first decision has 0 options.
   * For single-decision actions, `domain` contains the actual ChoiceOption[],
   * enabling complete bypass of the discovery call.
   * For multi-decision actions, `domain` is undefined — the boolean result
   * serves as a fast rejection filter only.
   */
  readonly check?: (
    state: GameState,
    activePlayer: PlayerId,
  ) => FirstDecisionCheckResult;
  /** Human-readable description of what was compiled (for diagnostics). */
  readonly description?: string;
  /** Whether this action has exactly 1 decision (aggressive optimization). */
  readonly isSingleDecision?: boolean;
}

interface FirstDecisionCheckResult {
  readonly admissible: boolean;
  /** Populated only for single-decision actions. */
  readonly domain?: readonly ChoiceOption[];
}
```

### Compilable Patterns

#### Pattern 1: Direct token query domain

The first decision is `chooseOne` with options query `{ query: 'tokensInZone', ... }`.
The compiled function resolves the token query directly against game state.

```yaml
# Effect tree: chooseOne { options: { query: 'tokensInZone', zone: 'provinces:active', ... } }
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

#### Pattern 3: ForEach iteration + nested decision

The first decision is inside a `forEach` over zones or tokens. The compiled
function checks if ANY element in the iteration produces a non-empty decision
domain.

```yaml
# Effect tree: forEach { query: zones, effects: [chooseOne { options: ... }] }
# Compiles to: (state, player) => elements.some(el => tokenQueryHasResults(state, querySpec, el))
```

#### Pattern 4: Zone query domain

The first decision is `chooseOne` with options query `{ query: 'zones', ... }`
or `{ query: 'mapSpaces', ... }`. The compiled function resolves the zone query
with any filter conditions.

```yaml
# Effect tree: chooseOne { options: { query: 'zones', filter: { condition: ... } } }
# Compiles to: (state, player) => zoneQueryHasResults(state, filter, player)
```

#### Pattern 5: Enum/range domain (always non-empty)

The first decision is `chooseOne` with a static domain (`{ query: 'enums', ... }`
or `{ query: 'intsInRange', ... }` with literal bounds). The compiled function
returns `true` unconditionally (domain is always non-empty).

```yaml
# Effect tree: chooseOne { options: { query: 'enums', values: ['a', 'b', 'c'] } }
# Compiles to: () => true
```

#### Fallback

Actions whose first-decision path doesn't match any compilable pattern fall
through to the existing `legalChoicesDiscover` interpreter.

### Integration Points

The admission check is called at three sites in `legal-moves.ts`. Each site
gets the same guard pattern:

#### Site 1: Pipeline actions (~line 1287)

```typescript
// Before: always calls isMoveDecisionSequenceAdmittedForLegalMove
// After:
const domainResult = getCompiledFirstDecisionDomain(def, action.id);
if (domainResult !== undefined) {
  const checkResult = domainResult.check(state, state.activePlayer);
  if (!checkResult.admissible) {
    continue; // Fast rejection — no legal options
  }
  if (domainResult.isSingleDecision && checkResult.domain !== undefined) {
    // Single-decision action: domain check IS the admission check.
    // Emit the move directly without calling legalChoicesDiscover.
    // ...
    continue;
  }
  // Multi-decision action: first decision has options, but subsequent
  // decisions still need the full admission check.
}
// Fall through to existing isMoveDecisionSequenceAdmittedForLegalMove
```

#### Site 2: Plain actions (~line 480)

Same pattern. The compiled check operates on `action.effects`.

#### Site 3: Event card actions (~line 1097)

For event cards, the effect tree is resolved at runtime (depends on the active
card). Static analysis at `createGameDefRuntime` time cannot pre-compile event
effects because the card varies per game state. These fall through to the
existing interpreter unless a per-card cache is added (out of scope for v1).

**Revised scope for event cards**: Event card admission checks fall through to
the interpreter. The optimization targets pipeline and plain actions, which
account for the vast majority of the admission check cost.

### Sufficiency Analysis

The admission check (`isMoveDecisionSequenceAdmittedForLegalMove`) returns
`true` if the classification is NOT `unsatisfiable`. Classification is:
- `satisfiable` — all decisions have options and the sequence completes
- `unknown` — evaluation hit a missing binding or deferred predicate
- `unsatisfiable` — a decision has 0 options

**Fast rejection filter** (multi-decision actions): If the compiled first-
decision check returns `admissible: false`, the action is `unsatisfiable` —
skip it. If `admissible: true`, fall through to the full admission check. The
discovery cache will have the first-decision result, making subsequent steps
cheaper.

**Full bypass** (single-decision actions): If the action has exactly 1 decision
in the effect tree AND the compiled check returns `admissible: true` with a
populated `domain`, the action is `satisfiable`. No fallback needed — the
compiled domain IS the admission result. The `domain` can be used to construct
the `ChoiceRequest` directly without calling `legalChoicesDiscover`.

### V8 Safety Analysis

- The compiled closures are called from `enumerateRawLegalMoves` — the
  top-level enumeration function. From the campaign, this function already has
  complex control flow (earlyExitAfterFirst, trivial action checks, pipeline
  dispatch). Adding one more conditional is a LOW-RISK change because:
  1. The condition is a FUNCTION CALL (not a new branch pattern), which V8
     handles efficiently
  2. The condition is checked BEFORE the expensive
     `isMoveDecisionSequenceAdmittedForLegalMove` call — it's a guard, not a
     restructuring
- No fields added to GameDefRuntime (stored in module-level WeakMap)
- No changes to any kernel computation function
- No changes to the effect execution pipeline

## FOUNDATIONS Alignment

| Foundation | Alignment |
|-----------|-----------|
| F1 (Agnosticism) | Static analysis operates on generic EffectAST/ConditionAST — no game-specific patterns. Any action with a compilable first-decision structure benefits. All three call sites use the same compiler. |
| F5 (Determinism) | Compiled domain checks are pure functions of state, producing identical results to the interpreter. |
| F6 (Bounded Computation) | Static analysis is bounded by the finite effect tree depth. Compiled functions execute bounded queries (same as interpreter). |
| F7 (Immutability) | Compiled closures are read-only. Cache is populated once per GameDef and stored in an immutable ReadonlyMap. |
| F8 (Compiler-Kernel Boundary) | The static analysis operates at KERNEL level (on compiled EffectASTs from GameDef), not at COMPILER level (on GameSpecDoc YAML). This is an optimization of kernel evaluation, not a compiler change. |
| F9 (No Backwards Compat) | No shims or fallback paths. Actions that don't match a compilable pattern use the existing interpreter — this is the normal path, not a compatibility layer. |
| F10 (Completeness) | Addresses root cause (expensive partial effect execution for admission checks) across all applicable call sites. Event cards are excluded with explicit justification (runtime-resolved effect trees). |
| F11 (Testing as Proof) | Equivalence test: for every compilable action, verify compiled domain check agrees with interpreter admission result across N random states. |
| F12 (Branded Types) | ActionId used for cache keys, PlayerId in check function signature. |

## Acceptance Criteria

1. Static analysis correctly identifies the first `chooseOne`/`chooseN` node in
   each action's effect tree (pipeline stages walked in order, non-pipeline
   actions walked directly).
2. Compiled domain check functions produce identical admissibility results to
   `isMoveDecisionSequenceAdmittedForLegalMove` for all game states (proven by
   equivalence test).
3. For single-decision actions, the compiled domain matches the interpreter's
   `ChoiceRequest.options` exactly (proven by domain equivalence test).
4. Actions with non-compilable first-decision patterns fall through to the
   existing interpreter without error.
5. No fields added to GameDefRuntime or any hot-path object.
6. All existing tests pass without weakening assertions.
7. Performance benchmark shows measurable reduction in `legalMoves` time.

## Estimated Impact

**Conservative estimate: 10-25% reduction in total benchmark time.**

Decision sequence admission accounts for ~47% of total runtime. If 50-70% of
pipeline actions have compilable first-decision patterns, and the compiled check
is 10-50x faster than partial effect execution (direct state query vs. full
interpreter chain), the admission cost drops significantly.

**Single-decision bypass bonus**: Actions with exactly 1 decision skip both the
admission check AND the subsequent discovery call during move construction. This
compounds the savings for simple actions (which are common — many FITL operations
have a single "choose target zone" decision).

Even as a FAST REJECTION FILTER only (skipping actions with 0 first-decision
options), the savings are proportional to the fraction of pipeline actions that
are rejected per `legalMoves` call. For FITL where many operations are
state-dependent (not all operations are legal in every state), a significant
fraction of the 20 pipeline actions are rejected — each rejection saves ~5ms
of partial effect execution.

## Files to Create

- `packages/engine/src/kernel/first-decision-compiler.ts` — static analysis of
  effect trees to find first decision point + compilation of first-decision
  domain checks into closures
- `packages/engine/src/kernel/first-decision-cache.ts` — WeakMap cache for
  compiled domain checks + lookup API

## Files to Modify

- `packages/engine/src/kernel/legal-moves.ts` — add compiled domain check
  before `isMoveDecisionSequenceAdmittedForLegalMove` at all applicable call
  sites (pipeline ~line 1287, plain ~line 480; event cards fall through)
- `packages/engine/test/unit/kernel/` — add equivalence tests (compiled vs.
  interpreter admissibility) and domain equivalence tests (single-decision
  actions)
- `packages/engine/test/integration/` — add benchmark test

## Risks

- **False negatives**: The compiled domain check might determine "no options"
  when the interpreter would find options (due to bindings or runtime context
  not captured by the static analysis). Mitigation: start with the fast-
  rejection-only strategy for multi-decision actions. The equivalence test must
  prove zero false negatives across all compilable patterns.
- **Compilation coverage**: Some actions have deeply nested effect trees with
  multiple guard conditions before the first decision. These may not match any
  compilable pattern, limiting the optimization's coverage. This can be
  iteratively improved by adding more patterns to the compiler.
- **Single-decision domain fidelity**: For the aggressive optimization
  (single-decision bypass), the compiled domain must exactly match the
  interpreter's `ChoiceOption[]` format. Any divergence (missing options,
  wrong legality flags, missing metadata) would produce incorrect legal moves.
  Mitigation: domain equivalence test with comprehensive state coverage.
- **Event card limitation**: Event card effects are resolved at runtime, so
  static pre-compilation is not possible for the event call site. This limits
  the optimization to pipeline and plain actions. If event card admission
  becomes a bottleneck, a per-card cache could be added in a follow-up spec.

## Outcome

- Completion date: 2026-03-28
- What actually changed:
  - Added
    `packages/engine/src/kernel/first-decision-compiler.ts` and integrated its
    results into `GameDefRuntime.firstDecisionDomains` so first-decision
    compilation is owned by the runtime rather than a hidden cache layer.
  - Added first-decision walker/compiler unit coverage and FITL production
    parity coverage, including:
    `packages/engine/test/unit/kernel/first-decision-walker.test.ts`,
    `packages/engine/test/unit/kernel/first-decision-compiler.test.ts`,
    `packages/engine/test/integration/first-decision-runtime-parity.test.ts`,
    `packages/engine/test/helpers/first-decision-production-helpers.ts`, and
    `packages/engine/test/performance/first-decision-benchmark.test.ts`.
  - Integrated compiled first-decision checks into the real `legalMoves`
    boundary as additive early-rejection guards for plain-action feasibility
    probing and matched pipeline profile admission.
- Deviations from original plan:
  - The implemented architecture is narrower and cleaner than the original
    spec text in several places. It does not synthesize `ChoiceOption[]`,
    does not expose `domain` / `isSingleDecision`, and does not perform the
    proposed single-decision full bypass.
  - Event-card admission remained on the canonical interpreter path, which is
    now explicitly enforced by tests.
  - The runtime owns `firstDecisionDomains`; the spec’s proposed separate
    `first-decision-cache.ts` file was not introduced.
- Verification results:
  - FITL runtime parity tests passed with compiled first-decision guards
    enabled vs disabled.
  - FITL benchmark coverage and timing output were added and pass.
  - Engine test, lint, and typecheck verification passed during completion of
    the related implementation tickets.
