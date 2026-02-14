# FITLCAPMOMRVNLEA-007 - Momentum Prohibition Preconditions

**Status**: Pending
**Spec**: `specs/28-fitl-capabilities-momentum-rvn-leader.md` (Task 28.4)
**Depends on**: FITLCAPMOMRVNLEA-006, Spec 26/27 (operation/SA profiles exist)

## Goal

Add precondition checks to operation/SA profiles that are **prohibited** by active momentum markers. When a momentum marker is active (value = 1/true), the corresponding operation/SA becomes illegal.

## File list it expects to touch

- `data/games/fire-in-the-lake.md` — Add precondition checks to operation/SA profiles
- `test/integration/fitl-momentum-prohibitions.test.ts` (new) — Integration tests

## Out of scope

- Momentum formula modifications (FITLCAPMOMRVNLEA-008 — modifiers that change HOW an operation works, not WHETHER it's legal)
- Momentum definitions (FITLCAPMOMRVNLEA-006 — already done)
- Capability branches (FITLCAPMOMRVNLEA-001 through 005)
- RVN Leader effects (FITLCAPMOMRVNLEA-009, 010)
- Event cards that set momentum (Spec 29)
- Momentum expiry at coup Reset (already in foundation)

## Prohibition checks to implement

### Air Strike prohibited by (3 markers)
- `mom_rollingThunder` (Card #10, Shaded): No Air Strike until Coup
- `mom_daNang` (Card #22, Shaded): No Air Strike until Coup
- `mom_bombingPause` (Card #41): No Air Strike until Coup

### Air Lift prohibited by (2 markers)
- `mom_medevacShaded` (Card #15b, Shaded): No Air Lift until Coup
- `mom_typhoonKate` (Card #115): No Air Lift

### US Assault prohibited by (1 marker)
- `mom_generalLansdale` (Card #78, Shaded): No US Assault until Coup

### Ambush prohibited by (1 marker)
- `mom_claymores` (Card #17, Unshaded): No Ambush

### Infiltrate prohibited by (1 marker)
- `mom_mcnamaraLine` (Card #38): No Infiltrate until Coup

### Bombard prohibited by (1 marker)
- `mom_typhoonKate` (Card #115): No Bombard

### Transport prohibited by (1 marker)
- `mom_typhoonKate` (Card #115): No Transport

### Trail improvement via Rally prohibited by (1 marker)
- `mom_mcnamaraLine` (Card #38): No Trail Improvement by Rally until Coup

### Trail degrade via Air Strike/Coup prohibited by (1 marker)
- `mom_oriskany` (Card #39, Shaded): No Degrade of Trail (by Air Strike or Coup, not Events)

### All SAs max 1 space (1 marker)
- `mom_typhoonKate` (Card #115): All non-prohibited SAs max 1 space

## Acceptance criteria

### Specific tests that must pass

- `npm run build`
- `npm test` — All existing tests pass
- `node --test dist/test/integration/fitl-momentum-prohibitions.test.js`

### Integration test coverage

For each prohibition:
1. When momentum is `0` (inactive): operation/SA is legal (can appear in legal moves)
2. When momentum is `1` (active): operation/SA is illegal (does not appear in legal moves or precondition fails)
3. When a different momentum is active: operation/SA remains legal (no cross-contamination)

Special cases:
- Air Strike: test that ANY of the 3 Air Strike prohibitions blocks it (OR logic)
- Air Lift: test that EITHER of the 2 Air Lift prohibitions blocks it
- Typhoon Kate: test the combined effect (Air Lift + Transport + Bombard prohibited, all other SAs max 1)
- US Assault: test that only US faction is blocked (ARVN Assault remains legal)

### Invariants that must remain true

- Prohibition checks are declarative preconditions in GameSpecDoc YAML
- No game-specific logic in engine/kernel/compiler
- All prohibitions are OR-style (any active prohibiting momentum blocks the action)
- Existing operation/SA behavior unchanged when all momentum gvars are 0
- Tests use `compileProductionSpec()` from `test/helpers/production-spec-helpers.ts`
