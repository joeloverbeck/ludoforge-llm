# 177POLWASMBATCH-002: Implement selected transfer-reduction shape with parity tests and route-activation counters

**Status**: BLOCKED by `177POLWASMBATCH-001`
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — host-side dispatch (`policy-wasm-score-routing.ts`, `policy-wasm-production-preview-drive.ts`), runtime types and the guest-side ABI (`policy-wasm-preview-drive.ts`, `policy-wasm-runtime.ts`, `policy-wasm-runtime-types.ts`, and possibly the Rust crate under `packages/engine/wasm-policy/`), timing-profile route class (`policy-wasm-timing-profile.ts`), runtime counters (`policy-wasm-runtime-counters.ts`), and parity/contract tests
**Deps**: `tickets/177POLWASMBATCH-001.md`

## Problem

Spec 177 requires a batched policy-WASM call shape (or equivalent host/guest transfer reduction) that demonstrably reduces per-call overhead for `productionPreviewDrive`, `previewCandidateFeatureRows`, and related `scoreRows` work while preserving fail-closed TS fallback (Spec 175 contract) and preview-signal carriers (Foundation #20). Ticket `001` produces `reports/177-phase-0-batching-shape-selection.md` naming exactly one transfer-reduction shape and predicting a ≥5% slow-tier wall-time improvement; this ticket implements that named shape end-to-end, including the route-activation counter that proves the new path ran and the parity tests that prove its outputs match the authoritative TypeScript path.

## Blocked State (2026-05-17)

`tickets/177POLWASMBATCH-001.md` produced `reports/177-phase-0-batching-shape-selection.md` with verdict `no-transfer-reduction-shape-authorized`. The measured slow-tier transfer-overhead ceiling is about `608.7484 ms` against a `>=5%` bar of about `3,901.51 ms`, so no current transfer-reduction shape is authorized for implementation.

Do not implement this ticket until `specs/177-policy-wasm-batched-call-overhead-reduction.md` is re-scoped or a new evidence report names a shape whose predicted ROI clears the threshold.

The implementation must land as a Foundation 14 atomic cut: the prior per-group or per-feature call shape is replaced, not duplicated behind a flag. The "atomic cut" includes the host-side dispatch, the timing-route taxonomy, the runtime counters, and any guest-side ABI that the new shape requires; all consumer tests are migrated in the same change.

## Assumption Reassessment (2026-05-17)

1. The implementation shape is **not** fully known at decomposition time — it is the output of ticket `001`. Before coding, this ticket MUST re-read `reports/177-phase-0-batching-shape-selection.md`, validate the named shape against the current code, and update the "What to Change" section in place if `001`'s recommendation diverges from the candidate shapes listed below. Marking that step "completed" without doing it is a ticket-fidelity violation.
2. The three host-side route entry points live at:
   - `policy-wasm-score-routing.ts:292-308` — `productionPreviewDrive` per `actionId`-group call via `evaluateProductionPreviewDriveBatchWithWasm`.
   - `policy-wasm-score-routing.ts:480` — `previewCandidateFeatureRows` per feature via `evaluateWasmCandidateFeatureRow`.
   - `policy-wasm-score-routing.ts:531` — `scoreRows` per microturn via `evaluateWasmMoveConsiderationScoreRows`.

   **Confirmed.**
3. `PolicyWasmTimingRouteClass` is the union `'scoreRows' | 'previewCandidateFeatureRows' | 'productionPreviewDrive'` (`policy-wasm-timing-profile.ts:1-4`). Adding a new variant is mechanically uniform across the snapshot, reset, and bucket initializer. **Confirmed.**
4. The runtime-counter pattern in `policy-wasm-runtime-counters.ts:30-145` uses per-route module-scoped counters with a `record*()` write API, a `get*RouteCount()` read API, and a `productionPolicyWasmCounterInternals` snapshot bag. The new batched-path counter must follow this exact pattern. **Confirmed.**
5. The fail-closed TS fallback contract is enforced via `@policy-wasm-throw: contract-violation` and `@policy-wasm-unsupported: null-return` markers and tested in `packages/engine/test/architecture/policy-wasm-throw-contract.test.ts` (Spec 175). The batched path's unsupported-shape detection must use `null-return`, not `throw`. **Confirmed.**
6. Foundation #20 carriers — `tiebreakAfterPreviewNoSignal`, `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory, and preview status types — flow through `policy-eval.ts` (lines `130`, `236-250`) and `policy-wasm-preview-drive.ts` decoding (`previewTraceOutcomeFromWasmStatus`). The batched path must continue emitting these per row, not aggregated. **Confirmed.**
7. Existing parity tests cover `productionPreviewDrive` (`packages/engine/test/integration/policy-wasm-preview-drive-equivalence.test.ts`) and `scoreRows` (`packages/engine/test/integration/policy-bytecode-equivalence-partial-visibility.test.ts`). No equivalent file currently isolates `previewCandidateFeatureRows`; if `001` selects that route, a new equivalence test file is needed. **Confirmed.**

## Architecture Check

1. **Single Rules Protocol preserved (Foundation #5).** Whether candidates are evaluated one batch at a time or one super-batch at a time, the kernel-published legal-action set and per-candidate semantic outputs are unchanged. Batching is a host/guest transport optimization, not a legality contract change.
2. **Engine agnosticism preserved (Foundation #1).** The batched path operates over generic `PolicyWasmBatchCandidate[]` and `PolicyWasmPreviewDriveBatchInput`; no FITL-specific identifiers, action IDs, or rule branches leak into the new code.
3. **Foundation #14 atomic cut.** The prior per-group or per-feature call path is removed, not retained behind a flag. The new route variant is named in `PolicyWasmTimingRouteClass` directly; no `_legacy` suffixes, no parallel snapshot type. The "mechanical-uniformity" exception of the Foundation 14 calibration in `/spec-to-tickets` applies: extending the union, updating the bucket initializer, snapshot, and reset are uniform repetitions across the three routes.
4. **Foundation #20 preservation as proof.** Parity tests assert that batched-path output carries the same per-row `previewStatus`, `tiebreakAfterPreviewNoSignal`, and unavailability-breakdown structure as the pre-change path on identical inputs. Aggregate preview-state hashing into a single batched call is acceptable; collapsing per-row carriers into a single batch-wide flag is not.
5. **Foundation #8 determinism.** Same GameDef + state + seed + candidates produces byte-identical batched-path output across runs and produces the same TS-oracle output as the pre-change path; existing replay tests must continue to pass.
6. **Foundation #16 testing as proof.** Architectural invariants (parity, no-throw on unsupported, route-activation counter behavior) are proven via tests added or extended in this same ticket; no "follow-up will test this" deferrals.

## What to Change

> **Reassessment gate**: Before implementing any section below, re-read `reports/177-phase-0-batching-shape-selection.md` (produced by ticket `001`) and confirm the shape named there matches one of the candidate shapes in §1. If the chosen shape diverges, update §1–§5 in place to reflect `001`'s recommendation before coding. Apply the 1-3-1 rule to the user if `001`'s shape cannot be realized as described here.

### 1. Implement the chosen transfer-reduction shape

The likely candidate shapes are (final selection comes from ticket `001`):

- **A — Cross-action batching for `productionPreviewDrive`**: Drop the `groupPreviewCandidatesByAction` partition at `policy-wasm-score-routing.ts:292`; pass the full candidate vector in one call. The guest already accepts `PolicyWasmBatchCandidate[]`; this requires extending the guest's per-candidate dispatch in `ludoforge_policy_vm_evaluate_preview_drive_batch` so it can resolve heterogeneous `actionId`s within one batch (host passes the per-candidate `actionId` alongside `stableMoveKey`).
- **B — Cross-feature batching for `previewCandidateFeatureRows`**: Replace the per-feature loop at `policy-wasm-score-routing.ts:478-486` with a single call carrying a vector of feature expressions and a single shared candidate vector; the guest returns a `[featureIndex][candidateIndex]` matrix of values. Requires a new guest export `ludoforge_policy_vm_evaluate_candidate_feature_rows_batch` (or extension of the existing bytecode-batch export with a feature-vector input shape).
- **C — Per-call payload shrink**: Reuse the existing batch boundary but deduplicate the `def` / `state` / `context` portion of the serialized input across calls within a microturn (e.g., one "session" payload established once per microturn, subsequent calls reference it by session ID). Requires a new host-side session lifecycle and a guest-side session-keyed cache.
- **D — Equivalent transfer reduction** as named by `001`.

In all cases:

- The new host-side dispatch path replaces the prior call shape in `policy-wasm-score-routing.ts` and (for A) `policy-wasm-production-preview-drive.ts`. No flag-gated coexistence with the prior shape.
- The chosen guest-side ABI extension is documented at the export site (a one-line comment is sufficient if the docstring captures the input/output layout) and the runtime types in `policy-wasm-runtime-types.ts` are updated to match.
- The fail-closed unsupported path uses `null-return` per `@policy-wasm-unsupported: null-return`; throws are reserved for genuine contract violations per `@policy-wasm-throw: contract-violation`.

### 2. Extend `PolicyWasmTimingRouteClass` and timing buckets

Add the new route variant(s) named by `001` to the union at `policy-wasm-timing-profile.ts:1-4`. Update:

- `ROUTE_CLASSES` constant at line `23`.
- `timingBuckets` initializer at line `38`.
- `snapshotPolicyWasmTimingBuckets()` at line `102` (add the new key to the returned literal).
- `resetPolicyWasmTimingBuckets()` at line `80` (loop already covers new entries via `ROUTE_CLASSES`).

If `001` chose to model batched-vs-unbatched as a variant *dimension* rather than a flat enum extension (e.g., `'productionPreviewDrive' | 'productionPreviewDriveBatched'`), apply the orthogonal-dimension change consistently and document the dimension in a one-line comment at the union site.

### 3. Add route-activation counters for the new path

Following the pattern in `policy-wasm-runtime-counters.ts:30-145`:

- Add module-scoped `productionPolicyWasm<NewVariant>RouteCount` and `productionPolicyWasm<NewVariant>UnsupportedCount` counters.
- Add the `recordProductionPolicyWasm<NewVariant>(kind: 'supported' | 'unsupported')` write API.
- Add `getProductionPolicyWasm<NewVariant>RouteCount()` and `getProductionPolicyWasm<NewVariant>UnsupportedCount()` read APIs.
- Extend `productionPolicyWasmCounterInternals` (line `87`) with corresponding methods and extend `resetProductionScoreRowCounters()` at line `134` to zero the new counters.

The counter must increment at the new dispatch site in `policy-wasm-score-routing.ts` (and `policy-wasm-production-preview-drive.ts` for shape A) on every successful and every unsupported batched call. Ticket `003` reads these counters in the witness report to prove the batched path ran.

### 4. Preserve fail-closed TS fallback

The batched path's unsupported-input detection must early-return `null` (not throw) and let the existing TS oracle path at `policy-eval.ts:737-766` take over. Annotate the early-return site with `// @policy-wasm-unsupported: null-return` to satisfy `packages/engine/test/architecture/policy-wasm-throw-contract.test.ts`. Genuine contract violations (corrupt guest output, unknown policy IDs, ABI mismatch) continue to throw with `// @policy-wasm-throw: contract-violation`.

### 5. Preserve Foundation #20 preview-signal carriers

Per-row preservation requirements:

- The batched-path output carries `previewSignalCarrier.previewStatus` per row (full taxonomy: `ready | unknown | hidden | stochastic | unresolved | failed | depthCap | partial`).
- The batched-path output carries `tiebreakAfterPreviewNoSignal` per row.
- `unavailabilityBreakdown` aggregation in `PolicyPreviewSignalUnavailableAdvisory` (per `policy-eval.ts:236-250`) is reconstructible from batched-path per-row outputs.

If the chosen shape requires a guest-side ABI change to the preview-drive output layout, extend the layout to preserve every per-row carrier listed above — collapsing carriers to a batch-wide aggregate is forbidden.

### 6. Extend parity tests

- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence.test.ts` (modify, if shape A or C) — add a parity case where a multi-action candidate vector goes through the batched path in one call; assert per-row TS-oracle parity and per-row `previewStatus` / `tiebreakAfterPreviewNoSignal` parity.
- `packages/engine/test/integration/policy-bytecode-equivalence-partial-visibility.test.ts` (modify, if shape covers `scoreRows`) — extend the existing batched-candidates case to cover the new variant route counter.
- `packages/engine/test/integration/policy-wasm-candidate-feature-rows-equivalence.test.ts` (new, if shape B) — assert that the batched-feature path emits per-feature per-candidate values byte-identical to per-feature unbatched calls.
- `packages/engine/test/architecture/policy-wasm-throw-contract.test.ts` (modify) — assert that the new batched dispatch site is covered by the existing `@policy-wasm-unsupported: null-return` marker scan.
- A new architectural-invariant test (file name following the chosen shape, e.g., `policy-wasm-batched-route-counter.test.ts`) — assert that running a fixture microturn through the batched path increments the new route-activation counter by at least one and leaves the unsupported counter at zero.

All new tests carry the `@test-class:` header per `.claude/rules/testing.md`; default class is `architectural-invariant`.

### 7. Update the profiler script

`packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` — extend the timing-bucket output to surface the new route variant's columns (timing buckets + ticket `001`'s batch-size columns + new route-activation counter). Append columns; do not shift existing column order.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-score-routing.ts` (modify — replace prior dispatch shape with batched dispatch; thread new route class to timing recorder; increment new counter)
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` (modify — adapt `evaluateProductionPreviewDriveBatchWithWasm` to the chosen batched shape if shape A or C)
- `packages/engine/src/agents/policy-wasm-preview-drive.ts` (modify, if guest-side preview-drive output layout extends)
- `packages/engine/src/agents/policy-wasm-runtime.ts` (modify, if a new guest export is introduced)
- `packages/engine/src/agents/policy-wasm-runtime-types.ts` (modify — new input/output types for the chosen shape)
- `packages/engine/src/agents/policy-wasm-timing-profile.ts` (modify — extend route class union and bucket initializer)
- `packages/engine/src/agents/policy-wasm-runtime-counters.ts` (modify — add new route-activation counter set, extend `productionPolicyWasmCounterInternals`)
- `packages/engine/wasm-policy/` (modify, if shape A/B/C requires Rust-side guest changes — exact files depend on `001`'s named shape)
- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence.test.ts` (modify)
- `packages/engine/test/integration/policy-bytecode-equivalence-partial-visibility.test.ts` (modify)
- `packages/engine/test/integration/policy-wasm-candidate-feature-rows-equivalence.test.ts` (new, conditional on shape)
- `packages/engine/test/architecture/policy-wasm-throw-contract.test.ts` (modify — cover new dispatch site marker)
- `packages/engine/test/integration/policy-wasm-batched-route-counter.test.ts` (new — route-activation counter invariant)
- `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` (modify — surface new route's columns)

## Out of Scope

- Slow-tier wall-time witness recapture and the ≥5% gate assertion — owned by ticket `003`.
- Implementing more than one transfer-reduction shape. `001` names exactly one; if its "Optional follow-on" subsection identifies a secondary shape, that becomes a new ticket after `003` resolves.
- Touching `scoreRows` if `001` does not name it. Phase 1 already showed `scoreRows` is near parity (`1.89x` slow-tier overhead/exec); the spec is explicit about "and related score-row work" so changes there are admissible only if `001` recommends them.
- Cross-game generalization. FITL ARVN parity tests are sufficient; Texas Hold'em parity is not required.
- Visual-config or runner-side changes — engine-only ticket.

## Acceptance Criteria

### Tests That Must Pass

1. **Parity (batched vs TS oracle)**: `pnpm -F @ludoforge/engine test --test-name-pattern "policy-wasm.*equivalence"` — new and existing equivalence tests pass with the batched path enabled.
2. **Foundation #20 carrier preservation**: `pnpm -F @ludoforge/engine test --test-name-pattern "policy-preview.*signal"` — per-row `tiebreakAfterPreviewNoSignal` and `previewSignalCarrier.previewStatus` emit identically to the TS oracle on matching inputs.
3. **Fallback contract**: `pnpm -F @ludoforge/engine test packages/engine/test/architecture/policy-wasm-throw-contract.test.ts` — new dispatch site is covered by `@policy-wasm-unsupported: null-return` marker; no throw on unsupported shapes.
4. **Route-activation counter invariant**: `packages/engine/test/integration/policy-wasm-batched-route-counter.test.ts` (new) — fixture microturn increments the new counter; unsupported counter stays at zero on supported inputs.
5. **Determinism (Foundation #8)**: existing replay/determinism tests in `packages/engine/test/determinism/` continue to pass.
6. **Full suite**: `pnpm turbo test`.

### Invariants

1. **No backwards-compatibility shim (Foundation #14).** No `_legacy`, no flag-gated dual-path. The prior per-group or per-feature dispatch is deleted.
2. **Per-row preview-signal carrier integrity (Foundation #20).** Batched-path output preserves per-row carriers; no batch-wide aggregation of `previewStatus`, `tiebreakAfterPreviewNoSignal`, or `unavailabilityBreakdown` rows.
3. **Engine agnosticism (Foundation #1).** No FITL identifiers, action IDs, or game-specific branches in the new dispatch path or guest-side code.
4. **Fail-closed TS fallback parity (Spec 175).** Unsupported inputs return `null` from the batched path and fall through to the TS oracle without throwing.
5. **Determinism (Foundation #8).** Same GameDef + state + seed + candidates produces byte-identical batched-path output across runs.
6. **Route-activation counter contract.** Every batched dispatch records exactly one increment in either the supported or unsupported counter, never both, never neither.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/policy-wasm-batched-route-counter.test.ts` (new, `@test-class: architectural-invariant`) — proves the new route-activation counter increments on successful batched dispatch and that the unsupported counter increments on `null-return` paths.
2. `packages/engine/test/integration/policy-wasm-preview-drive-equivalence.test.ts` (modify) — extend with a multi-action candidate vector batched-path parity case (shape A/C).
3. `packages/engine/test/integration/policy-wasm-candidate-feature-rows-equivalence.test.ts` (new, conditional on shape B, `@test-class: architectural-invariant`) — per-feature per-candidate parity vs TS oracle.
4. `packages/engine/test/architecture/policy-wasm-throw-contract.test.ts` (modify) — assert new dispatch site marker coverage.
5. `packages/engine/test/integration/policy-bytecode-equivalence-partial-visibility.test.ts` (modify, if shape covers `scoreRows`) — extend batched-candidates case.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test --test-name-pattern "policy-wasm"`
3. `pnpm -F @ludoforge/engine test packages/engine/test/architecture/policy-wasm-throw-contract.test.ts`
4. `pnpm -F @ludoforge/engine test packages/engine/test/determinism`
5. `pnpm turbo lint typecheck test`
