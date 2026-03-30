# 95POLGUIMOVCOM-010: Canonical policy zone-address resolution for dynamic completion scoring

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — policy runtime/evaluator zone-resolution contract
**Deps**: archive/specs/95-policy-guided-move-completion.md, archive/tickets/95POLGUIMOVCOM/95POLGUIMOVCOM-004.md, archive/tickets/95POLGUIMOVCOM/95POLGUIMOVCOM-009.md

## Problem

The completion-guidance stack can now score dynamic zone expressions such as `{ ref: option.value }`, but policy-side `zoneTokenAgg` evaluation still bypasses the kernel’s authored-zone resolution contract and synthesizes zone addresses locally. That leaves dynamic zone reads architecturally incomplete: exact authored zone ids like `space:none` are not treated as first-class runtime zone addresses, and unresolved dynamic strings can collapse to misleading zeroes instead of failing closed.

This ticket closes that gap by moving policy zone aggregation onto the same canonical zone-resolution truth the kernel already owns.

## Assumption Reassessment (2026-03-30)

1. `AgentPolicyExpr` already supports `zoneTokenAgg` with `zone: string | AgentPolicyExpr`. Confirmed in `packages/engine/src/kernel/types-core.ts`.
2. `createPolicyCompletionProvider(...)` currently exposes only `decisionIntrinsic.*` and `optionIntrinsic.value` from completion context. Confirmed in `packages/engine/src/agents/policy-runtime.ts`.
3. The kernel already has a canonical authored-zone resolver in `packages/engine/src/kernel/resolve-zone-ref.ts`, built on selector resolution. The ticket’s original wording overstated the absence of a shared helper. Corrected.
4. The actual gap is narrower and more concrete: `PolicyEvaluationContext.evaluateZoneTokenAggregate(...)` in `packages/engine/src/agents/policy-evaluation-core.ts` bypasses that kernel resolver and synthesizes a zone address directly with `toOwnedZoneId(...)`. That means policy-side zone reads do not currently share the kernel’s selector/address contract or its validation behavior. Confirmed.
5. Current production FITL authoring does not yet use dynamic `zoneTokenAgg` in `completionScoreTerms`; `data/games/fire-in-the-lake/92-agents.md` still scores target-space completion with a constant term. The ticket must not claim a production-authored end-to-end proof that does not exist. Corrected.
6. This is not a request for FITL-specific logic or a broad policy-runtime rewrite. The missing piece is a small, generic authored-zone-to-runtime-zone-address bridge that policy evaluation can reuse safely and fail closed when resolution is invalid. Corrected scope.

## Architecture Check

1. The clean fix is to route policy-side zone aggregation through the kernel’s existing authored-zone resolution contract, or a small extracted helper directly derived from it, not to patch FITL-specific ids or special-case `option.value`.
2. The better long-term architecture is not to thread the entire policy system through arbitrary selector evaluation. Keep the shared surface narrow: authored zone ref in, canonical runtime zone id or `undefined` out.
3. This preserves Foundation #1 and #8: GameSpecDoc continues to author game-specific ids, while the runtime resolves them generically without game branches.
4. No backwards-compatibility shims: once the canonical resolver exists for policy zone reads, all `zoneTokenAgg` evaluation should use it. Do not keep a parallel policy-local address path alive.

## What to Change

### 1. Introduce a shared canonical authored-zone resolver for policy evaluation

Create or extract a helper that:

- accepts a string zone reference produced by policy evaluation
- resolves it against the compiled `GameDef` using the same authored-zone contract the kernel uses
- returns the canonical runtime zone id or `undefined` when the value cannot be resolved safely

The helper must be game-agnostic. It may wrap existing kernel selector-resolution logic, but policy evaluation must receive `undefined` instead of a thrown resolution failure for malformed or unknown dynamic zone values.

### 2. Route policy zone evaluation through the canonical resolver

Update the policy evaluation core so `zoneTokenAgg` no longer performs its own implicit zone-address interpretation.

