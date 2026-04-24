# 144PROBEREC-003: F#18 amendment + seed-1001 regression fixture (I4) + convergence-witness re-bless

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — FOUNDATIONS.md doctrine, architecture.md note, convergence-witness re-bless
**Deps**: `archive/tickets/144PROBEREC-001.md`, `archive/tickets/144PROBEREC-002.md`

## Problem

With the deep probe (001) and rollback safety net (002) landed, Foundation #18 must be amended to formalize the new two-tier contract: the publication probe guarantees constructibility within a bounded depth, and the runtime rollback catches residual gaps as observable diagnostics. The seed-1001 failure that motivated this spec must be captured as a reproducible fixture and pinned as a regression test. The ARVN-evolved convergence witnesses will shift decision counts (some `confirm`s that were previously mis-published no longer appear) and must be re-blessed atomically with the doctrine change.

## Assumption Reassessment (2026-04-24)

1. Current F#18 at `docs/FOUNDATIONS.md:113-117` reads "A move is not legal for clients unless it is constructible..." — confirmed. The proposed amended text lives in spec 144 §D7.
2. The FOUNDATIONS.md Appendix (lines 127-133) already tracks amendment history; this ticket appends a one-line spec-144 note.
3. Convergence witnesses pin `stopReason === 'terminal'` for seeds 1020/1049/1054 in `packages/engine/test/policy-profile-quality/fitl-variant-arvn-evolved-convergence.test.ts` (confirmed in reassessment). Per `.claude/rules/testing.md` "distillation over re-bless", first attempt property-form reformulation; fall back to re-bless with documented reason only if the property form loses defect-class coverage.
4. Seed 1001 today reaches turn 2 and hits `MICROTURN_CONSTRUCTIBILITY_INVARIANT: chooseNStep context has no bridgeable continuations` in the NVA march pipeline — confirmed by reassessment behavioral agent.
5. After 001 + 002 land, seed 1001 reaches `stopReason='terminal'` under direct `runGame`. The deep probe catches the march dead-end without needing rollback, so `recoveredFromProbeHole === 0` is the expected post-fix signal.

## Architecture Check

1. Amending F#18 in a separate ticket — after 001/002 prove the behavior — means the doctrine is documented only once the contract is actually enforced. No stale-doctrine window.
2. The seed-1001 fixture decouples the regression test from the 245-decision simulator prefix, keeping test run-time under 1s per the spec's requirement.
3. The fixture captures `(gameDefHash, initialState(seed=1001), recorded decision sequence up to failure)` — pure F#13 identity artifacts, replayable deterministically.
4. Re-bless follows distillation-over-re-bless protocol: property-form first (e.g., `stopReason ∈ {terminal, maxTurns}`), fall back to updated decision counts only if property form loses defect-class coverage. If re-bless is required, the commit body records the reason per the testing rules file.

## What to Change

### 1. I4 seed-1001 fixture at `packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/`

