# 15GAMAGEPOLIR-003: Add Policy Expression DSL Typechecking and DAG Validation

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agent policy expression analysis, compiled catalog IR, and compiler diagnostics
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR-001-add-authored-agents-section-to-gamespecdoc.md, archive/tickets/15GAMAGEPOLIR-002-lower-agent-parameters-profiles-and-bindings.md

## Problem

The repo now preserves authored `agents` data and lowers parameter/profile/binding metadata into `GameDef.agents`, but the library content is still effectively opaque. `compile-agents.ts` validates profile references only by id; it does not type-check policy expressions, validate dependency graphs, or compile a structured library plan. That leaves Spec 15’s bounded policy surface under-enforced and pushes semantic failures too late.

## Assumption Reassessment (2026-03-19)

1. The current baseline already includes `GameSpecDoc.agents` authoring types in `packages/engine/src/cnl/game-spec-doc.ts`, structural validation in `packages/engine/src/cnl/validate-agents.ts`, and minimal lowering in `packages/engine/src/cnl/compile-agents.ts`.
2. There is no existing `packages/engine/src/agents/policy-expr.ts` yet, and no current compiled library index inside `GameDef.agents`. The present runtime catalog only carries `parameterDefs`, profile parameter values / ordered library ids, and `bindingsBySeat`.
3. The active test baseline is `packages/engine/test/unit/compile-agents-authoring.test.ts`, plus strict schema coverage in `packages/engine/test/unit/schemas-top-level.test.ts`. There is no `packages/engine/test/unit/cnl/compile-agents.test.ts` in this worktree.
4. `GameSpecPolicyExpr` authoring nodes already exist, but they are currently untyped passthrough data. This ticket must add a dedicated compile-time analysis boundary rather than reusing unrelated runtime condition/effect evaluators.
5. Corrected scope: this ticket should compile and validate policy library semantics and acyclic dependencies, and it should extend the compiled `GameDef.agents` IR accordingly. It should not implement `PolicyAgent`, preview execution, traces, or runner/CLI integration yet.

## Architecture Check

1. Extending the compiled agent catalog with a structured library index and per-profile dependency order is more robust than keeping library items as opaque authoring blobs plus profile string lists. It creates the durable IR later runtime tickets can execute directly.
2. A dedicated policy-expression analysis module is cleaner than repurposing the generic engine DSLs. Spec 15 needs distinct typing, visibility-safe refs, preview constraints, and bounded helper forms.
3. Compilation should infer and record types/cost classes/dependencies once, rather than forcing later runtime code to rediscover them ad hoc.
4. No backwards-compatibility alias paths, profile inline logic, user-defined functions, recursive profile inheritance, or dynamic ref construction should be introduced.

## What to Change

### 1. Add a dedicated policy-expression analysis module

Create a focused compiler-side module for v1 policy expression analysis that:

- understands constants, parameter refs, runtime refs, feature refs, aggregate refs, arithmetic/comparison/boolean helpers, `if`, `in`, `coalesce`, and `boolToNumber`
- infers expression result type and cost class
- extracts feature/aggregate dependencies
- rejects forbidden forms and invalid operand combinations

This should remain compiler-only data analysis, not a runtime evaluator.

### 2. Compile the authored library into structured IR

Extend `GameDef.agents` beyond the current skeleton so the compiled catalog carries:

- structured library entries for state features, candidate features, candidate aggregates, pruning rules, score terms, and tie-breakers
- inferred type/cost metadata
- dependency-ordered evaluation plans per profile
- authoring-preserved ids in JSON-serializable form

The goal is a generic IR that later runtime tickets can consume without re-parsing authoring YAML semantics.

### 3. Validate dependency graphs and semantic invariants

Compile-time validation must reject:

- cycles in state-feature / candidate-feature / aggregate dependencies
- unknown feature / aggregate / parameter references
- mismatched operand types
- invalid aggregate input types
- nested `preview` usage
- invalid `candidate.param.<name>` references
- statically provable divide-by-zero expressions

### 4. Strengthen deterministic diagnostics and tests

Add focused unit coverage for both the expression-analysis layer and the `compile-agents` integration boundary, plus strict `GameDef` schema coverage for the richer compiled catalog.

## File List

- `packages/engine/src/agents/policy-expr.ts` (new)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/test/unit/agents/policy-expr.test.ts` (new)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify if the richer `agents` section contract needs explicit coverage)

## Out of Scope

- `PolicyAgent` runtime execution
- preview execution/caching
- policy traces or diagnostics formatting UX
- runner/CLI agent-descriptor integration
- authored FITL or Texas Hold'em policy content

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/unit/agents/policy-expr.test.ts` accepts supported well-typed v1 expressions and rejects forbidden/ill-typed forms.
2. `packages/engine/test/unit/compile-agents-authoring.test.ts` rejects cyclic dependencies, invalid refs, invalid aggregate usage, nested preview refs, invalid candidate param refs, and statically provable divide-by-zero cases.
3. `packages/engine/test/unit/schemas-top-level.test.ts` proves the richer compiled `GameDef.agents` catalog passes strict schema validation.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Every compiled policy library expression is fully type-checked before any future runtime execution work.
2. The compiled catalog remains pure JSON data and preserves the generic engine boundary.
3. Library reuse stays bounded to named items; profiles still contain assemblies, not inline executable logic.
4. The policy DSL remains distinct from general engine scripting and does not become a backdoor to arbitrary execution.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-expr.test.ts` — expression typing, ref classification, preview restrictions, and invalid-form coverage.
2. `packages/engine/test/unit/compile-agents-authoring.test.ts` — library compilation, dependency ordering, cycle detection, and semantic diagnostics.
3. `packages/engine/test/unit/schemas-top-level.test.ts` — strict schema validation for the richer compiled catalog.
4. `packages/engine/test/unit/compiler-structured-results.test.ts` — only if needed to pin the richer `sections.agents` contract.

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo lint`
4. `pnpm run check:ticket-deps`

## Outcome

- Completion date: 2026-03-19
- What actually changed:
  - added `packages/engine/src/agents/policy-expr.ts` as a dedicated compiler-side policy expression analysis module
  - extended `GameDef.agents` from a skeleton into a richer compiled catalog with structured library entries, dependency metadata, and per-profile evaluation plans
  - upgraded `packages/engine/src/cnl/compile-agents.ts` to type-check policy expressions, validate aggregate inputs and tie-breakers, reject nested preview and invalid candidate param refs, detect dependency cycles, and reject statically provable divide-by-zero expressions
  - strengthened unit coverage in `packages/engine/test/unit/agents/policy-expr.test.ts` and `packages/engine/test/unit/compile-agents-authoring.test.ts`, and updated strict schema coverage for the richer catalog
  - regenerated `packages/engine/schemas/GameDef.schema.json` to match the new compiled agent IR
- Deviations from original plan:
  - the ticket originally assumed a new `packages/engine/test/unit/cnl/compile-agents.test.ts` target, but the implementation extended the existing `packages/engine/test/unit/compile-agents-authoring.test.ts` baseline instead
  - to keep the architecture durable, the implementation did not stop at diagnostics-only validation; it also evolved the compiled `GameDef.agents` IR so later runtime tickets can consume a structured plan instead of re-deriving semantics from authoring data
- Verification results:
  - `pnpm turbo build`
  - `node --test packages/engine/dist/test/unit/agents/policy-expr.test.js packages/engine/dist/test/unit/compile-agents-authoring.test.js packages/engine/dist/test/unit/schemas-top-level.test.js`
  - `pnpm -F @ludoforge/engine run schema:artifacts`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo lint`
