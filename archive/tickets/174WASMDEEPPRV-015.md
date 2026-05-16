# 174WASMDEEPPRV-015: Phase 4d — Optimize zero-counter continuedDeepening token/query residuals

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — generic token/query/runtime optimization only
**Deps**: `archive/tickets/174WASMDEEPPRV-014.md`

## Problem

`reports/174-phase-4c-residual-owner.md` shows that the dominant post-011 residual class is not a production preview-drive route failure. `coupArvnRedeployPolice:chooseOne` recorded `278705.94 ms` of measured agent-call time with `0` production preview-drive route count, `0` unsupported count, and `0` batch count. Its slow-tier top axis is dominated by token/query hot-path buckets, especially `tokenStateIndex:refreshCachedEntries` and `evalQuery:countMatchingTokens`.

The rejected default-flip ticket `tickets/174WASMDEEPPRV-010.md` remains non-actionable until the zero-counter runtime residual is reduced or disproved as the primary blocker.

## Assumption Reassessment (2026-05-16)

1. `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4c-residual.md` completed all 15 seeds and recorded the same production preview-drive route totals as the post-011 gate witness: route count `181`, unsupported count `3394`, batch count `1712`.
2. The largest residual classes `coupArvnRedeployPolice:chooseOne` and `coupArvnRedeployOptionalTroops:chooseOne` both record zero production preview-drive route, unsupported, and batch counts.
3. The top hot-path buckets for those zero-counter classes are generic token/query buckets, not FITL-specific rule branches and not WASM route activation.

## Architecture Check

1. Foundation #1 still forbids FITL-specific branches; any optimization must be generic over token indexes, query evaluation, state snapshots, or policy preview runtime lifetimes.
2. Foundation #11 allows scoped internal mutation only when isolated; cache or index reuse must prove no aliasing leaks across state transitions or preview branches.
3. Foundation #16 requires the optimization to prove both correctness and the measured residual classification before reopening any default-flip path.

## What to Change

### 1. Token/query residual probe

Add the smallest generic diagnostic or focused test needed to isolate why `coupArvnRedeployPolice:chooseOne` repeatedly refreshes token indexes and counts matching tokens during `continuedDeepening` chooseOne evaluation.

### 2. Generic optimization

Implement a generic token/query/runtime optimization only after the probe identifies a safe owner. Candidate seams include token-state-index lifetime reuse, query-count caching, or preview-branch state/index sharing. Do not add game-specific identifiers or policy-profile special cases.

### 3. Decisive witness

Rerun the Phase 4c witness or a justified bounded equivalent that still exercises the zero-counter chooseOne residual and reports:

- `coupArvnRedeployPolice:chooseOne` agent-call ms;
- token/query hot-path bucket totals;
- production preview-drive route/unsupported/batch counts, to prove the residual did not silently move into fallback route activity.

## Files to Touch

- `packages/engine/src/kernel/token-state-index.ts` (modify only if the probe selects token-index lifetime)
- `packages/engine/src/kernel/eval-query.ts` (modify only if the probe selects query-count reuse)
- `packages/engine/src/agents/` (modify only for generic preview-runtime lifetime ownership)
- `packages/engine/test/**` (new or modified focused correctness/perf guard)
- `reports/174-phase-4d-zero-counter-residual.md` (new)

## Out of Scope

- No default flip or A/B deletion.
- No FITL-specific runtime branch, profile retuning, GameSpecDoc change, or budget weakening.
- No attempt to solve the reason-granular unsupported preview-drive classes unless the zero-counter residual is first reduced or disproved as dominant.

## Acceptance Criteria

### Tests That Must Pass

1. A focused correctness test proves any new cache/index lifetime cannot mutate caller-visible state or cross-contaminate preview branches.
2. The Phase 4d report records the zero-counter residual before/after numbers and names whether the residual is reduced, disproved, or still dominant.
3. Existing engine suite remains green: `pnpm turbo test`.

### Invariants

1. Zero production preview-drive counters remain distinguishable from unsupported/fallback route activity.
2. Token/query optimization remains generic and deterministic across GameDef, state, seed, and actions.

## Test Plan

### New/Modified Tests

