# Spec 159: `policyGuided` Completion With Trace-Visible Fallback

**Status**: DRAFT
**Priority**: P1 (closes Gap 3 — uniform projected margins under `greedy` — and the silent-fallback half of Gap 5 from `reports/microturn-preview-architectural-gaps-2026-05-06.md`; replaces `agentGuided` as the default high-quality completion policy now that the microturn-scope authoring surface exists)
**Complexity**: M (rename + rewire; new explicit fallback; trace fields; deletion of silent-fallback path; depends on Specs 156 and 158 already landed)
**Dependencies**:
- Spec 156 [preview-observability-and-utility-metrics] (completed) — landed the synthetic-decision trace shape: the `selectionReason` enum with the `'fallback'` slot reserved-but-unemitted, and the `completionPolicy` field on each inner-microturn trace entry. Spec 159 is the first to emit `selectionReason: 'fallback'` and adds the new `completionPolicyFallbackCount` aggregate on `previewUsage`.
- Spec 158 [microturn-policy-scope-and-refs] (completed) — landed `selectBestMicroturnChooseOneValue` (chooseOne path) and `buildMicroturnChooseCallback` (chooseNStep path) in `microturn-option-evaluator.ts`. These are the engines that `policyGuided` invokes per inner microturn.
- Spec 145 [bounded-synthetic-completion-preview] (completed) — the preview drive loop this spec re-routes.
- Foundation 5 (One Rules Protocol, Many Clients) — `policyGuided` evaluates against the published frontier, not unpublished sub-decisions.
- Foundation 10 (Bounded Computation) — `policyGuided` is local frontier scoring, not recursive action-selection preview; cost stays bounded.
- Foundation 14 (No Backwards Compatibility) — `agentGuided` is renamed and the silent fallback is deleted in the same change; no `_legacy` policy name.
- Foundation 15 (Architectural Completeness) — replaces a misleading name and a silent failure mode with explicit, traceable behavior.
- Foundation 19 (Decision-Granularity Uniformity) — synthetic completion decides one published microturn at a time, in step with the kernel's protocol.

**Source**:
- `reports/microturn-preview-architectural-gaps-2026-05-06.md` Gap 3 (greedy uniform margins), Gap 5 (silent fallback when completion-scope considerations absent).
- `reports/preview-policy-corrections.md` §"Recommendation D" (greedy as diagnostic fallback only), §"Recommendation E" (replace `agentGuided` with `policyGuided`), §6 (trace must record fallbacks), Phase 4 of recommended sequence.
- Code anchors:
  - `packages/engine/src/agents/policy-preview.ts:431-452` — `pickAgentGuidedChooseOneDecision` (post-Spec-158: routed through `selectBestMicroturnChooseOneValue`).
  - `packages/engine/src/agents/policy-preview.ts:454-507` — `pickAgentGuidedChooseNStepDecision` (post-Spec-158: routed through `buildMicroturnChooseCallback`).
  - `packages/engine/src/agents/policy-preview.ts:519-520` and `:524-526` — silent `?? pickGreedy*Decision(...)` fallbacks (chooseOne and chooseNStep, respectively) that this spec deletes.
  - `packages/engine/src/agents/policy-preview.ts:509-529` — `pickInnerDecision` switch on `policy === 'agentGuided'` — renamed in this spec.
  - `packages/engine/src/cnl/compile-agents.ts:762-849` — `lowerPreviewConfig`, the preview policy validator/lowerer.
  - `packages/engine/src/agents/policy-agent.ts:26` (interface) and `:186` (class) — `fallbackOnError` precedent for the proposed `fallbackCompletionPolicy` config field.

## Brainstorm Context

**Original framing.** Post-Spec-158 the engine has working microturn-scope evaluators (`selectBestMicroturnChooseOneValue` for chooseOne and `buildMicroturnChooseCallback` for chooseNStep) and operators have a non-deprecated authoring surface for inner-microturn preferences. But the completion policy enum in `preview.completion` still exposes `agentGuided`, a name that misleads on two counts: (1) it suggests recursion into a full agent invocation per inner microturn (it doesn't — it's local frontier scoring), and (2) it falls back silently to `greedy` when the evaluator returns undefined, hiding the failure mode at `policy-preview.ts:519-520` (chooseOne) and `:524-526` (chooseNStep) — two parallel sites inside `pickInnerDecision`.

