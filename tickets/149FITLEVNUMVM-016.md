# 149FITLEVNUMVM-016: Phase 4 default-flip + closure-tree deletion (F14 atomic cut)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/agents/policy-runtime.ts`, `packages/engine/src/agents/compiled-policy-runtime.ts`, `packages/engine/src/agents/policy-evaluation-core.ts`, `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts`
**Deps**: `tickets/149FITLEVNUMVM-014.md`, `tickets/149FITLEVNUMVM-015.md`

## Problem

Phase 4's terminal deliverable. After ticket 015 lands the VM and parity is proven for ≥3 consecutive CI runs on all FITL baseline profiles, this ticket:
1. Flips the default policy evaluation path from closure-tree to bytecode VM.
2. Deletes the closure-tree evaluation infrastructure (`buildPolicyExprClosure` and downstream callees) per F14.
3. Adds or updates the per-card perf gate at ≤ 250 ms (the original spec target).
4. Triggers ticket 003 (CI restoration unwind).

This is a Foundation 14 atomic cut spanning the full deletion blast radius. Mechanical uniformity rationale: the closure-tree call site is a single dispatch point in `policy-runtime.ts`, and `compiled-policy-runtime.ts:buildPolicyExprClosure` has a bounded set of consumers in `policy-evaluation-core.ts` (verified during ticket 015 prep).

## Assumption Reassessment (2026-04-28)

1. Ticket 015 has landed the VM with A/B routing via `LUDOFORGE_POLICY_VM=on`. Parity is proven via ticket 014's equivalence harness on all 4 baseline profiles × 20 seeds.
2. The closure-tree path is `compiled-policy-runtime.ts:buildPolicyExprClosure` → `policy-evaluation-core.ts:CompiledPolicyExprClosure` callees. Spec §Phase 4 acceptance explicitly mandates deleting these.
3. `RESOLVE_DYNAMIC` opcode count must be zero before this ticket can land — verify by running the compiler against all 4 FITL baseline profiles and asserting zero `RESOLVE_DYNAMIC` emissions. If any remain, eliminate them first (cite spec §5 edge case "Logged as a perf warning so it gets eliminated").
4. The per-card cost ≤ 250 ms target is the original Spec 149 evolution-readiness budget.

## Architecture Check

1. F14 atomic cut: removes the closure-tree path entirely. No `_legacy` shim retained. The mechanical uniformity is verified by listing the full deletion blast radius in this ticket's What to Change.
2. F15 architectural completeness: this ticket closes the loop on the entire spec — Phases 1-4 are now structurally complete, replacing the 35× over-budget gap with a measured ≤250 ms per-card cost.
3. F8 determinism preserved — the bytecode VM is integer-only; replay-identity tests are the proof.
4. F1 preserved — no game-specific code introduced anywhere in the chain.

## What to Change

### 1. Pre-flight verification (read-only)

Before any deletion, verify:
- `RESOLVE_DYNAMIC` opcode count is zero across all 4 FITL baseline profile compilations.
- Ticket 014's equivalence harness has been green for ≥3 consecutive CI runs with `LUDOFORGE_POLICY_VM=on`.
- All 10 determinism shards stay green with VM enabled.
- `fitl-per-card-cost.perf.test.ts` passes at ≤ 250 ms on all 4 profiles (preliminary measurement; final tightening happens in this ticket).

If any precondition fails, do NOT execute. Re-open `RESOLVE_DYNAMIC` elimination work or revisit the VM's perf characteristics in a follow-up ticket.

### 2. `packages/engine/src/agents/policy-runtime.ts` (modify)

