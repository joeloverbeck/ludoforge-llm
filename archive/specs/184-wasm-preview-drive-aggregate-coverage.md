# Spec 184 — WASM Preview Drive Aggregate-Coverage Gap

**Status**: COMPLETED
**Priority**: Medium — restores WASM scoring throughput for preview-using candidate features feeding aggregates. The CI-blocking divergence is already worked around by a defensive TS fallback (see §3 below); this spec is the proper architectural fix.
**Complexity**: M — bounded to the WASM production preview-drive layer plus an extension of the existing Spec 175 parity oracle. No engine-protocol changes.
**Date**: 2026-05-19
**Dependencies**:
- `archive/specs/175-wasm-ts-fallback-contract-enforcement.md` (the parity-oracle architecture this spec extends)
- `archive/specs/174-wasm-preview-drive-coverage-extension.md` (unsupported-class taxonomy this spec adds a new entry to)
- `archive/specs/150-fitl-policy-vm-wasm-port.md` (original parity oracle introduction)

**Trigger**: PR #268 (`implemented-spec-182`) — `arvn-tournament-wasm-equivalence.test.ts` failure at decision 47 for the FITL VC seat. Root cause traced to the WASM production preview drive returning `undefined` for the `preview.victory.currentMargin.self` reference on the `tax` action, while the TypeScript preview evaluator returns the actual projected margin (-3 in the failing trace). The coalesce expression `coalesce(preview, feature.selfMargin)` then resolves to the state-feature fallback (-1) in the WASM path, so the candidate-feature row WASM stores in `candidateFeatureCache` diverges from the value TS would have stored. When that row feeds the `minMarginScore` / `maxMarginScore` aggregates the VC profile's `preferNormalizedMargin` consideration consumes, the divergence becomes a uniform 500-point offset across all 19 candidates at decision 47.

**Ticket namespace**: `184WASMPREAGCOV` (proposed)

---

## 1. Goal

Extend the WASM production preview drive so it returns TS-equivalent values for every action whose result is observable through a candidate-feature that an aggregate in the profile's plan reads. Remove the defensive TS fallback added in commit `a651c3a41` once equivalence is proven across the failing-case corpus.

## 2. Non-Goals