The cookbook calls this out indirectly (it tells operators not to author the surface `agentGuided` depends on) but the user-visible config knob still says `agentGuided`. An operator who reads the cookbook, removes their completion-scope considerations, and writes a microturn-scope consideration expects `agentGuided` to use it — but until this spec lands, `agentGuided`'s implementation is hard-wired to call the (now-deleted) completion-scope evaluator. Spec 158 rewires the call site; Spec 159 renames the surface to `policyGuided`, makes the fallback explicit and trace-visible, and ships the user-facing migration.

**Motivation.**

1. **The name was always wrong.** "Agent-guided" suggested the agent's decision policy was driving the synthetic completion. It wasn't — it was a local lookup against `scopes: [completion]` considerations. `policyGuided` accurately names what the implementation does: at each synthetic inner microturn, the same policy considerations that score real decisions score the synthetic options. The rename clarifies the contract.
2. **Silent fallback is an F#15 violation.** A completion driver that silently downgrades from `policyGuided` to `greedy` produces uniform-margin previews that look successful (`previewOutcome: ready`) but aren't useful. F#15 demands we close the silent-failure gap; F#9 demands the fallback land in the trace.
3. **F#14 demands the rename ship as one transaction.** Add `policyGuided` and remove `agentGuided` in the same change as the silent fallback is replaced by an explicit, configurable, trace-visible fallback. No alias; no period of "both names accepted."

**Prior art surveyed.**

- **Spec 145 [bounded-synthetic-completion-preview] (completed)** — established `agentGuided`, `greedy` as the two completion policies. Section §D5 (greedy) acknowledged greedy as deterministic but adversarial ("if I randomly close my own action, how does the world look?").
- **TAG / OpenSpiel rollout policies (`reports/preview-policy-corrections.md` §6).** Both frameworks distinguish "light" rollouts (random, fast, often arbitrary) from "heavy" rollouts (knowledge-guided, slower, more accurate). The named distinction is operator-visible. `policyGuided` vs `greedy` is the LudoForge analog.
- **PUCT priors with explicit fallback enumeration (`reports/preview-policy-corrections.md` §3).** Standard practice: when the prior cannot decide, fall back to a documented secondary choice (e.g., uniform random). The fallback is named, enumerated, and recorded.
- **Existing `fallbackOnError` field on `PolicyAgentConfig`** (`policy-agent.ts:178`) — convention exists for explicit fallback configuration.

**Synthesis.**

1. Rename `agentGuided` → `policyGuided` everywhere (config schema, IR, runtime, fixtures, cookbook). Delete the `agentGuided` enum value. F#14 strict.
2. Replace the two silent `?? pickGreedy*Decision(...)` fallbacks (chooseOne at `policy-preview.ts:519-520`, chooseNStep at `:524-526`) with an explicit `fallbackCompletionPolicy: 'greedy' | 'fail'` config field on `preview.completion`. Default fallback is `greedy` (matches today's behavior on the surface) but the fallback path emits `selectionReason: 'fallback'` (Spec 156 reserved this slot but never emitted it) and increments the new `completionPolicyFallbackCount` aggregate on `previewUsage` (added by this spec; the synthetic-decision `completionPolicy` field on which it builds is Spec 156's contribution).
3. `fallbackCompletionPolicy: 'fail'` causes the preview drive to abort with `previewOutcome: noPreviewDecision` (existing enum value) rather than silently downgrading. Useful for diagnostic profiles that want a loud failure when policyGuided cannot decide.
4. Add a compile-time warning (not error) when a profile declares `preview.completion: policyGuided` but has no `scopes: [microturn]` considerations declared. This is the F#15 close on Gap 5: an operator authoring `policyGuided` without microturn considerations gets a build-time signal that their config is no-op.

**Alternatives explicitly considered (and rejected).**