Default-flip:
- Remove the `LUDOFORGE_POLICY_VM` env var read.
- Default-route policy evaluation through `executeBytecode` (ticket 015's VM). The bytecode is compiled via ticket 013's `compilePolicyBytecode` once per `evaluatePolicyMove` call (or cached per profile-fingerprint, depending on measurement).
- Delete the closure-tree code path entirely. No fallback retained.

### 3. `packages/engine/src/agents/compiled-policy-runtime.ts` (modify or delete)

Per spec §Phase 4 acceptance: delete `buildPolicyExprClosure`. If the file has remaining exports unrelated to closure-tree evaluation (verify via blast-radius grep), keep only those; otherwise delete the entire file.

### 4. `packages/engine/src/agents/policy-evaluation-core.ts` (modify)

Delete the closure-tree consumer code paths:
- Remove `CompiledPolicyExprClosure` import and downstream usage.
- Replace `evaluateCompiledZoneTokenAggregate` and similar closure-driven dispatch with bytecode VM calls (per ticket 015's `executeBytecode`).
- Per F14, no `_legacy` fallback retained.

### 5. Perf gate

Create or update `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` at the truthful Phase 4 budget: ≤ 250 ms. The earlier Phase 1 5500 ms and Phase 2 3000 ms gate calibrations were superseded by the `149FITLEVNUMVM-017` stop-condition decision. Update the calibration comment so future readers do not chase the false Phase 1 gate.

### 6. Restore CI workflows (delegated to ticket 003)

This ticket does NOT touch the CI workflow files directly — that work lives in ticket 003 (CI restoration unwind). When this ticket closes, ticket 003 becomes unblocked.

### 7. Profiling proof gate

After this ticket lands, run a one-card profile and confirm the 250 ms target:
```bash
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label phase4-final
```
Record the per-profile elapsed values in this ticket's Outcome.

### 8. Sihanouk and March-Free-Operation budget restoration

Verify that `fitl-events-sihanouk.test.ts` and `fitl-march-free-operation.test.ts` complete within their pre-Phase-0-bump budgets (1m 31s and 1m 10s respectively). Record in Outcome.

## Files to Touch

- `packages/engine/src/agents/policy-runtime.ts` (modify — delete A/B switch, default to VM)
- `packages/engine/src/agents/compiled-policy-runtime.ts` (modify or delete)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — delete closure-tree consumers)
- `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` (modify — tighten to 250 ms)

## Out of Scope

- CI workflow restoration (ticket 003 — triggered by this ticket's closure).
- Phase 5 WASM port (separate spec when justified per spec §Phase 5 stop conditions).
- Recalibrating `fitl-parity-drive.perf.test.ts` (deferred to a follow-up if measurement shows it's needed).

## Acceptance Criteria

### Tests That Must Pass

1. Replay-identity tests stay green on ALL 10 determinism shards (no `LUDOFORGE_POLICY_VM` env var needed — bytecode is default).
2. Score-equivalence: ticket 014's harness still passes (now exercising the VM as the default path; closure-tree no longer exists to compare against, so harness is repurposed as a VM correctness check).
3. **Per-card cost: ≤ 250 ms under all 4 baseline profiles** (`verifyIncrementalHash=true`).
4. `engine-tests.yml` ticket-002 lanes (`fitl-events-shard-c` and `fitl-rules`) complete within their pre-Phase-0 budgets.
5. `engine-determinism.yml` job-level timeout (still 60 m at this ticket; ticket 003 reverts) accommodates the determinism shards comfortably.
6. No surviving import sites for `buildPolicyExprClosure` or `CompiledPolicyExprClosure` (verify via grep).
7. Existing suite: `pnpm -F @ludoforge/engine test && pnpm -F @ludoforge/engine test:perf`.

### Invariants

1. Per F14, no `_legacy` closure-tree fallback retained.
2. Per F1, no game-specific opcodes or branches.
3. Per F8, replay identity and integer-only math preserved.
4. Per F15, this ticket completes the architectural answer to the 35× over-budget gap.

## Test Plan

### New/Modified Tests

1. None new — ticket 014's harness becomes the canonical correctness gate; ticket 010's property tests guard apply/undo.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. `pnpm -F @ludoforge/engine test`.
3. `cd packages/engine && node scripts/run-tests.mjs --lane determinism dist/test/determinism/*.test.js` (full determinism corpus).
4. `pnpm -F @ludoforge/engine test:perf` (with the tightened 250 ms gate).
5. `node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label phase4-final` (record in Outcome).
6. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`.
7. `grep -rn 'buildPolicyExprClosure\|CompiledPolicyExprClosure' packages/engine/src` — must return zero hits.
