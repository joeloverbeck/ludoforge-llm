# 175WASMTSFALCON-002: Phase 1 — Convert unsupported-detection throws to null-return

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-wasm-score-routing.ts` (and any other class-A sites Phase 0 identifies).
**Deps**: `archive/tickets/175WASMTSFALCON-001.md`

## Problem

Commit `278003969` fixed one instance of the asymmetric-throw bug pattern in `materializePreviewDynamicRowsWithWasm`: an unsupported-detection branch was returning `null` while sibling branches threw `PolicyRuntimeError`. The throws short-circuited to the `policy-eval.ts:909` catch-all, which emitted a `kind: 'failure'` PolicyAgent decision with `usedFallback: true` and arbitrary candidate selection — visible as the all-zero-scores symptom in the fix commit message. The fix repaired the one branch caught in the post-merge ARVN witness but left the underlying asymmetric-throw pattern intact at other call sites identified by ticket 001's inventory.

This ticket converts every class-A throw site (per ticket 001) to a null-return (or the typed analog for non-nullable returns), preserves the `recordProductionPolicyWasm*` telemetry calls so unsupported-row counters remain accurate, and verifies that post-conversion behavior is at least as good as the pre-conversion baseline on the slow-tier ARVN witness.

## Assumption Reassessment (2026-05-17)

1. The class-A site count and exact `file:line` list come from ticket 001's `reports/175-phase-0-wasm-throw-site-inventory.md`. Implementation begins by reading that report and treating its per-site table as authoritative; if any class-A site Phase 0 lists no longer exists at this ticket's HEAD (e.g., upstream refactor changed line numbers or removed a branch), correct the report first under the Phase 0 sub-task before proceeding.
2. The current null-return reference branches inside `materializePreviewDynamicRowsWithWasm` (e.g., the `cardEventAction` branch at `policy-wasm-score-routing.ts:225`, the per-ref slot-empty branch at line 236, and the batch `result.kind !== 'supported'` branch at line 267) are the canonical pattern. Each preserves a `recordProductionPolicyWasmPreviewDrive('unsupported', { … })` or `recordProductionPolicyWasmPreviewCandidateFeatureRows('unsupported')` call before returning null. Converted sites mirror this shape.
3. For class-A sites whose enclosing function returns a non-nullable type, the conversion uses the function's existing "unsupported" sentinel if one exists (e.g., the `result.kind` discriminated-union pattern at `policy-wasm-score-routing.ts:526`). If no sentinel exists, propose one in the per-site comment and confirm via 1-3-1 before adding a new return shape — spec §3 does not authorize new abstractions, only contract uniformity.
4. The catch-all at `policy-eval.ts:909` continues to absorb class-B/C throws (legitimate contract violations). This ticket does NOT modify `policy-eval.ts`; the local null-handling branches downstream of each WASM call already perform the correct fallback.
5. Spec §4 Phase 1 acceptance requires that the post-conversion 15-seed witness records "same or higher route counts and same or lower unsupported counts vs the pre-conversion baseline." The baseline is the latest pre-conversion witness — `reports/fitl-arvn-15-seed-decomposition-2026-05-17-post-fix-wasm.md`. The comparison is recorded inline in the ticket Outcome.

## Architecture Check

1. **Uniform contract**: After this ticket, every WASM-side unsupported-detection branch returns null (or the typed equivalent). The call site is the single locus that decides whether to invoke the TS fallback. This removes the asymmetric-throw bug class structurally, not by hardening the catch-all.
2. **Foundation 14 alignment**: The asymmetric throw vs null-return inconsistency is a backwards-compatibility hack pattern (some branches' historical authors chose throw, others chose null, without a unifying contract). The conversion eliminates the hack uniformly in one ticket; no transitional period.
3. **Foundation 20 alignment** (Preview Signal Integrity): The null-return path preserves `previewStatus`, `previewBranch`, `tiebreakAfterPreviewNoSignal`, and the `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory because the TS fallback evaluator runs through the same preview-signal pipeline. The throw path bypassed those signals by short-circuiting to `kind: 'failure'`. Verified by ensuring telemetry calls are preserved at converted sites.
4. **No new abstractions**: The conversion uses each function's existing return shape — `null` for nullable returns, the existing `result.kind === 'unsupported'` discriminated-union variant for `tryScoreMoveConsiderationsWithWasm`. No new sentinels, types, or helpers introduced unless ticket 001's inventory explicitly authorizes one via 1-3-1.
5. **Counter integrity preserved**: Every converted site keeps its `recordProductionPolicyWasm*` telemetry call. Acceptance criterion #5 (counters remain non-zero) depends on this being preserved across the conversion.

## What to Change

### 1. Convert class-A throw sites

For each class-A site listed in `reports/175-phase-0-wasm-throw-site-inventory.md`:

1. Replace `throw new PolicyRuntimeError({ … })` with the appropriate null-return shape for the function's signature.
2. Preserve the existing `recordProductionPolicyWasm*` telemetry call adjacent to the conversion. If no such call exists at the converted site, add one with `unsupportedDriveClass`, `unsupportedOwner`, and `reason` fields drawn from the original `PolicyRuntimeError.detail` payload — every unsupported-detection branch must emit a counter event so Phase 3 can enumerate the reason for parity-fixture coverage.
3. Add a one-line comment marker adjacent to the converted return: `// @policy-wasm-unsupported: null-return` (Phase 2's architecture test will use this marker as the positive form to count converted sites; class-B/C sites get `// @policy-wasm-throw: contract-violation` adjacent to their preserved throws).
4. Confirm the function's caller has a working null-handling branch. The downstream null-handling code (e.g., the `if (precomputedDynamicCandidateFeatures === null) { ... per-feature TS evaluation ... }` block at `policy-wasm-score-routing.ts:417`) must already exist OR be added in the same diff — never leave a null return that flows to code that assumes non-null.

### 2. Preserve class-B and class-C throws

Class-B (contract-violation) and class-C (codec/internal-contract) sites remain throws. Add a one-line `// @policy-wasm-throw: contract-violation` comment adjacent to each so Phase 2's architecture test can statically distinguish authorized throws from buggy ones.

### 3. Run the 15-seed witness for the acceptance comparison

After the conversions, run:

```
node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs \
  --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-1-post-conversion
```

Compare the resulting CSV against `reports/fitl-arvn-15-seed-decomposition-2026-05-17-post-fix-wasm.csv`:

- WASM production preview-drive route count: same or higher.
- WASM production preview-drive unsupported count: same or lower (or moved between class-A sites without crossing into supported routes shrinking).
- WASM production preview-drive batch count: same or higher.
- Slow-tier median wall ms: within ±10% of `11536.43 ms` (acceptance criterion #4).

Record the comparison in the ticket Outcome on completion. Keep the new report file in `reports/`.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-score-routing.ts` (modify — class-A throw conversions at lines 465, 528, 550 if ticket 001 classifies them as A; lines 53, 373, 399 are expected to remain throws as class-B contract-violation sites)
- Any other `packages/engine/src/agents/policy-wasm-*.ts` files ticket 001's per-site table identifies as containing class-A sites (modify)
- `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-1-post-conversion.md` (new — witness report comparing route/unsupported/batch counts and slow-tier wall ms against the pre-conversion baseline)
- `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-1-post-conversion.csv` (new — accompanying CSV from the profile-fitl-arvn-15-seed-decomposition.mjs run)

Likely surface — the exact `policy-wasm-*.ts` modification set is refined against ticket 001's inventory at implementation time. The current grep identifies `policy-wasm-score-routing.ts` as the sole file with `PolicyRuntimeError` throws; other `policy-wasm-*.ts` files contain only class-C codec throws.

## Out of Scope

- Modifying `policy-eval.ts` (the catch-all and TS-fallback branch are unchanged).
- Adding new types, sentinels, or helpers beyond what existing return shapes already provide (unless 1-3-1 escalation in ticket 001).
- Changing WASM bytecode, ABI, or marshaling layer.
- Architecture-test authoring (Phase 2 / ticket 003).
- Parity-fixture authoring (Phase 3 / ticket 004).
- Documentation header comments (Phase 4 / ticket 005).
- Performance optimization — wall-time is expected to be within noise; if a converted site causes a measurable per-decision regression, file a follow-up under spec 176 rather than re-tuning within this ticket.

## Acceptance Criteria

### Tests That Must Pass

1. Existing engine suite: `pnpm turbo test` passes.
2. Existing WASM/TS parity oracle: `packages/engine/test/integration/policy-wasm-preview-drive-equivalence.test.ts`, `policy-bytecode-equivalence-partial-visibility.test.ts`, and `arvn-tournament-wasm-equivalence.test.ts` all pass post-conversion.
3. The 15-seed witness CSV reports WASM production preview-drive route count ≥ baseline, unsupported count ≤ baseline, batch count ≥ baseline; slow-tier median wall ms within ±10% of `11536.43 ms`.

### Invariants

1. No `throw new PolicyRuntimeError` remains in any `packages/engine/src/agents/policy-wasm-*.ts` branch classified as class-A by ticket 001.
2. Every class-A converted site preserves its adjacent `recordProductionPolicyWasm*` telemetry call.
3. Every WASM-side branch under `packages/engine/src/agents/policy-wasm-*.ts` carries exactly one of the two comment markers: `// @policy-wasm-unsupported: null-return` (for converted class-A sites) or `// @policy-wasm-throw: contract-violation` (for preserved class-B/C sites).
4. The downstream caller of every converted site handles `null` correctly via an existing or newly-added null-check branch that invokes the TS fallback evaluator.

## Test Plan

### New/Modified Tests

1. No new test files in this ticket — existing parity-oracle integration tests must continue to pass. Phase 3 (ticket 004) authors the per-reason parity fixtures that prove every unsupported reason has byte-equivalent WASM-on / WASM-off outputs.
2. If a converted site lacks downstream test coverage (no existing integration test exercises the unsupported reason that site emits), file the gap as a Phase 3 prerequisite — do not silently leave a converted site uncovered.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test` — full engine suite.
2. `pnpm -F @ludoforge/engine test:e2e` — end-to-end parity coverage.
3. `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-1-post-conversion` — acceptance criterion #4 / #5 witness.
4. `pnpm run check:ticket-deps` — dep integrity.
