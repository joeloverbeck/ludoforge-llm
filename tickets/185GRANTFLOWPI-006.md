# 185GRANTFLOWPI-006: Phase 3 — End-to-end witnesses (FITL-like fixture + FITL ARVN opponent-preview witness)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: No — test-only (engine architecture fixture + policy-profile-quality probe)
**Deps**: `tickets/185GRANTFLOWPI-003.md`, `tickets/185GRANTFLOWPI-004.md`, `tickets/185GRANTFLOWPI-005.md`

## Problem

The blocking architectural-invariant fixtures (tickets 003–005) prove the grant-flow continuation, taxonomy, and WASM parity in isolation. This ticket adds the two cross-cutting witnesses that prove the whole chain end-to-end: (1) a FITL-like ordered free-operation fixture using generic engine objects, and (2) the headline FITL ARVN May-17-equivalent opponent-preview witness — the regression that motivated the whole spec (`preview.victory.currentMargin.<nva|vc>` uniform across candidates). Per the test taxonomy, the engine fixture is an architectural-invariant; the ARVN witness is a non-blocking profile-quality probe (lives in `policy-profile-quality/`, emits `POLICY_PROFILE_QUALITY_REGRESSION` rather than blocking CI).

## Assumption Reassessment (2026-05-20)

1. The full continuation behavior, taxonomy, and WASM parity exist only after tickets 003/004/005; these witnesses span all of them, so per the test-attachment rule they attach to the latest ticket (this one), not the individual fix tickets.
2. The FITL ARVN witness is a profile-quality regression signal (non-blocking) per `.claude/rules/testing.md` and Spec 185 §6.4; the FITL-like fixture is a blocking architectural-invariant.
3. No engine source changes here — if a witness fails to differentiate, the fix belongs upstream (tickets 003/004), not in softening the witness.

## Architecture Check

1. The FITL-like fixture uses generic engine objects mimicking FITL's ordered/per-space grant pattern — proving game-agnosticism (Foundation #1, #16) without FITL data.
2. Separating the blocking architectural-invariant from the non-blocking profile-quality witness honors the determinism-proof vs. profile-quality distinction (FOUNDATIONS Appendix; `.claude/rules/testing.md`).
3. Witnesses prove the property rather than asserting it (Foundation #16); a partial/capped candidate's opponent refs must not count as ready (Foundation #20).

## What to Change

### 1. FITL-like ordered free-operation fixture

Generic objects mimicking FITL's ordered/per-space grant pattern: pending grants, optional sequence, zone filter, an operation that changes a victory-relevant surrogate, optional after-grant effect. Assert deterministic sequence, explicit cap stops, and that `preview.victory.currentMargin.<opponent-surrogate>` differentiates only after the granted operation executes.

### 2. FITL ARVN May-17-equivalent opponent-preview witness

Profile-quality probe: ≥2 ARVN candidates whose granted effects should differ for NVA and/or VC margin produce differentiated `preview.victory.currentMargin.nva`/`.vc`; `currentLeader`/`nearestThreat` differentiate when standings should change; trace shows whether grant-flow continuation ran and how it exited; any partial/capped candidate's opponent refs are not counted as ready; or an explicit trace proves the candidates are true no-ops w.r.t. those refs.

## Files to Touch

- `packages/engine/test/architecture/preview-post-grant/fitl-like-ordered-free-operation-preview.test.ts` (new)
- `packages/engine/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts` (new)

## Out of Scope

- Any engine source change — failures here are fixed upstream (tickets 003/004/005).
- Profile promotion / `arvn-evolved` quarantine / campaign gates (Spec 185 §8 defers these to a separate Spec 183 reassessment).

## Acceptance Criteria

### Tests That Must Pass

1. FITL-like fixture: victory-surrogate differentiates only after the granted operation executes; sequence deterministic; cap stops explicit.
2. ARVN witness: NVA/VC margin and standing-role refs differentiate for effectful candidates, or trace proves true no-ops; partial/capped candidates' opponent refs are not counted as ready.
3. Existing suite: `pnpm -F @ludoforge/engine test:all`

### Invariants

1. The FITL-like fixture proves the property using generic engine objects only — no FITL data assets (Foundation #1).
2. The ARVN witness is a non-blocking profile-quality probe; the FITL-like fixture is a blocking architectural-invariant (FOUNDATIONS Appendix).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/preview-post-grant/fitl-like-ordered-free-operation-preview.test.ts` — `// @test-class: architectural-invariant`.
2. `packages/engine/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts` — `// @test-class: convergence-witness`, `// @witness: 185GRANTFLOWPI-arvn-may17-opponent-preview`.

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/architecture/preview-post-grant/fitl-like-ordered-free-operation-preview.test.js`
2. `pnpm -F @ludoforge/engine test:policy-profile-quality`
3. `pnpm turbo lint && pnpm turbo typecheck && pnpm -F @ludoforge/engine test:all`
