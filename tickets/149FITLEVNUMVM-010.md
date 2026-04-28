# 149FITLEVNUMVM-010: Property tests for apply/undo equivalence + canonicalize-on-exit

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new test files
**Deps**: `tickets/149FITLEVNUMVM-009.md`

## Problem

Phase 2's correctness proof: prove that the apply/undo trajectory through `PreviewDriveScope` produces the same canonical `GameState` as the prior cloning trajectory on every test seed. Spec §6 (Phase 2 testing row) specifies replay-identity preservation across all determinism shards plus a canonical-hash equivalence assertion.

## Assumption Reassessment (2026-04-28)

1. Ticket 009 has landed the apply/undo replacement. This ticket adds the property-test layer that proves the replacement preserves trajectory canonical-state equivalence.
2. The pre-Phase-2 cloning trajectory is no longer accessible (deleted in ticket 009 per F14). The property test compares the post-Phase-2 trajectory against a pinned canonical-hash corpus captured before ticket 009 lands.
3. `CANARY_SEEDS × POLICY_PROFILE_VARIANTS` corpus exists (verified during spec 149 reassessment) at `packages/engine/test/integration/spec-140-bounded-termination.test.ts` and similar files.

## Architecture Check

1. Property tests are `@test-class: architectural-invariant` — they assert a property over any legitimate trajectory, not a witness pin.
2. Canonical-hash equivalence is the strongest replay-identity guarantee. F8 (Determinism) preserved.
3. The pinned hash corpus is captured pre-009 — once captured, the corpus file is immutable. Future kernel evolutions that legitimately shift the trajectory require the testing.md "Distillation over re-bless" rule.
4. No game-specific branches; the test scaffolding is generic over the seed × profile-variant matrix.

## What to Change

### 1. Capture pre-Phase-2 canonical-hash corpus

Before ticket 009 lands (or as part of its preparation), run a corpus capture script:
```bash
node packages/engine/scripts/capture-trajectory-hashes.mjs \
  --seeds "1002,1005,1010,1012,1013,1040" \
  --profiles "us-baseline,arvn-baseline,nva-baseline,vc-baseline" \
  --maxTurns 50 \
  --output packages/engine/test/fixtures/phase2-trajectory-hashes.json
```

If the script doesn't exist, author it as part of this ticket. The output JSON is checked in as the pinned reference.

(Note: capture timing — ideally the corpus is captured in this ticket against the pre-009 codebase to give 009 a target to validate against; if 009 has already landed, capture against ticket 008's `finalize(scope)` output paired with a matched-trajectory cloning fallback for one-time corpus generation.)

### 2. New property test

`packages/engine/test/determinism/preview-drive-scope-trajectory-equivalence.test.ts` (new) — `@test-class: architectural-invariant`:
- For each `(seed, profile)` in `CANARY_SEEDS × POLICY_PROFILE_VARIANTS`, run a bounded simulation through the post-Phase-2 drive.
- Capture the canonical hash of the final state after each card resolution.
- Compare against the pinned `phase2-trajectory-hashes.json` corpus.
- Assert byte-identical match.

### 3. Canonicalize-on-exit verification test

`packages/engine/test/determinism/preview-drive-scope-canonicalize-on-exit.test.ts` (new) — `@test-class: architectural-invariant`:
- Verify that `finalize(scope)` produces a `GameState` whose canonical hash equals what the pre-Phase-2 cloning path would have produced (using the pinned corpus).
- Verify that no intermediate microturn state leaks an unhashed canonical view.

### 4. Replay-identity sanity over all determinism shards

Run the full determinism corpus and confirm green:
```bash
cd packages/engine && node scripts/run-tests.mjs --lane determinism \
  dist/test/determinism/zobrist-incremental-parity-fitl-seed-42.test.js \
  dist/test/determinism/zobrist-incremental-parity-fitl-seed-123.test.js \
  dist/test/determinism/zobrist-incremental-property-fitl-medium-diverse.test.js \
  dist/test/determinism/zobrist-incremental-property-fitl-short-diverse.test.js \
  dist/test/determinism/spec-140-replay-identity.test.js \
  dist/test/determinism/draft-state-determinism-parity.test.js \
  dist/test/determinism/forked-vs-fresh-runtime-parity.test.js \
  dist/test/determinism/probe-hole-recovery-replay-identity.test.js
```

## Files to Touch

- `packages/engine/test/fixtures/phase2-trajectory-hashes.json` (new — pinned reference)
- `packages/engine/test/determinism/preview-drive-scope-trajectory-equivalence.test.ts` (new)
- `packages/engine/test/determinism/preview-drive-scope-canonicalize-on-exit.test.ts` (new)
- `packages/engine/scripts/capture-trajectory-hashes.mjs` (new — if not pre-existing)

## Out of Scope

- Bytecode VM property tests (ticket 014).
- Phase 4 default-flip (ticket 016).
- Tightening the perf gate beyond 3000 ms.

## Acceptance Criteria

### Tests That Must Pass

1. New `preview-drive-scope-trajectory-equivalence.test.ts` asserts byte-identical canonical hashes against the pinned corpus across all `(seed, profile)` combinations.
2. New `preview-drive-scope-canonicalize-on-exit.test.ts` asserts no intermediate microturn state leaks an unhashed view.
3. All 10 determinism shards stay green.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Pinned hash corpus is immutable — any legitimate kernel evolution that shifts trajectories requires distillation per `.claude/rules/testing.md`.
2. F8 determinism preserved — replay identity is the proof.
3. F11 scoped-mutation exception isolation regression test (from ticket 008) continues to pass.
4. No game-specific branches in the property test scaffolding.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/determinism/preview-drive-scope-trajectory-equivalence.test.ts` — `architectural-invariant`, witness id `spec-149-phase2-equivalence`.
2. `packages/engine/test/determinism/preview-drive-scope-canonicalize-on-exit.test.ts` — `architectural-invariant`.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/preview-drive-scope-trajectory-equivalence.test.js dist/test/determinism/preview-drive-scope-canonicalize-on-exit.test.js`.
3. Full determinism lane (see step 4 of What to Change).
4. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`.
