# 98PREPIPRNGTOL-001: Add PreviewToleranceConfig type, schema, and contract constant

**Status**: DONE
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel types, schemas, and contracts
**Deps**: Spec 98 (preview-pipeline-rng-tolerance)

## Problem

The preview pipeline needs a profile-level `preview.tolerateRngDivergence` boolean flag so agents can opt into stochastic preview values. This ticket adds the foundational type, Zod schema, and contract constant — no behavioral changes yet.

## Assumption Reassessment (2026-03-31)

1. `CompiledAgentProfile` (types-core.ts:588-603) currently has `completionGuidance?: CompletionGuidanceConfig` as the pattern for optional config blocks. The new `preview?` field follows the same pattern.
2. `schemas-core.ts` uses `BooleanSchema` from `schemas-ast.ts` — confirmed available.
3. `policy-contract.ts` defines `AGENT_POLICY_COMPLETION_GUIDANCE_KEYS` as a precedent for keyed constant arrays.

## Architecture Check

1. **Cleaner than alternatives**: A dedicated `PreviewToleranceConfig` interface keeps the preview namespace open for future fields without polluting `CompiledAgentProfile` with flat booleans.
2. **Agnostic**: The type is game-agnostic — it's agent-layer config, not kernel behavior. No game-specific branching.
3. **No shims**: New additive type. No backwards-compatibility aliases.

## What to Change

### 1. Add `PreviewToleranceConfig` interface to `types-core.ts`

Add after `CompletionGuidanceConfig` (line ~586):

```typescript
export interface PreviewToleranceConfig {
  readonly tolerateRngDivergence: boolean;
}
```

Add `readonly preview?: PreviewToleranceConfig;` to `CompiledAgentProfile` (after `completionGuidance`).

### 2. Add `preview` schema to `schemas-core.ts`

In the `CompiledAgentProfileSchema` definition, add:

```typescript
preview: z.object({
  tolerateRngDivergence: BooleanSchema,
}).strict().optional(),
```

### 3. Add `AGENT_POLICY_PREVIEW_KEYS` constant to `policy-contract.ts`

```typescript
export const AGENT_POLICY_PREVIEW_KEYS = ['tolerateRngDivergence'] as const;
```

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/contracts/policy-contract.ts` (modify)

## Out of Scope

- Compilation logic (compile-agents.ts) — that's 98PREPIPRNGTOL-002
- Validation logic (validate-agents.ts) — that's 98PREPIPRNGTOL-002
- Preview runtime behavior (policy-preview.ts) — that's 98PREPIPRNGTOL-003
- Input threading (policy-runtime.ts) — that's 98PREPIPRNGTOL-004
- Tests — that's 98PREPIPRNGTOL-005
- Any kernel effect execution or move enumeration changes
- Per-surface RNG tolerance flags

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` — new types compile cleanly with all existing consumers
2. `pnpm turbo build` — no build regressions
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `CompiledAgentProfile` without `preview` field must remain valid (field is optional)
2. `PreviewToleranceConfig` must be readonly throughout
3. No kernel, compiler, or runtime behavioral change — purely additive types

## Test Plan

### New/Modified Tests

1. No new test files — this is a pure type/schema addition. Compilation test coverage added in 98PREPIPRNGTOL-005.

### Commands

1. `pnpm turbo typecheck`
2. `pnpm turbo build`
3. `pnpm -F @ludoforge/engine test`
