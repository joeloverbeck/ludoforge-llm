# 182STRSTRPOL-013: Phase 4 — Turn-shape evaluators library bucket + compiled IR + compiler diagnostics

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/contracts/policy-contract.ts`, `packages/engine/src/kernel/types-core.ts`, `packages/engine/src/cnl/compile-agents.ts`, compiler diagnostic codes module
**Deps**: `archive/tickets/182STRSTRPOL-001.md`

## Problem

Spec 182 Phase 4 introduces turn-shape evaluators — bounded summaries over the already-driven inner-preview chain that compare projected effect against module-declared objectives. This ticket lands the compile-time surface: a new `turnShapeEvaluators` library bucket, the compiled IR shape per spec §6.2 (`TurnShapeEvaluatorDef`, `TurnShapeBoundsSpec`, `ObjectiveDef`, `TurnShapeFallbackSpec`), and the 8 compiler diagnostics from spec §6.4. Per spec §6.5, evaluators consume the already-driven inner-preview chain — no new preview drive is triggered; this invariant is verified at runtime (ticket 014) and via architectural test (ticket 016).

## Assumption Reassessment (2026-05-18)

1. `AGENT_POLICY_LIBRARY_BUCKETS` will already contain `strategyModules` (from 001) and `guardrails` (from 006); this ticket adds `turnShapeEvaluators` making the array 11 entries (post-pruningRules removal in 010).
2. Cap classes `standard256` and `deep1024` exist at `packages/engine/src/kernel/types-core.ts:1048` per `AgentPreviewInnerCapClass` — confirmed during reassessment.
3. The inner-preview substrate (`policy-preview-inner-deepening.ts`, `policy-preview-inner-choosenstep.ts` per Spec 164) is the data source; this ticket compiles the consumer IR but doesn't yet wire the runtime (014).
4. `CNL_COMPILER_AGENT_TURNSHAPE_REQUIRES_UNREGISTERED_PREVIEW_DRIVE` is the key guard: if an objective reads a projected ref the profile's declared inner-preview drives don't produce, compilation fails.

## Architecture Check

1. Turn-shape IR types live alongside `StrategyModuleDef` and `GuardrailDef` in types-core.ts. Generic — no game-specific identifiers (Foundation #1).
2. The `source: 'currentPreviewDrive'` field is reserved (initial value); future kinds can be added without breaking the IR shape (Foundation #15 — extensible boundaries).
3. Bounded computation per Foundation #10: `TurnShapeBoundsSpec.maxSyntheticDecisions` + reuses Spec 164's cap-class registry.
4. Foundation #20: turn-shape evaluator objectives reading preview refs inherit the explicit `onPreviewUnavailable` clause; the compiler enforces declaration.
5. Diagnostics follow `CNL_COMPILER_AGENT_TURNSHAPE_*` naming; no collisions verified during reassessment.

## What to Change

### 1. AGENT_POLICY_LIBRARY_BUCKETS

Add `'turnShapeEvaluators'` to the const array in `packages/engine/src/contracts/policy-contract.ts`. Place after `'guardrails'` to reflect the evaluation order.

### 2. Compiled IR types in types-core.ts

Add types from spec §6.2:

```ts
export type TurnShapeEvaluatorId = Brand<string, 'TurnShapeEvaluatorId'>;
export type ObjectiveId = Brand<string, 'ObjectiveId'>;
export type TurnShapeCostClass = 'preview';  // always preview-class per §6.2

export interface TurnShapeBoundsSpec {
  readonly depthCapRef: 'profile.preview.inner.depthCap';  // reserved initial value
  readonly maxSyntheticDecisions: number;
}

export interface ObjectiveDef {
  readonly id: ObjectiveId;
  readonly value?: CompiledPolicyExpr;
  readonly delta?: CompiledPolicyExpr;
}

export interface TurnShapeFallbackSpec {
  readonly onPreviewUnavailable: 'traceOnly' | 'demote';
  readonly demotePenalty?: CompiledPolicyExpr;
}

