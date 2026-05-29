# 207AGEDECCOS-001: Phase 1 — Diagnose the within-game per-decision cost-accumulation root cause

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — diagnosis only (a checked-in `diagnose-*.mjs` fixture + documented root cause; no production source change in this ticket)
**Deps**: `specs/207-fitl-agent-decision-cost-regression.md`

## Problem

`packages/engine/test/policy-profile-quality/fitl-spec-143-cost-stability.test.ts` measures per-decision agent cost drift across a single FITL game (seed 1002, `maxTurns=3`, four `*-baseline` policy agents) as the trimmed last-decile average decision time divided by the trimmed first-decile average, with a calibrated ceiling of **1.75×** (`COST_DRIFT_CEILING`, calibrated 2026-04-24 at ratio ≈1.108×). As of branch `implemented-spec-206` it measures **ratio ≈ 19–21×** (first-decile ≈20ms, last-decile ≈396–446ms). The run still reaches `stopReason=terminal` (209 decisions), so this is **not** a correctness or termination failure — it is a within-game *cost accumulation*: later decisions in the same game are ~20× slower than early ones.

The same growing structure almost certainly drives the other three quarantined witnesses (Spec 207 §5): the two `probe-budget` probes blow the hard per-decision overhead budget, and `fitl-arvn-may17-equivalent-opponent-preview` sees 0 ready opponent-preview candidates because a materially slower bounded preview hits its grant-flow / post-grant / free-operation budget caps and marks NVA/VC margin refs `unknown` instead of `ready`.

