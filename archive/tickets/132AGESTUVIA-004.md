# 132AGESTUVIA-004: Finish remaining no-playable witnesses, then remove agentStuck atomically (S3 + S4.5 + S4.6)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — remaining policy-agent no-playable root-cause fix, simulator catch removal, `SimulationStopReason` union + Zod schema cleanup, test migrations
**Deps**: `archive/tickets/132AGESTUVIA-003.md`, `archive/tickets/132AGESTUVIA-007.md`

## Problem

Tickets 001, 002, 003, and 007 substantially shrank the original `agentStuck` surface, but they did not make `NoPlayableMovesAfterPreparationError` unreachable. The first implementation attempt for this ticket proved that directly: after removing the simulator soft-stop, the repo-owned `fitl-policy-agent` replay lane still surfaced uncaught `NoPlayableMovesAfterPreparationError` on fixed seeds `11` and `17`. Under `docs/FOUNDATIONS.md`, that means the cleanup boundary was drawn too narrowly. Foundation `#15` forbids preserving the simulator shim as a symptom mask, while Foundation `#14` forbids staging the stop-reason compatibility cleanup separately once the real seam is known. This ticket therefore owns both tasks together: eliminate the remaining no-playable witnesses and then remove `'agentStuck'` atomically from runtime, types, schemas, and tests.

## Assumption Reassessment (2026-04-17)

1. `packages/engine/src/sim/simulator.ts:128–140` contains the `isNoPlayableErr` catch mapping to `stopReason = 'agentStuck'` — confirmed.
2. `packages/engine/src/kernel/types-core.ts` defines `SimulationStopReason` as a union including `'agentStuck'` — confirmed via reassess-spec session.
3. `packages/engine/src/kernel/schemas-core.ts` contains the Zod literal union for stop reasons, including an `'agentStuck'` entry — confirmed.
4. `packages/engine/test/integration/fitl-seed-stability.test.ts:16` defines `ALLOWED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'agentStuck'])` — confirmed.
5. `packages/engine/test/integration/fitl-seed-2057-regression.test.ts:13` defines the identical set — confirmed.
6. Ticket `132AGESTUVIA-003` proved that the stronger claim "every VIABLE template yields a playable move" is false on current `HEAD`; bounded retry reduces `agentStuck` incidence but does not by itself prove `NoPlayableMovesAfterPreparationError` is unreachable. This ticket must therefore validate removal of `'agentStuck'` through direct simulator/seed evidence rather than that stronger contract assumption — confirmed.
7. `packages/engine/test/integration/fitl-policy-agent.test.ts:1196` asserts the positive invariant `trace.stopReason === 'noLegalMoves' || 'maxTurns' || 'terminal'` for seed 17 — confirmed. This assertion already excludes `'agentStuck'`; the migration here is comment-only to document the new post-S3 invariant.
8. `FORMER_CRASH_OR_HANG_SEEDS` at `fitl-seed-stability.test.ts:13–15` = `[1010, 1012, 1014, 1015, 1019, 1025, 1030, 1035, 1040, 1042, 1043, 1046, 1047, 1051, 1054]`. Seed 1010 overlaps with the current campaign failures. After this ticket + 001 + 002, every seed in this list MUST produce `'terminal'` or `'maxTurns'` (never throw, never `'agentStuck'`).
9. Live rerun evidence on current `HEAD` shows seed 1010 now resolves to `maxTurns`, but seed 2057 still resolves to `agentStuck` after 119 moves under `['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline']`. This ticket cannot proceed until the new prerequisite removes that residual witness — confirmed.

## Architecture Check

