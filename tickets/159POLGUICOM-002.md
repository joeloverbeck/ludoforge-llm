# 159POLGUICOM-002: Explicit fallback + `completionPolicyFallbackCount` trace

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel schemas, kernel types, CNL compiler (preview-config lowerer), agents preview (pickInnerDecision restructure + trace emission)
**Deps**: `archive/tickets/159POLGUICOM-001.md`

## Problem

After ticket 001's mechanical rename, `pickInnerDecision` at `policy-preview.ts:509-529` still has two silent `?? pickGreedy*Decision(...)` fallbacks (chooseOne at lines 519-520, chooseNStep at lines 524-526). When the policy-guided evaluator returns undefined, the driver silently downgrades to `greedy` without any trace signal — producing uniform-margin previews that look successful (`previewOutcome: ready`) but aren't useful (Gap 3 + half of Gap 5 from `reports/microturn-preview-architectural-gaps-2026-05-06.md`). F#15 demands the silent failure mode be replaced by an explicit, configurable, trace-visible fallback; F#9 demands the fallback land in the trace; F#14 demands the change ship without an alias period. This ticket replaces both silent fallbacks with an explicit `{ decision; usedFallback }` shape, adds the `fallbackCompletionPolicy: 'greedy' | 'fail'` config field as the operator-visible knob, extends `AgentPreviewCompletionPolicy` to include `'fallback'`, and adds `completionPolicyFallbackCount` to `PolicyPreviewUsageTrace`. The four runtime tests (positive + greedy fallback + fail mode + replay identity + golden canary) ship in the same change to gate the new behavior.

## Assumption Reassessment (2026-05-06)

1. After ticket 001 lands, `pickInnerDecision` switches on `policy === 'policyGuided'`. The two silent `??` fallback sites remain at lines 519-520 (chooseOne) and 524-526 (chooseNStep). Both must be deleted in this ticket — splitting across tickets would leave the trace contract inconsistent.
2. `pickInnerDecision` has exactly one call site at `policy-preview.ts:976`. Changing its return type from `Decision | undefined` to `{ decision: Decision | undefined; usedFallback: boolean }` requires updating that single call site plus the synthetic-decision trace emission logic at lines 984-993.
3. `selectionReason` is already an enum on `SyntheticDecisionTraceEntry` (added by Spec 156, archived/COMPLETED): `'greedyAlphabetical' | 'microturnPolicy' | 'fallback'`. The `'fallback'` value is reserved-but-unemitted in current code. This ticket is the first to emit it. Verified during reassessment.
4. `completionPolicy` is already a field on `SyntheticDecisionTraceEntry` (added by Spec 156). Its current type `AgentPreviewCompletionPolicy = 'greedy' | 'policyGuided'` (after 001) is extended here to `'greedy' | 'policyGuided' | 'fallback'`.
5. `completionPolicyFallbackCount` does NOT yet exist on `PolicyPreviewUsageTrace`. Spec 156 explicitly deferred it ("later `policyGuided` / fallback semantics remain owned by later specs"). This ticket adds the field as a new aggregate.
6. `previewOutcome: noPreviewDecision` is an existing enum value in `PolicyPreviewUnavailabilityReason` at `policy-preview.ts:159-166`. The `fallbackCompletionPolicy: 'fail'` path returns `{ decision: undefined; usedFallback: true }`, which the caller at line 976 already handles by returning `finish({ kind: 'failed', reason: 'noPreviewDecision', ... })` — no caller change needed beyond the new return-shape destructure.
7. The `fallbackOnError` field on `PolicyAgentConfig` (`policy-agent.ts:26` interface, `:186` class) is the existing precedent for explicit fallback configuration. The new `fallbackCompletionPolicy` field follows this convention shape.

## Architecture Check

1. **Why this approach is cleaner than alternatives.** Replacing two silent `??` expressions with a single explicit `pickInnerDecision` shape that returns `{ decision; usedFallback: boolean }` consolidates the fallback logic into one decision point. The `fallbackCompletionPolicy` config knob is the operator-visible surface that makes the previously-implicit fallback behavior explicit and selectable. The `'fail'` mode preserves the existing `previewOutcome: noPreviewDecision` enum value rather than inventing a new one — small-scope expressivity at zero schema cost.
2. **GameSpecDoc vs runtime boundary.** `fallbackCompletionPolicy` is engine-generic — a string enum on `preview` config. The new trace fields (`selectionReason: 'fallback'`, `completionPolicyFallbackCount`) are agnostic counters; no game-specific data leaks into the engine.
3. **No backwards-compatibility shims.** F#14 strict: the silent `??` fallbacks are deleted in this ticket — both chooseOne (519-520) and chooseNStep (524-526). No bridging code that keeps the old shape working alongside the new one. The `pickInnerDecision` return type changes in a single transaction; its single call site at `:976` updates in lockstep.
4. **F#10 (Bounded Computation).** The fallback path uses `pickGreedy*Decision` (the same greedy alphabetical selector used today) — no recursion into action-selection preview. Invariant #2 below proves it.
5. **F#9 (Replay/Telemetry/Auditability).** Every fallback firing emits `selectionReason: 'fallback'` on the synthetic-decision trace AND increments `completionPolicyFallbackCount` on `previewUsage`. The two surfaces are kept in parity by Invariant #4.

