---
name: reassess-agent-dsl-cookbook
description: Reassess docs/agent-dsl-cookbook.md against the current Agent DSL source code. Detects missing operators, stale syntax, and quality gaps. Use after DSL changes or before agent evolution campaigns.
---

# Reassess Agent DSL Cookbook

Validate `docs/agent-dsl-cookbook.md` against the actual Agent DSL source code. Identify missing operators, stale references, and quality gaps for LLM-driven agent evolution.

## Invocation

```
/reassess-agent-dsl-cookbook
```

No arguments — the cookbook path and DSL source files are fixed.

## Process

Follow these steps in order. Do not skip any step.

### Step 1: Mandatory Reads

Read ALL of these files:

1. **`docs/agent-dsl-cookbook.md`** — the cookbook to reassess
2. **DSL source-of-truth files** (hardcoded paths):
   - `packages/engine/src/agents/policy-expr.ts` — `KnownOperator` set (all expression operators)
   - `packages/engine/src/agents/policy-surface.ts` — reference path families (`var.*`, `victory.*`, `activeCard.*`, `metric.*`)
   - `packages/engine/src/contracts/policy-contract.ts` — valid enums (owner keywords, filter ops, zone scopes, aggregate ops, intrinsic names)
   - `packages/engine/src/cnl/compile-agents.ts` — intrinsic resolution (`candidate.*`, `decision.*`, `turn.*`, `seat.*`, `feature.*`, `aggregate.*`, `option.*`, `context.*`)

If any source file does not exist at the expected path, search for it (it may have been moved). Report the new location.

### Step 2: Extract DSL Truth from Source

From each source file, extract the complete set of DSL capabilities:

**From `policy-expr.ts`:**
- All values in `KnownOperator` type/set — these are every expression operator the DSL supports
- For each aggregation operator (`globalTokenAgg`, `globalZoneAgg`, `zoneTokenAgg`, `adjacentTokenAgg`), note the required and optional fields

**From `policy-surface.ts`:**
- All reference path families and their sub-paths (e.g., `var.global.<id>`, `var.player.self.<id>`, `activeCard.id`, `activeCard.hasTag.<tag>`, `activeCard.annotation.<side>.<metric>`)
- For each family, note what it returns (number, string, boolean)

**From `policy-contract.ts`:**
- `AGENT_POLICY_CANDIDATE_INTRINSICS` — valid candidate intrinsic names
- `AGENT_POLICY_DECISION_INTRINSICS` — valid decision intrinsic names
- `AGENT_POLICY_OPTION_INTRINSICS` — valid option intrinsic names
- `AGENT_POLICY_ZONE_TOKEN_AGG_OWNER_KEYWORDS` — valid owner values
- `AGENT_POLICY_ZONE_TOKEN_AGG_OPS` — valid aggregation operations
- `AGENT_POLICY_ZONE_FILTER_OPS` — valid comparison operators for zone filters
- `AGENT_POLICY_ZONE_SCOPES` — valid zone scope values
- `AGENT_POLICY_ZONE_AGG_SOURCES` — valid zone aggregation sources

**From `compile-agents.ts`:**
- All intrinsic reference paths resolved during compilation (`candidate.actionId`, `candidate.tag.<name>`, `candidate.param.<name>`, `candidate.tags`, `decision.type`, `turn.round`, `turn.phaseId`, `turn.stepId`, `seat.self`, `seat.active`, `context.kind`, etc.)
- All candidate aggregate operators (`any`, `all`, `count`, `min`, `max`, `rankDense`, `rankOrdinal`)
- Selection modes (`argmax`, `softmaxSample`, `weightedSample`)
- Preview modes (`disabled`, `tolerateStochastic`, `exactWorld`)

### Step 3: Compare Cookbook Against Source

For each DSL capability extracted in Step 2, check whether the cookbook documents it:

1. **Missing operators** — operators in `KnownOperator` not mentioned in the cookbook's Expression Operators Reference table
2. **Missing reference paths** — ref families in `policy-surface.ts` not documented (e.g., `activeCard.*`)
3. **Missing intrinsics** — intrinsics from `compile-agents.ts` not listed in the cookbook's reference tables
4. **Missing enum values** — valid values from `policy-contract.ts` not documented (e.g., aggregate ops beyond `sum`/`count`/`min`/`max`)
5. **Stale syntax** — field names, parameter shapes, or enum values that changed since the cookbook was written
6. **Incorrect examples** — YAML examples that use wrong field names (e.g., `op:` vs `aggOp:`)

### Step 4: Assess Quality for LLM Agent Evolution

Evaluate the cookbook's usefulness for an LLM tasked with evolving agent profiles:

1. **Example coverage** — does every operator and reference path have at least one concrete YAML example?
2. **Pattern completeness** — are the "Common Patterns" section's templates sufficient for common agent evolution tasks?
   - Conditional scoring (when clause + state feature)
   - Token counting (globalTokenAgg with faction/type filters)
   - Zone quality scoring (completion-scoped zoneProp)
   - Action-type preference (boolToNumber + tag)
   - Event card awareness (activeCard refs)
   - Preview-based scoring (projectedSelfMargin pattern)
3. **"When to use what" guidance** — can the LLM determine which operator to use for a given strategic need?
4. **Warnings and pitfalls** — are known gotchas documented (aggOp vs op inconsistency, coalesce needed for preview refs, dropPassWhenOtherMovesExist essential)?
5. **Feature/aggregate lifecycle** — does the cookbook explain that `feature.*` and `aggregate.*` refs require corresponding library declarations?

### Step 5: Present Report

Present findings in this structure:

```
## Agent DSL Cookbook Reassessment

### Missing from Cookbook
[List each missing operator, ref path, intrinsic, or enum value]
1. **<item>** — exists in <source file>:<line>, not in cookbook. Usage: <what it does>.

### Stale or Incorrect
[List each stale/incorrect entry]
1. **<item>** — cookbook says <X>, source says <Y>. Fix: <correction>.

### Quality Gaps
[List quality improvements needed]
1. **<gap>** — <what's missing and why it matters for LLM agent evolution>.

### Current Coverage
- Operators: N/M documented (N%)
- Reference paths: N/M documented (N%)
- Intrinsics: N/M documented (N%)
- Patterns: <assessment>
```

**Wait for user approval** before modifying the cookbook.

### Step 6: Update Cookbook

After approval, update `docs/agent-dsl-cookbook.md`:

1. Add missing operators, ref paths, intrinsics, and enum values with YAML examples
2. Fix stale syntax and incorrect examples
3. Address quality gaps (add patterns, examples, guidance)
4. Preserve existing structure and voice — don't rewrite sections that are correct

### Step 7: Summary

Present:
- Number of additions, corrections, and quality improvements
- Suggested next step: run an agent evolution campaign to verify the cookbook's usefulness

## Guardrails

- **Report only during audit** — do not modify the cookbook until the user approves
- **Source files are read-only** — never modify engine code; only read for comparison
- **No game-specific strategies** — the cookbook documents generic DSL capabilities (Foundation 1: Engine Agnosticism). Game-specific strategies belong in campaign files, not the cookbook.
- **YAML examples must be correct** — every example in the cookbook must use the exact field names and syntax from the source files. Verify against `policy-expr.ts` before writing.
- **Preserve cookbook structure** — add to existing sections rather than reorganizing unless the structure is fundamentally broken
