# POLPREVDRIVE-005: Cross-candidate drive memoisation by structural fingerprint

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Large
**Engine Changes**: Yes — `packages/engine/src/agents/policy-eval.ts`, `packages/engine/src/agents/policy-preview.ts`
**Deps**: archive/tickets/POLPREVDRIVE-001.md, reports/polprevdrive-001-investigation.md

## Problem

`pickTopKByMoveOnlyScore` (`packages/engine/src/agents/policy-eval.ts:961+`) admits **top-K = 4 candidates** per outer move evaluation, and each admitted candidate triggers a fresh `driveSyntheticCompletion` (`packages/engine/src/agents/policy-preview.ts:690`). The picker itself is essentially free (0.01% of total sampled time), but the **four downstream drives per outer move are non-shared**, even when two or more candidates resolve to structurally-equal post-effect states.

The POLPREVDRIVE-001 investigation classifies this as **secondary class (c) per-candidate amplification** and recommends:

> Several FITL event card actions resolve to the same post-effect state when the agent picks identical follow-on decisions — a dedupe by `(cardId, side, sideEffectFingerprint)` could collapse 2–3 candidates per outer move into one drive.

If two top-K candidates would produce the same `DriveResult` (because their post-publish kernel states would be byte-identical, or sufficiently equivalent that the value-features the drive computes don't differ), running both drives is redundant. A correctly-keyed cache shared across the four drives in a single `evaluatePolicyMoveCore` pass collapses this redundancy.

This is the **highest-risk** ticket in the POLPREVDRIVE series. The fingerprint must be a sound identity oracle — if it ever returns equal for two candidates whose drives would have produced different `PolicyValue` outputs, the bot's evaluation drifts non-deterministically. F8 is load-bearing: the cache must never lie about equivalence.

## Assumption Reassessment (2026-04-27)

1. **`pickTopKByMoveOnlyScore` returns a Set of up to 4 stableMoveKeys.** Verified — `policy-eval.ts:989` returns `new Set(ranked.slice(0, topK).map((entry) => entry.candidate.stableMoveKey))`. Each admitted candidate flows through to `driveSyntheticCompletion` independently.
2. **Candidates have a stable identity surface.** Verified — `candidate.stableMoveKey` exists. Whether two candidates with different `stableMoveKey`s produce equal drive results is the question this ticket addresses; `stableMoveKey` is a necessary but not sufficient identifier.
3. **Drives are deterministic given `(state, trustedMove)`.** Verified — `driveSyntheticCompletion` reads only `(input.def, input.state, input.runtime)` and `trustedMove`. Same inputs → same `DriveResult`. Memoisation is sound by construction *if the fingerprint identifies equivalent inputs*.
4. **`trustedMove.sourceStateHash` already exists.** Verified — `policy-preview.ts:691`. The drive's input state has a canonical hash, which is a good starting fingerprint component for "same source state".
5. **The cache must be allocated per `evaluatePolicyMoveCore` call.** Module-level caching would re-introduce the V8 deopt class (memory: `feedback_observability_before_changes.md`). The cache is request-scoped to one outer move evaluation and discarded after.
6. **Two stableMoveKeys with the same canonical effect produce byte-identical post-publish state.** This is **not yet verified in code** — it is the core assumption this ticket proves before merging. Verification path is in §What to Change Step 1.

## Architecture Check

1. **F8 (determinism) — load-bearing**: The fingerprint is a sound identity oracle iff `fingerprint(c1) == fingerprint(c2) ⇒ drive(c1) deep-equals drive(c2)`. The implementation is gated on a property test that asserts this for every candidate pair admitted by top-K across the FITL replay corpus. If the property fails for any pair, the ticket is closed without the dedupe.
2. **F11 (immutability) — scoped internal mutation**: The cache is allocated inside `evaluatePolicyMoveCore`'s synchronous call frame. Never escapes; never mutates caller state.
3. **F1 (engine agnosticism)**: The fingerprint is computed from generic move metadata (`actionId`, payload structure, source state) — not from FITL- or Texas-specific fields.
4. **F15 (root-cause)**: Attacks the per-candidate amplification directly rather than papering over with a smaller `topK`.
5. **F14 (no backwards compatibility)**: No parallel old/new paths. The cache is opt-in by being constructed inside `evaluatePolicyMoveCore`; everything else stays.
6. **V8 hot-path discipline**: The cache is a small `Map<string, DriveResult>` allocated once per outer move. No module-level state.

## What to Change

### 1. Prove the fingerprint identity property first (gate)

Before touching production code, author a property test that:

- Drives a corpus of FITL outer moves (use `profile-fitl-preview-drive.mjs --profilesAll --seed 42 --maxTurns 10` as the trace source, or replay `spec-140-replay-identity.test.js`'s captured traces).
- For each `evaluatePolicyMoveCore` call, captures the top-K admitted candidates and their resulting `DriveResult` outputs.
- Computes a candidate fingerprint from `(actionId, canonical-payload-hash, sourceStateHash)` and partitions candidates by fingerprint.
- Asserts that within each partition, all `DriveResult`s are deep-equal.

If the property fails for any partition, log the divergent fingerprint, the candidate pair, and the drive output diff. The ticket is then closed with a written analysis of why the dedupe is unsound and what fingerprint enrichment (if any) would close the gap. Do not proceed to implementation until the property passes for at least one fingerprint shape on a representative corpus.

### 2. Implement the cache in `evaluatePolicyMoveCore`

Once a sound fingerprint is established:

- In `packages/engine/src/agents/policy-eval.ts`, allocate `const driveCache = new Map<string, DriveResult>()` inside `evaluatePolicyMoveCore` before the top-K iteration.
- For each admitted candidate, compute its fingerprint key. If the cache has the key, reuse the cached `DriveResult` (and its derived value-feature reads). On miss, run `driveSyntheticCompletion` and store the result.
- Pass any cache-hit result through the existing value-feature pipeline as if the drive had run — the same `DriveResult` shape produces the same downstream `PolicyValue`.

### 3. Cap the cache size and expose hit-rate telemetry

The cache should not grow unboundedly. With top-K = 4 and one cache per outer move, the maximum size is 4, so a fixed-size `Map` is fine. Still, expose a runtime-callback hook (mirrored from POLPREVDRIVE-003's `onDriveExit`) that records `(fingerprint, hit | miss)` so we can measure the hit rate empirically. The hit rate is the load-bearing metric for whether the ticket is worth keeping.

### 4. Strict regression gates

Before merging:

- Replay corpus must stay byte-identical to pre-change canonical state (`spec-140-replay-identity.test.js`).
- Bot evaluation outputs (the `PolicyValue` numbers) must be byte-identical to pre-change for every test in `packages/engine/test/policy-profile-quality/`. Any drift is a fingerprint bug, not an acceptable behaviour shift.
- The fingerprint property test (Step 1) becomes a permanent test, not a one-off harness, and runs in the FITL events shard.

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` (modify — allocate cache, fingerprint admitted candidates, dispatch hit/miss)
- `packages/engine/src/agents/policy-preview.ts` (modify only if the `DriveResult` shape needs to expose canonical hashing for the fingerprint; expected to be unchanged)
- `packages/engine/test/integration/agents/drive-fingerprint-property.test.ts` (new — Step 1 property test, then permanent)
- `packages/engine/test/integration/agents/policy-eval-cross-candidate-cache.test.ts` (new — bot evaluation byte-identical pre/post)
- `packages/engine/test/perf/agents/preview-pipeline.perf.test.ts` (modify — record hit-rate + per-candidate drive count)

## Out of Scope

- Drive-scoped TokenStateIndex sharing (POLPREVDRIVE-002).
- `K_PREVIEW_DEPTH` lowering (POLPREVDRIVE-003).
- `resolveRef` memoisation (POLPREVDRIVE-004).
- Cross-game extension to Texas Hold'em — Texas does not exhibit the regression. The fingerprint is engine-agnostic by construction, but only FITL is gated for this ticket.
- Reducing `topK` below 4. The picker stays as-authored.

## Acceptance Criteria

### Tests That Must Pass

1. **Gate**: `packages/engine/test/integration/agents/drive-fingerprint-property.test.ts` (new) — fingerprint identity holds across the FITL replay corpus. **If this test cannot be made to pass, the ticket is closed without a code change**, and the gate test stays as a permanent record of why the dedupe is not currently sound.
2. New `packages/engine/test/integration/agents/policy-eval-cross-candidate-cache.test.ts` — bot evaluation outputs are byte-identical pre/post.
3. `pnpm -F @ludoforge/engine test:integration:fitl-rules` — green.
4. `pnpm -F @ludoforge/engine test:integration:fitl-events:shard-a` — green.
5. Seed-split `zobrist-incremental-parity-fitl-*` tests — replay parity green within the 30-min budget.
6. `spec-140-replay-identity.test.js` — kernel replay identity unchanged.
7. `pnpm turbo lint typecheck` — green.

### Invariants

1. **F8 — determinism (load-bearing)**: The fingerprint is a sound identity oracle. The gate test (§Tests 1) is the F8 proof; without it green, no merge.
2. **F11 — immutability**: The cache is fully isolated to the outer-move evaluation frame.
3. **F1 — engine agnosticism**: The fingerprint is generic; no FITL-specific code paths.
4. **No game-specific branching**: Fingerprint computation reads only generic move metadata.

### Performance Gate

5. On the `profile-fitl-preview-drive.mjs --profilesAll --maxTurns 10 --seed 42` repro, the cross-candidate cache **hit rate is ≥ 25%** (measured over all admitted top-K candidates) and total `driveSyntheticCompletion` self-time is reduced by a margin proportional to the hit rate. Below 25% hit rate, the implementation overhead may not justify the change — record the empirical rate in the Outcome and decide whether to keep or revert.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/agents/drive-fingerprint-property.test.ts` (new, gate) — F8 identity oracle.
2. `packages/engine/test/integration/agents/policy-eval-cross-candidate-cache.test.ts` (new) — byte-identical bot evaluation pre/post.
3. `packages/engine/test/perf/agents/preview-pipeline.perf.test.ts` (modify) — hit-rate + per-candidate drive count metrics.
4. Re-run `profile-fitl-preview-drive.mjs --profilesAll`, record before/after `driveSyntheticCompletion` total + hit-rate in the ticket Outcome.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:integration:fitl-rules`
3. `pnpm -F @ludoforge/engine test:integration:fitl-events:shard-a`
4. `pnpm turbo lint typecheck`
5. `node packages/engine/scripts/profile-fitl-preview-drive.mjs --profilesAll --maxTurns 10 --seed 42 --label after`
6. CI: seed-split `zobrist-incremental-parity-fitl-*` lanes (`fitl-parity-zobrist-seed-42` and `fitl-parity-zobrist-seed-123` shards).
