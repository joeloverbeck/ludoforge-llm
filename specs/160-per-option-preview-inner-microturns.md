# Spec 160: Per-Option Preview at Inner Microturns

**Status**: DRAFT
**Priority**: P1 (closes Gap 4 from `reports/microturn-preview-architectural-gaps-2026-05-06.md` — inner `chooseOne` / `chooseNStep` microturns currently have no per-option preview signal; the only differentiation path is microturn-scope considerations on static features. With per-option preview, an operator can author "prefer the option whose projected margin is higher" directly.)
**Complexity**: L (new evaluation context at inner microturns; per-option synthetic completion driver; chooseN beam preview with bounded triple product; hidden-information protection; new `preview.option.*` ref family; opt-in config; reuses Spec 146 draft state)
**Dependencies**:
- Spec 158 [microturn-policy-scope-and-refs] (archived) — `microturn.option.*` refs exist; this spec adds the `preview.option.*` family that's queryable from microturn-scope considerations.
- Spec 159 [preview-policy-guided-completion] (archived) — per-option synthetic completion uses `policyGuided` as the inner-completion policy (with the same explicit fallback semantics).
- Spec 156 [preview-observability-and-utility-metrics] (archived) — per-option preview emits the same `selectionReason`, synthetic-decision, and utility metrics as action-selection preview.
- Spec 146 [scoped-draft-state-for-preview-drive] (archived) — bounded copy-on-write draft state. Per-option preview reuses this directly: each option preview is a separately-scoped draft.
- Spec 145 [bounded-synthetic-completion-preview] (archived) — establishes the bounded-completion driver shape this spec generalizes to inner microturns.
- Foundation 4 (Authoritative State and Observer Views) — per-option preview must honor hidden-information policy; `preview.option.*` refs must return `unknownHidden` when the option preview would touch hidden surfaces.
- Foundation 10 (Bounded Computation) — `chooseNStep` beam preview is bounded by `maxOptions × beamWidth × depthCap`; hard cap.
- Foundation 11 (Immutability) — Spec 146's draft state preserves the immutability contract; per-option drafts are independent.
- Foundation 19 (Decision-Granularity Uniformity) — preview at inner microturns is the per-published-option analog of preview at action-selection; same protocol, finer granularity.

**Source**:
- `reports/microturn-preview-architectural-gaps-2026-05-06.md` Gap 4 (inner microturns `previewUsage.mode: "disabled"` everywhere).
- `reports/preview-policy-corrections.md` §5 (split-move literature), §"Recommendation G" (preview only for published options), §"Recommendation 5" (per-option preview for inner microturns), Phase 5 of recommended sequence.
- Code anchors:
  - `packages/engine/src/agents/policy-agent.ts:122` — `previewUsage: emptyPreviewUsage()` hardcoded inside `chooseStructuralFrontierDecision`, the inner-microturn path reached via `chooseFrontierDecision`.
  - `packages/engine/src/agents/policy-agent.ts:144-164` — module-private `emptyPreviewUsage()` (no-arg) shape.
  - `packages/engine/src/agents/policy-eval.ts:1226` — second module-private `emptyPreviewUsage(mode: AgentPreviewMode)` definition. The two duplicate definitions are consolidated in §6 of "What to Change".
  - `packages/engine/src/agents/policy-preview.ts:591` — `createPolicyPreviewRuntime` entry point that this spec generalizes.

## Brainstorm Context

