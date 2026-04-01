# 105EXPPRECON-001: Add AgentPreviewMode type and CompiledAgentPreviewConfig

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — types-core, schemas-core, game-spec-doc, policy-contract
**Deps**: `archive/specs/102-shared-observer-model.md`, `archive/specs/104-unified-decision-context-considerations.md`, `specs/105-explicit-preview-contracts.md`

## Problem

The preview system uses `tolerateRngDivergence: boolean` as a flat safety valve that conflates distinct preview scenarios (deterministic, stochastic, disabled). Replacing it with an explicit `AgentPreviewMode` enum provides a declarative contract that agent profile authors can reason about and that traces can record for auditability.

This ticket introduces the foundational types that all subsequent tickets depend on.

## Assumption Reassessment (2026-04-01)

1. `PreviewToleranceConfig` exists at `packages/engine/src/kernel/types-core.ts:695-697` with `{ readonly tolerateRngDivergence: boolean }` — confirmed.
2. `CompiledAgentProfile` at `types-core.ts:699` has `readonly preview?: PreviewToleranceConfig` — confirmed.
3. `schemas-core.ts:942` has Zod schema `tolerateRngDivergence: BooleanSchema` — confirmed.
4. `game-spec-doc.ts` has `GameSpecAgentProfileDef.preview?: { readonly tolerateRngDivergence?: boolean }` — confirmed.
5. `policy-contract.ts:27` has `AGENT_POLICY_PREVIEW_KEYS = ['tolerateRngDivergence'] as const` — confirmed.
6. No existing `AgentPreviewMode` or `CompiledAgentPreviewConfig` types anywhere in the codebase — confirmed.

## Architecture Check

1. The new `AgentPreviewMode` enum is game-agnostic — any game can use any mode. No game-specific logic.
2. `CompiledAgentPreviewConfig` replaces `PreviewToleranceConfig` cleanly — same structural position, richer contract. No backwards-compatibility shim; `PreviewToleranceConfig` is deleted.
3. The mode lives in GameSpecDoc YAML (evolution-mutable) and compiles to GameDef (agnostic boundary preserved).

## What to Change

### 1. Define `AgentPreviewMode` type in `types-core.ts`

Add near existing preview types:

```typescript
export type AgentPreviewMode = 'exactWorld' | 'tolerateStochastic' | 'disabled';
```

### 2. Replace `PreviewToleranceConfig` with `CompiledAgentPreviewConfig` in `types-core.ts`

Remove:
```typescript
export interface PreviewToleranceConfig {
  readonly tolerateRngDivergence: boolean;
}
```

Add:
```typescript
export interface CompiledAgentPreviewConfig {
  readonly mode: AgentPreviewMode;
}
```

Update `CompiledAgentProfile`:
```typescript
readonly preview?: CompiledAgentPreviewConfig;  // was PreviewToleranceConfig
```

### 3. Update Zod schema in `schemas-core.ts`

Replace the `tolerateRngDivergence: BooleanSchema` field in the preview schema with:
```typescript
mode: z.enum(['exactWorld', 'tolerateStochastic', 'disabled'])
```

### 4. Update authored type in `game-spec-doc.ts`

Replace `GameSpecAgentProfileDef.preview` type:
```typescript
readonly preview?: {
  readonly mode?: string;  // validated by compiler, not authored type
};
```

### 5. Update `policy-contract.ts`

Change:
```typescript
export const AGENT_POLICY_PREVIEW_KEYS = ['mode'] as const;
```

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/contracts/policy-contract.ts` (modify)

## Out of Scope

- Compiler validation logic (ticket 002)
- Runtime mode-based branching (ticket 003)
- Trace type changes (ticket 004)
- YAML data file migration (ticket 005)
- Test updates beyond type-check compilation (downstream tickets)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` passes with no errors — all consumers of the old types compile against the new types
2. `pnpm turbo build` succeeds
3. Existing suite: `pnpm -F @ludoforge/engine test` (some tests may need minor type fixes to compile; fix only type-level changes, not behavioral)

### Invariants

1. `AgentPreviewMode` is a union of string literals, not an enum — consistent with other DSL types in `types-core.ts`
2. `CompiledAgentProfile.preview` remains optional — profiles without preview config default to `exactWorld` (enforced by compiler in ticket 002)
3. No game-specific identifiers appear in the type definitions

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/schemas-top-level.test.ts` — update any snapshot/golden that includes the preview schema shape

### Commands

1. `pnpm turbo typecheck`
2. `pnpm turbo build && pnpm turbo test`
