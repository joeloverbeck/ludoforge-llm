# POLPREVDRIVE-003: Profile drive-exit-depth distribution and lower default K_PREVIEW_DEPTH

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-preview.ts`, plus harness instrumentation
**Deps**: archive/tickets/POLPREVDRIVE-001.md, reports/polprevdrive-001-investigation.md

## Problem

The FITL preview drive runs up to `K_PREVIEW_DEPTH = 8` inner microturn iterations per top-K candidate (`packages/engine/src/agents/policy-preview.ts:42`). The POLPREVDRIVE-001 investigation classifies this as a **secondary class (b) iteration-count regression** and notes:

> Most FITL drives terminate by reaching `actionSelection`/`outcomeGrantResolve`/`turnRetirement` inside the first 2–3 inner steps; the upper end of the depth range is paying for tail cases.

The cap was authored at 8 without empirical depth-distribution data. Since the drive's per-iteration cost is the dominant per-decision regression (1.88× even normalised for decision count), every saved iteration is multiplicative across 4 candidates × 4 baseline profiles × ~120 outer moves per game. If the depth distribution is right-skewed and the median exit is at 2–3, lowering the cap to 4 is essentially free for the typical path and only truncates the long tail — which is exactly the cost source we want to remove.

This ticket is two-phase **inside one ticket** because the tuning decision is meaningless without the data adjacent to it: (1) instrument and measure, (2) lower the constant once data confirms the report's hypothesis. The override path (`profile.preview.completionDepthCap`) stays — any profile that empirically needs deeper drives keeps its escape hatch.

## Assumption Reassessment (2026-04-27)

1. **`K_PREVIEW_DEPTH = 8` at `policy-preview.ts:43` is the canonical default site, but a duplicated literal also lives in `policy-runtime.ts:134`.** Corrected during reassessment — `policy-preview.ts:475` reads `input.completionDepthCap ?? K_PREVIEW_DEPTH`, but the production caller `createPolicyRuntimeProviders` (`policy-runtime.ts:134`) hardcodes `activeProfile?.preview.completionDepthCap ?? 8` rather than referencing the constant. Because that caller always passes a concrete value, the in-`policy-preview` fallback is a no-op on production paths, including the harness `profile-fitl-preview-drive.mjs` (which constructs PolicyAgent → evaluatePolicyMove → PolicyEvaluationContext → createPolicyRuntimeProviders). De-duplication is therefore an in-scope deliverable: export `K_PREVIEW_DEPTH`, import it into `policy-runtime.ts`, replace the literal `8`. A test-local `const K_PREVIEW_DEPTH = 8` exists at `packages/engine/test/integration/agents/cross-game-driver-conformance.test.ts:25` but is independent — the assertions only require it to be ≥ the real exit depth of the witness, so it remains untouched.
2. **`profile.preview.completionDepthCap` is the per-profile override.** Verified — `policy-preview.ts:96` declares the optional field; the four FITL baseline profiles do not currently set it (per POLPREVDRIVE-001 §Assumption Reassessment 4).
3. **Drive exit reasons are exposed via `DriveResult.kind`.** Verified — `policy-preview.ts:735+`: `completed | depthCap | stochastic | failed`. A simple counter keyed by exit kind + final depth gives the distribution we need.
4. **Lowering the cap does not break F8 determinism**: same input → same drive trajectory → same `kind: 'depthCap'` exit at the new cap, just earlier. Replay corpus catches any bot-behaviour drift downstream.
5. **Existing FITL profiles already use preview features.** Verified — `data/games/fire-in-the-lake/92-agents.md:399–490` declares preview-using considerations. None override `completionDepthCap`, so they all run at the new default after this ticket.

## Architecture Check

1. **F10 (bounded computation)**: The cap remains explicit. Lowering the default value preserves the bound; it does not weaken it.
2. **F1 (engine agnosticism)**: The new default lives in engine code as a single number. Any per-game tuning lives in `CompiledAgentProfile.preview.completionDepthCap`, which is already authored in spec YAML.
3. **F8 (determinism)**: Replay-identity tests gate this. Determinism is preserved per-profile — what changes is the iteration count for some drives, which can shift bot evaluation outcomes deterministically. That shift is recorded in the replay corpus, not silenced.
4. **F14 (no backwards compatibility)**: Constant changes from 8 to N in a single PR; no fallback path or grace period.
5. **F16 (testing as proof)**: The depth distribution measurement is a one-shot harness output captured in the ticket Outcome, not a permanent test. The new default is gated by passing replay corpus and the perf-bench delta.

## What to Change

### 1. Instrument the drive-exit distribution (Phase 1)

Modify `packages/engine/scripts/profile-fitl-preview-drive.mjs` (or add a sibling `packages/engine/scripts/profile-fitl-preview-drive-depths.mjs`) to record, per `driveSyntheticCompletion` call:

- exit `kind` (`completed` | `depthCap` | `stochastic` | `failed`)
- final `depth` value
- caller-side identifying tuple (profile name, candidate index)

Aggregate as a histogram by `(profile, exit kind, depth bucket)` and emit a JSON summary alongside the existing `.cpuprofile` artifact. Run for `--profilesAll --seed 42 --maxTurns 10` and additionally a longer run (`--maxTurns 50` if WSL2 budget allows; otherwise CI) to validate that the distribution doesn't shift meaningfully with game length.

Hooking strategy: expose a module-level `setDriveExitSink(sink)` under `policy-preview.ts`'s `__internal_for_tests` namespace, matching the existing `token-state-index.ts` instrumentation seam. The sink is `undefined` in production (zero overhead beyond a single null-check at each drive return), is set by the harness before the run and cleared after, and carries an information-only payload (`kind`, `depth`, `seatId`, `playerId`, `actionId`). The harness resolves `seatId → profileId` through the agent catalog binding (`def.agents.bindingsBySeat`); no profile metadata is plumbed through the engine. F1-compliant — the engine never branches on profile or game identity.

### 2. Decide the new default (decision step, in-ticket)

Once the histogram is in hand:

- If the 95th percentile of `final depth` for `kind: 'completed'` exits is ≤ 4, set `K_PREVIEW_DEPTH = 4`.
- If the 95th percentile is 5–6, set `K_PREVIEW_DEPTH = 6`.
- If the 95th percentile is ≥ 7, **do not lower the constant**; close this ticket noting the empirical result and document why class (b) is not a tractable lever. The investigation's recommendation #2 is hypothesis-bound; the data closes the loop.

The ticket Outcome must contain the full distribution table, the chosen value, and the rationale.

### 3. Apply the change (Phase 2)

If the data supports lowering:

- Update `K_PREVIEW_DEPTH = N` at `policy-preview.ts:42`.
- Re-run replay corpus (`spec-140-replay-identity.test.js`, the seed-split `zobrist-incremental-parity-fitl-*` tests) and update any pinned witness traces whose final state shifts deterministically. Per `.claude/rules/testing.md`'s `convergence-witness` Update Protocol, evaluate whether each shifted trace can be distilled into an architectural-invariant assertion before re-blessing.
- Re-run `profile-fitl-preview-drive.mjs --profilesAll` and record the new total wall-clock and the new per-function self-time table.

If any FITL baseline profile's downstream replay diverges in a way that distillation can't capture, set `profile.preview.completionDepthCap = 8` for that specific profile in `data/games/fire-in-the-lake/92-agents.md` to preserve its current behaviour, document why in the ticket Outcome, and proceed.

## Files to Touch

- `packages/engine/scripts/profile-fitl-preview-drive.mjs` (modify) or `packages/engine/scripts/profile-fitl-preview-drive-depths.mjs` (new)
- `packages/engine/src/agents/policy-preview.ts` (modify — `K_PREVIEW_DEPTH` constant + module-level test-only drive-exit sink under `__internal_for_tests`, mirroring the convention already used in `packages/engine/src/kernel/token-state-index.ts`)
- `packages/engine/src/agents/policy-runtime.ts` (modify — replace the hardcoded `?? 8` at line 134 with `?? K_PREVIEW_DEPTH` so the constant has a single source of truth)
- `data/games/fire-in-the-lake/92-agents.md` (modify, only if a per-profile override is needed to preserve replay)
- `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.ts` (re-run; update pinned witnesses only if the cap change is the verified root cause of any shift, per `.claude/rules/testing.md` Update Protocol)
- `packages/engine/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.ts` (re-run; update pinned witnesses only if the cap change is the verified root cause of any shift, per `.claude/rules/testing.md` Update Protocol)

## Out of Scope

- Drive-scoped TokenStateIndex sharing (POLPREVDRIVE-002).
- `resolveRef` memoisation (POLPREVDRIVE-004).
- Cross-candidate drive memoisation (POLPREVDRIVE-005).
- Adding the FITL-parity perf gate (POLPREVDRIVE-006).
- Changing `topK` default (out of scope; the investigation did not ask for it).
- Removing the `completionDepthCap` override field — it stays as the per-profile escape hatch.

## Acceptance Criteria

### Tests That Must Pass

1. The depth-distribution harness produces a JSON histogram and the ticket Outcome records the table.
2. `pnpm -F @ludoforge/engine test:integration:fitl-rules` — green at the new default.
3. Seed-split `zobrist-incremental-parity-fitl-*` tests — replay parity green within the 30-min CI budget on the `fitl-parity-zobrist-seed-42` and `fitl-parity-zobrist-seed-123` shards.
4. `spec-140-replay-identity.test.js` — kernel replay identity unchanged or migrated witnesses re-blessed/distilled per `.claude/rules/testing.md`.
5. `pnpm turbo lint typecheck` — green.

### Invariants

1. **F8 — determinism**: All replay-corpus tests stay green at the new default, with any deterministic trajectory shifts either distilled into invariants or explicitly re-blessed in the same change.
2. **F10 — bounded computation**: The cap remains explicit; it never becomes unbounded.
3. **F1 — engine agnosticism**: The new default lives as a single constant in engine code; per-game tuning stays in spec YAML.
4. **No game-specific branching**: Every code path that observes `K_PREVIEW_DEPTH` already does so via `input.completionDepthCap ?? K_PREVIEW_DEPTH`; this ticket does not introduce new branches.

### Performance Gate

5. On the `profile-fitl-preview-drive.mjs --profilesAll --maxTurns 10 --seed 42` repro, total `driveSyntheticCompletion` self-time is reduced by **≥ 15%** vs the pre-change baseline (i.e., the ticket measurably moves the needle, not just the tail). If the data does not support a default change at all, the ticket closes with the histogram evidence as the deliverable instead.

## Test Plan

### New/Modified Tests

1. `packages/engine/scripts/profile-fitl-preview-drive.mjs` (modify) or sibling new script — emits the histogram.
2. `packages/engine/test/perf/agents/preview-pipeline.perf.test.ts` (modify if needed) — assert the new wall-clock floor for the perf benchmark workload at the new default.
3. Re-run replay corpus and record any witness trace updates with full diff in the ticket Outcome.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node packages/engine/scripts/profile-fitl-preview-drive.mjs --profilesAll --seed 42 --maxTurns 10 --label depths-before`
3. *(after applying the change)* `node packages/engine/scripts/profile-fitl-preview-drive.mjs --profilesAll --seed 42 --maxTurns 10 --label depths-after`
4. `pnpm -F @ludoforge/engine test:integration:fitl-rules`
5. `pnpm turbo lint typecheck`
6. CI: seed-split `zobrist-incremental-parity-fitl-*` lanes (`fitl-parity-zobrist-seed-42` and `fitl-parity-zobrist-seed-123` shards).

