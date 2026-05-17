# 178CONTDEEPINNER-002: Phase 1 — Targeted optimization of named subroutine owner + outcome-parity test

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-preview-inner.ts` (optimization of the Phase 0 named subroutine owner); possibly `packages/engine/src/agents/policy-agent-inner-preview.ts` if dictated by Phase 0 evidence
**Deps**: `archive/tickets/178CONTDEEPINNER-001.md`

## Problem

Phase 0 (`178CONTDEEPINNER-001`) identifies a single concrete subroutine owner inside `runChooseOneInnerPreview` whose wall ms clears the 5% same-run-slow-tier bar on `coupArvnRedeployPolice:chooseOne | continuedDeepening`. The plausible candidates pre-Phase-0 are `driveOption` (per-option preview drive through the completion-policy chain), `resolveRefs` (per-option ref resolution against the projected state), and the per-call `surfaceContext` / `seatResolutionIndex` build. Phase 1 implements one optimization for that owner.

Without preserving selected option outcomes — i.e., the chosen `MoveParamValue` for each `coupArvn*:chooseOne` decision under the witness corpus — the optimization risks shifting policy behavior, which would mask itself as a perf win while introducing a quality regression. Foundation #20 also requires that route counts, unsupported reasons, hidden/stochastic/depthCap distinctions, advisory carriers, and `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` markings remain unchanged within noise.

This ticket lands the optimization and the outcome-parity test together so the parity proof and the perf win cannot diverge.

## Assumption Reassessment (2026-05-17)

1. **Phase 0 produces a named subroutine owner.** Verified by `178CONTDEEPINNER-001`'s acceptance #5: the Phase 0 report identifies the owner by name and confirms it clears the 5% bar, OR explicitly recommends a different next step (investigation / stop) that would prevent this ticket from being implemented as written. Re-read `reports/178-phase-0-inner-preview-subroutine-split.md` at implementation time to confirm the named owner before designing the optimization.
2. **Plausible optimization candidates pre-Phase-0**:
   - If `resolveRefs` dominates: memoize ref resolution across options whose projected-state fingerprint (e.g., zobrist hash or equivalent) is identical, since `resolveRefs` is deterministic in its `(state, refIds, surfaceContext, seatResolutionIndex)` inputs.
   - If `driveOption` dominates: short-circuit `driveOption` for options whose completion-policy trajectory is trivially determinable (e.g., the option immediately enters a terminal `seat-or-turn-boundary` state per the existing Phase 3 classification).
   - If surfaceContext / seatResolutionIndex setup dominates: hoist or cache work that's currently redundant across `runChooseOneInnerPreview` calls — though spec §3.3 notes the setup already lives outside the per-option loop, so this is the least likely Phase 0 outcome.
3. **The actual optimization choice is deferred to Phase 0 evidence.** Spec §10 explicitly defers Phase 1 candidate selection. The implementer reassesses against the Phase 0 report at the start of this ticket and finalizes the candidate before any code change.
4. **Outcome-parity proof requires a fixed seed × profile corpus.** Acceptance #3 mandates at least the five Phase 4 witness seeds (`1005,1011,1008,1013,1009`); the corpus should run against the unchanged production `arvn-evolved` profile. The test compares pre- and post-change microturn decision sequences and asserts identity.
5. **Foundation #20 carriers preserved within noise.** The `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisory and `tiebreakAfterPreviewNoSignal` markings are emitted via the kernel advisory channel; route counts and unsupported reasons are captured in the witness CSV. Phase 2 (`178CONTDEEPINNER-003`) validates the counter parity end-to-end; Phase 1's outcome-parity test additionally asserts the per-decision provenance fields are unchanged.

## Architecture Check

1. **Generic engine code only.** The optimization lands at the generic policy-preview-inner seam (`packages/engine/src/agents/policy-preview-inner.ts`) or its caller (`policy-agent-inner-preview.ts`). No FITL-specific branch, no per-game predicate, no profile-keyed guard.
2. **No Foundation #20 carrier collapse.** The optimization must not coerce an unavailable ref, depth-cap signal, or stochastic outcome into a `ready` numeric contribution. Memoization keyed on projected-state fingerprint preserves per-option `resolvedRefs` semantics because `resolveRefs` is a function of its inputs; the memoization caches the same output, not a substituted one. Any short-circuit must produce the same `ChooseOneInnerPreviewResult` shape — including `resolvedRefs` map and outcome field — as the non-short-circuit path.
3. **No backwards-compatibility path.** No env-flag-gated old code path, no `_legacy` suffix, no parallel function for the un-optimized version. The optimization replaces the slow path in place. Foundation #14 satisfied.
4. **Outcome-parity test as architectural invariant, not convergence witness.** Per `.claude/rules/testing.md`, the property "post-optimization decisions equal pre-optimization decisions on the same `(state, seed, profile)` triple" is a property that must hold across any legitimate kernel evolution within the spec's scope. The test marker is `@test-class: architectural-invariant`; the corpus is parameterized over the witness seeds rather than pinning a single seed.

