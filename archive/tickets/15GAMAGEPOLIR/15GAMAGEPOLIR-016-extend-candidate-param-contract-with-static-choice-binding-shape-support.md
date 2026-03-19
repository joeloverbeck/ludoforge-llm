# 15GAMAGEPOLIR-016: Extend Candidate-Param Contract with Static Choice-Binding Shape Support

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — shared move/action metadata, policy compiler/runtime contract, schema artifacts
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-015-align-candidate-param-refs-with-concrete-move-contracts.md

## Problem

Spec 15 allows `candidate.param.<name>` for scalar params and fixed id lists. The current codebase already has a generic compiled candidate-param contract in `AgentPolicyCatalog.candidateParamDefs`, but that contract is populated only from authored `actions[].params` domains. That leaves a narrower but still important architectural gap: concrete legal moves can also carry static choice-binding params produced by generic `chooseOne` / `chooseN` effects and action pipelines, yet those policy-visible params are invisible to the compiled contract today.

If we solve that gap by adding a second parallel "shared move-param" schema, we create duplicated ownership. The cleaner architecture is to keep one compiled candidate-param contract and extend its derivation to include static choice-binding metadata, including id-list shape where the generic choice AST can prove it deterministically.

## Assumption Reassessment (2026-03-19)

1. Archived ticket 015 already introduced `AgentPolicyCatalog.candidateParamDefs` as the single compiled contract for policy-visible concrete move params. The missing piece is not ownership, but incomplete derivation coverage.
2. Current authored action params still classify scalar policy-safe shapes deterministically from `actions[].params`, and that behavior should remain.
3. Current concrete legal moves may also contain generic decision-derived params from compiled `chooseOne` / `chooseN` binds in actions or action pipelines. Those binds already carry generic value-shape and cardinality information in the compiled effect AST.
4. Not every bind is statically policy-addressable: dynamic bind templates (for example `{$zone}`-parameterized binds) and unknown-shape queries must remain out of contract unless the compiler can resolve them deterministically.
5. The discrepancy in the old ticket was architectural: it assumed the repo lacked a generic compiled candidate-param contract and proposed introducing one. That assumption is false in the current code.
6. Corrected scope: extend the existing compiled candidate-param contract so it also derives static choice-binding candidate params from generic compiled action / pipeline metadata, including explicit id-list shape metadata when supported. Do not introduce a second move-param contract, policy-only shim, game-specific branch, or backwards-compatibility alias.

## Architecture Check

1. Extending `AgentPolicyCatalog.candidateParamDefs` is cleaner than creating a second "shared move-param" contract, because candidate-param typing already has one generic compiled home.
2. Static choice-binding metadata belongs to the generic compile boundary, not to evaluator heuristics. `chooseOne` / `chooseN` already encode value source and selection cardinality in reusable engine AST.
3. This keeps game-specific behavior in `GameSpecDoc` authoring while `GameDef`, policy compilation, policy evaluation, and simulation stay game-agnostic and reusable across games.
4. Dynamic bind templates or ambiguous query shapes must fail closed instead of being widened into policy-visible refs.
5. The same compiled contract should remain the source of truth for policy compilation, runtime extraction, diagnostics, and later move-introspection features.

## What to Change

### 1. Extend the existing compiled candidate-param contract

Keep `AgentPolicyCatalog.candidateParamDefs` as the canonical contract and extend each entry, where needed, to describe:

- value kind (`number`, `boolean`, `id`, `idList`)
- selected-value shape/cardinality for statically supported list params
- whether the param comes from a statically addressable concrete move surface

Do not add a second parallel move-param schema. The contract must be derived generically from authored action params plus compiled static choice metadata and must not depend on FITL/Texas-specific ids, branches, or policy authoring shortcuts.

### 2. Lower static choice-binding metadata into the contract

Extend agent lowering so it can derive candidate-param entries from:

- authored `actions[].params`
- static `chooseOne` binds over deterministically classifiable scalar domains
- static `chooseN` binds over deterministically classifiable id-producing domains

The derivation must distinguish:

- scalar choose-one style params
- fixed id-list params when `chooseN` cardinality is explicit and the selected value shape is deterministically id-valued
- unsupported dynamic or ambiguous binds that must stay out of the contract

