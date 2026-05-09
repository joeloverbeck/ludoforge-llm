# 162PRESIGINT-006: ARVN seed 1000 convergence-witness + cookbook update

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — test fixture and documentation only
**Deps**: `tickets/162PRESIGINT-005.md`

## Problem

The integrity work in 001–005 closes the silent-fallback path Foundation #20 forbids. The campaign-grounded gap report `reports/preview-inner-choosenstep-deep-nesting-2026-05-08.md` documents the canonical workload that triggers the gap: ARVN seed 1000, four chooseNStep decisions exit at `depthCap` and request `preview.option.delta.victory.currentMargin.self`. Phase 3 lands the regression fixture that proves the FITL workload now emits the advisory and selects via `tiebreakAfterPreviewNoSignal` rather than silent lexical fallback.

The cookbook section "Per-option Preview at chooseNStep" (line 339-352 in `docs/agent-dsl-cookbook.md`) currently asserts:

> Spec 161 makes the per-option projected refs available for each legal ADD option, so the consideration differentiates the currently published add choices the same way it differentiates `chooseOne` options.

That universal-capability framing is wrong under deep-nesting workloads. This ticket retracts it and documents `previewFallback`.

Phase 3 also unblocks the `fitl-arvn-agent-evolution` campaign — per spec §12 rollout sequencing, the campaign resumes only after the seed-1000 witness passes.

## Assumption Reassessment (2026-05-09)

1. **`reports/preview-inner-choosenstep-deep-nesting-2026-05-08.md`.** Verified the file exists. Use it as the source of truth for the seed, profile, and the four decisions to assert against.
2. **ARVN seed 1000 with the post-Spec-161 baseline profile.** The report names the profile and identifies the four chooseNStep decisions. The convergence-witness should reproduce the same `(seed, profileId, kernel-version)` tuple.
3. **`@witness: spec-162-arvn-seed-1000`.** Witness id convention per `.claude/rules/testing.md` — `<spec-id>[-<short-slug>]`. Use `spec-162-arvn-seed-1000`.
4. **Cookbook anchors.** Verified line 251 (`Specs 160 and 161 add opt-in preview...`), 282 (`The compiler enforces INNER_PREVIEW_HARD_CAP = 256...`), 316 (preview consideration example), 341 (`Spec 161 makes the per-option projected refs available... same way it differentiates chooseOne options`). The retraction lands around line 339-352 with a link forward to `previewFallback`.
5. **Distillation evaluation per `.claude/rules/testing.md`.** The witness guards the trace-shape regression — that the FITL workload triggers `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` and the new selectionReason. The architectural property is covered by T1 (005) and T3 (003); the witness is retained because the FITL workload is the canonical real-world trigger and the distillation rule allows witness retention when the FITL workload triggering the property is itself the documentation.

## Architecture Check

1. **Foundation #16 (Testing as Proof).** The advisory-firing and selectionReason-classification properties are proven by T1, T3, T4 (architectural-invariants). The convergence-witness adds: "the FITL ARVN seed 1000 workload triggers exactly four such advisories, against the four named decisions, with the named requested ref id." This is profile-quality witness territory per `docs/FOUNDATIONS.md` Appendix — lives in `policy-profile-quality/` if the existing layout uses that, otherwise alongside other FITL canaries with the witness marker.
2. **Foundation #19 (Decision-Granularity Uniformity) reinforced.** Per spec §10: chooseN per-option preview achieves Foundation-19 parity with chooseOne by being honest about gaps, not by claiming false coverage. The cookbook retraction documents that.
3. **No engine code change.** Pure test + doc.
4. **Engine-agnostic.** ARVN seed 1000 is FITL — the witness is profile-quality (FITL-specific), placed accordingly. Engine-level invariants are owned by T1/T3/T4.

## What to Change

### 1. Convergence-witness test

Path: per `.claude/rules/testing.md`, `convergence-witness` tests for FITL profile-quality go under `packages/engine/test/policy-profile-quality/` (per the Appendix dual-stream guidance). The canonical directory exists in the live repo.

`packages/engine/test/policy-profile-quality/spec-162-arvn-seed-1000-witness.test.ts` (or alternate path per above):

```ts
// @test-class: convergence-witness
// @witness: spec-162-arvn-seed-1000
```

