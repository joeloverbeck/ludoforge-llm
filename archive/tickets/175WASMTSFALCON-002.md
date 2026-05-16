# 175WASMTSFALCON-002: Phase 1 — Convert unsupported-detection throws to null-return

**Status**: COMPLETED
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

## Implementation Outcome (2026-05-16)

Terminal state: `COMPLETED`.

What landed:

- Converted both class-A sites from ticket 001's inventory in `packages/engine/src/agents/policy-wasm-score-routing.ts`:
  - `evaluateWasmCandidateFeatureRow(...) === null` now records `recordProductionPolicyWasmPreviewCandidateFeatureRows('unsupported')`, carries `// @policy-wasm-unsupported: null-return`, and returns `false` so the caller's `!scoredWithWasm` branch evaluates the candidates in TypeScript.
  - `evaluateWasmMoveConsiderationScoreRows(...)` unsupported results now record `recordProductionPolicyWasmScoreRows('unsupported')`, carry `// @policy-wasm-unsupported: null-return`, and return `false` for the same caller fallback.
- Preserved the existing local null-handling branch for `materializePreviewDynamicRowsWithWasm(...) === null`, which evaluates the preview candidate feature in TypeScript and finalizes preview outcomes.
- Added `// @policy-wasm-unsupported: null-return` markers to the existing canonical null-return branches and the two newly converted class-A branches.
- Added `// @policy-wasm-throw: contract-violation` markers adjacent to all 83 preserved class-B/C throw sites under `packages/engine/src/agents/policy-wasm-*.ts`.
- Updated `packages/engine/test/unit/agents/policy-runtime-encoded.test.ts` so the preloaded-WASM unsupported score-row case now expects the intended TypeScript fallback success path and verifies the unsupported counter increment.
- Kept `policy-eval.ts`, WASM bytecode, ABI, marshaling, Phase 2 architecture tests, Phase 3 parity fixtures, and Phase 4 header documentation out of scope.
- Generated the required witness files:
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-1-post-conversion.md`
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-1-post-conversion.csv`

Authorization and file-size ledger:

- User-approved option 1 on 2026-05-16: preserve full ticket fidelity by adding all class-B/C marker comments now, with an explicit file-size deferral for over-cap files rather than extracting during this ticket.
- Source-size ledger: `path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor if any`
  - `packages/engine/src/agents/policy-wasm-preview-drive-completion.ts | 122 | 132 | no | +10 marker-only | under cap | none`
  - `packages/engine/src/agents/policy-wasm-preview-drive-slots.ts | 68 | 71 | no | +3 marker-only | under cap | none`
  - `packages/engine/src/agents/policy-wasm-preview-drive-state-patch-codec.ts | 202 | 209 | no | +7 marker-only | under cap | none`
  - `packages/engine/src/agents/policy-wasm-preview-drive-state-patch.ts | 298 | 313 | no | +15 marker-only | under cap | none`
  - `packages/engine/src/agents/policy-wasm-preview-drive.ts | 735 | 755 | no | +20 marker-only | near-cap marker comments; extraction would widen a Phase 1 classification seed | none`
  - `packages/engine/src/agents/policy-wasm-production-preview-drive.ts | 881 | 882 | no, preexisting oversize | +1 marker-only | user-approved deferral; extraction would widen this fallback-contract ticket | none`
  - `packages/engine/src/agents/policy-wasm-runtime-node-loader.ts | 70 | 71 | no | +1 marker-only | under cap | none`
  - `packages/engine/src/agents/policy-wasm-runtime.ts | 1360 | 1382 | no, preexisting oversize | +22 marker-only | user-approved deferral; extraction would widen this fallback-contract ticket | none`
  - `packages/engine/src/agents/policy-wasm-score-routing.ts | 569 | 556 | no | net -13 after conversion plus markers | under cap | none`

Marker and invariant checks:

- `rg -n "throw new PolicyRuntimeError" packages/engine/src/agents/policy-wasm-*.ts` now returns 4 rows, all preserved class-B sites in `policy-wasm-score-routing.ts`.
- `rg -n "throw " packages/engine/src/agents/policy-wasm-*.ts | wc -l` now returns `83`, matching the 83 preserved class-B/C sites.
- `rg -c "@policy-wasm-throw: contract-violation" packages/engine/src/agents/policy-wasm-*.ts` totals 83.
- `rg -c "@policy-wasm-unsupported: null-return" packages/engine/src/agents/policy-wasm-*.ts` totals 5: the 2 newly converted class-A branches plus 3 already-canonical null-return branches.

15-seed witness comparison:

| Metric | Baseline `2026-05-17-post-fix-wasm` | Post-conversion `2026-05-17-phase-1-post-conversion` | Verdict |
| --- | ---: | ---: | --- |
| Seeds completed | 15/15 | 15/15 | pass |
| WASM production preview-drive route count | 3125 | 3125 | pass, same |
| WASM production preview-drive unsupported count | 1998 | 1998 | pass, same |
| WASM production preview-drive batch count | 2648 | 2648 | pass, same |
| Baseline slow-tier median reference, seed 1009 wall ms | 11536.43 ms | 12081.98 ms | pass, +4.73%, within +/-10% |

Command ledger and proof status:

| Ticket section | Literal command/shorthand | Current/final citation |
| --- | --- | --- |
| Commands | `pnpm -F @ludoforge/engine build` | Passed after implementation and before focused proof. |
| Commands | `pnpm -F @ludoforge/engine test` | Initial run exposed a stale active-ticket unit expectation; after updating `policy-runtime-encoded.test.ts`, rerun passed: unit `5657/5657`, architecture `90/90`, default integration subset `85/85` files. |
| Acceptance Criteria | focused WASM/TS parity oracle files | Passed after the final broad rebuild via `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-wasm-preview-drive-equivalence.test.js dist/test/integration/policy-bytecode-equivalence-partial-visibility.test.js dist/test/integration/arvn-tournament-wasm-equivalence.test.js`; 5 tests passed. |
| Commands | `pnpm -F @ludoforge/engine test:e2e` | Passed: 6 tests. |
| Commands | `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-1-post-conversion` | Passed; wrote the report and CSV listed above. |
| Acceptance Criteria | `pnpm turbo test` | Passed: 5/5 tasks successful; `@ludoforge/engine-wasm:build` was the only cache-hit replay, with engine/runner build and tests run fresh. |
| Commands | `pnpm run check:ticket-deps` | Passed: dependency integrity check passed for 4 active tickets and 2371 archived tickets. |

Generated/schema fallout:

- Generated schema artifacts: none; no schema source or generated JSON contract changed.
- Generated witness artifacts: the two ticket-named `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-1-post-conversion.*` files are new checked-in evidence artifacts.
- Runtime surface breadth: policy/agent-only WASM score-routing fallback contract plus marker comments in WASM glue/codec files; no public GameDef, trace schema, runner, or UI contract change.

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

## Outcome

Completed: 2026-05-16.

What changed:

- Converted the two Phase 0 class-A WASM unsupported-detection branches in `packages/engine/src/agents/policy-wasm-score-routing.ts` from fail-closed `PolicyRuntimeError` throws to the existing `false`/TypeScript fallback sentinel while preserving `recordProductionPolicyWasmPreviewCandidateFeatureRows('unsupported')` and `recordProductionPolicyWasmScoreRows('unsupported')` telemetry.
- Added `// @policy-wasm-unsupported: null-return` markers to the converted and existing null-return branches, and `// @policy-wasm-throw: contract-violation` markers to all 83 preserved class-B/C throw sites under `packages/engine/src/agents/policy-wasm-*.ts`.
- Updated `packages/engine/test/unit/agents/policy-runtime-encoded.test.ts` so the preloaded-WASM unsupported score-row case asserts TypeScript fallback success plus unsupported-counter increment.
- Added the Phase 1 witness artifacts:
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-1-post-conversion.md`
  - `reports/fitl-arvn-15-seed-decomposition-2026-05-17-phase-1-post-conversion.csv`

Deviations from original plan:

- User approved option 1 on 2026-05-16 to add all required class-B/C marker comments even in preexisting over-800-line files, with extraction explicitly deferred from this Phase 1 fallback-contract ticket. The source-size ledger in `Implementation Outcome` records every touched source file and the deferral rationale.
- No schema, ABI, bytecode, marshaling, `policy-eval.ts`, runner, or public GameDef/trace contract changes landed.

Verification:

- `pnpm -F @ludoforge/engine build` passed.
- `pnpm -F @ludoforge/engine test` passed after updating the stale active-ticket unit expectation: unit `5657/5657`, architecture `90/90`, default integration subset `85/85` files.
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-wasm-preview-drive-equivalence.test.js dist/test/integration/policy-bytecode-equivalence-partial-visibility.test.js dist/test/integration/arvn-tournament-wasm-equivalence.test.js` passed: 5 tests.
- `pnpm -F @ludoforge/engine test:e2e` passed: 6 tests.
- `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --seeds 1000..1014 --timeout-ms 600000 --date 2026-05-17-phase-1-post-conversion` passed: 15/15 seeds, route count 3125, unsupported count 1998, batch count 2648, seed 1009 wall time +4.73% vs baseline.
- `pnpm turbo test` passed: 5/5 tasks successful; `@ludoforge/engine-wasm:build` was cache-hit supplemental, while engine/runner build and tests ran fresh.
- `pnpm run check:ticket-deps` passed before archival.
