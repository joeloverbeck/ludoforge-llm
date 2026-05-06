# Spec 159: `policyGuided` Completion With Trace-Visible Fallback

**Status**: DRAFT
**Priority**: P1 (closes Gap 3 — uniform projected margins under `greedy` — and the silent-fallback half of Gap 5 from `reports/microturn-preview-architectural-gaps-2026-05-06.md`; replaces `agentGuided` as the default high-quality completion policy now that the microturn-scope authoring surface exists)
**Complexity**: M (rename + rewire; new explicit fallback; trace fields; deletion of silent-fallback path; depends on Specs 156 and 158 already landed)
**Dependencies**:
- Spec 156 [preview-observability-and-utility-metrics] (DRAFT) — `selectionReason: 'fallback'` and `completionPolicyFallbackCount` extend trace fields landed in 156; synthetic-decision trace records the chosen completion policy per inner microturn.
- Spec 158 [microturn-policy-scope-and-refs] (DRAFT) — `selectBestMicroturnOption` (the renamed evaluator from 158) is the engine that `policyGuided` invokes per inner microturn.
- Spec 145 [bounded-synthetic-completion-preview] (archived) — the preview drive loop this spec re-routes.
- Foundation 5 (One Rules Protocol, Many Clients) — `policyGuided` evaluates against the published frontier, not unpublished sub-decisions.
- Foundation 10 (Bounded Computation) — `policyGuided` is local frontier scoring, not recursive action-selection preview; cost stays bounded.
- Foundation 14 (No Backwards Compatibility) — `agentGuided` is renamed and the silent fallback is deleted in the same change; no `_legacy` policy name.
- Foundation 15 (Architectural Completeness) — replaces a misleading name and a silent failure mode with explicit, traceable behavior.
- Foundation 19 (Decision-Granularity Uniformity) — synthetic completion decides one published microturn at a time, in step with the kernel's protocol.

**Source**:
- `reports/microturn-preview-architectural-gaps-2026-05-06.md` Gap 3 (greedy uniform margins), Gap 5 (silent fallback when completion-scope considerations absent).
- `reports/preview-policy-corrections.md` §"Recommendation D" (greedy as diagnostic fallback only), §"Recommendation E" (replace `agentGuided` with `policyGuided`), §6 (trace must record fallbacks), Phase 4 of recommended sequence.
- Code anchors:
  - `packages/engine/src/agents/policy-preview.ts:394-415` — `pickAgentGuidedChooseOneDecision` (post-Spec-158: re-routed through `selectBestMicroturnOption`).
  - `packages/engine/src/agents/policy-preview.ts:482-483` — silent `?? pickGreedyChooseOneDecision(...)` fallback that this spec deletes.
  - `packages/engine/src/agents/policy-preview.ts:472-492` — `pickInnerDecision` switch on `policy === 'agentGuided'` — renamed in this spec.
  - `packages/engine/src/cnl/compile-agents.ts:765-790` (assumed location of `lowerPreviewConfig`) — preview policy validation.

## Brainstorm Context

**Original framing.** Post-Spec-158 the engine has a working microturn-scope evaluator (`selectBestMicroturnOption`) and operators have a non-deprecated authoring surface for inner-microturn preferences. But the completion policy enum in `preview.completion` still exposes `agentGuided`, a name that misleads on two counts: (1) it suggests recursion into a full agent invocation per inner microturn (it doesn't — it's local frontier scoring), and (2) it falls back silently to `greedy` when the evaluator returns undefined, hiding the failure mode in `policy-preview.ts:482-483`.

The cookbook calls this out indirectly (it tells operators not to author the surface `agentGuided` depends on) but the user-visible config knob still says `agentGuided`. An operator who reads the cookbook, removes their completion-scope considerations, and writes a microturn-scope consideration expects `agentGuided` to use it — but until this spec lands, `agentGuided`'s implementation is hard-wired to call the (now-deleted) completion-scope evaluator. Spec 158 rewires the call site; Spec 159 renames the surface to `policyGuided`, makes the fallback explicit and trace-visible, and ships the user-facing migration.

**Motivation.**

