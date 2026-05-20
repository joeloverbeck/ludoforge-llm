# 187WHOTURPOS-001: `postureEvaluators` library bucket (compiler)

**Status**: IMPLEMENTED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `contracts/policy-contract.ts`, `cnl/game-spec-doc.ts`, `kernel/types-core.ts`, `kernel/schemas-core.ts`, `cnl/lower-agent-considerations.ts`, `cnl/compile-agents.ts`
**Deps**: `specs/187-whole-turn-posture-and-ally-rival-metadata.md`

## Problem

Spec 187 §4.1 introduces a new agent-policy library bucket `postureEvaluators`. Each evaluator declares `must` (hard posture constraints that veto/demote a plan), `prefer` (weighted preferences leaf-scored over projected state, each with an explicit `when` and an explicit non-`ready` fallback contribution per Foundation #20), and `provenance` (the overall preview status). A plan template references one via its already-existing `postureHook`.

This ticket lands the **compiler-side** half: the bucket registration, YAML input shape, compiled type, schema, lowering, and static validation. No runtime evaluation is wired here (that is `187WHOTURPOS-003`) — the bucket compiles, validates, and is referenceable, but the hook remains inert until the runtime ticket.

## Assumption Reassessment (2026-05-21)

1. `AGENT_POLICY_LIBRARY_BUCKETS` in `packages/engine/src/contracts/policy-contract.ts:1-13` lists 11 buckets; `postureEvaluators` is absent. `AGENT_POLICY_PROFILE_USE_BUCKETS` (line 17-23) is the profile-referenceable subset — `postureEvaluators` is NOT added there (it is referenced indirectly via plan-template `postureHook`, per Spec 187 §4.1).
2. The bucket plumbing follows a uniform 4-site pattern, confirmed this session: input shape `GameSpecAgentLibrary` (`cnl/game-spec-doc.ts:877-882`), lowering (`cnl/lower-agent-considerations.ts:54-104` field decls + `:197-271` lowering loops), schemas (`kernel/schemas-core.ts:1567,1591-1602`), registry (`contracts/policy-contract.ts`).
3. `CompiledPlanTemplate.postureHook` already exists (`kernel/types-core.ts:1204`) and `GameSpecPlanTemplateDef.postureHook` (`cnl/game-spec-doc.ts:830`); no change to the plan-template type is needed here.
4. The `prefer` leaf-scored value namespace `preview.plan.delta.*` is delivered by `187WHOTURPOS-002`; static validation of those refs may be stubbed/forward-compatible here and is not a hard dependency for bucket compilation (the bucket validates its own structure, not the runtime ref availability).

## Architecture Check

1. Reusing the established library-bucket pattern (input shape → lowering → schema → registry) keeps `postureEvaluators` consistent with `turnShapeEvaluators`/`strategicConditions` and avoids a bespoke compile path.
2. Engine-agnostic (Foundation #1): the bucket is generic policy metadata. No faction ids, victory formulas, or thresholds in engine code — `must`/`prefer` terms are authored conditions/values lowered to generic AST.
3. Foundation #12: every constraint knowable from the spec alone is validated at compile time — in particular, each `prefer` term MUST declare an explicit fallback for non-`ready` preview; a term missing its fallback fails compilation (Foundation #20 honesty enforced statically).
4. No backwards-compatibility shims: the bucket is net-new; profiles that declare no posture evaluator are unaffected.

## What to Change

### 1. Register the bucket

Add `postureEvaluators` to `AGENT_POLICY_LIBRARY_BUCKETS` (`contracts/policy-contract.ts`). Do NOT add it to `AGENT_POLICY_PROFILE_USE_BUCKETS` — it is referenced via plan-template `postureHook`, not directly from a profile.

### 2. Input shape + compiled type

Add `postureEvaluators?: Readonly<Record<string, GameSpecPostureEvaluatorDef>>` to `GameSpecAgentLibrary` (`cnl/game-spec-doc.ts`), with a `GameSpecPostureEvaluatorDef` declaring `must` (list of conditions), `prefer` (list of `{ when, value, fallback }` terms), and `provenance` handling. Add the compiled counterpart `CompiledPostureEvaluator` to `kernel/types-core.ts` and reference it from `CompiledAgentDependencyRefs` (~`:1048`) where bucket dependency tracking lives.

### 3. Schema

Add `CompiledPostureEvaluatorSchema` and wire it into `CompiledAgentLibraryIndexSchema` (`kernel/schemas-core.ts:1591`) and the `AgentPolicyCatalogSchema` family (`:1700`), mirroring `strategicConditions`/`turnShapeEvaluators` records.

### 4. Lowering + static validation

In `cnl/lower-agent-considerations.ts` (and the orchestration in `cnl/compile-agents.ts`), lower posture evaluators: compile `must` conditions and `prefer` `when`/`value` expressions to generic AST. **Reject at compile time** any `prefer` term lacking an explicit fallback contribution.

## Files to Touch

- `packages/engine/src/contracts/policy-contract.ts` (modify)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/lower-agent-considerations.ts` (modify)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/test/` — posture compiler golden + determinism + authoring-error tests (new; exact subdir per existing compiler-test convention)

## Out of Scope

- Runtime posture evaluation, plan demotion, and the `preview.plan.delta.*` namespace (`187WHOTURPOS-002`, `-003`).
- The plan-trace `posture` block (`187WHOTURPOS-003`).
- The `relationships` bucket and any `relationship.<role>` ref validation in posture terms (`187WHOTURPOS-004`, `-005`).

## Acceptance Criteria

### Tests That Must Pass

1. A posture evaluator referenced by a plan template's `postureHook` compiles successfully.
2. A `prefer` term lacking an explicit non-`ready` fallback fails compilation with a descriptive error.
3. Compiling the same GameSpecDoc twice yields byte-identical GameDef (determinism).
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No game-specific identifier, threshold, or victory formula appears in engine code for posture evaluators (Foundation #1).
2. Every `prefer` term carries a statically-validated fallback declaration (Foundation #12/#20).

## Test Plan

### New/Modified Tests

1. Posture-bucket compiler golden + determinism test — pins the compiled `postureEvaluators` shape and asserts byte-identical recompile.
2. Authoring-error corpus test — `prefer` term missing fallback rejected at compile time.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/<posture-compiler-test>.test.js`
2. `pnpm turbo lint typecheck && pnpm -F @ludoforge/engine test`

## Outcome

Completed: 2026-05-21

What changed:

- Added `postureEvaluators` to `AGENT_POLICY_LIBRARY_BUCKETS` without adding it to `AGENT_POLICY_PROFILE_USE_BUCKETS`; posture evaluators are library-only and referenced through plan-template `postureHook`.
- Added authored and compiled posture evaluator shapes, schema validation, dependency propagation, expression lowering, and static validation that every `prefer` term declares `fallback.contribution`.
- Validated `planTemplates.<id>.postureHook` against the compiled posture evaluator bucket and records the dependency on the plan template.
- Added `packages/engine/src/cnl/compile-agent-posture-evaluators.ts` for posture-specific compiler lowering and `packages/engine/src/cnl/strip-agent-library-expressions.ts` to keep new projection logic out of the already-large `compile-agents.ts`.
- Regenerated `packages/engine/schemas/GameDef.schema.json` with `pnpm -F @ludoforge/engine run schema:artifacts`.

Deviations from original plan:

- The compiled shape uses explicit `must[].condition`, `prefer[].value`, `prefer[].weight`, and `prefer[].fallback.contribution` fields. Runtime posture evaluation, `preview.plan.delta.*`, and relationship refs remain out of scope for tickets `187WHOTURPOS-002` through `-005`.
- `compile-agents.ts` was already above the repository file-size guidance. The implementation extracted existing expression-stripping logic into `strip-agent-library-expressions.ts`; final active growth in `compile-agents.ts` is negative relative to the starting diff, while new posture-specific files are below guidance.

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/unit/cnl/agent-posture-evaluator-compile.test.js` — passed, 3 tests.
- `pnpm -F @ludoforge/engine run schema:artifacts:check` — passed after regenerating schema artifacts.
- `pnpm -F @ludoforge/engine test` — passed, 165/165 files.
- `pnpm turbo lint typecheck` — first run failed on unused imports introduced by the extraction; after removing them, rerun passed, 5/5 tasks.

Post-review: completed in the Spec 187 implementation harness; no must-fix cleanup or follow-up ticket was needed before archival.
