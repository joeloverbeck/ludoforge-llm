# Spec 174 - WASM Preview-Drive Coverage Extension

**Status**: PROPOSED
**Priority**: High - Spec 173 Phase 1 exhausted three consecutive TypeScript-side closure slices without meeting the slowest-seed soft target.
**Complexity**: XL - generic WASM preview-drive ABI, preview-state materialization, production routing, parity, and default-flip proof.
**Date**: 2026-05-15
**Dependencies**:
- `archive/specs/173-deep-preview-drive-cost-reduction.md`
- `archive/specs/150-fitl-policy-vm-wasm-port.md`
- `archive/specs/172-policy-eval-static-structure-caching.md`
**Trigger report**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-008-final.md`
**Ticket namespace**: `174WASMDEEPPRV` (proposal — finalized by `/spec-to-tickets`)

## 1. Goal

Move the remaining generic deep preview-drive work for `continuedDeepening` / `deep1024` from TypeScript-only execution into a deterministic WASM route, without changing GameSpecDoc data, policy profiles, preview bounds, legality, publication, or kernel semantics.

Spec 173 proved that local TypeScript cache and constant-factor slices no longer move the terminal train residual materially:

- ticket 006 retained no runtime code after a flat/regressive choose-N preview no-entry-hash candidate;
- ticket 007 retained no runtime code after a flat/regressive decision-stack digest/encoding candidate;
- ticket 008 retained no runtime code and recorded post-008 slowest seed `1005` at `75,311.43 ms`, still above the Spec 173 `<=60 s` soft target.

This spec owns the architectural follow-up named by Spec 173 Phase N: extend the existing WASM policy/preview runtime so the production deep preview-drive path can route supported `continuedDeepening` work through WASM with explicit unsupported/fail-closed diagnostics and byte-equivalent TypeScript parity.

## 2. Non-Goals

- No FITL-specific Rust or TypeScript branches.
- No `arvn-evolved` profile retuning, `depthCap`, `maxOptions`, `chooseNBeamWidth`, or `capClass` changes.
- No changes to GameSpecDoc, production rules, legal action publication, or microturn semantics.
- No compatibility alias retained after a default flip. Temporary A/B routing is proof machinery only.
- No broad campaign scoring or `compositeScore` changes.

## 3. Architecture

The existing WASM path already owns generic policy-bytecode score-row execution and partial production preview-drive substrate from Spec 150. The remaining gap is coverage for the production deep preview-drive shape that still fails closed or stays TypeScript-owned for `continuedDeepening` / `deep1024`.

The gap spans two dispatch layers that must be addressed together. The broad-phase candidate-feature-row route already calls `evaluateProductionPreviewDriveBatchWithWasm` from `policy-wasm-score-routing.ts`, but currently fails closed for `continuedDeepening` / `deep1024` configurations. The deep-phase inner deepening (`runDeepPass` in `policy-preview-inner-deepening.ts`, invoking `continueChooseNStepInnerPreviewDrive` per option) does not invoke WASM at all today. Phase 0 inventory must crisply attribute each unsupported class to one of these two layers so later tickets partition the ABI and routing work cleanly.

Spec 174 extends that route in stages:

1. Inventory the current production deep preview-drive unsupported classes from the post-008 witness and `policy-wasm-score-routing.ts`.
2. Extend the generic encoded preview-drive ABI to represent the missing bounded decision-stack publication, preview-state slots, candidate grouping, and completion semantics needed by `continuedDeepening`.
3. Prove TypeScript/WASM parity for supported preview-drive output before any production default flip.
4. Add activation and unsupported counters so a green correctness test cannot mask an inactive WASM path.
5. Flip only the proven supported route, fail closed for unsupported shapes, and delete temporary A/B wiring when the route is complete.

The route remains generic: it consumes compiled GameDef, policy bytecode, encoded state/layout identity, action/candidate identity, and bounded preview configuration. It must not inspect FITL ids, factions, cards, or authored profile names.

## 4. Phases

| Phase | Scope | Acceptance |
|---|---|---|
| 0 | Inventory and unsupported-class witness for post-008 deep preview-drive rows. | Report names supported vs unsupported production preview-drive classes and attributes each to the broad-phase candidate-feature-row route vs the deep-phase inner deepening; introduces dedicated `productionPreviewDriveRouteCount` / `productionPreviewDriveUnsupportedCount` counters in `policy-wasm-runtime.ts` mirroring the existing `recordProductionPolicyWasmScoreRows` pattern; records the exact current fail-closed reason strings from `policy-wasm-score-routing.ts`. |
| 1 | ABI extension for missing generic preview-drive structures. | Rust/TS ABI validates identity, version, bounded counts, and unsupported classes; malformed buffers fail closed deterministically; ABI explicitly serializes Foundation-20 preview-signal carriers across FFI (`previewStatus`, `previewBranch`, `tiebreakAfterPreviewNoSignal`, and the `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory) so unsupported and non-`ready` outcomes survive the WASM boundary instead of being coerced into scalar contributions. |
| 2 | Parity for supported deep preview-drive rows. | A new integration parity oracle (sibling to `packages/engine/test/integration/policy-bytecode-equivalence*.test.ts`, not an extension of it) proves TypeScript and WASM preview-drive output are byte-equivalent for supported rows — preview outcomes, candidate ordering, state-feature values, and Foundation-20 signal carriers. |
| 3a | Production route activation telemetry. | Broad production preview-drive rows route through WASM where supported, with nonzero activation counters; deep-phase `continuedDeepening` remains TypeScript-backed and increments explicit unsupported counters until materialized projected-state ABI support lands. |
| 3b-prereq | Deep preview-drive state-patch/materialization ABI. | A generic WASM state-patch payload and TypeScript host decoder can reconstruct canonical projected `GameState` values for supported deep preview continuations; unsupported structural classes fail closed with explicit provenance. |
| 3b-continuation-prereq | Deep preview-drive `chooseNStep` continuation state-patch/materialization ABI. | A generic WASM/host continuation ABI can materialize projected `GameState` values for supported `chooseNStep` deep continuations without TypeScript being the hidden state producer; unsupported classes fail closed with explicit provenance. |
| 3b | Deep preview-drive materialized-state consumption. | Deep `continuedDeepening` / `deep1024` rows route through WASM only when the WASM route returns the projected `GameState` consumed by `runDeepPass`; unsupported classes remain explicit. |
| 4 | Perf gate and default-flip decision. | Fail recorded on 2026-05-16: the post-174-011 15-seed witness regressed the slow-tier median to `62042.20 ms` against the `<=20408.8125 ms` pass threshold; `reports/174-phase-4-architectural-blocker.md` named `archive/tickets/174WASMDEEPPRV-014.md` as the diagnostic owner, and `tickets/174WASMDEEPPRV-010.md` is rejected. |