Requirements:

- use the canonical resolver for both static and dynamic zones
- preserve existing correct behavior for already-valid authored zones
- fail closed to `undefined` when the zone cannot be resolved; do not silently collapse unresolved zones to a misleading zero score

### 3. Add regression coverage around canonical authored zone resolution

Add focused tests that prove:

- two distinct completion options that point at two distinct zones resolve to two distinct policy zone-evaluation results when state differs
- exact runtime/authored zone ids such as `space:none` are resolved through the shared path rather than policy-local string concatenation
- unresolved or malformed dynamic zone ids still fail safely to `undefined`

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)
- `packages/engine/src/kernel/resolve-zone-ref.ts` or a new shared zone-resolution helper module (modify/new)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify)
- `packages/engine/test/unit/agents/completion-guidance-eval.test.ts` (modify)
- `packages/engine/src/agents/policy-runtime.ts` (modify only if the implementation genuinely requires it after reassessment)
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (do not modify unless unit coverage proves insufficient)

## Out of Scope

- New policy DSL surface for reading zone properties directly
- New game-specific FITL heuristics or hardcoded zone ranking rules
- Marker-specific policy expressions
- Broad candidate-scoring redesign unrelated to dynamic zone resolution

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: `zoneTokenAgg` with dynamic zone ids resolves through the canonical shared resolver rather than policy-local string interpretation.
2. New unit test: distinct dynamic zone options with distinct state produce distinct scores when zone state differs.
3. New unit test: unresolved dynamic zone ids return `undefined`, not silent zero.
4. Existing `completion-guidance-eval` and `policy-eval` coverage remains green.
5. Existing suite: `pnpm -F @ludoforge/engine test`
6. Workspace checks: `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

### Invariants

1. Dynamic policy zone evaluation uses one canonical authored-zone resolution contract shared with the kernel.
2. No game-specific branching leaks into policy runtime/evaluator code.
3. Unresolved dynamic zone reads fail closed as unknown rather than fabricating deterministic-but-wrong scores.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-eval.test.ts` — prove canonical dynamic zone resolution and fail-closed semantics
2. `packages/engine/test/unit/agents/completion-guidance-eval.test.ts` — prove completion-option zone scoring differentiates real zones once resolution is canonical
3. `packages/engine/test/integration/fitl-policy-agent.test.ts` — optional only if unit coverage cannot prove the invariant cleanly

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/agents/completion-guidance-eval.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- Completion date: 2026-03-30
- What actually changed:
  - Corrected the ticket scope before implementation: the kernel already had `resolve-zone-ref`; the real gap was policy evaluation bypassing it.
  - Extended `packages/engine/src/kernel/resolve-zone-ref.ts` so exact known zone ids resolve directly and added `resolveZoneRefWithOwnerFallback(...)` for policy-side owner fallback without policy-local string concatenation.
  - Updated `packages/engine/src/agents/policy-evaluation-core.ts` so `zoneTokenAgg` now resolves zones through the shared kernel contract and fails closed to `undefined` when resolution is invalid.
  - Strengthened unit coverage in `packages/engine/test/unit/agents/policy-eval.test.ts`, `packages/engine/test/unit/agents/completion-guidance-eval.test.ts`, and `packages/engine/test/unit/resolve-zone-ref.test.ts`.
- Deviations from original plan:
  - `packages/engine/src/agents/policy-runtime.ts` and FITL integration tests were not changed; reassessment showed the issue lived entirely in policy evaluation plus shared resolver semantics, and unit coverage was sufficient.
  - The durable contract uses valid canonical zone ids such as `target-a:none` / `space:none`, not speculative production-only map ids.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node packages/engine/dist/test/unit/agents/completion-guidance-eval.test.js`
  - `node packages/engine/dist/test/unit/agents/policy-eval.test.js`
  - `node packages/engine/dist/test/unit/resolve-zone-ref.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