- **No engine-protocol changes.** The preview-drive contract (`materializePreviewDynamicRowsWithWasm` returns `null` for unsupported shapes; the caller's TS fallback is the oracle) is correct as-is. This spec only widens the set of supported shapes; it does not add new return values, new unsupported sentinels, or new caller branches.
- **No PolicyAgent / consideration / aggregate semantics changes.** TS evaluator behavior is the oracle; WASM must match it. No CNL/DSL extensions.
- **No Foundation amendments.** Foundations #8 (Determinism Is Sacred) and #20 (Preview Signal Integrity) already require WASM/TS equivalence. This spec implements that requirement for one more action-shape class.
- **No fingerprint stability work.** The Texas regression that surfaced alongside this issue (commit `4b3e708`'s `pruningRules → guardrails` rename shifting Texas softmax via the profile fingerprint) is out of scope. That witness has been retargeted; whether the fingerprint should be stable under semantically-empty schema renames is a separate question.

## 3. Context (verified against codebase)

### 3.1 Reproduction

`packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts` is an `architectural-invariant` test that compares the production FITL tournament decision stream with WASM enabled vs disabled, expecting byte-equivalent candidate-score rows for 80 player decisions. Before the defensive fix in PR #268, it diverged at decision 47:

```
DIVERGE at decision 47: seat=vc profile=vc-baseline action=rally(ts)/rally(wasm)
  tax|{}|false|operationPlusSpecialActivity: ts.projectedSelfMargin=-3 wasm.projectedSelfMargin=-1
  preferNormalizedMargin: ts.contribution=500 wasm.contribution=0  (× 18 candidates)
```

The first 46 decisions are identical. At decision 47, the VC seat's candidate set includes a `tax|{}|false|operationPlusSpecialActivity` candidate. The TS evaluator computes its `projectedSelfMargin = -3` via the preview path. The WASM production preview drive computes its `projectedSelfMargin = -1` because the preview ref resolves to undefined and the `coalesce` falls back to `feature.selfMargin = -1`.

That undefined-then-fallback shape propagates: `minMarginScore = min(projectedSelfMargin across candidates) = -3 (TS) / -1 (WASM)`. The `preferNormalizedMargin` consideration's value expression is

```
div(sub(projectedSelfMargin, minMarginScore), max(1, sub(maxMarginScore, minMarginScore)))
```

For non-`tax` candidates (selfMargin = -1, maxMargin = -1): TS gives `(-1 - -3)/max(1, -1 - -3) = 2/2 = 1`; WASM gives `(-1 - -1)/max(1, 0) = 0/1 = 0`. Multiplied by weight 500, every candidate's score differs by 500 in the two runs. Rally is the highest-scoring action in both, so the action chosen is identical — the test detects the divergence only via the candidate-score deepEqual.

### 3.2 Current defensive fallback

PR #268 lands a contained workaround in `packages/engine/src/agents/policy-wasm-score-routing.ts`:

```ts
const precomputedDynamicCandidateFeatures = previewFeatureRowsExerciseAggregate(input.profile, input.catalog, id)
  ? null
  : materializePreviewDynamicRowsWithWasm(input, collectPreviewDynamicRefs(feature.expr));
```

`previewFeatureRowsExerciseAggregate` inspects `profile.plan.candidateAggregates` and returns `true` whenever the candidate-feature about to be precomputed appears in any plan aggregate's `dependencies.candidateFeatures`. The forced `null` routes through the existing Spec 175 TS-fallback branch — the candidate-feature is evaluated via the TS preview evaluator and the WASM score-row stage reads the TS-equivalent value from `candidateFeatureCache`. The downstream WASM score-row evaluation runs as before; only the candidate-feature precompute path is bypassed.

This is correct (TS evaluator is the oracle, per Spec 175) but costs preview-drive throughput for every FITL profile that uses preview candidate features in aggregates. The arvn-evolved, vc-baseline, and us-baseline profiles all hit this branch.

### 3.3 Where the WASM preview drive returns undefined

`materializePreviewDynamicRowsWithWasm` in `packages/engine/src/agents/policy-wasm-score-routing.ts` delegates to `evaluateProductionPreviewDriveBatchWithWasm` in `packages/engine/src/agents/policy-wasm-production-preview-drive.ts`. The drive batches candidates by `actionId` and runs each group through `ludoforge_policy_vm_evaluate_preview_drive_batch` (the Rust-side WASM export, see `packages/engine-wasm/policy-vm/src/preview_drive.rs`).

The drive returns per-candidate preview-state words plus an outcome (`ready`, `stochastic`, `gated`, `failed`, `unresolved`). When the outcome is anything other than `ready` or `stochastic`, `previewValueFromWasmRow` returns `undefined`. The `tax` action specifically reaches the drive but ends with `outcome ∈ {failed, unresolved}` — the drive's state-mutation modeling does not match the kernel's actual `tax` outcome.

The full taxonomy of action shapes the drive does and does not model is the inventory work of phase 0 below.

## 4. Phases

| Phase | Scope | Acceptance |
|---|---|---|
| 0 | Inventory every action × profile pair where the production preview drive's outcome diverges from the TS preview evaluator's outcome. Use the FITL production tournament fixture (seed 1000, 4 seats, 80 decisions) as the minimum-required seed corpus; consume the multi-seed rollup produced by `packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs` (which already surfaces `wasmProductionPreviewDriveUnsupportedCount` and per-reason breakdowns) for broader shape coverage. For each divergence, record action-id, profile-id, preview-ref, drive outcome, TS outcome, and the underlying state-mutation shape the drive fails to model. | Inventory report under `reports/184-phase-0-wasm-preview-drive-divergence-inventory.md`. Counts must match the 15-seed report output at the chosen commit. |
| 1 | For each inventory entry, classify the divergence as (a) extend the drive to model this action's state mutation, (b) document as legitimately-unsupported and rely on the existing Spec 175 null-return fallback, or (c) drive should already model this — fix the bug. | Classification table appended to the phase-0 report. Each entry has a one-line rationale and a target phase (2 or 3). |
| 2 | Implement (a)-classified extensions in `packages/engine-wasm/policy-vm/src/preview_drive.rs` and supporting JS marshaling. Each extension lands with a parity-oracle fixture proving WASM-on equals WASM-off for the action × profile pair. | Every (a)-classified entry has a parity fixture entry in `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts`; `pnpm turbo test` passes including the new fixtures; the 15-seed report (`profile-fitl-arvn-15-seed-decomposition.mjs`) records lower `wasmProductionPreviewDriveUnsupportedCount` for the newly-supported reasons. |
| 3 | For (b)-classified entries, document the rationale in `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` near the relevant `recordProductionPolicyWasmPreviewDrive('unsupported', ...)` call AND extend the Spec 174 reason-coverage enforcement: add a fixture entry to `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts` and the matching enumeration row to `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-reason-coverage.test.ts` so each new unsupported reason has a parity fixture asserting the null-return → TS-fallback path runs and produces the canonical answer. | Header comment present; reason-coverage enumeration extended; parity fixture covers each (b)-classified entry; `pnpm turbo test` passes. |
| 3.5 | Add the missing seat-context dimension for `$seat` seat-matrix preview dynamic rows, so aggregate-fed refs such as `preview.victory.currentMargin.$seat` can carry one value per candidate/ref/seat-context instead of collapsing to a single scalar or falling back. This phase was added after the Phase 4 removal probe failed on 2026-05-19. | Focused `$seat` preview-drive equivalence coverage passes; `arvn-tournament-wasm-equivalence.test.ts` passes with the defensive aggregate fallback still present; unsupported-reason coverage is updated if the prior `victoryCurrentMargin` unsupported reason is removed or narrowed. |
| 3.6 | Diagnose and fix the remaining preview-drive parity gap exposed by the 2026-05-20 fallback-removal probe after Phase 3.5. The probe still failed at ARVN decision 47 with WASM candidate scores 500 lower than TypeScript for aggregate-fed margin candidates, so Phase 3.5 was necessary but insufficient. A later same-day probe showed the decisive residual row was `tax|{}|false|operationPlusSpecialActivity` (`projectedSelfMargin` -1 in WASM vs -3 in TypeScript) and that generic `chooseN` max-prefix binding was not enough; user-approved option 1 scopes this phase to a row-level Spec 175 TS-oracle fallback for non-ready aggregate-fed preview rows, not full gated continuation modeling. | With the aggregate fallback bypassed, `arvn-tournament-wasm-equivalence.test.ts` no longer reproduces the decision-47 score-row divergence; the fix is covered by a focused parity or production-route fixture. |
| 4 | Remove the defensive `previewFeatureRowsExerciseAggregate` fallback added by commit `a651c3a41`, after Phase 3.6 lands. The arvn-tournament-wasm-equivalence test must still pass with the WASM drive engaged on the previously-divergent paths, and the row-local TS-oracle replacement path must be explicitly visible in telemetry so Foundation #20 provenance is not inferred from byte-equivalence alone. | Function removed from `packages/engine/src/agents/policy-wasm-score-routing.ts`; `pnpm -F @ludoforge/engine test:integration:policy-canaries` passes; the 15-seed report (`profile-fitl-arvn-15-seed-decomposition.mjs`) records same or higher `wasmProductionPreviewDriveRouteCount`, no new unsupported reason classes, and a non-zero `wasmPreviewCandidateFeatureRowOracleFallbackCount` for row-local TS-oracle replacements. |

## 5. Acceptance criteria

- `packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts` passes with the defensive fallback removed after the Phase 3.5 `$seat` dynamic-row prerequisite lands.
- Every action × profile shape the FITL production tournament exercises in the seed-1000 corpus has either: (i) drive support and a parity fixture, or (ii) documented null-return rationale and a parity fixture asserting the TS fallback path.
- The 15-seed report (`packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs`) shows ≥ baseline `wasmProductionPreviewDriveRouteCount`, no new unsupported reason classes, and an explicit non-zero row-local TS-oracle fallback count for aggregate-fed preview candidate-feature rows whose WASM preview value is unavailable or non-ready. The unsupported count may rise because deleting the broad aggregate bypass exposes previously hidden, already documented unsupported classes; this is acceptable only when the unsupported reason class set does not widen and the row-local fallback count is visible.
- No regression in `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` or `packages/engine/test/integration/policy-wasm-preview-drive-equivalence.test.ts`.

## 6. Risks

- **Drive extension may be deeper than expected.** If `tax` (and analogues) require modeling kernel effects the drive does not currently support, phase 2 could grow significantly. Mitigation: phase 0's inventory determines the actual surface area; if phase 2 is too large, increase the (b) classification share and accept the defensive-fallback perf cost permanently for those shapes.
- **Determinism preserved.** Drive output is deterministic by construction (same encoded state + same bytecode = same result). No new determinism surface area.
- **Spec 175 contract continues to apply.** Any new unsupported-detection branch added in phase 3 MUST return null (not throw) per Spec 175 §3. Architecture-test enforcement already covers this.

## 7. Trace fields and telemetry

No new trace fields. Existing telemetry surfaces are sufficient:
- `recordProductionPolicyWasmPreviewDrive('unsupported', { unsupportedDriveClass, unsupportedOwner, reason })` already records each unsupported shape. Phase 0's inventory consumes this counter.
- `getProductionPolicyWasmPreviewDriveUnsupportedReasonCounts()` returns the per-reason counter shape this spec consumes.

## 8. Out-of-scope follow-ups

- Profile-fingerprint stability under schema-empty renames (`pruningRules: {}` → no field) is a separate question. The fingerprint is currently a hash of the compiled profile shape, including empty fields; removing an empty field changes the hash, which changes the policy-eval selection RNG seed, which can shift softmax-sample trajectories by one or more decisions. PR #268 retargeted the affected Texas convergence witness; whether the fingerprint should be stable under schema migrations is a design question outside this spec's scope.
- Defensive WASM-vs-TS spot-check at preview-drive boundaries. The cost is high (effectively running both paths), but a sampling-based check could surface future regressions of this shape before they reach CI. Out of scope here; consider as a `validate-preview-inner-warning-parity`-style watchdog if drive coverage stays partial after phase 4.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-19:

- [`archive/tickets/184WASMPREDRI-001.md`](../archive/tickets/184WASMPREDRI-001.md) — Phase 0+1 — Inventory and classify WASM preview-drive divergences (covers §4 Phases 0 and 1)
- [`archive/tickets/184WASMPREDRI-002.md`](../archive/tickets/184WASMPREDRI-002.md) — Phase 2 — Extend WASM preview drive for (a)-classified action shapes (covers §4 Phase 2)
- [`archive/tickets/184WASMPREDRI-003.md`](../archive/tickets/184WASMPREDRI-003.md) — Phase 3 — Document (b)-classified unsupported reasons + extend reason-coverage (covers §4 Phase 3)
- [`archive/tickets/184WASMPREDRI-005.md`](../archive/tickets/184WASMPREDRI-005.md) — Phase 3.5 — Add seat-matrix dynamic rows for aggregate-fed preview refs (covers §4 Phase 3.5)
- [`archive/tickets/184WASMPREDRI-006.md`](../archive/tickets/184WASMPREDRI-006.md) — Phase 3.6 — Fix remaining decision-47 preview-drive parity gap after seat-matrix support (covers §4 Phase 3.6)
- [`archive/tickets/184WASMPREDRI-004.md`](../archive/tickets/184WASMPREDRI-004.md) — Phase 4 — Remove defensive aggregate-coverage fallback after ticket 006 (covers §4 Phase 4)
