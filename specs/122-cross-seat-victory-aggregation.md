# Spec 122: Cross-Seat Victory Aggregation

**Status**: Draft
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 15 (GameSpec Authored Agent Policy IR)
**Source**: `fitl-arvn-agent-evolution` campaign (April 2026) — inability to express generic opponent-aware defensive play without hardcoding per-seat features

## Overview

Add a `seatAgg` expression operator to the Agent Policy DSL that aggregates a numeric expression across game seats. This enables game-agnostic opponent awareness — policies can express "nearest opponent to victory", "average opponent margin", or "how much does this move hurt the leading threat" without hardcoding seat names or knowing how many opponents exist.

## Problem Statement

The Agent DSL has five aggregation operator families:

| Operator | Aggregates across | Example |
|----------|------------------|---------|
| `zoneTokenAgg` | Tokens in a specific zone (with owner filtering) | "Count ARVN troops in Saigon" |
| `globalTokenAgg` | All tokens on the board (with zone/token filters) | "Count VC guerrillas" |
| `globalZoneAgg` | All zones matching a filter | "Sum population in provinces" |
| `adjacentTokenAgg` | Tokens in zones adjacent to an anchor zone | "Count troops near Hue" |
| `candidateAggregates` | All candidates at a decision (profile-level) | "Max projected margin among moves" |

None aggregates across **seats/players**. To express opponent awareness, a profile author must:

1. Create a `stateFeature` per opponent seat with a hardcoded seat name:
   ```yaml
   usMargin: { type: number, expr: { ref: victory.currentMargin.us } }
   nvaMargin: { type: number, expr: { ref: victory.currentMargin.nva } }
   vcMargin: { type: number, expr: { ref: victory.currentMargin.vc } }
   ```
2. Manually compute cross-seat aggregates using nested arithmetic:
   ```yaml
   maxOpponentMargin:
     type: number
     expr:
       max:
         - { ref: feature.usMargin }
         - max:
             - { ref: feature.nvaMargin }
             - { ref: feature.vcMargin }
   ```
3. Repeat for every game-specific seat configuration.

### Consequences

- **Verbosity**: 3 features + 1 nested aggregate for a 4-player game. 7 features + 1 deeply nested aggregate for an 8-player game.
- **Fragility**: Adding or removing a seat (e.g., a 5th faction variant of FITL) requires rewriting all opponent-aware features.
- **Game-specificity**: Seat names are hardcoded in the policy YAML. The same "defensive play" strategy cannot be reused across games with different seat counts or names.
- **Evolution-hostile**: LLM evolution cannot easily discover opponent-aware strategies because it must know the exact seat names and count to author the features.

### Evidence from campaign

The `fitl-arvn-agent-evolution` campaign could not express:
- "Detect which opponent is closest to winning and prefer moves that reduce their margin"
- "Evaluate all opponent margins and pick the action that hurts the leader most"
- "Scale defensive urgency by how close the nearest opponent is to victory"

These would have been natural strategies to try but were impractical with per-seat manual features.

## Goals

- Add a `seatAgg` expression operator that aggregates a numeric expression across seats.
- Support standard aggregation operations: `min`, `max`, `sum`, `count`.
- Support seat filtering: `opponents` (all non-self seats), `all`, or explicit seat list.
- Make the operator usable in `stateFeatures`, `candidateFeatures`, and `when` clauses.
- Maintain game-agnosticism: the operator iterates over seats defined in the GameDef, not hardcoded names.
- Maintain determinism: iteration order is the canonical seat order from `GameDef.seats`.

Note: `avg` is intentionally excluded from v1. Authors can compute it as `seatAgg(aggOp: sum) / seatAgg(aggOp: count)`. A future spec may add `avg` to the shared `AgentPolicyZoneTokenAggOp` type if demand warrants it.

## Non-Goals

- Per-seat looping constructs (forEach over seats). This spec adds aggregation, not iteration.
- Team/alliance mechanics. `allies` filtering is reserved for future team-based games and is not implemented in v1.
- Cross-seat token or zone aggregation (already covered by `globalTokenAgg`/`globalZoneAgg`).
- Modifying the `candidateAggregates` system (which aggregates across candidates, not seats).

