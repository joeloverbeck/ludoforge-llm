# 158MICROPOL-001: Migrate `scopes: [completion]` → `scopes: [microturn]` (F#14 atomic cut)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — scope enum, ref kinds, evaluator pair, runtime scope filters, schema, simulator policy agent, IR lowering
**Deps**: `archive/specs/158-microturn-policy-scope-and-refs.md`

## Problem

The cookbook deprecated `scopes: [completion]` and six retired refs (`option.value`, `decision.type|name|targetKind|optionCount`, `candidate.param.*`, `preview.phase1`, `preview.phase1CompletionsPerAction`) post-Spec-140, but the engine still evaluates them. `agentGuided` completion routes through `selectBestCompletionChooseOneValue` (`policy-preview.ts:431-452`); cookbook-compliant profiles get `undefined` and silently fall back to greedy at `policy-preview.ts:519` (chooseOne) and `:525` (chooseNStep). The simulator's `PolicyAgent` (`policy-agent.ts:321,361`) consumes the same chain. The deprecation is one-sided — the surface is gone in spirit but not in implementation, and the modern replacement (`agentGuided`) is meaningless without it. F#15 demands a working modern surface; F#14 demands one-shot migration. This ticket replaces completion scope with `microturn` scope (atomic-frontier of published-decision options) in a single F#14-compliant transaction.

## Assumption Reassessment (2026-05-06)

1. **Spec 140 establishes the atomic-microturn contract** — confirmed: `archive/specs/140-microturn-native-decision-protocol.md` is COMPLETED.
2. **Scope enum currently `'move' | 'completion'`** — confirmed at `packages/engine/src/cnl/compile-agents.ts:54`.
3. **`selectBestCompletionChooseOneValue` exported at `completion-guidance-choice.ts:57`; `buildCompletionChooseCallback` at line 103** — confirmed.
4. **Two consumer chains exist** — confirmed: `policy-preview.ts:51` (preview runtime, both chooseOne and chooseNStep branches) AND `policy-agent.ts:12` (simulator). Both must migrate together.
5. **Production data has zero `scopes: [completion]`** — confirmed via `grep -r "scopes:\s*\[\s*completion\s*\]" data/games/`. Migration scope is test fixtures + test source only.
6. **Runtime scope filtering at four sites** — `policy-eval.ts:612-614`, `completion-guidance-choice.ts:50-54` (deleted in this ticket), `policy-runtime.ts:433`, `policy-wasm-runtime.ts:635`.
7. **Compile-time scope-ref validator** at `compile-agents.ts:1850-1878` (`validateConsiderationScopeRefs`) currently rejects move-scope considerations using completion-only refs; the symmetric microturn enforcement is added here.
8. **`scoreCompletionOptionWithContributions` (`completion-guidance-eval.ts:52-103`) is the per-option scoring core** that the new `microturn-option-eval.ts` rewrites.
9. **Schema scope enum at `GameDef.schema.json:9630-9648` lists `["move", "completion"]`**.
10. **Cookbook "Retired For New Production Profiles" section** at `docs/agent-dsl-cookbook.md:218-235`; line 206's forward reference to Spec 158 is removed when the rename lands.

## Architecture Check

1. **F#14 strict atomic cut.** The new scope, the new refs, the migration of consumers, the deletion of completion-scope code paths, the schema update, and the cookbook revision all ship in this single ticket. No `_legacy` enum value, no parallel surface, no quiet fallback. The Foundation 14 mechanical-uniformity exception applies in part (the YAML fixture sweep is mechanical) and the spec-bundled coherent work unit exception applies for the non-mechanical evaluator rewrite — the spec's Phase Acceptance Budget explicitly bundles the change as one transaction.
2. **GameSpecDoc / engine boundary preserved.** All ten `microturn.*` refs (`microturn.kind`, `decisionKey`, `actorSeat`, `option.value`, `option.index`, `option.stableKey`, `option.tags`, `option.targetKind`, `remainingRequiredCount`, `remainingMaxCount`) are engine-generic — F#1. `microturn.decisionKey` is the kernel's `decisionKey` string; `microturn.option.value` is untyped at engine level (canonical equality). No engine code interprets game-specific decision names.
3. **F#19 alignment.** `microturn` scope evaluates at the kernel-published atomic frontier — no client-side compound shapes, no unpublished sub-decisions referenced. The evaluator fires once per (microturn, option) pair when the chooser invokes it.

