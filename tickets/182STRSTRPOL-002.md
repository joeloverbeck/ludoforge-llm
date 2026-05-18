# 182STRSTRPOL-002: Phase 2 — Strategic modules runtime evaluator + activation caching + dispatch insertion

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-eval.ts`, `packages/engine/src/agents/policy-evaluation-core.ts`
**Deps**: `archive/tickets/182STRSTRPOL-001.md`

## Problem

Spec 182 §4.5 requires module activation to evaluate inside Spec 121's move-scope evaluation phase, branching on cost class: state-scope modules evaluate once per decision; candidate-scope modules evaluate per candidate. The dispatch order after this ticket is `stateFeatures → candidateFeatures → selectors → modules → pruningRules → considerations → tie-breakers` (with `guardrails` slotting in between modules and pruningRules once Phase 3 lands; pruningRules removed in 010). Module activation must cache per Foundation #8 determinism rules; state-scoped activation evaluates exactly once per decision. Ref resolution (`module.<id>.active`, `.priority.value`, `.contribution`, `.scoreGroup.<id>.value`, `.selector.<role>.id`) lands here so downstream considerations and tie-breakers can observe module contributions.

## Assumption Reassessment (2026-05-18)

1. `packages/engine/src/agents/policy-eval.ts:652-838` shows the current move-scope evaluation pipeline: state features (652) → candidate features (655-662) → selectors (664-676) → pruning rules (678-726) → considerations (728-799) → tie-breakers (823-836). Module dispatch inserts between selectors (676) and pruning rules (678) — confirmed during spec reassessment.
2. The selector cost-class branch at `policy-eval.ts:669-675` (state-scope at 669-672, candidate-scope at 673-675) is the pattern to mirror for module cost-class branching.
3. `policy-evaluation-core.ts` exposes the ref-resolution pipeline that compiled refs flow through; module refs slot in alongside selector refs (Spec 181 §5.6).
4. `PolicyEvaluationContext` caching infrastructure (around `policy-evaluation-core.ts:40-48`) is reused; the cache key for module activation should mirror selector caching (state hash + candidate hash + preview ref status snapshot).

## Architecture Check

1. Module dispatch follows the same shape as selector dispatch — generic loop over `profile.plan.strategyModules ?? []`, cost-class branch, per-candidate or per-state evaluation. No game-specific logic (Foundation #1).
2. State-scoped activation cached at the decision level prevents redundant evaluation per Foundation #10 (Bounded Computation).
3. Module contributions are integer-weighted sums per Foundation #8; ties break deterministically by `(priorityTier desc, id asc)`.
4. Module refs are exposed before consideration evaluation so considerations can observe `module.<id>.contribution`; modules cannot observe consideration scores (dispatch order enforced).

## What to Change

### 1. Dispatch insertion in policy-eval.ts

Insert module evaluation block between line 676 (selectors loop close) and line 678 (pruning rules loop open). Pattern mirrors selectors loop with cost-class branching:

```ts
for (const moduleId of profile.plan.strategyModules ?? []) {
  const moduleDef = catalog.compiled.strategyModules?.[moduleId];
  if (moduleDef === undefined || moduleDef.costClass === 'auditOnly') continue;
  if (moduleDef.costClass === 'state') {
    evaluation.evaluatePlannedStrategyModule(moduleId);
    continue;
  }
  for (const candidate of activeCandidates) {
    evaluation.evaluatePlannedStrategyModule(moduleId, candidate);
  }
}
```

### 2. evaluatePlannedStrategyModule in policy-evaluation-core.ts

Add the evaluator method: evaluates `when` (activation), `priority.value`, score-group terms, and records activation + contribution. Caches by `(stateHash, candidateHash, previewRefStatusSnapshot)` for state-scope; per-candidate for candidate-scope. Handles `ModuleFallbackSpec.ifInactive` (`noContribution` | `traceOnly`) and `ifSelectorEmpty` (`noContribution` | `demoteAndTrace`) per spec §4.5 + §8.

### 3. Module ref resolution

Extend the ref-resolution pipeline in `policy-evaluation-core.ts` to handle `module.<id>.*` refs per spec §4.3:

| Ref | Resolution |
| --- | --- |
| `module.<id>.active` | boolean from activation cache |
| `module.<id>.priority.value` | numeric from priority eval |
| `module.<id>.contribution` | accumulated sum from score-group terms |
| `module.<id>.scoreGroup.<groupId>.value` | per-group reduced value (`sum` / `product` / `max`) |
| `module.<id>.selector.<role>.id` | bound selector id from `ModuleSelectorBinding` |

### 4. Activation caching test

Add a test asserting state-scope module activation evaluates exactly once per decision even when 100+ candidates are present. Pattern: instrument the activation evaluator with a call-counter; run a decision with N=100 candidates against a profile declaring one state-scope module; assert counter == 1.

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` (modify — dispatch insertion)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — evaluator + ref resolution + caching)
- `packages/engine/test/unit/agents/strategy-module-activation-caching.test.ts` (new)
- `packages/engine/test/unit/agents/strategy-module-dispatch-order.test.ts` (new — asserts modules evaluate after selectors, before pruningRules/considerations)

## Out of Scope

- Trace contract extension (ticket 003 — module trace fields).
- FITL/ARVN authoring (tickets 004, 005).
- Guardrail dispatch (Phase 3, ticket 007 — `guardrails` slots between modules and pruningRules once it exists).
- Module evaluation overhead benchmarking against Spec 181 §8 Phase 0 per-probe budget (verified in ticket 004 conformance).

## Acceptance Criteria

### Tests That Must Pass

1. State-scope activation evaluates exactly once per decision (new caching test).
2. Module dispatch order test — selectors evaluate before modules; modules evaluate before pruningRules and considerations.
3. Module refs (`module.<id>.active`, `.contribution`, `.scoreGroup.<groupId>.value`) resolve correctly when read from a consideration.
4. `pnpm turbo test` — full engine + runner suite.
5. Replay determinism check (use existing determinism test infrastructure): a module-using profile produces bit-identical decisions across two runs at the same seed.

### Invariants

1. Module evaluation is pure and deterministic (Foundation #8); cache key includes state hash, candidate hash (for candidate-scope), and preview ref status snapshot.
2. State-scoped modules evaluate at most once per decision; candidate-scoped modules evaluate at most once per (decision, candidate).
3. Modules cannot observe consideration scores; considerations CAN observe `module.<id>.contribution` (dispatch order enforced).
4. No game-specific identifiers in dispatch or evaluator code (Foundation #1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/strategy-module-activation-caching.test.ts` — asserts state-scope activation evaluates exactly once per decision.
2. `packages/engine/test/unit/agents/strategy-module-dispatch-order.test.ts` — asserts dispatch order vs. selectors/pruningRules/considerations.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/strategy-module-*.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