1. Foundation #14 now requires a broader atomic change: the remaining seed-11/17 no-playable seam and the `'agentStuck'` compatibility cleanup must land together so the simulator is not left masking a known live defect and no unreachable stop reason lingers afterward.
2. Foundation #15: the simulator catch is still a symptom-masking shim on current `HEAD`. The fix must address the policy-agent / playable-move root cause for seeds `11` and `17`, not merely preserve or rename the soft-stop.
3. Foundation #16: the existing seed-11/17 replay lanes are the authoritative red proof. Any implementation here must keep those lanes failing-before/fixed-after, then run the S3 cleanup proofs.
4. No new game-specific code introduced (Foundation #1). No YAML or policy-profile data changes.
5. After implementation, the union contains only reachable stop reasons: `'terminal'`, `'maxTurns'`, `'noLegalMoves'`, and that reachability is justified by direct replay/unit evidence on current `HEAD`.

## What to Change

### 0. Cleared prerequisite

`132AGESTUVIA-007` has landed and cleared the residual seed-2057 `agentStuck` witness. Reassess its outcome and rerun the tightened 2057 lane before touching the simulator catch or stop-reason union here so this ticket starts from the post-fix baseline rather than the old blocked state.

### 1. Eliminate the remaining live no-playable witnesses

Investigate and fix the remaining policy-agent no-playable path exposed by the post-catch replay seeds `11` and `17`. The smallest Foundation-aligned repair is in scope wherever the real seam lives (`preparePlayableMoves`, policy-agent move preparation/selection, viability/dedup bookkeeping, or an adjacent shared authority module), provided it remains engine-agnostic.

Minimum proof expectations:

- The existing replay witnesses for seeds `11` and `17` must stop throwing `NoPlayableMovesAfterPreparationError`.
- The fix must not rely on simulator soft-stop handling, FITL-specific branches, or policy YAML changes.
- If fixing the seam changes deterministic candidate enumeration/completion counts in adjacent replay tests, update those repo-owned expectations in the same change when they are genuine fallout from the repaired contract.

### 2. Delete the simulator catch

In `packages/engine/src/sim/simulator.ts`, remove the try/catch wrapping around `agent.chooseMove(...)` at lines 128–140 (or at minimum remove the `isNoPlayableErr` branch that maps to `stopReason = 'agentStuck'`). If the surrounding try/catch legitimately guards against other error types, preserve those; this ticket only removes the `agentStuck` mapping.

### 3. Remove `'agentStuck'` from the union

- In `packages/engine/src/kernel/types-core.ts`, drop `'agentStuck'` from the `SimulationStopReason` union.
- In `packages/engine/src/kernel/schemas-core.ts`, drop the corresponding Zod literal entry.
- Grep the engine source once more for any residual `'agentStuck'` string literal; remove any stragglers found.

### 4. New simulator unit test (S4.5)

Create `packages/engine/test/unit/sim/simulator-no-playable-moves.test.ts` that:

- Constructs or reuses a GameDef + state where `enumerateLegalMoves(...)` returns zero moves after the shared viability filtering, and asserts `runGame(...)` returns `stopReason === 'noLegalMoves'`.
- Do not rely on the `chooseN{min:3,max:3}` structural fixture from ticket 003 as the zero-legal-move witness; on current `HEAD` that fixture still enumerates as one VIABLE pending move and therefore is not a valid simulator witness for this ticket.
- Using a mock agent that throws `NoPlayableMovesAfterPreparationError`, asserts the error propagates to `runGame`'s caller rather than being caught.
- Asserts that a TypeScript literal `stopReason: 'agentStuck'` fails type-check (via `// @ts-expect-error`) and that the Zod schema rejects the `'agentStuck'` value at runtime.

### 5. Migrate existing tests (S4.6)

- `packages/engine/test/integration/fitl-seed-stability.test.ts:16` — change `ALLOWED_STOP_REASONS` to `new Set(['terminal', 'maxTurns'])`. Every seed in `FORMER_CRASH_OR_HANG_SEEDS` MUST now pass under the tightened set. If any seed fails after 001/002/004 land, the regression is in implementation — stop and diagnose before closing this ticket.
- `packages/engine/test/integration/fitl-seed-2057-regression.test.ts:13` — same update to `ALLOWED_STOP_REASONS`, but only after `132AGESTUVIA-007` removes the live seed-2057 witness.
- `packages/engine/test/integration/fitl-policy-agent.test.ts` — keep the existing seed-17 invariant, and tighten the seed-11/17 replay expectations so they prove the repaired boundary without relying on simulator soft-stop behavior. Add a code comment on or above the seed-17 assertion noting this is a post-S3 invariant (e.g., `// Post-spec-132: 'agentStuck' is no longer a representable SimulationStopReason.`).

Search the rest of the test tree for any other `'agentStuck'` references and migrate identically. Goldens and fixtures that encode a stop reason MUST be regenerated if they contain the literal.

## Files to Touch

- `packages/engine/src/sim/simulator.ts` (modify) — delete the `isNoPlayableErr` mapping
- `packages/engine/src/agents/*` and/or adjacent shared engine authority modules (modify) — eliminate the remaining seed-11/17 no-playable root cause
- `packages/engine/src/kernel/types-core.ts` (modify) — drop `'agentStuck'` from the union
- `packages/engine/src/kernel/schemas-core.ts` (modify) — drop the Zod literal
- `packages/engine/test/unit/sim/simulator-no-playable-moves.test.ts` (new) — S4.5 coverage
- `packages/engine/test/integration/fitl-seed-stability.test.ts` (modify) — S4.6 migration
- `packages/engine/test/integration/fitl-seed-2057-regression.test.ts` (modify or verified-no-edit) — S4.6 migration after `132AGESTUVIA-007`
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify) — seed-11/17 proof + S4.6 comment annotation
- Any other file surfaced by grep that references `'agentStuck'` (modify or delete as appropriate)

