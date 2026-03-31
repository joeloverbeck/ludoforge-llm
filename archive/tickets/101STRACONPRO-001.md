# 101STRACONPRO-001: GameSpec & compiled types for strategic conditions

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel types-core.ts, cnl game-spec-doc.ts
**Deps**: `specs/101-strategic-condition-proximity-metrics.md`, `archive/specs/99-event-card-policy-surface.md`, `archive/specs/100-compiled-event-effect-annotations.md`

## Problem

The agent policy system has no type-level representation for strategic conditions — named, evaluatable conditions that measure how close the game state is to satisfying a multi-turn objective. Before any compilation or evaluation logic can be built, the type definitions must exist in both the GameSpec layer (YAML authoring) and the compiled output layer (runtime evaluation).

## Assumption Reassessment (2026-03-31)

1. `GameSpecAgentLibrary` at `packages/engine/src/cnl/game-spec-doc.ts:586` has fields for stateFeatures, candidateFeatures, candidateAggregates, pruningRules, scoreTerms, completionScoreTerms, tieBreakers — no `strategicConditions` yet. Confirmed.
2. `CompiledAgentLibraryIndex` at `packages/engine/src/kernel/types-core.ts:624` has matching compiled fields — no `strategicConditions` yet. Confirmed.
3. `CompiledAgentPolicyRef` at `types-core.ts:371` is a discriminated union with kinds: `library`, surface refs, `candidateIntrinsic`, `candidateParam`, `decisionIntrinsic`, `optionIntrinsic`, `seatIntrinsic`, `turnIntrinsic` — no `strategicCondition` kind yet. Confirmed.
4. `CompiledAgentDependencyRefs` at `types-core.ts:566` has fields: `parameters`, `stateFeatures`, `candidateFeatures`, `aggregates` — no `strategicConditions` yet. Confirmed.

## Architecture Check

1. Pure type additions with no behavioral changes — minimal risk, easy to review.
2. Strategic conditions live in `GameSpecAgentLibrary` (game-specific YAML) and compile to `CompiledAgentLibraryIndex` (agnostic compiled output). No game-specific branching in the engine.
3. No backwards-compatibility shims — new optional fields on GameSpec side, new required field (empty record default) on compiled side.

## What to Change

### 1. GameSpec types (`game-spec-doc.ts`)

Add `GameSpecStrategicConditionDef` interface:

```typescript
export interface GameSpecStrategicConditionDef {
  readonly description?: string;
  readonly target: GameSpecPolicyExpr;
  readonly proximity?: {
    readonly current: GameSpecPolicyExpr;
    readonly threshold: number;
  };
}
```

Add to `GameSpecAgentLibrary`:
```typescript
readonly strategicConditions?: Readonly<Record<string, GameSpecStrategicConditionDef>>;
```

### 2. Compiled types (`types-core.ts`)

Add `CompiledStrategicCondition` interface:

```typescript
export interface CompiledStrategicCondition {
  readonly target: AgentPolicyExpr;
  readonly proximity?: {
    readonly current: AgentPolicyExpr;
    readonly threshold: number;
  };
}
```

Add to `CompiledAgentLibraryIndex`:
```typescript
readonly strategicConditions: Readonly<Record<string, CompiledStrategicCondition>>;
```

### 3. Ref kind (`types-core.ts`)

Add new variant to `CompiledAgentPolicyRef` union:

```typescript
| {
    readonly kind: 'strategicCondition';
    readonly conditionId: string;
    readonly field: 'satisfied' | 'proximity';
  }
```

### 4. Dependency tracking (`types-core.ts`)

Add to `CompiledAgentDependencyRefs`:
```typescript
readonly strategicConditions: readonly string[];
```

### 5. Fix all existing construction sites

Every place that constructs a `CompiledAgentDependencyRefs` or `CompiledAgentLibraryIndex` literal must be updated to include the new fields. Grep for these interface names across `compile-agents.ts` and test helpers to add `strategicConditions: []` (for deps) or `strategicConditions: {}` (for library index) as needed.

## Files to Touch

- `packages/engine/src/cnl/game-spec-doc.ts` (modify) — `GameSpecStrategicConditionDef`, `GameSpecAgentLibrary`
- `packages/engine/src/kernel/types-core.ts` (modify) — `CompiledStrategicCondition`, `CompiledAgentLibraryIndex`, `CompiledAgentPolicyRef`, `CompiledAgentDependencyRefs`
- `packages/engine/src/cnl/compile-agents.ts` (modify) — add `strategicConditions: {}` to library index construction, add `strategicConditions: []` to dependency refs construction sites
- Any test helpers or fixtures constructing these interfaces (modify) — add new required fields

## Out of Scope

- Compilation logic for strategic conditions (ticket 002)
- Ref path parsing in policy-surface.ts (ticket 003)
- Runtime evaluation in policy-evaluation-core.ts (ticket 004)
- Integration tests (ticket 005)

## Acceptance Criteria

### Tests That Must Pass

1. TypeScript compilation passes with no errors (`pnpm turbo typecheck`)
2. All existing agent compilation tests pass unchanged (modulo adding new required fields to literals)
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `CompiledAgentLibraryIndex.strategicConditions` is always present (required field, defaults to empty record `{}`)
2. `CompiledAgentDependencyRefs.strategicConditions` is always present (required field, defaults to empty array `[]`)
3. No game-specific identifiers introduced in type definitions

## Test Plan

### New/Modified Tests

1. No new test files — this is a type-only change. Existing tests are updated to include new required fields in object literals.

### Commands

1. `pnpm turbo typecheck`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-31
- **What changed**:
  - `game-spec-doc.ts`: added `GameSpecStrategicConditionDef` interface and `strategicConditions` optional field on `GameSpecAgentLibrary`
  - `types-core.ts`: added `CompiledStrategicCondition` interface, `strategicConditions` required field on `CompiledAgentLibraryIndex` and `CompiledAgentDependencyRefs`, `'strategicCondition'` variant on `CompiledAgentPolicyRef`
  - `schemas-core.ts`: Zod schemas for all new types and fields
  - `policy-contract.ts`: `'strategicConditions'` added to `AGENT_POLICY_LIBRARY_BUCKETS`
  - `compile-agents.ts`: library compiler private type, init, `mergeDependencies`, `emptyDependencies` updated
  - `policy-expr.ts`: `emptyDependencies` and `mergeDependencies` updated
  - `policy-evaluation-core.ts`: `'strategicCondition'` case returns `undefined` in `resolveRef` switch (stub for ticket 004)
  - ~20 test files and 2 golden fixture files updated for new required fields
  - Schema artifacts regenerated (`GameDef.schema.json`)
- **Deviations from plan**:
  - Ticket omitted `schemas-core.ts`, `policy-contract.ts`, `policy-expr.ts`, and `policy-evaluation-core.ts` from "Files to Touch" — all required updating for typecheck to pass
  - Golden fixture fingerprints changed due to new fields in compiled output
- **Verification**: typecheck clean, 5317/5317 engine tests pass, lint clean