## What to Change

### 1. Scope enum + compile-time validation

`packages/engine/src/cnl/compile-agents.ts:54` — `type ConsiderationScope = 'move' | 'microturn'` (replace `'completion'`). `normalizeConsiderationScopes` at line 2688 + suggestion at line 2699 (`'Use scopes: ["move"], scopes: ["completion"], or both.'`) updated to advertise `microturn` and reject `completion` with a migration-naming diagnostic.

`validateConsiderationScopeRefs` (`compile-agents.ts:1850-1878`) gains microturn-ref enforcement: microturn-scope considerations may use `microturn.*` refs and shared expression refs (`var.*`, `feature.*`, `globalMarker.*`, `metric.*`); `move.*` and `candidate.*` refs from a microturn-scope consideration are a compile-time error with diagnostic `"move.* refs cannot be used in microturn-scope considerations"`. The case-statement at `compile-agents.ts:2154` (`case 'option.value':`) is removed; analogous cases for `decision.type|name|targetKind|optionCount`, `candidate.param.*`, `preview.phase1`, `preview.phase1CompletionsPerAction` are removed.

`packages/engine/src/cnl/validate-agents.ts` — diagnostic messages updated to name `microturn` migration. Specifically: `scopes: [completion]` produces `"scopes: [completion] is removed; use scopes: [microturn] with microturn.* refs"`; `option.value` produces `"option.value is removed; use microturn.option.value"`; analogous diagnostics for the other five retired ref kinds.

### 2. Ref kinds in IR + bytecode

`packages/engine/src/cnl/policy-bytecode/feature-table.ts` — add ten new ref kinds (`microturn:kind`, `microturn:decisionKey`, `microturn:actorSeat`, `microturn:option:value`, `microturn:option:index`, `microturn:option:stableKey`, `microturn:option:tags`, `microturn:option:targetKind`, `microturn:remainingRequiredCount`, `microturn:remainingMaxCount`). Remove the six retired ref kinds and their bytecode emitters.

`packages/engine/src/cnl/lower-agent-considerations.ts` — IR lowering for the ten microturn refs.

`packages/engine/src/agents/policy-expr.ts` — ref-kind dispatch updated; the suggestion text at line 901 (`'Use a string literal zone id or an id-valued ref/expression such as { ref: "option.value" }.'`) is updated to reference `microturn.option.value`.

### 3. New evaluator pair (rewrites of completion-scope evaluators)

`packages/engine/src/agents/microturn-option-eval.ts` (new) — rewrite of `completion-guidance-eval.ts`'s `scoreCompletionOptionWithContributions`. Per-option scoring core; takes `(microturn, option)`; returns the per-option score from the profile's microturn-scope considerations. Stable tie-breaks; integer arithmetic. Reuses `evaluateConsideration` machinery via a new microturn-scope ref-resolution context.

`packages/engine/src/agents/microturn-option-evaluator.ts` (new) — rewrite of `completion-guidance-choice.ts`'s `selectBestCompletionChooseOneValue` and `buildCompletionChooseCallback`. Chooser/selector that drives both `chooseOne` and `chooseNStep` agentGuided paths plus the simulator's `PolicyAgent` consumers. Exposes the equivalents of both functions under microturn-scope names.

### 4. Consumer migration