This ticket is **Phase 1 (diagnosis)** of Spec 207. Its sole deliverable is to localize the growing structure and document the spec that introduced it (Spec 207 Acceptance #1). The fix (Phase 2) and witness un-skip (Phase 3) are deferred to a post-diagnosis decomposition run, because their scope is gated on this ticket's findings.

## Assumption Reassessment (2026-05-29)

1. **Witness + constants confirmed**: `fitl-spec-143-cost-stability.test.ts` exists with `COST_DRIFT_CEILING = 1.75`, `SEED = 1002`, `MAX_TURNS = 3`, profiles `['us-baseline','arvn-baseline','nva-baseline','vc-baseline']`, and the 2026-04-24 calibration comment (first-decile ≈13.243ms / last-decile ≈14.675ms / ratio ≈1.108). The witness is quarantined via `it(..., { skip: 'Spec 207: ...' })` at line 275.
2. **Decision entrypoint confirmed**: `PolicyAgent.chooseDecision(input: AgentMicroturnDecisionInput)` exists at `packages/engine/src/agents/policy-agent.ts:589`. The agents decision pipeline is cache-heavy (`policy-encoded-state-cache.ts`, `policy-encoded-state-layout-cache.ts`, `policy-wasm-*-cache.ts`, `preview-budget-allocator.ts`, the `policy-preview*` / `policy-wasm-preview-drive*` family) — plausible homes for a per-decision-index or per-`turnCount` growing structure.
3. **Bisect range corrected**: the implemented specs in the suspected window are **196–202 and 206** (all archived). Specs 203–205 are unimplemented `PROPOSED` drafts with no landed commits and are **not** bisect targets. Per Spec 207 §1 the drift predates Spec 202, so the introduction point is most likely within **196–201**, with 202/206 as possible amplifiers.
4. **Diagnostic precedent confirmed**: `campaigns/fitl-arvn-agent-evolution/diagnose-*.mjs` is the established pattern (e.g. `diagnose-existing-classifier.mjs`, `diagnose-ready-ref-stats.mjs`); these import from `packages/engine/dist/` to avoid a full rebuild loop.

## Architecture Check

1. **Diagnosis before fix is the correct sequencing** (Foundation 15 — architectural completeness): the spec is explicit that fix scope is unknown until the accumulation source is found. Authoring a fix ticket now would bake in a hypothetical lever. This ticket produces the evidence that gates Phase 2.
2. **No production source change here**: the deliverable is a reproducible diagnostic (`diagnose-*.mjs`) plus a written root-cause note. This keeps the diff reviewable and the finding reproducible (Foundation 9 — auditability; Foundation 16 — testing as proof). The diagnostic imports from compiled `dist/`, matching the campaign precedent.
3. **Engine-agnostic boundary preserved** (Foundation 1): the diagnostic probes the agent decision path generically (decision-index / `turnCount` vs. per-decision cost and allocation); it does not add FITL-specific branches to engine source. FITL seed 1002 is a reproduction fixture, not engine logic.
4. **Findings, not relaxations** (Spec 207 §4 Non-Goals): this ticket must not touch `COST_DRIFT_CEILING`, the probe overhead budgets, the preview caps, or any quarantined-witness assertion. It only measures and localizes.

## What to Change

### 1. Author a reproducible cost-accumulation diagnostic

Add `campaigns/fitl-arvn-agent-evolution/diagnose-decision-cost-accumulation.mjs` (sibling to existing `diagnose-*.mjs`, importing from `packages/engine/dist/`). It should:

- Replay the same configuration the witness uses (seed 1002, `maxTurns=3`, the four `*-baseline` profiles) and record per-decision timing **and** a cheap allocation/size proxy (e.g. `process.memoryUsage().heapUsed` deltas, and/or the `.size`/`.length` of suspect cache/memo structures sampled per decision).
- Emit the per-decision-index series so the growth shape is visible (linear vs. super-linear in decision index / `state.turnCount`).

### 2. Confirm the accumulation is on the agent decision path, not the kernel apply path (Spec 207 §3.1)

Instrument or partition the per-decision timing into the `PolicyAgent.chooseDecision` → proposer/preview/policy-evaluation segment vs. the kernel `applyMove` segment. Confirm the ~20× growth lives in the agent decision segment. Record the split.

### 3. Localize the growing structure (Spec 207 §3.2)

Within the agent decision segment, identify which structure grows with decision index / `turnCount` rather than being bounded per decision. Candidate suspects to probe first (from the cache-heavy agents module): `policy-encoded-state-cache.ts`, `policy-encoded-state-layout-cache.ts`, the `policy-wasm-*-cache.ts` family, `preview-budget-allocator.ts`, and any accumulated trace buffer (`policy-*-trace.ts`, `plan-trace.ts`). Use the per-decision size proxy from step 1 to find the structure whose growth tracks the cost curve. Where static reasoning is ambiguous, bisect across the implemented specs **196–202 / 206** (most likely 196–201) to find the commit that introduced the unbounded growth.

### 4. Document the root cause (Spec 207 Acceptance #1)

Write the finding into the spec's Problem / Suspected-area framing: the specific growing structure (file + symbol), the spec that introduced it, and the growth shape. Decision on checking in the diagnostic: **keep** `diagnose-decision-cost-accumulation.mjs` checked in (it becomes the reproducible I0 fixture cited by Phase 2); delete only if the finding does not reshape the spec.

## Files to Touch

- `campaigns/fitl-arvn-agent-evolution/diagnose-decision-cost-accumulation.mjs` (new — diagnostic script)
- `specs/207-fitl-agent-decision-cost-regression.md` (modify — record the localized root cause + introducing spec in §1/§3)

**Likely surface (read-only during diagnosis; exact growing structure refined by this ticket's findings)**: `packages/engine/src/agents/policy-agent.ts`, `policy-encoded-state-cache.ts`, `policy-encoded-state-layout-cache.ts`, `preview-budget-allocator.ts`, the `policy-wasm-*-cache.ts` family, `policy-preview*.ts` / `policy-wasm-preview-drive*.ts`, and `policy-*-trace.ts` / `plan-trace.ts`. These are inspected, not modified — the fix that touches the localized file is Phase 2.

## Out of Scope

- **Any production source fix.** Bounding the growing structure is Phase 2 (a separate ticket, decomposed against this ticket's findings).
- **Un-skipping any of the four quarantined witnesses.** That is Phase 3's acceptance gate.
- **Relaxing `COST_DRIFT_CEILING` (1.75×), the probe overhead budgets, or the preview budget caps**, or re-calibrating any witness to the regressed numbers (Spec 207 §4 Non-Goals).
- The `may-17` opponent-preview and `probe-budget` symptoms are diagnosed only insofar as confirming they share this root cause; their pass/fail resolution is Phase 3.

## Acceptance Criteria

### Tests That Must Pass

1. `node campaigns/fitl-arvn-agent-evolution/diagnose-decision-cost-accumulation.mjs` reproduces the ~20× within-game drift on seed 1002 and prints the per-decision-index cost + size-proxy series.
2. The diagnostic output unambiguously attributes the growth to the agent decision segment (not the kernel apply path), and names the growing structure (file + symbol) and the introducing spec.
3. Existing suite unaffected: `pnpm -F @ludoforge/engine build` succeeds; the four Spec 207 witnesses remain quarantined (this ticket does not un-skip them).

### Invariants

1. No production engine/runtime source is modified by this ticket — diagnosis only (Engine Changes: None).
2. No quarantined-witness bound, budget, or cap is relaxed (Spec 207 §4).
3. The root-cause finding is reproducible from the checked-in diagnostic (Foundation 9 / 16) — a second run yields the same attributed structure.

## Test Plan

### New/Modified Tests

1. `campaigns/fitl-arvn-agent-evolution/diagnose-decision-cost-accumulation.mjs` (new) — reproducible diagnostic; not a `node --test` unit test but the I0 fixture that gates Phase 2, following the established `diagnose-*.mjs` precedent (imports from `dist/`).

### Commands

1. `pnpm -F @ludoforge/engine build` (compile `dist/` so the diagnostic can import it)
2. `node campaigns/fitl-arvn-agent-evolution/diagnose-decision-cost-accumulation.mjs` (reproduce + localize)
3. `pnpm -F @ludoforge/engine typecheck && pnpm -F @ludoforge/engine lint`

## Outcome

**Completed**: 2026-05-29. Diagnosis-only; no production engine/runtime source modified.

### What changed
- **New**: `campaigns/fitl-arvn-agent-evolution/diagnose-decision-cost-accumulation.mjs` — reproducible I0 diagnostic (imports from `dist/`, matching the `diagnose-*.mjs` precedent). Replays the witness config (seed 1002, `maxTurns=3`, four `*-baseline` agents), splits per-decision time into the agent (`chooseDecision`) vs kernel (`applyPublishedDecision`) segments, samples a per-decision size proxy (heapUsed, per-agent stateful Maps, every run-local runtime cache), and attributes the agent-segment cost to internal hot-path buckets via the built-in opt-in `PerfProfiler` + global hot-path channel. Prints the per-decision-index series, a decile cost split, size-proxy growth, and a ROOT-CAUSE attribution block. The bisect evidence is baked into the file header (FINDINGS) and the printed attribution.
- **Modified**: `specs/207-fitl-agent-decision-cost-regression.md` — §3 rewritten from "Suspected area" to "Root cause (localized)"; §1 and §8 Phase-1 marked done; corrected the disproven 196–206 bisect-window hypothesis.

### Findings (Acceptance #1, #2)
- **Segment**: the ~20–30× drift lives entirely in the AGENT decision path (`PolicyAgent.chooseDecision`): last-decile agent ≈ 569–609ms vs kernel apply ≈ 1.5ms (kernel apply flat, ≈1.4×).
- **Growing structure (file + symbol)**: the `chooseNStep` continuedDeepening inner-preview drive — `packages/engine/src/agents/policy-agent-inner-preview.ts` → `createPolicyAgentChooseNStepInnerPreview` → `runChooseNStepInnerPreview` (broad) + `runDeepPass` (deep). It is per-decision work bounded only by `capClass`; its realized cost scales with the selectable chooseN value set as the FITL board fills (`adp:iterations` ≈ 3200–3400 per late ARVN `chooseNStep` decision; biggest ARVN decisions 2000–4900ms). `arvn-baseline` opts into `inner.chooseNStep: true` / `continuedDeepening` / `capClass: deep1024` / `deep.depthCap: 16`.
- **Introducing spec**: **Spec 191** (plan-role-semantic-integrity / 191PLAROLSEM), established by commit bisect — pre-191 (`39dc4f288`) is **1.00× flat** (163 decisions, uniform ~190ms); spec-191 merge (`421bd2ef5`) is **41.5×** (218 decisions). This is **outside** the spec's originally-hypothesised 196–206 window. The `deep1024` continuedDeepening config (added 2026-05-12, Spec 164 campaign) is a necessary cost-multiplier *precondition*, not the drift cause; Spec 191's plan-root/proposal rework is the drift cause (early decisions ~190ms→~11ms, late decisions ~190ms→~465ms).

### Deviations from plan
- The ticket/spec assumed the introduction point was "most likely within 196–201". The bisect disproved this: the regression predates the entire 196–206 window and is owned by **Spec 191**. The spec §1/§3/§8 were corrected accordingly (in-scope: "Findings, not relaxations" + ticket deliverable "Document the root cause").
- The growing structure is **not** a retained/leaked unbounded cache (all run-local runtime caches are LRU/WeakMap-bounded); it is per-decision preview work bounded by `capClass` that scales with board fill. The spec's "retained-state structure" framing was corrected.

### Verification
- `pnpm -F @ludoforge/engine build` — succeeds.
- `node campaigns/fitl-arvn-agent-evolution/diagnose-decision-cost-accumulation.mjs` — reproduces the within-game drift (~28–30× across runs; combined ratio printed vs the 1.75× ceiling) and prints the per-decision series + attribution.
- `pnpm -F @ludoforge/engine typecheck` — clean. `pnpm -F @ludoforge/engine lint` — clean (`--max-warnings 0`).
- No production engine/runtime source modified (`git diff --stat packages/engine/src` empty). All four Spec 207 witnesses remain quarantined (3 `skip: 'Spec 207'` markers across the 3 witness files). No bound/budget/cap relaxed.
