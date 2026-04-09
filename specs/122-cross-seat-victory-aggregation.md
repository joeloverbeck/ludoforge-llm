# Spec 122: Cross-Seat Victory Aggregation

**Status**: Draft
**Priority**: P2
**Complexity**: M
**Dependencies**: Spec 15 (GameSpec Authored Agent Policy IR)
**Source**: `fitl-arvn-agent-evolution` campaign (April 2026) — inability to express generic opponent-aware defensive play without hardcoding per-seat features

## Overview

Add a `seatAgg` expression operator to the Agent Policy DSL that aggregates a numeric expression across game seats. This enables game-agnostic opponent awareness — policies can express "nearest opponent to victory", "average opponent margin", or "how much does this move hurt the leading threat" without hardcoding seat names or knowing how many opponents exist.

## Problem Statement

The Agent DSL has three aggregation operator families:

| Operator | Aggregates across | Example |
|----------|------------------|---------|
| `globalTokenAgg` | All tokens on the board | "Count VC guerrillas" |
| `globalZoneAgg` | All zones matching a filter | "Sum population in provinces" |
| `candidateAggregates` | All candidates at a decision | "Max projected margin among moves" |

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
- Support standard aggregation operations: `min`, `max`, `sum`, `count`, `avg`.
- Support seat filtering: `opponents` (all non-self seats), `allies` (same-team, future), `all`, or explicit seat list.
- Make the operator usable in `stateFeatures`, `candidateFeatures`, and `when` clauses.
- Maintain game-agnosticism: the operator iterates over seats defined in the GameDef, not hardcoded names.
- Maintain determinism: iteration order is the canonical seat order from `GameDef.seats`.

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
  aggOp: max               # "min" | "max" | "sum" | "count" | "avg"
```

The `$seat` token in reference paths resolves to each seat in the iteration set. This is analogous to how `self` resolves to the acting player's seat.

### Seat filter values

| Filter | Resolves to |
|--------|-------------|
| `opponents` | All seats in `GameDef.seats` except the acting player's seat |
| `all` | All seats in `GameDef.seats` |
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

The `seatAgg` operator compiles to a `CompiledAgentPolicyExpr` node:

```typescript
interface SeatAggExpr {
  readonly op: 'seatAgg';
  readonly over: 'opponents' | 'all' | readonly string[];  // resolved seat IDs
  readonly expr: CompiledAgentPolicyExpr;  // expression with $seat placeholder
  readonly aggOp: 'min' | 'max' | 'sum' | 'count' | 'avg';
}
```

At compile time:
- `opponents` resolves to `GameDef.seats.filter(s => s.id !== bindingSeat).map(s => s.id)` — the concrete seat list minus the profile's bound seat.
- Explicit seat lists are validated against `GameDef.seats`.
- The `$seat` placeholder in `expr` is compiled as a seat-context variable, resolved at evaluation time per iteration.

## Changes Required

### Compiler: `packages/engine/src/cnl/compile-agents.ts`

- Add `seatAgg` to the expression compiler.
- Validate `over` filter values against declared seats.
- Validate `aggOp` is one of the supported operations.
- Resolve `$seat` placeholders to a seat-context binding.

### Compiler: `packages/engine/src/cnl/validate-agents.ts`

- Add validation for `seatAgg` expressions: valid `over`, valid `aggOp`, `expr` must be a valid expression.
- Static check: `$seat` must only appear in reference paths within `seatAgg.expr`.

### Evaluator: `packages/engine/src/agents/policy-expr.ts`

- Add evaluation case for `seatAgg`:
  ```
  For each seat in resolved over set:
    Bind $seat to current seat ID
    Evaluate expr in the seat-bound context
    Collect result
  Apply aggOp to collected results
  Return aggregated value
  ```
- The seat-bound context uses the same `PolicyEvaluationContext` but with `seatContext` set to the iterated seat ID, so `victory.currentMargin.$seat` resolves correctly.

### Policy surface: `packages/engine/src/agents/policy-surface.ts`

- Add `$seat` as a recognized seat-context token alongside `self` and `active`.
- When `$seat` is encountered and no seat context is bound, return `undefined` (compile-time error if used outside `seatAgg`).

### Types: `packages/engine/src/kernel/types.ts`

- Add `SeatAggExpr` to the `AgentPolicyExpr` union.

### Schema: `packages/engine/schemas/`

- Add `seatAgg` to the agent expression schema.

## Testing Strategy

### Unit tests

1. **Basic aggregation**: `seatAgg { over: opponents, expr: margin, aggOp: max }` returns the highest opponent margin.
2. **All filters**: `opponents`, `all`, explicit list — each produces the correct seat set.
3. **All aggOps**: `min`, `max`, `sum`, `count`, `avg` — each computes correctly.
4. **Preview context**: `seatAgg` with `preview.victory.currentMargin.$seat` works in `candidateFeatures`.
5. **Nested expressions**: `seatAgg` with arithmetic/boolean inner expressions compiles and evaluates.
6. **Empty opponent set**: 1-player game → `opponents` is empty → `max` returns -Infinity (or configured default).
7. **Compile-time validation**: `$seat` outside `seatAgg` → compile error. Invalid seat names in explicit list → compile error.

### Integration tests

8. **FITL 4-player**: Create an ARVN profile using `seatAgg` for defensive scoring. Verify it compiles, evaluates, and produces game-agnostic opponent awareness.
9. **Texas Hold'em**: Verify `seatAgg` works with a symmetric game (all seats equivalent).

### Golden tests

10. Update schema artifacts to include `seatAgg` expressions.

## FOUNDATIONS Alignment

- **Foundation 1 (Engine Agnosticism)**: `seatAgg` is game-agnostic — it iterates over whatever seats the GameDef declares. No game-specific seat names in engine code.
- **Foundation 2 (Evolution-First)**: LLM evolution can discover opponent-aware strategies by adding `seatAgg` expressions to the mutable policy YAML. No need to know seat names at authoring time if using `opponents` filter.
- **Foundation 7 (Specs Are Data)**: `seatAgg` is a declarative expression operator, not executable code. It compiles to pure data in the IR.
- **Foundation 8 (Determinism)**: Iteration order follows `GameDef.seats` canonical order. Same input → same aggregated result.
- **Foundation 10 (Bounded Computation)**: Iteration is bounded by the finite seat count (typically 2-8). No unbounded recursion.
- **Foundation 12 (Compiler-Kernel Boundary)**: Seat list validation happens at compile time. Runtime only evaluates pre-validated expressions.
- **Foundation 15 (Architectural Completeness)**: Fills the gap in the aggregation operator family — tokens, zones, candidates, and now seats all have first-class aggregation.

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
