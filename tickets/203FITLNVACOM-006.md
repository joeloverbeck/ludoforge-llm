# 203FITLNVACOM-006: Replay-identity reattestation (P5)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — verification
**Deps**: `tickets/203FITLNVACOM-005.md`

## Problem

After tickets 002–005 land the new NVA doctrine, Spec 203 §6 P5 requires verification that all FITL canary tests remain byte-identical with NVA baseline changes folded in. Since the new doctrine adds templates / modules / postures / guardrails to `nva-baseline`, the canary tests' trajectories MAY shift if the new doctrine alters NVA agent decisions on the canary seeds.

This is the final verification gate: either canaries are byte-identical (no behavioral perturbation on canary seeds), or specific canary witnesses need re-blessing OR distillation per `.claude/rules/testing.md`.

## Assumption Reassessment (2026-05-31)

1. Spec 201 has shipped (archived COMPLETED). The §6 P5 gating language "After Spec 201 lands" is satisfied; this ticket can proceed unconditionally once ticket 005 closes.
2. The FITL canary suite lives under `packages/engine/test/policy-profile-quality/` and `packages/engine/test/determinism/` (per existing conventions).
3. Spec 203 §5 commits to replay-identity preservation for the existing `nva-march-infiltrate-steal-vc-base.test.ts` witness (legitimate VC-base-steal path). Beyond that, broader FITL canary witnesses across factions need verification.
4. The `policy-profile-quality` lane is a blocking CI lane (per Foundation Appendix amendment 2026-05-29). Any failing witness must be resolved before merge.

## Architecture Check

1. **Foundation 16 (Testing as Proof)**: This ticket asserts the architectural invariant that doctrine additions do not silently shift unrelated trajectories. If canaries break, that is a real signal — either a doctrine-bug to fix in tickets 002–005 or a witness to distill/re-bless per `.claude/rules/testing.md`.
2. **Foundation 14 (No Backwards Compatibility)**: Re-blessed witnesses use the new trajectory directly; no `_legacy` snapshots, no compatibility canaries.
3. **Verification-first scope**: This ticket is primarily verification work. If canaries pass green, the ticket closes with that confirmation recorded in Outcome. If canaries fail, the ticket's scope expands to surgically re-bless or distill the affected witnesses, with rationale recorded in the commit body per `.claude/rules/testing.md`.

## What to Change

### 1. Run the FITL canary suite

Execute `pnpm turbo build && pnpm -F @ludoforge/engine test:unit` and `pnpm turbo test --force`. Identify any tests failing.

### 2. Triage per `.claude/rules/testing.md`

For each failing canary, classify per the test-class marker:

- **`convergence-witness` failure**: evaluate whether the trajectory shift is legitimately driven by Spec 203's doctrine changes. Distill to architectural-invariant form (preferred) OR re-bless with the commit body `Re-bless golden trace: <test-file>` + human-readable reason. Do NOT soften the assertion.
- **`architectural-invariant` failure**: diagnose root cause — Spec 203 should not perturb invariants. A failure here indicates a doctrine bug in tickets 002–005 and blocks this ticket's close. Open a fix-and-retry loop with the affected upstream ticket.
- **`golden-trace` failure**: re-bless only with explicit commit-body rationale per `.claude/rules/testing.md`. Otherwise, fix the kernel/data.

### 3. Record outcome

In this ticket's Outcome section, record: (a) the test command output (or a summary of green status), (b) the list of any re-blessed / distilled witnesses with rationale, (c) confirmation that all FITL canaries are green at close.

## Files to Touch

- `tickets/203FITLNVACOM-006.md` (modify — Outcome section after verification completes)

*If canaries pass, this is the only file touched.* If canaries fail and surgical re-bless is required, additional files may be modified — exact scope is contingent on canary results. Re-blessed test files and any updated fixture files are recorded in the Outcome alongside the rationale.

## Out of Scope

- New doctrine authoring (tickets 002–005).
- Non-NVA witness changes unrelated to NVA doctrine perturbation.
- Distillation of pre-existing flaky witnesses unrelated to Spec 203.
- Schema / engine / compiler modifications.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test:unit` — green (after any required re-bless).
2. `pnpm turbo test --force` — green (including the blocking `policy-profile-quality` lane).
3. Existing NVA witnesses (`nva-march-infiltrate-steal-vc-base.test.ts`, `nva-protects-trail-before-coup.test.ts`) and all 9 new witnesses from ticket 005 pass.

### Invariants

1. Replay-identity property: identical (GameDef, initial state, seed, actions) → identical canonical serialized state (Foundation 8).
2. If any witness was re-blessed, the commit body records the rationale per `.claude/rules/testing.md` distillation/re-bless protocol.
3. No `convergence-witness` is silently downgraded by softening assertion bounds.

## Test Plan

### New/Modified Tests

None new; this ticket verifies existing tests under the new doctrine. Any re-bless is surgical and documented.

### Commands

1. `pnpm turbo build && pnpm -F @ludoforge/engine test:unit`
2. `pnpm turbo test --force`
3. `pnpm run check:ticket-deps`
