# Spec 158: Microturn Policy Scope and Refs

**Status**: DRAFT
**Priority**: P1 (closes Gap 5 from `reports/microturn-preview-architectural-gaps-2026-05-06.md` — the cookbook deprecates `scopes: [completion]` while `agentGuided` still depends on it; cookbook-compliant profiles cannot author inner-microturn preferences; required by Spec 159 (`policyGuided` completion))
**Complexity**: M (new authoring surface — scope, refs, compiler validation, evaluator dispatch; mechanical migration of repo-owned profiles; deletion of completion-scope code paths; F#14 strict)
**Dependencies**:
- Spec 140 [microturn-native-decision-protocol] (archived) — establishes the atomic-microturn contract that `microturn` scope is named after and aligned with.
- Foundation 5 (One Rules Protocol, Many Clients) — the new scope evaluates only against the published atomic frontier; no client-side compound shapes.
- Foundation 14 (No Backwards Compatibility) — `scopes: [completion]`, `option.value`, `decision.*`, `candidate.param.*`, `preview.phase1`, `preview.phase1CompletionsPerAction` are removed in the same change as `microturn` scope lands.
- Foundation 15 (Architectural Completeness) — closes the "deprecated without replacement" gap that made cookbook-compliant `agentGuided` collapse to greedy.
- Foundation 19 (Decision-Granularity Uniformity) — `microturn` scope is the per-microturn analog of `move` scope; it makes the published-atomic-decision invariant first-class in the policy DSL.

**Source**:
- `reports/microturn-preview-architectural-gaps-2026-05-06.md` Gap 5 (`agentGuided` depends on retired authoring surface).
- `reports/preview-policy-corrections.md` §5 (microturns resemble "split moves" in general game-playing research), §"Recommendation F" (modern microturn refs), Phase 3 of recommended sequence.
- `docs/agent-dsl-cookbook.md:127-144` — explicit list of retired surfaces, including `scopes: [completion]` and `option.value`.
- Code anchors:
  - `packages/engine/src/agents/policy-preview.ts:394-415` — `pickAgentGuidedChooseOneDecision` calls `selectBestCompletionChooseOneValue`, which evaluates `scopes: [completion]` considerations using `option.value`.
  - `packages/engine/src/agents/completion-guidance-choice.ts` — the chooser that evaluates completion-scope considerations.
  - `packages/engine/src/agents/policy-preview.ts:482-483` — silent fallback from `agentGuided` to `greedy` when `selectBestCompletionChooseOneValue` returns undefined.
  - `packages/engine/src/cnl/compile-agents.ts:578-583` — scope filtering at evaluation time (`considerations[id]?.scopes?.includes('move')`).
- Empirical evidence: `exp-001` of the campaign restart reproduced `preferPatronageMode` (completion-scope, weight 10) flipping 4/4 govern-mode chooseOnes from `aid` to `patronage`. The mechanism still works mechanically; the deprecation message tells operators not to use it. The contradiction is the gap.

## Brainstorm Context

**Original framing.** Spec 140 made every kernel-published decision atomic. The cookbook (post-Spec-140) deprecated the authoring surfaces that referenced unpublished sub-decisions: `scopes: [completion]`, `decision.type`, `decision.name`, `decision.targetKind`, `decision.optionCount`, `option.value`, `candidate.param.*`. The reasoning was correct: those refs encouraged operators to reason about pre-microturn template completions, which Spec 140 retired.

But the engine kept evaluating `scopes: [completion]` because `agentGuided` completion in `policy-preview.ts:394-415` routes through `selectBestCompletionChooseOneValue`, which is the only evaluator for completion-scope considerations. With the cookbook telling operators not to author them, every cookbook-compliant profile gets `selectBestCompletionChooseOneValue` returning `undefined`, and `agentGuided` silently falls back to `greedy` at `policy-preview.ts:482-483`. The deprecation is one-sided: the surface is removed in spirit but not in implementation, and the "modern" replacement (`agentGuided`) is meaningless without it.

The fix is not "un-deprecate completion" — that violates F#14 (no shims, no quiet fallbacks) and recreates the conceptual confusion Spec 140 cleaned up. The fix is to *replace* completion scope with a microturn-native equivalent that says exactly the same thing in a way consistent with the post-Spec-140 protocol: a consideration that fires at the *currently published* atomic decision frontier, with refs over the *currently published* options. Same expressive power, coherent semantics, no deprecated terms.

**Motivation.**

1. **F#15 (Architectural Completeness) demands a working modern surface.** A "deprecated without replacement" listing is a design smell and a Foundation violation. Either un-deprecate (rejected — F#14) or replace (this spec). The replacement is the smaller architectural commitment.
2. **Spec 159 (`policyGuided`) cannot land without `microturn` scope.** `policyGuided` is the rename of `agentGuided` once it routes through a non-deprecated surface. Without 158, 159 is a pure rename with the same broken backbone.
3. **F#14 demands one-shot migration.** Any incremental approach (add `microturn`, deprecate `completion` later) explicitly violates F#14's same-change-rule. Spec 158's scope is exactly the migrate-everything-now scope F#14 prescribes.

**Prior art surveyed.**

- **Spec 140 [microturn-native-decision-protocol] (archived)** — established the atomic-decision contract. The new `microturn` scope is named after Spec 140's terminology and matches its semantics: each consideration fires once per published microturn frontier evaluation; refs read only from the currently-published decision and its options.
- **Existing `move` scope** — the analogous case for action-selection candidates. `move` scope considerations evaluate once per candidate at action-selection time. `microturn` scope is the per-published-microturn analog at chooseOne / chooseNStep / stochasticResolve / outcomeGrantResolve / turnRetirement boundaries.
- **`option.value` retired ref** — the previous syntax for "the value bound to this option." `microturn.option.value` is the post-Spec-140 equivalent, scoped explicitly to the published frontier.
- **`candidate.tag.*` (still active)** — proves the convention: domain-prefixed dotted refs that name a specific evaluation context. `microturn.kind`, `microturn.option.value`, etc. follow the same shape.
- **Split-move literature (`reports/preview-policy-corrections.md` §5).** General Game Playing research treats compound moves as sequences of lower-level decisions; agents can search at the lower-level granularity. `microturn` scope makes that granularity addressable in policy authoring, consistent with F#19.

**Synthesis.** Add `scopes: [microturn]` and ten `microturn.*` refs. Compile-time enforcement that microturn-scope considerations only reference microturn refs and standard expression refs (`var.*`, `feature.*`, etc.) — never `move.*` or `candidate.*` (which would fire at the wrong scope). Migrate every repo-owned consideration that uses `scopes: [completion]` or any retired ref to the new scope. Make `scopes: [completion]`, `option.value`, `decision.*`, `candidate.param.*`, `preview.phase1`, `preview.phase1CompletionsPerAction` fail compilation with a diagnostic naming the replacement. Delete the completion-scope evaluator (`selectBestCompletionChooseOneValue`) and its dependency chain.

**Alternatives explicitly considered (and rejected).**

- **Un-deprecate `completion` scope.** Cleanest near-term but resurrects the conceptual confusion Spec 140 cleaned up and the surfaces the cookbook explicitly retired. Rejected — F#14 + Spec 140 alignment.
- **Add `microturn` scope without removing `completion`.** Two equivalent surfaces shipped simultaneously is exactly the `_legacy` shim F#14 forbids. Rejected — F#14 strict.
- **Replace per-option preference with move-level scoring (look forward into action structure from the action-selection trace).** Rejected in `reports/preview-policy-corrections.md` §"Replace completion-scope with microturn-aware surface" — less expressive, can't capture conditional preferences keyed on option values, recreates the dual-grammar problem Spec 140 closed.
- **Per-microturn macros that lower into `move` scope at compile time.** Tempting (no new scope keyword) but breaks the per-microturn-evaluation semantics: `move` scope considerations fire only at action-selection. Rejected — semantic mismatch.

**User constraints reflected.** F#1 (engine remains agnostic — refs are generic, no FITL-specific semantics in the engine), F#5 (one rules protocol — `microturn` scope evaluates against the kernel-published frontier, no client-side compound shapes), F#7 (specs are data — refs are declarative, no eval), F#14 (one-shot migration), F#15 (root-cause replacement), F#19 (atomic decision granularity made first-class in DSL).

## Overview

Three deliverables:

1. **Add `scopes: [microturn]` and `microturn.*` refs.** Scope enum gains `microturn`. Ten refs land: `microturn.kind`, `microturn.decisionKey`, `microturn.actorSeat`, `microturn.option.value`, `microturn.option.index`, `microturn.option.stableKey`, `microturn.option.tags`, `microturn.option.targetKind`, `microturn.remainingRequiredCount`, `microturn.remainingMaxCount`. Compiler validates that microturn-scope considerations only use `microturn.*` refs and shared expression refs (`var.*`, `feature.*`, `globalMarker.*`, `metric.*`); referencing `move.*` or `candidate.*` from a microturn-scope consideration is a compile-time error.

2. **Migrate every repo-owned profile and fixture off retired surfaces.** Update FITL diagnostic profiles, every test fixture, every cookbook example. Remove every `scopes: [completion]` consideration; rewrite as `scopes: [microturn]` with the equivalent ref translations (`option.value` → `microturn.option.value`, `decision.name` → `microturn.decisionKey`, etc.). The cookbook's "Retired For New Production Profiles" section is deleted; the new microturn surface is documented in its own section.

3. **Delete completion-scope code paths.** Remove `selectBestCompletionChooseOneValue` from `completion-guidance-choice.ts` (or rewrite it as the microturn-scope evaluator under a new name). Remove the `scopes: [completion]` enum entry. Remove `option.value`, `decision.*`, `candidate.param.*`, `preview.phase1`, `preview.phase1CompletionsPerAction` from the IR ref kinds and emitter. Compile-time rejection of any of these surfaces in shipped or fixture YAML.

The microturn-scope evaluator (the renamed-and-rewired `selectBestCompletionChooseOneValue`, hereafter `selectBestMicroturnOption`) is consumed by Spec 159's `policyGuided` completion. Spec 158 only lands the evaluator and its compile-time wiring; Spec 159 lands the new completion policy that uses it.

## Phase Acceptance Budget

Single-phase delivery. The change is structurally one transaction: the new scope, the new refs, the migration, and the deletion all ship together to satisfy F#14.

| Phase | Deliverable | Acceptance Criterion |
|-------|-------------|----------------------|
| Phase A | `microturn` scope + refs + migration + deletion | New scope and all ten refs compile-validate and evaluate over a 10-fixture matrix; every repo-owned profile/fixture is migrated; every retired ref / scope produces a compile-time error with a migration-naming diagnostic; `selectBestCompletionChooseOneValue` is deleted (or renamed to `selectBestMicroturnOption` with completion-scope semantics removed); no `_legacy` field, no shim. |

## Architecture Check

1. **Why this approach is cleaner than alternatives.** The scope name + ref prefix make the evaluation context explicit at the call site. An operator reading `scopes: [microturn]` knows the consideration fires at every published microturn frontier; an operator reading `microturn.option.value` knows they're naming the option of the currently-published decision. The deprecation contradiction is closed cleanly: the new surface says exactly what the operator means, in vocabulary aligned with the kernel's protocol.
2. **GameSpecDoc vs runtime boundary.** All microturn refs are engine-generic. `microturn.decisionKey` is the kernel's `decisionKey` string — set by the GameSpec author, named generically by the engine. `microturn.option.value` is the option's bound value, untyped at the engine level (compared via canonical equality). No engine code interprets game-specific decision names.
3. **No backwards-compatibility shims.** F#14 strict: `completion` scope and the six retired ref kinds are removed in the same change as `microturn` lands. Every repo-owned profile is migrated. Compile-time rejection of any retired surface, with a diagnostic naming the migration. No `_legacy` enum value. No quiet fallback.

## What to Change

### 1. Scope enum and consideration validation — `packages/engine/src/cnl/compile-agents.ts`, `validate-agents.ts`

Scope enum gains `microturn`. Scope enum loses `completion`. Validator rejects `scopes: [completion]` with a diagnostic: `"scopes: [completion] is removed; use scopes: [microturn] with microturn.* refs"`. Validator rejects mixing `microturn` with `move` in the same `scopes` array — a consideration is one or the other.

### 2. Ref enum — `packages/engine/src/cnl/policy-bytecode/feature-table.ts` (or equivalent), policy-expr.ts

Ten new ref kinds: `microturn:kind`, `microturn:decisionKey`, `microturn:actorSeat`, `microturn:option:value`, `microturn:option:index`, `microturn:option:stableKey`, `microturn:option:tags`, `microturn:option:targetKind`, `microturn:remainingRequiredCount`, `microturn:remainingMaxCount`. Six removed: `decision:type`, `decision:name`, `decision:targetKind`, `decision:optionCount`, `option:value`, every `candidate:param:*` flavor. Ref kind validator rejects each removed kind with a migration-naming diagnostic.

### 3. Evaluator — `packages/engine/src/agents/microturn-evaluator.ts` (new)

New evaluator that takes (microturn, option) and returns the per-option score using the profile's microturn-scope considerations. Stable tie-breaks; integer arithmetic. Reuses the same `evaluateConsideration` machinery as move-scope, parameterized by the new ref-resolution context.

`completion-guidance-choice.ts` is renamed to `microturn-option-evaluator.ts` (or deleted entirely if the new evaluator subsumes it). `selectBestCompletionChooseOneValue` is removed.

### 4. Compile-time pruning — `packages/engine/src/cnl/compile-agents.ts`

Every `costClass` flag, scope filter, and consideration-list aggregation that previously branched on `'completion'` is updated to branch on `'microturn'`. Dead code on the completion paths is deleted in the same patch.

### 5. Profile migration — `data/games/**/*.yaml`, `packages/engine/test/fixtures/**`, `packages/engine/test/data/**`

Every consideration with `scopes: [completion]` rewritten to `scopes: [microturn]`; every `option.value` ref rewritten to `microturn.option.value`; every `decision.name` to `microturn.decisionKey`; etc. Mechanical, but exhaustive. Migration script lives under `scripts/migrate-completion-to-microturn.mjs` (single-use, deleted after the migration commit).

### 6. Cookbook — `docs/agent-dsl-cookbook.md`

Section "Retired For New Production Profiles" is deleted. New section "Microturn Scope" documents the ten refs and gives a worked example (govern-mode chooseOne with `preferPatronageMode` rewritten to microturn scope). Section "Considerations" gains a sentence about choosing between `move` and `microturn` scope.

### 7. Trace integration

Trace shape gains no new fields — `microturn` is a scope keyword, not a new evaluation phase. Existing per-consideration trace fields (e.g., `scoreContributions[].termId`) carry through unchanged. Spec 156's inner-frontier `scoreContributions` is what surfaces microturn-scope consideration firings in the trace.

### 8. Schema — `packages/engine/schemas/GameDef.schema.json`

Scope enum updated to `["move", "microturn"]`. Ref kind enum updated. The schema diff is the canonical migration record.

## Files to Touch

- `packages/engine/src/cnl/compile-agents.ts` (modify — scope/ref validation; completion-scope removal)
- `packages/engine/src/cnl/validate-agents.ts` (modify — diagnostics)
- `packages/engine/src/cnl/lower-agent-considerations.ts` (modify — IR lowering for microturn refs)
- `packages/engine/src/cnl/policy-bytecode/feature-table.ts` (modify — bytecode ref kinds)
- `packages/engine/src/agents/microturn-option-evaluator.ts` (new — replaces `completion-guidance-choice.ts`)
- `packages/engine/src/agents/completion-guidance-choice.ts` (delete)
- `packages/engine/src/agents/completion-guidance-eval.ts` (delete or rewrite — evaluate iteration over completion paths is replaced by microturn paths)
- `packages/engine/src/agents/policy-eval.ts` (modify — scope filter `'completion'` → `'microturn'`)
- `packages/engine/src/agents/policy-preview.ts` (modify — `pickAgentGuidedChooseOneDecision` switches to microturn evaluator; full rename happens in Spec 159)
- `packages/engine/src/agents/policy-expr.ts` (modify — ref kind dispatch)
- `packages/engine/schemas/GameDef.schema.json` (modify)
- `data/games/fire-in-the-lake/**/*.yaml` (modify — every consideration migrated)
- `data/games/texas-holdem/**/*.yaml` (modify — every consideration migrated)
- `packages/engine/test/fixtures/**/*.yaml` (modify — every fixture migrated)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify — completion-scope rejection)
- `packages/engine/test/unit/agents/microturn-option-evaluator.test.ts` (new)
- `packages/engine/test/unit/agents/microturn-scope-validation.test.ts` (new)
- `packages/engine/test/unit/cnl/compile-microturn-refs.test.ts` (new)
- `packages/engine/test/agents/no-completion-scope-references.test.ts` (new — F#14 enforcement)
- `docs/agent-dsl-cookbook.md` (modify — retired-section deleted, microturn section added)
- `scripts/migrate-completion-to-microturn.mjs` (new — single-use, deleted in same commit-set)

## Out of Scope

- `policyGuided` completion semantics. (Spec 159 — depends on this spec's evaluator.)
- New preview budget allocator. (Spec 157.)
- Per-option preview at inner microturns. (Spec 160.)
- Trace shape changes beyond Spec 156's inner-frontier `scoreContributions`. (Spec 156.)
- Renaming `agentGuided` to `policyGuided`. (Spec 159.)

## Acceptance Criteria

### Tests That Must Pass

1. New: `scopes: [microturn]` consideration with `microturn.kind == 'chooseOne'` and `microturn.decisionKey == 'governMode'` matches a govern-mode chooseOne and not other chooseOnes (engine-generic — verified on a non-FITL fixture).
2. New: A consideration with `scopes: [microturn]` referencing `move.actionId` fails compilation with diagnostic `"move.* refs cannot be used in microturn-scope considerations"`.
3. New: A profile with `scopes: [completion]` fails compilation with diagnostic naming `microturn` migration.
4. New: A profile with `option.value` ref fails compilation with diagnostic naming `microturn.option.value`.
5. New: Every repo-owned `data/games/**/*.yaml` profile compiles cleanly under the new schema.
6. New: `selectBestCompletionChooseOneValue` is not exported and not imported anywhere in `packages/engine/src/**` (delete-confirm test).
7. New: Replay-identity test — same GameDef + seed + actions twice produces byte-identical decision output post-migration.
8. New: F#14 grep test — `packages/engine/src/**` and `data/games/**` contain no `scopes: [completion]`, `option.value`, `decision.name`, `decision.type`, `decision.targetKind`, `decision.optionCount`, `candidate.param.`, `preview.phase1`.
9. Existing engine suite: `pnpm -F @ludoforge/engine test`.
10. Existing typecheck: `pnpm turbo typecheck`.

### Invariants

1. (architectural-invariant) Microturn-scope considerations evaluate exactly once per (microturn, option) pair when the chooser invokes the evaluator — no compound-shape aggregation, no unpublished sub-decisions referenced.
2. (architectural-invariant) The set of available scope keywords is exactly `{move, microturn}` — neither superset nor subset.
3. (architectural-invariant) The set of available `microturn.*` refs matches the schema enum exactly.
4. (architectural-invariant) Every repo-owned consideration has `scopes: [move]` or `scopes: [microturn]` — never both, never `[completion]`.
5. (architectural-invariant) `agentGuided` (still under that name in this spec) routing through the new microturn evaluator produces the same behavior on the FITL `preferPatronageMode` fixture as the pre-migration completion-scope path produced — equivalence proof for the migration.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/microturn-option-evaluator.test.ts` (new) — `architectural-invariant`. Per-option scoring matches manual computation across the ten ref kinds.
2. `packages/engine/test/unit/agents/microturn-scope-validation.test.ts` (new) — `architectural-invariant`. Compile-time rejection of cross-scope refs.
3. `packages/engine/test/unit/cnl/compile-microturn-refs.test.ts` (new) — `architectural-invariant`. Every microturn ref kind compiles to the expected IR / bytecode shape.
4. `packages/engine/test/agents/no-completion-scope-references.test.ts` (new) — `architectural-invariant`. F#14 grep enforcement.
5. `packages/engine/test/agents/migration-equivalence-prefer-patronage.test.ts` (new) — `convergence-witness` with `@witness: spec-158-completion-to-microturn-equivalence`. The pre-migration `preferPatronageMode` fixture rewritten to microturn scope produces identical decision output on a fixed FITL seed (justifies the migration as semantics-preserving).
6. `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify) — completion-scope rejection cases added; existing cases pruned.
7. `packages/engine/test/unit/agents/completion-guidance-choice.test.ts` (delete) — file goes away with the source it tests.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- agents/microturn-option-evaluator`
2. `pnpm -F @ludoforge/engine test:unit -- agents/microturn-scope-validation`
3. `pnpm -F @ludoforge/engine test:unit -- cnl/compile-microturn-refs`
4. `pnpm -F @ludoforge/engine test:unit -- agents/migration-equivalence-prefer-patronage`
5. `pnpm turbo schema:artifacts`
6. `pnpm turbo lint typecheck test`
