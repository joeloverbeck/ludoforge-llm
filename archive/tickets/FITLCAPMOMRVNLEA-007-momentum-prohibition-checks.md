# FITLCAPMOMRVNLEA-007 - Momentum Prohibition Preconditions

**Status**: ✅ COMPLETED
**Spec**: `specs/28-fitl-capabilities-momentum-rvn-leader.md` (Task 28.4)
**Depends on**: FITLCAPMOMRVNLEA-006, Spec 26/27 (operation/SA profiles exist)

## Goal

Add declarative momentum prohibition checks and momentum-driven SA space caps in FITL action pipelines so prohibited operations/SAs become illegal when corresponding momentum markers are active.

## Reassessed assumptions (2026-02-14)

- `data/games/fire-in-the-lake.md` is the canonical production GameSpecDoc and already contains momentum globals, but prohibition checks are not yet wired.
- In current architecture, legality is expressed on `actionPipelines[*].legality` and selector-stage `chooseN` bounds, not `actions[*].pre` (which are stubbed `pre: null` for profile-backed actions).
- Production FITL currently uses a stub `turnStructure` and does not encode coup-phase Trail degrade logic in the production file. Therefore, this ticket can enforce Oriskany on Air Strike degrade now; coup-phase Trail degrade must be tracked separately when production coup phases are implemented.

## File list expected to touch

- `data/games/fire-in-the-lake.md` — Add momentum legality checks and Typhoon-Kate SA max-1 selector caps
- `test/integration/fitl-momentum-prohibitions.test.ts` (new) — Integration coverage for prohibition and max-1 behavior

## Out of scope

- Momentum formula modifications unrelated to prohibiting legality/selection caps (FITLCAPMOMRVNLEA-008)
- Momentum definitions (FITLCAPMOMRVNLEA-006 — already done)
- Capability branches (FITLCAPMOMRVNLEA-001 through 005)
- RVN Leader effects (FITLCAPMOMRVNLEA-009, 010)
- Event cards that set momentum (Spec 29)
- Production coup-phase Trail degrade prohibition under `mom_oriskany` (deferred until production coup phases are modeled in `data/games/fire-in-the-lake.md`)

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
- `mom_claymores` (Card #17, Unshaded): No Ambush (NVA + VC ambush profiles)

### Infiltrate prohibited by (1 marker)
- `mom_mcnamaraLine` (Card #38): No Infiltrate until Coup

### Bombard prohibited by (1 marker)
- `mom_typhoonKate` (Card #115): No Bombard

### Transport prohibited by (1 marker)
- `mom_typhoonKate` (Card #115): No Transport

### Trail improvement via Rally prohibited by (1 marker)
- `mom_mcnamaraLine` (Card #38): No Trail Improvement by Rally until Coup

### Trail degrade via Air Strike prohibited by (1 marker)
- `mom_oriskany` (Card #39, Shaded): No Degrade of Trail by Air Strike

### All non-prohibited SAs max 1 space (1 marker)
- `mom_typhoonKate` (Card #115): All remaining legal SAs cap selected spaces to 1

## Acceptance criteria

### Specific tests that must pass

- `npm run build`
- `npm test` — All existing tests pass
- `node --test dist/test/integration/fitl-momentum-prohibitions.test.js`

### Integration test coverage

For each prohibition:
1. When momentum is `false` (inactive): action remains legal (or executes normally)
2. When momentum is `true` (active): prohibited action is illegal
3. When a different momentum is active: action remains legal (no cross-contamination)

Special cases:
- Air Strike: any of the 3 prohibitions blocks legality (OR logic)
- Air Lift: either prohibition blocks legality (OR logic)
- Typhoon Kate combined effect:
  - Air Lift + Transport + Bombard prohibited
  - non-prohibited SAs cannot select >1 space
- US Assault: only US assault profile blocked; ARVN assault remains legal
- Oriskany: Air Strike may still execute but Trail cannot be degraded by SA branch

### Invariants that must remain true

- Checks remain declarative in GameSpecDoc YAML
- No game-specific kernel/compiler branches
- Prohibitions use OR-style gating where multiple markers can block one action
- Existing behavior remains unchanged when all momentum gvars are `false`
- Tests compile via `compileProductionSpec()` from `test/helpers/production-spec-helpers.ts`

## Outcome

- **Completion date**: 2026-02-14
- **What changed**:
  - Added momentum legality guards in `data/games/fire-in-the-lake.md` for Air Strike, Air Lift, US Assault, Ambush (NVA/VC), Infiltrate, Bombard, and Transport.
  - Added McNamara guard to Rally trail-improvement stage and Oriskany guard to Air Strike trail-degrade stage.
  - Added Typhoon-Kate max-1-space selector branching for non-prohibited multi-space SAs (Advise, Govern, Raid, Infiltrate, Tax, Subvert, and shared Ambush selector).
  - Refactored repeated Typhoon selector logic into reusable FITL effect macros (`advise-select-spaces`, `govern-select-spaces-standard`, `raid-select-spaces`, `infiltrate-select-spaces`, `tax-select-spaces`, `subvert-select-spaces`, `insurgent-ambush-select-spaces-base`) to reduce duplication while keeping behavior declarative in `GameSpecDoc`.
  - Added `test/integration/fitl-momentum-prohibitions.test.ts` for prohibition and cap behavior.
  - Updated `test/integration/fitl-coin-operations.test.ts` to assert the new US Assault legality contract (General Lansdale momentum guard).
- **Deviations from original plan**:
  - Rally trail-improvement coverage is validated structurally (parsed pipeline guard assertion) rather than full runtime move execution, due unrelated legality-evaluation noise from unrelated profiles under that constructed state.
  - The ticket now explicitly defers coup-phase Oriskany enforcement until production coup phases are modeled in the FITL production spec.
- **Verification**:
  - `npm run build` passed
  - `node --test dist/test/integration/fitl-momentum-prohibitions.test.js` passed
  - `npm test` passed
  - `npm run lint` passed
