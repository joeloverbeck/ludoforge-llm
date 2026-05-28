# 206WASMCANDCOV-003: Extend dynamic candidate-feature row materialization (currentSurface leaves, cross-refs, null sentinel)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/agents/` (dynamic-row evaluator, classifier predicate); manifest re-bless; new equivalence test
**Deps**: `archive/tickets/206WASMCANDCOV-001.md`, `tickets/206WASMCANDCOV-002.md`

## Problem

The production FITL ARVN feature `projectedLeaderMarginDelta` drops to the TS oracle (losing WASM acceleration) because `evaluateDynamicCandidateFeatureRows` returns `null` unless the **top-level** expr is `seatAgg` (`packages/engine/src/agents/policy-wasm-dynamic-candidate-feature-rows.ts:187`). Its real shape is `coalesce(sub(feature.projectedCurrentLeaderMargin, seatAgg{role: currentLeader}(victory.currentMargin.$seat)), 0)` (`data/games/fire-in-the-lake/92-agents.md:305`) — a top-level `coalesce`, so it hits the guard.

Reassessment surfaced that lifting the guard **alone** is insufficient and dangerous: the inner role-`seatAgg` leaf `victory.currentMargin.$seat` is a non-preview `currentSurface` ref, and `evaluateDynamicCandidateFeatureExpr` returns `undefined` for any ref that is not `previewSurface`/`previewStateFeature` (`policy-wasm-dynamic-candidate-feature-rows.ts:80-85`). That `undefined` flows through `sub(…) → undefined` and is swallowed by the enclosing `coalesce(…, 0) → 0` (`:98-99`), producing a **silently-wrong `0`** instead of an oracle fallback — violating Foundation #8 (determinism / byte-equivalence) and #20 (preview-unavailable must not be silently coerced).

This ticket delivers the §4.2 correctness core: lift the guard, evaluate `currentSurface` leaves against current state, read prior `candidateFeatureRows` for `feature.<id>` cross-refs, and introduce a null-propagating sentinel distinct from `undefined` so a structurally-unmaterializable leaf aborts the whole row to the oracle rather than coalescing to a wrong value. It then updates the classifier predicate and re-blesses the manifest so `projectedLeaderMarginDelta` consciously flips to `wasm-row`.

## Assumption Reassessment (2026-05-28)

1. `evaluateDynamicCandidateFeatureExpr` (`policy-wasm-dynamic-candidate-feature-rows.ts:64`) recurses over `op`/`seatAgg`/`ref`; `resolveSeatAggOver` (`:41`) already handles `over: { role }`. The `ref` case (`:78-93`) accepts only `previewSurface`/`previewStateFeature`; `currentSurface` and `feature.<id>` (`library`/`candidateFeature`) refs fall through to `undefined` — confirmed.
2. `undefined` is overloaded: it means both "preview legitimately unavailable (must `coalesce` to fallback)" and "structurally unmaterializable leaf (must abort the row)". A distinct sentinel is required; `coalesce` (`:98-99`), `sub`/`add`/etc. type-guards must propagate the sentinel as a hard `null`-row abort rather than swallowing it.
3. The cross-ref target `projectedCurrentLeaderMargin` is itself a **preview**-cost row, so it is accumulated in `candidateFeatureRows` (`policy-wasm-score-routing.ts:517`) and surfaced to the bytecode VM as `precomputedPreviewCandidateFeatures` (`:589`), NOT the non-preview `precomputedCandidateFeatures` slice (`:586`). The TS dynamic-row evaluator must read the **unified** accumulator for `feature.<id>` lookups.
4. `currentSurface` `victory.currentMargin` is candidate-independent and computable once via `buildPolicyVictorySurface(def, state, runtime)` (`packages/engine/src/agents/policy-surface.ts:482`) — confirmed; suitable as a materializable leaf evaluated against the current state.
5. The classifier (`archive/tickets/206WASMCANDCOV-001.md`) and manifest (`tickets/206WASMCANDCOV-002.md`) currently classify `projectedLeaderMarginDelta` as `ts-oracle`; this ticket updates the predicate to count `currentSurface`/cross-ref leaves as materializable and re-blesses the manifest — the forcing-function diff the guard is designed to surface.

