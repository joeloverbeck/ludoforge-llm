# 96GLOSTAAGG-001: Establish canonical contracts for global aggregation expressions

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — shared policy contracts, kernel types, runtime schema contracts
**Deps**: Spec 96 (draft), Spec 95 (implemented), `packages/engine/src/contracts/policy-contract.ts`, `packages/engine/src/kernel/types-core.ts`, `packages/engine/src/kernel/schemas-core.ts`

## Problem

Spec 96 introduces three new policy expression kinds: `globalTokenAgg`, `globalZoneAgg`, and `adjacentTokenAgg`. The current ticket assumed this could be handled as a "types only" change, but the repo’s architecture couples compiled policy expression contracts across three surfaces:

1. canonical literal-domain contracts in `policy-contract.ts`
2. the `AgentPolicyExpr` runtime types in `types-core.ts`
3. the compiled `GameDef` runtime schemas in `schemas-core.ts` / generated schema artifacts

Adding types without keeping the schema surface in lockstep would create immediate contract drift: TypeScript would accept expression nodes that the runtime schemas reject.

## Assumption Reassessment (2026-03-30)

1. `AgentPolicyExpr` in `types-core.ts` currently has 6 kinds: `literal`, `param`, `ref`, `op`, `zoneTokenAgg`, `zoneProp`. Confirmed.
2. `packages/engine/src/kernel/types.ts` already re-exports all of `types-core.ts`. No barrel change is needed for new exported types.
3. `packages/engine/src/kernel/schemas-core.ts` defines the compiled `AgentPolicyExpr` runtime schema that backs generated `schemas/GameDef.schema.json`. This ticket must keep that surface aligned with `types-core.ts`.
4. `policy-expr.ts` and `policy-evaluation-core.ts` are expression-kind aware, but implementing analyzer/runtime support there belongs to later tickets. This ticket should not claim "no downstream compiler/runtime awareness exists"; it should explicitly defer those changes.
5. `ZoneDef` uses `zoneKind`, not `kind`. Scope logic in later tickets must filter on `zoneDef.zoneKind ?? 'board'` if board-by-default semantics are desired.
6. Foundation #12 does not require compiled policy expression payloads to store branded `ZoneId` values. At this boundary, zone references are serialized strings or nested id-valued expressions and are resolved to branded ids later.
7. Enum-like policy literals are currently duplicated in multiple places (`types-core.ts`, `policy-expr.ts`, `schemas-core.ts`). For long-term robustness, this ticket should centralize the canonical value sets in `policy-contract.ts` and have other surfaces consume them.

## Architecture Check

1. The beneficial architectural move here is not merely "add more union members". It is to establish a single canonical contract source for aggregation-related literals and reuse it from types and schemas. That reduces drift risk and makes later analyzer/evaluator tickets smaller and safer.
2. This ticket should remain a contract-layer slice. It should not add analyzer support or real evaluation logic for the new expressions, but it may add minimal exhaustiveness/fail-fast guards where the widened union requires runtime acknowledgement.
3. The new filter and scope shapes remain generic and game-agnostic: token filters match `type` and arbitrary `props`; zone filters match `category`, static `attributes`, and runtime `zoneVars`. This preserves Foundation #1.
4. No backwards-compatibility shims or aliases. Existing contract shapes remain valid; new shapes are added cleanly and consumed directly.

## What to Change

### 1. Canonicalize aggregation literal domains in `policy-contract.ts`

Add canonical value sets and guard functions for:

- `AgentPolicyZoneTokenAggOp`: `'sum' | 'count' | 'min' | 'max'`
- `AgentPolicyZoneFilterOp`: `'eq' | 'gt' | 'gte' | 'lt' | 'lte'`
- `AgentPolicyZoneScope`: `'board' | 'aux' | 'all'`
- `AgentPolicyZoneAggSource`: `'variable' | 'attribute'`

Existing `zoneTokenAgg` owner keywords stay in this file as part of the same contract family.

### 2. Extend `AgentPolicyExpr` and related shared types in `types-core.ts`

Add:

- `AgentPolicyTokenFilter`
- `AgentPolicyZoneFilter`
- `AgentPolicyZoneScope`
- `AgentPolicyZoneAggSource`
- `globalTokenAgg`, `globalZoneAgg`, and `adjacentTokenAgg` members in `AgentPolicyExpr`

Expected compiled shapes:

```typescript
interface AgentPolicyTokenFilter {
  readonly type?: string;
  readonly props?: Readonly<Record<string, { readonly eq: string | number | boolean }>>;
}

interface AgentPolicyZoneFilter {
  readonly category?: string;
  readonly attribute?: {
    readonly prop: string;
    readonly op: AgentPolicyZoneFilterOp;
    readonly value: string | number | boolean;
  };
  readonly variable?: {
    readonly prop: string;
    readonly op: AgentPolicyZoneFilterOp;
    readonly value: number;
  };
}
```