If a concrete move param still lacks sufficient information after lowering, compilation must reject policy access to that param instead of widening it silently.

### 3. Rebase policy candidate-param compilation/runtime on the stronger contract

Update the policy compiler/runtime path so `candidate.param.<name>`:

- uses the extended compiled candidate-param contract
- can support static id-list refs only when the contract says they are valid
- rejects unsupported dynamic binds, ambiguous list semantics, and conflicting definitions deterministically

### 4. Keep schemas, traces, and diagnostics aligned

Because the contract is serialized in `GameDef.agents`, update schema artifacts and diagnostics so the compiled shape remains inspectable and stable across tooling.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify to thread action-pipeline metadata into agent lowering if required)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/schemas/GameDef.schema.json` (modify via artifact generation)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-expr.test.ts` (modify if direct analysis coverage is needed)
- `packages/engine/test/unit/kernel/move-runtime-bindings.test.ts` (cross-check only if contract derivation reuses static bind semantics)

## Out of Scope

- authored FITL or Texas policy content
- preview masking work unrelated to candidate param shape ownership
- runner or CLI configuration migration
- any policy-only workaround that leaves the compiled candidate-param contract under-specified
- exposing dynamic bind-template params as policy-visible refs without a deterministic static contract

## Acceptance Criteria

### Tests That Must Pass

1. Compiler tests prove `candidate.param.*` refs validate against one compiled candidate-param contract populated from both authored action params and statically addressable choice bindings.
2. Compiler tests prove fixed id-list refs compile only when the contract explicitly marks them as supported from generic `chooseN` metadata.
3. Runtime tests prove supported fixed id-list candidate params are read through the compiled contract and unsupported / ambiguous / dynamic shapes fail closed.
4. Contract-derivation tests prove selected-value shape metadata is derived generically from authored action and choice surfaces, not inferred from game-specific policy content.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `candidate.param.*` semantics come from one generic compiled candidate-param contract in `GameDef.agents`.
2. Fixed id-list support is available only when generic compiled `chooseN` metadata encodes the required shape/cardinality information explicitly.
3. `GameSpecDoc` remains the home for game-specific move authoring data; `GameDef` and policy/runtime stay game-agnostic.
4. No backwards-compatibility aliasing, duplicate move-param contracts, or runtime shape guessing survives.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` — static choice-binding candidate-param derivation, fixed id-list validation, and rejection semantics.
2. `packages/engine/test/unit/agents/policy-eval.test.ts` — runtime extraction for supported fixed id-list candidate params through the compiled contract.
3. `packages/engine/test/unit/agents/policy-expr.test.ts` — analysis/type inference parity for id-list candidate params when the compiled contract exposes them.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm run check:ticket-deps`

## Outcome

- Completed: 2026-03-19
- What changed:
  - extended `AgentPolicyCatalog.candidateParamDefs` instead of introducing a second move-param contract
  - derived candidate-param entries from static `chooseOne` / exact-`chooseN` binds in compiled actions and action pipelines, alongside authored `actions[].params`
  - added explicit exact-cardinality metadata for supported `idList` candidate params
  - kept dynamic bind templates, range-cardinality `chooseN`, and ambiguous query shapes out of the compiled candidate-param contract so policy refs fail closed
  - regenerated `packages/engine/schemas/GameDef.schema.json`
- Deviations from original plan:
  - corrected the ticket assumption that the repo lacked a generic compiled candidate-param contract; the work reused and strengthened the existing `candidateParamDefs` surface
  - avoided adding a parallel "shared move-param" schema because that would duplicate ownership and weaken the architecture
  - bounded id-list support to statically provable exact `chooseN` binds rather than widening support to dynamic or range-based list shapes
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed
  - `node --test packages/engine/dist/test/unit/compile-agents-authoring.test.js packages/engine/dist/test/unit/agents/policy-expr.test.js packages/engine/dist/test/unit/agents/policy-eval.test.js` passed
  - `pnpm -F @ludoforge/engine schema:artifacts` passed
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm -F @ludoforge/engine lint` passed
  - `pnpm run check:ticket-deps` passed