## Architecture Check

1. Adding `currentSurface` leaves to the materializable set (evaluated once against current state) plus a sentinel-based hard abort is the complete root-cause fix, not a patch: it makes the dynamic-row evaluator's success condition exactly "all leaves materializable" and guarantees any gap aborts to the oracle (Foundation #15). The sentinel removes the `undefined`-overloading that would otherwise let an unmaterializable leaf masquerade as a coalesce-able absence (Foundation #20).
2. Byte-equivalence with the TS oracle is preserved by construction: a row is only produced when every leaf is materializable; otherwise it returns `null` and the existing per-row oracle fallback (`policy-wasm-score-routing.ts:598-606`) takes over (Foundation #8).
3. Engine-agnostic: `currentSurface`/`previewSurface`/`seatAgg`/cross-ref handling is generic DSL evaluation; no FITL identifiers enter the evaluator (Foundation #1). FITL features appear only as test fixtures.
4. No backwards-compat shim: the top-level guard is removed, not aliased; the sentinel replaces the overloaded `undefined` semantics throughout the evaluator (Foundation #14).

## What to Change

### 1. Lift the top-level-`seatAgg` guard

In `evaluateDynamicCandidateFeatureRows` (`:177-193`), remove the `if (expr.kind !== 'seatAgg') return null` early-out; instead evaluate any expr through `evaluateDynamicCandidateFeatureExpr`, returning `null` for the whole row if any candidate evaluation yields the unmaterializable sentinel.

### 2. Null-propagating sentinel

Introduce a sentinel distinct from `undefined` (and from a legitimate numeric/boolean/`undefined` preview-unavailable value) representing "structurally unmaterializable leaf". Thread it through `evaluateDynamicCandidateFeatureExpr`: any `ref` the evaluator cannot materialize, and any unsupported op, returns the sentinel; `op` combinators (incl. `coalesce`) and `seatAgg` propagate the sentinel as a hard abort (they must NOT swallow it the way `coalesce` swallows `undefined`). `evaluateDynamicCandidateFeatureRows` maps any sentinel result to a `null` row.

### 3. Evaluate `currentSurface` leaves against current state

In the `ref` case (`:78-93`), evaluate non-preview `currentSurface` refs against `input.state` (candidate-independent; e.g. `buildPolicyVictorySurface(input.def, input.state, runtime)` for `victory.currentMargin`/`victory.currentRank`). Keep these distinct from preview-dynamic rows; they are constant across candidates.

### 4. `feature.<id>` cross-ref reads

Teach the `ref` case to resolve `library`/`candidateFeature` (`feature.<id>`) refs by reading the prior unified `candidateFeatureRows` accumulator (passed in from the route). A cross-ref whose row is absent (dependency was oracle-only) returns the sentinel → row aborts to oracle. Respect `plan.candidateFeatures` order (§5).

### 5. Update classifier predicate + re-bless manifest

Update the `archive/tickets/206WASMCANDCOV-001.md` classifier so `currentSurface` leaves and resolvable cross-refs count as materializable (the predicate must stay paired with the evaluator). Re-bless `packages/engine/test/fixtures/policy-wasm/candidate-feature-coverage.json` so `projectedLeaderMarginDelta → wasm-row` (`projectedAllyMarginDelta` stays `ts-oracle`).

## Files to Touch

- `packages/engine/src/agents/policy-wasm-dynamic-candidate-feature-rows.ts` (modify — lift guard, sentinel, currentSurface eval, cross-ref reads)
- `packages/engine/src/agents/policy-wasm-score-routing.ts` (modify — pass the unified accumulator to the dynamic-row evaluator for cross-ref lookups)
- `packages/engine/src/agents/policy-wasm-coverage-classifier.ts` (modify — currentSurface/cross-ref now materializable)
- `packages/engine/test/fixtures/policy-wasm/candidate-feature-coverage.json` (modify — re-bless `projectedLeaderMarginDelta`)
- `packages/engine/test/integration/policy-wasm-candidate-feature-materialization-equivalence.test.ts` (new — byte-equality WASM row vs TS oracle for `projectedLeaderMarginDelta`)

## Out of Scope

- Explicit `previewRelationship` deterministic deferral in the route — owned by `tickets/206WASMCANDCOV-004.md`. `projectedAllyMarginDelta` stays `ts-oracle` here.
- Full `preview.relationship.*` WASM materialization (§10 follow-on).
- Extending the bytecode VM to support `clamp`/`if`/`in`/`scheduleLowerBound` (§10 follow-on).
- Any scoring-semantics or trajectory change — values must remain byte-equal to the TS oracle (Foundation #8).

## Acceptance Criteria

### Tests That Must Pass

1. `projectedLeaderMarginDelta` WASM-materialized values are **byte-equal** to the TS oracle per candidate on the production ARVN corpus (new equivalence test) — no silently-wrong `0`.
2. The coverage manifest shows `projectedLeaderMarginDelta: wasm-row`, `projectedAllyMarginDelta: ts-oracle` after re-bless; the `tickets/206WASMCANDCOV-002.md` guard passes with the re-blessed fixture.
3. A synthetic feature with a genuinely unmaterializable leaf returns a `null` row and falls to the oracle (sentinel hard-abort), NOT a coalesced `0`.
4. `arvn-tournament-wasm-equivalence` stays green and `wasmPreviewCandidateFeatureRowOracleFallbackCount` reflects one fewer oracle fallback (the genuinely oracle-only features only): `pnpm -F @ludoforge/engine build && node --test "packages/engine/dist/test/integration/arvn-tournament-wasm-equivalence.test.js"`.
5. `policy-bytecode-equivalence` stays green: `node --test "packages/engine/dist/test/integration/policy-bytecode-equivalence.test.js"`.

### Invariants

1. **Determinism / byte-equivalence**: every WASM-materialized candidate-feature row equals the TS oracle exactly; no leaf-materialization gap is ever coerced into a numeric contribution (Foundation #8, #20).
2. **Hard-abort sentinel**: an unmaterializable leaf always aborts the whole row to `null` (oracle), never a partial/wrong value.
3. **Paired predicate**: the classifier's materializability decision matches the evaluator's capabilities after this ticket (no manifest-vs-runtime drift).
4. No trajectory change anywhere; replay-identity and Zobrist parity lanes unaffected.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/policy-wasm-candidate-feature-materialization-equivalence.test.ts` (new) — `// @test-class: architectural-invariant`; per-candidate byte-equality of WASM row vs TS oracle for `projectedLeaderMarginDelta` on the production ARVN corpus, plus a synthetic unmaterializable-leaf case asserting `null`-row/oracle fallback (not `0`).
2. `packages/engine/test/fixtures/policy-wasm/candidate-feature-coverage.json` (modify — re-bless via `UPDATE_GOLDEN=1`).
3. `packages/engine/test/unit/agents/policy-wasm-coverage-classifier.test.ts` (modify — currentSurface/cross-ref now classify `wasm-row`).

### Commands

1. `pnpm -F @ludoforge/engine build && node --test "packages/engine/dist/test/integration/policy-wasm-candidate-feature-materialization-equivalence.test.js"`
2. `node --test "packages/engine/dist/test/integration/arvn-tournament-wasm-equivalence.test.js" "packages/engine/dist/test/integration/policy-bytecode-equivalence.test.js" "packages/engine/dist/test/architecture/policy-wasm-coverage-manifest.test.js"`
3. `pnpm turbo lint typecheck && pnpm -F @ludoforge/engine test:all`
