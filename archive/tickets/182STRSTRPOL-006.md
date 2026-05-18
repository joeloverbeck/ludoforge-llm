# 182STRSTRPOL-006: Phase 3 — Guardrails library bucket + compiled IR + compiler diagnostics

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/contracts/policy-contract.ts`, `packages/engine/src/kernel/types-core.ts`, `packages/engine/src/kernel/schemas-core.ts`, `packages/engine/src/cnl/compile-agents.ts`, compiler diagnostic codes module
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
- `packages/engine/src/kernel/schemas-core.ts` (modify — schema validation for guardrail catalog/profile fields)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify — authored guardrail/profile config shape)
- `packages/engine/src/cnl/compile-agents.ts` (modify — wire `compileGuardrails`)
- `packages/engine/src/cnl/compile-agent-guardrails.ts` (new — guardrail lowering/diagnostics)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify — add 9 codes)
- `packages/engine/src/cnl/lower-agent-considerations.ts` (modify — lower compiled guardrails)
- `packages/engine/src/cnl/compile-agent-strategy-modules.ts` (modify — resolve module guardrail dependencies)
- `packages/engine/src/agents/policy-expr.ts` (modify — dependency propagation for guardrail refs)
- `packages/engine/schemas/GameDef.schema.json` (regenerated schema artifact)
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

## Outcome

Completed: 2026-05-19.

Implemented the Phase 3 guardrails compile-time surface.

What changed:
- Added the `guardrails` policy library bucket between `strategyModules` and `pruningRules`.
- Added authored and compiled guardrail shapes, `GuardrailDef`, `PassFallbackSpec`, guardrail severity/cost-class/profile config fields, dependency propagation, and schema validation.
- Added `compile-agent-guardrails.ts` for guardrail lowering and kept the existing `pruningRules` bucket operational for the coexistence window.
- Wired module `guardrailIds` to real guardrail dependency resolution so module/guardrail cycles can be detected.
- Added the 9 Phase 3 guardrail diagnostics for unknown refs, demote penalty, prune safety/fallback, pass-tagged fallback validation, preview fallback, dependency cycle, cost-class limit, and trace-label duplication.
- Added `agent-guardrail-diagnostics.test.ts` with positive-trigger coverage for all 9 diagnostics and adjusted the module diagnostic test for the now-real guardrail bucket.
- Regenerated `packages/engine/schemas/GameDef.schema.json`.

Deviations from the draft:
- The ticket named `packages/engine/src/cnl/diagnostic-codes.ts`; the live file is `packages/engine/src/cnl/compiler-diagnostic-codes.ts`.
- Guardrail lowering lives in the new focused `compile-agent-guardrails.ts` helper instead of adding the full implementation directly to the already-large `compile-agents.ts`.
- `CNL_COMPILER_AGENT_GUARDRAIL_PRUNINGRULES_DEPRECATED` remains out of scope for ticket 010 as drafted.

Source-size ledger:
- `packages/engine/src/cnl/compile-agents.ts` — before/after active growth: +194 lines; final size 5591 lines; preexisting over cap and still over cap. Narrow extraction performed: guardrail-specific lowering lives in `compile-agent-guardrails.ts`; remaining changes are compiler wiring, profile config, and catalog plumbing.
- `packages/engine/src/cnl/compile-agent-guardrails.ts` — new 226-line focused helper; under cap.
- `packages/engine/src/kernel/types-core.ts` — active growth +39 lines; final size 2630 lines; preexisting over cap. Growth is shared contract type surface for the new IR.
- `packages/engine/src/kernel/schemas-core.ts` — active growth +39 lines; final size 3033 lines; preexisting over cap. Growth mirrors the shared contract schema surface.

Verification:
- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/unit/cnl/agent-guardrail-diagnostics.test.js` — passed, 4 tests.
- `node --test packages/engine/dist/test/unit/cnl/agent-module-diagnostics.test.js` — passed, 3 tests.
- `pnpm -F @ludoforge/engine run schema:artifacts:check` — passed after regenerating schema artifacts.
- `pnpm turbo build` — passed.
- `pnpm turbo test` — passed.
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