1. Add focused tests only after the selected generic owner is known from the probe.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds <bounded set including zero-counter residual witnesses> --timeout-ms 400000 --date <YYYY-MM-DD>-phase-4d-zero-counter --profile-buckets`
3. `pnpm turbo test && pnpm turbo lint && pnpm turbo typecheck`

## Outcome

Implementation completed on 2026-05-16 for the ticket-owned zero-counter residual. The parent default-flip path remains blocked by broader Phase 4 gate evidence.
Outcome amended: 2026-05-16

Authorization ledger:
- User approved the Foundation-aligned reassessment recommendation to revert the first token-index candidate and close this attempt as a truthful blocked investigation result.
- User approved the Foundation-aligned same-ticket continuation path after the rejected candidates left no successor.
- User approved the final Foundation-aligned Option 1 closeout: keep the retained narrow optimization, leave `-015` blocked/partial, do not archive, and do not create a successor without a new non-overlapping owner.
- User approved the recommended diagnostic-only continuation after Option 1; no retained source changes were authorized without a new concrete owner.
- User approved continuing with Option 1 again after the retained preview-publication candidate; the continuation was diagnostic-first and retained code only after the owner probe identified a concrete improving generic path.
- Scope effect: rejected candidates remain evidence only; the retained runtime/test diff is limited to generic per-refresh zone occurrence reuse, preview no-hash state-only publication, and suspended-continuation viability-probe elision, with parity/guard coverage.

Landed scope:
- Produced the bounded Phase 4d witness at `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-zero-counter-seed1005.md` and `.csv`.
- Produced the owner-isolation continuation witness at `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-owner-probe-seed1005.md` and `.csv`.
- Produced the rejected structural-count-cache candidate witness at `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-structural-count-cache-seed1005.md` and `.csv`.
- Produced the token-index shape-probe witness at `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-token-index-shape-probe-seed1005.md` and `.csv`.
- Produced the retained zone-occurrence reuse witness at `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-zone-occurrence-reuse-seed1005.md` and `.csv`.
- Produced the rejected prior-zone skip continuation witness at `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-prior-zone-skip-seed1005.md` and `.csv`.
- Produced the diagnostic-only choose-one drive publication probe at `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-chooseone-drive-probe-seed1005.md` and `.csv`.
- Produced the retained preview publication state-only witness at `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-preview-publish-state-only-seed1005.md` and `.csv`.
- Produced the post-preview owner probe at `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-post-preview-owner-probe-seed1005.md` and `.csv`.
- Produced the publish legal-actions probe at `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-publish-legal-actions-probe-seed1005.md` and `.csv`.
- Produced the continuation-support probe at `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-continuation-support-probe-seed1005.md` and `.csv`.
- Produced the retained suspended viability-skip witness at `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4d-suspended-viability-skip-seed1005.md` and `.csv`.
- Produced `reports/174-phase-4d-zero-counter-residual.md`.
- Reverted the attempted `tokenStateIndex:refreshCachedEntries` prior-index-hit optimization after it regressed the bounded witness.
- Reverted temporary `evalQuery:countMatchingTokens` owner-isolation instrumentation after capturing the continuation witness; no source or test diff is retained.
- Reverted the attempted structural count-cache optimization after it activated but regressed the bounded witness; no source or test diff is retained.
- Reverted temporary `tokenStateIndex:refreshCachedEntries` shape instrumentation after capturing the token-index shape-probe witness; no source or test diff is retained.
- Retained generic per-refresh zone occurrence reuse inside `refreshCachedEntries`, with focused parity coverage for a multi-token, multi-zone refresh.
- Reverted the attempted prior-zone duplicate-scan skip after it regressed the bounded witness; no source or test diff beyond the retained zone-occurrence reuse candidate is kept.
- Reverted temporary choose-one drive publication instrumentation after capturing the diagnostic witness; no additional source or test diff is retained.
- Retained generic preview no-hash state-only publication for stack-top microturns in `publishMicroturnFromPreviewStateNoHash`, with parity coverage proving legal-action equivalence to canonical publication while omitting intermediate observation derivation.
- Reverted temporary post-preview owner, publish legal-actions, and continuation-support instrumentation after capturing diagnostic witnesses.
- Retained generic suspended-continuation viability-probe elision in stack-top publication: already-suspended effect-frame continuations now rely on `resumeSuspendedEffectFrame` plus publication admission and bridgeability checks instead of rerunning full `probeMoveViability` for every option.

Rejected candidate:
- Candidate: same-slot unique-token token-index refresh shortcut in `packages/engine/src/kernel/token-state-index.ts`, with a focused regression in `packages/engine/test/kernel/token-state-index-incremental.test.ts`.
- Correctness proof while candidate existed: `pnpm -F @ludoforge/engine build` passed, then `pnpm -F @ludoforge/engine exec node --test dist/test/kernel/token-state-index-incremental.test.js` passed after the candidate was adjusted to keep safety metadata internal.
- Decisive measured proof while candidate existed: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-zero-counter-seed1005 --profile-buckets` passed, but seed `1005` wall time regressed from the Phase 4c baseline `101783.04 ms` to `137795.87 ms`.
- Activation evidence: the candidate emitted `tokenStateIndex:refreshCachedEntriesPriorIndexHit=4228667` for `coupArvnRedeployPolice:chooseOne`, proving the fast path activated.
- Rejection rationale: activation did not reduce the residual; retaining the runtime diff would violate Foundations #15 and #16 by adding non-improving hot-path complexity.
- Candidate: structural count-cache reuse for context-independent compiled token filters across cloned token arrays, extracted to `packages/engine/src/kernel/token-filter-query-cache.ts`, with a focused regression in `packages/engine/test/unit/kernel/token-filter-query-cache.test.ts`.
- Correctness proof while candidate existed: `pnpm -F @ludoforge/engine build` passed, then `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/token-filter-query-cache.test.js` passed.
- Decisive measured proof while candidate existed: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-structural-count-cache-seed1005 --profile-buckets` passed, but seed `1005` wall time regressed from the owner-probe baseline `102576.42 ms` to `103349.93 ms`, and the top zero-counter class regressed from `42112.11 ms` to `43018.87 ms`.
- Activation evidence: `evalQuery:countMatchingTokensStructuralCacheHit=1732714`, `evalQuery:countMatchingTokensCompiled` dropped from `1738266` to `5552`, and the timed `evalQuery:countMatchingTokens` bucket dropped from `2523.72 ms` to `12.96 ms` for the top residual class.
- Rejection rationale: the local query-count submetric improved, but the decisive seed wall time and top zero-counter class did not. Retaining the runtime diff would violate Foundations #15 and #16 by preserving non-root-cause hot-path complexity.
- Candidate: prior-zone duplicate-scan skip inside `refreshCachedEntries`, skipping prior-entry zone scan calls when the prior zone was already included in `mutatedZoneIds`.
- Correctness proof while candidate existed: `pnpm -F @ludoforge/engine build` passed, then `pnpm -F @ludoforge/engine exec node --test dist/test/kernel/token-state-index-incremental.test.js` passed.
- Decisive measured proof while candidate existed: `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-prior-zone-skip-seed1005 --profile-buckets` passed, but seed `1005` wall time regressed from the retained zone-occurrence baseline `101758.60 ms` to `103081.91 ms`, and the top zero-counter class regressed from `40590.39 ms` to `41340.25 ms`.
- Rejection rationale: the candidate targeted a real duplicate-scan shape from the probe, but it worsened the decisive residual. Retaining it would violate Foundations #15 and #16 by preserving non-improving hot-path complexity.

Residual classification:
- `coupArvnRedeployPolice:chooseOne` remains the dominant zero-counter class in the bounded witness with `71070.51 ms`, production preview-drive route count `0`, unsupported count `0`, and batch count `0`.
- The owner-isolation continuation kept `coupArvnRedeployPolice:chooseOne | continuedDeepening` as the top residual class at `42112.11 ms`, also with production preview-drive route count `0`, unsupported count `0`, and batch count `0`.
- The temporary query-count probe points away from overlay or context-dependent filter ownership: for that top residual class, `evalQuery:countMatchingTokensCacheEligible=42927095`, `evalQuery:countMatchingTokensNoOverlay=42927095`, `evalQuery:countMatchingTokensCacheHit=41188829`, and `evalQuery:countMatchingTokensCacheMiss=1738266`.
- Structural query-count reuse alone has now been rejected. The remaining actionable owner is a lower-overhead token-index reuse path that reduces `refreshCachedEntries` without adding per-token hot-path work.
- The token-index shape probe narrowed that owner: in `coupArvnRedeployPolice:chooseOne | continuedDeepening`, `15270074` affected-token refreshes were prior-single and result-single, while `refreshCachedEntries` performed `20336478` zone scans over `279810798` scanned zone-token entries.
- The retained zone-occurrence reuse candidate reduced the bounded seed `1005` wall time from the token-index shape-probe baseline `102593.12 ms` to `101758.60 ms`, narrowly below the Phase 4c seed baseline `101783.04 ms`.
- The retained candidate reduced `coupArvnRedeployPolice:chooseOne | continuedDeepening` from `40844.39 ms` to `40590.39 ms`, with production preview-drive route count `0`, unsupported count `0`, and batch count `0`.
- The retained candidate reduced `tokenStateIndex:refreshCachedEntries` for that top class from `7207.27 ms` to `6551.81 ms`; `evalQuery:countMatchingTokens` remains active at `2651.23 ms`.
- The post-retention prior-zone skip continuation regressed seed `1005` to `103081.91 ms` and was reverted, so the retained zone-occurrence reuse result remains the decisive final implementation sample.
- The diagnostic-only choose-one drive probe completed seed `1005` in `101848.76 ms` and kept `coupArvnRedeployPolice:chooseOne | continuedDeepening` as the top zero-counter residual class at `40296.76 ms`.
- The probe identified `policyPreviewInner:chooseOne:publishContinuation` as the dominant remaining timed owner: `2400` calls totaling `35557.18 ms`, inside `policyPreviewInner:chooseOne:driveOption` at `39510.64 ms`.
- The retained preview-publication state-only candidate reduced the bounded seed `1005` wall time from `101758.60 ms` to `99047.62 ms`, and reduced `coupArvnRedeployPolice:chooseOne | continuedDeepening` from `40590.39 ms` to `39805.08 ms`.
- The retained preview-publication candidate preserved production preview-drive route count `0`, unsupported count `0`, and batch count `0` for the top zero-counter class.
- `tokenStateIndex:refreshCachedEntries` remains active at `6410.68 ms` and `evalQuery:countMatchingTokens` remains active at `2497.73 ms` for the top class.
- The post-preview owner probe kept `coupArvnRedeployPolice:chooseOne | continuedDeepening` as the top zero-counter residual class at `44584.62 ms`; `policyPreviewInner:chooseOne:loopPublish` accounted for `39449.11 ms`.
- The publish legal-actions probe narrowed that owner: `publish:isSupportedFrameContinuationMove` accounted for `37472.30 ms` across `61638` option-continuation support checks.
- The continuation-support probe narrowed the owner further: `publish:isSupportedContinuationResult:probeMoveViability` accounted for `32644.45 ms` across the same `61638` support checks.
- The retained suspended-continuation viability-skip candidate reduced the bounded seed `1005` wall time from `99047.62 ms` to `66089.91 ms`.
- It reduced `coupArvnRedeployPolice:chooseOne | continuedDeepening` from `39805.08 ms` to `8828.85 ms`, moving that class from rank `1` to rank `3` in the slow-axis table.
- The retained candidate preserved production preview-drive route count `0`, unsupported count `0`, and batch count `0` for the zero-counter class.
- For that class, `tokenStateIndex:refreshCachedEntries` fell from `6410.68 ms` to `1572.76 ms`; `evalQuery:countMatchingTokens` fell from `2497.73 ms` to `226.50 ms`.
- The ticket-owned zero-counter residual is reduced and no longer dominant in the bounded witness. The parent default-flip path remains blocked by broader Phase 4 gate work: the bounded sample is now dominated by `train:chooseNStep:add` and `train:chooseNStep:confirm` continued-deepening classes with reason-granular unsupported preview-drive activity.

Generated/artifact fallout: checked-in Phase 4d witness Markdown/CSV, owner-probe Markdown/CSV, structural-count-cache candidate Markdown/CSV, token-index shape-probe Markdown/CSV, zone-occurrence reuse Markdown/CSV, prior-zone skip Markdown/CSV, choose-one drive probe Markdown/CSV, preview publication state-only Markdown/CSV, post-preview owner-probe Markdown/CSV, publish legal-actions probe Markdown/CSV, continuation-support probe Markdown/CSV, suspended viability-skip Markdown/CSV, and residual report were created. No schema, golden, GameSpecDoc, WASM ABI, or generated JSON diff is retained.

Source-size ledger:
- `packages/engine/src/kernel/token-state-index.ts | before 484 | after 504 | crossed cap? no | active growth 20 lines retained | extraction/defer rationale: focused local helper inside under-cap file | successor if any: broader Phase 4 gate owner, not this zero-counter residual ticket`
- `packages/engine/src/kernel/microturn/publish.ts | before 961 | after 961 | crossed cap? already over cap, no active line growth | active growth 0 source lines retained after formatting | extraction/defer rationale: no line growth in preexisting over-cap source | successor if any: broader Phase 4 gate owner, not this zero-counter residual ticket`
- `packages/engine/test/kernel/token-state-index-incremental.test.ts | before 534 | after 570 | crossed cap? no | active growth 36 lines retained | extraction/defer rationale: focused under-cap parity test | successor if any: none`
- `packages/engine/test/unit/kernel/microturn-publication.test.ts | before 549 | after 587 | crossed cap? no | active growth 38 lines retained | extraction/defer rationale: focused under-cap parity test | successor if any: none`
- `packages/engine/src/kernel/eval-query.ts | before 1400 | after 1400 | crossed cap? no active growth | temporary owner-isolation counters and the rejected structural-count-cache integration were added and reverted; no retained source diff | successor if any: broader Phase 4 gate owner, not this zero-counter residual ticket`
- `packages/engine/src/kernel/token-filter-query-cache.ts | before 0 | after 0 | crossed cap? no | active growth none; rejected candidate file deleted | extraction/defer rationale: no retained source diff | successor if any: none`
- `packages/engine/test/unit/kernel/token-filter-query-cache.test.ts | before 0 | after 0 | crossed cap? no | active growth none; rejected candidate file deleted | extraction/defer rationale: no retained test diff | successor if any: none`

Command ledger:
- Test Plan | `pnpm -F @ludoforge/engine build` | ran before candidate measurement; passed.
- Focused candidate proof | `pnpm -F @ludoforge/engine exec node --test dist/test/kernel/token-state-index-incremental.test.js` | first failed red on the new same-slot scan assertion, then passed after the candidate changed; candidate later rejected and reverted.
- Test Plan | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds <bounded set including zero-counter residual witnesses> --timeout-ms 400000 --date <YYYY-MM-DD>-phase-4d-zero-counter --profile-buckets` | substituted with bounded seed `1005` witness; passed and wrote the Phase 4d witness Markdown/CSV, but classified the candidate as rejected due to regression.
- Owner-isolation continuation | `pnpm -F @ludoforge/engine build` | passed before the temporary query-count instrumentation probe.
- Owner-isolation continuation | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-owner-probe-seed1005 --profile-buckets` | passed and wrote the owner-probe Markdown/CSV under temporary instrumentation.
- Owner-isolation continuation | `pnpm -F @ludoforge/engine build` | passed after reverting the temporary instrumentation, restoring `dist` to match retained source.
- Structural-count-cache candidate proof | `pnpm -F @ludoforge/engine build` | passed while candidate existed.
- Structural-count-cache candidate proof | `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/token-filter-query-cache.test.js` | passed while candidate existed.
- Structural-count-cache candidate proof | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-structural-count-cache-seed1005 --profile-buckets` | passed and wrote the structural-count-cache candidate Markdown/CSV, but classified the candidate as rejected due to regression.
- Structural-count-cache cleanup | `pnpm -F @ludoforge/engine build` | passed after reverting the candidate, restoring `dist` to match retained source.
- Token-index shape probe | `pnpm -F @ludoforge/engine build` | passed before temporary token-index shape instrumentation.
- Token-index shape probe | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-token-index-shape-probe-seed1005 --profile-buckets` | passed and wrote the token-index shape-probe Markdown/CSV under temporary instrumentation.
- Token-index shape cleanup | `pnpm -F @ludoforge/engine build` | passed after reverting the temporary instrumentation, restoring `dist` to match retained source.
- Zone-occurrence reuse correctness | `pnpm -F @ludoforge/engine build` | passed with retained candidate.
- Zone-occurrence reuse correctness | `pnpm -F @ludoforge/engine exec node --test dist/test/kernel/token-state-index-incremental.test.js` | passed with retained candidate.
- Zone-occurrence reuse witness | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-zone-occurrence-reuse-seed1005 --profile-buckets` | passed and wrote the zone-occurrence reuse Markdown/CSV; classified as a narrow improvement with residual still active.
- Prior-zone skip candidate proof | `pnpm -F @ludoforge/engine build` | passed while candidate existed.
- Prior-zone skip candidate proof | `pnpm -F @ludoforge/engine exec node --test dist/test/kernel/token-state-index-incremental.test.js` | passed while candidate existed.
- Prior-zone skip candidate proof | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-prior-zone-skip-seed1005 --profile-buckets` | passed and wrote the prior-zone skip Markdown/CSV, but classified the candidate as rejected due to regression.
- Prior-zone skip cleanup | `pnpm -F @ludoforge/engine build` | passed after reverting the candidate, restoring `dist` to match retained source.
- Choose-one drive publication probe | `pnpm -F @ludoforge/engine build` | passed with temporary diagnostic instrumentation.
- Choose-one drive publication probe | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-chooseone-drive-probe-seed1005 --profile-buckets` | passed and wrote the diagnostic Markdown/CSV under temporary instrumentation; classified the next concrete owner as preview-state continuation publication.
- Choose-one drive publication cleanup | `pnpm -F @ludoforge/engine build` | passed after reverting the temporary instrumentation, restoring `dist` to match retained source.
- Preview publication state-only correctness | `pnpm -F @ludoforge/engine build` | passed with retained candidate.
- Preview publication state-only correctness | `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/microturn-publication.test.js` | passed with retained candidate.
- Preview publication state-only correctness | `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-inner-chooseone.test.js` | passed with retained candidate.
- Preview publication state-only witness | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-preview-publish-state-only-seed1005 --profile-buckets` | passed and wrote the preview publication state-only Markdown/CSV; classified as an improvement with residual still active.
- Post-preview owner probe | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-post-preview-owner-probe-seed1005 --profile-buckets` | passed under temporary instrumentation; identified `policyPreviewInner:chooseOne:loopPublish` as the dominant remaining owner.
- Publish legal-actions probe | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-publish-legal-actions-probe-seed1005 --profile-buckets` | passed under temporary instrumentation; identified repeated `publish:isSupportedFrameContinuationMove` checks as the publication owner.
- Continuation-support probe | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-continuation-support-probe-seed1005 --profile-buckets` | passed under temporary instrumentation; identified repeated `probeMoveViability` reprobes as the concrete owner.
- Suspended viability-skip correctness | `pnpm -F @ludoforge/engine build` | passed with retained candidate.
- Suspended viability-skip correctness | `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/microturn-publication.test.js` | passed with retained candidate, including the resumed invalid-option publication guard.
- Suspended viability-skip correctness | `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-inner-chooseone.test.js` | passed with retained candidate.
- Suspended viability-skip witness | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-16-phase-4d-suspended-viability-skip-seed1005 --profile-buckets` | passed and wrote the suspended viability-skip Markdown/CSV; classified as an improvement that reduces and deprioritizes the zero-counter residual.
- Test Plan | `pnpm turbo test` | passed with retained runtime/test diff; turbo reported 5 successful tasks, 5 total, with engine default summary `85/85 files passed`.
- Test Plan | `pnpm turbo lint` | passed with retained runtime/test diff.
- Test Plan | `pnpm turbo typecheck` | passed with retained runtime/test diff.

Late-edit proof validity: reverting the rejected source/test candidates invalidated their earlier focused green tests as implementation proof, so they are retained only as rejected-candidate evidence. The bounded rejected-candidate witnesses remain valid as evidence for the rejected candidates because they were intentionally captured before each revert and are transcribed as candidate evidence, not as proof of retained runtime behavior. The owner-probe, token-index shape-probe, choose-one drive publication, post-preview owner, publish legal-actions, and continuation-support witnesses are valid as diagnostic evidence captured under explicitly temporary instrumentation; the instrumentation was reverted and the engine was rebuilt afterward, so they are not implementation proof. The prior-zone skip witness is valid as rejected-candidate evidence only; its source diff was reverted and the engine was rebuilt afterward. The zone-occurrence reuse, preview publication state-only, and suspended viability-skip correctness tests and bounded witnesses remain valid for retained source because no later source edit has changed those retained implementations.

Post-review archive status: archived. The ticket-owned zero-counter residual is reduced and no longer dominant in the bounded witness; `tickets/174WASMDEEPPRV-010.md` remains blocked by the broader Phase 4 gate until a later measured gate records a pass.
Next workflow: do not reopen `tickets/174WASMDEEPPRV-010.md` until a later measured gate records a pass. Any successor should target the new dominant reason-granular unsupported `train:chooseNStep` continued-deepening classes, not duplicate this zero-counter owner.