`packages/engine/src/agents/policy-preview.ts` — `pickAgentGuidedChooseOneDecision` (lines 431-452) and `pickAgentGuidedChooseNStepDecision` (lines 454-507) switch their imports and call sites from `selectBestCompletionChooseOneValue`/`buildCompletionChooseCallback` to the new microturn-scope evaluator. Silent-fallback semantics at `:519` and `:525` are preserved (`?? pickGreedyChooseOneDecision` / `?? pickGreedyChooseNStepDecision`); the spec 159 rename to `policyGuided` is out of scope here.

`packages/engine/src/agents/policy-agent.ts` — `matchGuidedChooseOneDecision` (line 361) and `matchGuidedCompletionDecision` (line 321) switch to the new microturn-scope evaluator. Import at line 12 updated. The simulator's user-visible behavior is unchanged for cookbook-compliant profiles (which currently fall back to greedy via the same silent-fallback semantics) and is restored for profiles that author microturn-scope considerations.

### 5. Runtime scope filtering

Update every site that branches on `'completion'`:

- `packages/engine/src/agents/policy-eval.ts:612-614` (`scopes?.includes('move')`) — kept; analogous microturn filter added where chooser-time filtering occurs.
- `packages/engine/src/agents/policy-runtime.ts:433` — runtime evaluator branch updated to `'microturn'`.
- `packages/engine/src/agents/policy-wasm-runtime.ts:635` — WASM-runtime branch updated to `'microturn'`.
- `packages/engine/src/agents/completion-guidance-choice.ts:50-54` — moot (file is deleted in §8).

### 6. Schema

`packages/engine/schemas/GameDef.schema.json` — scope enum: `["move", "microturn"]`. Ref-kind enum updated to remove the six retired kinds and add the ten microturn kinds. Schema diff is the canonical migration record.

### 7. Test fixture migration

`packages/engine/test/fixtures/**/*.yaml` — every consideration with `scopes: [completion]` rewritten to `scopes: [microturn]`; every `option.value` ref rewritten to `microturn.option.value`; every `decision.name` to `microturn.decisionKey`; etc. Use the migration script (§10) for the bulk of the work.

`packages/engine/test/unit/compile-agents-authoring.test.ts` — existing fixtures with `scopes: ['completion']` (lines 407, 440, 821, 858, 893, 934, 2125 per reassessment) are pruned; new cases assert that `scopes: [completion]` produces the migration-naming diagnostic and that each retired ref kind produces a per-kind migration diagnostic.

### 8. Deletions

Delete the retired source and their tests (Foundation 14 mandates removal in the same change):

- `packages/engine/src/agents/completion-guidance-choice.ts`
- `packages/engine/src/agents/completion-guidance-eval.ts`
- `packages/engine/test/unit/agents/completion-guidance-choice.test.ts`
- `packages/engine/test/unit/agents/completion-guidance-eval.test.ts`

### 9. Cookbook

`docs/agent-dsl-cookbook.md` — delete the "Retired For New Production Profiles" section (lines 218-235). Add a new "Microturn Scope" section documenting the ten refs with a worked example: govern-mode chooseOne with `preferPatronageMode` rewritten to microturn scope. The "Considerations" section gains a sentence about choosing between `move` and `microturn` scope (move scope fires per action-selection candidate; microturn scope fires per published-microturn frontier evaluation). Line 206's forward reference to Spec 158 is removed (the rename it anticipates is now landed).

### 10. Migration script

`scripts/migrate-completion-to-microturn.mjs` (single-use, not retained in the final tree) — the live repo had no `packages/engine/test/fixtures/**/*.yaml` completion-scope fixture rewrites to preserve, so the migration was performed directly in source/test files and the script artifact is intentionally absent from the final diff.

## Files to Touch