## 5. Acceptance Criteria

1. No FITL-specific code appears in Rust, TypeScript bridge code, schema/ABI encoders, tests, or route predicates.
2. Every supported WASM preview-drive row has a TypeScript oracle proving byte-equivalent candidate ordering, preview status, surfaced values, and deterministic hashes where applicable.
3. Unsupported rows fail closed with stable reason strings and counters; fallback success cannot count as route activation.
4. Determinism gates remain green:
   - `packages/engine/test/determinism/spec-140-replay-identity.test.ts`
   - `packages/engine/test/determinism/forked-vs-fresh-runtime-parity.test.ts`
   - `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.ts`
   - `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.ts`
   - `packages/engine/test/integration/policy-bytecode-equivalence*.test.ts`
5. The 15-seed decomposition witness is rerun after production activation and records both activation counters and the residual elapsed metrics.
6. Every new test file added under `packages/engine/test/**` carries a `@test-class` marker per `.claude/rules/testing.md` (`architectural-invariant` by default; `convergence-witness` or `golden-trace` only when justified).

## 6. Foundation Alignment

| Foundation | Alignment |
|---|---|
| #1 Engine Agnosticism | The WASM route handles generic encoded preview-drive data only. |
| #5 One Rules Protocol | Legal action publication and application remain kernel-owned; WASM may only evaluate proven preview-drive rows. |
| #8 Determinism | Integer-only arithmetic, explicit ABI identity, and byte-equivalent TypeScript parity are required before routing. |
| #10 Bounded Computation | Existing preview bounds and `capClass` remain unchanged and are encoded into reproducibility metadata. |
| #14 No Backwards Compatibility | Temporary A/B routing must be deleted once the supported route is defaulted. |
| #15 Architectural Completeness | Spec 173's exhausted TypeScript-local path is replaced by the root architectural owner. |
| #16 Testing as Proof | Parity, activation, unsupported classification, determinism, and measured witnesses are required. |
| #20 Preview Signal Integrity | Preview statuses, fallback paths, and unavailable outcomes remain explicit; Phase 1 extends the WASM ABI to serialize `previewStatus`, `previewBranch`, `tiebreakAfterPreviewNoSignal`, and the `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory across FFI so unsupported and non-`ready` rows fail closed rather than silently contributing scalar values. |

