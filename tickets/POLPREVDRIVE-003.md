# POLPREVDRIVE-003: Profile drive-exit-depth distribution and lower default K_PREVIEW_DEPTH

**Status**: PENDING
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

1. **`K_PREVIEW_DEPTH = 8` at `policy-preview.ts:42` is the only default site.** Verified — `policy-preview.ts:474` reads `input.completionDepthCap ?? K_PREVIEW_DEPTH`. No other constant duplicates this value.
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

Hooking strategy: add an optional `onDriveExit?: (info) => void` runtime callback to the `policy-preview` input shape. The hook is undefined in production paths, used only by the harness. Zero cost when unset; satisfies F1 (no game-specific branching).

### 2. Decide the new default (decision step, in-ticket)

Once the histogram is in hand:

- If the 95th percentile of `final depth` for `kind: 'completed'` exits is ≤ 4, set `K_PREVIEW_DEPTH = 4`.
- If the 95th percentile is 5–6, set `K_PREVIEW_DEPTH = 6`.
- If the 95th percentile is ≥ 7, **do not lower the constant**; close this ticket noting the empirical result and document why class (b) is not a tractable lever. The investigation's recommendation #2 is hypothesis-bound; the data closes the loop.

The ticket Outcome must contain the full distribution table, the chosen value, and the rationale.

### 3. Apply the change (Phase 2)

If the data supports lowering:

- Update `K_PREVIEW_DEPTH = N` at `policy-preview.ts:42`.
- Re-run replay corpus (`spec-140-replay-identity.test.js`, `zobrist-incremental-parity-fitl.test.ts`) and update any pinned witness traces whose final state shifts deterministically. Per `.claude/rules/testing.md`'s `convergence-witness` Update Protocol, evaluate whether each shifted trace can be distilled into an architectural-invariant assertion before re-blessing.
- Re-run `profile-fitl-preview-drive.mjs --profilesAll` and record the new total wall-clock and the new per-function self-time table.

If any FITL baseline profile's downstream replay diverges in a way that distillation can't capture, set `profile.preview.completionDepthCap = 8` for that specific profile in `data/games/fire-in-the-lake/92-agents.md` to preserve its current behaviour, document why in the ticket Outcome, and proceed.

## Files to Touch

- `packages/engine/scripts/profile-fitl-preview-drive.mjs` (modify) or `packages/engine/scripts/profile-fitl-preview-drive-depths.mjs` (new)
- `packages/engine/src/agents/policy-preview.ts` (modify — `K_PREVIEW_DEPTH` constant + optional `onDriveExit` hook)
- `data/games/fire-in-the-lake/92-agents.md` (modify, only if a per-profile override is needed to preserve replay)
- `packages/engine/test/determinism/zobrist-incremental-parity-fitl.test.ts` (re-run; update pinned witnesses only if the cap change is the verified root cause of any shift, per `.claude/rules/testing.md` Update Protocol)

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
3. `zobrist-incremental-parity-fitl.test.ts` — replay parity green within the 30-min CI budget on the `fitl-parity-zobrist` shard.
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
6. CI: `zobrist-incremental-parity-fitl.test.ts` lane (`fitl-parity-zobrist` shard).
