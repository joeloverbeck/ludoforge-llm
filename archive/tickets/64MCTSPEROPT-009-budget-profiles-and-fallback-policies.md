# 64MCTSPEROPT-009: Budget Profiles and Fallback Policies

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — MCTS config, agent, preset replacement
**Deps**: 64MCTSPEROPT-001, 64MCTSPEROPT-003

## Problem

The old presets (`fast`, `default`, `strong`, `background`) are named by search strength, which is misleading — they are really budget tiers. The spec (section 3.2) requires replacing them with budget-oriented profiles (`interactive`, `turn`, `background`, `analysis`). The spec (section 3.11) also requires explicit fallback policies for when full MCTS is not feasible within the time budget.

## Assumption Reassessment (2026-03-17)

1. `MctsPreset = 'fast' | 'default' | 'strong' | 'background'` and `MCTS_PRESETS` map exist in `config.ts` — **confirmed**.
2. `resolvePreset()` resolves named presets into `MctsConfig` — **confirmed**.
3. `mcts-agent.ts` calls `resolvePreset()` or receives raw config — need to verify.
4. CI workflows reference preset names in test scripts — will need workflow updates (separate ticket).

## Architecture Check

1. Budget profiles are thin wrappers over `MctsConfig` — raw config remains supported.
2. Fallback policies are explicit and reuse family-ordering logic for coherent behavior across budgets.
3. Old preset names are deprecated, not aliased — no backwards-compatibility shims.

## What to Change

### 1. Add new budget profile type

```typescript
type MctsBudgetProfile = 'interactive' | 'turn' | 'background' | 'analysis';
```

### 2. Define budget profile configs

- `interactive`: ~200 iterations, 2s time limit, heuristic leaf eval, lazy classification, aggressive fallback
- `turn`: ~1500 iterations, 10s time limit, heuristic leaf eval, lazy classification, family widening
- `background`: ~5000 iterations, 30s time limit, heuristic leaf eval, optional deterministic parallelism
- `analysis`: large iterations, no time limit, may opt into rollout evaluation on cheap games

### 3. Add `fallbackPolicy` config field

Add `fallbackPolicy?: 'none' | 'policyOnly' | 'sampledOnePly' | 'flatMonteCarlo'` to `MctsConfig`. Default: `'none'`.

### 4. Implement fallback dispatch in `mcts-agent.ts`

When the measured per-iteration cost makes the budget unrealistic (e.g., first iteration exceeds `timeLimitMs / minIterations`), degrade gracefully:
- `policyOnly`: return the move with the highest prior/heuristic score without search.
- `sampledOnePly`: evaluate a small random sample of moves via one-step apply+evaluate.
- `flatMonteCarlo`: uniform random playouts over a small shortlist.

### 5. Deprecate old preset names

Mark `MctsPreset` as deprecated. Add `MctsBudgetProfile` as the replacement. Add `resolveBudgetProfile()` function. Keep `resolvePreset()` functional but deprecated.

### 6. Update `mcts-agent.ts` to accept budget profiles

The agent constructor should accept `MctsBudgetProfile | MctsConfig`.

## Files to Touch

- `packages/engine/src/agents/mcts/config.ts` (modify — new profile type, fallback policy, deprecate old presets)
- `packages/engine/src/agents/mcts/mcts-agent.ts` (modify — budget profile resolution, fallback dispatch)
- `packages/engine/src/agents/mcts/search.ts` (modify — if fallback entry points live here)
- `packages/engine/src/agents/mcts/index.ts` (modify — export new types)

## Out of Scope

- CI workflow preset name updates (ticket 64MCTSPEROPT-014)
- Direct-mode evaluation tuning (ticket 64MCTSPEROPT-010)
- Parallel search (Phase 6)
- Deleting rollout/MAST code

## Acceptance Criteria

### Tests That Must Pass

1. `resolveBudgetProfile('interactive')` produces a valid `MctsConfig` with heuristic leaf eval and short budget.
2. `resolveBudgetProfile('turn')` produces a valid `MctsConfig` with family widening enabled.
3. `resolveBudgetProfile('background')` produces a valid `MctsConfig` with 30s time limit.
4. `resolveBudgetProfile('analysis')` produces a valid `MctsConfig` that may use rollout evaluation.
5. Fallback `policyOnly`: returns a move without running search iterations.
6. Fallback `sampledOnePly`: evaluates ≤ shortlist-size candidates.
7. Old `resolvePreset('fast')` still works (deprecated but functional).
8. `pnpm -F @ludoforge/engine test` — full suite passes.
9. `pnpm turbo typecheck` passes.

### Invariants

1. Raw `MctsConfig` still supported — profiles are optional convenience.
2. `fallbackPolicy: 'none'` means no degradation (search runs to budget or iteration cap).
3. Fallback policies reuse family-ordering logic from expansion for coherent behavior.
4. No game-specific logic in profiles.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/mcts/budget-profiles.test.ts` (new) — covers all profiles, fallback policies.
2. `packages/engine/test/unit/agents/mcts/mcts-agent.test.ts` — update to use budget profiles.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

**Completion date**: 2026-03-18

**What changed**:
- `config.ts`: Added `MctsBudgetProfile` type (`interactive` | `turn` | `background` | `analysis`), `BUDGET_PROFILES` map, `resolveBudgetProfile()`, `FallbackPolicy` type, `fallbackPolicy` field on `MctsConfig` with validation. Old `MctsPreset`/`MCTS_PRESETS`/`resolvePreset` marked `@deprecated`.
- `mcts-agent.ts`: Constructor accepts `MctsBudgetProfile | Partial<MctsConfig>`. Added `fallbackPolicyOnly`, `fallbackSampledOnePly`, `fallbackFlatMonteCarlo`, and `dispatchFallback` functions. Fallback triggers when search produces ≤1 visit.
- `index.ts`: Exports new types and functions.
- `factory.ts`: `parseAgentSpec` recognizes budget profile names alongside legacy presets.
- `budget-profiles.test.ts` (new): 35 tests covering profiles, fallbacks, constructor, backward compat, invariants.
- `factory.test.ts`: Updated error message regex.

**Deviations from plan**:
- `search.ts` was not modified — fallback entry points live in `mcts-agent.ts` since they bypass the search loop entirely.
- `mcts-agent.test.ts` was not modified — new tests live in dedicated `budget-profiles.test.ts`.

**Verification**:
- `pnpm turbo build` ✅
- `pnpm turbo typecheck` ✅
- `pnpm turbo lint` ✅
- `pnpm -F @ludoforge/engine test` — 5112/5112 pass ✅
