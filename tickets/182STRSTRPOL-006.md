# 182STRSTRPOL-006: Phase 3 — Guardrails library bucket + compiled IR + compiler diagnostics

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/contracts/policy-contract.ts`, `packages/engine/src/kernel/types-core.ts`, `packages/engine/src/cnl/compile-agents.ts`, compiler diagnostic codes module
**Deps**: `archive/tickets/182STRSTRPOL-001.md`

## Problem

Spec 182 Phase 3 introduces guardrails — a separate negative-evidence library bucket with `prune | demote | warn | auditOnly` severities. Hard `prune` requires explicit `safe: true` plus `onAllPruned` per the pass-fallback contract (Foundation #18 + archived Spec 144). This ticket lands the compile-time surface: a new `guardrails` library bucket, the `GuardrailDef` and `PassFallbackSpec` IR per spec §5.2, and the 10 compiler diagnostics from spec §5.5. Per spec §5.1, the existing `pruningRules` bucket coexists during the Phase 3 merge window — guardrails is added here additively; pruningRules removal is atomic in ticket 010.

## Assumption Reassessment (2026-05-18)

1. `AGENT_POLICY_LIBRARY_BUCKETS` will already contain `strategyModules` from ticket 001; adding `guardrails` brings the array to 10 entries.
2. The existing `pruningRules` bucket continues to operate unchanged during this ticket's window — runtime dispatch (ticket 007) treats `guardrails` and `pruningRules` as independent buckets until ticket 010 removes pruningRules.
3. Spec 181 §5.5's `CNL_COMPILER_AGENT_SELECTOR_COMPONENT_REQUIRES_FALLBACK` is the precedent pattern for the `onUnavailable` declaration discipline; the value enum for guardrails is intentionally different (gate-firing vs. contribution-value) per spec §5.2's clarification.
4. The `CNL_COMPILER_AGENT_GUARDRAIL_PRUNINGRULES_DEPRECATED` diagnostic (#10) is wired in ticket 010 (after the bucket is removed); this ticket lands the 9 other diagnostics that apply during the bucket-coexistence window.

## Architecture Check

1. Guardrail IR types live alongside `StrategyModuleDef` in types-core.ts. Generic — no game-specific identifiers (Foundation #1).
2. Diagnostics follow `CNL_COMPILER_AGENT_GUARDRAIL_*` naming; no collisions verified during reassessment.
3. The bucket is YAML-authorable (Foundation #2).
4. `onUnavailable: 'warnUnknown' | 'noFire' | 'fire'` is intentionally different from selector `AgentPreviewFallback` (`'noContribution' | constant`) — guardrails make gate-firing decisions, not contribution decisions (Foundation #20 explicit-declaration discipline preserved; enum semantically appropriate per spec §5.2).
5. Compiler enforces `safe: true` + `onAllPruned` for `severity: prune` per spec §5.3 + Foundation #18.

## What to Change

### 1. AGENT_POLICY_LIBRARY_BUCKETS

Add `'guardrails'` to the const array at `packages/engine/src/contracts/policy-contract.ts`. Place between `'strategyModules'` and `'pruningRules'` to reflect dispatch order (selectors → modules → guardrails → pruningRules → considerations).

### 2. Compiled IR types in types-core.ts

Add types from spec §5.2:

```ts
export type GuardrailCostClass = 'state' | 'candidate' | 'microturn' | 'preview' | 'auditOnly';
export type GuardrailSeverity = 'prune' | 'demote' | 'warn' | 'auditOnly';

export interface PassFallbackSpec {
  readonly actionId: ActionId;
  readonly traceLabel: string;
}