- **Keep the name `agentGuided`.** Backward-compatible but actively misleading. Rejected — F#15 (clarity is part of architectural completeness).
- **Make `fallbackCompletionPolicy` always `'fail'`, no `'greedy'` option.** Cleanest semantics but breaks profiles that legitimately want a defined-default for non-discriminating microturns (e.g., a chooseN where two options are equivalent). Rejected — `'greedy'` is a useful explicit fallback when traced.
- **Make the fallback non-configurable; always trace-visible greedy.** Simpler but eliminates the diagnostic `'fail'` mode that some campaign harnesses want. Rejected — small-scope expressivity is cheap.
- **Run `policyGuided` recursively (invoke the policy agent on the inner microturn rather than just the microturn-scope considerations).** Maximally faithful but unbounded — recursion into action-selection preview from inside a preview drive risks stack growth and cost blow-up. Rejected — F#10.

**User constraints reflected.** F#5 (frontier-scoped scoring), F#8 (deterministic — same tie-breaks as the chooser), F#9 (fallbacks traced), F#10 (no recursion — local frontier scoring only), F#14 (rename + delete in one change), F#15 (close the silent gap), F#19 (per-published-microturn evaluation).

## Overview

Two deliverables, both surface-level:

1. **Rename and rewire.** `agentGuided` → `policyGuided` in `preview.completion` enum, IR, runtime, fixtures, and tests. The implementation already routes through Spec 158's `selectBestMicroturnChooseOneValue` (chooseOne) and `buildMicroturnChooseCallback` (chooseNStep). The two silent fallbacks at `policy-preview.ts:519-520` (chooseOne) and `:524-526` (chooseNStep) are replaced by an explicit, configurable, trace-visible fallback. The runtime input prop `agentGuidedDeps` is renamed to `policyGuidedDeps` in the same transaction (F#14).
2. **Compile-time warning.** Profiles using `policyGuided` without microturn-scope considerations get a build-time warning naming the missing surface.

Trace integration:
- Per inner microturn, the synthetic-decision trace entry (Spec 156) records `completionPolicy: 'policyGuided' | 'greedy' | 'fallback'` and `selectionReason`.
- Per preview drive, `previewUsage.completionPolicyFallbackCount: integer` totals fallback firings across all candidates in the decision.

Default disposition: new profiles **authoring** `preview.completion` should declare `policyGuided` with `fallbackCompletionPolicy: greedy`. The runtime IR default in `policy-runtime.ts:191` (`activeProfile?.preview.completion ?? 'greedy'`) remains `'greedy'` — flipping it would silently change behavior for every undeclared profile, at odds with F#15. Operators authoring diagnostic profiles can opt into `fallbackCompletionPolicy: fail` for hard-failure tracing.

## Phase Acceptance Budget

Single-phase delivery. The rename and the fallback change must ship together — F#14 forbids partial transitions, and the silent fallback is what makes the rename meaningful in the first place.

| Phase | Deliverable | Acceptance Criterion |
|-------|-------------|----------------------|
| Phase A | Rename + explicit fallback + compile-time warning | Profiles with `preview.completion: policyGuided` and a microturn-scope `preferPatronageMode` consideration produce non-uniform projected margins on a govern-mode FITL fixture (vs constant margins under `greedy`); fallback firings are recorded in trace; `agentGuided` is unknown to the schema; profiles with `policyGuided` but no microturn considerations emit a compile-time warning. |

## Architecture Check

1. **Why this approach is cleaner than alternatives.** The rename matches the implementation; the explicit fallback satisfies F#9 and closes the silent failure mode that hid Gap 5. Compile-time warning satisfies F#15 (architectural completeness — operators can't accidentally ship a no-op config).
2. **GameSpecDoc vs runtime boundary.** `policyGuided` is engine-generic — it's a completion policy keyword. The actual game-specific guidance lives in microturn-scope considerations under the profile's YAML. No engine code interprets game-specific microturn guidance.
3. **No backwards-compatibility shims.** F#14 strict: `agentGuided` is removed. No alias. No deprecation warning that accepts both names. Every repo-owned profile is migrated in the same change.

## What to Change

### 1. Rename — Zod schema, IR types, runtime, preview, validator, tests

Replace every reference to `agentGuided` (string literal AND identifier) with `policyGuided` across:

