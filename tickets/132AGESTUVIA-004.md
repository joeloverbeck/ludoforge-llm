# 132AGESTUVIA-004: Remove agentStuck soft-stop + union cleanup + test migrations (S3 + S4.5 + S4.6)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — simulator catch removal, `SimulationStopReason` union + Zod schema cleanup, three test migrations
**Deps**: `archive/tickets/132AGESTUVIA-003.md`

## Problem

After tickets 001, 002, and 003 land, `NoPlayableMovesAfterPreparationError` no longer represents the original spec-132 "bad draw hit the `agentStuck` soft-stop" incident. Ticket 003 proved the live post-002 contract is narrower than universal guaranteed completion: VIABLE templates may still exhaust the bounded retry budget on some RNG seeds, but that behavior is now explicitly covered by focused agent tests instead of being treated as a simulator stop reason. The simulator's current `isNoPlayableErr` catch at `packages/engine/src/sim/simulator.ts:128–140` still converts that thrown condition into `stopReason = 'agentStuck'`, masking whether the failure is a genuine invariant violation or stale defensive behavior and leaking a misleading legacy variant into trace outputs and campaign statistics. Foundation #14 forbids keeping the `'agentStuck'` union member and catch path once the series reclassifies this state away from a legitimate stop reason. This ticket therefore must re-justify the simulator behavior directly: (a) delete the catch, (b) remove `'agentStuck'` from the union and Zod schema, and (c) migrate the existing tests that reference `'agentStuck'`, all in one atomic change.

## Assumption Reassessment (2026-04-16)

1. `packages/engine/src/sim/simulator.ts:128–140` contains the `isNoPlayableErr` catch mapping to `stopReason = 'agentStuck'` — confirmed.
2. `packages/engine/src/kernel/types-core.ts` defines `SimulationStopReason` as a union including `'agentStuck'` — confirmed via reassess-spec session.
3. `packages/engine/src/kernel/schemas-core.ts` contains the Zod literal union for stop reasons, including an `'agentStuck'` entry — confirmed.
4. `packages/engine/test/integration/fitl-seed-stability.test.ts:16` defines `ALLOWED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'agentStuck'])` — confirmed.
5. `packages/engine/test/integration/fitl-seed-2057-regression.test.ts:13` defines the identical set — confirmed.
6. Ticket `132AGESTUVIA-003` proved that the stronger claim "every VIABLE template yields a playable move" is false on current `HEAD`; bounded retry reduces `agentStuck` incidence but does not by itself prove `NoPlayableMovesAfterPreparationError` is unreachable. This ticket must therefore validate removal of `'agentStuck'` through direct simulator/seed evidence rather than that stronger contract assumption — confirmed.
7. `packages/engine/test/integration/fitl-policy-agent.test.ts:1196` asserts the positive invariant `trace.stopReason === 'noLegalMoves' || 'maxTurns' || 'terminal'` for seed 17 — confirmed. This assertion already excludes `'agentStuck'`; the migration here is comment-only to document the new post-S3 invariant.
8. `FORMER_CRASH_OR_HANG_SEEDS` at `fitl-seed-stability.test.ts:13–15` = `[1010, 1012, 1014, 1015, 1019, 1025, 1030, 1035, 1040, 1042, 1043, 1046, 1047, 1051, 1054]`. Seed 1010 overlaps with the current campaign failures. After this ticket + 001 + 002, every seed in this list MUST produce `'terminal'` or `'maxTurns'` (never throw, never `'agentStuck'`).

## Architecture Check