- `packages/engine/src/cnl/compile-agents.ts` (modify)
- `packages/engine/src/cnl/validate-agents.ts` (modify)
- `packages/engine/src/cnl/lower-agent-considerations.ts` (modify)
- `packages/engine/src/cnl/policy-bytecode/feature-table.ts` (modify)
- `packages/engine/src/agents/microturn-option-eval.ts` (new)
- `packages/engine/src/agents/microturn-option-evaluator.ts` (new)
- `packages/engine/src/agents/completion-guidance-choice.ts` (delete)
- `packages/engine/src/agents/completion-guidance-eval.ts` (delete)
- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/src/agents/policy-runtime.ts` (modify)
- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify)
- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/src/agents/policy-agent.ts` (modify)
- `packages/engine/src/agents/policy-expr.ts` (modify)
- `packages/engine/schemas/GameDef.schema.json` (modify)
- `packages/engine/test/fixtures/**/*.yaml` (modify — fixture migration)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify)
- `packages/engine/test/unit/agents/completion-guidance-choice.test.ts` (delete)
- `packages/engine/test/unit/agents/completion-guidance-eval.test.ts` (delete)
- `docs/agent-dsl-cookbook.md` (modify)
- `scripts/migrate-completion-to-microturn.mjs` (not retained — direct mechanical migration only)

## Out of Scope

- New architectural-invariant tests for the microturn surface (`microturn-option-evaluator.test.ts`, `microturn-scope-validation.test.ts`, `compile-microturn-refs.test.ts`, `no-completion-scope-references.test.ts`, `migration-equivalence-prefer-patronage.test.ts`) — owned by ticket 158MICROPOL-002.
- `policyGuided` completion semantics — owned by Spec 159 (the `agentGuided` → `policyGuided` rename happens there).
- New preview budget allocator — Spec 157.
- Per-option preview at inner microturns — Spec 160.
- Trace shape changes beyond Spec 156's inner-frontier `scoreContributions` — Spec 156.
- Production YAML profile changes — `data/games/**/*.yaml` already has zero `scopes: [completion]` matches; no production data migration needed.

## Acceptance Criteria

### Tests That Must Pass

1. Modified `compile-agents-authoring.test.ts`: `scopes: [completion]` produces the migration-naming diagnostic; each retired ref kind (`option.value`, `decision.type|name|targetKind|optionCount`, `candidate.param.*`, `preview.phase1`, `preview.phase1CompletionsPerAction`) produces a per-kind migration diagnostic.
2. Every `data/games/**/*.yaml` profile compiles cleanly under the new schema (no production-data changes were needed; this test proves simplified profiles round-trip through the new scope enum).
3. Every `packages/engine/test/fixtures/**/*.yaml` fixture compiles cleanly post-migration.
4. Engine suite: `pnpm -F @ludoforge/engine test`.
5. Typecheck: `pnpm turbo typecheck`.
6. Lint: `pnpm turbo lint`.
7. Schema artifacts: `pnpm turbo schema:artifacts`.

### Invariants

1. (architectural-invariant) The set of available scope keywords is exactly `{move, microturn}` — neither superset nor subset.
2. (architectural-invariant) The set of available `microturn.*` refs matches the schema enum exactly.
3. (architectural-invariant) Every repo-owned consideration has `scopes: [move]` or `scopes: [microturn]` — never both, never `[completion]`.
4. (architectural-invariant) `selectBestCompletionChooseOneValue` and `buildCompletionChooseCallback` are not exported and not imported anywhere in `packages/engine/src/**` (delete-confirm; full grep enforcement is added in ticket 002, but the build will fail before then if the deletion is incomplete).
5. (architectural-invariant) Replay-identity preserved — same GameDef + seed + actions twice produces byte-identical decision output post-migration.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify) — add completion-scope rejection cases for `scopes: [completion]` and each of the six retired ref kinds with their per-kind migration diagnostics; prune the existing cases (lines 407, 440, 821, 858, 893, 934, 2125 per reassessment).
2. `packages/engine/test/unit/agents/completion-guidance-choice.test.ts` (delete) — file goes away with the source it tests.
3. `packages/engine/test/unit/agents/completion-guidance-eval.test.ts` (delete) — file goes away with the source it tests.