## Authoring Surface

### `seatAgg` expression operator

```yaml
seatAgg:
  over: opponents          # seat filter: "opponents" | "all" | [explicit seat list]
  expr:                    # expression evaluated per-seat (seat becomes the resolution context)
    ref: victory.currentMargin.$seat
  aggOp: max               # "min" | "max" | "sum" | "count"
```

The `$seat` token in reference paths resolves to each seat in the iteration set. Note: `$seat` is a **novel placeholder pattern** in the Agent Policy DSL — existing aggregation operators (`globalTokenAgg`, `globalZoneAgg`, `adjacentTokenAgg`) use imperative iteration without placeholder variables. `$seat` is the first context-variable-based aggregation binding.

### Seat filter values

| Filter | Resolves to |
|--------|-------------|
| `opponents` | All seats in `GameDef.seats` except the acting player's seat (resolved at evaluation time) |
| `all` | All seats in `GameDef.seats` (resolved at evaluation time) |
| Explicit list: `[us, nva, vc]` | Named seats only (validated at compile time) |

### Usage in stateFeatures

```yaml
stateFeatures:
  # Maximum margin among opponents (nearest to winning)
  maxOpponentMargin:
    type: number
    expr:
      seatAgg:
        over: opponents
        expr: { ref: victory.currentMargin.$seat }
        aggOp: max

  # Count opponents with positive margin (winning)
  opponentsAhead:
    type: number
    expr:
      seatAgg:
        over: opponents
        expr:
          boolToNumber:
            gt:
              - { ref: victory.currentMargin.$seat }
              - 0
        aggOp: sum
```

### Usage in candidateFeatures (with preview)

```yaml
candidateFeatures:
  # How much does this move reduce the leading opponent's projected margin?
  bestDefensiveImpact:
    type: number
    expr:
      sub:
        - seatAgg:
            over: opponents
            expr: { ref: victory.currentMargin.$seat }
            aggOp: max
        - coalesce:
            - seatAgg:
                over: opponents
                expr: { ref: preview.victory.currentMargin.$seat }
                aggOp: max
            - seatAgg:
                over: opponents
                expr: { ref: victory.currentMargin.$seat }
                aggOp: max
```

### Usage in when clauses

```yaml
considerations:
  defensiveWhenThreatened:
    scopes: [move]
    when:
      gt:
        - seatAgg:
            over: opponents
            expr: { ref: victory.currentMargin.$seat }
            aggOp: max
        - -5
    weight: 3
    value:
      ref: feature.bestDefensiveImpact
```

## Compiled IR

The `seatAgg` operator compiles to a new variant in the `AgentPolicyExpr` union (types-core.ts:443):

```typescript
// New variant added to the AgentPolicyExpr union type
| {
    readonly kind: 'seatAgg';
    readonly over: 'opponents' | 'all' | readonly string[];
    readonly expr: AgentPolicyExpr;  // expression with $seat placeholder
    readonly aggOp: AgentPolicyZoneTokenAggOp;  // reuses existing 'sum' | 'count' | 'min' | 'max'
  }
```

Resolution timing:
- **`opponents` and `all`**: Stored as keyword strings in the IR. Resolved at **evaluation time** using the acting player's `seatId` from `CreatePolicyEvaluationContextInput`. `opponents` → `def.seats.filter(s => s.id !== context.seatId)`, `all` → `def.seats.map(s => s.id)`. This matches the existing "compile once, bind to seats" architecture — profiles are compiled once and bound to seats via `AgentPolicyCatalog.bindingsBySeat`. Runtime resolution ensures shared profiles (e.g., Texas Hold'em's single profile for all seats) work correctly.
- **Explicit seat lists**: Validated against `GameDef.seats` at compile time and stored as a frozen `readonly string[]` in the IR.
- The `$seat` placeholder in `expr` is compiled as a seat-context variable, resolved at evaluation time per iteration.

## Changes Required

### Compiler: `packages/engine/src/cnl/compile-agents.ts`