## What to Change

### 1. Extend `AgentPreviewCompletionPolicy` — `packages/engine/src/kernel/types-core.ts`

At line 842, extend the union to three values:
```ts
export type AgentPreviewCompletionPolicy = 'greedy' | 'policyGuided' | 'fallback';
```

### 2. Extend Zod enums — `packages/engine/src/kernel/schemas-core.ts`

The two synthetic-decision trace enums at lines 2031 and 2038 extend to three values: `z.enum(['greedy', 'policyGuided', 'fallback'])`. The profile-config enum at line 1154 stays binary `['greedy', 'policyGuided']` — `'fallback'` is a runtime trace value, not an authorable config value.

Add the new sibling field on the `preview` config schema:
```ts
fallbackCompletionPolicy: z.enum(['greedy', 'fail']).optional(),
```

Add `completionPolicyFallbackCount: z.number().int().min(0)` to the `PolicyPreviewUsageTrace` Zod schema in the same file (locate alongside `evaluatedCandidateCount`).

### 3. Extend `PolicyPreviewUsageTrace` type — `packages/engine/src/kernel/types-core.ts`

Add the new field next to `evaluatedCandidateCount`:
```ts
readonly completionPolicyFallbackCount: number;
```

### 4. Lower the new config field — `packages/engine/src/cnl/compile-agents.ts`

