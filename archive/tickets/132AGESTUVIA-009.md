# 132AGESTUVIA-009: Eliminate fresh FITL tournament no-playable witnesses on seeds 1005, 1010, and 1013

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes
**Deps**: `archive/tickets/132AGESTUVIA-004.md`, `archive/tickets/132AGESTUVIA-007.md`, `archive/tickets/132AGESTUVIA-008.md`

## Problem

The automated seed-1000 proof gate from `132AGESTUVIA-005` is green, but the required manual campaign closure lane still fails on current `HEAD`. Running:

```bash
node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --players 4 --evolved-seat arvn --max-turns 200
```

reports `errors: 3` even though the process exits `0`. Seeds `1005`, `1010`, and `1013` each throw the same live runtime failure:

```text
policy agent could not derive a playable move from 1 classified legal move(s)
```

That is the same no-playable defect class spec 132 was supposed to eliminate from the campaign harness. The campaign is therefore still not unblocked in the only closure lane that matters.

## Assumption Reassessment (2026-04-17)

1. Tickets `132AGESTUVIA-004`, `132AGESTUVIA-007`, and `132AGESTUVIA-008` are all landed, and seeds `1000` plus `1002` are now clean in the campaign harness; the fresh blocker is a new live witness cluster, not the old seed-1002 lattice bug.
2. The failing harness uses the real campaign seat mapping (`us-baseline`, `arvn-evolved`, `nva-baseline`, `vc-baseline`) and `maxTurns = 200`, so these are end-to-end production witnesses, not synthetic test artifacts.
3. The failure text matches the post-`agentStuck` hard-fail boundary from `132AGESTUVIA-004`: a policy agent is seeing one classified legal move but still cannot derive a playable move. That means a legality/completion/admission contract seam is still live somewhere in the shared engine path.
4. `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` is immutable per the campaign's `program.md`; this ticket fixes the engine/data seam, not the harness.
5. `132AGESTUVIA-005` should remain a truthful gate/proof ticket. This production fix belongs here so the gate can close cleanly once the live witnesses are eliminated.

## Architecture Check

1. This is a production engine/data contract bug, not a test-only discrepancy.
2. The failing witness sits on the same architectural boundary as spec 132's core concern: anything surfaced to the policy agent as a classified legal move must admit a bounded playable completion path or be filtered out earlier.
3. The fix must align with `docs/FOUNDATIONS.md`, especially:
   - `#5`: keep shared engine contracts correct rather than compensating in the simulator or harness.
   - `#14`: no new backwards-compatibility shim or legacy stop-reason reintroduction.
   - `#15`: fix the real legality/completion seam rather than masking it with extra catch-and-continue behavior.
   - `#16`: prove the exact witnesses with focused tests before and after the fix.

## What to Change

### 1. Reproduce and isolate the earliest authoritative witness

Use the real campaign seat mapping and the existing harness/replay tooling to isolate the earliest deterministic failing prefix for seeds `1005`, `1010`, and `1013`. Determine:

- the exact current player and move template involved
- whether the failure clusters to one shared template/card/decision shape or to multiple distinct seams
- whether enumeration, viability probing, and template completion disagree on the witness

Reduce the broad tournament repro to the narrowest direct proof lane that still preserves the live bug.

### 2. Fix the shared legality/completion seam at the real source

Implement the smallest production fix that makes the failing witnesses unreachable under the normal shared engine contract. Depending on the evidence, that may live in:

- move viability/admission
- template completion/decision selection
- authoring/runtime data for a specific FITL card/event/operation path

Do not reintroduce a simulator soft-stop or any new harness-specific workaround.

### 3. Add focused regression proof

Add or extend the narrowest tests needed to prove the exact live witnesses are fixed. The proof must include:

- at least one focused regression lane for the reduced direct witness
- an end-to-end confirmation that the affected tournament seeds no longer throw
- preservation of the already-landed seed-1000 gate from `132AGESTUVIA-005`

### 4. Re-run the campaign closure lane

Re-run the full manual campaign smoke:

```bash
node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --players 4 --evolved-seat arvn --max-turns 200
```

Expected: exit code `0` and JSON output containing `errors: 0`.

## Files to Touch

- `packages/engine/src/**` or `data/games/fire-in-the-lake/**` as required by the isolated source of truth
- focused engine tests under `packages/engine/test/**`
- `tickets/132AGESTUVIA-005.md` only if blocker-clear completion notes are needed after this ticket lands

## Out of Scope

- Changing the campaign harness itself
- Relaxing `132AGESTUVIA-005` to remove the manual tournament closure gate
- Reintroducing `'agentStuck'` or any equivalent simulator-level soft-stop
- Broad AI-strength or score-improvement tuning unrelated to the no-playable failure witnesses

## Acceptance Criteria

### Tests That Must Pass

1. Focused regression proof for the isolated live witness or shared witness shape.
2. Any modified targeted engine integration/unit lanes covering the fixed source.
3. `pnpm turbo test`.
4. Manual campaign closure lane: `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --players 4 --evolved-seat arvn --max-turns 200` reports `errors: 0`.

### Invariants

1. No affected campaign seed throws `policy agent could not derive a playable move from 1 classified legal move(s)` after the fix.
2. The fix lives at the real shared engine/data contract boundary, not in a harness workaround.
3. Seeds `1000` and `1002` remain clean after the change.

## Test Plan

### New/Modified Tests

1. Add the narrowest deterministic regression test(s) for the isolated `1005`/`1010`/`1013` witness shape.
2. Keep `packages/engine/test/integration/fitl-seed-1000-regression.test.ts` green.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Focused `node --test` command(s) for the new regression lane(s)
3. `pnpm turbo test`
4. `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --players 4 --evolved-seat arvn --max-turns 200`

## Outcome

Completed: 2026-04-17

1. Seed `1005` was reduced to a sparse-success free-operation `march` completion witness. `packages/engine/src/kernel/move-completion.ts` now includes a bounded deterministic fallback for mandatory single-choice pending decisions so sampled dead-end branches do not strand an otherwise satisfiable template.
2. Seeds `1010` and `1013` reduced further to NVA free-operation `attack` witnesses where one pending template survived enumeration even though every legal completion still failed the required free-operation outcome policy. The fix landed at the shared legality/admission boundary: incomplete free operations that only potentially match a must-change outcome grant are now filtered out of legal-move classification unless a legal completed move actually exists in the current state.
3. Focused proof was added for both layers:
   - `packages/engine/test/integration/fitl-seed-1005-1010-1013-regression.test.ts`
   - `packages/engine/test/unit/kernel/apply-move.test.ts`
   - `packages/engine/test/unit/kernel/move-completion-retry.test.ts`
4. Verification passed on current `HEAD`:
   - `pnpm -F @ludoforge/engine build`
   - `pnpm turbo test`
   - `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --players 4 --evolved-seat arvn --max-turns 200`
5. The manual campaign closure lane now exits `0` and reports `errors: 0`, clearing the blocker on `tickets/132AGESTUVIA-005.md`.