- Add `seatAgg` to the expression compiler.
- Validate `over` filter values: `opponents` and `all` are keywords (stored as-is); explicit seat lists are validated against declared seats.
- Validate `aggOp` is one of the supported operations (`sum`, `count`, `min`, `max`).
- Compile the inner `expr` with `$seat` recognized as a valid seat-context placeholder.
- Compilation must fail if `seatAgg` is used in a GameSpec where `GameDef.seats` is not defined.

### Validator: `packages/engine/src/cnl/validate-agents.ts`

- Add validation for `seatAgg` expressions: valid `over`, valid `aggOp`, `expr` must be a valid expression.
- Static check: `$seat` must only appear in reference paths within `seatAgg.expr`.

### Runtime evaluator: `packages/engine/src/agents/policy-evaluation-core.ts`

- Add evaluation case for `seatAgg` in the `evaluateExpr` switch (line 396):
  ```
  For each seat in resolved over set:
    Bind $seat to current seat ID (via a new seatContext field on PolicyEvaluationContext)
    Evaluate expr in the seat-bound context
    Collect result
  Apply aggOp to collected results
  Return aggregated value
  ```
- Add a `private currentSeatContext?: string` field to `PolicyEvaluationContext` to hold the iterated seat during aggregation. This mirrors the class's existing pattern for `activeState` and `currentCandidates`.
- The seat-bound context uses the same `PolicyEvaluationContext` but with `seatContext` set to the iterated seat ID, so `victory.currentMargin.$seat` resolves correctly.

### Static analyzer: `packages/engine/src/agents/policy-expr.ts`

- Add `seatAgg` to the `KnownOperator` union and `KNOWN_OPERATORS` set.
- Add an `analyzeSeatAggOperator()` function for compile-time dependency tracking (analogous to `analyzeGlobalTokenAggOperator()`).

### Policy surface: `packages/engine/src/agents/policy-surface.ts`

- Add `$seat` as a recognized seat-context token in `parseAuthoredPolicySurfaceRef()`. This is a **novel placeholder pattern** — no existing `$token` or `$zone` precedent exists. Implementation requires:
  - Recognizing `$seat` in the seat-token position of reference paths (e.g., `victory.currentMargin.$seat`).
  - Extending `resolvePolicyRoleSelector()` to resolve `$seat` using the seat-context binding from `PolicyEvaluationContext`.
- When `$seat` is encountered and no seat context is bound, return `undefined` (compile-time error if used outside `seatAgg`).

### Diagnostics: `packages/engine/src/agents/policy-diagnostics.ts`

- Add diagnostic output formatting for `seatAgg` expression nodes.

### Types: `packages/engine/src/kernel/types-core.ts`

- Add the `seatAgg` variant to the `AgentPolicyExpr` union type (line 443).

### Schema: `packages/engine/src/kernel/schemas-core.ts`

- Add `seatAgg` to the Zod discriminated union for `AgentPolicyExpr` schema validation.

### Generated schemas: `packages/engine/schemas/`

- Regenerate `GameDef.schema.json` and `Trace.schema.json` to include the new `seatAgg` variant.

## Blast Radius

### Source files (8 files)

| File | Change |
|------|--------|
| `kernel/types-core.ts` | Add `seatAgg` variant to `AgentPolicyExpr` union |
| `kernel/schemas-core.ts` | Add Zod schema for `seatAgg` variant |
| `cnl/compile-agents.ts` | Compile `seatAgg` from authored YAML to IR |
| `cnl/validate-agents.ts` | Validate `seatAgg` structure and `$seat` usage |
| `agents/policy-evaluation-core.ts` | Runtime evaluation with seat iteration and context binding |
| `agents/policy-expr.ts` | Static analysis and dependency tracking |
| `agents/policy-surface.ts` | `$seat` placeholder recognition and resolution |
| `agents/policy-diagnostics.ts` | Diagnostic output formatting |

### Test files (13+ files reference `AgentPolicyExpr`)

Existing test files that may need fixture updates when the union type changes:
- `test/unit/agents/policy-eval.test.ts`
- `test/unit/agents/policy-expr.test.ts`
- `test/unit/agents/policy-agent.test.ts`
- `test/unit/agents/factory.test.ts`
- `test/unit/compile-agents-authoring.test.ts`
- `test/unit/trace/policy-trace-events.test.ts`
- `test/unit/agents/policy-eval-strategic-condition.test.ts`
- `test/unit/agents/policy-eval-granted-op.test.ts`
- `test/unit/agents/completion-guidance-choice.test.ts`
- `test/unit/agents/completion-guidance-eval.test.ts`
- `test/unit/property/policy-visibility.test.ts`
- `test/unit/property/policy-aggregation.property.test.ts`
- `test/integration/agents/strategic-condition-e2e.test.ts`

