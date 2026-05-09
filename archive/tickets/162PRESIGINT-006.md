# 162PRESIGINT-006: ARVN seed 1000 convergence-witness + cookbook update

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — minimal runtime repair if the seed-1000 witness proves the predecessor trace path still reports depth-capped delta refs as ready
**Deps**: `archive/tickets/162PRESIGINT-005.md`

## Problem

The integrity work in 001–005 closes the silent-fallback path Foundation #20 forbids. The campaign-grounded gap report `reports/preview-inner-choosenstep-deep-nesting-2026-05-08.md` documents the canonical workload that triggers the gap: ARVN seed 1000, four chooseNStep decisions exit at `depthCap` and request `preview.option.delta.victory.currentMargin.self`. Phase 3 lands the regression fixture that proves the FITL workload now emits the advisory and selects via `tiebreakAfterPreviewNoSignal` rather than silent lexical fallback.

The cookbook section "Per-option Preview at chooseNStep" (line 339-352 in `docs/agent-dsl-cookbook.md`) currently asserts:

> Spec 161 makes the per-option projected refs available for each legal ADD option, so the consideration differentiates the currently published add choices the same way it differentiates `chooseOne` options.

That universal-capability framing is wrong under deep-nesting workloads. This ticket retracts it and documents `previewFallback`.

Phase 3 also unblocks the `fitl-arvn-agent-evolution` campaign — per spec §12 rollout sequencing, the campaign resumes only after the seed-1000 witness passes.

## Assumption Reassessment (2026-05-09)

1. **`reports/preview-inner-choosenstep-deep-nesting-2026-05-08.md`.** Verified the file exists. Use it as the source of truth for the seed, profile, and the four decisions to assert against.
2. **ARVN seed 1000 with the post-Spec-161 baseline profile.** The report names the profile and identifies the four chooseNStep decisions. The convergence-witness should reproduce the same `(seed, profileId, kernel-version)` tuple.
3. **Policy-profile-quality marker convention.** The live marker validator requires policy-profile-quality convergence witnesses to use `@profile-variant`, not `@witness`. Use `// @profile-variant: arvn-evolved` in the test file, and keep `spec-162-arvn-seed-1000` durable in the file name, test title/comment, and outcome ledger.
4. **Cookbook anchors.** Verified line 251 (`Specs 160 and 161 add opt-in preview...`), 282 (`The compiler enforces INNER_PREVIEW_HARD_CAP = 256...`), 316 (preview consideration example), 341 (`Spec 161 makes the per-option projected refs available... same way it differentiates chooseOne options`). The retraction lands around line 339-352 with a link forward to `previewFallback`.
5. **Distillation evaluation per `.claude/rules/testing.md`.** The witness guards the trace-shape regression — that the FITL workload triggers `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` and the new selectionReason. The architectural property is covered by T1 (005) and T3 (003); the witness is retained because the FITL workload is the canonical real-world trigger and the distillation rule allows witness retention when the FITL workload triggering the property is itself the documentation.
6. **Live seed-1000 RED witness after marker correction.** Reassessment against current `HEAD` found the four depth-capped ARVN chooseNStep decisions still reproduce, but their selected candidates currently report `selectionReason: 'tiebreak'`, a zero `preferOptionProjectedMargin` score contribution, and no `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory. The ticket therefore owns the smallest runtime repair needed to make the Phase 3 witness true: depth-capped delta preview refs must remain unavailable to frontier scoring/tracing instead of being treated as ready partial-state values.

## Architecture Check

1. **Foundation #16 (Testing as Proof).** The advisory-firing and selectionReason-classification properties are proven by T1, T3, T4 (architectural-invariants). The convergence-witness adds: "the FITL ARVN seed 1000 workload triggers exactly four such advisories, against the four named decisions, with the named requested ref id." This is profile-quality witness territory per `docs/FOUNDATIONS.md` Appendix — lives in `policy-profile-quality/` if the existing layout uses that, otherwise alongside other FITL canaries with the witness marker.
2. **Foundation #19 (Decision-Granularity Uniformity) reinforced.** Per spec §10: chooseN per-option preview achieves Foundation-19 parity with chooseOne by being honest about gaps, not by claiming false coverage. The cookbook retraction documents that.
3. **Minimal engine repair if required by the live witness.** The intended Phase 3 slice is test + doc, but the live seed-1000 RED witness proves the predecessor runtime path still permits the silent partial-state delta shape for depth-capped chooseNStep refs. The owned repair is limited to preserving Foundation #20 for depth-capped delta preview refs; no cap, ref-family, or profile semantics change is in scope.
4. **Engine-agnostic.** ARVN seed 1000 is FITL — the witness is profile-quality (FITL-specific), placed accordingly. Engine-level invariants are owned by T1/T3/T4.

## What to Change

### 1. Convergence-witness test

Path: per `.claude/rules/testing.md`, `convergence-witness` tests for FITL profile-quality go under `packages/engine/test/policy-profile-quality/` (per the Appendix dual-stream guidance). The canonical directory exists in the live repo.

`packages/engine/test/policy-profile-quality/spec-162-arvn-seed-1000-witness.test.ts` (or alternate path per above):

```ts
// @test-class: convergence-witness
// @profile-variant: arvn-evolved
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
- `packages/engine/src/agents/policy-preview-inner.ts` (modify only if the seed-1000 RED witness proves depth-capped delta refs still resolve as ready partial-state values)

