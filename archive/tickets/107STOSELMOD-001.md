# 107STOSELMOD-001: Add selection mode types, schema, and compiler validation

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — types-core, schemas-core, game-spec-doc, compile-agents, compiler-diagnostic-codes, GameDef.schema.json
**Deps**: `archive/specs/104-unified-decision-context-considerations.md`, `specs/107-stochastic-selection-modes.md`

## Problem

The agent policy evaluation pipeline always selects via deterministic argmax. To support imperfect-information games (Texas Hold'em) and MAP-Elites behavioral diversity, agent profiles need a declarative `selectionMode` controlling how the final move is chosen from scored candidates. This ticket introduces the foundational types and compiler validation that all subsequent tickets depend on.

## Assumption Reassessment (2026-04-02)

1. `CompiledAgentProfile` at `packages/engine/src/kernel/types-core.ts:699` has no `selection` field — confirmed.
2. `schemas-core.ts` has Zod schemas for agent profiles including preview config — confirmed; selection schema follows the same pattern.
3. `game-spec-doc.ts` has `GameSpecAgentProfileDef` with optional `preview` — confirmed; `selection` follows the same pattern.
4. `compile-agents.ts` has `lowerPreviewConfig()` at ~line 652 — confirmed; `lowerSelectionConfig()` follows the same pattern.
5. `compiler-diagnostic-codes.ts` has preview-specific codes (`CNL_COMPILER_AGENT_PREVIEW_MODE_*`) — confirmed; selection codes follow the same naming convention.
6. No existing `AgentSelectionMode`, `CompiledAgentSelectionConfig`, or `selection` field anywhere — confirmed.

## Architecture Check

1. Selection mode is purely additive — default `argmax` preserves all existing behavior. No migration needed for existing profiles (Foundation 14 satisfied without atomic migration).
2. The `selection` config follows the exact same pattern as `preview` config: optional authored field, compiled to a required field with defaults, validated by compiler.
3. Selection modes are game-agnostic — any game can use any mode (Foundation 1).
4. Selection mode lives in GameSpecDoc YAML — evolution can mutate it (Foundation 2).

## What to Change

### 1. Define types in `types-core.ts`

Add near existing preview types:

```typescript
export type AgentSelectionMode = 'argmax' | 'softmaxSample' | 'weightedSample';

export interface CompiledAgentSelectionConfig {
  readonly mode: AgentSelectionMode;
  readonly temperature?: number;  // required when mode is 'softmaxSample'
}
```

Add `selection` field to `CompiledAgentProfile`:

```typescript
readonly selection: CompiledAgentSelectionConfig;  // defaults to { mode: 'argmax' }
```

### 2. Update Zod schema in `schemas-core.ts`

Add selection schema to the agent profile schema:

```typescript
selection: z.object({
  mode: z.enum(['argmax', 'softmaxSample', 'weightedSample']),
  temperature: z.number().positive().optional(),
})
```

### 3. Update authored type in `game-spec-doc.ts`

Add to `GameSpecAgentProfileDef`:

```typescript
readonly selection?: {
  readonly mode?: string;
  readonly temperature?: number;
};
```

### 4. Add diagnostic codes to `compiler-diagnostic-codes.ts`

```typescript
CNL_COMPILER_AGENT_SELECTION_MODE_MISSING: 'CNL_COMPILER_AGENT_SELECTION_MODE_MISSING',
CNL_COMPILER_AGENT_SELECTION_MODE_INVALID: 'CNL_COMPILER_AGENT_SELECTION_MODE_INVALID',
CNL_COMPILER_AGENT_SELECTION_MODE_RESERVED: 'CNL_COMPILER_AGENT_SELECTION_MODE_RESERVED',
CNL_COMPILER_AGENT_SELECTION_TEMPERATURE_REQUIRED: 'CNL_COMPILER_AGENT_SELECTION_TEMPERATURE_REQUIRED',
CNL_COMPILER_AGENT_SELECTION_TEMPERATURE_INVALID: 'CNL_COMPILER_AGENT_SELECTION_TEMPERATURE_INVALID',
```

### 5. Implement `lowerSelectionConfig()` in `compile-agents.ts`

Follow the `lowerPreviewConfig()` pattern:

1. If `selection` omitted → return `{ mode: 'argmax' }` (default).
2. If `selection` present but `mode` missing → emit `SELECTION_MODE_MISSING`.
3. If `mode` is not in valid set → emit `SELECTION_MODE_INVALID`.
4. If `mode` is a reserved value (`topKSample`, `epsilonGreedy`) → emit `SELECTION_MODE_RESERVED`.
5. If `mode` is `softmaxSample` and `temperature` is missing or ≤ 0 → emit `TEMPERATURE_REQUIRED` or `TEMPERATURE_INVALID`.
6. Otherwise → return `{ mode, temperature }`.

Wire into the profile assembly (near the `preview` line).

### 6. Update `GameDef.schema.json`

Run `pnpm turbo schema:artifacts` to regenerate from types.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/schemas/GameDef.schema.json` (regenerate)

## Out of Scope

- Runtime selection logic in `policy-eval.ts` (ticket 002)
- Trace recording (ticket 003)
- YAML data migration (ticket 003)
- Changing completion guidance selection (`completion-guidance-choice.ts` stays argmax)

## Acceptance Criteria

### Tests That Must Pass

1. `selection.mode: 'argmax'` compiles successfully
2. `selection.mode: 'softmaxSample'` with `temperature: 0.5` compiles successfully
3. `selection.mode: 'weightedSample'` compiles successfully
4. Omitted `selection` defaults to `{ mode: 'argmax' }`
5. `selection` present without `mode` emits diagnostic
6. Invalid mode value emits diagnostic
7. Reserved mode (`topKSample`) emits diagnostic with descriptive message
8. `softmaxSample` without `temperature` emits diagnostic
9. `softmaxSample` with `temperature: 0` or negative emits diagnostic
10. `pnpm turbo typecheck` passes
11. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `AgentSelectionMode` is a union of string literals, consistent with `AgentPreviewMode`
2. `CompiledAgentProfile.selection` is non-optional (always populated with at least the default)
3. No game-specific identifiers in type definitions
4. All existing profiles compile unchanged (default argmax)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-agents-authoring.test.ts` — add selection config compilation tests (valid modes, reserved modes, missing mode, temperature validation, default)
2. `packages/engine/test/unit/schemas-top-level.test.ts` — update if schema golden affected

### Commands

1. `node --test packages/engine/dist/test/unit/cnl/compile-agents-authoring.test.js`
2. `pnpm turbo schema:artifacts`
3. `pnpm turbo build && pnpm turbo test`

## Outcome

Completed: 2026-04-02

- Added authored and compiled `selection` config support for agent profiles, including `AgentSelectionMode`, `CompiledAgentSelectionConfig`, required compiled `profile.selection`, and authored `GameSpecAgentProfileDef.selection`.
- Implemented compiler lowering and diagnostics for `selection.mode` and `selection.temperature` in `compile-agents.ts` and `compiler-diagnostic-codes.ts`, with default `{ mode: 'argmax' }`, reserved-mode rejection, and softmax temperature validation.
- Regenerated `packages/engine/schemas/GameDef.schema.json` and updated affected tests, compiled-profile fixtures, and owned production goldens to include the new required defaulted selection field.

Deviations from original plan:

- The ticket's referenced authoring test path was stale (`packages/engine/test/unit/cnl/compile-agents-authoring.test.ts`); the live owned coverage point was `packages/engine/test/unit/compile-agents-authoring.test.ts`, and the implementation used that path without changing scope.
- Full verification also required updating owned production policy goldens because the additive compiled-field change legitimately changed the compiled catalog and fixed-seed summary fixture shape.

Verification:

- `pnpm -F @ludoforge/engine typecheck`
- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine run schema:artifacts`
- `pnpm -F @ludoforge/engine run schema:artifacts:check`
- `node --test "dist/test/unit/compile-agents-authoring.test.js" "dist/test/unit/schemas-top-level.test.js"` (from `packages/engine`)
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo typecheck`
