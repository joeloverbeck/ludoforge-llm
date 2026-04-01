# 105EXPPRECON-001: Atomic migration from `tolerateRngDivergence` to explicit `preview.mode`

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler, runtime, traces, schemas, data, tests
**Deps**: `archive/specs/102-shared-observer-model.md`, `archive/specs/104-unified-decision-context-considerations.md`, `specs/105-explicit-preview-contracts.md`

## Problem

The current 105 ticket split assumes the repo can safely pass through an intermediate state where the type surface changes first and the compiler, runtime, traces, YAML, schema artifacts, and tests are migrated later. That boundary is not valid under `docs/FOUNDATIONS.md` principle 14.

The live repo still uses `preview.tolerateRngDivergence` across:

1. authored profile docs
2. compiled/kernel types and Zod schemas
3. compiler lowering and diagnostics
4. runtime preview execution
5. trace output and summary types
6. production goldens and tests

Replacing only the type layer would leave the repo internally inconsistent. This ticket therefore owns the full atomic migration to the explicit `preview.mode` contract.

## Assumption Reassessment (2026-04-01)

1. `packages/engine/src/kernel/types-core.ts` still defines `PreviewToleranceConfig` with `tolerateRngDivergence: boolean` and uses it on `CompiledAgentProfile.preview` — confirmed.
2. `packages/engine/src/kernel/schemas-core.ts` still validates `preview.tolerateRngDivergence` as a boolean — confirmed.
3. `packages/engine/src/cnl/game-spec-doc.ts` still exposes authored `preview.tolerateRngDivergence?: boolean` — confirmed.
4. `packages/engine/src/contracts/policy-contract.ts` still exports `AGENT_POLICY_PREVIEW_KEYS = ['tolerateRngDivergence']` — confirmed.
5. `packages/engine/src/cnl/compile-agents.ts` still lowers `preview.tolerateRngDivergence` and defaults it to `false` — confirmed.
6. `packages/engine/src/agents/policy-preview.ts` and `packages/engine/src/agents/policy-runtime.ts` still branch on the boolean runtime contract — confirmed.
7. `packages/engine/src/kernel/types-core.ts`, `packages/engine/src/kernel/schemas-core.ts`, and runtime evaluation code already contain preview trace structures that must be kept in sync with the new contract — confirmed.
8. FITL production authored data and goldens still reference `tolerateRngDivergence`; Texas still lacks the explicit disabled preview mode called for by the spec — confirmed.
9. The original 105 ticket split would require a temporary mixed-contract state across owned artifacts — not Foundation-compliant.

## Architecture Check

1. `preview.mode` remains engine-agnostic and evolution-authored.
2. Validation belongs in the compiler; runtime consumes only compiled modes.
3. Hidden-info filtering and unresolved-decision handling remain at their existing architectural layers; `preview.mode` governs RNG-divergence handling and the disabled fast-path only.
4. Trace shape, JSON schema, authored docs, compiled/kernel types, production data, and tests must move together in one atomic change.

## What to Change

### 1. Replace the preview contract across authored and compiled types

Introduce:

```typescript
export type AgentPreviewMode = 'exactWorld' | 'tolerateStochastic' | 'disabled';

export interface CompiledAgentPreviewConfig {
  readonly mode: AgentPreviewMode;
}
```

Remove `PreviewToleranceConfig` and all remaining type-level uses of `tolerateRngDivergence`.

Update:

1. `packages/engine/src/kernel/types-core.ts`
2. `packages/engine/src/kernel/schemas-core.ts`
3. `packages/engine/src/cnl/game-spec-doc.ts`
4. `packages/engine/src/contracts/policy-contract.ts`

### 2. Rewrite compiler lowering and diagnostics for `preview.mode`

Update `packages/engine/src/cnl/compile-agents.ts` and `packages/engine/src/cnl/compiler-diagnostic-codes.ts` so that:

1. omitted `preview` compiles to the strict default `{ mode: 'exactWorld' }`
2. `preview` present without `mode` emits a dedicated diagnostic
3. invalid mode values emit a dedicated diagnostic
4. reserved future modes emit a dedicated diagnostic that explains they are not implemented yet
5. no compatibility path remains for `preview.tolerateRngDivergence`

### 3. Migrate runtime preview execution to mode-based semantics

Update `packages/engine/src/agents/policy-preview.ts`, `packages/engine/src/agents/policy-runtime.ts`, and any adjacent consumers so that:

1. `exactWorld` returns `unknown/random` on RNG divergence
2. `tolerateStochastic` preserves the current accepted-divergence behavior and records `stochastic`
3. `disabled` skips preview evaluation entirely and makes all `preview.*` refs resolve as unknown

### 4. Extend trace contracts and trace recording

Update preview trace types and runtime trace recording so that:

1. `PolicyPreviewUsageTrace` records `mode`
2. `PolicyPreviewOutcomeBreakdownTrace` records `stochastic`
3. disabled preview traces remain coherent and deterministic

