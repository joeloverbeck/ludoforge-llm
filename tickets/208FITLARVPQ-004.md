# 208FITLARVPQ-004: Un-skip gate — remove quarantine, verify acceptance

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — test-source quarantine removal + lane verification
**Deps**: `tickets/208FITLARVPQ-003.md`

## Problem

Per Spec 208 §5 Quarantine and §6 Acceptance Criteria, all three witnesses are currently `skip`ped:

- `arvn-action-distribution-not-dominated` and `turn-shape-minimum-impact-observed` via the `SPEC_208_QUARANTINED_PROBE_IDS` set in `packages/engine/test/policy-profile-quality/probes/probe-budget.test.ts:53–56`.
- `fitl-arvn-may17-equivalent-opponent-preview` via the `skip` option at `packages/engine/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts:64–65`.

Un-skipping all three (passing at original or distilled bounds, justified by the diagnoses in tickets 001/002 and the resolution in ticket 003) is the spec's acceptance gate. This ticket performs the mechanical quarantine removal and runs the full verification lane.

This is a **deferred-execution ticket**: its file set and verification commands are concrete (no upstream dependency on diagnosis outputs), but its execution is gated on ticket 003 closing — un-skipping before 003 lands would re-introduce the failures.

## Assumption Reassessment (2026-05-31)

