# Spec 175 — WASM↔TS Fallback Contract Enforcement

**Status**: PROPOSED
**Priority**: High — addresses a structural correctness weakness exposed by commit `278003969` (`fix(wasm): graceful preview-drive fallback restores WASM/TS equivalence`).
**Complexity**: M — bounded scope; no new WASM coverage; no perf changes.
**Date**: 2026-05-17
**Dependencies**:
- `archive/specs/174-wasm-preview-drive-coverage-extension.md` (provides the unsupported-class taxonomy)
- `archive/specs/150-fitl-policy-vm-wasm-port.md` (original parity oracle introduction)
- `reports/174-phase-4i-post-fix-wasm-gate-decision.md` (records the bug that motivated this spec)
**Trigger report**: `reports/174-phase-4i-post-fix-wasm-gate-decision.md`
**Ticket namespace**: `175WASMTSFALCON` (proposal — finalized by `/spec-to-tickets`)

## 1. Goal

Eliminate the asymmetric-throw bug class in policy WASM glue code by making the WASM↔TS fallback contract uniformly enforced and test-proven for every unsupported preview-drive path. Prevent recurrence of bugs of the same shape as `278003969`.

## 2. Non-Goals

- No new WASM coverage. Currently-unsupported preview-drive classes remain unsupported.
- No FFI / marshaling / bytecode-cache changes.
- No perf changes. Wall-time should be unchanged (within noise) after this spec lands.
- No spec 174 reopening. Spec 174 is archived; its unsupported-class taxonomy is consumed as-is.
- No agent-behavior tuning. Profile data and policy bytecode unchanged.

## 3. Architecture

The bug pattern in `278003969`:

1. `materializePreviewDynamicRowsWithWasm` (in `packages/engine/src/agents/policy-wasm-score-routing.ts`) had three unsupported-path branches. Two threw `PolicyRuntimeError`; one (`cardEvent`) returned `null`.
2. The local null-handling code immediately downstream (`if (precomputedDynamicCandidateFeatures === null) { ... per-feature TS evaluation ... }`) handled the cardEvent path correctly but was bypassed by the throws.
3. The throws propagated to the catch-all at `packages/engine/src/agents/policy-eval.ts:909`, which produced a `kind: 'failure'` policy decision with `usedFallback: true`. The PolicyAgent then defaulted to arbitrary candidate selection — the all-zero-scores symptom recorded in the fix commit message.
4. The Phase 4 parity oracle (`packages/engine/test/integration/policy-bytecode-equivalence*.test.ts` and `policy-wasm-preview-drive-equivalence.test.ts`) did not catch this because its test inputs did not exhaustively enumerate the unsupported preview-drive shapes that triggered the buggy throws.

The architectural fix has three layers:

1. **Uniform contract**: Every WASM-side branch that detects an unsupported preview-drive shape MUST return null (or the analogous "fail-closed-with-TS-fallback" sentinel for its function's return type). No `throw new PolicyRuntimeError` is permitted in a WASM-side branch when a TS fallback is available at the call site.
2. **Static enforcement**: A repository-level check that prevents reintroduction. Either a lint rule, a grep-based architecture test under `packages/engine/test/architecture/`, or a structural test that walks the WASM glue source tree and reports any `throw new PolicyRuntimeError` site that resides in an unsupported-detection branch without proof of "no TS fallback available."
3. **Runtime parity coverage**: Every unsupported reason-string emitted by `policy-wasm-runtime-counters.ts` (`getProductionPolicyWasmPreviewDriveUnsupportedReasonCounts`) MUST have a parity-oracle test fixture proving that (a) the WASM-side branch returns null for that shape, (b) the TS fallback evaluator runs and produces correct scores, and (c) the WASM-on result equals the WASM-off result byte-for-byte for that shape.

## 4. Phases

| Phase | Scope | Acceptance |
|---|---|---|
| 0 | Inventory all existing `throw new PolicyRuntimeError` sites in `packages/engine/src/agents/policy-wasm-*.ts`. Classify each as "unsupported-detection branch with TS fallback available" (must convert to null-return) or "genuine fatal error with no TS fallback" (must remain a throw, documented with rationale). | Inventory report under `reports/175-phase-0-wasm-throw-site-inventory.md` lists every throw site, its file:line, and its classification. Counts MUST match a grep over the codebase at that commit. |
| 1 | Convert all phase-0 "unsupported-detection" sites to null-return (or the typed equivalent for non-nullable returns). Preserve the `recordProductionPolicyWasmPreview*` telemetry calls so unsupported-row counters remain accurate. | All converted sites return null on the unsupported path; existing tests pass; the post-conversion 15-seed witness records the same or higher route counts and same or lower unsupported counts vs the pre-conversion baseline. |
| 2 | Add static enforcement. Default: architecture test under `packages/engine/test/architecture/` that walks `packages/engine/src/agents/policy-wasm-*.ts` AST and flags any `throw new PolicyRuntimeError` whose surrounding branch lacks a documented "no-TS-fallback" justification comment. | Architecture test passes on current code; deliberately reintroducing a buggy throw in a test fixture causes the architecture test to fail. |
| 3 | Extend the parity oracle to cover every unsupported reason. For each `unsupportedDriveClass / unsupportedOwner / reason` triple emitted by the witness, add a parity-oracle fixture that (a) constructs an input known to hit that reason, (b) asserts WASM-side returns null, (c) asserts TS-fallback evaluator runs, (d) asserts WASM-on and WASM-off scores are byte-equivalent. | Every reason-string in the latest 15-seed witness has a corresponding parity fixture; `pnpm -F @ludoforge/engine test` passes including the new fixtures. |
| 4 | Documentation. Add a header comment to `policy-wasm-score-routing.ts` and `policy-preview-inner-deepening.ts` documenting the contract: "WASM-side unsupported-detection branches MUST return null; the caller's TS fallback is the correctness oracle; never throw from an unsupported branch when TS fallback is available; see spec 175." | Header comments present in both files; spec 175 referenced; a follow-up reader can identify the contract without reading this spec. |

## 5. Acceptance Criteria

1. No `throw new PolicyRuntimeError` in any `packages/engine/src/agents/policy-wasm-*.ts` file's unsupported-detection branch where a TS fallback exists at the call site. (Phase 1 + Phase 2 enforcement.)
2. Every unsupported reason in `getProductionPolicyWasmPreviewDriveUnsupportedReasonCounts` has a parity-oracle fixture proving WASM/TS equivalence. (Phase 3.)
3. The architecture test introduced in Phase 2 fails when a buggy throw is deliberately reintroduced. (Self-test of the enforcement.)
4. Post-spec 15-seed ARVN witness (`packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs`) records slow-tier median within ±10% of the Phase 4i baseline (`11536.43 ms`). No perf regression introduced.
5. WASM production preview-drive route, unsupported, and batch counters remain non-zero in post-spec witness — coverage is preserved, not reduced.
6. Every new test file added under `packages/engine/test/**` carries a `@test-class` marker per `.claude/rules/testing.md` (`architectural-invariant` is the expected default for the parity fixtures).

## 6. Foundation Alignment

| Foundation | Alignment |
|---|---|
| #14 No Backwards Compatibility | The asymmetric throw vs null-return is a backwards-compatibility hack pattern; this spec uniformly enforces the canonical null-return contract. |
| #15 Architectural Completeness | The WASM/TS dual-path requires a uniformly-enforced contract; spec 175 makes the contract explicit and structurally enforced rather than ad-hoc. |
| #16 Testing as Proof | Phase 4 of spec 174 mandated a parity oracle that should have caught `278003969`'s bug but did not. Phase 3 of this spec closes the test-coverage gap exhaustively. |
| #20 Preview Signal Integrity | The null-return path preserves `previewStatus`, `previewBranch`, `tiebreakAfterPreviewNoSignal`, and the `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory; the throw path bypassed those signals by short-circuiting to `kind: 'failure'`. |

## 7. Code Anchors

WASM-side branches (Phase 0 inventory targets):
- `packages/engine/src/agents/policy-wasm-score-routing.ts`
- `packages/engine/src/agents/policy-wasm-runtime.ts`
- `packages/engine/src/agents/policy-wasm-preview-drive.ts`
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts`
- `packages/engine/src/agents/policy-wasm-production-preview-drive-lowering.ts`
- `packages/engine/src/agents/policy-wasm-preview-drive-state-patch.ts`
- `packages/engine/src/agents/policy-wasm-preview-drive-state-patch-codec.ts`
- `packages/engine/src/agents/policy-wasm-preview-drive-completion.ts`
- `packages/engine/src/agents/policy-wasm-preview-choosenstep-continuation.ts`
- `packages/engine/src/agents/policy-wasm-preview-drive-slots.ts`

Call-site TS fallback (the catch-all that absorbed pre-fix throws):
- `packages/engine/src/agents/policy-eval.ts:909` (try/catch around the score routing call)
- `packages/engine/src/agents/policy-eval.ts:752` (the `!scoredWithWasm` branch — local TS evaluator)

Existing parity oracle (Phase 3 extension target):
- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence.test.ts`
- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts`
- `packages/engine/test/integration/policy-bytecode-equivalence-partial-visibility.test.ts`
- `packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts`

Counter API (Phase 3 enumeration source):
- `packages/engine/src/agents/policy-wasm-runtime-counters.ts` — `getProductionPolicyWasmPreviewDriveUnsupportedReasonCounts`

Architecture-test placement (Phase 2):
- `packages/engine/test/architecture/` (sibling to existing `architecture-*.test.ts` files)

## 8. Out of Scope

- WASM coverage extension to currently-unsupported preview-drive classes (`production-preview-drive.cardEventAction`, `production-preview-drive.actionBatch`, `production-deep-choosenstep-continuation.projectedState`, `production-preview-drive.chooseN`, `production-preview-drive.effect.popInterruptPhase`) — these remain fail-closed-with-TS-fallback. See spec 176 for the strategic question of whether WASM extension is worth pursuing at all.
- Performance optimization. If the parity-fixture additions reveal hot paths that warrant optimization, that's a follow-up spec.
- WASM bytecode / ABI changes. The contract is at the TS-glue boundary; the WASM module's behavior is unchanged.

## 9. Open Questions

- Phase 2 enforcement mechanism — AST-based architecture test vs ESLint custom rule vs simple grep test. Decision deferred to the Phase 2 implementer with a default of AST-based architecture test (matches existing `packages/engine/test/architecture/` convention).
- Whether to also retroactively audit non-WASM throws in `policy-wasm-*.ts` files that are NOT in unsupported-detection branches (e.g., genuine bytecode-validation errors). Default: no — Phase 0 classifies them as "remain a throw" and they're out of scope.

## 10. Tickets

Decomposed via `/spec-to-tickets` on 2026-05-17:

- [`archive/tickets/175WASMTSFALCON-001.md`](../archive/tickets/175WASMTSFALCON-001.md) — Phase 0 — Inventory & classify WASM throw sites (covers §4 Phase 0)
- [`tickets/175WASMTSFALCON-002.md`](../tickets/175WASMTSFALCON-002.md) — Phase 1 — Convert unsupported-detection throws to null-return (covers §4 Phase 1)
- [`tickets/175WASMTSFALCON-003.md`](../tickets/175WASMTSFALCON-003.md) — Phase 2 — Architecture test enforcing null-return contract (covers §4 Phase 2)
- [`tickets/175WASMTSFALCON-004.md`](../tickets/175WASMTSFALCON-004.md) — Phase 3 — Parity oracle coverage for every unsupported reason (covers §4 Phase 3)
- [`tickets/175WASMTSFALCON-005.md`](../tickets/175WASMTSFALCON-005.md) — Phase 4 — Contract documentation in WASM glue files (covers §4 Phase 4)