### 5. Migrate authored data, schema artifacts, and fixtures

Update owned authored and generated artifacts together:

1. FITL `vc-evolved` uses `preview.mode: tolerateStochastic`
2. Texas Hold'em `baseline` uses `preview.mode: disabled`
3. `packages/engine/schemas/GameDef.schema.json` reflects the new compiled shape
4. affected compiled goldens, trace goldens, schema tests, runtime tests, and integration tests are updated
5. the repo has zero remaining uses of `tolerateRngDivergence`

## Files to Touch

- `packages/engine/src/kernel/types-core.ts`
- `packages/engine/src/kernel/schemas-core.ts`
- `packages/engine/src/cnl/game-spec-doc.ts`
- `packages/engine/src/contracts/policy-contract.ts`
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts`
- `packages/engine/src/cnl/compile-agents.ts`
- `packages/engine/src/agents/policy-preview.ts`
- `packages/engine/src/agents/policy-runtime.ts`
- `packages/engine/src/agents/policy-eval.ts`
- `packages/engine/schemas/GameDef.schema.json`
- `data/games/fire-in-the-lake/92-agents.md`
- `data/games/texas-holdem/92-agents.md`
- affected tests and fixtures in `packages/engine/test/`

## Out of Scope

- Implementing reserved future modes such as `infoSetSample` or `enumeratePublicChance`
- Changing hidden-info filtering semantics
- Changing unresolved-decision classification semantics
- Multi-ply search or broader preview-system redesign

## Acceptance Criteria

### Tests That Must Pass

1. `preview.mode: exactWorld`, `tolerateStochastic`, and `disabled` all compile and execute with the intended semantics
2. `preview` present without `mode` emits a dedicated compiler diagnostic
3. reserved preview modes emit a dedicated compiler diagnostic
4. preview traces include `mode` and a `stochastic` breakdown count
5. FITL `vc-evolved` compiles and preserves expected move-selection behavior under `tolerateStochastic`
6. Texas Hold'em `baseline` compiles with `preview.mode: disabled`
7. `pnpm turbo schema:artifacts` and `pnpm -F @ludoforge/engine run schema:artifacts:check` pass
8. repo grep finds zero remaining `tolerateRngDivergence` references in owned source, tests, data, and schemas
9. full verification passes: `pnpm turbo build`, `pnpm turbo test`, `pnpm turbo lint`, `pnpm turbo typecheck`

### Invariants

1. Same profile + same state + same seed = same preview results and traces
2. Preview never consumes the authoritative game RNG stream
3. `preview` remains author-authored data, not imperative logic
4. No compatibility shim remains for the legacy boolean contract

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-agents-authoring.test.ts`
2. `packages/engine/test/unit/agents/policy-preview.test.ts`
3. `packages/engine/test/unit/agents/policy-runtime.test.ts`
4. `packages/engine/test/unit/trace/policy-trace-events.test.ts`
5. `packages/engine/test/unit/schemas-top-level.test.ts`
6. `packages/engine/test/integration/fitl-policy-agent.test.ts`
7. any affected golden fixture or schema-artifact checks discovered during implementation

### Commands

1. `pnpm turbo schema:artifacts`
2. `pnpm -F @ludoforge/engine run schema:artifacts:check`
3. `pnpm turbo build`
4. `pnpm turbo test`
5. `pnpm turbo lint`
6. `pnpm turbo typecheck`
7. `rg -n "tolerateRngDivergence" packages data -g '*.ts' -g '*.md' -g '*.json'`

## Ticket Series Reassignment

Tickets `105EXPPRECON-002` through `105EXPPRECON-005` no longer own staged migration slices. They are deferred until after this atomic migration lands and a post-ticket review determines whether any concrete residual work remains.

## Outcome

Completed: 2026-04-01

What changed:
1. Replaced the authored and compiled preview contract with explicit `preview.mode` across compiler lowering, runtime preview execution, trace types, kernel schemas, authored game data, generated schemas, and owned fixtures.
2. Added dedicated compiler diagnostics for missing, invalid, and reserved preview modes and removed the legacy `tolerateRngDivergence` contract from owned source, data, tests, and schemas.
3. Updated FITL and Texas production agent docs plus the affected unit, integration, property, golden, and schema-artifact coverage to the new preview semantics.

Deviations from original plan:
1. The ticket was rewritten before implementation so `105EXPPRECON-001` owned the full atomic migration instead of only the original staged type slice.
2. During verification, a broader FITL helper assumption was fixed in the relevant integration coverage so the tests validated the injected profile/consideration behavior claimed by the ticket.

Verification:
1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine run schema:artifacts`
4. `pnpm -F @ludoforge/engine run schema:artifacts:check`
5. Focused engine `node --test` verification for compile/runtime/trace/golden/FITL/Texas coverage
6. `pnpm turbo build`
7. `pnpm turbo test`
8. `pnpm turbo lint`
9. `pnpm turbo typecheck`
