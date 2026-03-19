# 15GAMAGEPOLIR-016: Add Shared Move-Param Cardinality Contract for Policy Candidate Refs

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — shared move/action metadata, policy compiler/runtime contract, schema artifacts
**Deps**: specs/15-gamespec-agent-policy-ir.md, archive/tickets/15GAMAGEPOLIR/15GAMAGEPOLIR-015-align-candidate-param-refs-with-concrete-move-contracts.md

## Problem

Spec 15 allows `candidate.param.<name>` for scalar params and fixed id lists, but the current shared move contract only lets the compiler classify scalar candidate params reliably from authored action param domains. That means the architecture is still incomplete: fixed id-list candidate params have no authoritative game-agnostic contract. Leaving that gap unresolved would force later policy tickets either to avoid a legitimate Spec 15 surface or to infer array semantics ad hoc from game-specific content, which is exactly the kind of architectural drift we do not want.

## Assumption Reassessment (2026-03-19)

1. Archived ticket 015 corrected ownership of `candidate.param.*` and moved it onto compiled concrete-move metadata, but intentionally bounded support to candidate-param shapes the current shared move metadata can classify deterministically today.
2. Current authored action params describe option domains, but they do not universally encode the final selected-value cardinality needed to distinguish scalar `id` candidate params from fixed `idList` candidate params.
3. Active authored-policy tickets 011 and 012 both depend on `candidate.param.*`, but no remaining active ticket explicitly owns the missing shared move-cardinality contract.
4. Corrected scope: this ticket should add the missing generic cardinality/value-shape contract to the shared move surface and rebase `candidate.param.*` on that stronger contract. It must not solve this by game-specific branching, policy-only shims, or backwards-compatibility aliases.

## Architecture Check

1. A shared compiled move-param contract is cleaner than letting policy code infer list-vs-scalar semantics from runtime values because type ownership belongs at the compile boundary, not in evaluator heuristics.
2. This keeps game-specific behavior in `GameSpecDoc` authoring while `GameDef`, the policy catalog, and simulation stay game-agnostic and reusable across games.
3. No backwards-compatibility path should remain where a candidate param can be interpreted loosely at runtime if the compiled move contract lacks an explicit cardinality/type declaration.
4. The same contract should be usable by policy compilation, policy evaluation, trace tooling, and any later move-introspection features so the repo has one source of truth for move param shape semantics.

## What to Change

### 1. Add a generic compiled move-param shape/cardinality surface

Introduce a shared compiled contract that describes, for each policy-visible concrete move param:

- value kind (`number`, `boolean`, `id`, `idList`)
- selected-value cardinality
- whether the param is policy-visible

That contract must be derived generically from authored action/decision metadata and must not depend on FITL/Texas-specific ids, branches, or policy authoring shortcuts.

### 2. Lower authored decision metadata into the shared contract

Extend the shared lowering path so authored move construction surfaces can declare enough information to distinguish:

- scalar choose-one style params
- fixed-cardinality or bounded-cardinality selected id lists where Spec 15 allows policy access

If an authored move param still lacks sufficient information after lowering, compilation must reject policy access to that param instead of widening it silently.

### 3. Rebase policy candidate-param compilation/runtime on the stronger contract

Update the policy compiler/runtime path so `candidate.param.<name>`:

- uses the stronger shared move-param contract
- can support fixed id-list refs when the contract says they are valid
- rejects unsupported or ambiguous list semantics deterministically

### 4. Keep schemas, traces, and diagnostics aligned

If the stronger contract is serialized in `GameDef` or `GameDef.agents`, update schema artifacts and diagnostics so the compiled shape is inspectable and stable across tooling.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/cnl/compile-lowering.ts` (modify if shared move metadata is lowered here)
- `packages/engine/src/cnl/compiler-core.ts` (modify if shared move metadata must be threaded through compilation)
- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/schemas/GameDef.schema.json` (modify via artifact generation)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify)
- `packages/engine/test/unit/agents/policy-eval.test.ts` (modify)
- `packages/engine/test/unit/kernel/*` (modify/add where shared move metadata coverage belongs)

## Out of Scope

- authored FITL or Texas policy content
- preview masking work unrelated to candidate param shape ownership
- runner or CLI configuration migration
- any policy-only workaround that leaves shared move metadata under-specified

## Acceptance Criteria

### Tests That Must Pass

1. Compiler tests prove fixed id-list `candidate.param.*` refs compile only when the shared move-param contract explicitly marks them as supported.
2. Runtime tests prove supported fixed id-list candidate params are read through the compiled contract and unsupported/ambiguous list shapes fail closed.
3. Shared move metadata tests prove selected-value cardinality/type are derived generically from authored move construction surfaces, not inferred from game-specific policy content.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `candidate.param.*` semantics come from a single generic compiled move-param contract.
2. Fixed id-list support is available only when the shared move contract encodes the required cardinality/type information explicitly.
3. `GameSpecDoc` remains the home for game-specific move authoring data; `GameDef` and policy/runtime stay game-agnostic.
4. No backwards-compatibility aliasing or runtime shape guessing survives.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` — fixed id-list candidate-param validation and rejection semantics.
2. `packages/engine/test/unit/agents/policy-eval.test.ts` — runtime extraction for fixed id-list candidate params through the compiled contract.
3. `packages/engine/test/unit/kernel/*` — shared move-param shape/cardinality lowering coverage at the ownership boundary.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`
4. `pnpm run check:ticket-deps`