export interface GuardrailDef {
  readonly id: GuardrailId;  // already declared in 001 as forward-reference type
  readonly traceLabel: string;
  readonly scopes: ReadonlyArray<'move' | 'microturn'>;
  readonly when: CompiledPolicyExpr;
  readonly severity: GuardrailSeverity;
  readonly penalty?: CompiledPolicyExpr;        // required when severity === 'demote'
  readonly safe?: true;                          // required when severity === 'prune'
  readonly onAllPruned?: PassFallbackSpec;       // required when severity === 'prune'
  readonly onUnavailable: 'warnUnknown' | 'noFire' | 'fire';
  readonly costClass: GuardrailCostClass;
}
```

Extend `CompiledPolicyCatalog` to include `readonly guardrails?: Readonly<Record<string, GuardrailDef>>;`.

### 3. Compiler in compile-agents.ts

Add `compileGuardrails(library)` mirroring `compileStrategyModules` (ticket 001). Wire into the dependency-cycle check. Compiler enforcement:
- `severity: prune` MUST have `safe: true` + `onAllPruned` (diagnostics 3, 4)
- `severity: demote` MUST have `penalty` (diagnostic 2)
- `onAllPruned.actionId` MUST resolve to an action tagged `pass` (diagnostic 5)
- Any preview ref read by `when` MUST have `onUnavailable` declared (diagnostic 6)

### 4. Compiler diagnostics (9 of 10; PRUNINGRULES_DEPRECATED in 010)

Add to `CNL_COMPILER_DIAGNOSTIC_CODES`:

- `CNL_COMPILER_AGENT_GUARDRAIL_REF_UNKNOWN`
- `CNL_COMPILER_AGENT_GUARDRAIL_SEVERITY_DEMOTE_REQUIRES_PENALTY`
- `CNL_COMPILER_AGENT_GUARDRAIL_SEVERITY_PRUNE_REQUIRES_SAFE`
- `CNL_COMPILER_AGENT_GUARDRAIL_SEVERITY_PRUNE_REQUIRES_ON_ALL_PRUNED`
- `CNL_COMPILER_AGENT_GUARDRAIL_ON_ALL_PRUNED_ACTION_NOT_PASS_TAGGED`
- `CNL_COMPILER_AGENT_GUARDRAIL_PREVIEW_REQUIRES_FALLBACK`
- `CNL_COMPILER_AGENT_GUARDRAIL_DEPENDENCY_CYCLE`
- `CNL_COMPILER_AGENT_GUARDRAIL_COST_CLASS_EXCEEDS_LIMIT`
- `CNL_COMPILER_AGENT_GUARDRAIL_TRACE_LABEL_DUPLICATE`

### 5. Diagnostic tests

Create `packages/engine/test/unit/cnl/agent-guardrail-diagnostics.test.ts` (sibling to `agent-selector-diagnostics.test.ts` and `agent-module-diagnostics.test.ts`) with one positive-trigger test per diagnostic code.

## Files to Touch

- `packages/engine/src/contracts/policy-contract.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify — `GuardrailDef`, `PassFallbackSpec`, severity/cost-class types)
- `packages/engine/src/cnl/compile-agents.ts` (modify — `compileGuardrails`)
- `packages/engine/src/cnl/diagnostic-codes.ts` (modify — add 9 codes)
- `packages/engine/test/unit/cnl/agent-guardrail-diagnostics.test.ts` (new)

## Out of Scope

- Runtime dispatch + severity execution (ticket 007).
- Pass-fallback runtime publication (ticket 008).
- Trace formatting (ticket 009).
- Migration atomic (ticket 010 — handles data migration + bucket removal + `_PRUNINGRULES_DEPRECATED` diagnostic).
- Conformance tests per severity tier (ticket 011).

## Acceptance Criteria

### Tests That Must Pass

1. New `agent-guardrail-diagnostics.test.ts` — one passing positive-trigger test per §5.5 diagnostic code 1–9 (PRUNINGRULES_DEPRECATED is added in ticket 010).
2. `pnpm turbo test` — full suite; pruningRules tests still pass (coexistence window).
3. `pnpm turbo lint`, `pnpm turbo typecheck`.

### Invariants

1. `guardrails` bucket is YAML-authorable (Foundation #2).
2. Compiler enforces `severity: prune` invariants per spec §5.3.
3. `pruningRules` bucket and tests continue to operate unchanged (coexistence window; removal in 010).
4. Diagnostic codes follow `CNL_COMPILER_AGENT_GUARDRAIL_*` naming.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/agent-guardrail-diagnostics.test.ts` — 9 positive-trigger tests.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/cnl/agent-guardrail-diagnostics.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