### Commands

1. `pnpm -F @ludoforge/engine build`, then `pnpm -F @ludoforge/engine exec node --test dist/test/unit/compile-agents-authoring.test.js`
2. `pnpm -F @ludoforge/engine build`
3. `pnpm turbo schema:artifacts`
4. `pnpm turbo lint`, `pnpm turbo typecheck`, `pnpm turbo test`

## Outcome

Outcome amended: 2026-05-06

Implemented. Implementation updates landed in the working tree:

- Completion date: 2026-05-06.
- Replaced policy consideration scope `completion` with `microturn` across compiler validation, runtime schema, generated `GameDef.schema.json`, policy evaluator routing, and existing tests.
- Renamed the completion evaluator pair to `microturn-option-eval.ts` / `microturn-option-evaluator.ts`; deleted the retired completion evaluator tests and migrated existing policy-agent/compiler tests to the microturn surface.
- Added `microturn.*` ref lowering/runtime resolution for the ten refs named by this ticket and compile-time diagnostics for the retired completion-scope refs.
- Updated `docs/agent-dsl-cookbook.md` to document microturn scope instead of the retired completion section.
- `packages/engine/src/agents/policy-wasm-runtime.ts` was verified as no-edit: its score-row path remains move-scope-only and does not consume microturn-scoped considerations, so no completion-scope branch existed there to migrate.
- The full new architectural-invariant test-file matrix, including exhaustive per-retired-ref grep/diagnostic coverage, was completed by archived follow-up `archive/tickets/158MICROPOL-002.md`. This ticket landed the migration and existing-test updates needed for the contract cut; ticket 002 owned the broader new invariant files listed as out of scope here.

Command substitution ledger:

- `Test Plan | pnpm -F @ludoforge/engine test:unit -- compile-agents-authoring | split into build + direct compiled node --test | passed via pnpm -F @ludoforge/engine build and pnpm -F @ludoforge/engine exec node --test dist/test/unit/cnl/compile-considerations.test.js dist/test/unit/compile-agents-authoring.test.js dist/test/unit/agents/policy-agent-microturn-evaluation.test.js dist/test/unit/agents/policy-expr.test.js dist/test/unit/agents/policy-bytecode-fallback-completeness.test.js dist/test/unit/schemas-top-level.test.js`
- `Test Plan | pnpm turbo lint typecheck test | split into pnpm turbo lint + pnpm turbo typecheck + pnpm turbo test | all passed`

Verification:

- `pnpm -F @ludoforge/engine build` passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/cnl/compile-considerations.test.js dist/test/unit/compile-agents-authoring.test.js dist/test/unit/agents/policy-agent-microturn-evaluation.test.js dist/test/unit/agents/policy-expr.test.js dist/test/unit/agents/policy-bytecode-fallback-completeness.test.js dist/test/unit/schemas-top-level.test.js` passed: 166 tests, 166 pass.
- `pnpm turbo schema:artifacts` passed.
- `pnpm -F @ludoforge/engine test` passed: 64/64 default-lane files passed.
- `pnpm turbo lint` passed.
- `pnpm turbo typecheck` passed.
- `pnpm turbo test` passed: 5/5 tasks successful.

Closeout notes:

- `scripts/migrate-completion-to-microturn.mjs` was not retained because the final live migration did not require a persistent YAML rewrite script.
- Source-size deferral: `compile-agents.ts` and `policy-evaluation-core.ts` were already over repo guidance before this ticket; extraction was considered but deferred because this ticket is a contract migration and extraction would widen the proof surface.
- Final status/proof transcription did not invalidate prior implementation evidence because it changed only this ticket's status and outcome text after all code, schema, and doc verification was complete.