## 7. Code Anchors

TypeScript route and ABI bridge:
- `packages/engine/src/agents/policy-wasm-score-routing.ts`
- `packages/engine/src/agents/policy-wasm-runtime.ts`
- `packages/engine/src/agents/policy-wasm-preview-drive.ts`
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts`
- `packages/engine/src/agents/policy-wasm-production-preview-drive-types.ts`
- `packages/engine/src/agents/policy-wasm-production-preview-drive-lowering.ts`
- `packages/engine/src/agents/policy-wasm-production-preview-feature-slots.ts`
- `packages/engine/src/agents/policy-wasm-production-preview-values.ts`

Deep-phase TS dispatch (currently bypasses WASM; wired in by Phase 3):
- `packages/engine/src/agents/policy-preview-inner-deepening.ts`
- `packages/engine/src/agents/policy-agent-inner-preview.ts`

Rust ABI:
- `packages/engine-wasm/policy-vm/src/lib.rs`
- `packages/engine-wasm/policy-vm/src/preview_drive.rs`

Conventional test placement:
- `packages/engine/test/unit/agents/` — ABI codec, fail-closed, and unsupported-class unit tests
- `packages/engine/test/integration/` — new preview-drive parity oracle (sibling to `policy-bytecode-equivalence*.test.ts`)

Witness tooling:
- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs`
- `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-008-final.md`

## 8. Tickets

Decomposed via `/spec-to-tickets` on 2026-05-15:

- [`archive/tickets/174WASMDEEPPRV-001.md`](../archive/tickets/174WASMDEEPPRV-001.md) — Phase 0 — Inventory unsupported preview-drive classes and wire production preview-drive counters
- [`archive/tickets/174WASMDEEPPRV-002.md`](../archive/tickets/174WASMDEEPPRV-002.md) — Phase 1a — Serialize Foundation-20 preview-signal carriers across WASM FFI
- [`archive/tickets/174WASMDEEPPRV-003.md`](../archive/tickets/174WASMDEEPPRV-003.md) — Phase 1b — Bounded decision-stack publication ABI
- [`archive/tickets/174WASMDEEPPRV-004.md`](../archive/tickets/174WASMDEEPPRV-004.md) — Phase 1c — Preview-state slot ABI extensions
- [`archive/tickets/174WASMDEEPPRV-005.md`](../archive/tickets/174WASMDEEPPRV-005.md) — Phase 1d — Candidate grouping ABI
- [`archive/tickets/174WASMDEEPPRV-006.md`](../archive/tickets/174WASMDEEPPRV-006.md) — Phase 1e — continuedDeepening completion semantics ABI
- [`archive/tickets/174WASMDEEPPRV-007.md`](../archive/tickets/174WASMDEEPPRV-007.md) — Phase 2 — TS/WASM preview-drive parity oracle
- [`archive/tickets/174WASMDEEPPRV-008.md`](../archive/tickets/174WASMDEEPPRV-008.md) — Phase 3a — Production route activation counters (broad + deep unsupported classification)
- [`archive/tickets/174WASMDEEPPRV-012.md`](../archive/tickets/174WASMDEEPPRV-012.md) — Phase 3b prerequisite — Deep preview-drive state-patch ABI design
- [`archive/tickets/174WASMDEEPPRV-013.md`](../archive/tickets/174WASMDEEPPRV-013.md) — Phase 3b continuation prerequisite — chooseNStep continuation state-patch ABI
- [`archive/tickets/174WASMDEEPPRV-011.md`](../archive/tickets/174WASMDEEPPRV-011.md) — Phase 3b — Deep preview-drive materialized-state consumption (after 013)
- [`archive/tickets/174WASMDEEPPRV-009.md`](../archive/tickets/174WASMDEEPPRV-009.md) — Phase 4a — Perf-witness rerun and gate decision (Fail recorded; archived after 009 closeout)
- [`tickets/174WASMDEEPPRV-010.md`](../tickets/174WASMDEEPPRV-010.md) — Phase 4b — Default flip and A/B wiring deletion (rejected because 009's perf gate failed)
- [`archive/tickets/174WASMDEEPPRV-014.md`](../archive/tickets/174WASMDEEPPRV-014.md) — Phase 4c — Diagnose failed post-011 residual owner
- [`archive/tickets/174WASMDEEPPRV-015.md`](../archive/tickets/174WASMDEEPPRV-015.md) — Phase 4d — Optimize zero-counter continuedDeepening token/query residuals
- [`archive/tickets/174WASMDEEPPRV-016.md`](../archive/tickets/174WASMDEEPPRV-016.md) — Phase 4e — Diagnose train chooseNStep unsupported deepening residuals
- [`archive/tickets/174WASMDEEPPRV-017.md`](../archive/tickets/174WASMDEEPPRV-017.md) — Phase 4f — Materialize non-chooseNStep deep continuation decisions
- [`archive/tickets/174WASMDEEPPRV-018.md`](../archive/tickets/174WASMDEEPPRV-018.md) — Phase 4g — Reduce repeated decision-stack digest cost after continuation materialization

This spec intentionally does not implement WASM preview-drive code inside the Spec 173 closeout ticket; the first slice owns inventory only.

## 9. Outcome

Phase 4 gate update on 2026-05-16: `archive/tickets/174WASMDEEPPRV-009.md` reran the post-011 15-seed witness and recorded a Fail verdict in `reports/174-phase-4-gate-decision.md`. The default flip in `tickets/174WASMDEEPPRV-010.md` is rejected without engine changes. The diagnostic owner was `archive/tickets/174WASMDEEPPRV-014.md`, which diagnosed the remaining unsupported-count and zero-counter residual classes before any later default-flip path can be reconsidered.

Phase 4c residual-owner update on 2026-05-16: `reports/174-phase-4c-residual-owner.md` records reason-granular unsupported preview-drive classes and classifies the dominant zero-counter residual. `coupArvnRedeployPolice:chooseOne` remains the largest class with no production preview-drive route, unsupported, or batch counts, and its hot-path buckets point at generic token/query runtime work. The next non-overlapping owner was `archive/tickets/174WASMDEEPPRV-015.md`; `tickets/174WASMDEEPPRV-010.md` remains rejected unless a later gate report records a Pass.

Phase 4d zero-counter update on 2026-05-16: `archive/tickets/174WASMDEEPPRV-015.md` attempted a generic token-index refresh shortcut, but the bounded seed-1005 witness in `reports/174-phase-4d-zero-counter-residual.md` regressed from `101783.04 ms` to `137795.87 ms`, so that candidate was reverted. A same-ticket owner-isolation continuation then captured temporary `evalQuery:countMatchingTokens` counters and reverted the instrumentation; the top residual remained `coupArvnRedeployPolice:chooseOne | continuedDeepening` with zero production preview-drive route, unsupported, and batch counts. A structural query-count cache then activated and reduced the local `evalQuery:countMatchingTokens` bucket, but regressed seed `1005` wall time from `102576.42 ms` to `103349.93 ms` and regressed the top zero-counter class from `42112.11 ms` to `43018.87 ms`, so it was also reverted. A token-index shape probe then identified repeated full-zone scans as the remaining generic owner: the top class recorded `15270074` prior-single/result-single affected-token refreshes and `279810798` scanned zone-token entries. The retained Phase 4d candidate adds generic per-refresh zone occurrence reuse inside `refreshCachedEntries`; the bounded seed-1005 witness improved to `101758.60 ms`, with the top zero-counter class reduced from `40844.39 ms` to `40590.39 ms`. A later prior-zone duplicate-scan skip regressed seed `1005` to `103081.91 ms` and was reverted. A diagnostic choose-one drive probe then identified generic preview-state continuation publication as the next concrete owner: `policyPreviewInner:chooseOne:publishContinuation` accounted for `35557.18 ms` of the top zero-counter class. The retained preview-publication candidate keeps preview no-hash stack publication state-only and improved the bounded seed-1005 witness to `99047.62 ms`, with the top zero-counter class reduced to `39805.08 ms`. Follow-up diagnostics then narrowed the remaining publication cost to repeated `probeMoveViability` reprobes for suspended continuations. The retained suspended-continuation candidate skips that reprobe after `resumeSuspendedEffectFrame` produces a concrete continuation, while preserving publication admission and bridgeability checks. The bounded seed-1005 witness improved to `66089.91 ms`; `coupArvnRedeployPolice:chooseOne | continuedDeepening` fell to `8828.85 ms` and rank 3. The ticket-owned zero-counter residual is reduced and no longer dominant, but `tickets/174WASMDEEPPRV-010.md` remains blocked until a later measured gate records a pass; the bounded sample is now dominated by reason-granular unsupported `train:chooseNStep` continued-deepening classes.

Phase 4e handoff on 2026-05-16: `archive/tickets/174WASMDEEPPRV-016.md` owned the continuation diagnostic for the new dominant reason-granular unsupported `train:chooseNStep:add` and `train:chooseNStep:confirm` continued-deepening residuals. `tickets/174WASMDEEPPRV-010.md` remains rejected and must not be used for default flip or A/B deletion unless a later measured gate records a Pass.

Phase 4e diagnostic update on 2026-05-16: `archive/tickets/174WASMDEEPPRV-016.md` produced `reports/174-phase-4e-train-choosenstep-residual.md` and the bounded seed-1005 witness at `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4e-train-choosenstep-baseline.md` / `.csv`. The witness completed in `62297.98 ms`, with `train:chooseNStep:add | continuedDeepening` at `15159.23 ms` and `train:chooseNStep:confirm | continuedDeepening` at `10001.11 ms`. The dominant unsupported owner is `agent-guided-completion` / `production-deep-choosenstep-continuation.pickInnerDecision`: the completion policy selects a non-`chooseNStep` continuation decision, while the current deep WASM continuation path only lowers `chooseNStep` continuations. No runtime candidate was retained in Phase 4e, and a full Phase 4 gate rerun is not justified by this diagnostic alone. The next non-overlapping owner was `archive/tickets/174WASMDEEPPRV-017.md`; `tickets/174WASMDEEPPRV-010.md` remains rejected until a later measured gate records a Pass.

Phase 4f materialization update on 2026-05-16: `archive/tickets/174WASMDEEPPRV-017.md` retained generic `chooseOne` deep continuation materialization through the WASM state-patch contract. The bounded seed-1005 witness at `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4f-non-choosenstep-continuation-final.md` / `.csv` increased production preview-drive routes from `12` to `310` and reduced unsupported rows from `519` to `221`. The Phase 4e `production-deep-choosenstep-continuation.pickInnerDecision` owner is eliminated from the final report/CSV, including `train:chooseNStep:add` (`143 -> 0`) and `train:chooseNStep:confirm` (`94 -> 0`). The bounded wall time regressed from `62297.98 ms` to `63872.98 ms`, so this is route/support coverage, not a Phase 4 gate pass. `tickets/174WASMDEEPPRV-010.md` remains rejected until a later measured gate records a Pass.

Phase 4g handoff on 2026-05-16: `archive/tickets/174WASMDEEPPRV-018.md` owned the next non-overlapping generic cost-reduction slice after Phase 4f. The post-017 bounded report shows the top slow continued-deepening axes are now led by repeated `zobrist:digestDecisionStackFrame` and `zobrist:encodeDecisionStackFrame` work, while unsupported provenance remains explicit. `tickets/174WASMDEEPPRV-010.md` remains rejected until a later measured gate records a Pass.

Phase 4g bounded update on 2026-05-16: `archive/tickets/174WASMDEEPPRV-018.md` retained generic state-patch hash reuse after WASM continuation materialization. `materializePolicyWasmPreviewStatePatch` now reuses the already-canonical `applyPublishedDecision` state hash when a continuation patch ends synchronized to that applied state, while manual patch operations still fall back to `computeFullHash`. The bounded seed-1005 witness at `reports/fitl-arvn-15-seed-decomposition-2026-05-16-phase-4g-decision-stack-digest-cost-final.md` / `.csv` improved wall time from the Phase 4f `63872.98 ms` baseline to `59610.96 ms`, with production preview-drive routes/unsupported/batches unchanged at `310` / `221` / `199`. The top train continued-deepening digest/encode bucket counts remain visible residual work, so this is not a broad Phase 4 gate pass. `tickets/174WASMDEEPPRV-010.md` remains rejected until a later measured gate records a Pass.
