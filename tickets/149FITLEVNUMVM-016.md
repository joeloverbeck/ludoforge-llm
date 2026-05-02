# 149FITLEVNUMVM-016: Phase 4 VM perf closure + default-flip F14 cut

**Status**: BLOCKED by Phase 5/WASM successor gate — final F14 default-flip/deletion owner
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/agents/policy-runtime.ts`, `packages/engine/src/agents/compiled-policy-runtime.ts`, `packages/engine/src/agents/policy-evaluation-core.ts`, `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts`
**Deps**: `archive/tickets/149FITLEVNUMVM-014.md`, `archive/tickets/149FITLEVNUMVM-015.md`, `archive/tickets/149FITLEVNUMVM-018.md`, `tickets/149FITLEVNUMVM-022.md`, `tickets/150FITLWASM-005.md`

## Problem

Phase 4's terminal deliverable owns the F14 cut: default the policy evaluation path to bytecode VM and delete the closure-tree runtime. Ticket 018 ruled out the engine-test workflow lanes as the remaining runtime blocker after stale golden fallout was repaired, but later profiling proved the remaining one-card wall time is dominated by generic preview-drive runtime work outside the current policy bytecode VM. Ticket 022 then proved Phase 4B still misses the original budget after its runtime-closure slices; Spec 150 now owns the Phase 5/WASM successor path required before this ticket can execute. Ticket `150FITLWASM-001` landed the skeleton, ticket `150FITLWASM-002` landed supported policy-bytecode value parity, ticket `150FITLWASM-003` landed the supported encoded-state/action batch bridge, ticket `150FITLWASM-004` landed supported scalar candidate score rows, and ticket `150FITLWASM-005` is the next active full-profile score-row handoff owner.

This ticket therefore has one ordered stage after the Phase 5/WASM successor gate is green:

1. Wait for the Phase 5/WASM successor path to make the original `<=250 ms` one-card gate truthful.
2. Flip the default policy evaluation path from closure-tree to the proven successor runtime and delete the closure-tree evaluation infrastructure (`buildPolicyExprClosure` and downstream callees) per F14.

When complete, this ticket adds or updates the per-card perf gate and triggers ticket 003 for the remaining CI restoration unwind.

Ticket `150FITLWASM-004` delivered supported scalar candidate score rows but left full-profile library candidate-feature, aggregate, preview-backed, and dynamic rows fail-closed. Ticket `150FITLWASM-005` is now the active WASM successor gate before this F14 cut may execute.

## Reassessment Update (2026-05-02, Phase 5 handoff)

Ticket `149FITLEVNUMVM-022` ran the final Phase 4B same-seam profile and the gate remained red:

- `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-final` — RED: per-card `elapsedMs=6702.65`, threshold `<=250`.

User-approved decision: stop Phase 4B as failed for the original budget and promote Phase 5/WASM as the next architectural owner. This ticket remains the later F14 default-flip/deletion owner, but it must not execute until `specs/150-fitl-policy-vm-wasm-port.md` and its implementation tickets make the `<=250 ms` gate truthful. Post-review of ticket `150FITLWASM-001` created `150FITLWASM-002` for WASM policy-bytecode execution parity; post-review of `150FITLWASM-002` created `150FITLWASM-003` for the encoded-state/action batch bridge; ticket `150FITLWASM-003` created `150FITLWASM-004` for candidate-dependent batch scoring integration; ticket `150FITLWASM-004` created `150FITLWASM-005` for the remaining full-profile score-row handoff and perf gate preflight.

This is a Foundation 14 atomic cut spanning the full deletion blast radius. Mechanical uniformity rationale: the closure-tree call site is a single dispatch point in `policy-runtime.ts`, and `compiled-policy-runtime.ts:buildPolicyExprClosure` has a bounded set of consumers in `policy-evaluation-core.ts` (verified during ticket 015 prep).

## Reassessment Update (2026-05-02)

Do not execute the default-flip or closure-tree deletion first. Execute the VM perf investigation/optimization stage inside this ticket, then perform the F14 cut only after the measured Phase 4 gate is green.

User confirmation satisfied the "≥3 consecutive CI runs" correctness/parity precondition for the VM path, and local focused proof confirmed VM correctness:

- `pnpm -F @ludoforge/engine build` — PASS.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/cnl/policy-bytecode-compile.test.js` — PASS, including zero `RESOLVE_DYNAMIC` for all FITL baseline profile expressions.
- `LUDOFORGE_POLICY_VM=on pnpm -F @ludoforge/engine exec node --test dist/test/integration/policy-bytecode-equivalence.test.js` — PASS.