## Out of Scope

- Broad engine code changes beyond the live seed-1000 depth-cap repair. Tickets 002–005 own the general trace/compiler/runtime surface; this ticket owns only the minimal predecessor fallout proven by the Phase 3 RED witness.
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
2. `pnpm -F @ludoforge/engine exec node --test dist/test/policy-profile-quality/spec-162-arvn-seed-1000-witness.test.js`
3. `pnpm -F @ludoforge/engine test` (full engine suite — verifies dual-stream classification still partitions cleanly)
4. `pnpm turbo test` (full repo)
5. Manual review: read the cookbook section in rendered form to confirm the retraction reads naturally and the YAML example compiles under 004's diagnostic.

## Outcome

Completed on 2026-05-09. Implementation landed the corrected Phase 3 boundary:

- `packages/engine/test/policy-profile-quality/spec-162-arvn-seed-1000-witness.test.ts` replays ARVN seed 1000 twice with `arvn-evolved`, asserts the four depth-capped chooseNStep decisions, verifies `POLICY_PREVIEW_SIGNAL_UNAVAILABLE`, `selectionReason: 'tiebreakAfterPreviewNoSignal'`, selected-candidate `unknownPreviewRefs` reason `depthCap`, omitted preview score contribution, and byte-identical replay.
- `packages/engine/test/unit/agents/policy-preview-inner-depthcap-delta.test.ts` locks the architecture-level repair: depth-capped delta preview refs are unavailable with reason `depthCap`, not ready partial-state zeroes.
- `packages/engine/src/agents/policy-preview-inner.ts` now keeps `preview.option.delta.victory.currentMargin.self` unavailable when the drive exits at `depthCap`, preserving Foundation #20 without changing the hard cap or adding ref families.
- `docs/agent-dsl-cookbook.md` retracts the universal chooseNStep capability wording, adds `previewFallback` to preview-ref examples, documents `noContribution` and explicit constant fallback semantics, and names the diagnostic/advisory/selectionReason surfaces.

Corrections applied:

- Marker correction: policy-profile-quality convergence witnesses use `@profile-variant: arvn-evolved`, not `@witness`; the witness id remains durable in the file name and test title.
- Verification correction: the focused witness command is the repo-valid built Node test invocation, not `--test-name-pattern`.
- Touched-file correction: the live Phase 3 RED witness required a narrow runtime repair in `policy-preview-inner.ts`, plus a focused unit guard, despite the original draft saying no engine changes.

File-size ledger:

- `packages/engine/src/agents/policy-preview-inner.ts` is 523 lines after the narrow runtime repair, below the repository's 800-line cap.
- `docs/agent-dsl-cookbook.md` is 855 lines after the cookbook update. It was already over the repository's typical source-file guidance before this ticket; extraction was considered and deferred because this is a documentation cookbook with a localized section update, and splitting the cookbook would widen the ticket.

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-inner-depthcap-delta.test.js dist/test/architecture/preview-integrity/*.test.js dist/test/policy-profile-quality/spec-162-arvn-seed-1000-witness.test.js` — passed after the final `pnpm turbo test` rebuild (`14` tests, `8` suites).
- `pnpm -F @ludoforge/engine test:policy-profile-quality` — red on pre-existing unrelated fixture drift in `fitl-march-dead-end-recovery.test.js`: the file fails before simulation because the compiled production GameDef hash is `f4f389ceb2105af300c1a33076eb9f3a9e006a25f7721540920f84ee92ecbc68` while its checked-in fixture expects `111f595e28b7518f794bfdc1739a04a1fec3aeee61e85864d287285dd719fec5`. This ticket's touched files do not alter production GameSpec data or that fixture, and the focused new policy-quality witness passed.
- `pnpm -F @ludoforge/engine test` — passed, including schema artifact check and default lane summary `65/65 files passed`.
- `pnpm turbo test` — passed (`5 successful, 5 total`).
- `pnpm run check:ticket-deps` — passed for `1` active ticket and `2285` archived tickets.

Proof validity: `pnpm turbo test` rebuilt engine `dist`, so the focused witness/preview command was rerun afterward against the final compiled output. The terminal status/proof transcription and checker-result transcription changed no code, acceptance boundary, command semantics, touched-file ownership, or follow-up ownership; no proof lane was invalidated.
