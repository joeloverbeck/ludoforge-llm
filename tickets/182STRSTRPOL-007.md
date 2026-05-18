# 182STRSTRPOL-007: Phase 3 — Guardrails runtime evaluator + severity dispatch + basic trace population

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-eval.ts`, `packages/engine/src/agents/policy-evaluation-core.ts`, `packages/engine/src/kernel/types-core.ts` (basic guardrails trace field)
**Deps**: `archive/tickets/182STRSTRPOL-006.md`

## Problem

Spec 182 §5.6 describes runtime dispatch: state-scoped guardrails evaluate once per decision; candidate/microturn/preview-scoped guardrails evaluate per candidate. The four severities behave distinctly per spec §5.3: `prune` removes from frontier; `demote` accumulates penalty; `warn` records trace marker; `auditOnly` emits probe-visible marker with zero score effect. This ticket lands the dispatch logic between modules and pruningRules (pruningRules removed in 010), plus basic `guardrails.fired` and `guardrails.notFiredTop` trace population. Pass-fallback runtime + `allPrunedFallback` trace lands in ticket 008; trace formatting (top-K caps + ordering tests) lands in 009.

## Assumption Reassessment (2026-05-18)

1. Ticket 002 inserted module dispatch between selectors (`policy-eval.ts:676`) and pruningRules (line 678); guardrail dispatch slots immediately after modules and before pruningRules.
2. The basic trace types for `guardrails.fired` / `guardrails.notFiredTop` land here so 007 can populate them; the full `allPrunedFallback` extension lands in 008; ordering + cap tests land in 009.
3. Spec 121 caching (state hash + candidate hash + preview ref status snapshot) is reused from selector caching for guardrail caching.

## Architecture Check

1. Guardrail dispatch is generic — loop over `profile.use.guardrails ?? []`, severity switch, scope-based candidate iteration. No game-specific logic (Foundation #1).
2. Caching mirrors selector caching for determinism (Foundation #8).
3. `prune` severity does NOT yet publish pass-fallback frame in this ticket — that's 008's scope; in this ticket, prune removes candidates from `activeCandidates` and surfaces an internal "empty frontier" condition for 008 to handle. Until 008 lands, a `severity: prune` guardrail that empties the frontier surfaces the existing `PRUNING_RULE_EMPTIED_CANDIDATES`-style error path or equivalent placeholder; document this transitional behavior in the ticket Outcome and in 008's Problem.
4. `demote` accumulates `penalty` per candidate; final score subtracts the accumulated sum per spec §5.6 (4).
5. `warn` and `auditOnly` record trace markers only; zero score effect.

## What to Change

### 1. Dispatch insertion in policy-eval.ts

Insert guardrail evaluation block immediately after the module dispatch (added by ticket 002) and before the existing pruningRules loop (line 678 pre-ticket-002, shifted by 002's insertion). Pattern:

```ts
const firedGuardrails: GuardrailFiredEntry[] = [];
const notFiredGuardrails: GuardrailNotFiredEntry[] = [];

for (const guardrailId of profile.use.guardrails ?? []) {
  const guardrailDef = catalog.compiled.guardrails?.[guardrailId];
  if (guardrailDef === undefined) continue;
  if (!scopeMatches(guardrailDef, currentScope)) continue;
  // State-scope vs per-candidate branching:
  if (guardrailDef.costClass === 'state') {
    const shouldFire = evaluation.evaluateGuardrailWhen(guardrailDef, null);
    applySeverityIfFired(guardrailDef, shouldFire, /* candidate */ null, firedGuardrails, notFiredGuardrails);
  } else {
    for (const candidate of activeCandidates) {
      const shouldFire = evaluation.evaluateGuardrailWhen(guardrailDef, candidate);
      applySeverityIfFired(guardrailDef, shouldFire, candidate, firedGuardrails, notFiredGuardrails);
    }
  }
}
```

### 2. Severity dispatch handler

`applySeverityIfFired`:
- `prune`: remove candidate from `activeCandidates`; track `prunedBy` for trace.
- `demote`: accumulate `guardrailDef.penalty` evaluation into per-candidate penalty sum; subtract from final score.
- `warn`: record entry in `firedGuardrails` with `severity: 'warn'`; no score effect.
- `auditOnly`: record entry in `firedGuardrails` with `severity: 'auditOnly'`; probe-visible.

### 3. Basic trace types in types-core.ts

Add minimal guardrails trace shape (full caps + ordering in 009; allPrunedFallback in 008):

```ts
export interface PolicyGuardrailTrace {
  readonly fired: ReadonlyArray<PolicyGuardrailFiredEntry>;
  readonly notFiredTop: ReadonlyArray<PolicyGuardrailNotFiredEntry>;
  // allPrunedFallback?: PolicyGuardrailAllPrunedFallback;  // added in 008
}

export interface PolicyGuardrailFiredEntry {
  readonly id: string;
  readonly traceLabel: string;
  readonly severity: 'prune' | 'demote' | 'warn' | 'auditOnly';
  readonly penalty?: number;
  readonly status: 'ready' | 'partial' | 'unavailable';
}

export interface PolicyGuardrailNotFiredEntry {
  readonly id: string;
  readonly reason: 'whenFalse' | 'scopeFiltered' | 'previewUnavailable';
}
```

Extend `PolicyAgentDecisionTrace` (types-core.ts:2232) with `readonly guardrails?: PolicyGuardrailTrace;`.

### 4. Tests

- Dispatch order test: guardrails evaluate after modules, before pruningRules.
- Severity tests: prune removes; demote applies penalty; warn records trace; auditOnly records trace + zero score effect.
- Caching test: state-scope guardrail evaluates once per decision.

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` (modify — dispatch insertion + severity handler)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — `evaluateGuardrailWhen` + caching + `guardrail.<id>.*` ref resolution)
- `packages/engine/src/kernel/types-core.ts` (modify — basic `PolicyGuardrailTrace` types)
- `packages/engine/test/unit/agents/guardrail-dispatch-order.test.ts` (new)
- `packages/engine/test/unit/agents/guardrail-severity-dispatch.test.ts` (new)

## Out of Scope

- Pass-fallback runtime publication (ticket 008 — handles empty-frontier → publish onAllPruned frame).
- `allPrunedFallback` trace field (ticket 008).
- Trace top-K caps + deterministic ordering tests (ticket 009).
- Migration atomic (ticket 010).
- Conformance tests (ticket 011).
- Profile-quality lint warnings (ticket 012).

## Acceptance Criteria

### Tests That Must Pass

1. Guardrail dispatch order test — guardrails evaluate after modules, before pruningRules.
2. Severity dispatch tests — one per severity tier (prune, demote, warn, auditOnly).
3. Caching test — state-scope guardrail evaluates exactly once per decision.
4. `pnpm turbo test` — full suite.
5. Replay determinism (existing infrastructure): guardrail-using profile produces bit-identical decisions across two runs.

### Invariants

1. Guardrail evaluation is pure and deterministic (Foundation #8).
2. `prune` severity respects `safe: true` compiler check (enforced in 006); runtime publication handled in 008.
3. `warn` and `auditOnly` produce zero score effect.
4. No game-specific identifiers in dispatch code (Foundation #1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/guardrail-dispatch-order.test.ts` — asserts order vs. modules/pruningRules.
2. `packages/engine/test/unit/agents/guardrail-severity-dispatch.test.ts` — one block per severity tier.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/guardrail-*.test.js`
2. `pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`
