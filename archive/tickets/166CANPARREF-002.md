# 166CANPARREF-002: Parser acceptance and compile-time validation of `candidate.params.<name>`

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/cnl/compile-agents.ts`
**Deps**: `archive/tickets/166CANPARREF-001.md`

## Problem

Today the parser at `packages/engine/src/cnl/compile-agents.ts:2646-2658` rejects every ref under the `candidate.param.` prefix with `CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN`. Per Spec 166 §4.1, §4.2, and §5, action-selection-scope considerations need to read typed scalar parameters off the published candidate. This ticket opens the parser surface for the new plural prefix `candidate.params.<paramName>` (keeping the singular form rejected) and lands the compile-time validation that fences off authoring errors before runtime.

The internal `kind: 'candidateParam'` discriminant and the `lowerCandidateParamDefs` catalog (`compile-agents.ts:412-471`) already exist end-to-end; only the parser-level acceptance, scope check, paramName existence check, optional `appliesToActions` validation, and `onMissing` constant type check are new.

## Assumption Reassessment (2026-05-11)

1. The rejection branch lives at `packages/engine/src/cnl/compile-agents.ts:2646-2658`. Verified — exact lines match the spec; the singular branch emits `CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN` with the "removed" message.
2. `validateConsiderationScopeRefs` lives at `compile-agents.ts:2290` (per spec §5.5); the `hasMoveOnlyRefs` set must grow to include `candidateParam`. The exact line will be reconfirmed during implementation, but the function name is stable.
3. `collectConsiderationRefKinds` at `compile-agents.ts:3692-3739` already routes `candidateParam` into the `candidate` bucket (per spec §10). No change to that helper.
4. `lowerCandidateParamDefs` already nulls out cross-action-inconsistent param defs (`compile-agents.ts:435-437`); the new validator consults `catalog.candidateParamDefs` and emits `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_TYPE_INCONSISTENT` when the requested param was dropped.
5. Choice-binding-derived param defs carry the action's id transitively (Open Question #3). The implementation reuses `collectChoiceBindingSpecs([...action.cost, ...action.effects])` at `compile-agents.ts:444` when validating `appliesToActions` against per-action param sets.
6. The new diagnostic codes used here (`CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN`, `_SCOPE_INVALID`, `_UNKNOWN_ACTION`, `_TYPE_INCONSISTENT`, `_ONMISSING_TYPE_MISMATCH`) are registered in `compiler-diagnostic-codes.ts` by ticket 001 — verified by the dep.

## Architecture Check

1. **Plural namespace, no alias.** The plural prefix `candidate.params.` is structurally distinct from the retired singular `candidate.param.` — the parser branches on the longer prefix first and falls through to the existing singular rejection. No alias path, no `_legacy` resolution. Foundation #14 honored.
2. **Catalog-as-authority (Foundation #6).** Existence and type-consistency for `paramName` are derived from the already-compiled `candidateParamDefs` catalog produced by `lowerCandidateParamDefs`; the parser does not learn FITL-specific param identifiers. Pivotal events' existing canonical `params: [{ name: eventCardId, domain: { query: enums, values: [...] } }]` declaration (Spec 166 §2.3) confirms the generic schema needs no new grammar.
3. **Compile-time enforcement (Foundation #12).** Scope mismatches, unknown paramNames, missing actions, and type-inconsistent params are catchable from the spec alone; this ticket enforces them at compile time so runtime never needs an `unknown candidate param` branch.
4. **Generic constant typing.** The `onMissing: { kind: 'constant'; value }` type-check rides on the existing `candidateParamDef.type` discriminant; no per-game type tables are introduced. The `idList`-typed param's constant-fallback support is deferred until aggregation primitives expand (Spec 166 §11.2); this ticket rejects `onMissing` constants for `idList`-typed params with the existing `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_ONMISSING_TYPE_MISMATCH`.

## Authorization / Boundary Reset (2026-05-11)

User approved Option 1 after a Foundations-alignment reassessment: this ticket now includes the small generic action-param domain substrate required to make the synthetic `urgent: boolean` fixture truthful through the public GameSpecDoc compiler seam. The widening is limited to a generic `booleans` options query that can be used as an action param domain; no game-specific logic, compatibility alias, or test-only compiled fixture bypass is allowed.

## What to Change

### 0. Generic boolean action-param domain support

Add a generic leaf options query:

```yaml
{ query: booleans, values: [true, false] }
```

The query is rule-authoritative GameSpecDoc data, evaluates to the authored boolean list in stable order, has runtime shape `boolean`, is move-param encodable, and is accepted wherever an `OptionsQuery` domain is already accepted. This lets `lowerCandidateParamDefs` classify an action param with `domain: { query: booleans, values: [true, false] }` as `{ type: 'boolean' }`.

This is the only generic domain addition owned by this ticket. Do not add per-game schemas, `valuesFrom`, compatibility aliases, or a test-only compiled catalog bypass.

### 1. Split singular/plural branch at the ref parser

Replace the existing rejection block at `compile-agents.ts:2646-2658` with a two-branch structure:

- **Plural branch — `refPath.startsWith('candidate.params.')`** (NEW): extract `paramName = refPath.slice('candidate.params.'.length)`; consult the parser's `onMissing` lowering helper (see §3 below) to build the lowered `{ kind: 'candidateParam', id: paramName, onMissing: ..., appliesToActions?: ... }` ref; return `{ type, costClass: 'candidate', ref }` where `type` is derived from the param's compiled `candidateParamDef.type` (mapping `'idList' → 'idList'`, `'id' → 'id'`, `'number' → 'number'`, `'boolean' → 'boolean'`).
- **Singular branch — `refPath.startsWith('candidate.param.')`** (PRESERVED): unchanged rejection; continues to emit `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_INVALID` with the existing "removed" message and suggestion. The diagnostic code remains `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_INVALID` (the existing singular code at `compile-agents.ts:3026`, line in current file may shift after the split — re-locate during implementation).

Order matters: the plural prefix is longer, so check it FIRST. Otherwise `candidate.param.` would shadow `candidate.params.` and the plural form would never be reached.

### 2. Scope validation — extend `validateConsiderationScopeRefs`

Extend the `hasMoveOnlyRefs` set in `validateConsiderationScopeRefs` (`compile-agents.ts:2290`) to include `candidateParam`. When a microturn-scope consideration's expression tree contains any `candidateParam` ref, emit `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_SCOPE_INVALID` against the consideration with the offending ref path.

### 3. `onMissing` parser sub-helper

Add an internal helper that mirrors the lookup family's `onMissing` parsing convention from Spec 163:

```
parseCandidateParamOnMissing(def: unknown, paramType: CompiledAgentCandidateParamDef['type'], path: AuthoringPath, diagnostics): CompiledCandidateParamOnMissing | null
```

Behaviour:
- No `onMissing` supplied or supplied as the string `'unavailable'` → return `'unavailable'`.
- `onMissing: { kind: 'constant', value }` → validate the runtime type of `value` matches `paramType`:
  - `number` ↔ `typeof value === 'number'`.
  - `boolean` ↔ `typeof value === 'boolean'`.
  - `id` ↔ `typeof value === 'string'`.
  - `idList` → REJECT regardless of value with `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_ONMISSING_TYPE_MISMATCH` (rationale: constant fallback for list-valued params is deferred — see Open Question §11.2 of the spec).
- Any other shape → reject with `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_ONMISSING_TYPE_MISMATCH` and return `null`.

Returning `null` propagates as "ref lowering failed" through the existing parser plumbing; the consideration is still walked for other diagnostics but the offending ref is dropped from the compiled tree.

### 4. paramName existence + cross-action validation

After the plural branch lowers the ref, run two checks against `this.catalog.candidateParamDefs`:

- **Existence**: if `candidateParamDefs[paramName] === undefined` AND `paramName` does not appear in any per-action choice-binding set, emit `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN`. The implementation distinguishes "never declared" from "dropped due to inconsistency" by inspecting the secondary diagnostic stream emitted by `lowerCandidateParamDefs` at `:435-437`; if the param was dropped due to type inconsistency, emit `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_TYPE_INCONSISTENT` instead.
- **`appliesToActions`** (only when authored): for each action id in the list:
  - Action does not exist in `GameDef.actions` → `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN_ACTION`.
  - Action exists but does not declare `paramName` either via `action.params` or via a choice binding under `[...action.cost, ...action.effects]` (reuse `collectChoiceBindingSpecs` per Open Question §11.3) → emit `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN` for that action-specific case (same code as plain existence — the diagnostic message includes the action id).

### 5. New synthetic fixture

Create `packages/engine/test/architecture/candidate-param-refs/candidate-params-fixture.ts` per Spec 166 §8.4: a synthetic two-action game (`chooseMode` and `chooseRole`) with each action declaring distinct typed params (mode: `id` enum `[A, B]`; role: `id` enum `[red, blue]`) plus one shared `boolean` param `urgent` declared on both. This fixture is consumed by all architectural-invariant tests in tickets 002–004.

### 6. Architectural-invariant tests

Add files under `packages/engine/test/architecture/candidate-param-refs/`:

- `candidate-params-retired-namespace-rejected.test.ts` (Spec 166 §8.1 #1) — singular fails with `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_INVALID`; plural compiles when paramName is declared.
- `candidate-params-scope-rejected.test.ts` (§8.1 #2).
- `candidate-params-unknown-name-rejected.test.ts` (§8.1 #3).
- `candidate-params-appliesto-cross-action-validation.test.ts` (§8.1 #4) — three sub-cases.
- `candidate-params-type-inconsistent-rejected.test.ts` (§8.1 #5).
- `candidate-params-onmissing-type-mismatch-rejected.test.ts` (§8.1 #7) — including the `idList`-constant-rejection sub-case.

All tests carry `// @test-class: architectural-invariant` headers per `.claude/rules/testing.md`.