**Original framing.** Spec 145 added bounded synthetic completion at action-selection. Spec 158 added the microturn-scope authoring surface. Spec 159 made `policyGuided` work coherently. But every chooseOne / chooseNStep agent decision still has `previewUsage: { mode: 'disabled' }` — preview is structurally not invoked at inner microturns. The agent at a govern-mode chooseOne can score `aid` vs `patronage` by static microturn-scope considerations (Spec 158's contribution), but cannot ask "if I pick patronage here, what's my margin afterward?"

The Claude report's Gap 4 recognizes the structural decision: Spec 145 explicitly rejected per-option preview because action-selection-level preview answers a different question. That decision was correct at the time (one preview level was a tractable scope for one spec). Now that the framework exists, the per-option granularity can be added without re-litigating the abstraction level: action-selection preview answers "what's my margin if I take Govern?"; per-option preview at the inner govern-mode chooseOne answers "given that I'm taking Govern, what's my margin if I pick patronage vs aid?". Both questions have legitimate answers and both are useful for policy quality.

**Motivation.**

1. **Greedy completion's degeneracy at the inner microturn is the load-bearing problem.** The Claude report's empirical fingerprint: 8/24 decisions have `ready=9` candidates with identical projected margins because greedy picks alphabetical inner options. Spec 159's `policyGuided` partially fixes this when an operator authors microturn-scope considerations expressing the right inner preference. Per-option preview is the more general fix: the agent can compute "the projected margin of THIS option" without needing the operator to encode the preference statically.
2. **F#19 (Decision-Granularity Uniformity) makes inner microturns first-class.** Inner microturns have the same kernel-published atomic-decision contract as action-selection. The preview pipeline being asymmetric across the two is an architectural inconsistency, not a deliberate scoping choice.
3. **The cost is bounded by Spec 146 + Spec 158 + Spec 159 already landed.** Per-option preview is one synthetic completion per option per microturn. For chooseOne, that's typically 2–4 options. For chooseN with many options, beam preview keeps the cost bounded by `maxOptions × beamWidth × depthCap`. Spec 146's draft state means each option preview is a clean isolated draft; no aliasing risk.

**Prior art surveyed.**

- **Split-move literature in General Game Playing (`reports/preview-policy-corrections.md` §5).** Decisions composed of several lower-level decisions can be searched at any granularity. Per-option preview is the LudoForge analog: at a chooseOne, evaluate each option as if it were chosen, then complete the rest of the compound turn.
- **TAG / OpenSpiel forward-model rollouts at sub-decision granularity (`reports/preview-policy-corrections.md` §7).** Both frameworks let agents probe "what happens if I make this lower-level choice?" by applying the choice to a draft state and continuing. The shape this spec adopts is exactly the same: apply option to draft, continue with `policyGuided` to depth cap, resolve refs.
- **Spec 146 [scoped-draft-state-for-preview-drive] (archived).** Already provides bounded copy-on-write draft state per preview drive via `createMutableState` (`packages/engine/src/kernel/state-draft.ts:52`). Each per-option preview drive obtains an independent draft (per-call isolation, not stacked scopes); when the agent is at an inner microturn already, the per-option drive runs against the current authoritative state with no parent-scope coupling.
- **`preview.victory.currentMargin.self` (existing).** The action-selection-level family. `preview.option.victory.currentMargin.self` is the analog at inner-microturn granularity. The naming convention is consistent.

**Synthesis.**

1. **Opt-in `preview.inner` config.** New `preview: { inner: { chooseOne: boolean, chooseNStep: boolean, maxOptions: integer, chooseNBeamWidth: integer, depthCap: integer } }`. Defaults: `chooseOne: false, chooseNStep: false`. Operators opt in per profile.
2. **`chooseOne` per-option preview.** For each legal option:
   - Apply the option to a draft state (Spec 146).
   - Drive the remaining microturns of the same compound turn with `policyGuided` (Spec 159).
   - Resolve `preview.option.*` refs against the resulting state.
   - Return per-option preview features.
3. **`chooseNStep` beam preview.** Marginal/beam preview rather than enumerate-all-combinations. At each step, retain top `chooseNBeamWidth` partial selections by `policyGuided` score. Bounded by `maxOptions × chooseNBeamWidth × depthCap` total synthetic decisions.
4. **`preview.option.*` refs.** Eight new refs, parallel to action-selection's `preview.*` family: `preview.option.victory.currentMargin.self`, `preview.option.victory.currentRank.self`, `preview.option.delta.victory.currentMargin.self`, `preview.option.var.global.<id>`, `preview.option.var.player.self.<id>`, `preview.option.metric.<id>`, `preview.option.outcome`, `preview.option.driveDepth`. The `delta.*` variant is per-option-specific and is the high-leverage signal: "how much does THIS option change my margin compared to the pre-option state?"
5. **Hidden-information protection.** If applying the option and driving completion would resolve a ref that touches hidden information for the agent's seat, the ref returns `unknownHidden` (existing enum). F#4 strict.
6. **Trace integration.** Inner-microturn `previewUsage` is no longer always `disabled`; it gets the same `mode: 'exactWorld'` / `outcomeBreakdown` / `readyRefStats` (Spec 156) treatment as action-selection. Synthetic-decision trace propagates per-option drives.

**Alternatives explicitly considered (and rejected).**

- **Recursive agent preview (invoke the policy agent at each inner microturn during the outer preview drive).** Maximally faithful but unbounded — each inner microturn could trigger another preview drive, recursively. Rejected — F#10. `policyGuided` is the bounded compromise.
- **Enumerate all chooseN combinations.** Spec 145 already rejected this for compound-turn closure; the same rejection applies here (FITL March's `chooseN{min:1,max:27}` is intractable). Rejected — F#10.
- **Defer per-option preview entirely; rely on Spec 159's `policyGuided` plus authored microturn considerations.** This is the do-nothing alternative. Sufficient for the cases where an operator has authored a `preferPatronageMode`-style consideration; insufficient when the operator wants the agent to discover the right option from preview alone (e.g., "pick the spread option whose projected margin is highest"). Rejected — incomplete fix to Gap 4.
- **Add per-option preview to action-selection preview only (i.e., during the action-selection preview drive, expose per-option refs for inner microturns the driver passes through).** Inverts the abstraction: refs at inner microturns work only during outer-preview drives. Operators can't query them when the agent is at an inner microturn directly. Rejected — wrong scope.

**User constraints reflected.** F#1 (engine-agnostic), F#4 (hidden info honored), F#7 (refs are declarative), F#8 (deterministic — same draft-state isolation as Spec 146; same tie-breaks), F#10 (bounded triple product `maxOptions × beamWidth × depthCap`), F#11 (Spec 146 draft state), F#14 (no shim — opt-in config does not break existing profiles; `preview.inner.chooseOne: false` is the default), F#19 (preview at inner microturns is the per-option analog of preview at action-selection).

## Overview

Three deliverables:

1. **`preview.inner` config.** Opt-in per-profile, validated at compile time. Defaults disabled. Hard cap on triple product.
2. **`chooseOne` per-option preview driver.** Applies each option to a Spec 146 draft, drives `policyGuided` to depth cap, resolves refs.
3. **`chooseNStep` beam preview driver.** Marginal: at each step, score legal next options by `policyGuided` across the partial selections, retain top `beamWidth`, advance.

Eight new refs in the `preview.option.*` family. Inner-microturn `previewUsage` populated to match action-selection's existing shape. Synthetic-decision trace propagates per-option drives. Hidden-information protection by routing through the existing `preview.victory.*` resolver path, which already honors observer mode.

## Phase Acceptance Budget

| Phase | Deliverable | Acceptance Criterion | Effort |
|-------|-------------|----------------------|--------|
| Phase A | `preview.inner.chooseOne` + `preview.option.*` refs | A microturn-scope consideration `preferOptionProjectedMargin: { weight: 300, feature: preview.option.delta.victory.currentMargin.self }` flips a govern-mode chooseOne from `aid` to the option whose projected margin delta is higher; per-option preview drives are bounded by `maxOptions × depthCap` per microturn; hidden-info fixture returns `unknownHidden` correctly. | M |
| Phase B | `preview.inner.chooseNStep` + beam preview | A chooseN with 8 legal options and `beamWidth: 2, depthCap: 3` evaluates at most `8 × 2 × 3 = 48` per-option synthetic preview drives (beam candidates × steps); beam pruning trace records pruned partial selections with reason; replay produces byte-identical beam state. | M |
| Phase C | Trace integration parity | Inner-microturn trace shape matches action-selection (mode, outcomeBreakdown, readyRefStats, utility); synthetic-decision trace propagates per-option drives; replay-identity test holds. | S |

## Architecture Check

1. **Why this approach is cleaner than alternatives.** Per-option preview generalizes the bounded-completion driver shape from Spec 145 to a finer granularity. It doesn't introduce a new mechanism; it reuses Spec 146's draft state and Spec 159's `policyGuided`. The opt-in config means existing profiles' behavior is unchanged. The triple-product hard cap is F#10 strict.
2. **GameSpecDoc vs runtime boundary.** `preview.inner` is engine-generic config; `preview.option.*` refs are engine-generic ref strings. No game-specific identifiers in the engine. The actual game-specific signal (e.g., "FITL ARVN prefers patronage in zone X") lives in microturn-scope considerations under the profile YAML.
3. **No backwards-compatibility shims.** Opt-in default `false` is not a shim — it's a feature flag with a documented default. Existing profiles continue to work exactly as today; profiles that opt in get the new behavior. F#14 honored: when this spec lands, no existing profile silently changes behavior.

## What to Change

### 1. `preview.inner` config — schema, compiler, runtime

Schema gains `preview.inner: { chooseOne, chooseNStep, maxOptions, chooseNBeamWidth, depthCap }`. Compiler validates `maxOptions × chooseNBeamWidth × depthCap <= INNER_PREVIEW_HARD_CAP`. The constant `INNER_PREVIEW_HARD_CAP = 256` is declared in `packages/engine/src/cnl/compile-agents.ts` alongside existing preview-budget constants; validation lives in `lowerPreviewConfig`. Runtime types updated.

### 2. `chooseOne` per-option preview driver — `packages/engine/src/agents/policy-preview-inner.ts` (new)

New module hosting the inner-microturn preview drivers, parallel to `policy-preview.ts`. Reuses `applyPublishedDecision` (already exported from `packages/engine/src/kernel/microturn/apply.ts:469`) and Spec 146's `createMutableState` primitive. `pickInnerDecision` is currently module-private at `packages/engine/src/agents/policy-preview.ts:520`; this spec exports it as a deliverable so the new inner-preview module can reuse it (smaller change versus reimplementing the picker). Per option:
- Snapshot a draft state via `createMutableState` (Spec 146).
- Apply the chooseOne option to the draft.
- Drive remaining microturns with `policyGuided` to `depthCap` or compound-turn retirement, whichever first.
- Resolve `preview.option.*` refs against the resulting state.
- Return `{ resolvedRefs, driveDepth, outcome }`.

### 3. `chooseNStep` beam preview driver — `packages/engine/src/agents/policy-preview-inner.ts`

Beam-search shape:

```
beam = [{ partialSelection: [], state: initialState }]
for step in 1..N:
  candidates = []
  for partial in beam:
    for option in legalOptions(partial.state):
      draft = applyPublishedDecision(partial.state, option)
      // selectBestMicroturnChooseOneValue lives at
      // packages/engine/src/agents/microturn-option-evaluator.ts:53 (Spec 159 helper).
      score = selectBestMicroturnChooseOneValue(draft, option, partial.partialSelection ++ [option])
      candidates.push({ partialSelection: partial.partialSelection ++ [option], state: draft, score })
  candidates.sort(by score desc, stableMoveKey asc)
  beam = candidates.slice(0, chooseNBeamWidth)
return beam[0].partialSelection  -- expose per-option refs from beam
```

Trace records pruned partial selections with reason `'beamPruned'`. This value extends the closed `SELECTION_REASONS` `as const` at `packages/engine/src/agents/policy-eval.ts:95`; the enum extension is an explicit deliverable in "Files to Touch" below.

### 4. `preview.option.*` refs — `packages/engine/src/cnl/policy-bytecode/feature-table.ts`, ref dispatch

Eight new ref kinds. Dispatch to the per-option preview driver when the inner-microturn evaluation requests them. `preview.option.delta.*` computes the difference between post-option state and pre-option state — the high-leverage signal for "how much did THIS option change things?".

### 5. Hidden-information protection — `packages/engine/src/agents/policy-preview-inner.ts`

When a `preview.option.*` ref's underlying surface is hidden for the agent's seat, the per-option preview drive surfaces this through the existing `previewOutcome: 'hidden'` enum value (`packages/engine/src/kernel/types-core.ts:1749`) and increments `outcomeBreakdown.unknownHidden` accordingly. There is no new `unknownHidden` enum value introduced. The hidden-info plumbing is reused from `packages/engine/src/agents/policy-surface.ts` (which centralizes the F#4 contract for preview surface refs). Test fixture: a chooseOne whose option preview would resolve a ref whose value is hidden for the seat surfaces the ref as hidden via the existing mechanism.

### 6. Trace integration and `emptyPreviewUsage` consolidation — `packages/engine/src/agents/policy-agent.ts`, `packages/engine/src/agents/policy-eval.ts`

`chooseFrontierDecision` no longer hardcodes `emptyPreviewUsage()`. When `preview.inner.chooseOne === true` and the microturn is `chooseOne`, the previewUsage payload is populated with the same shape action-selection uses today: `mode`, `evaluatedCandidateCount`, `refIds`, `outcomeBreakdown`, `readyRefStats`, `utility`. Synthetic-decision trace propagates per-option drives.

The two existing module-private definitions of `emptyPreviewUsage` (`policy-agent.ts:144` no-arg, `policy-eval.ts:1226` taking `AgentPreviewMode`) are consolidated into a single exported helper in `policy-eval.ts` (the `AgentPreviewMode`-taking version becomes canonical). `policy-agent.ts` is updated to import the consolidated helper and call it with `'disabled'`. F#15 (Architectural Completeness): a single source of truth for the disabled-preview shape.

### 7. Compile-time warning — `packages/engine/src/cnl/validate-agents.ts`

When a profile has `preview.inner.chooseOne: true` but no `microturn`-scope consideration uses `preview.option.*`, emit a warning: `"preview.inner.chooseOne is enabled but no consideration references preview.option.* refs — the per-option preview drive will run but produce no scoring signal"`.

## Files to Touch

- `packages/engine/schemas/GameDef.schema.json` (modify — `preview.inner` config; `preview.option.*` ref enum)
- `packages/engine/src/cnl/compile-agents.ts` (modify — `lowerPreviewConfig` extended; triple-product validation; declares `INNER_PREVIEW_HARD_CAP = 256`)
- `packages/engine/src/cnl/validate-agents.ts` (modify — compile-time warning for opt-in without consideration)
- `packages/engine/src/cnl/policy-bytecode/feature-table.ts` (modify — eight new ref kinds)
- `packages/engine/src/agents/policy-preview-inner.ts` (new — per-option drivers)
- `packages/engine/src/agents/policy-preview.ts` (modify — export `pickInnerDecision` so the new inner-preview module can reuse it)
- `packages/engine/src/agents/policy-agent.ts` (modify — `chooseFrontierDecision` populates previewUsage when inner preview is enabled; replaces local `emptyPreviewUsage` with import of consolidated helper)
- `packages/engine/src/agents/policy-eval.ts` (modify — extend `SELECTION_REASONS` `as const` with `'beamPruned'`; promote `emptyPreviewUsage(mode: AgentPreviewMode)` to exported canonical helper)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — types)
- `packages/engine/src/agents/policy-expr.ts` (modify — ref dispatch for `preview.option.*`)
- `data/games/fire-in-the-lake/**/*.yaml` — no migration required (opt-in default `false`); diagnostic profile may opt in for testing
- `packages/engine/test/unit/agents/policy-preview-inner-chooseone.test.ts` (new)
- `packages/engine/test/unit/agents/policy-preview-inner-choosen-beam.test.ts` (new)
- `packages/engine/test/unit/agents/policy-preview-inner-hidden-info.test.ts` (new)
- `packages/engine/test/unit/cnl/compile-preview-inner.test.ts` (new)
- `packages/engine/test/determinism/spec-160-inner-preview-replay-identity.test.ts` (new — convention precedent: `packages/engine/test/determinism/spec-159-replay-identity.test.ts`)
- `packages/engine/test/determinism/spec-160-inner-preview-no-op-default.test.ts` (new — default-off byte-identical-trace invariant)
- `packages/engine/test/integration/policy-preview-inner-fitl-canary-golden.test.ts` (new — modeled on `packages/engine/test/integration/synthetic-decision-fitl-canary-golden.test.ts`)
- `docs/agent-dsl-cookbook.md` (modify — `preview.inner` documented; `preview.option.*` ref family documented; worked example for govern-mode chooseOne with `preferOptionProjectedMargin`)

## Out of Scope

- Recursive agent preview at inner microturns. (F#10 — uses `policyGuided`, not recursion.)
- Per-option preview at `stochasticResolve`, `outcomeGrantResolve`, `turnRetirement`. Those decision kinds are kernel-owned or chance-driven; per-option preview at them adds complexity without clear policy use cases. Future spec if needed.
- Caching of per-option preview results across agent calls. (Future.)
- Sequential-halving / best-arm at inner microturns. (Future.)
- Replacing `previewOutcome.kind` enum.

## Acceptance Criteria

### Tests That Must Pass

1. New (Phase A): `preview.inner.chooseOne: true` with `preferOptionProjectedMargin` consideration flips a govern-mode chooseOne from `aid` to `patronage` on a fixture where `patronage` has higher projected margin.
2. New (Phase A): Inner preview drive count for a 2-option chooseOne with `depthCap: 4` is exactly 2 (one drive per option), each driving up to depth 4.
3. New (Phase A): Hidden-info fixture: chooseOne whose option preview would resolve a ref hidden for the seat returns `preview.option.victory.currentMargin.self: unknownHidden`.
4. New (Phase B): chooseN with 8 legal options, `beamWidth: 2, depthCap: 3` evaluates at most 48 per-option synthetic preview drives — i.e., beam-candidate evaluations across all steps (hard cap from triple product).
5. New (Phase B): Beam pruning trace records pruned partial selections with `selectionReason: 'beamPruned'`.
6. New (Phase C): Inner-microturn `previewUsage` matches action-selection schema parity (Ajv validation).
7. New (Phase C): Replay-identity — same GameDef + seed + actions twice produces byte-identical inner-microturn previewUsage and synthetic-decision arrays.
8. New: Compile-time warning fires for `preview.inner.chooseOne: true` with no `preview.option.*` ref usage in considerations.
9. New: Compile-time error for `maxOptions × chooseNBeamWidth × depthCap > INNER_PREVIEW_HARD_CAP`.
10. New: Existing profiles with default `preview.inner` (off) produce byte-identical traces compared to pre-Spec-160 baseline (no-op-by-default invariant).
11. Existing engine suite: `pnpm -F @ludoforge/engine test`.
12. Existing typecheck: `pnpm turbo typecheck`.

### Invariants

1. (architectural-invariant) For every chooseOne with `preview.inner.chooseOne: true`, exactly one preview drive runs per legal option.
2. (architectural-invariant) `Σ syntheticDecisions` across a chooseN beam-preview ≤ `maxOptions × chooseNBeamWidth × depthCap` (hard cap; F#10).
3. (architectural-invariant) `preview.option.*` refs return `unknownHidden` whenever the underlying observer-projected resolver returns hidden (F#4).
4. (architectural-invariant) Each per-option draft state is fully isolated from caller-visible state (Spec 146 contract preserved); a regression test asserts no aliasing leaks across option drives.
5. (architectural-invariant) Profiles with default `preview.inner` (both flags `false`) produce byte-identical inner-microturn trace as pre-Spec-160 (no-op-by-default).
6. (golden-trace) FITL canary with `preview.inner.chooseOne: true` and a `preferOptionProjectedMargin` consideration produces byte-identical projected-margin values across runs.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/agents/policy-preview-inner-chooseone.test.ts` (new) — `architectural-invariant`. Per-option drive count, ref resolution, draft-state isolation.
2. `packages/engine/test/unit/agents/policy-preview-inner-choosen-beam.test.ts` (new) — `architectural-invariant`. Beam width invariant; pruning trace.
3. `packages/engine/test/unit/agents/policy-preview-inner-hidden-info.test.ts` (new) — `architectural-invariant`. F#4 hidden-info enforcement.
4. `packages/engine/test/unit/cnl/compile-preview-inner.test.ts` (new) — `architectural-invariant`. Triple-product cap; opt-in warning.
5. `packages/engine/test/determinism/spec-160-inner-preview-replay-identity.test.ts` (new) — `architectural-invariant`. Two-run identity over inner trace. Convention precedent: `packages/engine/test/determinism/spec-159-replay-identity.test.ts`.
6. `packages/engine/test/determinism/spec-160-inner-preview-no-op-default.test.ts` (new) — `architectural-invariant`. Default-off invariant: pre-Spec-160 baseline trace identical.
7. `packages/engine/test/integration/policy-preview-inner-fitl-canary-golden.test.ts` (new) — `golden-trace`. Pinned FITL canary with opt-in. Modeled on `packages/engine/test/integration/synthetic-decision-fitl-canary-golden.test.ts`.

### Commands

The engine `test:unit` script is `node --test "dist/test/unit/**/*.test.js"`; it does not accept a Jest-style filter argument. Run a single compiled test file by absolute dist path, or run the whole suite:

1. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-preview-inner-chooseone.test.js`
2. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-preview-inner-choosen-beam.test.js`
3. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/agents/policy-preview-inner-hidden-info.test.js`
4. `pnpm -F @ludoforge/engine build && node --test dist/test/unit/cnl/compile-preview-inner.test.js`
5. `pnpm -F @ludoforge/engine test:determinism` (covers replay-identity + no-op-default)
6. `pnpm -F @ludoforge/engine test:integration` (covers FITL canary golden)
7. `pnpm turbo schema:artifacts`
8. `pnpm turbo lint typecheck test`

## Follow-On Tickets

Proposed namespace: `160PEROPTPREV` (Per-Option PREView at inner microturns).

Decomposition outline (informational; finalized by `/spec-to-tickets`):

1. Schema + compiler: `preview.inner` block, `INNER_PREVIEW_HARD_CAP`, triple-product validation, `lowerPreviewConfig` extension.
2. `policy-eval.ts` cleanup: extend `SELECTION_REASONS` with `'beamPruned'`; promote `emptyPreviewUsage` to exported canonical helper; update `policy-agent.ts` to import.
3. `policy-preview.ts`: export `pickInnerDecision`.
4. `preview.option.*` ref family: feature-table additions, `policy-expr.ts` dispatch, eight ref kinds.
5. `policy-preview-inner.ts` (new): chooseOne per-option driver.
6. `policy-preview-inner.ts` (extend): chooseNStep beam preview driver.
7. Hidden-information routing: per-option ref → `previewOutcome: 'hidden'` + `outcomeBreakdown.unknownHidden`.
8. Trace integration: `chooseFrontierDecision` populates `previewUsage`; synthetic-decision trace propagates per-option drives.
9. Compile-time warning: opt-in without `preview.option.*` consideration.
10. Tests: unit (chooseone, choosen-beam, hidden-info, compile-preview-inner), determinism (replay-identity, no-op-default), integration (FITL canary golden).
11. Cookbook: `preview.inner` + `preview.option.*` documentation; worked example.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-06:

- [`archive/tickets/160PEROPTPREV-001.md`](../archive/tickets/160PEROPTPREV-001.md) — Consolidate `emptyPreviewUsage` and extend `SELECTION_REASONS` (covers §6 consolidation + §3 `beamPruned` foundation)
- [`archive/tickets/160PEROPTPREV-002.md`](../archive/tickets/160PEROPTPREV-002.md) — Export `pickInnerDecision` from `policy-preview.ts` (covers §2 prerequisite)
- [`archive/tickets/160PEROPTPREV-003.md`](../archive/tickets/160PEROPTPREV-003.md) — `preview.inner` config schema, compiler validation, `INNER_PREVIEW_HARD_CAP` (covers §1)
- [`archive/tickets/160PEROPTPREV-004.md`](../archive/tickets/160PEROPTPREV-004.md) — `preview.option.*` ref family + dispatch (covers §4)
- [`archive/tickets/160PEROPTPREV-005.md`](../archive/tickets/160PEROPTPREV-005.md) — `chooseOne` per-option preview driver + hidden-info routing (covers §2 + §5)
- [`archive/tickets/160PEROPTPREV-006.md`](../archive/tickets/160PEROPTPREV-006.md) — `chooseNStep` beam preview driver (covers §3)
- [`tickets/160PEROPTPREV-007.md`](../tickets/160PEROPTPREV-007.md) — Trace integration + replay-identity + no-op-default tests (covers §6)
- [`tickets/160PEROPTPREV-008.md`](../tickets/160PEROPTPREV-008.md) — Compile-time warning for opt-in without `preview.option.*` consideration (covers §7)
- [`tickets/160PEROPTPREV-009.md`](../tickets/160PEROPTPREV-009.md) — FITL canary golden test for inner preview (covers AC #6)
- [`tickets/160PEROPTPREV-010.md`](../tickets/160PEROPTPREV-010.md) — Cookbook documentation for `preview.inner` and `preview.option.*` (covers cookbook deliverable)
