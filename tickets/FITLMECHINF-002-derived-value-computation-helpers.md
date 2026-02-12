# FITLMECHINF-002 - Derived Value Computation Helpers

**Status**: Pending
**Spec**: `specs/25-fitl-game-mechanics-infrastructure.md` (Task 25.1)
**References**: `specs/00-fitl-implementation-order.md` (Milestone B)
**Depends on**: `FITLMECHINF-001` (token filter extension)

## Goal

Implement pure, game-agnostic helper functions that compute FITL derived values (COIN Control, NVA Control, Total Support, Total Opposition, Total Econ, Victory markers) from `GameState` + `GameDef`. These use on-demand computation per Decision #1 — no new state storage.

## Rationale

Spec 25 defines 6+ derived values that operations, victory checks, and events all depend on. These are pure functions of game state, computed on demand. Rather than embedding complex aggregate AST trees everywhere, provide well-tested helper functions that the operation profiles (Spec 26–27) and victory checks can call.

## Scope

### Changes

1. **New file `src/kernel/derived-values.ts`**: Pure functions computing each derived value. Each function takes `GameDef` + `GameState` (and optionally zone IDs) and returns a computed value. All functions are read-only — no state mutation.

   Functions to implement:
   - `isCoinControlled(def, state, spaceId): boolean` — count(US+ARVN pieces) > count(NVA+VC pieces)
   - `isNvaControlled(def, state, spaceId): boolean` — count(NVA pieces) > count(all non-NVA pieces)
   - `computeTotalSupport(def, state): number` — sum of population x support multiplier across spaces
   - `computeTotalOpposition(def, state): number` — sum of population x opposition multiplier across spaces
   - `computeTotalEcon(def, state): number` — sum of `econ` for COIN-controlled, non-sabotaged LoCs
   - `computeVictoryMarker(def, state, faction): number` — per-faction victory formula

2. **Population multiplier logic**: Active Support/Opposition = 2x population, Passive = 1x, Neutral/opposite = 0. Reads marker lattice state from zone variables.

3. **Sabotage detection**: A LoC with a Terror marker token is "sabotaged" and excluded from Total Econ.

4. **Unit tests** with hand-crafted board states covering all derived values, edge cases (empty spaces, zero population, all factions equal = no control), and the population multiplier table.

5. **Integration test** using production FITL data (`data/games/fire-in-the-lake.md`) to verify derived values against known scenario starting values (e.g., Short scenario Total Econ).

## File List

- `src/kernel/derived-values.ts` — New file with pure computation functions
- `src/kernel/index.ts` — Re-export derived value functions
- `test/unit/derived-values.test.ts` — Unit tests with synthetic board states
- `test/integration/fitl-derived-values.test.ts` — Integration tests against production FITL data

## Out of Scope

- Changes to `GameState` or `GameDef` types (no new stored fields)
- Caching or memoization of derived values (Decision #1: on-demand only)
- Stacking enforcement (FITLMECHINF-003)
- Free operation flag (FITLMECHINF-005)
- Operation profiles or effect changes
- Compiler changes (`src/cnl/*`)

## Acceptance Criteria

### Specific Tests That Must Pass

- `test/unit/derived-values.test.ts`:
  - COIN Control: space with 3 US + 1 ARVN vs 2 NVA + 1 VC → COIN controlled
  - COIN Control: equal counts → NOT controlled (strict >)
  - COIN Control: empty space → NOT controlled
  - NVA Control: space with 4 NVA vs 2 US + 1 VC → NVA controlled
  - NVA Control: space with 1 NVA vs 0 others → NVA controlled
  - Total Support: 3 spaces with Active Support (pop 2), Passive Support (pop 1), Neutral (pop 3) → 2×2 + 1×1 + 0×3 = 5
  - Total Opposition: symmetric test with opposition marker states
  - Total Econ: 2 LoCs COIN-controlled (econ 1 each), 1 LoC not controlled, 1 LoC sabotaged (Terror marker) → Total Econ = 2
  - Total Econ: sabotaged LoC excluded even if COIN-controlled
  - Victory US: Total Support + available US pieces
  - Victory NVA: population of NVA-controlled spaces + NVA bases on map
  - Victory ARVN: population of COIN-controlled spaces + Patronage
  - Victory VC: Total Opposition + VC bases on map
- `test/integration/fitl-derived-values.test.ts`:
  - Production FITL Short scenario initial board → known derived values match
- `npm run build` passes
- `npm test` passes

### Invariants That Must Remain True

- All derived value functions are pure: same `GameDef` + `GameState` → same result
- No mutation of `GameState`, `GameDef`, or any zone/token data
- No new fields added to `GameState` or `GameDef`
- Existing tests remain unaffected
- Functions are game-agnostic in implementation (parameterized by faction IDs, marker lattice IDs, etc.) even though tested with FITL-specific data