The Phase 4 perf/restoration premise remains false in the live checkout:

- `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label phase4-preflight-vm` — RED: `elapsedMs=6785.54`, per-card `elapsedMs=6785.31`, threshold `<=250`.

Live CI feedback initially suggested the expensive remaining workflow surface was no longer truthfully represented by the one-card VM/default-flip story alone, especially the `engine-tests.yml` lanes `fitl-events-shard-c` (`test:integration:fitl-events:shard-c`) and `fitl-rules`. Archived ticket `149FITLEVNUMVM-018` profiled those lanes and found no remaining red runtime hot path after stale golden fallout was repaired; the Phase 4 blocker is again the one-card VM perf gate above.

Foundation-aligned decision:

- F14 still forbids retaining closure-tree fallback once the VM path becomes the default runtime, but F15/F16 require the measured VM performance story to be true before the atomic cut.
- This ticket is the F14 default-flip/deletion owner. Phase 4B tickets 019-022 now own the separate generic preview-drive runtime closure proven by later profiling.
- Archived prerequisite ticket `149FITLEVNUMVM-018` completed the live FITL event-card/rules lane reassessment and did not unblock this ticket's one-card VM perf gate.
- The `engine-tests.yml` `fitl-events-shard-c` and `fitl-rules` lanes were restored to blocking semantics early on 2026-05-02 after non-blocking execution masked a stale golden failure. Ticket `149FITLEVNUMVM-003` remains open only for the remaining post-Phase-4 determinism-timeout unwind.

### Boundary Reset (2026-05-02, Phase 4B)

Follow-up profiling classified the VM-enabled one-card profile as still red by the wrong order of magnitude:

- `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4-baseline-codex` — RED: `elapsedMs=7101.08`, per-card `elapsedMs=7100.84`, threshold `<=250`.
- A generic bytecode-cache candidate was rejected because it only moved the same seam to `elapsedMs=7008.38`.
- CPU-profile run: `timeout 180 env LUDOFORGE_POLICY_VM=on node --cpu-prof --cpu-prof-dir=/tmp/ludoforge-149-016-cpu packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4-cpu-after-bytecode-cache` — RED: `elapsedMs=6882.4`, per-card `elapsedMs=6882.17`.

The profile classified the remaining samples as:

- kernel expression/query interpretation (`resolveRef`, `evalCondition`, `evalValue`, `evalQuery`, spatial/filter evaluation): about 22.9% — suitable for a new generic CNL/kernel bytecode or AOT query/effect compiler, but not covered by the current policy VM.
- hashing/canonicalization (`fnv1a64`, `zobristKey`, `computeFullHash`, `digestDecisionStackFrame`): about 21.8% — requires preview hashing/verification strategy work, not bytecode.
- token-index copy/lifetime (`copyCachedTokenStateIndex`, token-state-index build/attach/refresh): about 4.8% — requires preview state/index lifetime work, not bytecode.
- current policy VM / policy bytecode: about 0.8% — no longer the dominant wall-time owner.

Foundation-aligned decision:

- F14 still requires closure-tree deletion once VM defaulting is truthful.
- F15/F16 forbid default-flipping while the original Phase 4 per-card gate remains red.
- The remaining work is formalized as Phase 4B runtime closure:
  - `archive/tickets/149FITLEVNUMVM-019.md` — generic kernel expression/query AOT or bytecode.
  - `archive/tickets/149FITLEVNUMVM-020.md` — preview state and token-index lifetime redesign.
  - `archive/tickets/149FITLEVNUMVM-021.md` — preview hashing and verification strategy.
  - `tickets/149FITLEVNUMVM-022.md` — final reprofile gate that unblocks this ticket only if `<=250 ms` is truthful.