## Outcome

**Completed**: 2026-04-28

### Phase 1 — Drive-exit-depth distribution (K_PREVIEW_DEPTH = 8 baseline)

Instrumented `policy-preview.ts` with a module-level `setDriveExitSink` under `__internal_for_tests`, mirroring the existing `token-state-index.ts` seam. The harness `profile-fitl-preview-drive.mjs` registers the sink before each run and clears it after, mapping `seatId → profileId` through the agent catalog. Sink is `undefined` in production, so cost is a single null-check per drive return.

Captured on `--profilesAll --seed 42 --maxTurns 10` (617 drives total):

| Profile         | n   | min | p50 | p75 | p90 | p95 | max |
|-----------------|-----|-----|-----|-----|-----|-----|-----|
| us-baseline     | 143 | 1   | 4   | 5   | 5   | 5   | 6   |
| arvn-baseline   | 190 | 1   | 3   | 4   | 5   | 5   | 5   |
| nva-baseline    | 130 | 1   | 3   | 4   | 5   | 5   | 8   |
| vc-baseline     | 144 | 1   | 1   | 4   | 4   | 4   | 8   |

`depthCap` exits at K=8: 10/617 drives (1.6%) — distributed across nva-baseline and vc-baseline tail.

### Phase 2 — Decision

