# FITLCAPMOMRVNLEA-011 - Cross-System Integration and Smoke Tests

**Status**: ✅ COMPLETED
**Spec**: `specs/28-fitl-capabilities-momentum-rvn-leader.md` (Acceptance Criteria items 6-10)
**Depends on**: FITLCAPMOMRVNLEA-001 through 010 (all previous tickets)

## Goal

Add focused cross-system smoke coverage for interactions that are not already directly asserted, and close the remaining determinism invariant around global marker hashing.

## Reassessed Assumptions (Current Repo State)

The repository already contains broad coverage added by prior tickets, including:

- Capability integration suites split by action families (`test/integration/fitl-capabilities-*.test.ts`)
- Momentum prohibitions and formula modifier suites (`test/integration/fitl-momentum-prohibitions.test.ts`, `test/integration/fitl-momentum-formula-mods.test.ts`)
- RVN leader definition and runtime behavior suites (`test/integration/fitl-rvn-leader*.test.ts`)
- Production compilation invariants covering all 19 capabilities, 15 momentum vars, `activeLeader`, and `leaderBoxCardCount` (`test/integration/fitl-production-data-compilation.test.ts`)

Therefore, this ticket is **not** a first-pass implementation ticket. It is a **cross-system verification and gap-filling** ticket.

## Corrected Scope

### In Scope

- Add one integration smoke suite that validates multi-system interaction behavior in the same action resolution path:
  - capability + momentum precedence/stacking in one action
  - leader + capability interaction in one action
- Add one determinism test that explicitly proves global marker state changes contribute to state hash transitions and remain deterministic for identical seeds + decisions.
- Run and pass build, lint, and relevant tests.

### Out of Scope

- Re-implementing capability/momentum/leader branches already covered by existing suites.
- Kernel/compiler refactors unrelated to the missing integration assertions.
- Event-card wiring beyond existing Spec 28/29 boundaries.

## File list it expects to touch

- `test/integration/fitl-modifiers-smoke.test.ts` (new) — cross-system smoke interactions
- `test/unit/zobrist-hash-updates.test.ts` (modified) — explicit global marker hash invariant coverage

## Planned Smoke Scenarios

1. **Capability + momentum precedence**:
   - `cap_arcLight=unshaded` with `mom_rollingThunder=true` on US Air Strike
   - Assertion: Air Strike is illegal (prohibition wins over capability side effects)

2. **Multiple capabilities in one operation path**:
   - US Air Strike with `cap_topGun=unshaded` and `cap_lgbs=shaded`
   - Assertion: both side effects apply in one resolution (Trail degrade by 2 and removal cap of 4)

3. **Leader + capability stacking in one operation**:
   - ARVN Train with `activeLeader=minh` and `cap_caps=unshaded`
   - Assertion: both Minh Aid bonus and CAPs extra Police effect apply in same execution

4. **Leader cost override + capability branch coexistence**:
   - ARVN Train/Pacify with `activeLeader=ky` and `cap_cords=unshaded`
   - Assertion: Ky pacification cost override remains active while CORDS branch behavior is still available

## Determinism / Hash Invariant

- Extend `test/unit/zobrist-hash-updates.test.ts` with an explicit global marker hash check:
  - incremental hash update using `globalMarkerState` feature matches full recomputation
  - same seed + same move decisions + same global marker state yields identical final hash

## Acceptance criteria

### Specific tests that must pass

- `npm run build`
- `npm run lint`
- `npm test`
- `node --test dist/test/integration/fitl-modifiers-smoke.test.js`

### Invariants that must remain true

- No FITL-specific logic in engine/kernel/compiler paths
- Modifier behavior remains declarative in production `GameSpecDoc`
- Existing capability/momentum/leader suites continue passing unchanged
- Global marker state is hash-accounted and deterministic

## Outcome

- **Completion date**: 2026-02-14
- **What changed**:
  - Added `test/integration/fitl-modifiers-smoke.test.ts` with 5 cross-system smoke tests.
  - Extended `test/unit/zobrist-hash-updates.test.ts` with explicit global-marker hash recompute/inclusion assertions.
  - Fixed a generic selector-runtime edge case by enforcing exact binding-key lookup in `src/kernel/resolve-selectors.ts` (no `$name`/`name` alias fallback) and correcting the FITL declarations that were inconsistent with that rule.
  - Updated `data/games/fire-in-the-lake.md` ARVN/US Train per-space binders from `space` to `$space` to match selector references.
  - Added/updated strict-lookup coverage in `test/unit/resolve-selectors.test.ts`.
- **Deviation from original plan**:
  - While implementing the smoke case for Minh + CAPs, the test exposed a real runtime selector-binding bug caused by inconsistent binder naming. The ticket scope was expanded to include a strict, non-aliased kernel fix plus declarative data correction because it improves long-term architecture robustness.
- **Verification**:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm test` passed.
  - `node --test dist/test/integration/fitl-modifiers-smoke.test.js` passed.