## Assumption Reassessment (2026-04-28)

1. Ticket 015 has landed the VM with A/B routing via `LUDOFORGE_POLICY_VM=on`. Parity is proven via ticket 014's equivalence harness on all 4 baseline profiles × 20 seeds.
2. The closure-tree path is `compiled-policy-runtime.ts:buildPolicyExprClosure` → `policy-evaluation-core.ts:CompiledPolicyExprClosure` callees. Spec §Phase 4 acceptance explicitly mandates deleting these.
3. `RESOLVE_DYNAMIC` opcode count must be zero before this ticket can land — verify by running the compiler against all 4 FITL baseline profiles and asserting zero `RESOLVE_DYNAMIC` emissions. If any remain, eliminate them first (cite spec §5 edge case "Logged as a perf warning so it gets eliminated").
4. The per-card cost ≤ 250 ms target is the original Spec 149 evolution-readiness budget.

## Architecture Check

1. F14 atomic cut: removes the closure-tree path entirely. No `_legacy` shim retained. The mechanical uniformity is verified by listing the full deletion blast radius in this ticket's What to Change.
2. F15 architectural completeness: this ticket closes only after Phase 4B has made the measured VM-enabled one-card hot path truthful. It must not delete closure-tree or claim completion while the Phase 4 perf gate remains red.
3. F8 determinism preserved — the bytecode VM is integer-only; replay-identity tests are the proof.
4. F1 preserved — no game-specific code introduced anywhere in the chain.

## What to Change

### 1. Phase 5/WASM gate precondition

Before any deletion, verify the Phase 5/WASM successor path is complete and records a green same-seam profile at the original Phase 4 budget:

```bash
timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-final
```

The gate remains `<=250 ms` under all 4 baseline profiles with `verifyIncrementalHash=true`. Do not weaken the target or treat current policy-VM correctness or red Phase 4B evidence as sufficient.

### 2. Perf gate test

Create or update `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` at the truthful Phase 4 budget: ≤ 250 ms. The earlier Phase 1 5500 ms and Phase 2 3000 ms gate calibrations were superseded by the `149FITLEVNUMVM-017` stop-condition decision. Update the calibration comment so future readers do not chase the false Phase 1 gate.

The gate must exercise the VM path and report per-profile elapsed values. Do not weaken the gate to match the current red number unless the user explicitly approves a spec-level target change through 1-3-1.

### 3. `packages/engine/src/agents/policy-runtime.ts` (modify)

