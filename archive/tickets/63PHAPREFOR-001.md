# 63PHAPREFOR-001: Add Phase 1 preview config fields to types, YAML schema, and compiler

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel types, CNL compiler/validator, YAML schema
**Deps**: None

## Problem

PolicyAgent's Phase 1 cannot discriminate between action types based on projected game-state outcomes because preview features are unconditionally skipped. Before adding the Phase 1 completion logic, the type system, YAML schema, and compiler must support the new `phase1` and `phase1CompletionsPerAction` preview config fields.

## Assumption Reassessment (2026-04-10)

1. `CompiledAgentPreviewConfig` in `packages/engine/src/kernel/types-core.ts:706-708` currently has only a `mode: AgentPreviewMode` field — confirmed, no `phase1` fields exist.
2. `GameSpecAgentProfileDef.preview` in `packages/engine/src/cnl/game-spec-doc.ts:661-663` currently accepts only `{ mode?: string }` — confirmed.
3. `lowerPreviewConfig()` in `packages/engine/src/cnl/compile-agents.ts:662-717` compiles only `mode` — confirmed. New fields need compilation with defaults (`false`, `1`).
4. `validate-agents.ts` includes `'preview'` in `AGENT_PROFILE_KEYS` — confirmed. Validation delegates to compilation; no separate structural validation for preview sub-fields.

## Architecture Check

1. Adding optional fields to `CompiledAgentPreviewConfig` is additive — all existing code that reads `profile.preview.mode` continues to work unchanged.
2. The new fields are generic agent configuration, not game-specific — they control how the policy agent evaluates candidates, not what game rules mean. Preserves Foundation 1 (Engine Agnosticism).
3. No backwards-compatibility shims needed. Profiles without the new fields get defaults via `lowerPreviewConfig()`. Per Foundation 14, no alias paths.

## What to Change

### 1. Extend `CompiledAgentPreviewConfig` in types-core.ts

Add two optional readonly fields:

```typescript
export interface CompiledAgentPreviewConfig {
  readonly mode: AgentPreviewMode;
  readonly phase1?: boolean;
  readonly phase1CompletionsPerAction?: number;
}
```

Fields are optional so existing compiled GameDefs remain valid without migration.

### 2. Extend `GameSpecAgentProfileDef.preview` in game-spec-doc.ts

```typescript
readonly preview?: {
  readonly mode?: string;
  readonly phase1?: boolean;
  readonly phase1CompletionsPerAction?: number;
};
```

### 3. Update `lowerPreviewConfig()` in compile-agents.ts

After validating `mode`, compile the new fields:

- `phase1`: boolean, default `false`. If present and not a boolean, emit diagnostic error.
- `phase1CompletionsPerAction`: positive integer, default `1`. If present and not a positive safe integer, emit diagnostic error. If `phase1` is `false` and `phase1CompletionsPerAction` is set, emit diagnostic warning (field has no effect).

Return the new fields in the compiled output.

### 4. Add validation diagnostics

Add new diagnostic codes to `compile-agents.ts` diagnostic code registry:

- `CNL_COMPILER_AGENT_PREVIEW_PHASE1_INVALID` — `phase1` is not a boolean
- `CNL_COMPILER_AGENT_PREVIEW_PHASE1_COMPLETIONS_INVALID` — `phase1CompletionsPerAction` is not a positive safe integer
- `CNL_COMPILER_AGENT_PREVIEW_PHASE1_COMPLETIONS_UNUSED` (warning) — `phase1CompletionsPerAction` set but `phase1` is false

### 5. Unit tests for compilation

Add tests in the appropriate compile-agents test file:

- Profile with `phase1: true` compiles successfully, output includes `phase1: true` and `phase1CompletionsPerAction: 1` (default)
- Profile with `phase1: true, phase1CompletionsPerAction: 3` compiles with specified value
- Profile with `phase1: false` (or omitted) compiles with `phase1` absent or false
- Profile with `phase1: "yes"` (non-boolean) emits error diagnostic
- Profile with `phase1CompletionsPerAction: 0` emits error diagnostic
- Profile with `phase1CompletionsPerAction: 2` but `phase1: false` emits warning diagnostic

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/test/unit/cnl/compile-agents.test.ts` (modify — add tests for new preview fields)

## Out of Scope

- Phase 1 completion logic in `policy-agent.ts` (ticket 002)
- Conditional preview skip in `policy-eval.ts` (ticket 002)
- Schema artifact regeneration (ticket 003)
- Fixture migration (ticket 003)
- Integration tests (ticket 004)

## Acceptance Criteria

### Tests That Must Pass

1. Compilation of profile with `phase1: true` produces correct `CompiledAgentPreviewConfig` output
2. Compilation of profile with invalid `phase1` or `phase1CompletionsPerAction` values produces correct diagnostics
3. Compilation of profile without `phase1` fields produces output identical to current behavior (no regression)
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. All existing profiles compile identically — new fields are optional with backward-compatible defaults
2. `CompiledAgentPreviewConfig` remains a readonly interface with no mutable state
3. No game-specific logic introduced in compiler or types

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/cnl/compile-agents.test.ts` — new test group for Phase 1 preview config compilation and validation diagnostics

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "preview"`
2. `pnpm turbo build && pnpm turbo test`
3. `pnpm turbo typecheck`

## Outcome (2026-04-10)

- Implemented the new authored and compiled preview config fields in `packages/engine/src/cnl/game-spec-doc.ts`, `packages/engine/src/cnl/compile-agents.ts`, `packages/engine/src/kernel/types-core.ts`, and `packages/engine/src/kernel/schemas-core.ts`.
- Added the new preview diagnostics to `packages/engine/src/cnl/compiler-diagnostic-codes.ts` and covered the feature in the live owning test file `packages/engine/test/unit/compile-agents-authoring.test.ts`. The draft ticket's original test path was stale; the real coverage lives there.
- Absorbed the minimum Foundation-14 fallout that blocked the ticket-authoritative engine test: regenerated `packages/engine/schemas/GameDef.schema.json`, `packages/engine/schemas/EvalReport.schema.json`, and `packages/engine/schemas/Trace.schema.json`, plus refreshed `packages/engine/test/fixtures/gamedef/fitl-policy-catalog.golden.json`, `packages/engine/test/fixtures/gamedef/texas-policy-catalog.golden.json`, and `packages/engine/test/fixtures/trace/texas-policy-summary.golden.json`.
- Verified with `pnpm -F @ludoforge/engine build`, a repo-correct focused check via `pnpm -F @ludoforge/engine exec node --test dist/test/unit/compile-agents-authoring.test.js` after build, `pnpm -F @ludoforge/engine test`, and `pnpm turbo typecheck`. The draft ticket's sample `--test-name-pattern` command was stale for this repo's Node test runner and was replaced with the built-file equivalent.
- No runtime Phase 1 preview behavior landed here. Ticket `63PHAPREFOR-002` still owns the policy-agent/policy-eval rollout, and ticket `63PHAPREFOR-003` now retains only the post-002 determinism/integration fallout that may still emerge once runtime behavior changes.