```typescript
| {
    readonly kind: 'globalTokenAgg';
    readonly tokenFilter?: AgentPolicyTokenFilter;
    readonly aggOp: AgentPolicyZoneTokenAggOp;
    readonly prop?: string;
    readonly zoneFilter?: AgentPolicyZoneFilter;
    readonly zoneScope: AgentPolicyZoneScope;
  }
| {
    readonly kind: 'globalZoneAgg';
    readonly source: AgentPolicyZoneAggSource;
    readonly field: string;
    readonly aggOp: AgentPolicyZoneTokenAggOp;
    readonly zoneFilter?: AgentPolicyZoneFilter;
    readonly zoneScope: AgentPolicyZoneScope;
  }
| {
    readonly kind: 'adjacentTokenAgg';
    readonly anchorZone: string;
    readonly tokenFilter?: AgentPolicyTokenFilter;
    readonly aggOp: AgentPolicyZoneTokenAggOp;
    readonly prop?: string;
  }
```

This ticket defines the serialized compiled shape only. It does not implement analyzer defaults or runtime resolution semantics.

### 3. Keep `schemas-core.ts` aligned with the new contract surface

Update the compiled `AgentPolicyExpr` runtime schema so it accepts the three new expression kinds and their nested filter objects using the canonical contract value sets from `policy-contract.ts`.

The schema must stay strict and reject non-canonical literals.

### 4. Reuse canonical aggregation-op literals in existing consumers

Update existing consumers that currently duplicate the zone token aggregation-op set to read the canonical values from `policy-contract.ts`. In this repo that includes `policy-expr.ts`.

### 5. Add a fail-fast evaluator exhaustiveness guard

`policy-evaluation-core.ts` must acknowledge the new `AgentPolicyExpr` variants so the widened union remains exhaustive at compile time. Until later tickets implement real evaluation, the runtime should fail loudly if one of the new compiled kinds is encountered.

### 6. Regenerate or verify schema artifacts

Because `schemas/GameDef.schema.json` is generated from the source schema contracts, regenerate the schema artifacts if required so the committed artifacts remain synchronized.

## Files to Touch

- `packages/engine/src/contracts/policy-contract.ts` (modify) — canonical aggregation literal domains and guards
- `packages/engine/src/kernel/types-core.ts` (modify) — new filter types and `AgentPolicyExpr` members
- `packages/engine/src/kernel/schemas-core.ts` (modify) — compiled runtime schema alignment
- `packages/engine/src/agents/policy-expr.ts` (modify) — consume the canonical aggregation-op literal set
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify) — add explicit fail-fast handling for unimplemented new kinds
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify) — schema acceptance/rejection coverage for the new compiled expression shapes
- `packages/engine/test/unit/schema-artifacts-sync.test.ts` (existing coverage; no direct edit required unless test helpers need adjustment)
- `schemas/GameDef.schema.json` (generated update if source schema changes alter the artifact)

## Out of Scope

- YAML analyzer support for the new expression kinds in `packages/engine/src/agents/policy-expr.ts`
- Runtime evaluation logic for the new expression kinds in `packages/engine/src/agents/policy-evaluation-core.ts`
- Shared matching helpers from 96GLOSTAAGG-002
- Any changes to `compile-agents.ts`
- Any runner package changes

## Acceptance Criteria

### Tests That Must Pass

1. `GameDefSchema` accepts compiled `globalTokenAgg`, `globalZoneAgg`, and `adjacentTokenAgg` expressions with valid canonical literals.
2. `GameDefSchema` rejects invalid `zoneScope`, `source`, and zone-filter operator values.
3. `pnpm turbo typecheck` passes.
4. `pnpm turbo build` passes.
5. Relevant engine tests pass, including schema artifact synchronization.

### Invariants

1. The canonical literal domains live in `policy-contract.ts`, not as disconnected one-off literal unions in each consumer.
2. `types-core.ts` and `schemas-core.ts` describe the same compiled expression surface.
3. No analyzer support or real evaluation logic for the new kinds is introduced in this ticket; only canonicalization and a fail-fast exhaustiveness guard are allowed.
4. No backwards-compatibility aliases or deprecated shapes are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-top-level.test.ts`
   Rationale: proves the compiled runtime schema accepts the new expression nodes and rejects invalid canonical literals.

### Commands

1. `pnpm turbo typecheck`
2. `pnpm turbo build`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`

## Outcome

Completion date: 2026-03-30

What actually changed:
- Added canonical aggregation contract values and guards in `policy-contract.ts` for aggregation ops, zone filter ops, zone scopes, and zone aggregate sources.
- Extended `AgentPolicyExpr` plus shared filter types in `types-core.ts` for `globalTokenAgg`, `globalZoneAgg`, and `adjacentTokenAgg`.
- Updated `schemas-core.ts` and regenerated `schemas/GameDef.schema.json` so compiled agent catalogs now accept the new expression shapes.
- Updated `policy-expr.ts` to consume the canonical aggregation-op literal set.
- Added an explicit fail-fast branch in `policy-evaluation-core.ts` so the widened expression union remains exhaustive without pretending the new evaluators already exist.
- Added schema-level coverage for acceptance and rejection of the new compiled expression shapes.

Deviations from original plan:
- The original ticket underestimated the required implementation surface. This could not remain "types only" because the repo treats compiled policy expression types and runtime schemas as one contract surface.
- A minimal evaluator guard was required once `AgentPolicyExpr` widened; otherwise typecheck broke and the runtime would have had an implicit unsupported path.

Verification results:
- `pnpm -F @ludoforge/engine typecheck`
- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo typecheck`
- `pnpm turbo build`
- `pnpm turbo lint`
