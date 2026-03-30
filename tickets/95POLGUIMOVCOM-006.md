# 95POLGUIMOVCOM-006: Compile `completionScoreTerms` and `completionGuidance` from YAML

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — cnl compile-agents, agents policy-expr
**Deps**: 95POLGUIMOVCOM-002 (types), 95POLGUIMOVCOM-003 (validation)

## Problem

The agent compiler (`compile-agents.ts`) does not compile `completionScoreTerms` library entries or `completionGuidance` profile fields. Even with correct types and validation, the YAML-to-compiled-GameDef pipeline will silently drop these sections. Additionally, the YAML shorthand `{ ref: decision.type }` and `{ ref: option.value }` must be recognized by the expression compiler and lowered to the correct `CompiledAgentPolicyRef` forms.

## Assumption Reassessment (2026-03-30)

1. `lowerAgents` in `compile-agents.ts` compiles the library via `AgentLibraryCompiler` which handles `scoreTerms`, `pruningRules`, etc. Adding `completionScoreTerms` follows the same pattern. Confirmed.
2. `analyzePolicyExpr` in `policy-expr.ts` parses YAML expressions into `AgentPolicyExpr` trees. It handles `{ ref: ... }` shorthand for existing ref kinds. Adding `decision.*` and `option.*` shorthand follows the same dispatch pattern. Confirmed.
3. Profile lowering in `compile-agents.ts` compiles `use.scoreTerms`, `use.pruningRules`, etc. as arrays of library key references. `use.completionScoreTerms` follows the same pattern. Confirmed.
4. `completionGuidance` is a simple config object (enabled, fallback) — no expression compilation needed, just shape lowering. Confirmed.

## Architecture Check

1. Cleanest approach: extend `AgentLibraryCompiler` to compile `completionScoreTerms` using the same `compileScoreTerm` helper already used for `scoreTerms`. The only new work is ref shorthand expansion for `decision.*` and `option.*`.
2. Engine agnosticism: the compiler lowers generic YAML to generic compiled types. No game identifiers.
3. No backwards-compatibility shims: new compilation only activates when `completionScoreTerms` or `completionGuidance` are present in the YAML.

## What to Change

### 1. `policy-expr.ts` — handle `decision.*` and `option.*` ref shorthand

In the ref shorthand parser (where `{ ref: "currentSurface.globalVar.foo" }` is lowered):
- `decision.type` → `{ kind: 'decisionIntrinsic', intrinsic: 'type' }`
- `decision.name` → `{ kind: 'decisionIntrinsic', intrinsic: 'name' }`
- `decision.targetKind` → `{ kind: 'decisionIntrinsic', intrinsic: 'targetKind' }`
- `decision.optionCount` → `{ kind: 'decisionIntrinsic', intrinsic: 'optionCount' }`
- `option.value` → `{ kind: 'optionIntrinsic', intrinsic: 'value' }`

Emit diagnostic error for unknown `decision.*` or `option.*` intrinsics.

### 2. `compile-agents.ts` — compile `completionScoreTerms` library entries

Extend `AgentLibraryCompiler` (or the library compilation section) to:
- Iterate `library.completionScoreTerms` (if present)
- Compile each entry using the same `compileScoreTerm` path as regular `scoreTerms`
- Store compiled entries in `CompiledAgentLibraryIndex.completionScoreTerms`

### 3. `compile-agents.ts` — compile `completionGuidance` in profiles

For each profile with `completionGuidance`:
- Lower `enabled` (default `false`) and `fallback` (default `'random'`)
- Store as `CompletionGuidanceConfig` on `CompiledAgentProfile.completionGuidance`

### 4. `compile-agents.ts` — compile `use.completionScoreTerms` in profiles

For each profile, lower `use.completionScoreTerms` (if present) as an array of library key strings, same as `use.scoreTerms`.

## Files to Touch

- `packages/engine/src/agents/policy-expr.ts` (modify — ref shorthand expansion)
- `packages/engine/src/cnl/compile-agents.ts` (modify — library + profile compilation)

## Out of Scope

- Runtime evaluation of compiled `completionScoreTerms` (ticket 007)
- `zoneTokenAgg` dynamic zone compilation (ticket 004 — separate concern)
- Changes to `AgentPolicyCatalog.schemaVersion` (stays at 2 unless fingerprinting changes)
- Golden file updates for existing games (no existing game uses `completionGuidance` yet)

## Acceptance Criteria

### Tests That Must Pass

1. New unit test: `{ ref: decision.type }` compiles to `{ kind: 'ref', ref: { kind: 'decisionIntrinsic', intrinsic: 'type' } }`
2. New unit test: `{ ref: option.value }` compiles to `{ kind: 'ref', ref: { kind: 'optionIntrinsic', intrinsic: 'value' } }`
3. New unit test: `{ ref: decision.invalid }` emits diagnostic error
4. New unit test: `completionScoreTerms` library entries compile to `CompiledAgentScoreTerm` with correct `when`, `weight`, `value` expressions
5. New unit test: profile `completionGuidance` compiles to `CompletionGuidanceConfig` with correct `enabled` and `fallback`
6. New unit test: profile `use.completionScoreTerms` compiles to string array referencing library keys
7. New unit test: profile without `completionGuidance` has `undefined` for that field (backward compatible)
8. Existing suite: `pnpm -F @ludoforge/engine test` — all pass
9. Existing suite: `pnpm turbo typecheck` — no type errors

### Invariants

1. Existing `scoreTerms` compilation is unchanged — no shared mutable state between `scoreTerms` and `completionScoreTerms` compilation paths.
2. `completionScoreTerms` entries share the `CompiledAgentScoreTerm` type — same shape, same expression compilation.
3. Foundation #8 (Compiler-Kernel Boundary): compilation produces compiled types. No runtime evaluation in the compiler.
4. Foundation #2 (Evolution-First): `completionScoreTerms` are YAML — evolvable by LLMs.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-expr-decision-refs.test.ts` — ref shorthand compilation
2. `packages/engine/test/unit/cnl/compile-agents-completion.test.ts` — library and profile compilation

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "completion|decision.*ref"` (targeted)
2. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` (full suite)
