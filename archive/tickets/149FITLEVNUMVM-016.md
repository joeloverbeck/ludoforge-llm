# 149FITLEVNUMVM-016: Phase 4 VM perf closure + default-flip F14 cut

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/agents/policy-runtime.ts`, `packages/engine/src/agents/compiled-policy-runtime.ts`, `packages/engine/src/agents/policy-evaluation-core.ts`, `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts`
**Deps**: `archive/tickets/149FITLEVNUMVM-014.md`, `archive/tickets/149FITLEVNUMVM-015.md`, `archive/tickets/149FITLEVNUMVM-018.md`, `archive/tickets/149FITLEVNUMVM-022.md`, `archive/tickets/150FITLWASM-013.md`, `archive/tickets/150FITLWASM-014.md`, `archive/tickets/150FITLWASM-010.md`, `archive/tickets/150FITLWASM-034.md`

## Problem

Phase 4's terminal deliverable owns the F14 cut: default the policy evaluation path to bytecode VM and delete the closure-tree runtime. Ticket 018 ruled out the engine-test workflow lanes as the remaining runtime blocker after stale golden fallout was repaired, but later profiling proved the remaining one-card wall time is dominated by generic preview-drive runtime work outside the current policy bytecode VM. Ticket 022 then proved Phase 4B still misses the original budget after its runtime-closure slices; Spec 150 owned the Phase 5/WASM successor path. The Spec 150 chain reduced the active same-seam route from the original multi-second red gate down to ticket `150FITLWASM-033`'s final retained solo `1355.26 ms`, but ticket `150FITLWASM-034` proved the original `<=250 ms` budget is not a feasible blocker for the current same-seam architecture.

User-approved budget reset on 2026-05-04: the active successor-runtime gate for this F14 cut is now `<=1800 ms`, justified by retained clean `033` samples (`1355.26 ms`, `1383.35 ms`) and the fresh `034` bucketed confirmation (`1512.38 ms`). The original `<=250 ms` target is retired as a blocker for this ticket.

This ticket therefore has one ordered stage:

1. Confirm the successor-runtime same-seam profile remains `<=1800 ms` with clean active-route diagnostics.
2. Flip the default policy evaluation path from closure-tree to the proven successor runtime and delete the closure-tree evaluation infrastructure (`buildPolicyExprClosure` and downstream callees) per F14.

When complete, this ticket adds or updates the per-card perf gate and triggers ticket 003 for the remaining CI restoration unwind.

Ticket `150FITLWASM-004` through `150FITLWASM-033` progressively landed the supported WASM score-row, preview-state, preview-drive, hash, token-index, query, encoding, spatial, microturn, and allocation slices while preserving clean active-route diagnostics. Ticket `150FITLWASM-034` rejected the original `<=250 ms` blocker after live probes showed the current architecture could not truthfully close the remaining gap, and it authorized this ticket to proceed under the measured `<=1800 ms` gate.

## Reassessment Update (2026-05-04, budget reset)

Ticket `150FITLWASM-034` executed the post-033 residual pass and retained no
code changes. Its fresh same-seam bucketed profile recorded `elapsedMs=1512.38`
with clean active-route diagnostics:

- `wasmScoreRowUnsupportedCount=0`
- `wasmPreviewCandidateFeatureRowUnsupportedCount=0`
- `wasmScoreRowBytecodeCompileCount=0`
- `wasmProductionPreviewDriveBatchCount=232`

The final conclusion is that the original `<=250 ms` budget is not a feasible
blocker for the current same-seam architecture. The user approved replacing it
with a measured `<=1800 ms` successor-runtime gate. This ticket is now unblocked
for the F14 default-flip/deletion cut after confirming that reset gate.

## Reassessment Update (2026-05-04, Spec 150 successor handoff)

Ticket `150FITLWASM-020` landed generic token-placement hash elision plus
WeakMap-scoped encoded bytecode input caching, preserved clean active-route
diagnostics, and left the same-seam gate red around `2.5 s` versus `<=250 ms`.
The active successor owner for the remaining deeper active-route
query/apply/hash residual moved to `archive/tickets/150FITLWASM-021.md`; that
ticket landed a setup-hash root-counter reduction but left the same-seam gate
red around `2.5 s`. Ticket `150FITLWASM-022` landed bounded dynamic Zobrist
feature-key memoization, reduced `zobristKeyUncachedCount` from `1391` to
`334`, and left the same-seam gate red at per-card `elapsedMs=2539.8`. Ticket
`150FITLWASM-023` through `150FITLWASM-033` then landed further generic hash,
query/eval, encoding, token-index, connected-zone, compiler, and post-count
residual reductions, with the final retained solo gate at `1355.26 ms`. Ticket
`150FITLWASM-034` later rejected the original `<=250 ms` blocker and reset
this ticket's active gate to `<=1800 ms`.

## Reassessment Update (2026-05-02, Phase 5 handoff; superseded 2026-05-04)

Ticket `149FITLEVNUMVM-022` ran the final Phase 4B same-seam profile and the gate remained red:

- `timeout 180 env LUDOFORGE_POLICY_VM=on node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4b-final` — RED: per-card `elapsedMs=6702.65`, threshold `<=250`.

User-approved decision at the time: stop Phase 4B as failed for the original budget and promote Phase 5/WASM as the next architectural owner. That blocker chain is now superseded by the 2026-05-04 budget reset above; the historical successor tickets remain archived evidence for the reset.

This is a Foundation 14 atomic cut spanning the full deletion blast radius. Mechanical uniformity rationale: the closure-tree call site is a single dispatch point in `policy-runtime.ts`, and `compiled-policy-runtime.ts:buildPolicyExprClosure` has a bounded set of consumers in `policy-evaluation-core.ts` (verified during ticket 015 prep).

## Reassessment Update (2026-05-02)

Do not execute the default-flip or closure-tree deletion first. Execute the VM perf investigation/optimization stage inside this ticket, then perform the F14 cut only after the measured Phase 4 gate is green.

User confirmation satisfied the ">=3 consecutive CI runs" correctness/parity precondition for the VM path, and local focused proof confirmed VM correctness:

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
  - `archive/tickets/149FITLEVNUMVM-022.md` — terminal final reprofile gate that handed off to Spec 150 after the original `<=250 ms` gate remained red.

## Assumption Reassessment (2026-04-28)

1. Ticket 015 has landed the VM with A/B routing via `LUDOFORGE_POLICY_VM=on`. Parity is proven via ticket 014's equivalence harness on all 4 baseline profiles × 20 seeds.
2. The closure-tree path is `compiled-policy-runtime.ts:buildPolicyExprClosure` → `policy-evaluation-core.ts:CompiledPolicyExprClosure` callees. Spec §Phase 4 acceptance explicitly mandates deleting these.
3. `RESOLVE_DYNAMIC` opcode count must be zero before this ticket can land — verify by running the compiler against all 4 FITL baseline profiles and asserting zero `RESOLVE_DYNAMIC` emissions. If any remain, eliminate them first (cite spec §5 edge case "Logged as a perf warning so it gets eliminated").
4. The original per-card cost `<=250 ms` target is retired as an active blocker by the 2026-05-04 budget reset; the current gate is `<=1800 ms`.

## Architecture Check

1. F14 atomic cut: removes the closure-tree path entirely. No `_legacy` shim retained. The mechanical uniformity is verified by listing the full deletion blast radius in this ticket's What to Change.
2. F15 architectural completeness: this ticket closes only after Phase 4B has made the measured VM-enabled one-card hot path truthful. It must not delete closure-tree or claim completion while the Phase 4 perf gate remains red.
3. F8 determinism preserved — the bytecode VM is integer-only; replay-identity tests are the proof.
4. F1 preserved — no game-specific code introduced anywhere in the chain.

## What to Change

### 1. Successor runtime gate precondition

Before any deletion, verify the successor runtime path records a green
same-seam profile at the reset Phase 4 budget:

```bash
timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4-reset-final
```

The gate is `<=1800 ms` under all 4 baseline profiles with
`verifyIncrementalHash=true`, and active-route diagnostics remain clean. Do not
weaken this reset gate without a new user-approved 1-3-1 decision.

### 2. Perf gate test

Create or update `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` at the reset Phase 4 budget: `<=1800 ms`. The earlier Phase 1 `5500 ms`, Phase 2 `3000 ms`, and original `<=250 ms` gate calibrations were superseded by the stop-condition and 2026-05-04 budget-reset decisions. Update the calibration comment so future readers do not chase the retired Phase 1 or `<=250 ms` gates.

The gate must exercise the successor runtime path and report per-profile
elapsed values. Do not weaken the gate to match a future red number unless the
user explicitly approves a spec-level target change through 1-3-1.

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

After this ticket lands, run a one-card profile and confirm the reset target:
```bash
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label phase4-reset-final
```
Record the per-profile elapsed values in this ticket's Outcome.

### 8. Sihanouk and March-Free-Operation budget restoration

Verify that `fitl-events-sihanouk.test.ts` and `fitl-march-free-operation.test.ts` complete within their pre-Phase-0-bump budgets (1m 31s and 1m 10s respectively). Record in Outcome.

## Files to Touch

- `packages/engine/scripts/profile-fitl-preview-drive.mjs` or checked-in profiling/report helpers if needed to make the VM perf witness truthful (modify only if the current harness cannot expose the owned metric)
- `packages/engine/src/agents/policy-runtime.ts` (modify — delete A/B switch, default to VM)
- `packages/engine/src/agents/compiled-policy-runtime.ts` (modify or delete)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — delete closure-tree consumers)
- `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` (modify — add/reset to 1800 ms)

## Out of Scope

- Remaining CI workflow restoration (ticket 003's determinism-timeout unwind — triggered by this ticket's closure).
- Phase 4B runtime closure work, now owned by tickets 019-022.
- Implementing the Phase 5 WASM port; `archive/specs/150-fitl-policy-vm-wasm-port.md` and its tickets own that.
- Recalibrating `fitl-parity-drive.perf.test.ts` (deferred to a follow-up if measurement shows it's needed).
- Further weakening the reset Phase 4 per-card target, deleting coverage, or adding game-specific FITL fast paths to make the gate pass.

## Acceptance Criteria

### Tests That Must Pass

1. Replay-identity tests stay green on ALL 10 determinism shards (no `LUDOFORGE_POLICY_VM` env var needed — bytecode is default).
2. Score-equivalence: ticket 014's harness still passes (now exercising the VM as the default path; closure-tree no longer exists to compare against, so harness is repurposed as a VM correctness check).
3. **Per-card cost: ≤ 1800 ms under all 4 baseline profiles** (`verifyIncrementalHash=true`).
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
2. Successor runtime gate confirmation: `timeout 180 node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4-reset-final`.
3. Focused correctness tests for accepted VM/perf changes.
4. `pnpm -F @ludoforge/engine test`.
5. `cd packages/engine && node scripts/run-tests.mjs --lane determinism dist/test/determinism/*.test.js` (full determinism corpus).
6. `pnpm -F @ludoforge/engine test:perf` (with the reset 1800 ms gate).
7. `node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --label phase4-reset-final` (record in Outcome).
8. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`.
9. `grep -rn 'buildPolicyExprClosure\|CompiledPolicyExprClosure' packages/engine/src` — must return zero hits.

## Outcome (2026-05-04)

Implemented the F14 default-flip/deletion cut under the user-approved
`<=1800 ms` reset gate:

- Removed the `LUDOFORGE_POLICY_VM` rollout switch from the policy runtime.
- Deleted `packages/engine/src/agents/compiled-policy-runtime.ts`.
- Rewired `PolicyEvaluationContext.evaluateCompiledExpr` to default through the
  bytecode VM for the supported encoded numeric substrate, with direct
  expression evaluation retained only for expression shapes the compact VM
  explicitly does not own (for example preview-surface reads, filtered token
  aggregates, adjacent/seat aggregates, zone attributes, non-numeric literals,
  and unencodable synthetic states). No closure-tree runtime or `_legacy`
  fallback remains.
- Added `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` as
  the reset `<=1800 ms` per-card gate.
- Updated the bytecode equivalence harness to compare default bytecode behavior
  and WASM-supported rows after closure-tree deletion.

Final reset profile:

```text
node packages/engine/scripts/profile-fitl-preview-drive.mjs --seed 42 --maxTurns 1 --profilesAll --perCard --profileBuckets --label phase4-reset-final
elapsedMs=1493.12
per-card elapsedMs=1492.96
target <=1800 ms
headroom=307.04 ms
wasmScoreRowUnsupportedCount=0
wasmPreviewCandidateFeatureRowUnsupportedCount=0
wasmScoreRowBytecodeCompileCount=0
wasmProductionPreviewDriveBatchCount=232
driveExitTotal=0
```

Deletion proof:

```text
rg -n 'buildPolicyExprClosure|CompiledPolicyExprClosure|LUDOFORGE_POLICY_VM' packages/engine/src packages/engine/test
```

returned zero hits.

Budget lane proof:

- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-events-sihanouk.test.js` — PASS, suite `duration_ms=18030.142666` (under 1m 31s).
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-march-free-operation.test.js` — PASS, suite `duration_ms=4885.25769` (under 1m 10s).

Verification:

- `pnpm -F @ludoforge/engine build` — PASS.
- `pnpm -F @ludoforge/engine test` — PASS unsandboxed; default lane summary `60/60 files passed`.
- `node scripts/run-tests.mjs --lane determinism dist/test/determinism/*.test.js` — PASS; `87` tests, `28` suites.
- `pnpm -F @ludoforge/engine test:perf` — PASS; includes the new Spec 149 reset gate.
- `pnpm turbo build` — PASS.
- `pnpm turbo lint` — PASS.
- `pnpm turbo typecheck` — PASS.
- Schema/artifact surfaces: no serialized schema or generated artifact contract
  changed; build/lint/typecheck and the unchanged schema/artifact diff confirmed
  no schema regeneration was needed.
- File-size closeout: `policy-evaluation-core.ts` was already over repo
  guidance and retained active growth (`1555` lines after the cut) because the
  ticket-owned deletion/default-flip path needed to keep the shared
  policy-evaluation routing in one reviewed seam. Extraction was considered but
  deferred because splitting the mixed VM/direct-evaluator dispatch during the
  F14 atomic cut would widen the review surface; no new residual ticket is
  created from this review.

Materiality ledger:

- Reset baseline evidence: ticket `150FITLWASM-034` retained `1512.38 ms`.
- Retained green successor samples from ticket `150FITLWASM-033`: `1355.26 ms`
  and `1383.35 ms`.
- Final decisive sample for this ticket: `1492.96 ms` per card.
- Verdict: green under the `<=1800 ms` reset gate; ticket `149FITLEVNUMVM-003`
  is now unblocked for the remaining CI restoration unwind.