- `packages/engine/src/kernel/schemas-core.ts` — Zod enum at lines 1154, 2031, 2038.
- `packages/engine/src/kernel/types-core.ts` — `AgentPreviewCompletionPolicy` union at line 842.
- `packages/engine/src/cnl/compile-agents.ts` — validation message and diagnostic suggestion.
- `packages/engine/src/agents/policy-preview.ts` — `pickAgentGuided*` functions and policy-string switches.
- `packages/engine/src/agents/policy-runtime.ts` — `agentGuidedDeps` consumer.
- Affected test files (see Files to Touch).

`packages/engine/schemas/GameDef.schema.json` regenerates from the Zod source via `pnpm turbo schema:artifacts`; it is not hand-edited.

The runtime input prop `agentGuidedDeps` on `CreatePolicyPreviewRuntimeInput` (`policy-preview.ts:135`, consumers at `:437`, `:460`, `policy-runtime.ts:195`) is renamed to `policyGuidedDeps` in the same change. F#14: no alias; no period of "both names accepted".

### 2. Explicit fallback — `packages/engine/src/agents/policy-preview.ts`

`pickInnerDecision` becomes:

```ts
const pickInnerDecision = (...): { decision: Decision | undefined; usedFallback: boolean } => {
  if (policy === 'policyGuided') {
    const guided = pickPolicyGuidedDecision(state, def, microturn, input);
    if (guided !== undefined) return { decision: guided, usedFallback: false };
    if (fallback === 'fail') return { decision: undefined, usedFallback: true };  // signals noPreviewDecision
    return { decision: pickGreedyDecision(microturn), usedFallback: true };
  }
  return { decision: pickGreedyDecision(microturn), usedFallback: false };
};
```

`pickPolicyGuidedChooseOneDecision` and `pickPolicyGuidedChooseNStepDecision` (renamed from `pickAgentGuided*`) call Spec 158's `selectBestMicroturnChooseOneValue` and `buildMicroturnChooseCallback` respectively. The pseudocode shows the chooseOne shape; `pickInnerDecision` applies the same `policyGuided`/`fail`/`greedy` switch in parallel for the chooseNStep branch. Both silent-fallback expressions — `policy-preview.ts:519-520` (chooseOne) and `:524-526` (chooseNStep) — are deleted in the same change.

### 3. `fallbackCompletionPolicy` config — `packages/engine/src/cnl/compile-agents.ts`, schema