## Files to Touch

- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/kernel/types-ast.ts` (modify — generic `booleans` query)
- `packages/engine/src/kernel/schemas-ast.ts` (modify — generic `booleans` query schema)
- `packages/engine/src/kernel/query-kind-map.ts` (modify — generic `booleans` runtime shape)
- `packages/engine/src/kernel/eval-query.ts` (modify — generic `booleans` evaluation)
- `packages/engine/src/kernel/validate-queries.ts` (modify — generic `booleans` validation no-op)
- `packages/engine/src/kernel/ast-to-display.ts` (modify — generic `booleans` display)
- `packages/engine/test/architecture/candidate-param-refs/candidate-params-fixture.ts` (new)
- `packages/engine/test/architecture/candidate-param-refs/candidate-params-retired-namespace-rejected.test.ts` (new)
- `packages/engine/test/architecture/candidate-param-refs/candidate-params-scope-rejected.test.ts` (new)
- `packages/engine/test/architecture/candidate-param-refs/candidate-params-unknown-name-rejected.test.ts` (new)
- `packages/engine/test/architecture/candidate-param-refs/candidate-params-appliesto-cross-action-validation.test.ts` (new)
- `packages/engine/test/architecture/candidate-param-refs/candidate-params-type-inconsistent-rejected.test.ts` (new)
- `packages/engine/test/architecture/candidate-param-refs/candidate-params-onmissing-type-mismatch-rejected.test.ts` (new)

## Out of Scope

- Required-fallback collector and `candidateParamFallback` lowering — owned by ticket 003 (the test for required fallback, Spec 166 §8.1 #6, lives there).
- Runtime resolver `onMissing` constant path and trace surface — owned by ticket 004.
- FITL `event` action params declaration — owned by ticket 006.
- Cookbook update — owned by ticket 007.
- `idList`-typed constant `onMissing` support: explicitly rejected for now (see §3 above and Spec 166 §11.2). Adding `idList` constant support is a future-spec concern.

## Implementation Outcome (2026-05-11)

Implemented the parser-validation slice plus the approved boolean domain substrate:

- `OptionsQuery` now accepts `{ query: 'booleans', values: boolean[] }`; it evaluates in authored order, carries runtime shape `boolean`, is move-param encodable, and is represented in generated schemas.
- `candidate.params.<name>` now lowers through the policy expression parser to a typed `candidateParam` ref with default `onMissing: 'unavailable'`.
- Structured refs in the form `{ candidate.params.<name>: { onMissing, appliesToActions } }` are accepted only for candidate-param options.
- Retired singular `candidate.param.*` refs continue to fail, now through `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_INVALID`.
- Move-scope validation rejects `candidate.params.*` from microturn-only considerations with `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_SCOPE_INVALID`.
- Unknown names, inconsistent cross-action param types, unknown `appliesToActions`, actions missing the param, and mismatched `onMissing` constants are compile-time diagnostics.
- The shared synthetic fixture owns `mode`, `role`, `urgent`, and an id-list choice binding. Its boolean `urgent` param proves the generic `booleans` query flows through `candidateParamDefs` as `{ type: 'boolean' }`.

Generated schema artifact fallout:

- `packages/engine/schemas/GameDef.schema.json`
- `packages/engine/schemas/Trace.schema.json`

Verification note: the ticket's drafted focused command `pnpm -F @ludoforge/engine test --test-name-pattern=candidate-params` is stale for this repo because engine tests use Node's test runner. The focused proof command is:

```bash
pnpm -F @ludoforge/engine exec node --test "dist/test/architecture/candidate-param-refs/*.test.js"
```

Source-size ledger:

- `packages/engine/src/cnl/compile-agents.ts`: 3,784 lines before, 4,106 lines after. This file was already over the repository guideline cap; this ticket kept the change surgical and did not split unrelated compiler structure.

Final verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine test` — passed.
- `pnpm turbo test` — passed.
- `pnpm turbo lint` — passed.
- `pnpm run check:ticket-deps` — passed.
- `pnpm -F @ludoforge/engine exec node --test "dist/test/architecture/candidate-param-refs/*.test.js"` — passed.

