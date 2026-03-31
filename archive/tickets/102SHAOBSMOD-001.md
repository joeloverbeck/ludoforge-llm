# 102SHAOBSMOD-001: Rename shared visibility types (remove AgentPolicy prefix)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `types-core.ts`, `schemas-core.ts`, 15 consuming source/test files
**Deps**: `specs/102-shared-observer-model.md`

## Problem

Shared surface visibility types carry an `AgentPolicy` prefix, implying they are agent-specific. Per Spec 102 Part D and FOUNDATIONS.md #4/#5, these types are shared by all clients (agents, runner, simulator). The prefix must be removed so the types reflect their shared nature before observers are built on top of them.

## Assumption Reassessment (2026-04-01)

1. The 10 types listed in Spec 102 Part D all exist in `packages/engine/src/kernel/types-core.ts` — confirmed via grep.
2. 17 files consume these types (not ~38 as the spec estimated) — confirmed via grep across `*.ts`.
3. `GameDef.schema.json` at `packages/engine/schemas/GameDef.schema.json` exists and will need regeneration after Zod schema renames in `schemas-core.ts`.
4. Types that are genuinely agent-specific (`CompiledAgentProfile`, `AgentPolicyCatalog`, `AgentPolicyOperator`, etc.) are NOT renamed — confirmed the spec's exclusion list matches codebase usage.

## Architecture Check

1. Pure mechanical rename — no behavioral change. Aligns naming with shared-observer architecture before new types are added.
2. No game-specific logic introduced. Types remain generic.
3. No aliases or shims — per FOUNDATIONS.md #14, all consuming files updated in the same change.

## What to Change

### 1. Rename types in `packages/engine/src/kernel/types-core.ts`

Apply the following renames:

| Current Name | New Name |
|---|---|
| `AgentPolicySurfaceVisibilityClass` | `SurfaceVisibilityClass` |
| `CompiledAgentPolicySurfacePreviewVisibility` | `CompiledSurfacePreviewVisibility` |
| `CompiledAgentPolicySurfaceVisibility` | `CompiledSurfaceVisibility` |
| `CompiledAgentPolicySurfaceCatalog` | `CompiledSurfaceCatalog` |
| `CompiledAgentPolicySurfaceRefFamily` | `SurfaceRefFamily` |
| `CompiledAgentPolicySurfaceRef` | `CompiledSurfaceRef` |
| `CompiledAgentPolicySurfaceRefBase` | `CompiledSurfaceRefBase` |
| `CompiledAgentPolicySurfaceSelector` | `SurfaceSelector` |
| `CompiledAgentPolicyCurrentSurfaceRef` | `CompiledCurrentSurfaceRef` |
| `CompiledAgentPolicyPreviewSurfaceRef` | `CompiledPreviewSurfaceRef` |

### 2. Update all 17 consuming files

Update imports and type references in:

**Source files:**
- `packages/engine/src/kernel/schemas-core.ts`
- `packages/engine/src/agents/policy-surface.ts`
- `packages/engine/src/agents/policy-runtime.ts`
- `packages/engine/src/agents/policy-preview.ts`
- `packages/engine/src/agents/policy-evaluation-core.ts`
- `packages/engine/src/agents/policy-diagnostics.ts`
- `packages/engine/src/agents/policy-annotation-resolve.ts`
- `packages/engine/src/cnl/compile-agents.ts`

**Test files:**
- `packages/engine/test/unit/agents/policy-eval.test.ts`
- `packages/engine/test/unit/agents/policy-preview.test.ts`
- `packages/engine/test/unit/agents/policy-runtime-annotation.test.ts`
- `packages/engine/test/unit/agents/policy-runtime.test.ts`
- `packages/engine/test/unit/agents/policy-surface-annotation.test.ts`
- `packages/engine/test/unit/agents/policy-surface.test.ts`
- `packages/engine/test/unit/property/policy-visibility.test.ts`
- `packages/engine/test/integration/agents/policy-annotation-e2e.test.ts`
- `packages/engine/test/integration/card-surface-resolution.test.ts`

### 3. Regenerate GameDef JSON schema

Run `pnpm turbo schema:artifacts` to regenerate `packages/engine/schemas/GameDef.schema.json` with the new type names.

### 4. Update golden test fixtures

Update any golden JSON fixtures that reference the old type names in their expected output.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/agents/policy-surface.ts` (modify)
- `packages/engine/src/agents/policy-runtime.ts` (modify)
- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)
- `packages/engine/src/agents/policy-diagnostics.ts` (modify)
- `packages/engine/src/agents/policy-annotation-resolve.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-preview.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-runtime-annotation.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-runtime.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-surface-annotation.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-surface.test.ts` (modify)
- `packages/engine/test/unit/property/policy-visibility.test.ts` (modify)
- `packages/engine/test/integration/agents/policy-annotation-e2e.test.ts` (modify)
- `packages/engine/test/integration/card-surface-resolution.test.ts` (modify)
- `packages/engine/schemas/GameDef.schema.json` (modify — regenerated)

## Out of Scope

- Renaming agent-specific types (`CompiledAgentProfile`, `AgentPolicyCatalog`, `AgentPolicyOperator`, etc.)
- Adding new types (`CompiledObserverCatalog`, etc.) — that is ticket 005
- Any behavioral change — this is a pure rename
- Changing `game-spec-doc.ts` types (those are renamed in ticket 002)

## Acceptance Criteria

### Tests That Must Pass

1. All existing tests pass with zero assertion changes (only type name references change)
2. `pnpm turbo typecheck` passes — no type errors from dangling old names
3. `pnpm turbo schema:artifacts` succeeds and schema diff shows only name changes

### Invariants

1. No runtime behavioral change — same compiled output for any GameSpecDoc
2. No aliases or re-exports of old names anywhere in the codebase
3. Zero grep hits for old type names after this change

## Test Plan

### New/Modified Tests

1. No new tests — existing tests are the behavioral equivalence proof (Spec 102 Testing item 6)

### Commands

1. `pnpm -F @ludoforge/engine test` — full engine test suite
2. `pnpm turbo typecheck` — type correctness
3. `pnpm turbo lint` — lint compliance
4. `pnpm turbo schema:artifacts` — schema regeneration

## Outcome

- **Completion date**: 2026-04-01
- **What changed**: All 10 `AgentPolicy*` surface visibility types renamed to shared equivalents across 17 files (types-core.ts + 8 source + 8 test files). Schema artifacts regenerated. 129 insertions, 129 deletions — pure rename, zero net line changes.
- **Deviations**: `packages/engine/test/unit/property/policy-visibility.test.ts` was listed in the ticket but contains zero references to any renamed type — correctly skipped (16 consuming files, not 17).
- **Verification**: 5365 engine tests pass (0 failures), typecheck clean, lint clean, schema artifacts in sync, zero grep hits for old type names.