1. **The name was always wrong.** "Agent-guided" suggested the agent's decision policy was driving the synthetic completion. It wasn't — it was a local lookup against `scopes: [completion]` considerations. `policyGuided` accurately names what the implementation does: at each synthetic inner microturn, the same policy considerations that score real decisions score the synthetic options. The rename clarifies the contract.
2. **Silent fallback is an F#15 violation.** A completion driver that silently downgrades from `policyGuided` to `greedy` produces uniform-margin previews that look successful (`previewOutcome: ready`) but aren't useful. F#15 demands we close the silent-failure gap; F#9 demands the fallback land in the trace.
3. **F#14 demands the rename ship as one transaction.** Add `policyGuided` and remove `agentGuided` in the same change as the silent fallback is replaced by an explicit, configurable, trace-visible fallback. No alias; no period of "both names accepted."

**Prior art surveyed.**

- **Spec 145 [bounded-synthetic-completion-preview] (archived)** — established `agentGuided`, `greedy` as the two completion policies. Section §D5 (greedy) acknowledged greedy as deterministic but adversarial ("if I randomly close my own action, how does the world look?").
- **TAG / OpenSpiel rollout policies (`reports/preview-policy-corrections.md` §6).** Both frameworks distinguish "light" rollouts (random, fast, often arbitrary) from "heavy" rollouts (knowledge-guided, slower, more accurate). The named distinction is operator-visible. `policyGuided` vs `greedy` is the LudoForge analog.
- **PUCT priors with explicit fallback enumeration (`reports/preview-policy-corrections.md` §3).** Standard practice: when the prior cannot decide, fall back to a documented secondary choice (e.g., uniform random). The fallback is named, enumerated, and recorded.
- **Existing `fallbackOnError` field on `PolicyAgentConfig`** (`policy-agent.ts:178`) — convention exists for explicit fallback configuration.

**Synthesis.**

1. Rename `agentGuided` → `policyGuided` everywhere (config schema, IR, runtime, fixtures, cookbook). Delete the `agentGuided` enum value. F#14 strict.
2. Replace the silent `?? pickGreedyChooseOneDecision(...)` with an explicit `fallbackCompletionPolicy: 'greedy' | 'fail'` config field on `preview.completion`. Default fallback is `greedy` (matches today's behavior on the surface) but the fallback path emits `selectionReason: 'fallback'` and increments `completionPolicyFallbackCount` on `previewUsage` (Spec 156's trace surface).
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

1. **Rename and rewire.** `agentGuided` → `policyGuided` in `preview.completion` enum, IR, runtime, all repo-owned profiles. The implementation routes through Spec 158's `selectBestMicroturnOption`. The silent fallback at `policy-preview.ts:482-483` is replaced by an explicit, configurable, trace-visible fallback.
2. **Compile-time warning.** Profiles using `policyGuided` without microturn-scope considerations get a build-time warning naming the missing surface.

Trace integration:
- Per inner microturn, the synthetic-decision trace entry (Spec 156) records `completionPolicy: 'policyGuided' | 'greedy' | 'fallback'` and `selectionReason`.
- Per preview drive, `previewUsage.completionPolicyFallbackCount: integer` totals fallback firings across all candidates in the decision.

Default: new profiles default to `preview.completion: policyGuided` and `fallbackCompletionPolicy: greedy`. Operators authoring diagnostic profiles can opt into `fallbackCompletionPolicy: fail` for hard-failure tracing.

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

### 1. Rename — `packages/engine/src/cnl/compile-agents.ts`, `policy-preview.ts`, `policy-agent.ts`, schema

Replace every reference to `agentGuided` with `policyGuided`. Schema enum update. IR ref kind update. Fixture and profile YAML migration.

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

`pickPolicyGuidedChooseOneDecision` and `pickPolicyGuidedChooseNStepDecision` (renamed from `pickAgentGuided*`) call Spec 158's `selectBestMicroturnOption`. The `?? pickGreedyChooseOneDecision(...)` silent-fallback expression at line 482-483 is deleted.

### 3. `fallbackCompletionPolicy` config — `packages/engine/src/cnl/compile-agents.ts`, schema

