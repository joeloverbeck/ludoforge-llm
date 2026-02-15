# FITLRULES1-002: FITL Victory Conditions & Derived Values

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes (generic only, no FITL-specific kernel branches)

## Reassessed Baseline (Code + Tests)

This ticket previously assumed several things that are no longer accurate:

1. `terminal` support does already exist in engine and has test coverage (`test/unit/terminal.test.ts`, `test/integration/fitl-coup-victory.test.ts`), but production FITL still uses a stub in `data/games/fire-in-the-lake/90-terminal.md`.
2. Existing `aggregate` supports summing token props and numeric query items, but **does not** support summing `mapSpaces` scalar properties (for example `population`) over filtered zone ids.
3. FITL production turn-order faction ids are currently numeric strings (`'0'..'3'`) in `turnOrder.config.turnFlow.eligibility.factions`, so checkpoint `faction` values in production terminal must match those ids (not `US/ARVN/NVA/VC`).
4. `VictoryTiming` labels (`duringCoup`, `finalCoup`) are semantic categories; they are not automatically gated by runtime coup phase state. Coup/final-coup gating must be encoded in checkpoint conditions, or added generically in engine.
5. Final-coup tie-break currently falls back to lexical faction sort; there is no explicit ranking tie-break policy field.

## Architecture Decision

The clean/extensible path is:

1. Extend existing generic `aggregate` behavior to support scalar extraction from map-space query items (`mapSpaces`/`zones` zone ids) via `aggregate.prop`.
2. Add an explicit generic ranking tie-break config to terminal ranking (ordered faction precedence), instead of relying on lexical side effects.
3. Keep FITL-specific victory logic entirely in `90-terminal.md`.

Rejected approach:
- Adding FITL-specific evaluator nodes or hardcoded faction/order logic in kernel.

## Scope (Updated)

### 1) Generic kernel/schema changes

- Extend `evalValue` aggregate prop extraction so `aggregate: { op: sum, query: { query: mapSpaces, ... }, prop: population }` is valid.
- Add optional ranking tie-break field (ordered faction ids) in:
  - `src/kernel/types-victory.ts`
  - `src/kernel/types-core.ts`
  - `src/kernel/schemas-extensions.ts`
  - `src/kernel/schemas-core.ts`
  - `src/kernel/terminal.ts` sort logic

### 2) FITL production terminal config

**File**: `data/games/fire-in-the-lake/90-terminal.md`

Replace the stub with:
- 4 during-coup threshold checkpoints
- 1 final-coup checkpoint
- 4 margin formulas
- ranking config `order: desc` and explicit tie-break precedence for FITL faction ids

### 3) Victory formulas

Margin formulas:
- US: Total Support + Available US troops+bases in `available-US:none`
- ARVN: COIN Controlled Population + `patronage`
- NVA: NVA Controlled Population + NVA bases on map
- VC: Total Opposition + VC bases on map

Component definitions:
- Total Support: sum of `population` for spaces where `supportOpposition` is `passiveSupport` or `activeSupport`
- Total Opposition: sum of `population` for spaces where `supportOpposition` is `passiveOpposition` or `activeOpposition`
- COIN Controlled Population: sum of `population` where `(US + ARVN pieces) > (NVA + VC pieces)`
- NVA Controlled Population: sum of `population` where `(NVA pieces) > (non-NVA pieces)` (aligns with existing FITL conservation test interpretation)

### 4) Coup/final-coup gating

Checkpoint `when` conditions must encode coup/final-coup gating using currently available game-state observables (no FITL kernel hardcoding).

## Invariants (Updated)

1. Engine remains game-agnostic; no FITL-specific identifiers in shared kernel/compiler.
2. Stub terminal condition is removed from production FITL terminal file.
3. FITL margins are data-defined and evaluable without bespoke runtime handlers.
4. Final-coup ranking uses explicit configured tie-break precedence, not lexical fallback.
5. Production initial state must not auto-terminal.

## Tests (Updated)

1. Unit: `evalValue` aggregate supports map-space scalar prop summation from filtered `mapSpaces`.
2. Unit: ranking tie-break honors configured precedence when margins tie.
3. Integration (production FITL compile): terminal checkpoints/margins/ranking are present and structurally correct.
4. Integration (production FITL runtime): initial state is non-terminal.
5. Integration (production FITL runtime): controlled states can trigger during-coup and final-coup terminal outcomes with expected winner/tie-break behavior.

## Outcome

- Completion date: 2026-02-15
- Implemented:
  - Generic kernel enhancement: `aggregate.prop` now supports summing numeric map-space properties when the query returns zone ids (for example `mapSpaces` + `population`).
  - Generic ranking enhancement: `terminal.ranking.tieBreakOrder` added to types/schemas/compiler validation/runtime sort.
  - Production FITL terminal stub replaced in `data/games/fire-in-the-lake/90-terminal.md` with full checkpoint/margin/ranking configuration.
  - Added/updated tests covering map-space aggregates, ranking tie-break precedence, and production FITL terminal runtime behavior.
- Deviations from original ticket draft:
  - Corrected faction assumption for production terminal from named factions (`US/ARVN/NVA/VC`) to runtime faction ids (`'0'..'3'`).
  - Corrected architectural approach from “possible FITL-specific ValueExpr node” to generic aggregate enhancement and generic ranking tie-break field.
  - Kept coup/final-coup gating data-driven in checkpoint `when` predicates using current state observables.
- Verification:
  - `npm run lint` passed.
  - `npm run test:all` passed.