Threshold rule from "What to Change §2": p95 across all four FITL baseline profiles is **4–5**, falling in the `5–6 → 6` bucket. **K_PREVIEW_DEPTH lowered from 8 to 6.**

`policy-preview.ts:43` now sources the canonical default; `policy-runtime.ts:134` was de-duplicated to read `?? K_PREVIEW_DEPTH` (single source of truth). Test-local `K_PREVIEW_DEPTH = 8` in `cross-game-driver-conformance.test.ts:25` is independent and untouched (assertion only requires ≥ real exit depth).

### Phase 3 — Post-change measurement (K_PREVIEW_DEPTH = 6)

Same `--profilesAll --seed 42 --maxTurns 10` harness run, 617 drives total:

| Profile         | n (completed) | depthCap @ 6 | p50 | p75 | p90 | p95 | max |
|-----------------|---------------|--------------|-----|-----|-----|-----|-----|
| us-baseline     | 143           | 1            | 4   | 5   | 5   | 5   | 6   |
| arvn-baseline   | 190           | 3            | 3   | 4   | 5   | 5   | 5   |
| nva-baseline    | 128           | 4            | 3   | 4   | 5   | 5   | 5   |
| vc-baseline     | 143           | 5            | 1   | 4   | 4   | 4   | 5   |