## Acceptance Criteria

### Tests That Must Pass

1. `candidate.params.<paramName>` on a move-scope consideration referencing a paramName declared on at least one action compiles cleanly to a `{ kind: 'candidateParam', id: paramName, onMissing: 'unavailable' }` lowered ref.
2. `candidate.param.<paramName>` (singular) continues to fail with `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_INVALID`, exact message preserved.
3. `candidate.params.<paramName>` on a microturn-scope consideration fails with `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_SCOPE_INVALID`.
4. `candidate.params.<missingName>` fails with `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN`.
5. `appliesToActions: [<nonExistentAction>]` fails with `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN_ACTION`; `appliesToActions: [<existingActionMissingParam>]` fails with `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN`.
6. A fixture with inconsistent types for the same param across actions causes a consideration ref to fail with `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_TYPE_INCONSISTENT`.
7. `onMissing: { kind: 'constant', value: 0 }` against an `id`-typed param fails with `CNL_COMPILER_AGENT_CANDIDATE_PARAMS_ONMISSING_TYPE_MISMATCH`; same code fires for any `onMissing` constant against an `idList`-typed param.
8. An action param declared as `domain: { query: booleans, values: [true, false] }` appears in `candidateParamDefs` as `{ type: 'boolean' }`.
9. Existing suite: `pnpm turbo test` — full pass.

