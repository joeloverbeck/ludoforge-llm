# 173DEEPPRVCOST-005: Phase 1 — Coup ARVN redeploy police continuedDeepening residual closure

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — secondary continuedDeepening hot-path residual
**Deps**: `archive/tickets/173DEEPPRVCOST-004.md`, `specs/173-deep-preview-drive-cost-reduction.md`

## Problem

Ticket `173DEEPPRVCOST-004` closed the train continuedDeepening elapsed gates, but the post-004 final witness still leaves Spec 173's slowest-seed soft target red:

- Slowest seed `1005`: `80,502.7 ms`, still above the Spec 173 `<=60 s` soft target.
- `train:chooseNStep:add | continuedDeepening`: `1,559.7078 ms`, now below the `<=1,800 ms` train gate.
- `train:chooseNStep:confirm | continuedDeepening`: `1,085.0019 ms`, now below the `<=1,300 ms` train gate.

With the train-owned gates closed, the next non-overlapping continuedDeepening residual selected by the final witness is:

- `coupArvnRedeployPolice:chooseOne | continuedDeepening`: 52 slow-tier decisions, `38,938.6 ms` total, `748.8192 ms` slow mean, `408.5609 ms` fast mean, slow:fast ratio `1.8328`.

This ticket owns that secondary residual. It must not reopen train-specific work unless the investigation proves a shared generic mechanism benefits the selected coup axis without changing train semantics.

## Assumption Reassessment (2026-05-15)

1. **The train elapsed gates are no longer the selected owner.** Confirmed by `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-004-final.md`: train add and confirm slow means are below their gates, with encoded builds and token-index builds still at `0`.
2. **Spec 173 remains active.** Confirmed by the same witness: slowest seed `1005` remains above `<=60 s`, so §4.2(a) has not been met.
3. **The next owner is still generic engine work.** The selected row is a continuedDeepening preview-drive cost in generic choose-one decision evaluation; no FITL-specific rule/profile mutation is allowed.
4. **This is not a duplicate of tickets 002-004.** Tickets 002-004 exhausted the train encoded-state, token-index, projection-key, and decision-stack hash owners. This ticket starts from the post-004 final state and targets the next non-overlapping axis.
5. **Foundation alignment requires another measured slice.** Foundation #15 requires naming the residual root cause; Foundation #16 requires a witness-driven proof; Foundation #10 preserves existing preview-drive bounds.

## Architecture Check

1. **One-axis discipline is preserved.** This ticket targets one selected residual: `coupArvnRedeployPolice:chooseOne | continuedDeepening`.
2. **Engine-agnostic boundary preserved.** Any fix must operate on generic preview-drive, scoring, query, cache, or hash structures. No FITL action ids, card ids, faction ids, or profile tuning can enter engine code.
3. **No backwards-compatibility shims.** Replace or simplify the chosen hot path directly; do not retain parallel old/new routes.
4. **Determinism remains load-bearing.** Cache warmth or constant-factor reductions must not alter final state, decision streams, preview status, trace content, hashes, or aggregate `compositeScore`.

## What to Change

### 1. Investigate the post-004 coup residual

Use `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-004-final.md` as the baseline. Capture a CPU profile or targeted counter witness for seed `1005` or another slow-tier seed that exercises the selected row. Candidate seams to inspect:

- `packages/engine/src/agents/policy-preview-inner.ts` — choose-one inner preview drive and continuedDeepening cadence.
- `packages/engine/src/agents/microturn-option-eval.ts` and `policy-evaluation-core.ts` — repeated scoring/context construction.
- `packages/engine/src/kernel/eval-query.ts`, `resolve-ref.ts`, and selector/query caches — residual query work visible after train cache closures.
- `packages/engine/src/kernel/zobrist.ts` / `microturn/apply.ts` only if the profile proves shared hash cost remains dominant for the selected coup axis.

Document the chosen root owner in this ticket's `Outcome` section before terminal closeout.

### 2. Implement the smallest generic residual fix

The fix may be a query/cache reuse improvement, choose-one preview-drive constant-factor reduction, hash baseline reuse in a proven safe caller, or another generic change selected by the profile. It must:

- Preserve exact deterministic scoring and hash semantics.
- Preserve run-local reset behavior for any mutable or state-keyed cache.
- Avoid changing preview-drive bounds, policy profile data, FITL rules, or action definitions.
- Avoid weakening encoded-state projection-key collision safety or decision-stack digest correctness.

### 3. Re-run the witness

Run the same 15-seed decomposition witness with a fresh date/label after the fix lands. The report must show whether the selected coup residual improved and whether the slowest seed moved toward `<=60 s`.

## Files to Touch