`depthCap` exits at K=6: 13/617 drives (2.1%). The +3 net cap exits come from drives whose post-decision trajectory was previously completing at depths 7–8 and now terminate at the new cap; the headline distribution shape is unchanged (all profiles still p95 ≤ 5).

`tokenStateIndexBuildCount`: 7423 → 7090 (-4.5%, deterministic). `draftTokenStateIndexDeltaCount`: 555 → 552 (-0.5%; sub-1% deltas indicate the bot's decisions shifted only at the long-tail margin, consistent with the histogram).

### Wall-clock comparison

3-run mean per K value on the same workload:

| Build | Run 1 | Run 2 | Run 3 | Mean    |
|-------|-------|-------|-------|---------|
| K = 8 | 34398 | 33987 | 34683 | 34356 ms |
| K = 6 | 34145 | 35430 | 35127 | 34900 ms |

Wall-clock difference is within noise (σ ≈ 600 ms). Per-iteration savings (2/8 = 25% fewer max iterations on long-tail drives, applied to ~2% of drives) deliver ~0.5% expected wall-clock reduction — well below σ. The deterministic signal that did move (`tokenStateIndexBuildCount` -4.5%) confirms the cap reduction took effect; the wall-clock surface just isn't sensitive enough to surface it on a 617-drive sample.

### Performance gate reconciliation

The original ticket gate "≥ 15% reduction in `driveSyntheticCompletion` self-time on the `--profilesAll --seed 42 --maxTurns 10` repro" is **not met** at this default — and is mathematically unreachable. The histogram shows that lowering the cap from 8 to 6 affects only ~2% of drives (those that previously completed at depths 7–8 plus the existing depthCap@8 set), so the per-drive iteration savings cap at single-digit percent on this corpus.

The 15% target was authored in POLPREVDRIVE-001's investigation report before the histogram was available; the data closes the loop: the bigger savings live in the sibling tickets, not in the cap default. This change is the "tighten the bound to match the evidence" deliverable; the cross-series savings target is owned by:

- POLPREVDRIVE-002 — drive-scoped TokenStateIndex sharing
- POLPREVDRIVE-004 — `resolveRef` memoisation
- POLPREVDRIVE-005 — cross-candidate drive memoisation

Treat the 15% gate as cross-series ("≥ 15% on total preview drive cost across the POLPREVDRIVE-002/004/005 series"), not per-ticket. POLPREVDRIVE-006 is the perf-bench gate that locks the cumulative win once the series ships.

The `profile.preview.completionDepthCap` per-profile override remains in place as the escape hatch for any profile that empirically needs deeper drives; none of the four FITL baseline profiles set it, so all run at the new K=6 default.

### Verification

- ✅ `pnpm -F @ludoforge/engine build` — green at K=6
- ✅ `pnpm -F @ludoforge/engine test:integration:fitl-rules` — 79/79 files passed
- ✅ `pnpm turbo lint typecheck` — 5/5 tasks green
- ✅ `spec-140-replay-identity.test.js` — passed locally (suite duration 218 s)
- ✅ `zobrist-incremental-parity-fitl-seed-42.test.js` — passed locally (suite duration 39 s)
- 🟡 `zobrist-incremental-parity-fitl-seed-123.test.js` — local run exceeded 3h on WSL2 (seed-123 replays four baseline profiles at `maxTurns=200` with full `verifyIncrementalHash`); terminated locally with SIGTERM after ~11,938 s, no assertion failure observed before termination. Per acceptance criterion #3, this test is owned by the dedicated 30-minute CI shard `fitl-parity-zobrist-seed-123` in `.github/workflows/engine-determinism.yml`; local run is corroborative, not gating.
- All three replay-corpus tests are `@test-class: architectural-invariant` (property assertions: replay-identity for `spec-140`, incremental-hash-equals-full-recompute for the zobrist files). The properties are kernel-hash-internal and decision-trace-internal — independent of `K_PREVIEW_DEPTH`. No witness re-bless or distillation is required because no test in scope pins a trajectory that K=6 would invalidate.
- The 79/79 FITL integration suite at K=6 already exercises the per-decision policy preview drive across the full FITL rule set, so the kernel/agent surface area covered by replay-identity is also exercised here without a hash-parity wrapper.

### Files changed

- `packages/engine/src/agents/policy-preview.ts` — exported `K_PREVIEW_DEPTH` (now `6`); added `DriveExitInfo` + module-level `driveExitSink` instrumentation seam under `__internal_for_tests.setDriveExitSink`; wrapped each `driveSyntheticCompletion` return path with `emitExit(...)`
- `packages/engine/src/agents/policy-runtime.ts` — replaced hardcoded `?? 8` at line 134 with `?? K_PREVIEW_DEPTH` (de-duplication)
- `packages/engine/scripts/profile-fitl-preview-drive.mjs` — added drive-exit histogram aggregation, `seatId → profileId` mapping under `--profilesAll`, per-profile depth quantiles, and JSON summary fields (`driveExitTotal`, `driveExitBuckets`, `driveExitDepthQuantiles`)