### Invariants

1. The parser order check: longer prefix `candidate.params.` is evaluated before singular `candidate.param.` so the plural form is never shadowed by the singular rejection.
2. No new ref kinds emit successfully outside `[move]`-scope considerations; the `hasMoveOnlyRefs` set extension is asserted by the scope-rejection test.
3. The synthetic fixture is referenced ONLY by architectural-invariant tests under `packages/engine/test/architecture/candidate-param-refs/` — it does not seep into game-specific test paths (Foundation #1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/candidate-param-refs/candidate-params-fixture.ts` — synthetic two-action fixture per §5 above.
2. Six architectural-invariant test files per §6 above; rationale per spec §8.1 mapping.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test --test-name-pattern=candidate-params`
3. `pnpm turbo test`
4. `pnpm turbo lint`
5. `pnpm run check:ticket-deps`

## Outcome

Completed: 2026-05-11; post-ticket review and archival: 2026-05-12.
Outcome amended: 2026-05-12.

What landed:

- Generic `booleans` action-param domains are supported through the existing `params: [{ name, domain }]` slot, including query evaluation, runtime shape mapping, move-param encoding, display/validation coverage, and generated schema artifacts.
- `candidate.params.<name>` lowers at move scope to a typed `candidateParam` ref with default `onMissing: 'unavailable'`; structured refs support `onMissing` and `appliesToActions`.
- The retired singular `candidate.param.*` namespace remains rejected through `CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_INVALID`; no alias or compatibility path was added.
- Compile-time validation rejects unknown params, microturn-scope refs, unknown or missing `appliesToActions`, inconsistent cross-action param declarations, and `onMissing` constants whose type does not match the declared candidate-param type.
- The synthetic architecture fixture owns number, id, boolean, and id-list candidate-param declarations; the boolean `urgent` param proves the generic `booleans` domain flows through `candidateParamDefs`.

Post-ticket review:

- No must-fix source/test cleanup, reopen item, or new follow-up ticket was warranted.
- Sibling `archive/tickets/166CANPARREF-003.md` was truthened to reuse/verify the `collectCandidateParamRefIds` helper already introduced by this ticket instead of describing the collector as new work.
- Required-fallback work is complete in `archive/tickets/166CANPARREF-003.md`; remaining runtime, trace, FITL, and cookbook work is complete in archived tickets `166CANPARREF-004.md` through `166CANPARREF-007.md`.

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine test` — passed.
- `pnpm turbo test` — passed.
- `pnpm turbo lint` — passed.
- `pnpm run check:ticket-deps` — passed.
- `pnpm -F @ludoforge/engine exec node --test "dist/test/architecture/candidate-param-refs/*.test.js"` — passed.
