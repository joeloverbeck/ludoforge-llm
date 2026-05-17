# 178CONTDEEPINNER-001: Phase 0 — Inner-preview subroutine split instrumentation + witness report

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-preview-inner.ts` (instrumentation only); `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` (classifier + section extension)
**Deps**: `archive/specs/178-optimize-continued-deepening-inner-preview-orchestration.md`

## Problem

`reports/178-phase-4-continued-deepening-orchestration-residual.md` measured `continued-deepening-orchestration-inclusive` on `coupArvnRedeployPolice:chooseOne | continuedDeepening` at `7,581.42 ms (9.8174%)` of same-run slow-tier wall time — the only material owner that survived the four-ticket attribution chain. Inside that inclusive bucket, the named nested families (`existing-hot-path-bucket-nested` at `1,619.58 ms`, `policy-search-candidate-scoring-nested` at `1,537.43 ms`) explain ~42% of the inclusive cost. The remaining `~4,370 ms (≈5.66%)` is unattributed by any current named family — it lives inside `runChooseOneInnerPreview` in the per-option `driveOption` preview drive, the per-option `resolveRefs` ref resolution, and the per-call surfaceContext / seatResolutionIndex setup, none of which has a `perfHotPath` bracket of its own.

Without that subroutine-level split, a Phase 1 optimization would still be guessing which subroutine to attack inside the residual. This ticket closes that gap before any code change lands — it adds the measurement and produces the named-owner witness, nothing else.

## Assumption Reassessment (2026-05-17)

1. **Spec 178 §3.3 names three candidate subroutines** (`driveOption`, `resolveRefs`, surfaceContext setup) for the unattributed residual. **Confirmed** by inspection of `packages/engine/src/agents/policy-preview-inner.ts:511-555` — `runChooseOneInnerPreview` builds `seatResolutionIndex` and `surfaceContext` once per call, then iterates over legal chooseOne decisions calling `driveOption` + `resolveRefs` per option. No other subroutine accounts for material wall time on the chooseOne path.
2. **The renderer's classifier maps `policyInnerPreview:*` keys to `continued-deepening-orchestration-inclusive`** (the wrapping bucket family). **Confirmed** at `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs:559-577`. Any new subroutine instrumentation that uses the `policyInnerPreview:` prefix would inflate the inclusive bucket and double-count — new keys MUST use a non-`policyInnerPreview:` prefix.
3. **The renderer's "Continued-Deepening No-Counter Residual Split" wording asserts inclusive-vs-nested non-additivity** ("`*-nested` rows are child hot-path evidence inside that orchestration bucket and are not additive with it"). **Confirmed** at `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs:611`. Phase 0 must preserve that wording — Foundation #14 forbids parallel report shapes.
4. **The witness command from `178POLWASMPERF-005`** runs against seeds `1005,1011,1008,1013,1009` with `--profile-buckets` and produces `reports/fitl-arvn-15-seed-decomposition-<date>-<descriptor>.csv` + `.md`. **Confirmed** at `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs`. Phase 0 reuses this command verbatim with a new `--date` descriptor; no script wiring change is needed.
5. **The unit test that proves the residual-split rendering shape** lives at `packages/engine/test/unit/infrastructure/profile-fitl-arvn-report-rendering.test.ts`. **Confirmed** by the `178POLWASMPERF-005` ticket Outcome ledger. Phase 0 extends this test in place per Foundation #14, not creating a parallel test.

## Architecture Check

1. **Generic engine code only.** `runChooseOneInnerPreview` and the surfaceContext / seatResolutionIndex setup are policy-agent-generic; no FITL-specific branches exist on the chooseOne path. The new brackets land at the generic policy-preview seam.
2. **Bucket-naming contract preserved.** New keys use a non-`policyInnerPreview:` prefix (proposal: `policyInnerPreviewSubroutine:` per spec §10) so the classifier's wrapping inclusive bucket is not contaminated. The classifier gets one new case mapping the new prefix to a new nested family name (proposal: `inner-preview-subroutine-nested`).
3. **No parallel report shape.** The existing `Continued-Deepening No-Counter Residual Split` section is extended in place — the new nested family appears as an additional classification row in the existing table, not as a new section. Foundation #14 satisfied.
4. **Measurement-only change.** No production behavior change. The new `perfHotPath` brackets are passive observers; selection outcomes, route counters, unsupported reasons, and advisory carriers are unchanged. Foundation #20 carriers untouched.

## What to Change

### 1. Add subroutine-level `perfHotPath` brackets inside `runChooseOneInnerPreview`

In `packages/engine/src/agents/policy-preview-inner.ts:511-555`, bracket the three named subroutine candidates. Final key names are an Open Question in spec §10; the proposed defaults are:

- `policyInnerPreviewSubroutine:surfaceSetup` — wraps the `buildSeatResolutionIndex` + `surfaceContext` build at lines 512–522 (per-call, once per `runChooseOneInnerPreview` invocation).
- `policyInnerPreviewSubroutine:driveOption` — wraps the `driveOption(input, decision)` call at line 526 (per-option, fires once per legal chooseOne option).
- `policyInnerPreviewSubroutine:resolveRefs` — wraps the `resolveRefs(input, drive, surfaceContext, seatResolutionIndex)` call at line 527 (per-option).

Per-option brackets fire many times per orchestration call (one per legal option, with ~997 average options per primary-axis decision). If wall-time overhead from `performance.now` skews the inclusive bucket by more than 2% on the witness run, downgrade the per-option `resolveRefs` bracket to a coarser per-call aggregation (spec §10 Open Question — revisit only if measured skew exceeds the threshold). The default is per-call brackets.

Import `perfHotPathStart` and `perfHotPathEnd` from `../kernel/perf-profiler.js` at the top of the file (matching the import pattern in `policy-agent-inner-preview.ts`).

### 2. Extend the renderer's classifier to recognize the new prefix

In `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs`, extend `classifyContinuedDeepeningBucket` at `:559-577` to add a case for the new prefix:

```js
if (text.startsWith('policyInnerPreviewSubroutine:')) {
  return 'inner-preview-subroutine-nested';
}
```

Place the new case before the existing `existing-hot-path-bucket-nested` block. Keep `other-instrumented-bucket-nested` as the final fallback.

The "Continued-Deepening No-Counter Residual Split" intro prose at `:611` MUST remain unchanged. The new nested family appears as additional rows in the same table.

### 3. Extend the report-rendering test

In `packages/engine/test/unit/infrastructure/profile-fitl-arvn-report-rendering.test.ts`, extend the existing residual-split assertion to also assert that a key with prefix `policyInnerPreviewSubroutine:` classifies as `inner-preview-subroutine-nested`. Keep the existing assertions for the three pre-existing nested families intact.

### 4. Produce the Phase 0 witness report

Run the witness command:

```
pnpm -F @ludoforge/engine build
pnpm -F @ludoforge/engine exec node scripts/profile-fitl-arvn-15-seed-decomposition.mjs \
  --seeds 1005,1011,1008,1013,1009 \
  --timeout-ms 600000 \
  --date 2026-MM-DD-spec-178-phase-0-inner-preview-subroutine-split \
  --profile-buckets