`preview.completion` (existing) gains a sibling `preview.fallbackCompletionPolicy: 'greedy' | 'fail'` (default `greedy`). Compile-time validate that `fallbackCompletionPolicy` is set only when `completion === 'policyGuided'` (it's meaningless for `greedy`).

### 4. Trace integration — `packages/engine/src/agents/policy-preview.ts`

Per inner microturn taken: synthetic-decision trace entry records `completionPolicy: 'policyGuided' | 'greedy' | 'fallback'`. Per preview drive: aggregate `completionPolicyFallbackCount` for the candidate. Per decision: aggregate across candidates and stamp on `previewUsage`.

### 5. Compile-time warning — `packages/engine/src/cnl/validate-agents.ts`

When `profile.preview.completion === 'policyGuided'` and `profile.use.considerations` contains no microturn-scope consideration, emit `{ severity: 'warning', message: 'preview.completion: policyGuided with no scopes: [microturn] considerations declared — completion will always fall back to ' + fallbackPolicy }`. Warning, not error: an operator might intentionally declare `policyGuided` planning to add microturn considerations later.

### 6. Profile migration — `data/games/**/*.yaml`

Every `preview.completion: agentGuided` rewritten to `preview.completion: policyGuided`. Where the spec author wants a hard-fail diagnostic profile, `fallbackCompletionPolicy: fail` is added.

### 7. Cookbook — `docs/agent-dsl-cookbook.md`

`preview.completion: policyGuided` is the documented default; `greedy` is explicitly named as "fast, non-discriminating, useful as a baseline or fallback". The synthetic-decision trace and `completionPolicyFallbackCount` are documented as the diagnostic for "is policyGuided actually firing on my profile?".

## Files to Touch

- `packages/engine/schemas/GameDef.schema.json` (modify — `agentGuided` → `policyGuided`; `fallbackCompletionPolicy` added)
- `packages/engine/src/cnl/compile-agents.ts` (modify — schema rewrites; lowerPreviewConfig)
- `packages/engine/src/cnl/validate-agents.ts` (modify — compile-time warning)
- `packages/engine/src/agents/policy-preview.ts` (modify — rename, explicit fallback, trace)
- `packages/engine/src/agents/policy-agent.ts` (modify — type names; trace passthrough)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — type names)
- `data/games/fire-in-the-lake/**/*.yaml` (modify)
- `data/games/texas-holdem/**/*.yaml` (modify)
- `packages/engine/test/fixtures/**` (modify)
- `packages/engine/test/golden/**` (re-bless — `Re-bless golden trace: <each updated file> — Spec 159 policyGuided rename`)
- `packages/engine/test/unit/agents/policy-guided-completion.test.ts` (new)
- `packages/engine/test/unit/agents/completion-policy-fallback.test.ts` (new)
- `packages/engine/test/unit/cnl/compile-policy-guided-warning.test.ts` (new)
- `docs/agent-dsl-cookbook.md` (modify)

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
5. (architectural-invariant) `policyGuided` and `selectBestMicroturnOption` (Spec 158) are paired contracts: `policyGuided` is unimplementable without microturn refs, and microturn refs without `policyGuided` are useful but unactivated.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-guided-completion.test.ts` (new) — `architectural-invariant`. Covers the patronage flip, the no-matching-consideration path, and the `fail` mode.
2. `packages/engine/test/unit/agents/completion-policy-fallback.test.ts` (new) — `architectural-invariant`. Trace-shape assertions for fallback firings.
3. `packages/engine/test/unit/cnl/compile-policy-guided-warning.test.ts` (new) — `architectural-invariant`. Warning fires/suppresses based on declared considerations.
4. `packages/engine/test/agents/policy-guided-replay-identity.test.ts` (new) — `architectural-invariant`. Two-run identity over synthetic-decision arrays.
5. `packages/engine/test/golden/policy-guided-fitl-canary.test.ts` (new) — `golden-trace`. Pinned FITL canary with a microturn-scope `preferPatronageMode` consideration; asserts `previewUsage.utility === 'differentiating'`.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- agents/policy-guided-completion`
2. `pnpm -F @ludoforge/engine test:unit -- agents/completion-policy-fallback`
3. `pnpm -F @ludoforge/engine test:unit -- cnl/compile-policy-guided-warning`
4. `pnpm turbo schema:artifacts`
5. `pnpm turbo lint typecheck test`