1. Foundation #14 atomic cleanup: removing the catch, the union member, the schema entry, and the three test references in one ticket prevents any intermediate state where an unreachable literal lingers. The change is mechanically uniform across consumers (remove one literal across 6 files + any grep-found residuals).
2. Foundation #15: the catch was a symptom-masking shim. Removing it forces genuine invariant violations to surface instead of being silently converted into a stop reason.
3. No new game-specific code introduced (Foundation #1). No YAML or spec-data changes.
4. After removal, the union contains only reachable stop reasons: `'terminal'`, `'maxTurns'`, `'noLegalMoves'` (or the current remaining set — verify during implementation), and that reachability is justified by direct simulator/test evidence rather than by the disproven universal completion claim.

## What to Change

### 1. Delete the simulator catch

In `packages/engine/src/sim/simulator.ts`, remove the try/catch wrapping around `agent.chooseMove(...)` at lines 128–140 (or at minimum remove the `isNoPlayableErr` branch that maps to `stopReason = 'agentStuck'`). If the surrounding try/catch legitimately guards against other error types, preserve those; this ticket only removes the `agentStuck` mapping.

### 2. Remove `'agentStuck'` from the union

- In `packages/engine/src/kernel/types-core.ts`, drop `'agentStuck'` from the `SimulationStopReason` union.
- In `packages/engine/src/kernel/schemas-core.ts`, drop the corresponding Zod literal entry.
- Grep the engine source once more for any residual `'agentStuck'` string literal; remove any stragglers found.

### 3. New simulator unit test (S4.5)

Create `packages/engine/test/unit/sim/simulator-no-playable-moves.test.ts` that:

- Constructs a GameDef + state where every legal move is genuinely uncompletable per the shared viability predicate (after tickets 001+002, enumerate should filter these out entirely, leaving the simulator to exit with `'noLegalMoves'`).
- Asserts `runGame(...)` returns with `stopReason === 'noLegalMoves'`.
- Using a mock agent that throws `NoPlayableMovesAfterPreparationError`, asserts the error propagates to `runGame`'s caller rather than being caught.
- Asserts that a TypeScript literal `stopReason: 'agentStuck'` fails type-check (via `// @ts-expect-error`) and that the Zod schema rejects the `'agentStuck'` value at runtime.

### 4. Migrate existing tests (S4.6)

- `packages/engine/test/integration/fitl-seed-stability.test.ts:16` — change `ALLOWED_STOP_REASONS` to `new Set(['terminal', 'maxTurns'])`. Every seed in `FORMER_CRASH_OR_HANG_SEEDS` MUST now pass under the tightened set. If any seed fails after 001/002/004 land, the regression is in implementation — stop and diagnose before closing this ticket.
- `packages/engine/test/integration/fitl-seed-2057-regression.test.ts:13` — same update to `ALLOWED_STOP_REASONS`.
- `packages/engine/test/integration/fitl-policy-agent.test.ts:1196` — the existing positive invariant already excludes `'agentStuck'`; add a code comment on or above the assertion noting this is a post-S3 invariant (e.g., `// Post-spec-132: 'agentStuck' is no longer a representable SimulationStopReason.`).

Search the rest of the test tree for any other `'agentStuck'` references and migrate identically. Goldens and fixtures that encode a stop reason MUST be regenerated if they contain the literal.

## Files to Touch

- `packages/engine/src/sim/simulator.ts` (modify) — delete the `isNoPlayableErr` mapping
- `packages/engine/src/kernel/types-core.ts` (modify) — drop `'agentStuck'` from the union
- `packages/engine/src/kernel/schemas-core.ts` (modify) — drop the Zod literal
- `packages/engine/test/unit/sim/simulator-no-playable-moves.test.ts` (new) — S4.5 coverage
- `packages/engine/test/integration/fitl-seed-stability.test.ts` (modify) — S4.6 migration
- `packages/engine/test/integration/fitl-seed-2057-regression.test.ts` (modify) — S4.6 migration
- `packages/engine/test/integration/fitl-policy-agent.test.ts` (modify) — S4.6 comment annotation
- Any other file surfaced by grep that references `'agentStuck'` (modify or delete as appropriate)

## Out of Scope

- Changes to enumerate/probe viability — 132AGESTUVIA-001's scope.
- Changes to completion retry — 132AGESTUVIA-002's scope.
- Running the full FITL tournament gate — 132AGESTUVIA-005's scope.
- FITL policy YAML adjustments.

## Acceptance Criteria

### Tests That Must Pass

1. New `simulator-no-playable-moves.test.ts` passes: uncompletable legal moves resolve to `'noLegalMoves'`; `NoPlayableMovesAfterPreparationError` propagates; type and Zod both reject `'agentStuck'`.
2. Migrated `fitl-seed-stability.test.ts`: every seed in `FORMER_CRASH_OR_HANG_SEEDS` produces `'terminal'` or `'maxTurns'` under the tightened allow-set.
3. Migrated `fitl-seed-2057-regression.test.ts` passes under the tightened allow-set.
4. `fitl-policy-agent.test.ts:1196` invariant continues to hold for seed 17.
5. Existing suite: `pnpm turbo test`.

### Invariants

1. `SimulationStopReason` does not include `'agentStuck'`. Grep confirms zero `'agentStuck'` references in engine source (Foundation #14).
2. `NoPlayableMovesAfterPreparationError`, when thrown, propagates to `runGame`'s caller unhandled by the simulator.
3. Every seed formerly tolerated via `'agentStuck'` (15 seeds in `FORMER_CRASH_OR_HANG_SEEDS` + seed 2057) now reaches `'terminal'` or `'maxTurns'`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/sim/simulator-no-playable-moves.test.ts` — new S4.5 coverage.
2. `packages/engine/test/integration/fitl-seed-stability.test.ts` — tightened `ALLOWED_STOP_REASONS`.
3. `packages/engine/test/integration/fitl-seed-2057-regression.test.ts` — tightened `ALLOWED_STOP_REASONS`.
4. `packages/engine/test/integration/fitl-policy-agent.test.ts` — comment-only migration.

### Commands

1. `pnpm -F @ludoforge/engine test test/unit/sim/simulator-no-playable-moves.test.ts`
2. `pnpm -F @ludoforge/engine test test/integration/fitl-seed-stability.test.ts`
3. `pnpm -F @ludoforge/engine test test/integration/fitl-seed-2057-regression.test.ts`
4. `pnpm -F @ludoforge/engine test test/integration/fitl-policy-agent.test.ts`
5. `pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`