```

This writes `reports/fitl-arvn-15-seed-decomposition-2026-MM-DD-spec-178-phase-0-inner-preview-subroutine-split.csv` and `.md`.

Then author `reports/178-phase-0-inner-preview-subroutine-split.md` recording:

- The exact command and the resulting CSV/MD artifact paths.
- The same-run slow-tier wall total and the 5% bar (derived from the new run).
- The `Continued-Deepening No-Counter Residual Split` rows for `coupArvnRedeployPolice:chooseOne | continuedDeepening`, now including the new `inner-preview-subroutine-nested` family broken out by sub-key (`surfaceSetup`, `driveOption`, `resolveRefs`).
- The per-subroutine wall ms and share of same-run slow-tier wall.
- Identification of the named subroutine owner (the sub-key with the highest share — Phase 1's optimization target).
- The unattributed-after-top-level-orchestration residual rendered separately (must remain small — the new nested family is expected to absorb most of the previously-unattributed `~4,370 ms`).
- Foundation alignment table (#1, #14, #15, #16, #20).
- Final recommendation: `create-implementation-ticket: Optimize <named subroutine owner>` if the named owner clears the 5% bar; otherwise `create-investigation-ticket: <next gap>` or `stop: no-material-owner-found`.

## Files to Touch

- `packages/engine/src/agents/policy-preview-inner.ts` (modify — add 3 perfHotPath brackets, import the helpers)
- `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` (modify — extend `classifyContinuedDeepeningBucket` with the new prefix case)
- `packages/engine/test/unit/infrastructure/profile-fitl-arvn-report-rendering.test.ts` (modify — extend the residual-split assertion to cover the new family)
- `reports/178-phase-0-inner-preview-subroutine-split.md` (new — Phase 0 witness report)
- `reports/fitl-arvn-15-seed-decomposition-2026-MM-DD-spec-178-phase-0-inner-preview-subroutine-split.csv` (new — generated)
- `reports/fitl-arvn-15-seed-decomposition-2026-MM-DD-spec-178-phase-0-inner-preview-subroutine-split.md` (new — generated)

## Out of Scope

- No optimization. This ticket is measurement-only; no production behavior change. The optimization lands in `178CONTDEEPINNER-002` based on this ticket's named owner.
- No instrumentation on the chooseNStep deep-pass orchestration (`runChooseNStepInnerPreview`, `runDeepPass`). That axis family is out of scope per spec §9.
- No WASM route changes, no GameSpecDoc / visual config / kernel changes, no policy-profile tuning.
- No new advisory carrier, no new unsupported-reason class, no Foundation #20 contract change.
- No CI integration of the witness report; it remains a manual artifact.
- No changes to `packages/engine/src/agents/policy-agent-inner-preview.ts`. The wrapping `policyInnerPreview:chooseOneRun` and `policyInnerPreview:summarizeUsage` brackets already live there and define the inclusive bucket — they remain untouched.

## Acceptance Criteria

### Tests That Must Pass

1. The existing residual-split test in `packages/engine/test/unit/infrastructure/profile-fitl-arvn-report-rendering.test.ts` still passes after the classifier extension.
2. The new assertion proves that a key with prefix `policyInnerPreviewSubroutine:` classifies as `inner-preview-subroutine-nested`.
3. Existing suite: `pnpm -F @ludoforge/engine exec node --test dist/test/unit/infrastructure/profile-fitl-arvn-report-rendering.test.js` passes.
4. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck` pass at the workspace root.
5. `pnpm run check:ticket-deps` passes.