## Out of Scope

- Changes to enumerate/probe viability — 132AGESTUVIA-001's scope.
- Changes to completion retry — 132AGESTUVIA-002's scope.
- Running the full FITL tournament gate — 132AGESTUVIA-005's scope.
- FITL policy YAML adjustments.

## Acceptance Criteria

### Tests That Must Pass

1. New `simulator-no-playable-moves.test.ts` passes: the chosen zero-legal-move witness resolves to `'noLegalMoves'`; `NoPlayableMovesAfterPreparationError` propagates; type and Zod both reject `'agentStuck'`.
2. `fitl-policy-agent.test.ts` passes for the fixed replay witnesses: seeds `11` and `17` no longer throw `NoPlayableMovesAfterPreparationError`, and the seed-17 post-S3 invariant still holds.
3. Migrated `fitl-seed-stability.test.ts`: every seed in `FORMER_CRASH_OR_HANG_SEEDS` produces `'terminal'` or `'maxTurns'` under the tightened allow-set.
4. Migrated `fitl-seed-2057-regression.test.ts` passes under the tightened allow-set after `132AGESTUVIA-007` lands.
5. Existing suite: `pnpm turbo test`.

### Invariants

1. `SimulationStopReason` does not include `'agentStuck'`. Grep confirms zero `'agentStuck'` references in engine source (Foundation #14).
2. The seed-11/17 replay witnesses are repaired at the policy-agent/shared-engine boundary rather than being hidden by the simulator.
3. After the repair, `NoPlayableMovesAfterPreparationError`, when thrown, propagates to `runGame`'s caller unhandled by the simulator.
4. Every seed formerly tolerated via `'agentStuck'` (15 seeds in `FORMER_CRASH_OR_HANG_SEEDS` + seed 2057) now reaches `'terminal'` or `'maxTurns'` after this ticket removes the legacy stop reason.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/sim/simulator-no-playable-moves.test.ts` — new S4.5 coverage using a true zero-legal-move witness.
2. `packages/engine/test/integration/fitl-policy-agent.test.ts` — seed-11/17 no-playable regression proof plus post-S3 invariant comment.
3. `packages/engine/test/integration/fitl-seed-stability.test.ts` — tightened `ALLOWED_STOP_REASONS`.
4. `packages/engine/test/integration/fitl-seed-2057-regression.test.ts` — tightened `ALLOWED_STOP_REASONS`.

### Commands

1. `pnpm -F @ludoforge/engine test test/unit/sim/simulator-no-playable-moves.test.ts`
2. `pnpm -F @ludoforge/engine test test/integration/fitl-seed-stability.test.ts`
3. `pnpm -F @ludoforge/engine test test/integration/fitl-seed-2057-regression.test.ts`
4. `pnpm -F @ludoforge/engine test test/integration/fitl-policy-agent.test.ts`
5. `pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`

## Outcome

2026-04-17 initial reassessment found this ticket blocked on a still-live residual witness outside the originally assumed mechanical cleanup boundary: FITL seed 2057 still resolved to `stopReason = 'agentStuck'` on then-current `HEAD`, and the illustrative `chooseN{min:3,max:3}` structural fixture from ticket 003 still enumerated as a VIABLE pending move rather than a zero-legal-move simulator witness. The cleanup/removal work in this ticket was therefore deferred behind new prerequisite ticket `132AGESTUVIA-007`.

2026-04-17 update: `132AGESTUVIA-007` cleared that blocker by fixing template-completion retries to use fresh child RNG streams per attempt. The tightened `fitl-seed-2057-regression` lane now passes without `'agentStuck'`, so this ticket is no longer blocked and is ready for the atomic simulator/union cleanup it already describes.

2026-04-17 implementation attempt update: removing the simulator soft-stop on current `HEAD` still exposes live no-playable witnesses outside the previously assumed mechanical cleanup slice. A temporary S3 patch (simulator catch removal + union/schema/test migration) proved the dedicated new unit boundary cleanly, and `fitl-seed-2057-regression` still passed under the tightened allow-set, but the ticket-named `fitl-policy-agent` lane then surfaced uncaught `NoPlayableMovesAfterPreparationError` on fixed seeds `11` and `17`. Direct seed repro on the patched build confirmed `seed=11` and `seed=17` both throw `policy agent could not derive a playable move from 1 classified legal move(s)`, while `seed=23` still reaches `maxTurns` and `seed=1041` still reaches `maxTurns` for 20 moves.

2026-04-17 boundary reset: per `docs/FOUNDATIONS.md` (#14 atomic cleanup, #15 root-cause fixes, #16 testing as proof), this ticket now absorbs the remaining seed-11/17 no-playable root cause instead of deferring it to a new prerequisite. The implementation boundary is therefore: repair the remaining policy-agent/shared-engine seam proven by the seed-11/17 replay witnesses, then remove `agentStuck` atomically from the simulator, type union, schemas, and migrated tests in the same change.

2026-04-17 completion: the remaining live seam was not in simulator error handling or legality admission; it was in template completion and retry progression around optional `chooseN` dead-end draws. The landed fix now preserves fresh child-stream retry progression in `preparePlayableMoves(...)`, prevents replayable dead-end RNG reuse, prefers satisfiable non-empty optional `chooseN` selections in `completeTemplateMove(...)`, rejects non-stochastic incomplete completions back out of playable-candidate classification, and adds a narrow legal-move admission guard for viable-but-decisionless free-operation templates. With that boundary repaired, the simulator `agentStuck` catch was deleted, `'agentStuck'` was removed from `SimulationStopReason` and its schemas, runner worker mocks were migrated to the current completion-result discriminant, and the dedicated simulator propagation test plus the seed-11/17/1041 FITL proofs were updated in the same atomic change.

2026-04-17 post-ticket review: a concrete acceptance-gap remained because `pnpm turbo test` still failed in `packages/engine/test/unit/agents/prepare-playable-moves-retry.test.ts`. The failure was a stale assertion, not a production regression: fresh-stream retries can now produce more than one successful completion attempt while deduplication collapses the prepared output to fewer completed moves. The review fixed that test immediately by asserting the bounded retry/success invariants instead of an exact one-success count, then reran the full workspace gate successfully.

## Verification

1. `node --input-type=module ...` bounded rerun confirmed `seed=1010 -> maxTurns` and `seed=2057 -> agentStuck` on current `HEAD`.
2. `pnpm run check:ticket-deps`
3. Repo-valid command substitution confirmed for engine file-targeted tests: use `pnpm -F @ludoforge/engine build` followed by `pnpm -F @ludoforge/engine exec node --test dist/test/...`.
4. Temporary cleanup patch proof lane passed: `pnpm -F @ludoforge/engine exec node --test dist/test/unit/sim/simulator-no-playable-moves.test.js`.
5. Tightened residual blocker lane stayed green under the temporary cleanup patch: `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-seed-2057-regression.test.js`.
6. Ticket-named replay coverage exposed the remaining blocker under the temporary cleanup patch: `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-policy-agent.test.js` failed because seeds `11` and `17` throw `NoPlayableMovesAfterPreparationError`.
7. Direct patched-build repro confirmed the remaining live witnesses: `node --input-type=module ...` reported `seed=11 -> throw`, `seed=17 -> throw`, `seed=23 -> maxTurns`, `seed=1041 -> maxTurns`.
8. Final targeted implementation proofs passed:
   - `pnpm -F @ludoforge/engine build`
   - `pnpm -F @ludoforge/engine schema:artifacts`
   - `pnpm turbo typecheck`
   - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/playable-candidate.test.js`
   - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/move-completion-retry.test.js`
   - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/prepare-playable-moves.test.js`
   - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/sim/simulator-no-playable-moves.test.js`
   - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/sim/simulator.test.js`
   - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-policy-agent.test.js`
   - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-seed-1000-draw-space.test.js`
   - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-seed-2057-regression.test.js`
   - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-seed-stability.test.js`
9. Post-review acceptance proof passed after the retry-test cleanup:
   - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/agents/prepare-playable-moves-retry.test.js`
   - `pnpm turbo test`