export interface TurnShapeEvaluatorDef {
  readonly id: TurnShapeEvaluatorId;
  readonly traceLabel: string;
  readonly source: 'currentPreviewDrive';
  readonly bounds: TurnShapeBoundsSpec;
  readonly objectives: ReadonlyArray<ObjectiveDef>;
  readonly minimumImpact: CompiledPolicyExpr;
  readonly fallback: TurnShapeFallbackSpec;
  readonly costClass: TurnShapeCostClass;
}
```

Extend `CompiledPolicyCatalog` to include `readonly turnShapeEvaluators?: Readonly<Record<string, TurnShapeEvaluatorDef>>;`.

### 3. Compiler in compile-agents.ts

Add `compileTurnShapeEvaluators(library)`. Per spec §6.4, enforce:
- Each objective MUST have `value` XOR `delta` (not both, not neither).
- Each objective's refs MUST be derivable from the profile's declared inner-preview drives; otherwise emit `_REQUIRES_UNREGISTERED_PREVIEW_DRIVE`.
- Dependency-cycle check extended for self-/module-cycles.

### 4. Compiler diagnostics (8 codes per spec §6.4)

Add to `CNL_COMPILER_DIAGNOSTIC_CODES`:

- `CNL_COMPILER_AGENT_TURNSHAPE_REF_UNKNOWN`
- `CNL_COMPILER_AGENT_TURNSHAPE_OBJECTIVE_REQUIRES_VALUE_OR_DELTA`
- `CNL_COMPILER_AGENT_TURNSHAPE_OBJECTIVE_HAS_BOTH_VALUE_AND_DELTA`
- `CNL_COMPILER_AGENT_TURNSHAPE_REQUIRES_UNREGISTERED_PREVIEW_DRIVE`
- `CNL_COMPILER_AGENT_TURNSHAPE_FALLBACK_DEMOTE_REQUIRES_PENALTY`
- `CNL_COMPILER_AGENT_TURNSHAPE_DEPENDENCY_CYCLE`
- `CNL_COMPILER_AGENT_TURNSHAPE_OBJECTIVE_ID_DUPLICATE`
- `CNL_COMPILER_AGENT_TURNSHAPE_TRACE_LABEL_DUPLICATE`

### 5. Diagnostic tests

Create `packages/engine/test/unit/cnl/agent-turnshape-diagnostics.test.ts` (sibling to `agent-module-diagnostics.test.ts` and `agent-guardrail-diagnostics.test.ts`) with one positive-trigger test per diagnostic code.

## Files to Touch

- `packages/engine/src/contracts/policy-contract.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify — turn-shape IR types)
- `packages/engine/src/cnl/compile-agents.ts` (modify — `compileTurnShapeEvaluators`)
- `packages/engine/src/cnl/diagnostic-codes.ts` (modify — add 8 codes)
- `packages/engine/test/unit/cnl/agent-turnshape-diagnostics.test.ts` (new)

## Out of Scope

- Runtime evaluator + bounded chain consumption (ticket 014).
- Trace integration (ticket 015).
- Architectural-invariant probe (ticket 016).
- FITL conformance + minimumImpactSatisfied probe (ticket 017).

## Acceptance Criteria

### Tests That Must Pass

1. New `agent-turnshape-diagnostics.test.ts` — one passing positive-trigger test per §6.4 diagnostic (8 tests).
2. `pnpm turbo test` — full suite.
3. `pnpm turbo lint`, `pnpm turbo typecheck`.

### Invariants

1. `turnShapeEvaluators` bucket is YAML-authorable (Foundation #2).
2. `costClass` is always `preview` for turn-shape evaluators per spec §6.2.
3. Compiler enforces `value` XOR `delta` per objective.
4. Diagnostic codes follow `CNL_COMPILER_AGENT_TURNSHAPE_*` naming.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/agent-turnshape-diagnostics.test.ts` — 8 positive-trigger tests.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/cnl/agent-turnshape-diagnostics.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
