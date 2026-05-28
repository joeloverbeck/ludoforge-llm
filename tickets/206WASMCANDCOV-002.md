# 206WASMCANDCOV-002: Coverage manifest fixture + architectural-invariant guard test

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/test/` (new manifest fixture + standing architectural-invariant test); no `src/` behavior change
**Deps**: `tickets/206WASMCANDCOV-001.md`

## Problem

The classifier from `tickets/206WASMCANDCOV-001.md` computes coverage verdicts but nothing yet asserts them against a checked-in baseline. Without a standing artifact, a future policy ref family or candidate-feature shape (as `preview.relationship.*` did in Spec 201) can silently flip a production feature from WASM-row to TS-oracle, and it surfaces only via an unrelated invariant — exactly the PR #291 failure mode.

This ticket completes the §4.1 forcing function (§6 P0): a checked-in coverage manifest plus an architectural-invariant test that recomputes the verdicts for the production FITL profiles (and at least one non-FITL conformance game with agents) and asserts equality with the manifest. A diff means a feature changed WASM coverage — review must consciously accept it (extend WASM via a later ticket, or accept TS-oracle and re-bless the manifest). This converts "silent acceleration loss" into "manifest diff in review."

## Assumption Reassessment (2026-05-28)

1. The classifier helper `classifyCandidateFeatureCoverage` is delivered by `tickets/206WASMCANDCOV-001.md` and is a pure static function (no WASM module, no game execution) — this test is therefore safe in the fast `default` lane (§11.2 decision).
2. The `UPDATE_GOLDEN=1` re-bless convention is established across the suite (e.g. `packages/engine/test/architecture/policy-preview-inner-outcome-parity.test.ts`, `packages/engine/test/determinism/plan-semantic-correspondence-golden.test.ts`) — reuse it for the manifest.
3. The proposed fixture path `packages/engine/test/fixtures/policy-wasm/candidate-feature-coverage.json` and its parent dir do **not** exist yet (confirmed by reassessment) — both are created here.
4. Non-FITL games `generic-control` and `texas-holdem` both declare `preview: mode: disabled` (`data/games/*/92-agents.md`) — confirmed. Their manifest entries are therefore **empty**; the test still asserts the agnostic classifier runs and emits zero entries on zero-preview profiles (§5 edge case, §11.3 decision). Real per-feature coverage classification ships FITL-only.
5. Current expected FITL verdicts (pre-§4.2): `projectedCurrentLeaderMargin: wasm-row`; `projectedLeaderMarginDelta: ts-oracle`; `projectedAllyMarginDelta: ts-oracle`. `tickets/206WASMCANDCOV-003.md` will re-bless `projectedLeaderMarginDelta → wasm-row` as a conscious change.

## Architecture Check

1. The manifest is keyed per-`(profileId, featureExprFingerprint)`, not per-`(gameDefHash, profileId)` (§11.1 decision). Coverage is a deterministic function of the compiled feature expr plus the route's materializability predicates — not the rest of the GameDef — so fingerprinting the expr re-blesses exactly when coverage can change and avoids churn on every unrelated FITL `gameDefHash` shift. This aligns with Foundation #13 (artifact identity tied to the thing that determines the property).
2. The standing test proves WASM coverage rather than assuming it (Foundation #16), and is the paired-contract enforcement Spec 154 demonstrated and Foundation #15 requires.
3. Engine-agnostic (Foundation #1): the test iterates the conformance corpus generically; FITL is just one entry. The non-FITL empty-manifest entries prove the classifier is game-agnostic.
4. Static, bounded, no WASM module required (Foundation #10) — qualifies for the fast default lane.

## What to Change

### 1. Coverage manifest fixture

Add `packages/engine/test/fixtures/policy-wasm/candidate-feature-coverage.json`: a deterministic, canonically-ordered map keyed by `(profileId, featureExprFingerprint)` listing `{ id, coverage, reason }` verdicts for each conformance-corpus game with agents. FITL profiles carry the real verdicts; `generic-control`/`texas-holdem` carry empty verdict sets.

### 2. featureExprFingerprint derivation

Derive a stable fingerprint from the compiled candidate-feature expr (canonical-JSON hash of the compiled expr). Document the derivation in the test so re-bless is reproducible and order-independent (Foundation #8).

### 3. Architectural-invariant guard test

Add `packages/engine/test/architecture/policy-wasm-coverage-manifest.test.ts`: compile each conformance-corpus game's catalog, run `classifyCandidateFeatureCoverage` for each profile, assemble the verdict map, and `assert.deepEqual` against the loaded manifest. Under `UPDATE_GOLDEN=1`, rewrite the fixture instead of asserting (with a "rerun with UPDATE_GOLDEN=1 to bless intentionally" message on missing/mismatched fixture).

## Files to Touch

- `packages/engine/test/fixtures/policy-wasm/candidate-feature-coverage.json` (new)
- `packages/engine/test/architecture/policy-wasm-coverage-manifest.test.ts` (new)

## Out of Scope

- Any change to `src/` runtime behavior — this ticket only reads via the 001 classifier.
- Flipping `projectedLeaderMarginDelta` to `wasm-row` — that re-bless is owned by `tickets/206WASMCANDCOV-003.md` (the conscious coverage change the guard is designed to force).
- Making `previewRelationship` deferral explicit in the route — owned by `tickets/206WASMCANDCOV-004.md` (which may re-bless the `projectedAllyMarginDelta` reason string).

## Acceptance Criteria

### Tests That Must Pass

1. The guard test passes on `main` (HEAD of this ticket) with the checked-in manifest.
2. Mutating a production candidate feature's coverage (e.g. adding a synthetic `preview.relationship.*` feature to a test profile) flips its manifest entry and fails the test with an actionable diff until re-blessed (§6 P0 acceptance).
3. Non-FITL conformance games (`generic-control`, `texas-holdem`) produce empty verdict sets and the test still holds (§5 / §11.3).
4. Re-bless path works: `UPDATE_GOLDEN=1 ...` regenerates a byte-stable fixture; a second run with the regenerated fixture passes without `UPDATE_GOLDEN`.

### Invariants

1. **Forcing function**: any change to a production profile's preview-cost candidate-feature coverage requires a manifest diff that a reviewer must consciously accept.
2. **Determinism**: the manifest is canonically ordered and the fingerprint is order-independent; recomputing twice yields byte-identical output (Foundation #8 / #16).
3. **Agnostic corpus**: the test spans FITL plus ≥1 non-FITL game; no FITL-specific branching in the test harness (Foundation #1).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/policy-wasm-coverage-manifest.test.ts` (new) — `// @test-class: architectural-invariant`; manifest-equality over the conformance corpus, plus a synthetic-profile mutation sub-case proving the diff fails the test.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test "packages/engine/dist/test/architecture/policy-wasm-coverage-manifest.test.js"`
2. Re-bless check: `UPDATE_GOLDEN=1 node --test "packages/engine/dist/test/architecture/policy-wasm-coverage-manifest.test.js"` then re-run without the env var.
3. `pnpm turbo lint typecheck && pnpm -F @ludoforge/engine test`