In `lowerPreviewConfig` (lines 762-849):
- Destructure `fallbackCompletionPolicy` from `authored` alongside `completion` and `completionDepthCap`.
- Validate that `fallbackCompletionPolicy` is set only when `completion === 'policyGuided'` — emit a diagnostic if `fallbackCompletionPolicy` is set with `completion !== 'policyGuided'` (it's meaningless for `greedy`). Use a new `CNL_COMPILER_AGENT_PREVIEW_FALLBACK_COMPLETION_INVALID` diagnostic code or extend an existing one.
- Validate `fallbackCompletionPolicy` is one of `'greedy' | 'fail'` if defined.
- Lower onto the compiled config: `...(fallbackCompletionPolicy === undefined ? {} : { fallbackCompletionPolicy })`.

### 5. Restructure `pickInnerDecision` — `packages/engine/src/agents/policy-preview.ts`

Replace the body at lines 509-529 with the explicit `{ decision; usedFallback }` shape. The pseudocode in the spec shows the chooseOne shape; this ticket implements the same shape in parallel for chooseNStep:

```ts
const pickInnerDecision = (
  state: GameState,
  def: GameDef,
  microturn: ReturnType<typeof publishMicroturn>,
  policy: AgentPreviewCompletionPolicy,
  fallbackPolicy: 'greedy' | 'fail',
  input: CreatePolicyPreviewRuntimeInput,
): { decision: Decision | undefined; usedFallback: boolean } => {
  if (microturn.kind === 'chooseOne') {
    const chooseOne = microturn as ChooseOneMicroturn;
    if (policy === 'policyGuided') {
      const guided = pickPolicyGuidedChooseOneDecision(state, def, chooseOne, input);
      if (guided !== undefined) return { decision: guided, usedFallback: false };
      if (fallbackPolicy === 'fail') return { decision: undefined, usedFallback: true };
      return { decision: pickGreedyChooseOneDecision(chooseOne), usedFallback: true };
    }
    return { decision: pickGreedyChooseOneDecision(chooseOne), usedFallback: false };
  }
  if (microturn.kind === 'chooseNStep') {
    const chooseN = microturn as ChooseNStepMicroturn;
    if (policy === 'policyGuided') {
      const guided = pickPolicyGuidedChooseNStepDecision(state, def, chooseN, input);
      if (guided !== undefined) return { decision: guided, usedFallback: false };
      if (fallbackPolicy === 'fail') return { decision: undefined, usedFallback: true };
      return { decision: pickGreedyChooseNStepDecision(chooseN), usedFallback: true };
    }
    return { decision: pickGreedyChooseNStepDecision(chooseN), usedFallback: false };
  }
  return { decision: undefined, usedFallback: false };
};
```

Both silent `?? pickGreedy*Decision(...)` expressions at the old lines 519-520 and 524-526 are GONE — no `??` operator anywhere in the new body.

### 6. Update the call site — `packages/engine/src/agents/policy-preview.ts:976`

Destructure the new shape and propagate `usedFallback` into the synthetic-decision trace and `completionPolicyFallbackCount` aggregator:

```ts
const { decision, usedFallback } = pickInnerDecision(
  state,
  input.def,
  microturn,
  completionPolicy,
  fallbackCompletionPolicy ?? 'greedy',
  input,
);
if (decision === undefined) {
  return finish({ kind: 'failed', reason: 'noPreviewDecision', depth, failureReason: 'noPreviewDecision' });
}
```

### 7. Trace emission — `packages/engine/src/agents/policy-preview.ts`

In the synthetic-decision trace emission block (lines 984-993):
- When `usedFallback === true` AND `policy === 'policyGuided'`: emit `selectionReason: 'fallback'` and `completionPolicy: 'fallback'`.
- When `usedFallback === false` AND `policy === 'policyGuided'`: emit `selectionReason: 'microturnPolicy'` and `completionPolicy: 'policyGuided'`.
- When `policy === 'greedy'`: emit `selectionReason: 'greedyAlphabetical'` and `completionPolicy: 'greedy'`.

Aggregate `completionPolicyFallbackCount` per candidate (incrementing on each `usedFallback === true` firing across the candidate's inner microturns), then sum across candidates and stamp on `previewUsage` per decision.

### 8. Runtime config plumbing — `packages/engine/src/agents/policy-runtime.ts`

Plumb the lowered `fallbackCompletionPolicy` value through the runtime alongside `completionPolicy` (around line 191). Default to `'greedy'` when undefined:
```ts
fallbackCompletionPolicy: activeProfile?.preview.fallbackCompletionPolicy ?? 'greedy',
```

### 9. Author 4 new tests

- `packages/engine/test/unit/agents/policy-guided-completion.test.ts` (new — `architectural-invariant`): covers AC#1 (positive case — patronage flip), AC#2 (no-matching-consideration → `fallbackCompletionPolicy: greedy` → trace `'fallback'`), AC#3 (`fallbackCompletionPolicy: fail` → `previewOutcome: noPreviewDecision`).
- `packages/engine/test/unit/agents/completion-policy-fallback.test.ts` (new — `architectural-invariant`): covers AC#6 — `Σ completionPolicyFallbackCount` over candidates equals the count of `'fallback'` synthetic-decision entries.
- `packages/engine/test/determinism/spec-159-replay-identity.test.ts` (new — `architectural-invariant`): covers AC#7 — same GameDef + seed + actions twice produces byte-identical synthetic-decision arrays.
- `packages/engine/test/unit/policy-guided-fitl-canary.golden.test.ts` (new — `golden-trace`): pinned FITL canary with a microturn-scope `preferPatronageMode` consideration; asserts `previewUsage.utility === 'differentiating'` (vs constant margins under `greedy`).

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — extend `AgentPreviewCompletionPolicy` to include `'fallback'`; add `completionPolicyFallbackCount` field to `PolicyPreviewUsageTrace`)
- `packages/engine/src/kernel/schemas-core.ts` (modify — extend trace enums at lines 2031/2038 to three values; add `fallbackCompletionPolicy` schema field; add `completionPolicyFallbackCount` to usage-trace schema)
- `packages/engine/src/cnl/compile-agents.ts` (modify — lower `fallbackCompletionPolicy` in `lowerPreviewConfig`; validate it is set only when `completion === 'policyGuided'`)
- `packages/engine/src/agents/policy-preview.ts` (modify — restructure `pickInnerDecision` to `{ decision; usedFallback }`; delete two silent `??` fallback sites; update call site at line 976; trace emission with `selectionReason: 'fallback'` and `completionPolicyFallbackCount` aggregation)
- `packages/engine/src/agents/policy-runtime.ts` (modify — plumb `fallbackCompletionPolicy` through the runtime input around line 191)
- `packages/engine/schemas/GameDef.schema.json` (regenerated — `pnpm turbo schema:artifacts`; commit the artifact)
- `packages/engine/test/unit/agents/policy-guided-completion.test.ts` (new — `architectural-invariant`)
- `packages/engine/test/unit/agents/completion-policy-fallback.test.ts` (new — `architectural-invariant`)
- `packages/engine/test/determinism/spec-159-replay-identity.test.ts` (new — `architectural-invariant`)
- `packages/engine/test/unit/policy-guided-fitl-canary.golden.test.ts` (new — `golden-trace`)

## Out of Scope

- Compile-time warning when `policyGuided` is declared without microturn-scope considerations. (Ticket 003.)
- Cookbook updates documenting the new fallback config and trace diagnostic. (Ticket 004.)
- Changes to the runtime IR default at `policy-runtime.ts:191` — the fallback path is the new explicit knob; the IR default for `preview.completion` remains `'greedy'` for undeclared profiles (F#15).
- Game-data migrations — no `data/games/**/*.yaml` profile declares `preview.completion`. Verified at decomposition time.
- Touching `policy-evaluation-core.ts` or `policy-agent.ts` — neither contains `agentGuided` references and neither needs the new field surface.

## Acceptance Criteria

### Tests That Must Pass

1. AC#1: `policyGuided` with a microturn-scope `preferPatronageMode` consideration drives a govern-mode chooseOne to `patronage` (not `aid`); trace records `completionPolicy: 'policyGuided'` and `selectedOptionStableKey: 'patronage'`.
2. AC#2: `policyGuided` with no microturn consideration matching the chooseOne falls through to `fallbackCompletionPolicy: greedy`; trace records `completionPolicy: 'fallback'` and `selectionReason: 'fallback'`.
3. AC#3: `policyGuided` with `fallbackCompletionPolicy: fail` and no matching microturn consideration produces `previewOutcome: noPreviewDecision` for the candidate.
4. AC#6: `previewUsage.completionPolicyFallbackCount` matches the count of fallback firings across the decision's candidates (parity with `'fallback'` trace entries).
5. AC#7: Replay-identity test — same GameDef + seed + actions twice produces byte-identical synthetic-decision arrays.
6. Golden trace: pinned FITL canary with `preferPatronageMode` produces `previewUsage.utility === 'differentiating'` (non-uniform projected margins).
7. Schema artifact check: `pnpm turbo schema:artifacts:check` passes after regeneration.
8. Existing engine suite: `pnpm -F @ludoforge/engine test`.
9. Existing typecheck: `pnpm turbo typecheck`.

### Invariants

1. (architectural-invariant) For every preview drive, `completionPolicy ∈ {policyGuided, greedy, fallback}`. Never `agentGuided`. (Spec invariant 1.)
2. (architectural-invariant) `policyGuided` does not invoke `chooseDecision` recursively — local frontier scoring only (F#10). (Spec invariant 2.)
3. (architectural-invariant) Every `fallback` synthetic-decision trace entry has a corresponding microturn where the `pickPolicyGuided*Decision` evaluator returned undefined. (Spec invariant 3.)
4. (architectural-invariant) `Σ completionPolicyFallbackCount` over candidates equals the count of `'fallback'` synthetic-decision entries (parity). (Spec invariant 4.)
5. (architectural-invariant) `policyGuided` and Spec 158's `selectBestMicroturnChooseOneValue` / `buildMicroturnChooseCallback` are paired contracts: `policyGuided` is unimplementable without microturn refs, and microturn refs without `policyGuided` are useful but unactivated. (Spec invariant 5.)
6. (architectural-invariant) `pickInnerDecision` returns `{ decision: Decision | undefined; usedFallback: boolean }`. The silent `??` fallback expressions are gone — `grep -n '?? pickGreedy' packages/engine/src/agents/policy-preview.ts` returns zero matches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-guided-completion.test.ts` (new) — `architectural-invariant`. Three cases: positive patronage flip (AC#1), greedy-fallback path (AC#2), fail-mode `noPreviewDecision` (AC#3).
2. `packages/engine/test/unit/agents/completion-policy-fallback.test.ts` (new) — `architectural-invariant`. Trace-shape parity assertion (AC#6 / Invariant #4) — counts `'fallback'` synthetic-decision entries and asserts equality with `previewUsage.completionPolicyFallbackCount`.
3. `packages/engine/test/determinism/spec-159-replay-identity.test.ts` (new) — `architectural-invariant`. Two-run identity over synthetic-decision arrays (AC#7). Path matches `spec-140-replay-identity.test.ts` precedent.
4. `packages/engine/test/unit/policy-guided-fitl-canary.golden.test.ts` (new) — `golden-trace`. Pinned FITL canary with `preferPatronageMode`; asserts `previewUsage.utility === 'differentiating'`. Path matches the repo's `test/unit/*.golden.test.ts` convention.
5. Existing trace-shape tests (e.g., `policy-diagnostics-preview.test.ts`) updated to assert the new `completionPolicyFallbackCount` field is present on `previewUsage`.

### Commands

1. `pnpm -F @ludoforge/engine test:unit -- agents/policy-guided-completion`
2. `pnpm -F @ludoforge/engine test:unit -- agents/completion-policy-fallback`
3. `pnpm -F @ludoforge/engine test:determinism -- spec-159-replay-identity`
4. `pnpm -F @ludoforge/engine test -- policy-guided-fitl-canary.golden`
5. `pnpm turbo schema:artifacts`
6. `pnpm turbo schema:artifacts:check`
7. `pnpm turbo lint typecheck test`
