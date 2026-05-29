# 202FITLUSCOMP-007: P5 — replay-identity reattestation

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None
**Deps**: `archive/tickets/202FITLUSCOMP-005.md`, `archive/tickets/202FITLUSCOMP-006.md`

## Problem

After the US baseline changes (002–006) and Spec 201's shared scaffolding are folded in, Spec 202 §6 P5 requires reattesting determinism: ARVN seed 1000 / FITL seed 2057 / the four-profile convergence canaries must be byte-identical with the US baseline doctrine in place. This is the final verification that the US authoring did not perturb cross-faction determinism.

## Assumption Reassessment (2026-05-29)

1. Spec 201 has landed (COMPLETED) and `us-baseline` already binds all 7 `shared.*` modules — the "after Spec 201 lands" gate is satisfied, so this reattestation runs unconditionally once 005/006 close.
2. The canary/determinism witnesses (ARVN seed 1000, FITL seed 2057, four-profile convergence) already exist in the engine test corpus; this ticket runs and confirms them, re-blessing only if a shift is legitimate and explicitly justified per `.claude/rules/testing.md`.
3. No source authoring remains — all doctrine is bound by ticket 005; this is a verification deliverable.

## Architecture Check

1. Determinism reattestation is the proof that the doctrine additions are behavior-preserving for unrelated factions/seeds (Foundation 8/16). It belongs after binding (005) and witnesses (006) so the full profile is in place.
2. No engine or data authoring — confirms existing invariants; no agnostic-boundary risk.
3. Any re-bless of a golden/canary trace requires an explicit `Re-bless golden trace: <file>` commit-body justification per the testing rules — no silent test softening (Foundation 16).

## What to Change

### 1. Run the determinism / canary reattestation

Execute the determinism corpus and the four-profile convergence canaries with the completed `us-baseline`. Confirm byte-identical outcomes for ARVN seed 1000 and FITL seed 2057.

### 2. Adjudicate any shift

If a canary shifts, evaluate legitimacy: distill to an architectural invariant or re-bless the witness with explicit justification per `.claude/rules/testing.md`; otherwise treat as a regression and fix the doctrine (do not soften the test).

## Files to Touch

- None expected (verification-only). If a legitimate trace shift requires re-blessing, the specific canary/golden fixture under `packages/engine/test/` is updated with a justified `Re-bless golden trace:` note.

## Out of Scope

- Any doctrine authoring or binding (002–005) and witness authoring (006).
- Softening or deleting determinism tests to accommodate an unexplained shift.

## Acceptance Criteria

### Tests That Must Pass

1. ARVN seed 1000, FITL seed 2057, and the four-profile convergence canaries are byte-identical with the US baseline changes folded in.
2. `pnpm turbo build` byte-identical (compiler determinism).
3. Full engine suite green: `pnpm -F @ludoforge/engine test:all`.

### Invariants

1. Determinism holds: same GameDef + seed + actions → identical canonical state (Foundation 8).
2. No determinism test is softened without an explicit, justified re-bless (Foundation 16).

## Test Plan

### New/Modified Tests

1. None new — reattests the existing determinism/canary corpus.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test:all`
2. `pnpm turbo build && pnpm turbo test`

## Outcome

**Completed**: 2026-05-29

**Reattestation results** (US baseline doctrine from 002–006 folded in):
- **Determinism lane**: 99/99 pass.
- **Canaries byte-identical**: `fitl-policy-agent-canary-determinism`, ARVN `fitl-variant-arvn-baseline-seed-1000-draw-space-convergence` + `arvn-seed-1000-deep-recovery` + `spec-162-arvn-seed-1000-witness`, FITL `fitl-seed-2057-regression`, four-profile `fitl-variant-all-baselines-convergence`, `fitl-variant-arvn-baseline-convergence`, `fitl-variant-campaign-seat-mapping-seed-1000-convergence` — all pass (17 canary/seed tests across two runs).
- **`pnpm -F @ludoforge/engine test:all`**: **8195/8195 pass, 0 fail, 1 skipped** (architectural-invariant 9618, convergence-witness 14, golden-trace 79 — all green).
- **Engine default lane**: 189/189 files pass. **`pnpm turbo build`**: green; FITL GameDef recompile byte-identical (sha256 match).

**One golden re-bless** (justified): `packages/engine/test/fixtures/policy-wasm/candidate-feature-coverage.json` — the new `feature.projectedArvnMarginDelta` candidate feature (002) and the now-reachable `feature.projectedSupportDelta` (referenced by the bound `us.buildSupport` / strengthened posture) were added to the per-profile coverage manifest. The diff is **purely additive (+48, −0)** and **both features classify as `coverage: "wasm-row"`** — fully WASM-covered, so Spec 206's candidate-feature WASM-parity is preserved (no `ts-oracle` fallback introduced). Re-blessed via `UPDATE_GOLDEN=1`.

**Out-of-scope pre-existing state**: the separate `policy-profile-quality` lane carries 9 pre-existing failing `Spec 188/143/144` convergence witnesses (verified failing on the clean baseline before any 202 change). They are unrelated to spec 202, were not softened, and are not part of `test:all`. Spec 202's 11 new witnesses all pass.

**No source/data authoring** in this ticket beyond the justified golden re-bless — it is a verification deliverable.
