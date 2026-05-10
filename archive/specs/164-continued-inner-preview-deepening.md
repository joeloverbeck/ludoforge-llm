# Spec 164 — Continued Inner Preview Deepening

**Status**: COMPLETED
**Date**: 2026-05-09
**Priority**: M
**Complexity**: L
**Dependencies**: Spec 162 (preview signal integrity / Foundation #20, archived).
**Predecessors**: Spec 162, Spec 161 (chooseNStep inner preview integration), Spec 160 (per-option preview at inner microturns), Spec 159 (preview policy-guided completion), Spec 156 (preview observability and utility metrics).
**Trigger reports**: `archive/specs/162-preview-signal-integrity.md` §11 (out-of-scope, Spec 164 carve-out); `reports/preview-signal-integrity.md` §4 (external deep-research proposal — reassessed against the codebase by this spec).
**Ticket namespace**: `164CONTPREVDEP`

---

## 1. Goal

Give profile authors a bounded, declarative way to spend a higher inner-preview budget *selectively* on root options that the broad pass already proved have either no signal or uniform signal — without lifting the integrity contract Spec 162 added in Foundation #20. After this spec lands:

1. A profile MAY opt into `preview.inner.strategy: continuedDeepening`. The opt-in stores a static cap-class identifier in the compiled artifact.
2. The deeper pass MUST remain bounded by a named cap class (`standard256` is the default; `deep1024` is the only opt-in tier introduced by this spec) whose static cost formula is verified at compile time.
3. The deeper pass MUST NOT silence Foundation #20: a `preview.option.*` ref that is unavailable after the deep pass remains `unavailable` and continues to require an explicit `previewFallback` (introduced by Spec 162). Deepening adds signal *additively*; it never coerces unavailable evidence into ready evidence.
4. Default behavior is **unchanged** for profiles that do not opt in. `INNER_PREVIEW_HARD_CAP = 256` remains the default cap; the existing single-pass driver remains the default strategy. No YAML profile migration is forced — `strategy` and `capClass` default. Compiled-JSON fixtures that pin `previewInner` blocks must be regenerated because the compiled artifact gains the new `capClass` field (see §7.6 and §9 Phase 1).

The four `tiebreakAfterPreviewNoSignal` chooseNStep frontiers in the FITL ARVN seed-1000 witness (Spec 162) are the canonical use case: profiles that need ready preview evidence at deeply nested chooseN ladders can opt in to `deep1024` without requiring all profiles to bear that budget.

## 2. Context (verified against codebase)

The current single-pass cost formula is enforced at compile time:

```ts
// packages/engine/src/cnl/compile-agents.ts:1033-1035
const cost = chooseNStep === true
  ? loweredMaxOptions * (1 + loweredChooseNBeamWidth * loweredMaxOptions * Math.max(0, loweredDepthCap - 1))
  : loweredMaxOptions * loweredChooseNBeamWidth * loweredDepthCap;
```

bounded by `INNER_PREVIEW_HARD_CAP = 256` (`compile-agents.ts:95`).

`CompiledAgentPreviewInnerConfig` (`packages/engine/src/kernel/types-core.ts:895-901`) has no `strategy` field today:

```ts
interface CompiledAgentPreviewInnerConfig {
  readonly chooseOne: boolean;
  readonly chooseNStep: boolean;
  readonly maxOptions: number;
  readonly chooseNBeamWidth: number;
  readonly depthCap: number;
}
```

The inner driver (`policy-preview-inner.ts:318-422`) accepts an arbitrary `GameState` checkpoint as input (the public, immutable type — internally the driver creates a working `MutableGameState` via `createMutableState` from `kernel/state-draft.ts`). The broad pass already fully constructs and returns the post-broad checkpoint through `DriveResult` (`policy-preview-inner.ts:198-205`); its `state` field is exactly the `GameState` a deep pass would resume from — there is no separate replay-certificate machinery to introduce. State handoff between broad and deep is a matter of carrying `DriveResult.state` forward and re-driving with a higher `depthCap`, not a new replay protocol.

Spec 162's `PreviewOptionRefStatus` type (`policy-preview-inner.ts:46-48`) is the runtime contract every consumer already speaks:

```ts
type PreviewOptionRefStatus =
  | { kind: 'ready'; value: PolicyValue }
  | { kind: 'unavailable'; reason: PolicyPreviewUnavailabilityReason };
```

Coverage tracking (Spec 162 §5.4) gives us `PolicyPreviewCoverage` with `requestedRefCount`, `evaluatedRootOptionCount`, `readyRootOptionCount`, `unavailableRootOptionCount`, `allRootsUnavailable`, and `selectedByTieBreakerBecausePreviewUnavailable`. This spec extends that block with a `phase` discriminator (`broad` | `deep`) and per-phase counters; nothing in the trace shape needs replacing.

There is no precedent in the compiled artifact for "named cap classes" (the closest analog is the single hard cap constant). This spec introduces named classes as a new, narrowly scoped mechanism — see §5.

ARVN seed 1000 (Spec 162 witness, `test/policy-profile-quality/spec-162-arvn-seed-1000-witness.test.ts`) shows 4 chooseNStep decisions at `outcomeBreakdown.unknownDepthCap == evaluatedRootOptionCount`, with depth-cap counts `[8, 7, 5, 4]`. With a continued-deepening pass to `Dd = 16` and `R = 8`, the static cost (`§6`) is 968 — well within `deep1024`. This is the empirical motivation for the cap-class default of `1024`; the actual benchmark sweep is a Phase 4 deliverable, not a precondition for this spec's architecture.

## 3. Non-goals

- **No `partial.*` ref family.** Spec 162 §3 made partial-state delta refs an architectural non-goal, and Spec 162 §11 deferred any explicit `preview.partial.*` family. This spec inherits that boundary. Margin-style delta refs MUST NOT resolve from a depth-capped partial state, regardless of which strategy is active.
- **No automatic strategy selection.** The runtime does not decide between `singlePass` and `continuedDeepening`; the profile author opts in. Auto-selection is out of scope and would couple agent runtime to a meta-policy layer.
- **No raise of the default hard cap.** Profiles that do not declare `strategy` still validate against `INNER_PREVIEW_HARD_CAP = 256`. The new cap classes (`standard256` and `deep1024`) are opt-in tiers, not a global default change. No compatibility shim is needed: `strategy` and `capClass` default to values that reproduce existing single-pass behavior bit-identically (Foundation #14).
- **No new ref family.** Spec 163 covers `lookup.surface: policyState`. This spec is bounded to deepening the existing preview pipeline.
- **No kernel changes.** All work is in `packages/engine/src/cnl/` and `packages/engine/src/agents/`. The kernel publication contract, observer machinery, and microturn protocol are unaffected.
- **No two-pass full replay.** The deep pass MUST resume from the broad pass's `DriveResult.state` checkpoint; it MUST NOT re-drive the broad portion. Two-pass full replay is the failure mode this design avoids.
- **No automatic profile migration to `deep1024`.** Existing FITL and Texas Hold'em profiles continue to use `singlePass` / `standard256`. Phase 4 benchmarks may motivate a follow-up spec that flips defaults, but this spec stops at "tier exists; opt-in works."

## 4. Foundation #10 amendment

Foundation #10 (Bounded Computation) is amended to recognize **named cap classes** as the formal vocabulary for declared bounds. The principle (every choice and iteration is finite, enumerable, and bounded) is unchanged. The amendment:

- Adds a single sentence to Foundation #10's existing text (after the existing principle): "When a bounded computation surface offers a tier of cap classes (e.g., `standard256`, `deep1024`), the chosen class MUST be statically named in the compiled artifact and recorded in reproducibility metadata, so that profile-quality witnesses and replay artifacts can assert which class was active."
- Adds an Appendix line: "Spec 164 amended Foundation #10 to formalize cap-class naming for bounded-computation tiers."

This is a narrow amendment. No new bounded-computation surface is introduced; the existing inner-preview surface gains tier names that were previously implicit in the single hard-cap constant. Cap classes do NOT unlock unbounded preview; they are explicit, statically-bounded tiers.

The amendment is presented for review in Phase 0; Phase 1 onward depends on it.

## 5. Architecture

Five pillars, each independently testable.

### 5.1 Strategy and cap-class declaration

Extend `CompiledAgentPreviewInnerConfig`:

```ts
interface CompiledAgentPreviewInnerConfig {
  readonly chooseOne: boolean;
  readonly chooseNStep: boolean;
  readonly maxOptions: number;
  readonly chooseNBeamWidth: number;
  readonly depthCap: number;
  readonly strategy: 'singlePass' | 'continuedDeepening';   // NEW; defaults to 'singlePass'
  readonly capClass: 'standard256' | 'deep1024';            // NEW; defaults to 'standard256'
  readonly continuedDeepening?: ContinuedDeepeningConfig;   // NEW; required iff strategy === 'continuedDeepening'
}

interface ContinuedDeepeningConfig {
  readonly broad: { readonly depthCap: number };
  readonly deep: {
    readonly depthCap: number;
    readonly trigger: readonly DeepTrigger[];
    readonly rootPolicy: 'allRootsWithinCap';   // single supported value in this spec; future: 'topK'
  };
}

type DeepTrigger =
  | 'allRequestedRefsDepthCapped'
  | 'allReadyValuesUniform';
```

Profile YAML:

```yaml
preview:
  inner:
    chooseOne: true
    chooseNStep: true
    maxOptions: 8
    chooseNBeamWidth: 1
    depthCap: 4                 # legacy field; under continuedDeepening, equals broad.depthCap
    strategy: continuedDeepening
    capClass: deep1024
    continuedDeepening:
      broad:
        depthCap: 4
      deep:
        depthCap: 16
        trigger:
          - allRequestedRefsDepthCapped
        rootPolicy: allRootsWithinCap
```

### 5.2 Static cost formulas

Single-pass formula stays as-is (`compile-agents.ts:1033-1035`). Continued-deepening adds a per-phase formula:

```
M  = maxOptions
B  = chooseNBeamWidth
I  = maxOptions               (inner option cap = same as outer; matches today's formula)
Db = continuedDeepening.broad.depthCap
Dd = continuedDeepening.deep.depthCap
R  = M                        (rootPolicy: allRootsWithinCap; future tiers may set R < M)

broadCost           = M × (1 + B × I × max(0, Db − 1))
incrementalDeepCost = R × B × I × max(0, Dd − Db)
totalCost           = broadCost + incrementalDeepCost
```

Cap-class table:

| capClass | totalCost ≤ |
|---|---|
| `standard256` | 256 |
| `deep1024` | 1024 |

Compile-time validation:

1. When `strategy === 'singlePass'`: `cost ≤ capClass`. (`standard256` reproduces today's behavior; `deep1024` is permitted as an opt-in for single-pass profiles that need a higher per-frontier budget without the broad/deep split.)
2. When `strategy === 'continuedDeepening'`: `totalCost ≤ capClass` AND `Db ≤ Dd` AND `depthCap === broad.depthCap` (legacy `depthCap` field MUST equal `broad.depthCap` to keep the field's meaning consistent — the compiler enforces this equality and rejects mismatch with `CNL_COMPILER_AGENT_PREVIEW_DEPTHCAP_MISMATCH`).

For ARVN seed 1000 with `M=8, B=1, Db=4, Dd=16`: `broadCost = 8 × (1 + 1 × 8 × 3) = 200`; `incrementalDeepCost = 8 × 1 × 8 × 12 = 768`; `totalCost = 968 ≤ 1024`. ✓ Fits `deep1024`.

### 5.3 State handoff between broad and deep

The deep pass is a **continuation** of the broad pass, not a replay:

1. The existing `runChooseNStepInnerPreview` driver runs at `Db`, returning a `DriveResult[]` keyed by root option (one `DriveResult` per beam tip). The `state` field on each `DriveResult` is the post-broad checkpoint.
2. If the deep trigger fires (§5.4), the deep driver iterates over the broad results and re-invokes the inner driver against each root option's checkpoint state with `depthCap = Dd - Db` additional steps. The deep driver consumes only fresh budget; it does not re-traverse the broad steps.
3. The deep driver returns its own `DriveResult[]` whose `depth` field is normalized to absolute depth (i.e., `Db + deepDepth`) so that downstream consumers see uniform values regardless of strategy.
4. The merged result is the per-root-option `DriveResult` with the deeper `state`, deeper `depth`, and a union of `syntheticDecisions`. Ref resolution then runs against the merged result exactly as it does today.

This handoff requires no new replay machinery, no new state-snapshot infrastructure, and no kernel changes. The driver already accepts an arbitrary `GameState` as its starting checkpoint; passing the broad-pass output (`DriveResult.state`) as input is a one-line wiring change in the deep driver.

### 5.4 Trigger conditions

The deep pass runs only when at least one of the declared `trigger` conditions evaluates to `true` after the broad pass completes for a given microturn:

- **`allRequestedRefsDepthCapped`**: every requested `preview.option.*` ref across every broad-driven root option resolved to `unavailable` with reason `depthCap`. This is the FITL ARVN seed-1000 case.
- **`allReadyValuesUniform`**: every requested `preview.option.*` ref across every broad-driven root option resolved to `ready`, but every value is identical. The broad pass produced signal, but the signal cannot differentiate options; deepening may break the tie. This is a forward-looking trigger; no current witness exercises it, but it is included to address the proposal's `allReadyValuesUniform` case.

Triggers are OR'd. If none fire, the deep pass is skipped and the broad result is final. The decision is per-microturn, not per-decision; a profile may run the deep pass at one microturn and skip it at the next, depending on broad outcomes.

Trigger evaluation is deterministic: it consumes only the broad pass's `PreviewOptionRefStatus` map and ref-id lists. No RNG, no observer ambiguity.

### 5.5 Coverage and trace surface

Extend `PolicyPreviewCoverage` (Spec 162 §5.4) with a `phase` discriminator:

```ts
type PolicyPreviewCoverage = {
  readonly requestedRefCount: number;
  readonly evaluatedRootOptionCount: number;
  readonly readyRootOptionCount: number;
  readonly unavailableRootOptionCount: number;
  readonly allRootsUnavailable: boolean;
  readonly selectedByTieBreakerBecausePreviewUnavailable: boolean;
  readonly strategy: 'singlePass' | 'continuedDeepening';   // NEW
  readonly capClass: 'standard256' | 'deep1024';            // NEW
  readonly broad?: PolicyPreviewPhaseCoverage;              // NEW; present iff continuedDeepening
  readonly deep?: PolicyPreviewPhaseCoverage;               // NEW; present iff deep pass actually ran
};

type PolicyPreviewPhaseCoverage = {
  readonly evaluatedRootOptionCount: number;
  readonly readyRootOptionCount: number;
  readonly unavailableRootOptionCount: number;
  readonly triggerFired?: DeepTrigger;                      // present on deep phase only
};
```

The existing top-level fields continue to summarize the *final merged* coverage. The new sub-blocks expose per-phase detail for diagnosability.

`POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory (Spec 162 §5.3) gains an additive `unavailabilityBreakdown.afterDeepPass: number` field counting roots that remained `unavailable` after the deep pass. The advisory still fires if and only if every root remained unavailable after every executed phase.

### 5.6 Foundation #20 preservation

The deep pass is bound by exactly the same integrity rules Spec 162 introduced:

- A ref that resolves to `unavailable` after both broad and deep is still `unavailable`. The compiler still requires `previewFallback` for any consideration referencing a `preview.option.*` ref; the deeper pass does not relax this.
- A ref that resolves to `ready` only after the deep pass is `ready`. The trace records that the deep phase produced the value (via the per-phase coverage block), but the consideration's contribution is computed from the `ready` value with no special "this came from deep" handling — the fact of deepening is observability, not a scoring axis.
- `tiebreakAfterPreviewNoSignal` and `fallbackExplicit` selectionReason variants apply uniformly. Their classification rules (Spec 162 §5.3) consider the merged ref status, not phase-specific status.

There is no `selectionReason: 'tiebreakAfterDeepPass'` or similar. Selection reasons are about *what evidence the selection used*, not *which phase produced the evidence*.

## 6. Worked cost examples

| Profile shape | M | B | Db | Dd | broadCost | incrementalDeepCost | totalCost | capClass fit |
|---|---|---|---|---|---|---|---|---|
| FITL ARVN target spec | 8 | 1 | 4 | 16 | 200 | 768 | 968 | `deep1024` ✓ |
| Texas Hold'em mid-budget | 4 | 2 | 4 | 8 | 100 | 128 | 228 | `standard256` ✓ |
| FITL conservative deepening | 6 | 1 | 3 | 8 | 78 | 180 | 258 | `deep1024` ✓ |
| Hypothetical over-budget | 8 | 2 | 4 | 16 | 392 | 1536 | 1928 | none ✗ (rejected) |

The "over-budget" row is included to confirm the validator rejects unsafe combinations rather than silently truncating.

## 7. Compiler changes

`packages/engine/src/cnl/compile-agents.ts`:

1. **Lower `strategy` and `capClass`.** Parse the YAML fields into the compiled config. `strategy` defaults to `'singlePass'`; `capClass` defaults to `'standard256'`. Reject unknown values with `CNL_COMPILER_AGENT_PREVIEW_UNKNOWN_STRATEGY` or `CNL_COMPILER_AGENT_PREVIEW_UNKNOWN_CAP_CLASS`.
2. **Lower `continuedDeepening` block.** Required iff `strategy === 'continuedDeepening'`. Validate `broad.depthCap` and `deep.depthCap` are positive integers; `deep.depthCap >= broad.depthCap`; `trigger` is non-empty and contains only known values; `rootPolicy === 'allRootsWithinCap'` (only supported value in this spec). Reject violations with targeted diagnostics.
3. **Per-phase cost validation.** Compute `broadCost` and `totalCost` per §5.2. Reject if `totalCost > capClassBudget(capClass)` with `CNL_COMPILER_AGENT_PREVIEW_DEEP_COST_EXCEEDS_CAP_CLASS`. Diagnostic message must show all formula inputs and the breach amount.
4. **Legacy `depthCap` field consistency.** Under `continuedDeepening`, the top-level `depthCap` field equals `broad.depthCap`; mismatch is rejected with `CNL_COMPILER_AGENT_PREVIEW_DEPTHCAP_MISMATCH`. Under `singlePass`, `depthCap` is consumed unchanged.
5. **`INNER_PREVIEW_HARD_CAP` constant unchanged.** Remains `256`. The constant continues to serve as the `standard256` cap class budget. Cap-class budgets are derived from a new tiny lookup (`CAP_CLASS_BUDGETS: Record<CapClass, number>`), not from `INNER_PREVIEW_HARD_CAP` arithmetic, to keep the relationship explicit.
6. **Compiled-artifact metadata.** The compiled profile records `previewInner.capClass` so reproducibility artifacts and trace serialization can name the active tier.

## 8. Runtime changes

Files touched (anchors verified):

- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts:501` (definition of `runChooseNStepInnerPreview`) — broad-pass driver — no behavioral change. Its output `DriveResult` is the broad checkpoint.
- `packages/engine/src/agents/policy-agent-inner-preview.ts:222-256` (`createPolicyAgentChooseNStepInnerPreview`, single call site to `runChooseNStepInnerPreview` at line 235) — strategy dispatch is inserted here: after the broad pass returns its run, evaluate triggers and conditionally invoke the deep-pass driver before populating the returned `PolicyAgentInnerPreview`. This keeps strategy machinery encapsulated in the inner-preview creator and out of `chooseFrontierDecision`.
- New module `packages/engine/src/agents/policy-preview-inner-deepening.ts` — implements the deep-pass driver. Consumes the broad `DriveResult[]`, evaluates triggers, and re-invokes the inner driver per root option with the incremental `Dd - Db` budget. Returns merged `DriveResult[]` whose `depth` is normalized to absolute.
- `packages/engine/src/agents/policy-agent.ts:543` — `chooseFrontierDecision` is unchanged at the dispatch level (it continues to call `createPolicyAgentChooseNStepInnerPreview`); the strategy branch lives one level deeper as described above.
- `packages/engine/src/agents/policy-preview-inner.ts` — minor extension: the existing per-microturn coverage roll-up gains the per-phase counters from §5.5.
- `packages/engine/src/kernel/types-core.ts:895-901` — extend `CompiledAgentPreviewInnerConfig`, add `ContinuedDeepeningConfig`, add `DeepTrigger`, add `PolicyPreviewPhaseCoverage`.
- `packages/engine/src/agents/policy-eval.ts:199-206` — extend `PolicyPreviewCoverage` (this type is defined here, not in `kernel/types-core.ts`).

Foundation #20's contract is preserved by the deep driver registering `unavailable` statuses for refs that remain unresolved after the deep pass — through the same `unknownPreviewRefs` tracking machinery (`policy-evaluation-core.ts:1290-1311` for `resolvePreviewOptionRef`, with additional sites at lines 1595, 1648, 1654) that Spec 162 already uses.

## 9. Phases and acceptance criteria

| Phase | Deliverable | Acceptance criterion | Effort |
|---|---|---|---|
| 0 | Foundation #10 amendment + cap-class registry | `docs/FOUNDATIONS.md` updated; `CAP_CLASS_BUDGETS` constant exported from compile-agents.ts; appendix updated | XS |
| 1 | Compiler — strategy/capClass lowering + per-phase cost validation + diagnostics + compiled-JSON fixture regeneration | Round-trip test: `singlePass` profiles compile unchanged; `continuedDeepening` profiles validate against the per-phase cost formula; over-budget profiles rejected; `depthCap`/`broad.depthCap` mismatch rejected; pinned compiled-JSON fixtures with `previewInner` blocks regenerated to include the new `capClass` field | M |
| 2 | Broad-pass driver wiring (no behavior change for `singlePass` profiles) | Architectural-invariant test: `singlePass` profiles produce byte-identical traces before and after this phase; `continuedDeepening` profiles fall through to the broad-only path when triggers do not fire | S |
| 3 | Deep-pass driver + trigger evaluation + state handoff + per-phase coverage | (a) Architectural-invariant: when `allRequestedRefsDepthCapped` fires, the deep pass executes and total cost ≤ `capClass` budget. (b) Architectural-invariant: refs that remained `unavailable` after deep are flagged in `unknownPreviewRefs` exactly as Spec 162 requires; Foundation #20 invariant tests still pass. (c) Architectural-invariant: replay-twice produces byte-identical merged traces. (d) Convergence-witness `@witness: spec-164-arvn-seed-1000-deep` reproduces the four chooseNStep frontiers under `deep1024 + continuedDeepening` and asserts at least N of them produce ready signal (N to be pinned during phase implementation against actual seed-1000 results). | L |
| 4 | Cookbook update + benchmark sweep + fixture | (a) `docs/agent-dsl-cookbook.md` "Inner Preview" section gains "Continued deepening" subsection. (b) Benchmark sweep across FITL & Texas Hold'em records broad/deep coverage rollups for representative profiles; report under `reports/spec-164-deepening-benchmarks-<date>.md`. (c) At least one test fixture profile exercises `continuedDeepening` end-to-end. | M |

## 10. Test plan

Test classification per `.claude/rules/testing.md`. Architectural-invariant tests live under `packages/engine/test/architecture/preview-deepening/`. Convergence-witness tests live under `packages/engine/test/policy-profile-quality/`.

### 10.1 architectural-invariant tests

1. **`continued-deepening-cost-bounded.test.ts`** — Property test across the cap-class table: for every `(M, B, Db, Dd)` tuple that compiles, `totalCost ≤ capClassBudget(capClass)` AND no integer overflow occurs. Direct Foundation #10 invariant; the formal cap-class amendment is meaningless without this proof.

2. **`continued-deepening-foundation20-preserved.test.ts`** — Replay Spec 162's `preview-unavailable-not-silently-zero` harness with `strategy: continuedDeepening`. Assert: refs that remain `unavailable` after both phases produce the same omitted-contribution behavior; `previewFallback` requirement still fires at compile time when the consideration uses preview refs without explicit fallback. Foundation #20 cannot regress under deepening.

3. **`continued-deepening-trigger-determinism.test.ts`** — Replay-twice harness. Assert: trigger evaluation yields identical results across replays; deep pass executes (or does not) deterministically; merged trace is byte-identical. Foundation #8.

4. **`continued-deepening-state-handoff.test.ts`** — Synthetic chooseN ladder. Assert: the deep driver re-uses the broad pass's `state` field as starting point; total decisions traversed equal `broadDepth + (Dd - Db)`, not `broadDepth + Dd` (which would imply double traversal).

5. **`continued-deepening-singlepass-unchanged.test.ts`** — A representative profile compiled before this spec lands and one compiled after, both with `strategy: singlePass`, produce byte-identical traces on a fixed seed. Foundation #14 (no compatibility shim) and Foundation #15 (architectural completeness — old behavior preserved exactly).

6. **`cap-class-recorded-in-artifact.test.ts`** — Compiled profile carries `previewInner.capClass`; reproducibility-metadata serialization includes it. Foundation #10 amendment requirement.

7. **`per-phase-coverage-rollup.test.ts`** — `PolicyPreviewCoverage.broad` and `PolicyPreviewCoverage.deep` round-trip: when broad fires only, `deep` is absent; when both fire, both are present and counts sum to the merged top-level fields.

### 10.2 compiler tests

8. **`continued-deepening-cost-rejection.test.ts`** — The `(8, 2, 4, 16)` profile (totalCost 1928) is rejected with `CNL_COMPILER_AGENT_PREVIEW_DEEP_COST_EXCEEDS_CAP_CLASS`; the `(8, 1, 4, 16)` profile (totalCost 968) compiles under `deep1024`. Diagnostic includes formula inputs and breach amount.

9. **`continued-deepening-depthcap-mismatch.test.ts`** — A profile where top-level `depthCap` ≠ `broad.depthCap` is rejected with `CNL_COMPILER_AGENT_PREVIEW_DEPTHCAP_MISMATCH`.

10. **`unknown-strategy-and-capclass-rejected.test.ts`** — Strategy values other than `singlePass`/`continuedDeepening` and capClass values other than `standard256`/`deep1024` rejected with their respective diagnostics. Forward-compatibility shape: new tiers added in future specs flip these tests; the diagnostic suite is the registry.

### 10.3 convergence-witness tests

11. **`arvn-seed-1000-deep-recovery.test.ts`** — `// @test-class: convergence-witness` `// @witness: spec-164-arvn-seed-1000-deep`. Replays ARVN seed 1000 with the post-Spec-161 baseline profile mutated to `strategy: continuedDeepening, capClass: deep1024, broad.depthCap: 4, deep.depthCap: 16`. Asserts: at least N of the four originally-failing chooseNStep decisions produce ready signal under the deep pass. N is determined empirically during Phase 3; the witness pins whatever is observed.

   **Distillation evaluation**: this witness is profile-specific by construction (it asserts a specific seed's deep recovery rate). It cannot be distilled into an architectural invariant without re-introducing per-game heuristics. Retain as `convergence-witness`; if a future kernel evolution shifts the trajectory, retarget the witness rather than soften it.

## 11. Foundation alignment

| Foundation | Alignment |
|---|---|
| #4 (Authoritative State and Observer Views) | Unaffected — the deep driver runs the same observer-routed resolution path as the broad driver |
| #5 (One Rules Protocol, Many Clients) | Unaffected — kernel-published microturns unchanged |
| #8 (Determinism Is Sacred) | Reinforced — trigger evaluation, state handoff, and merged trace are deterministic; replay tests (10.1.3, 10.1.5) prove it |
| #9 (Replay, Telemetry, and Auditability) | Reinforced — per-phase coverage block exposes broad/deep evidence honestly; advisory carries `afterDeepPass` field |
| **#10 (Bounded Computation)** | **Amended by this spec** to formalize cap-class naming. The bound-strictness invariant is preserved; the amendment is purely about naming explicitness |
| #12 (Compiler-Kernel Validation Boundary) | Reinforced — three new compiler diagnostics catch cap-class violations, depth-cap inconsistencies, and unknown strategy/capClass values at compile time |
| #13 (Artifact Identity and Reproducibility) | Reinforced — `capClass` recorded in compiled artifact and reproducibility metadata |
| #14 (No Backwards Compatibility) | Honored — single-pass profiles produce byte-identical traces before and after this spec; no compatibility shim needed because the new strategy is opt-in |
| #15 (Architectural Completeness) | Direct goal — closes the deep-frontier signal-starvation gap surfaced by Spec 162's witness without compromising integrity |
| #16 (Testing as Proof) | Direct goal — tests in §10 prove cost bounds, integrity preservation, determinism, and state handoff |
| #19 (Decision-Granularity Uniformity) | Reinforced — chooseN deepening parallel to chooseOne deepening; uniform across decision kinds |
| #20 (Preview Signal Integrity) | Direct preservation goal — Spec 162's contract holds verbatim under deepening; tests 10.1.2 prove it |

## 12. Code anchors for implementers

- `packages/engine/src/cnl/compile-agents.ts:95` — `INNER_PREVIEW_HARD_CAP = 256` (UNCHANGED; serves as `standard256` budget)
- `packages/engine/src/cnl/compile-agents.ts:1033-1035` — single-pass cost formula (UNCHANGED for `singlePass`; new per-phase formula added alongside)
- `packages/engine/src/cnl/compile-agents.ts:978-1056` — `lowerPreviewInnerConfig` (extended to lower `strategy`, `capClass`, `continuedDeepening` block)
- `packages/engine/src/kernel/types-core.ts:895-901` — `CompiledAgentPreviewInnerConfig` (shape extension)
- `packages/engine/src/agents/policy-eval.ts:199-206` — `PolicyPreviewCoverage` (extended with `strategy`, `capClass`, `broad`, `deep`)
- `packages/engine/src/agents/policy-preview-inner.ts:198-205` — `DriveResult` interface (UNCHANGED; carries the `state` checkpoint reused by the deep driver)
- `packages/engine/src/agents/policy-preview-inner.ts:318-422` — `driveOption` (UNCHANGED; deep driver invokes it with a different starting state)
- `packages/engine/src/agents/policy-preview-inner-choosenstep.ts:501` — `runChooseNStepInnerPreview` (UNCHANGED; broad-pass driver definition)
- `packages/engine/src/agents/policy-agent-inner-preview.ts:222-256` — `createPolicyAgentChooseNStepInnerPreview` (single call site to `runChooseNStepInnerPreview` at line 235; strategy dispatch added here)
- `packages/engine/src/agents/policy-agent.ts:543` — `chooseFrontierDecision` (UNCHANGED; calls into the creator function)
- `packages/engine/src/agents/policy-evaluation-core.ts:1290-1311` — `resolvePreviewOptionRef` / `unknownPreviewRefs` tracking (UNCHANGED; deep driver feeds the same machinery)
- `docs/FOUNDATIONS.md:63-67` — Foundation #10 (amended in Phase 0)
- `docs/agent-dsl-cookbook.md:249-460` — Inner Preview section (extended in Phase 4)

## 13. Open questions

1. **Default trigger set**: Should `allRequestedRefsDepthCapped` be the only default trigger, or should `allReadyValuesUniform` also default to on? Decision deferred to Phase 4 benchmarks. Empirical question; either choice is consistent with the architecture. Initial default: `allRequestedRefsDepthCapped` only; `allReadyValuesUniform` opt-in.

2. **Deep-pass observer ambiguity**: When multiple seats are simultaneously deciding (no current shipped game has this; Texas Hold'em is sequential), the deep pass must run per seat exactly as the broad pass does. Confirm during Phase 3 that the seat-context plumbing is uniform between the two drivers (it should be; both invoke the same `driveOption`).

3. **`topK` rootPolicy** (deferred): The proposal mentioned a `topK` deep-root selection policy. This spec hard-codes `allRootsWithinCap` because `topK` requires "the broad pass produced a usable signal to rank by", which is exactly the case where deepening is least valuable. If a future workload shows `topK` is needed (e.g., where `allReadyValuesUniform` fires often AND the cap class cannot afford all-roots deep), introduce it in a follow-up spec.

4. **`partial.*` ref family** (deferred): Spec 162 §11 already deferred this. Reaffirmed here — even under deepening, partial-state delta refs remain disallowed.

5. **Cap-class inflation**: A future spec may introduce `deep2048` or higher tiers. The architecture supports this trivially (one entry in `CAP_CLASS_BUDGETS`), but justification requires empirical evidence that `deep1024` is insufficient. Out of scope for this spec.

## 14. Reassessment of source proposal

The external deep-research document `reports/preview-signal-integrity.md` §4 was reassessed against the codebase:

- **Continued deepening as primary strategy**: Adopted (this spec §5). The core design — broad pass produces a checkpoint, deep pass continues incrementally — is architecturally clean and uses the existing `DriveResult.state` field with no new replay machinery.
- **Cost formula `broadCost + R × B × I × max(0, Dd − Db)`**: Adopted exactly (§5.2 and §6 worked examples). The formula was independently verified against ARVN seed-1000 cost: 968 ≤ 1024.
- **Cap classes `standard256` and `deep1024`**: Adopted. Higher tiers (`deep2048`+) deferred to follow-ups pending empirical justification (Open Question 5).
- **`hardCostCapClass` field name**: Renamed to `capClass` for brevity and to match the compiled-artifact field. Functional content unchanged.
- **Reusable draft states or replay certificates**: Adopted as draft-state continuation (the `DriveResult.state` checkpoint), NOT as replay certificates. Replay certificates were a design alternative that would have introduced new infrastructure; the existing checkpoint suffices because `driveOption` already accepts an arbitrary `GameState` as input (internally creating a `MutableGameState` working copy via `createMutableState`).
- **Triggers `allRequestedRefsDepthCapped` and `allReadyValuesUniform`**: Adopted (§5.4). Default trigger set narrowed to `allRequestedRefsDepthCapped` only (Open Question 1).
- **`rootPolicy: allRootsWithinCap` vs `topK`**: Adopted with `allRootsWithinCap` as the only supported policy in this spec; `topK` deferred (Open Question 3) because it presupposes a usable signal exists, which is the opposite of the case deepening targets.
- **Single-pass strategy preserved**: Adopted (§3 non-goals). Default behavior unchanged; existing profiles unaffected.
- **Foundation #10 renegotiation**: Scoped to a narrow naming amendment (§4) rather than a fundamental rewrite. The principle is preserved; cap-class names formalize what was previously implicit in the single hard-cap constant.
- **Benchmarking before defaults change**: Adopted as Phase 4 deliverable. Benchmark sweep across FITL and Texas Hold'em precedes any follow-up that flips defaults.
- **Foundation #20 preservation**: Adopted as a dedicated architectural pillar (§5.6). The deep pass is *additive signal*, not a way to silence unavailability.

## 15. Rollout & benchmarking

Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 in order. Phase 0's Foundation amendment lands first as standalone documentation. Phase 1's compiler work is independently mergeable (rejects unsupported configs but does not change runtime behavior). Phase 2 wires the strategy dispatch but `singlePass` profiles see no behavioral change. Phase 3 lands the deep driver. Phase 4 benchmarks and documents.

**Default-change policy**: This spec does NOT flip any profile's default to `continuedDeepening` or `deep1024`. A follow-up spec, motivated by Phase 4 benchmark results, may propose specific profile migrations (e.g., flipping `arvn-evolved` to `deep1024`). That work is out of scope here.

**Resumption of `fitl-arvn-agent-evolution` campaign**: Spec 162's resumption gate (silent lexical fallback after preview collapse must be impossible) is unchanged. Spec 164 enables a *new* exploration mode where evolved profiles can opt into `deep1024`; it does not gate the campaign on Spec 164's completion.

## 16. Follow-On Tickets

**Namespace**: `164CONTPREVDEP-*`

Anticipated decomposition (informational; finalized by `/spec-to-tickets`):

1. **`164CONTPREVDEP-001`** — Foundation #10 amendment + cap-class registry. Phase 0. Lands the `docs/FOUNDATIONS.md` amendment and exports `CAP_CLASS_BUDGETS` from `compile-agents.ts`. **XS**.
2. **`164CONTPREVDEP-002`** — Compiler: lower `strategy`, `capClass`, `continuedDeepening` block; per-phase cost validation; new diagnostics; regenerate compiled-JSON fixtures with `previewInner` blocks. Phase 1. **M**.
3. **`164CONTPREVDEP-003`** — Strategy dispatch wiring inside `createPolicyAgentChooseNStepInnerPreview`; `singlePass` profiles produce byte-identical traces. Phase 2. **S**.
4. **`164CONTPREVDEP-004`** — Deep-pass driver, trigger evaluation, state handoff, per-phase coverage rollup, ARVN seed-1000 convergence witness. Phase 3. **L**.
5. **`164CONTPREVDEP-005`** — Cookbook update, benchmark sweep, fixture profile exercising `continuedDeepening` end-to-end. Phase 4. **M**.

## 17. Tickets

Decomposed via `/spec-to-tickets` on 2026-05-09:

- [`archive/tickets/164CONTPREVDEP-001.md`](../archive/tickets/164CONTPREVDEP-001.md) — Foundation #10 amendment and cap-class registry (covers §4 + §7.5 + Phase 0)
- [`archive/tickets/164CONTPREVDEP-002.md`](../archive/tickets/164CONTPREVDEP-002.md) — Compiler — strategy/capClass lowering, per-phase cost validation, diagnostics (covers §5.1 + §5.2 + §7 + Phase 1)
- [`archive/tickets/164CONTPREVDEP-003.md`](../archive/tickets/164CONTPREVDEP-003.md) — Strategy dispatch wiring with `singlePass` byte-identical baseline (covers §8 dispatch + Phase 2)
- [`archive/tickets/164CONTPREVDEP-004.md`](../archive/tickets/164CONTPREVDEP-004.md) — Deep-pass driver, trigger evaluation, state handoff, per-phase coverage, ARVN witness (covers §5.3 + §5.4 + §5.5 + §5.6 + §10 + Phase 3)
- [`archive/tickets/164CONTPREVDEP-005.md`](../archive/tickets/164CONTPREVDEP-005.md) — Cookbook update, benchmark sweep, e2e fixture profile (covers §15 docs + Phase 4)

## Outcome

Completed: 2026-05-10.

Spec 164 landed across the archived `164CONTPREVDEP-*` ticket chain:

- Foundation #10 now names bounded-computation cap classes and records the Spec 164 amendment in the appendix.
- The compiler lowers `preview.inner.strategy`, `capClass`, and `continuedDeepening`, validates the continued-deepening cost formula against the selected cap class, and rejects unsupported strategy/cap-class values with dedicated diagnostics.
- Runtime policy preview supports `singlePass` and `continuedDeepening` dispatch, deep-pass trigger evaluation, broad-to-deep state handoff, per-phase coverage, and preserved preview-unavailability semantics.
- The agent DSL cookbook documents continued deepening, and the Phase 4 benchmark sweep/report plus e2e fixture profile exercise the feature end to end.

Deviations from the original plan:

- Default profiles were not migrated to `continuedDeepening` or `deep1024`, matching this spec's default-change policy.
- The Texas Hold'em benchmark row is diagnostic no-signal evidence because the current production profile does not author `preview.option.*` considerations; no production profile migration was invented as part of this spec.

Verification results:

- `pnpm -F @ludoforge/engine build`
- `node --test packages/engine/dist/test/integration/continued-deepening-e2e.test.js`
- `node --check packages/engine/scripts/spec-164-deepening-benchmark.mjs`
- `node packages/engine/scripts/spec-164-deepening-benchmark.mjs --date 20260510`
- `pnpm -F @ludoforge/engine test`
- `pnpm turbo build`
- `pnpm turbo test`
- `pnpm turbo lint`
- `pnpm turbo typecheck`
- `pnpm run check:ticket-deps`