`preview.completion` (existing) gains a sibling `preview.fallbackCompletionPolicy: 'greedy' | 'fail'` (default `greedy`). Compile-time validate that `fallbackCompletionPolicy` is set only when `completion === 'policyGuided'` (it's meaningless for `greedy`).

### 4. Trace integration — `packages/engine/src/agents/policy-preview.ts`

Per inner microturn taken: the synthetic-decision trace entry records `completionPolicy: 'policyGuided' | 'greedy' | 'fallback'` (extending the `AgentPreviewCompletionPolicy` enum from Spec 156's two values to three) and `selectionReason: 'fallback'` when the policyGuided evaluator returned undefined and `fallbackCompletionPolicy: 'greedy'` fired (Spec 156 reserved the `'fallback'` enum slot; this spec is the first to emit it). Per preview drive: aggregate the new `completionPolicyFallbackCount` for the candidate. Per decision: aggregate across candidates and stamp on `previewUsage` (`completionPolicyFallbackCount` is a new field on the `PolicyPreviewUsageTrace` type — Spec 159 owns it).

### 5. Compile-time warning — `packages/engine/src/cnl/validate-agents.ts`

When `profile.preview.completion === 'policyGuided'` and `profile.use.considerations` contains no microturn-scope consideration, emit `{ severity: 'warning', message: 'preview.completion: policyGuided with no scopes: [microturn] considerations declared — completion will always fall back to ' + fallbackPolicy }`. Warning, not error: an operator might intentionally declare `policyGuided` planning to add microturn considerations later.

### 6. Profile migration — none required for repo-owned game data

No `data/games/**/*.yaml` profile currently declares `preview.completion`; every profile relies on the runtime IR default of `'greedy'` (`policy-runtime.ts:191`). After this spec lands, any new profile authoring an explicit completion policy will write `policyGuided` (the `agentGuided` enum value is gone). Diagnostic profiles can opt into `fallbackCompletionPolicy: fail`. The IR default itself is preserved (see Overview Default disposition).

Existing test files that DO declare `'agentGuided'` in inline test fixtures (`test/integration/agents/cross-game-driver-conformance.test.ts`, `test/unit/compile-agents-authoring.test.ts`, `test/unit/agents/policy-diagnostics-preview.test.ts`) are migrated to `'policyGuided'` in the same change.

### 7. Cookbook — `docs/agent-dsl-cookbook.md`

`preview.completion: policyGuided` is the documented default; `greedy` is explicitly named as "fast, non-discriminating, useful as a baseline or fallback". The synthetic-decision trace and `completionPolicyFallbackCount` are documented as the diagnostic for "is policyGuided actually firing on my profile?".

## Files to Touch

Source:

- `packages/engine/src/kernel/schemas-core.ts` (modify — Zod enum at lines 1154, 2031, 2038; `fallbackCompletionPolicy` added; `completionPolicyFallbackCount` added to `PolicyPreviewUsageTrace`)
- `packages/engine/src/kernel/types-core.ts` (modify — `AgentPreviewCompletionPolicy` union at line 842 extended to `'greedy' | 'policyGuided' | 'fallback'`; `PolicyPreviewUsageTrace.completionPolicyFallbackCount` added)
- `packages/engine/src/cnl/compile-agents.ts` (modify — `lowerPreviewConfig` at lines 762-849; validation messages; accept `fallbackCompletionPolicy`)
- `packages/engine/src/cnl/validate-agents.ts` (modify — compile-time warning when a `policyGuided` profile declares no microturn-scope considerations)
- `packages/engine/src/agents/policy-preview.ts` (modify — rename `pickAgentGuided*` functions and `agentGuidedDeps` prop, replace two silent fallbacks with explicit `pickInnerDecision` returning `{ decision; usedFallback }`, emit `selectionReason: 'fallback'` and aggregate `completionPolicyFallbackCount`)
- `packages/engine/src/agents/policy-runtime.ts` (modify — `agentGuidedDeps` → `policyGuidedDeps` consumer at line 195; runtime IR default at line 191 preserved as `'greedy'`)

Generated:

- `packages/engine/schemas/GameDef.schema.json` (auto-regenerated by `pnpm turbo schema:artifacts` from `schemas-core.ts`; not hand-edited; `pnpm test` runs `schema:artifacts:check` which fails CI if the artifact drifts)

Test (existing — migrated):

- `packages/engine/test/integration/agents/cross-game-driver-conformance.test.ts` (modify — 2 `'agentGuided'` literals)
- `packages/engine/test/unit/compile-agents-authoring.test.ts` (modify — 2 `'agentGuided'` literals)
- `packages/engine/test/unit/agents/policy-diagnostics-preview.test.ts` (modify — 2 `'agentGuided'` literals)

Test (new):

- `packages/engine/test/unit/agents/policy-guided-completion.test.ts` (new — `architectural-invariant`)
- `packages/engine/test/unit/agents/completion-policy-fallback.test.ts` (new — `architectural-invariant`)
- `packages/engine/test/unit/cnl/compile-policy-guided-warning.test.ts` (new — `architectural-invariant`)
- `packages/engine/test/unit/policy-guided-fitl-canary.golden.test.ts` (new — `golden-trace`; matches the repo's `test/unit/*.golden.test.ts` convention)
- `packages/engine/test/determinism/spec-159-replay-identity.test.ts` (new — `architectural-invariant`; matches the `spec-140-replay-identity.test.ts` precedent)

Docs:

- `docs/agent-dsl-cookbook.md` (modify — `agentGuided` → `policyGuided` at line 193; document `fallbackCompletionPolicy` and the `completionPolicyFallbackCount` diagnostic)

## Out of Scope

- Microturn scope and refs. (Spec 158.)
- Per-option preview at inner microturns. (Spec 160 — `policyGuided` here only drives synthetic completion *within* an action-selection candidate's preview; per-option preview at chooseOne is a separate evaluation context.)
- Trace field additions beyond Spec 156's surface. (Spec 156.)
- Replacing `previewOutcome` enum values. (Specs 156/157/160 each touch trace; renames out of scope.)

## Acceptance Criteria

### Tests That Must Pass

1. New: `policyGuided` with a microturn-scope `preferPatronageMode` consideration drives a govern-mode chooseOne to `patronage` (not `aid`). Synthetic-decision trace records `completionPolicy: 'policyGuided'` and `selectedOptionStableKey: 'patronage'`.
2. New: `policyGuided` with no microturn consideration matching the chooseOne falls through to `fallbackCompletionPolicy: greedy` and trace records `completionPolicy: 'fallback'`.
3. New: `policyGuided` with `fallbackCompletionPolicy: fail` and no matching microturn consideration produces `previewOutcome: noPreviewDecision` for the candidate.
4. New: Compile-time warning fires for a profile declaring `preview.completion: policyGuided` with no microturn-scope considerations; suppressed when at least one is declared.
5. New: Schema rejects `preview.completion: agentGuided` with a diagnostic naming `policyGuided`.
6. New: `previewUsage.completionPolicyFallbackCount` matches the count of fallback firings across the decision's candidates.
7. New: Replay-identity test — same GameDef + seed + actions twice produces byte-identical synthetic-decision arrays.
8. Existing engine suite: `pnpm -F @ludoforge/engine test`.
9. Existing typecheck: `pnpm turbo typecheck`.

### Invariants

1. (architectural-invariant) For every preview drive, `completionPolicy ∈ {policyGuided, greedy, fallback}`. Never `agentGuided`.
2. (architectural-invariant) `policyGuided` does not invoke `chooseDecision` recursively — local frontier scoring only (F#10).
3. (architectural-invariant) Every `fallback` synthetic-decision trace entry has a corresponding microturn where the policyGuided evaluator returned undefined.
4. (architectural-invariant) `Σ completionPolicyFallbackCount` over candidates equals the count of `fallback` synthetic-decision entries (parity).
5. (architectural-invariant) `policyGuided` and Spec 158's `selectBestMicroturnChooseOneValue` / `buildMicroturnChooseCallback` are paired contracts: `policyGuided` is unimplementable without microturn refs, and microturn refs without `policyGuided` are useful but unactivated.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-guided-completion.test.ts` (new) — `architectural-invariant`. Covers the patronage flip, the no-matching-consideration path, and the `fail` mode.
2. `packages/engine/test/unit/agents/completion-policy-fallback.test.ts` (new) — `architectural-invariant`. Trace-shape assertions for fallback firings.
3. `packages/engine/test/unit/cnl/compile-policy-guided-warning.test.ts` (new) — `architectural-invariant`. Warning fires/suppresses based on declared considerations.
4. `packages/engine/test/determinism/spec-159-replay-identity.test.ts` (new) — `architectural-invariant`. Two-run identity over synthetic-decision arrays. Path matches the `spec-140-replay-identity.test.ts` precedent under `test/determinism/`.
5. `packages/engine/test/unit/policy-guided-fitl-canary.golden.test.ts` (new) — `golden-trace`. Pinned FITL canary with a microturn-scope `preferPatronageMode` consideration; asserts `previewUsage.utility === 'differentiating'`. Path matches the repo's `test/unit/*.golden.test.ts` convention.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- agents/policy-guided-completion`
2. `pnpm -F @ludoforge/engine test:unit -- agents/completion-policy-fallback`
3. `pnpm -F @ludoforge/engine test:unit -- cnl/compile-policy-guided-warning`
4. `pnpm turbo schema:artifacts`
5. `pnpm turbo lint typecheck test`

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-06:

- [`archive/tickets/159POLGUICOM-001.md`](../archive/tickets/159POLGUICOM-001.md) — Mechanical rename `agentGuided` → `policyGuided` (covers §What to Change §1; AC#5)
- [`tickets/159POLGUICOM-002.md`](../tickets/159POLGUICOM-002.md) — Explicit fallback + `completionPolicyFallbackCount` trace (covers §What to Change §2-4; AC#1-3, #6-7)
- [`tickets/159POLGUICOM-003.md`](../tickets/159POLGUICOM-003.md) — Compile-time warning for `policyGuided` without microturn considerations (covers §What to Change §5; AC#4)
- [`tickets/159POLGUICOM-004.md`](../tickets/159POLGUICOM-004.md) — Cookbook update for `policyGuided` and fallback diagnostics (covers §What to Change §7)