After the VM perf gate is green, default-flip:
- Remove the `LUDOFORGE_POLICY_VM` env var read.
- Default-route policy evaluation through `executeBytecode` (ticket 015's VM). The bytecode is compiled via ticket 013's `compilePolicyBytecode` once per `evaluatePolicyMove` call (or cached per profile-fingerprint, depending on measurement).
- Delete the closure-tree code path entirely. No fallback retained.

### 4. `packages/engine/src/agents/compiled-policy-runtime.ts` (modify or delete)

Per spec §Phase 4 acceptance: delete `buildPolicyExprClosure`. If the file has remaining exports unrelated to closure-tree evaluation (verify via blast-radius grep), keep only those; otherwise delete the entire file.

### 5. `packages/engine/src/agents/policy-evaluation-core.ts` (modify)

Delete the closure-tree consumer code paths:
- Remove `CompiledPolicyExprClosure` import and downstream usage.
- Replace `evaluateCompiledZoneTokenAggregate` and similar closure-driven dispatch with bytecode VM calls (per ticket 015's `executeBytecode`).
- Per F14, no `_legacy` fallback retained.

### 6. Restore CI workflows (delegated to ticket 003)

This ticket does NOT touch the CI workflow files directly. The engine-test blocking semantics were restored early; ticket 003 retains the remaining post-Phase-4 determinism-timeout unwind. When this ticket closes, ticket 003 becomes unblocked for that remaining workflow cleanup.

### 7. Profiling proof gate

After this ticket lands, run a one-card profile and confirm the 250 ms target:
```bash
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label phase4-final
```
Record the per-profile elapsed values in this ticket's Outcome.

### 8. Sihanouk and March-Free-Operation budget restoration

Verify that `fitl-events-sihanouk.test.ts` and `fitl-march-free-operation.test.ts` complete within their pre-Phase-0-bump budgets (1m 31s and 1m 10s respectively). Record in Outcome.

## Files to Touch

- `packages/engine/scripts/profile-fitl-preview-drive.mjs` or checked-in profiling/report helpers if needed to make the VM perf witness truthful (modify only if the current harness cannot expose the owned metric)
- `packages/engine/src/agents/policy-runtime.ts` (modify — delete A/B switch, default to VM)
- `packages/engine/src/agents/compiled-policy-runtime.ts` (modify or delete)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — delete closure-tree consumers)
- `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` (modify — tighten to 250 ms)

## Out of Scope

- Remaining CI workflow restoration (ticket 003's determinism-timeout unwind — triggered by this ticket's closure).
- Phase 4B runtime closure work, now owned by tickets 019-022.
- Implementing the Phase 5 WASM port; `specs/150-fitl-policy-vm-wasm-port.md` and its tickets own that.
- Recalibrating `fitl-parity-drive.perf.test.ts` (deferred to a follow-up if measurement shows it's needed).
- Weakening the Phase 4 per-card target, deleting coverage, or adding game-specific FITL fast paths to make the gate pass.

## Acceptance Criteria

### Tests That Must Pass

1. Replay-identity tests stay green on ALL 10 determinism shards (no `LUDOFORGE_POLICY_VM` env var needed — bytecode is default).
2. Score-equivalence: ticket 014's harness still passes (now exercising the VM as the default path; closure-tree no longer exists to compare against, so harness is repurposed as a VM correctness check).
3. **Per-card cost: ≤ 250 ms under all 4 baseline profiles** (`verifyIncrementalHash=true`).
4. The Outcome records exact Phase 4B gate evidence, default-flip/deletion proof, and closure-tree removal proof.
5. `engine-tests.yml` ticket-002 lanes (`fitl-events-shard-c` and `fitl-rules`) complete within their pre-Phase-0 budgets.
6. `engine-determinism.yml` job-level timeout (still 60 m at this ticket; ticket 003 reverts) accommodates the determinism shards comfortably.
7. No surviving import sites for `buildPolicyExprClosure` or `CompiledPolicyExprClosure` (verify via grep).
8. Existing suite: `pnpm -F @ludoforge/engine test && pnpm -F @ludoforge/engine test:perf`.

### Invariants

1. Per F14, no `_legacy` closure-tree fallback retained.
2. Per F1, no game-specific opcodes or branches.
3. Per F8, replay identity and integer-only math preserved.
4. Per F15, this ticket completes the architectural answer to the 35× over-budget gap.

## Test Plan

### New/Modified Tests

1. Focused correctness or invariant tests for the default flip and closure-tree deletion.
2. Ticket 014's harness becomes the canonical correctness gate after the closure-tree deletion; ticket 010's property tests guard apply/undo if profiling brings that seam back into scope.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. Successor runtime gate confirmation: `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-final`.
3. Focused correctness tests for accepted VM/perf changes.
4. `pnpm -F @ludoforge/engine test`.
5. `cd packages/engine && node scripts/run-tests.mjs --lane determinism dist/test/determinism/*.test.js` (full determinism corpus).
6. `pnpm -F @ludoforge/engine test:perf` (with the tightened 250 ms gate).
7. `node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label phase4-final` (record in Outcome).
8. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`.
9. `grep -rn 'buildPolicyExprClosure\|CompiledPolicyExprClosure' packages/engine/src` — must return zero hits.
