# 205FITLARVSEL-006: P4 — Regression re-attestation

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — verification only
**Deps**: `archive/tickets/205FITLARVSEL-002.md`, `tickets/205FITLARVSEL-003.md`, `archive/tickets/205FITLARVSEL-004.md`, `tickets/205FITLARVSEL-005.md`

## Problem

After all selector replacements (002), the Transport postState constraint (003), the Govern Patronage term (004), and the faction-agnostic invariant test (005) land, verify that:
1. All 10 existing ARVN witnesses still pass (under distillation rule if trajectory shifts).
2. The 4-profile convergence canary remains byte-identical.
3. `pnpm turbo build` produces deterministic compiled artifacts.

This is the final acceptance gate for Spec 205.

## Assumption Reassessment (2026-06-01)

1. All 10 ARVN witnesses listed in spec §7 are present and currently passing on main (verified by reassess-spec; markers recorded in spec §7).
2. The 4-profile convergence canary is exercised by `packages/engine/test/policy-profile-quality/fitl-variant-all-baselines-convergence.test.ts` (verify path during implementation; the file is listed in the policy-profile-quality directory inventory).
3. The Spec 137 distillation rule (`archive/specs/137-convergence-witness-invariant-promotion.md`) allows distilling a convergence witness to architectural-invariant form if trajectory shifts — this ticket records distillation decisions when they occur.
4. `pnpm turbo build` is the canonical byte-identity check per CLAUDE.md.

## Architecture Check

1. This is a verification ticket — no source changes by default (Foundation #16 Testing as Proof).
2. If trajectory shifts and a witness needs distillation, the distilled form must hold across `CANARY_SEEDS × POLICY_PROFILE_VARIANTS` per `.claude/rules/testing.md`, not just the original seed.
3. If trajectory shifts and distillation is not viable, fall back to re-blessing per `.claude/rules/testing.md` and record the rationale in the witness file header AND the commit body (`Re-bless golden trace: <test-file>` marker).
4. The `arvn-seed-1000-deep-recovery.test.ts` is currently `convergence-witness`; this ticket may promote it under the Spec 137 framework if the new selector bodies cause a legitimate trajectory shift.

## What to Change

### 1. Run the full regression suite

Execute the canonical verification commands (see Commands below) on a fresh build. Record per-witness pass/fail and any trajectory-shift evidence.

### 2. Resolve any trajectory shifts

For each witness that fails after 002/003/004 land:
- Determine whether the shift is *legitimate* (the new selector bodies caused a deterministic but different path that still respects the underlying property). If so, **distill** the witness per Spec 137: rewrite the assertion as a seed-independent architectural invariant over any legitimate trajectory.
- If distillation is not viable (the property is inherently seed-specific or trajectory-pinned), **re-bless** with explicit `Re-bless golden trace: <test-file>` commit-body marker and a one-line rationale in the test header.
- If the shift is *illegitimate* (a regression — e.g., a typo in YAML, an incorrect P0 vocabulary resolution), fix the root cause and re-attest.

### 3. Verify build byte-identity

Run `pnpm turbo build` twice; assert the GameDef hash and compiled JSON are byte-identical between runs (Foundation #8 Determinism, Foundation #13 Reproducibility).

### 4. Verify the faction-agnostic invariant passes

Confirm that `no-placeholder-value-one-selectors.test.ts` (from 205FITLARVSEL-005) passes against the final state — no placeholder residue.

## Files to Touch

- (None by default — verification only.)
- `Likely surface` if distillation/re-blessing is required: any of `packages/engine/test/policy-profile-quality/arvn-*.test.ts` whose trajectory shifts. Exact files depend on which witnesses (if any) fail under the new selectors.

## Out of Scope

- Authoring new tests — that work belongs to 205FITLARVSEL-003 / -004 / -005.
- Modifying selector bodies — that is 205FITLARVSEL-002.
- Reverting 002-005 if witnesses shift legitimately — distill or re-bless instead (per `.claude/rules/testing.md` Distillation rule).
- Changes to `archive/specs/137-...md` — the distillation framework is canonical.

## Acceptance Criteria

### Tests That Must Pass

1. All 10 ARVN witnesses pass (possibly distilled).
2. 4-profile convergence canary passes byte-identical to its pre-change baseline (or, if trajectory legitimately shifts, has been distilled/re-blessed per `.claude/rules/testing.md`).
3. `pnpm turbo build` byte-identical between two consecutive runs (Foundation #8).
4. `no-placeholder-value-one-selectors.test.ts` passes (no ARVN placeholder residue).
5. Full engine + runner suites: `pnpm turbo test`.
6. `pnpm turbo lint && pnpm turbo typecheck` pass.

### Invariants

1. Foundation #8 — `pnpm turbo build` is deterministic across runs.
2. Foundation #16 — every distillation/re-bless action is justified in the test file header AND the commit body.
3. No witness is *softened* to hide a regression — distillation preserves the underlying property as an architectural invariant; re-blessing requires explicit commit-body marker.

## Test Plan

### New/Modified Tests

1. None directly authored. Distillation/re-blessing edits to existing witness files only if trajectory shifts.

### Commands

1. `pnpm turbo build`
2. `pnpm turbo test`
3. `node --test dist/test/policy-profile-quality/arvn-govern-active-support-priority.test.js`
4. `node --test dist/test/policy-profile-quality/arvn-patrol-govern-over-train-when-threatened.test.js`
5. `node --test dist/test/policy-profile-quality/arvn-precoup-posture-avoids-redeploy-undone.test.js`
6. `node --test dist/test/policy-profile-quality/arvn-seed-1000-deep-recovery.test.js`
7. `node --test dist/test/policy-profile-quality/arvn-sweep-raid-expose-before-removal.test.js`
8. `node --test dist/test/policy-profile-quality/arvn-train-govern-fallback.test.js`
9. `node --test dist/test/policy-profile-quality/arvn-train-govern-separation.test.js`
10. `node --test dist/test/policy-profile-quality/arvn-transport-refuses-origin-control-loss.test.js`
11. `node --test dist/test/policy-profile-quality/arvn-transport-rejected-by-reachable.test.js`
12. `node --test dist/test/policy-profile-quality/arvn-us-rival-risk-flip.test.js`
13. `node --test dist/test/policy-profile-quality/fitl-variant-all-baselines-convergence.test.js`
14. `node --test dist/test/policy-profile-quality/no-placeholder-value-one-selectors.test.js`
15. `pnpm turbo build` (second run) — diff GameDef hash and compiled JSON for byte-identity (Foundation #8).
16. `pnpm turbo lint && pnpm turbo typecheck`
