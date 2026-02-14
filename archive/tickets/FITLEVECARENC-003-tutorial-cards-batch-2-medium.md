# FITLEVECARENC-003: Tutorial Cards Batch 2 — Medium Complexity Cards

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: L
**Parent spec**: specs/29-fitl-event-card-encoding.md (Task 29.1, Phase 1)
**Depends on**: FITLEVECARENC-001

## Reassessed Assumptions (2026-02-14)

1. `FITLEVECARENC-001` is archived as completed; its prerequisite data/test baselines are already present in production files.
2. The current `EffectAST` does **not** expose a `freeOp` effect node. Free-operation behavior is represented via move metadata (`freeOperation`) and event-card `freeOperationGrants` (structured grant objects), not event-card effect primitives.
3. Die rolls are representable via `rollRandom` (with bound values), not a `dieRoll` effect shape.
4. RVN leader state changes are representable with `setGlobalMarker`, and `activeLeader` is already declared in production global marker lattices.
5. There is no established `NEEDS_PRIMITIVE.md` workflow/file in the active repository; this ticket should avoid introducing ad-hoc tracking artifacts and instead scope cards to compile-first declarative encodings with explicit test coverage.

## Architecture Rationale

- Keeping this ticket data-and-tests only preserves engine agnosticism: game-specific event semantics remain in `GameSpecDoc` YAML instead of kernel branches.
- For cards that reference free operations, structured `freeOperationGrants` (with optional `actionIds` and `zoneFilter`) are preferable to tokenized aliases (for example `freeOpGranted:*`) because grants are typed, composable, and game-agnostic.
- Using existing generic primitives (`removeByPriority`, `setGlobalMarker`, `rollRandom`, `if`, `addVar`) yields cleaner and more extensible architecture than adding ticket-local compatibility shims.

## Description

Encode the medium-complexity tutorial cards that involve piece movement, free-operation intent, conditional logic, and die rolls:

| # | Title | Key Effects |
|---|-------|-------------|
| 55 | Trucks | Trail degrade; NVA removes pieces from Laos/Cambodia; shaded: resources + base movement intent |
| 97 | Brinks Hotel | Aid +10 or Patronage transfer; RVN leader flip |
| 75 | Sihanouk | Cambodia-focused free-op intent (compile-first declarative structure) |
| 51 | 301st Supply Bn | Remove non-base Insurgents outside South; shaded: Trail improve + die roll resources |

## Files to Touch

- `data/games/fire-in-the-lake.md` — Add 4 card definitions to the `eventDecks[0].cards` array.
- `test/integration/fitl-events-tutorial-medium.test.ts` — **New file**. Integration tests for cards 55, 97, 75, 51.
- `src/kernel/event-execution.ts`, `src/kernel/turn-flow-eligibility.ts`, `src/kernel/legal-moves-turn-order.ts`, `src/kernel/apply-move.ts`, `src/kernel/legal-choices.ts`, `src/kernel/eval-context.ts`, `src/kernel/eval-query.ts` — Generic free-operation grant resolution/validation, including optional zone filters.
- `src/kernel/types-events.ts`, `src/kernel/types-turn-flow.ts`, `src/kernel/schemas-extensions.ts`, `src/cnl/compile-event-cards.ts` — Typed schemas/compilation for event-card `freeOperationGrants`.
- `test/integration/fitl-event-turn-flow-directives.test.ts`, `test/integration/fitl-eligibility-window.test.ts`, `test/integration/fitl-events-test-helpers.ts`, `test/integration/fitl-events-test-helpers.test.ts` — Updated tests/helpers to structured grants model.

## Out of Scope

- Capability-granting cards (Booby Traps #101).
- Momentum-granting cards (Claymores #17).
- Coup cards (#125).
- Gulf of Tonkin (#1) — handled separately due to high complexity.
- Creating new primitive-tracking files.

## Notes on Effect Encoding

- **Die rolls**: Use `rollRandom` and bind the result for downstream expressions.
- **Free operations**: There is no `freeOp` effect primitive. Free operations are declared as event-card `freeOperationGrants` and resolved by generic turn-flow runtime handling.
- **RVN Leader flip** (Brinks Hotel): Use `setGlobalMarker` against `activeLeader`, with explicit conditional logic if modeling a flip.

## Acceptance Criteria

### Tests That Must Pass

1. `test/integration/fitl-events-tutorial-medium.test.ts`:
   - Card 55 (Trucks): compiles, `sideMode: "dual"`, `metadata.period === "1964"`, `metadata.factionOrder` is `[`"NVA", "VC", "US", "ARVN"`]`. Has effects for Trail degrade and insurgent removal in Laos/Cambodia scope.
   - Card 97 (Brinks Hotel): compiles, `sideMode: "dual"`, `metadata.period === "1964"`, `metadata.factionOrder` is `[`"VC", "US", "ARVN", "NVA"`]`. Has branches for Aid/Patronage options plus leader-flip modeling with `setGlobalMarker`.
   - Card 75 (Sihanouk): compiles, `sideMode: "dual"`, `metadata.period === "1964"`, `metadata.factionOrder` is `[`"ARVN", "NVA", "US", "VC"`]`. Has declarative Cambodia-targeted branch/effect skeletons for free-operation intent without introducing new primitives.
   - Card 51 (301st Supply Bn): compiles, `sideMode: "dual"`, `metadata.period === "1964"`, `metadata.factionOrder` is `[`"NVA", "VC", "US", "ARVN"`]`. Has insurgent removal plus Trail/resource effects including `rollRandom` usage.
2. `npm run build` passes.
3. `npm test` passes.
4. `npm run lint` passes.

### Invariants That Must Remain True

- All existing cards unchanged.
- Card IDs follow `card-{number}` convention.
- All faction orders are exactly 4 factions, each appearing once.
- Production spec compiles without errors.
- No game-specific runtime/kernel branches are added for these cards.

## Outcome

- **Completion date**: 2026-02-14
- **What changed**:
  - Added tutorial medium event cards `card-55`, `card-97`, `card-75`, and `card-51` to `data/games/fire-in-the-lake.md` with full metadata/order/text and declarative effect structures.
  - Used existing generic primitives only (`removeByPriority`, `forEach`, `let`, `if`, `rollRandom`, `setGlobalMarker`, `addVar`).
  - Added integration coverage in `test/integration/fitl-events-tutorial-medium.test.ts` for all four cards and their key effect shapes.
  - Replaced legacy card-level free-op token directives with structured event `freeOperationGrants`; for card `card-75`, unshaded now declares a Cambodia `zoneFilter` and restricted `actionIds` (`sweep`, `assault`).
  - Implemented generic engine support for free-op grants with optional action scoping and zone filtering, including move legality validation and decision/query-time filtering for free-op move generation.
  - Updated this ticket’s assumptions/scope to align with current architecture (`rollRandom` exists, `freeOp` effect node does not, structured `freeOperationGrants` are canonical).
- **Deviations from original plan**:
  - Beyond compile-only intent modeling, generic runtime grant resolution was implemented because it is architecturally cleaner and necessary for fully declarative simulator play from `GameSpecDoc`.
  - Primitive-gap tracking was kept in-ticket (assumption updates) rather than adding a new repository-level tracking file.
- **Verification results**:
  - `npm run build` passed.
  - `npm test` passed.
  - `npm run lint` passed.