## What to Change

### 1. Re-read the Phase 0 report and finalize the optimization candidate

Before any code change, read `reports/178-phase-0-inner-preview-subroutine-split.md` and confirm:

- Which subroutine sub-key clears the 5% bar (the named owner).
- The owner's per-decision wall-time signature (e.g., uniform across all 58 decisions, or concentrated in a subset).
- Whether the residual breakdown suggests a single-call hot path or aggregate per-option work.

Pick the optimization candidate based on the evidence. Plausible candidates listed in Assumption Reassessment #2. The optimization must satisfy three predicates:

- **Generic** — no FITL branches, no per-game guard.
- **Outcome-preserving** — produces identical `ChooseOneInnerPreviewResult` per option, including `resolvedRefs`, `outcome`, `driveDepth`, and `completionPolicyFallbackCount`.
- **Foundation #20 carrier-preserving** — no change to route counters, unsupported reasons, advisory status, hidden/stochastic/depthCap distinctions.

### 2. Implement the optimization

Land the change in `packages/engine/src/agents/policy-preview-inner.ts` (the natural site for `driveOption` / `resolveRefs` work). If Phase 0 evidence shows the named owner crosses files (e.g., calls into `policy-agent-inner-preview.ts`'s wrapping orchestration), modify both — but keep the diff minimal and confined to the optimization seam.

Add a brief comment at the optimization site (one short line, per CLAUDE.md guideline) only if the WHY is non-obvious — e.g., "Memoization keyed on projected-state fingerprint; safe because resolveRefs is a pure function of (state, refIds, surfaceContext, seatResolutionIndex)."

### 3. Add the outcome-parity architectural-invariant test

Create `packages/engine/test/architecture/policy-preview-inner-outcome-parity.test.ts` (or extend an existing architectural-invariant file under `packages/engine/test/architecture/` that covers the policy-preview-inner seam — re-check at implementation time). The test:

- Declares `// @test-class: architectural-invariant` at file top.
- Parameterizes over the five Phase 4 witness seeds `[1005, 1011, 1008, 1013, 1009]`.
- For each seed, runs an `arvn-evolved` simulation to a bounded ply count (chosen to exercise the target axes — at minimum enough plies to trigger `coupArvnRedeployPolice:chooseOne | continuedDeepening` decisions).
- Records the per-decision `(decisionKey, selectedValue, scoreContributionsByOption)` triple.
- Asserts that the triple sequence equals a pinned pre-change reference. The reference is captured by running the unmodified codebase once at the start of this ticket and committing the fixture under `packages/engine/test/architecture/fixtures/178-outcome-parity-<seed>.json`.

The witness fixture files are checked-in artifacts; their commit message MUST be the same commit that lands the optimization, so the fixture and the optimization land atomically.

### 4. Optional Phase 0 instrumentation cleanup

If Phase 0 added per-option `resolveRefs` brackets and the Phase 0 report identified per-option overhead skew >2% (per spec §10 Open Question), this ticket downgrades the bracket to per-call aggregation. Otherwise, the Phase 0 brackets remain in place — they continue to provide attribution evidence for Phase 2's wall-time validation.

## Files to Touch

- `packages/engine/src/agents/policy-preview-inner.ts` (modify — optimization at the named subroutine owner)
- `packages/engine/src/agents/policy-agent-inner-preview.ts` (modify — only if Phase 0 evidence requires it; otherwise untouched)
- `packages/engine/test/architecture/policy-preview-inner-outcome-parity.test.ts` (new — architectural-invariant outcome-parity test)
- `packages/engine/test/architecture/fixtures/178-outcome-parity-1005.json` (new — pinned pre-change reference for seed 1005)
- `packages/engine/test/architecture/fixtures/178-outcome-parity-1011.json` (new — pinned pre-change reference for seed 1011)
- `packages/engine/test/architecture/fixtures/178-outcome-parity-1008.json` (new — pinned pre-change reference for seed 1008)
- `packages/engine/test/architecture/fixtures/178-outcome-parity-1013.json` (new — pinned pre-change reference for seed 1013)
- `packages/engine/test/architecture/fixtures/178-outcome-parity-1009.json` (new — pinned pre-change reference for seed 1009)

Likely surface — exact paths refined against Phase 0 named owner. If Phase 0 names `resolveRefs` as the owner, the optimization site is `policy-preview-inner.ts:455` (the `resolveRefs` definition) plus its `runChooseOneInnerPreview` caller at `:511-555`. If Phase 0 names `driveOption`, the modification scope expands to include the (currently private) `driveOption` helper in the same file.

## Out of Scope

- No witness command rerun in this ticket — Phase 2 (`178CONTDEEPINNER-003`) owns end-to-end wall-time validation. This ticket lands the optimization and proves outcome parity only.
- No optimization of subroutines other than the Phase 0 named owner. If Phase 0 finds multiple sub-keys near the bar but only one clears it, this ticket attacks only the one that clears.
- No `chooseNStep` deep-pass orchestration optimization (spec §9 Out of Scope).
- No WASM route extension, no GameSpecDoc / visual config / kernel change, no policy-profile parameter change.
- No new advisory carrier or unsupported-reason class. Foundation #20 carriers preserved.
- No CI integration of the outcome-parity test as a quality gate beyond the existing `pnpm turbo test` invocation — the test runs in the default suite.
- No back-port of the optimization to the `chooseNStep` broad-pass equivalent even if structurally analogous (deferred per spec §10).

## Acceptance Criteria

### Tests That Must Pass

1. The new outcome-parity architectural-invariant test passes on all five witness seeds, asserting per-decision `(decisionKey, selectedValue, scoreContributionsByOption)` identity against the pinned pre-change fixtures.
2. Existing kernel determinism corpus (`packages/engine/test/determinism/`) continues to pass — the optimization preserves replay identity.
3. Existing Phase 0 residual-split test (`packages/engine/test/unit/infrastructure/profile-fitl-arvn-report-rendering.test.ts`) continues to pass.
4. `pnpm turbo test` passes at workspace root (covers engine unit + architecture + determinism).
5. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck` pass at workspace root.
6. `pnpm run check:ticket-deps` passes.

### Invariants

1. Per-decision selected `MoveParamValue` for every `coupArvn*:chooseOne` decision on the witness corpus is unchanged pre- vs. post-optimization.
2. `scoreContributionsByOption` map for every decision is structurally identical (same keys, same per-contribution values within floating-point tolerance).
3. Route counters, unsupported reasons, advisory status, hidden/stochastic/depthCap distinctions, `tiebreakAfterPreviewNoSignal` markings, and `POLICY_PREVIEW_SIGNAL_UNAVAILABLE` advisories on the witness corpus are unchanged within noise.
4. No new advisory carrier or unsupported-reason class is introduced.
5. The optimization is generic — no per-game predicate, no FITL branch, no profile-keyed guard.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/policy-preview-inner-outcome-parity.test.ts` — new architectural-invariant test (marker `@test-class: architectural-invariant`) proving outcome parity across the five witness seeds against pinned pre-change fixtures.
2. `packages/engine/test/architecture/fixtures/178-outcome-parity-<seed>.json` — five new pinned fixtures captured from the unmodified codebase at the start of this ticket and committed atomically with the optimization.

### Commands

1. **Capture pre-change fixtures** (before any source edit): run a one-off script to record the per-decision triple sequence per witness seed; write to `packages/engine/test/architecture/fixtures/178-outcome-parity-<seed>.json`.
2. `pnpm -F @ludoforge/engine build`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/policy-preview-inner-outcome-parity.test.js`
4. `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/` (replay identity)
5. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`
6. `pnpm run check:ticket-deps`
7. `git diff --check`

## Outcome

Completed on 2026-05-17.

- Phase 0 owner confirmed from `reports/178-phase-0-inner-preview-subroutine-split.md`: `policyInnerPreviewSubroutine:driveOption` is the named Phase 1 owner, with `6,804.08 ms` (`7.2562%` of same-run slow-tier wall) on `coupArvnRedeployPolice:chooseOne | continuedDeepening`.
- Optimization landed in `packages/engine/src/agents/policy-preview-inner.ts`: `driveOption` now constructs and maintains the per-option draft token-state index lazily only when the preview drive must continue past the first selected option. Immediate ready/stochastic/depth-cap/no-preview exits return the same canonical projected state and trace payload without paying the draft-index setup cost.
- `packages/engine/src/agents/policy-agent-inner-preview.ts` is `verified-no-edit`: Phase 0 named the private `driveOption` subroutine, and no caller orchestration change was needed.
- Outcome-parity test added at `packages/engine/test/architecture/policy-preview-inner-outcome-parity.test.ts` with `// @test-class: architectural-invariant`.
- Pre-change fixtures were captured after a fresh `pnpm -F @ludoforge/engine build` and before source edits:
  - `packages/engine/test/architecture/fixtures/178-outcome-parity-1005.json` (`63` parity rows)
  - `packages/engine/test/architecture/fixtures/178-outcome-parity-1011.json` (`31` parity rows)
  - `packages/engine/test/architecture/fixtures/178-outcome-parity-1008.json` (`60` parity rows)
  - `packages/engine/test/architecture/fixtures/178-outcome-parity-1013.json` (`34` parity rows)
  - `packages/engine/test/architecture/fixtures/178-outcome-parity-1009.json` (`46` parity rows)
- Witness-scope correction: the live trace does not carry the profiling script's `coupArvn*` classifier name in `decisionKey`. The test pins the stronger public trace surface: every `arvn-evolved` `chooseOne` decision whose `previewUsage.coverage.strategy` is `continuedDeepening` in the bounded seed run. Each row records `decisionKey`, selected `MoveParamValue`, selected stable key, `previewUsage`, advisories, per-option score contributions, preview outcomes, and preview-drive carriers.
- Foundation #20 carrier preservation is proved by byte-for-byte fixture parity over `previewUsage`, advisories, per-option unknown preview refs, preview outcomes, and preview-drive records. No new advisory carrier or unsupported-reason class was introduced.
- Generated/schema fallout: none expected; no GameSpecDoc, visual config, profile YAML, kernel schema, generated schema, or WASM ABI surface changed.
- Deferred scope: Phase 2 remains responsible for the post-optimization wall-time witness and report (`tickets/178CONTDEEPINNER-003.md`).
- Post-review correction: the lazy draft-index synchronization now applies the initial state-to-preview state zone delta only when the draft index is first created. Later synthetic-depth iterations rely on the already-synchronized draft index and only apply their own `prevState -> state` delta after the selected synthetic decision.
- Source-size ledger: `packages/engine/src/agents/policy-preview-inner.ts | before 562 | after 570 | crossed cap? no | active growth +8 | extraction/defer rationale: under cap and localized lazy-initialization change plus post-review guard | successor none`; `packages/engine/test/architecture/policy-preview-inner-outcome-parity.test.ts | before 0 | after 113 | crossed cap? no | active growth +113 | extraction/defer rationale: new focused architecture test under cap | successor none`.
- Final verification:
  - `pnpm -F @ludoforge/engine build` passed after the post-review correction.
  - `pnpm -F @ludoforge/engine exec node --test dist/test/architecture/policy-preview-inner-outcome-parity.test.js` passed after the post-review correction (`5` tests).
  - The drafted literal determinism command `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/` is stale: Node treated the directory as a module path and failed with `ERR_MODULE_NOT_FOUND`. This was classified as command-shape fallout, not a product failure, and replaced by the package-owned lane.
  - `pnpm -F @ludoforge/engine test:determinism` passed after the post-review correction (`23/23` files).
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/infrastructure/profile-fitl-arvn-report-rendering.test.js` passed after the post-review correction (`3` tests).
  - `pnpm turbo build` passed after the post-review correction. Engine and runner builds executed; engine-wasm build was a cache-hit supplemental lane. Runner emitted the pre-existing large-chunk warning, but the build completed.
  - `pnpm turbo lint` passed after the post-review correction. Engine lint executed; runner lint was a cache-hit supplemental lane.
  - `pnpm turbo typecheck` passed after the post-review correction. Engine and runner typechecks executed; engine build was cache-covered by the preceding fresh root build.
  - `pnpm turbo test` passed after the post-review correction (`5` tasks successful; `3` cached; engine default lane reported `92/92` files passed). Runner/jsdom emitted the existing `HTMLCanvasElement.getContext()` advisory and intentional canvas-recovery crash logs during tests, but the lane completed green.
  - `pnpm run check:ticket-deps` passed (`2` active tickets and `2391` archived tickets checked).
  - `git diff --check` passed for tracked diffs.
  - `git diff --no-index --check /dev/null <new-file>` produced no whitespace diagnostics for the new architecture test and all five untracked fixture files; exit code `1` is the expected diff-present status for `--no-index`.
