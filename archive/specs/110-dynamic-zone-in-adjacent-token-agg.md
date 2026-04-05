# Spec 110 — Dynamic Zone Context in adjacentTokenAgg

## Status

✅ COMPLETED

## Priority

Medium

## Complexity

Small

## Dependencies

None.

## Problem

The `adjacentTokenAgg` operator in the Agent Policy DSL requires a hardcoded string for `anchorZone` — it cannot accept a policy expression like `{ ref: candidate.param.targetSpace }` or `{ ref: option.value }`. This prevents agents from dynamically evaluating "how many enemy tokens are adjacent to THIS target zone" for each candidate move.

The sibling operators `zoneProp` and `zoneTokenAgg` already accept expressions for their `zone` parameter (via `analyzeZoneSource` at `policy-expr.ts:854-890`). The runtime evaluation of `adjacentTokenAgg` (`policy-evaluation-core.ts:637`) already calls `resolvePolicyZoneId` with the candidate context — it would work with expression-resolved zones. The gap is purely in the **compiler's validation** (`policy-expr.ts:1194`), which rejects non-string values for `anchorZone`.

### Impact

Without this fix, agents cannot write generic threat-assessment features like:

```yaml
candidateFeatures:
  enemyTroopsNearTarget:
    type: number
    expr:
      adjacentTokenAgg:
        anchorZone: { ref: candidate.param.targetSpace }   # FAILS: requires string
        aggOp: count
        tokenFilter:
          props:
            faction: { eq: US }
            type: { eq: troops }
```

Instead, agents must pre-compute a fixed set of zone-specific features (`threatNearSaigon`, `threatNearHue`, etc.), which is incomplete (can't cover all zones) and rigid (doesn't adapt to new games).

## Goals

1. Allow `adjacentTokenAgg.anchorZone` to accept policy expressions (refs, intrinsics, computed values) in addition to literal zone ID strings
2. Align `adjacentTokenAgg` with the existing pattern used by `zoneProp.zone` and `zoneTokenAgg.zone`
3. Update the agent DSL cookbook with the new capability

## Non-Goals

- No changes to `zoneProp` or `zoneTokenAgg` (they already support expressions)
- No new operators
- No runtime changes (the runtime already handles expression-resolved zones)

## FOUNDATIONS Alignment

| Foundation | Alignment |
|-----------|-----------|
| 1 — Engine Agnosticism | Generic DSL fix — applies to any game with spatial adjacency, not game-specific |
| 8 — Determinism | Expression evaluation is deterministic; same expression + same state = same zone ID |
| 14 — No Backwards Compat | Existing string literals continue to work; expressions are additive |
| 15 — Architectural Completeness | Aligns `adjacentTokenAgg` with the pattern already used by sibling operators |

## Scope

### What to Change

**1. Update `analyzeAdjacentTokenAggOperator` in `policy-expr.ts`**

Replace the string-only validation for `anchorZone` (lines 1189-1200) with a call to `analyzeZoneSource` (the same function used by `zoneProp` and `zoneTokenAgg`):

```typescript
// Before (line 1194):
if (typeof anchorZone !== 'string' || anchorZone.length === 0) { ... }

// After:
const zoneSource = analyzeZoneSource(
  anchorZone, context, diagnostics,
  `${path}.adjacentTokenAgg.anchorZone`, 'adjacentTokenAgg'
);
```

Note: `analyzeZoneSource` at `policy-expr.ts:859` currently accepts `operatorName: 'zoneProp' | 'zoneTokenAgg'`. Extend the union to `'zoneProp' | 'zoneTokenAgg' | 'adjacentTokenAgg'`.

**2. Update the compiled expression type**

Change `anchorZone: string` to `anchorZone: AgentPolicyZoneSource` at `types-core.ts:484`. The existing type alias `AgentPolicyZoneSource = string | AgentPolicyExpr` (types-core.ts:417) is already used by `zoneProp.zone` and `zoneTokenAgg.zone`.

**3. Update the cookbook**

Add an example to `docs/agent-dsl-cookbook.md` showing dynamic zone usage in `adjacentTokenAgg`:

```yaml
candidateFeatures:
  enemyTroopsNearTarget:
    type: number
    expr:
      adjacentTokenAgg:
        anchorZone: { ref: candidate.param.targetSpace }
        aggOp: count
        tokenFilter:
          props:
            faction: { eq: US }
            type: { eq: troops }
```

### Mutable Files

- `packages/engine/src/agents/policy-expr.ts` (modify) — `analyzeAdjacentTokenAggOperator` validation
- `packages/engine/src/kernel/types-core.ts` (modify) — compiled `adjacentTokenAgg` expression type (if `anchorZone` is typed as `string`)
- `docs/agent-dsl-cookbook.md` (modify) — add dynamic zone example

### Immutable

- `packages/engine/src/agents/policy-evaluation-core.ts` — runtime already handles expression-resolved zones
- `packages/engine/src/kernel/resolve-zone-ref.ts` — zone resolution already works
- Game spec data

## Testing Strategy

1. **Unit test: dynamic anchorZone compiles** — Write a candidateFeature using `adjacentTokenAgg` with `anchorZone: { ref: candidate.param.targetSpace }`. Assert it compiles without errors.

2. **Unit test: dynamic anchorZone evaluates correctly** — Create a game state with adjacent zones, evaluate the feature for candidates with different `targetSpace` params. Assert different adjacency counts.

3. **Unit test: string anchorZone still works** — Existing hardcoded-string usage continues to compile and evaluate (regression).

4. **Integration test: FITL agent with dynamic adjacency** — Add a `enemyTroopsNearTarget` candidateFeature to a FITL agent profile. Run a game evaluation and verify the feature produces different values for different target zones.

## Expected Impact

Enables generic threat-assessment features that work across all zones without hardcoding. Agents can evaluate "is this target zone safe?" dynamically per candidate, unlocking a major dimension of strategic reasoning for zone-targeting decisions.

## Outcome

Completed on 2026-04-05.

What changed:
- `110DYNZONINADJ-001` widened `adjacentTokenAgg.anchorZone` to the shared dynamic zone-source shape in the engine compiler/types/schema path.
- `110DYNZONINADJ-002` updated [agent-dsl-cookbook.md](/home/joeloverbeck/projects/ludoforge-llm/docs/agent-dsl-cookbook.md) with a dynamic `adjacentTokenAgg` example and a matching common-pattern snippet.

Deviations from the original plan:
- The runtime path already handled expression-resolved anchor zones, so the implementation stayed on the compiler/types/schema surface.
- The cookbook update landed in the existing owning sections rather than creating any new doc structure.

Verification:
- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine run schema:artifacts`
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo test`
- direct inspection of the updated cookbook sections
- `pnpm run check:ticket-deps`