- `packages/engine/src/agents/policy-preview-inner.ts` (likely inspect/modify)
- `packages/engine/src/agents/microturn-option-eval.ts` (possible modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` (possible modify)
- `packages/engine/src/kernel/eval-query.ts` or `packages/engine/src/kernel/resolve-ref.ts` (possible modify)
- `packages/engine/src/kernel/zobrist.ts` or `packages/engine/src/kernel/microturn/apply.ts` (possible modify only if the profile proves shared hash cost)
- `packages/engine/test/unit/agents/*` or nearby cache/query/hash tests (modify/add)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>.md` (new post-005 witness)
- `reports/fitl-arvn-15-seed-decomposition-<YYYY-MM-DD>.csv` (new post-005 witness)

## Out of Scope

- Train encoded-state, token-index, projection-key, and decision-stack hash closures already owned by tickets 002-004.
- Govern/event residual axes unless the post-005 witness makes one of them the next selected Spec 173 ticket.
- Preview-config retuning (`depthCap`, `maxOptions`, `chooseNBeamWidth`, `capClass`).
- Agent-profile mutation.
- WASM preview-drive ABI extension; that remains Phase-N / Spec 174 scope if Spec 173 escalation criteria fire.
- Kernel legality, apply, publication, or microturn protocol semantics unless the profile proves a generic correctness-preserving hot-path fix is the selected owner.

## Acceptance Criteria

### Tests That Must Pass

1. Focused correctness and cache-lifecycle tests for the chosen residual fix.
2. Determinism gates:
   - `packages/engine/test/determinism/spec-140-replay-identity.test.ts`
   - `packages/engine/test/determinism/forked-vs-fresh-runtime-parity.test.ts`
   - `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.ts`
   - `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.ts`
   - `packages/engine/test/integration/policy-bytecode-equivalence*.test.ts`
3. Behavioural-drift check: `pnpm -F @ludoforge/engine test:integration:fitl-rules`.
4. Existing suite: `pnpm turbo test --force`.

### Manual Verification

1. Re-run the decomposition witness:
   ```bash
   pnpm -F @ludoforge/engine build
   node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date <YYYY-MM-DD>
   ```
2. Confirm `coupArvnRedeployPolice:chooseOne | continuedDeepening` improves materially versus the post-004 final baseline:
   - Slow mean baseline: `748.8192 ms`.
   - Slow total baseline: `38,938.6 ms`.
3. Confirm train regressions do not reappear:
   - `train:chooseNStep:add | continuedDeepening` remains below `<=1,800 ms`.
   - `train:chooseNStep:confirm | continuedDeepening` remains below `<=1,300 ms`.
   - Train encoded builds and token-index builds remain `0`.
4. Confirm aggregate harness parity when feasible:
   ```bash
   /usr/bin/time -v bash campaigns/fitl-arvn-agent-evolution/harness.sh
   # compositeScore must match -3.1333; errors=0; truncated=0
   ```

### Invariants

1. **Determinism preserved.** Cache warmth changes no observable game result, hash, trace semantics, or replay output.
2. **Engine-agnostic boundary preserved.** No FITL-specific ids, faction branches, or profile data enter engine code.
3. **Run-local lifetime preserved.** Any mutable or state-keyed cache resets at run boundaries and cannot leak mutable descendants across runs.
4. **Train closures preserved.** Ticket 005 cannot regress the train gates closed by ticket 004.
5. **Measured residual handled truthfully.** If the selected coup axis improves but the spec-wide slowest seed remains above `<=60 s`, record the next owner rather than claiming Spec 173 complete.

## Test Plan

### New/Modified Tests

1. Focused test for the chosen residual fix — proves byte-equivalence to the fresh/uncached path and validates run-local/cache lifetime if applicable.
2. Focused perf/counter witness where applicable — proves the optimized path activates on the selected residual.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Focused test(s) selected by implementation.
3. `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date <YYYY-MM-DD>`
4. `pnpm -F @ludoforge/engine test:integration:fitl-rules`
5. Targeted determinism/equivalence gates listed above.
6. `pnpm turbo lint`
7. `pnpm turbo typecheck`
8. `pnpm turbo test --force`
9. `pnpm run check:ticket-deps`

## Diagnostic Update (2026-05-15)

Option-1 reassessment added opt-in profile-bucket attribution to the decomposition witness:

```bash
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1005 --timeout-ms 400000 --date 2026-05-15-post-005-profile-buckets-seed1005 --profile-buckets
```

Diagnostic output:

- `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-profile-buckets-seed1005.md`
- `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-profile-buckets-seed1005.csv`

For `coupArvnRedeployPolice:chooseOne | continuedDeepening`, the seed-1005 diagnostic row recorded 16 decisions, `18,380.85 ms` total, and `1,148.8032 ms` mean under instrumentation. The diagnostic hot-path buckets attribute that row primarily to:

- `tokenStateIndex:refreshCachedEntries`: 592,536 calls, `2,972.42 ms`.
- `evalQuery:countMatchingTokens`: 623,336 calls, `960.82 ms`.
- Decision-stack hashing is comparatively small for this row: `zobrist:digestDecisionStackFrame` `74.34 ms`, `zobrist:encodeDecisionStackFrame` `72.66 ms`.

User-approved option-1 reassessment after the red attempts changes the next implementation owner: stop pursuing token-state-index/query-count micro-caches for ticket closeout, and inspect the higher-level generic choose-one preview/scoring path above those kernel refreshes. Do not pursue the reverted digest-history, input-state clone-removal, grouped zone-scan, scalar-count, or same-zone no-op candidates as ticket-closeout fixes; their diagnostic witnesses are red/non-closeout artifacts.

### Red Implementation Attempts

Three generic implementation attempts were tested and reverted because the decisive same-command 15-seed witness did not improve the ticket target:

- Grouped token-state-index zone scan:
  - Smoke: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-zone-scan-seed1005-smoke.md`
  - Full witness: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005.md`
  - Result: `coupArvnRedeployPolice:chooseOne | continuedDeepening` regressed to `40,956.73 ms` total and `787.6295 ms` slow mean versus the post-004 baseline `38,938.6 ms` total and `748.8192 ms` slow mean.
- Scalar token-field count cache:
  - Smoke: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-scalar-count-seed1005-smoke.md`
  - Full witness: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-scalar-count.md`
  - Result: `coupArvnRedeployPolice:chooseOne | continuedDeepening` regressed to `41,235.54 ms` total and `792.9911 ms` slow mean versus the same baseline.
- Same-zone `moveToken` no-op shortcut:
  - Smoke: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-same-zone-noop-seed1005-smoke.md`
  - Full witness: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-same-zone-noop.md`
  - Result: `coupArvnRedeployPolice:chooseOne | continuedDeepening` regressed to `42,038.5 ms` total and `808.4326 ms` slow mean versus the same baseline, despite only 2,053 same-zone no-op skips in the target row.

### Implementation Update (2026-05-15)

The accepted option-1 owner was implemented in `packages/engine/src/agents/policy-preview-inner.ts`: choose-one inner preview now uses the same preview-private no-final-hash decision drive pattern already used by `policy-preview.ts`, with a drive-scoped `resolveRef` cache and a single canonicalization at preview exit. This keeps bounded preview semantics, synthetic-decision trace shape, preview outcomes, and final exposed state hashes intact while avoiding repeated canonical hash/publication work inside the private choose-one drive.

Focused correctness proof:

```bash
pnpm -F @ludoforge/engine build
pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-inner-chooseone.test.js dist/test/unit/agents/policy-preview-inner-hidden-info.test.js dist/test/determinism/spec-160-inner-preview-replay-identity.test.js dist/test/determinism/spec-160-inner-preview-no-op-default.test.js
```

Both commands passed.

Decisive same-command 15-seed witness:

```bash
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-15-post-005-preview-state-drive --profile-buckets
```

Output:

- `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-preview-state-drive.md`
- `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-preview-state-drive.csv`

Result for the selected ticket target:

- Baseline post-004 final: `coupArvnRedeployPolice:chooseOne | continuedDeepening` slow-tier total `38,938.6 ms`, slow mean `748.8192 ms`, fast mean `408.5609 ms`, ratio `1.8328`.
- Post-005 preview-state-drive witness: slow-tier total `23,415.95 ms`, slow mean `450.3067 ms`, fast mean `156.6449 ms`, ratio `2.8747`.
- Delta: `-15,522.65 ms` total (`-39.86%`) and `-298.5125 ms` mean (`-39.86%`) on the selected residual.

Spec-wide residual remains: slowest seed `1005` improved to `72,522.37 ms` under bucket profiling, still above the Spec 173 `<=60 s` soft target. `train:chooseNStep:add` and `train:chooseNStep:confirm` remain below their ticket-004 elapsed gates (`1,608.7344 ms <= 1,800 ms`, `1,116.6162 ms <= 1,300 ms`) with encoded builds and token-index builds still `0`, but the post-005 fast-vs-slow table still reports train add/confirm above the Phase 1 spread criterion. Successor `tickets/173DEEPPRVCOST-006.md` owns that concrete post-005 train continuedDeepening residual spread classification.

Final verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-inner-chooseone.test.js dist/test/unit/agents/policy-preview-inner-hidden-info.test.js dist/test/determinism/spec-160-inner-preview-replay-identity.test.js dist/test/determinism/spec-160-inner-preview-no-op-default.test.js` — passed, 5 tests.
- `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-15-post-005-preview-state-drive --profile-buckets` — passed, 15/15 seeds completed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/spec-140-replay-identity.test.js dist/test/determinism/forked-vs-fresh-runtime-parity.test.js dist/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.js dist/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.js dist/test/integration/policy-bytecode-equivalence.test.js dist/test/integration/policy-bytecode-equivalence-partial-visibility.test.js` — passed, 26 tests.
- `pnpm -F @ludoforge/engine test:integration:fitl-rules` — passed, 79/79 files.
- `pnpm -F @ludoforge/engine lint` — passed.
- `pnpm -F @ludoforge/engine typecheck` — passed.

Verification substitutions:

- `pnpm turbo test --force` was not run. This ticket changed `@ludoforge/engine` agent/runtime code plus the profiling script, so the final proof used package-local build, focused inner-preview/determinism tests, the ticket's decisive 15-seed witness, the named determinism/equivalence gates, FITL rules integration, lint, and typecheck.
- `pnpm run check:ticket-deps` — passed after the terminal status edit: ticket dependency integrity check passed for 3 active tickets and 2345 archived tickets.

Late ticket-only proof edit invalidation: this final ledger update records the already-run dependency check and does not change source code, acceptance criteria, proof semantics, dependency edges, or residual ownership. No source/test proof rerun is required.

Source-size ledger:

- `packages/engine/src/agents/policy-preview-inner.ts | before 533 lines | after 555 lines | crossed cap? no | active growth +22 | extraction/defer rationale: under the repo guidance band and localized to the existing choose-one inner preview drive | successor: none`.

## Outcome

**Completion date**: 2026-05-15.

### What Landed

- Added opt-in `--profile-buckets` attribution to `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` so measured residual tickets can inspect hot-path bucket ownership without changing the default witness shape.
- Reworked `packages/engine/src/agents/policy-preview-inner.ts` so choose-one inner preview uses the preview-private no-final-hash drive path, a drive-scoped `resolveRef` cache, draft token-index preview attachment, and one canonicalization at preview exit.
- Preserved bounded preview semantics, synthetic-decision trace shape, preview outcomes, determinism gates, FITL rule behavior, and final exposed state hashes.

### Measured Result and Materiality

| Metric | Post-004 baseline | Post-005 final | Delta | Verdict |
|---|---:|---:|---:|---|
| `coupArvnRedeployPolice:chooseOne | continuedDeepening` slow-tier total | 38,938.6 ms | 23,415.95 ms | -39.86% | material improvement |
| `coupArvnRedeployPolice:chooseOne | continuedDeepening` slow mean | 748.8192 ms | 450.3067 ms | -39.86% | material improvement |
| Slowest seed 1005 wall time | 80,502.7 ms | 72,522.37 ms | -9.91% | improved, still above `<=60 s` |

The ticket-owned coup residual improved materially, but Spec 173 remains active because the slowest seed is still above the soft target.

### Residual Owner / Successor

Successor `tickets/173DEEPPRVCOST-006.md` owns the concrete post-005 residual: train continuedDeepening add/confirm still exceed the Phase 1 fast-vs-slow spread criterion after ticket 005, even though their ticket-004 elapsed gates remain closed. Ticket 005 does not widen into that train spread or Phase-N escalation classification.

### Artifact Classification

- Durable final witness artifacts:
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-preview-state-drive.md`
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-005-preview-state-drive.csv`
- Diagnostic/red-attempt report paths named above are transcript support only. Their material metrics are copied into this ticket; they are not required follow-up inputs for ticket 006 unless a future implementer deliberately reopens that candidate.

### Verification

- `pnpm -F @ludoforge/engine build` — passed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/policy-preview-inner-chooseone.test.js dist/test/unit/agents/policy-preview-inner-hidden-info.test.js dist/test/determinism/spec-160-inner-preview-replay-identity.test.js dist/test/determinism/spec-160-inner-preview-no-op-default.test.js` — passed, 5 tests.
- `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 400000 --date 2026-05-15-post-005-preview-state-drive --profile-buckets` — passed, 15/15 seeds completed.
- `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/spec-140-replay-identity.test.js dist/test/determinism/forked-vs-fresh-runtime-parity.test.js dist/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.js dist/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.js dist/test/integration/policy-bytecode-equivalence.test.js dist/test/integration/policy-bytecode-equivalence-partial-visibility.test.js` — passed, 26 tests.
- `pnpm -F @ludoforge/engine test:integration:fitl-rules` — passed, 79/79 files.
- `pnpm -F @ludoforge/engine lint` — passed.
- `pnpm -F @ludoforge/engine typecheck` — passed.
- `pnpm run check:ticket-deps` — passed after the terminal status edit and before this post-review successor creation.

### Post-Review Correction

Post-review added successor `tickets/173DEEPPRVCOST-006.md` and updated this ticket's residual-owner wording so the remaining Spec 173 work has a concrete owner before archival. This is ticket/spec ownership truthing only; it does not change source behavior or invalidate the source/test proof lanes above.