1. `SPEC_208_QUARANTINED_PROBE_IDS` is the active quarantine constant for Witnesses 1 + 2 — re-verified during reassessment (line 53 of `probe-budget.test.ts`).
2. The May-17 witness's `skip` option references Spec 208 — re-verified during reassessment (line 64 of the test file).
3. After ticket 003 closes, the three witnesses pass when run via their direct test paths. Ticket 004 must verify they also pass via the full PQ lane.
4. The `policy-profile-quality` lane is blocking CI (per FOUNDATIONS Appendix amendment 2026-05-29 and Spec 207's surfaced CI lane). Un-skipping a witness that fails will break CI — verify locally before pushing.

## Architecture Check

1. **Foundation 16 (Testing as Proof)** + Appendix: the blocking `policy-profile-quality` lane exists precisely so witnesses cannot silently rot. Un-skipping completes the lifecycle: fix or distill → un-skip → CI now guards the new invariant.
2. **No backwards-compatibility shims (Foundation 14)**: when removing entries from `SPEC_208_QUARANTINED_PROBE_IDS` and the May-17 `skip` option, delete them outright — no `_legacy` quarantine list, no "soft skip" alias.
3. **Mechanical-uniformity scope**: this ticket's changes are limited to (a) deleting the two probe-id entries from `SPEC_208_QUARANTINED_PROBE_IDS` (and the set itself if it becomes empty), and (b) removing the `skip` option from the May-17 test. No behavioral changes, no new test logic — that work all lives in ticket 003.
4. **Acceptance verification, not introduction**: this ticket runs the full verification matrix (determinism, four-profile canaries, full PQ lane, `test:all`) but does not introduce new assertions. New assertions, if needed, are introduced by ticket 003's distillation paths.

## What to Change

### 1. Remove the two Witness 1/2 probe IDs from `SPEC_208_QUARANTINED_PROBE_IDS`

In `packages/engine/test/policy-profile-quality/probes/probe-budget.test.ts`:

- Delete the entries `'arvn-action-distribution-not-dominated'` and `'turn-shape-minimum-impact-observed'` from the `SPEC_208_QUARANTINED_PROBE_IDS` set (around lines 53–56).
- If the set becomes empty as a result, delete the entire `SPEC_208_QUARANTINED_PROBE_IDS` declaration AND the corresponding `if (SPEC_208_QUARANTINED_PROBE_IDS.has(probe.id)) { ... }` consumption logic (around line 60). Do NOT leave an empty set or a no-op conditional — Foundation #14 forbids dead-code stubs.

### 2. Remove the `skip` option from the May-17 witness

In `packages/engine/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts`:

- Remove the `skip` option (around lines 64–65) referencing Spec 208. The test must now execute on every run.

### 3. Run the full verification lane

After the un-skip:

- Run the FITL determinism lane: byte-identical replay required.
- Run the four-profile convergence canaries: byte-identical required.
- Run the full `policy-profile-quality` lane un-skipped: all three Spec 208 witnesses must pass at the original or distilled bounds.
- Run `pnpm -F @ludoforge/engine test:all` and `pnpm turbo test`: no regression.

If any verification fails, re-open ticket 003 — the gate has not been satisfied. Do not soften any assertion to make the gate pass.

## Files to Touch

- `packages/engine/test/policy-profile-quality/probes/probe-budget.test.ts` (modify — delete two probe IDs from `SPEC_208_QUARANTINED_PROBE_IDS` and the set + guard logic if empty)
- `packages/engine/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts` (modify — remove the `skip` option)

## Out of Scope

- Adding new witnesses, distilling existing witnesses, or changing assertion bounds — all owned by ticket 003.
- Modifying engine source or YAML doctrine — all owned by ticket 003.
- Pre-existing baseline PQ failures unrelated to Spec 208 (the broader `project_spec202_preexisting_pq_failures.md` set). If un-skipping the three Spec 208 witnesses surfaces a separate pre-existing failure that was previously masked, document it in the ticket Outcome but do NOT roll its fix into this ticket — file a follow-up.
- Re-introducing any `_legacy` or `_quarantine` stub. If `SPEC_208_QUARANTINED_PROBE_IDS` becomes empty, delete the declaration and its consumer outright.

## Acceptance Criteria

### Tests That Must Pass

1. After the un-skip: `node --test dist/test/policy-profile-quality/probes/probe-budget.test.js` (built first via `pnpm -F @ludoforge/engine build`) passes including the previously-quarantined Witnesses 1 + 2.
2. After the un-skip: `node --test dist/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.js` passes unconditionally.
3. FITL determinism lane: byte-identical replay across the seed corpus.
4. Four-profile convergence canaries: byte-identical.
5. Full `policy-profile-quality` lane: green un-skipped.
6. Existing suite: `pnpm turbo test`, `pnpm turbo lint`, `pnpm turbo typecheck` all green.

### Invariants

1. **Spec 208 §6 #2 fully satisfied**: all three witnesses pass *un-skipped* with no relaxing to regressed numbers and no `unknown` → `ready` coercion (the latter enforced by ticket 003's resolution; this ticket verifies the lane is green with the resolutions in place).
2. **Spec 208 §6 #3 fully satisfied**: no collateral regression in the determinism lane, four-profile convergence canaries, or `test:all` / `policy-profile-quality` lanes.
3. **Foundation #14**: no dead-code stubs (empty `SPEC_208_QUARANTINED_PROBE_IDS` set or its no-op guard remain after the un-skip).
4. The blocking `policy-profile-quality` CI lane (per FOUNDATIONS Appendix 2026-05-29) is green for the full set including the three previously-quarantined witnesses.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/policy-profile-quality/probes/probe-budget.test.ts` — modify (delete quarantine entries; potentially delete the set declaration and consumer logic).
2. `packages/engine/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.ts` — modify (remove `skip` option).

No new tests authored here — coverage additions belong to ticket 003's distillation paths.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test dist/test/policy-profile-quality/probes/probe-budget.test.js` — verify Witnesses 1 + 2 pass un-skipped.
2. `pnpm -F @ludoforge/engine build && node --test dist/test/policy-profile-quality/probes/fitl-arvn-may17-equivalent-opponent-preview.test.js` — verify Witness 3 passes un-skipped.
3. Full PQ lane: `pnpm -F @ludoforge/engine test:policy-profile-quality` (or project-canonical equivalent — verify via `package.json` scripts during implementation).
4. Determinism + canaries: `pnpm -F @ludoforge/engine test:e2e` (or project-canonical equivalents).
5. Full verification: `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`.