### Invariants

1. The renderer's "`*-nested` rows are child hot-path evidence inside that orchestration bucket and are not additive with it" wording at `profile-fitl-arvn-15-seed-report-rendering.mjs:611` is unchanged.
2. Existing `perfHotPath` bucket keys under the `policyInnerPreview:` prefix (`chooseOneRun`, `summarizeUsage`, `chooseNStepBroadRun`, `chooseNStepBroadSignals`, `chooseNStepDeepPass`, `chooseNStepFinalSignals`) are unchanged.
3. Selection outcomes on the witness corpus are unchanged. The instrumentation is a passive observer. (Verified implicitly via the existing kernel determinism corpus continuing to pass.)
4. Route counters, unsupported reasons, advisory status, and Foundation #20 carriers are unchanged across the witness run.
5. The Phase 0 witness report's named subroutine owner is identified by name and clears the 5% same-run-slow-tier-wall bar on `coupArvnRedeployPolice:chooseOne | continuedDeepening`, OR the report explicitly records that no single sub-key clears the bar and recommends `create-investigation-ticket` / `stop` instead of cascading silently into `178CONTDEEPINNER-002`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/infrastructure/profile-fitl-arvn-report-rendering.test.ts` — extend to assert the new `policyInnerPreviewSubroutine:` → `inner-preview-subroutine-nested` mapping. Marker: existing file's `@test-class` marker stands; no new file.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/infrastructure/profile-fitl-arvn-report-rendering.test.js`
3. `pnpm -F @ludoforge/engine exec node scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005,1011,1008,1013,1009 --timeout-ms 600000 --date 2026-MM-DD-spec-178-phase-0-inner-preview-subroutine-split --profile-buckets`
4. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`
5. `pnpm run check:ticket-deps`
6. `git diff --check`

