# ARCDECANDGEN-016: `simultaneous` Turn Order Type Stub

**Status**: ✅ COMPLETED

**Phase**: 5C (Generalized Turn Order Strategy)
**Priority**: P3
**Complexity**: S
**Dependencies**: ARCDECANDGEN-014 (`TurnOrderStrategy` union must exist)

## Goal

Reassess and lock down the `simultaneous` baseline with tests. The type and partial runtime hooks already exist; this ticket now focuses on validating and documenting those behaviors.

## Reassessed Baseline (Before This Ticket)

- `TurnOrderStrategy` already includes `{ type: 'simultaneous' }` in `src/kernel/types-turn-flow.ts`.
- `lowerTurnOrder` already accepts `turnOrder.type = 'simultaneous'` and emits `CNL_COMPILER_SIMULTANEOUS_NOT_IMPLEMENTED` as a warning in `src/cnl/compile-turn-flow.ts`.
- `initialState` already initializes `turnOrderState` for simultaneous games with `submitted` map entries for each player in `src/kernel/initial-state.ts`.
- `advancePhase` already resets simultaneous `submitted` flags at turn boundaries in `src/kernel/phase-advance.ts`.
- There is currently no explicit simultaneous-focused test file; coverage must be added in existing test suites.
- Runtime does **not** throw for simultaneous in `legalMoves`/`applyMove`; it currently behaves as a non-card-driven flow while simultaneous submission semantics remain incomplete.

## File List (files to touch)

### Files to modify
- `test/unit/compile-top-level.test.ts` — add assertion that `simultaneous` compiles with warning `CNL_COMPILER_SIMULTANEOUS_NOT_IMPLEMENTED`
- `test/unit/initial-state.test.ts` — add simultaneous `turnOrderState` initialization assertions
- `test/unit/phase-advance.test.ts` — add simultaneous turn-boundary reset assertions

**Note**: Types and runtime stubs already landed before this ticket. This ticket is test hardening and scope correction, not a new runtime implementation.

### New/modified test files
- `test/unit/compile-top-level.test.ts`
- `test/unit/initial-state.test.ts`
- `test/unit/phase-advance.test.ts`

## Out of Scope

- **No full simultaneous submission-resolution runtime** (move collection/commit/reveal semantics remain deferred)
- **No changes to** `data/games/fire-in-the-lake.md`
- **No changes to** `src/agents/`, `src/sim/`
- **No behavioral changes to** `cardDriven` or `fixedOrder` logic

## Acceptance Criteria

### Tests that must pass
- All existing tests pass
- `npm run typecheck` — passes
- `npm run lint` — passes

### New tests
1. **"simultaneous compilation emits CNL_COMPILER_SIMULTANEOUS_NOT_IMPLEMENTED warning"** — assert warning diagnostic, compilation still succeeds (warning, not error)
2. **"simultaneous initialState succeeds"** — `turnOrderState = { type: 'simultaneous', submitted: {} }`
3. **"simultaneous marks all players as needing submission"** — 4 players → `submitted = { '0': false, '1': false, '2': false, '3': false }`
4. **"simultaneous turn boundary resets submitted flags"** — advancing from last phase reinitializes all player submission flags to `false`

### Invariants that must remain true
- Compiler warning is emitted but does not block compilation
- `initialState` succeeds for `simultaneous`
- `phase-advance` keeps `simultaneous` runtime shape consistent at turn boundaries
- Runtime remains intentionally partial: no full simultaneous move submission protocol yet

## Architecture Assessment

- The current architecture (typed strategy union + explicit runtime state variant + compiler warning) is preferable to the original ticket's assumption of a type-only stub with runtime crash behavior.
- Keeping a first-class `simultaneous` variant in shared turn-order abstractions aligns with `specs/32-architecture-decomposition-and-generalization.md` goals (engine-generic modeling, explicit contracts, no hidden FITL branches).
- The remaining architectural gap is not aliasing/backward-compatibility work; it is the absence of a dedicated simultaneous decision protocol in kernel flow (`legalMoves`/`applyMove`/turn advancement orchestration).

## Outcome

- Completion date: 2026-02-13
- What changed:
  - Corrected stale assumptions in this ticket to match the real baseline in `src/cnl/compile-turn-flow.ts`, `src/kernel/initial-state.ts`, and `src/kernel/phase-advance.ts`.
  - Added simultaneous coverage in:
    - `test/unit/compile-top-level.test.ts`
    - `test/unit/initial-state.test.ts`
    - `test/unit/phase-advance.test.ts`
- Deviations from original plan:
  - No production code changes were required; the targeted behavior already existed and the main gap was missing tests plus incorrect ticket assumptions/scope.
  - Replaced the invalid invariant (“runtime throws via never”) with the current and intended invariant (partial runtime support without full simultaneous submission protocol).
- Verification results:
  - `npm run build` passed.
  - `node --test dist/test/unit/compile-top-level.test.js dist/test/unit/initial-state.test.js dist/test/unit/phase-advance.test.js` passed.
  - `npm run test` passed.
  - `npm run typecheck` passed.
  - `npm run lint` passed.