New test suites will also be needed (see Testing Strategy).

## Testing Strategy

### Unit tests

1. **Basic aggregation**: `seatAgg { over: opponents, expr: margin, aggOp: max }` returns the highest opponent margin.
2. **All filters**: `opponents`, `all`, explicit list — each produces the correct seat set.
3. **All aggOps**: `min`, `max`, `sum`, `count` — each computes correctly.
4. **Preview context**: `seatAgg` with `preview.victory.currentMargin.$seat` works in `candidateFeatures`.
5. **Nested expressions**: `seatAgg` with arithmetic/boolean inner expressions compiles and evaluates.
6. **Empty opponent set**: 1-player game → `opponents` is empty → `count` returns 0, `sum` returns 0, `min`/`max` return `undefined` (consistent with existing aggregation empty-input semantics).
7. **Compile-time validation**: `$seat` outside `seatAgg` → compile error. Invalid seat names in explicit list → compile error. `seatAgg` used when `GameDef.seats` is undefined → compile error.

### Integration tests

8. **FITL 4-player**: Create an ARVN profile using `seatAgg` for defensive scoring. Verify it compiles, evaluates, and produces game-agnostic opponent awareness.
9. **Texas Hold'em shared profile**: Verify `seatAgg` works with a symmetric game where one profile is shared across all seats — the same compiled profile evaluating `opponents` should produce different seat sets depending on which seat is acting. (Verify test viability before committing — confirm Texas Hold'em agent profiles support this.)

### Golden tests

10. Update schema artifacts to include `seatAgg` expressions.

## FOUNDATIONS Alignment

- **Foundation 1 (Engine Agnosticism)**: `seatAgg` is game-agnostic — it iterates over whatever seats the GameDef declares. No game-specific seat names in engine code.
- **Foundation 2 (Evolution-First)**: LLM evolution can discover opponent-aware strategies by adding `seatAgg` expressions to the mutable policy YAML. No need to know seat names at authoring time if using `opponents` filter.
- **Foundation 7 (Specs Are Data)**: `seatAgg` is a declarative expression operator, not executable code. It compiles to pure data in the IR.
- **Foundation 8 (Determinism)**: Iteration order follows `GameDef.seats` canonical order. Same input → same aggregated result.
- **Foundation 10 (Bounded Computation)**: Iteration is bounded by the finite seat count (typically 2-8). No unbounded recursion.
- **Foundation 12 (Compiler-Kernel Boundary)**: The compiler validates `over` keywords and explicit seat lists against `GameDef.seats`. Runtime resolves `opponents`/`all` to concrete seat sets using the acting player's `seatId` — this is state-dependent semantics that belongs at evaluation time, consistent with the "compile once, bind to seats" architecture.
- **Foundation 15 (Architectural Completeness)**: Fills the gap in the aggregation operator family — tokens (zone/global/adjacent), zones, candidates, and now seats all have first-class aggregation.

## Appendix: Comparison with manual approach

### Before (manual per-seat features for FITL ARVN)

```yaml
# 3 features + 1 nested aggregate = 16 lines
stateFeatures:
  usMargin: { type: number, expr: { ref: victory.currentMargin.us } }
  nvaMargin: { type: number, expr: { ref: victory.currentMargin.nva } }
  vcMargin: { type: number, expr: { ref: victory.currentMargin.vc } }
  maxOpponentMargin:
    type: number
    expr: { max: [{ ref: feature.usMargin }, { max: [{ ref: feature.nvaMargin }, { ref: feature.vcMargin }] }] }
```

### After (seatAgg)

```yaml
# 1 feature = 5 lines, game-agnostic
stateFeatures:
  maxOpponentMargin:
    type: number
    expr:
      seatAgg: { over: opponents, expr: { ref: victory.currentMargin.$seat }, aggOp: max }
```