## Outcome

Outcome amended: 2026-05-17
Outcome amended: 2026-05-17 - post-review archive path cleanup for Spec 178.

Completed on 2026-05-17. Phase 0 instrumentation and witness generation landed:

- `packages/engine/src/agents/policy-preview-inner.ts` now emits passive `perfHotPath` buckets for `policyInnerPreviewSubroutine:surfaceSetup`, `policyInnerPreviewSubroutine:driveOption`, and `policyInnerPreviewSubroutine:resolveRefs` inside `runChooseOneInnerPreview`.
- `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` maps the new `policyInnerPreviewSubroutine:` prefix to the existing residual-split section as `inner-preview-subroutine-nested`; the load-bearing inclusive-vs-nested wording is unchanged.
- `packages/engine/test/unit/infrastructure/profile-fitl-arvn-report-rendering.test.ts` extends the existing renderer invariant test to prove the new nested family.
- The generated witness artifacts are:
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-spec-178-phase-0-inner-preview-subroutine-split.csv`
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-spec-178-phase-0-inner-preview-subroutine-split.md`
- The authored Phase 0 report is `reports/178-phase-0-inner-preview-subroutine-split.md`.
- The decisive witness completed all five seeds. Same-run slow-tier wall was `93,769.23 ms`; the `5%` bar was `4,688.46 ms`.
- Named owner: `policyInnerPreviewSubroutine:driveOption` on `coupArvnRedeployPolice:chooseOne | continuedDeepening`, with `6,804.08 ms` (`7.2562%` of same-run slow-tier wall). Phase 1 owner: `archive/tickets/178CONTDEEPINNER-002.md`.
- Generated fallout: checked-in report/CSV artifacts only; no schema, GameSpecDoc, visual config, WASM, or profile artifact changes expected.
- Verification:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/infrastructure/profile-fitl-arvn-report-rendering.test.js` passed before and after the broad build/typecheck sequence.
  - `pnpm -F @ludoforge/engine exec node scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005,1011,1008,1013,1009 --timeout-ms 600000 --date 2026-05-17-spec-178-phase-0-inner-preview-subroutine-split --profile-buckets` passed and wrote the generated CSV/Markdown artifacts.
  - `pnpm turbo build` passed. Engine and runner builds executed; engine-wasm build replayed from cache and is supplemental because this ticket did not touch engine-wasm.
  - `pnpm turbo lint` passed. Engine lint executed; runner lint replayed from cache and is supplemental because this ticket did not touch runner source.
  - `pnpm turbo typecheck` passed. Engine and runner typechecks executed; engine build replayed from the fresh root build cache.
  - `pnpm run check:ticket-deps` passed before terminal status.
  - `git diff --check` passed. Targeted `git diff --no-index --check /dev/null <path>` checks for retained untracked ticket/spec/report/CSV/Markdown artifacts emitted no whitespace diagnostics.
- Source-size ledger: `packages/engine/src/agents/policy-preview-inner.ts | before 555 | after 562 | crossed cap? no | active growth +7 | extraction/defer rationale: under cap and growth is localized instrumentation | successor none`; `packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs | before 669 | after 672 | crossed cap? no | active growth +3 | extraction/defer rationale: preexisting near-guidance renderer script, single classifier case only | successor none`; `packages/engine/test/unit/infrastructure/profile-fitl-arvn-report-rendering.test.ts | before 166 | after 169 | crossed cap? no | active growth +3 | extraction/defer rationale: under cap | successor none`.
- Late-edit proof validity: terminal status/proof transcription only; no scope, acceptance criteria, command semantics, touched-file ownership, dependency ownership, or follow-up owner changed after the final proof lanes.