Contents:
- `game-def-hash.txt` — compiled GameDef identity (F#13).
- `initial-state.json` — output of `initialState(def, seed=1001)` captured pre-run.
- `decision-sequence.json` — recorded decisions up to (but not including) the historical failure point. On replay, the post-fix run reaches `stopReason='terminal'` instead of failing.
- `README.md` — one-paragraph fixture description, pointer to the spec.

Generation script `packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/regenerate.mjs` runs the current engine on seed 1001 and emits the artifacts; re-run if the GameDef hash changes.

### 2. Seed-1001 regression test at `packages/engine/test/integration/fitl-march-dead-end-recovery.test.ts`

`@test-class: convergence-witness`, witness id `spec-144-seed-1001-nva-march`.

Loads the I4 fixture, runs the game, asserts:
- `trace.stopReason === 'terminal'`
- `trace.recoveredFromProbeHole === 0` (probe catches it, rollback does not fire)
- optionally asserts the trace replays byte-identically under a second `runGame` invocation with the same seed (determinism spot-check).

### 3. F#18 amendment in `docs/FOUNDATIONS.md`

Replace lines 113-117 with the three-paragraph version from spec 144 §D7 (publication contract + runtime safety net + unified conclusion). Append to the Appendix:

> Spec 144 amended Foundation #18 to distinguish the published-legality contract from the runtime-recovery safety net, and formalized the engine-agnostic `tags: [pass]` fallback convention.

### 4. Architecture note in `docs/architecture.md`

One-paragraph summary of the probe + rollback pairing, cross-referencing the new F#18 two-tier model and the `ProbeHoleRecoveryLog` trace-only event.

### 5. Re-bless `fitl-variant-arvn-evolved-convergence.test.ts`

Per distillation protocol:
1. First attempt: reformulate each `stopReason === 'terminal'` assertion as an architectural invariant — if it already is (it asserts bounded stop reasons), promote to `@test-class: architectural-invariant` if the test currently has a different class marker.
2. If the test pins additional trajectory-specific details (decision counts, specific winners), retarget to the new trajectory and keep as `@test-class: convergence-witness` with witness id unchanged. Document re-bless reason in the commit body: "Re-bless witnesses for spec 144 — NVA-march `confirm` no longer published when intra-action continuation has zero options."

Audit for any other `policy-profile-quality` tests pinning decision counts on the 18-seed campaign corpus; repeat the distillation protocol for each.

## Files to Touch

- `packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/game-def-hash.txt` (new)
- `packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/initial-state.json` (new)
- `packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/decision-sequence.json` (new)
- `packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/README.md` (new)
- `packages/engine/test/fixtures/spec-144-probe-recovery/seed-1001-nva-march-dead-end/regenerate.mjs` (new)
- `packages/engine/test/integration/fitl-march-dead-end-recovery.test.ts` (new)
- `docs/FOUNDATIONS.md` (modify — F#18 replace + Appendix append)
- `docs/architecture.md` (modify — one-paragraph note)
- `packages/engine/test/policy-profile-quality/fitl-variant-arvn-evolved-convergence.test.ts` (modify — re-bless)

## Out of Scope

- Deep probe / cache / LRU — ticket 001.
- Rollback / `ProbeHoleRecoveryLog` / `publishActionSelection` blacklist — ticket 002.
- Diagnostic harness rewire — ticket 004.
- Replay-identity determinism proof for recovery traces — ticket 005. (`Trace.schema.json` was absorbed by ticket 002.)

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm -F @ludoforge/engine test packages/engine/test/integration/fitl-march-dead-end-recovery.test.ts` — seed 1001 reaches terminal; `recoveredFromProbeHole === 0`.
2. `pnpm -F @ludoforge/engine test packages/engine/test/policy-profile-quality/fitl-variant-arvn-evolved-convergence.test.ts` — re-blessed witnesses pass.
3. Full 18-seed campaign rerun (manual verification): `stopReason === 'terminal'` for all seeds including 1001; `recoveredFromProbeHole === 0` across the corpus (probe catches everything the campaign surfaces).

### Invariants

1. F#18 amendment preserves the prohibition on client-side search / template completion / `unknown` legal actions.
2. Seed-1001 fixture replays identically: two independent `runGame(def, 1001)` invocations produce byte-identical `finalState.stateHash` (F#8).
3. Convergence-witness re-bless preserves defect-class coverage: if a regression re-introduces the NVA-march `confirm` hole, the re-blessed test still fails.
4. No other test file requires re-bless (ticket-scope audit must enumerate any additional policy-profile-quality tests touched).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-march-dead-end-recovery.test.ts` — seed-1001 regression (`@test-class: convergence-witness`, witness id `spec-144-seed-1001-nva-march`).
2. `packages/engine/test/policy-profile-quality/fitl-variant-arvn-evolved-convergence.test.ts` — re-blessed; class marker preserved or promoted per distillation.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test packages/engine/test/integration/fitl-march-dead-end-recovery.test.ts`
3. `pnpm -F @ludoforge/engine test packages/engine/test/policy-profile-quality/`
4. `node campaigns/fitl-arvn-agent-evolution/diagnose-nolegalmoves.mjs --seed 1001` — manual spot-check (still useful before ticket 004 closes the harness divergence).
5. `pnpm turbo test`