Test body:
- Replay ARVN seed 1000 with the post-Spec-161 baseline profile (cite the profile id from `reports/preview-inner-choosenstep-deep-nesting-2026-05-08.md`).
- Assert the four chooseNStep decisions named in the report emit `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisories.
- Each advisory's `requestedRefs` includes `'preview.option.delta.victory.currentMargin.self'`.
- Each affected decision's selected-candidate `selectionReason === 'tiebreakAfterPreviewNoSignal'`.
- Each affected decision's selected-candidate `unknownPreviewRefs` lists `'preview.option.delta.victory.currentMargin.self'` with reason `'depthCap'`.
- Trace replay is byte-identical across two runs (Foundation #8 + #9).

The test references the report path in a comment for human navigation, but does not import from `reports/` — assertions use the seed/profile/decision identifiers directly.

### 2. Cookbook retraction and `previewFallback` documentation

In `docs/agent-dsl-cookbook.md`, around line 339-352 ("Target-Selection `chooseNStep` Example"):

- Retract the universal-capability framing. Replace the sentence "Spec 161 makes the per-option projected refs available for each legal ADD option, so the consideration differentiates the currently published add choices the same way it differentiates `chooseOne` options." with a calibrated alternative such as:

> Spec 161 makes the per-option projected refs available for each legal ADD option. For shallow chooseNStep frontiers (depth ≤ `depthCap`), the consideration differentiates the currently published add choices the same way it differentiates `chooseOne` options. For deeply nested chooseNStep ladders that exit at `depthCap` before the requested ref can resolve, the per-option preview is `unavailable` (Foundation #20). The consideration MUST declare `previewFallback.onUnavailable` so its scoring under the unavailable case is explicit. See [Preview Signal Integrity](#preview-signal-integrity) below.

- Add a new sub-section (or extend the existing inner-preview section) titled `previewFallback` (or `Preview Signal Integrity`). Document:
  - The contract: every consideration whose `value` is a `preview.option.*` ref MUST declare `previewFallback.onUnavailable`.
  - The two semantics: `noContribution` (default; contribution omitted from `scoreContributions`) and `{ constant: <integer> }` (explicit numeric contribution; trace records `previewFallbackFired`).
  - The diagnostic `CNL_COMPILER_AGENT_PREVIEW_REF_REQUIRES_EXPLICIT_FALLBACK` and the suggested fix (add `previewFallback`).
  - The two new `selectionReason` variants (`tiebreakAfterPreviewNoSignal`, `fallbackExplicit`) and the `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory.
  - One YAML example for each fallback semantics.
  - A pointer that the FITL `preferOptionProjectedMargin` recipe in `data/games/fire-in-the-lake/92-agents.md` uses `noContribution`.

### 3. Witness placement guidance

If `packages/engine/test/policy-profile-quality/` does not yet exist, create it with a brief `README.md` explaining the dual-stream rationale (per `docs/FOUNDATIONS.md` Appendix) — though the spec for the dual-stream layout pre-dates this ticket; if that structure is already documented elsewhere, link rather than re-document.

## Files to Touch

- `packages/engine/test/policy-profile-quality/spec-162-arvn-seed-1000-witness.test.ts` (new)
- `docs/agent-dsl-cookbook.md` (modify — retract universal-capability framing, document `previewFallback`)

## Out of Scope

- Engine code changes — all owned by 002–005.
- Raising the cap, new ref families. Out of scope by spec §3.
- Resuming the `fitl-arvn-agent-evolution` campaign. Per spec §12: only after Phase 3 lands and the seed-1000 witness passes. Campaign resumption is a separate operator action, not a deliverable of this ticket.

## Acceptance Criteria

### Tests That Must Pass

1. T5: `spec-162-arvn-seed-1000-witness.test.ts` — replays seed 1000, asserts four advisories fire, four decisions select via `tiebreakAfterPreviewNoSignal`, four `unknownPreviewRefs` lists contain the named ref with reason `'depthCap'`, byte-identical replay.
2. Architectural-invariants T1, T2, T3, T4 (from 003 and 005) still pass.
3. Compiler tests T6, T7 (from 004) still pass.
4. Cookbook update does not break any `docs/`-related lint or anchor link.
5. Existing suite: `pnpm turbo test`.

### Invariants

1. The FITL ARVN seed 1000 workload — the canonical real-world trigger from the gap report — produces deterministic advisory emission and `tiebreakAfterPreviewNoSignal` selection. Foundation #20 holds end-to-end on the FITL conformance corpus.
2. Cookbook retraction is honest: it does not promise capability the engine does not deliver under deep-nesting.
3. `INNER_PREVIEW_HARD_CAP === 256` unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/spec-162-arvn-seed-1000-witness.test.ts` (new, T5) — convergence-witness for the FITL workload that triggered Foundation #20.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test --test-name-pattern spec-162-arvn-seed-1000`
3. `pnpm -F @ludoforge/engine test` (full engine suite — verifies dual-stream classification still partitions cleanly)
4. `pnpm turbo test` (full repo)
5. Manual review: read the cookbook section in rendered form to confirm the retraction reads naturally and the YAML example compiles under 004's diagnostic.
