# FITLRULES2-003: Monsoon Restrictions (Rule 2.3.9)

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Production GameSpecDoc YAML + tests + kernel move-validation hardening for turn-flow window parity
**Deps**: None

## Reassessed Assumptions (2026-02-23)

1. **Ticket path references were stale**: The canonical rules source is `data/games/fire-in-the-lake/30-rules-actions.md`, but the old line references are no longer accurate.
2. **Kernel support already exists**: `packages/engine/src/kernel/legal-moves-turn-order.ts` already enforces generic turn-flow monsoon restrictions via `turnFlow.monsoon.restrictedActions`, `maxParam`, and `blockPivotal`.
3. **Production FITL does not use turn-flow monsoon yet**: production YAML currently has `monsoon.restrictedActions: []`.
4. **Monsoon behavior is currently split and partially incorrect in SA profiles**:
   - `advise-profile` hard-caps selected spaces to 1 during monsoon (not mandated by Rule 2.3.9).
   - `air-lift-profile` hard-caps selected spaces to 1 during monsoon (Rule 2.3.9 says 2).
   - `air-strike-profile` max-spaces expression effectively hard-caps to 1 during monsoon (Rule 2.3.9 says 2).
   - Advise still allows `sweep` mode during monsoon, conflicting with “even via Advise”.
5. **`maxParam` assumption was wrong in the original ticket**: for these actions the correct move parameter is `spaces` (array length constrained by kernel), not `spaceCount`.
6. **Pivotal blocking is currently unused by production FITL**: production turn-flow currently does not declare `pivotal` action IDs. Setting `monsoon.blockPivotal: true` is still valid forward-safe data but has no immediate runtime effect until pivotal actions are wired.

## Problem

Rule 2.3.9 is not encoded correctly in production FITL data:
- Monsoon restrictions are not declared in `turnFlow.monsoon.restrictedActions`.
- Special-activity profile logic applies monsoon limits that do not match the rule text.
- Advise can still execute the Sweep branch while monsoon is active.

This creates inconsistent behavior and duplicates turn-flow policy in action profiles instead of using the shared turn-flow restriction mechanism.

## Architecture Rationale

The proposed changes are **more beneficial than current architecture** because they:
- move cross-cutting monsoon gating into `turnFlow.monsoon` (single source of truth),
- keep kernel generic and game-agnostic (Agnostic Engine Rule),
- reduce profile-level duplication and drift risk,
- retain profile-level logic only for behavior that cannot be expressed by action-level gating (Advise mode filtering).

## Updated Scope

### 1) Production data updates (`data/games/fire-in-the-lake/30-rules-actions.md`)

Update `turnFlow.monsoon` to:

```yaml
monsoon:
  restrictedActions:
    - { actionId: sweep }
    - { actionId: march }
    - { actionId: airStrike, maxParam: { name: spaces, max: 2 } }
    - { actionId: airLift, maxParam: { name: spaces, max: 2 } }
  blockPivotal: true
```

Then remove/adjust duplicate or conflicting monsoon caps inside SA profiles:
- `advise-profile`: remove monsoon-driven `maxSpaces: 1`; keep Typhoon Kate cap behavior; disallow `sweep` mode when monsoon active.
- `air-lift-profile`: remove monsoon `max: 1` branch (turn-flow handles monsoon max 2).
- `air-strike-profile`: remove monsoon from the profile max-space cap expression (turn-flow handles monsoon max 2; capability/momentum modifiers can still impose stricter limits).

### 2) Test updates/additions

Update/extend integration tests to assert runtime behavior against Rule 2.3.9 and the new architecture.

## Rules Mapping (Rule 2.3.9)

- **Sweep**: blocked during monsoon (including via Advise branch selection).
- **March**: blocked during monsoon.
- **Air Strike**: limited to 2 selected spaces during monsoon.
- **Air Lift**: limited to 2 selected spaces during monsoon.
- **Pivotal Events**: blocked during monsoon when pivotal action wiring exists.

## Invariants

1. Monsoon activates only when lookahead card is a coup card.
2. Sweep and March action moves are unavailable during monsoon.
3. Advise cannot choose Sweep mode during monsoon.
4. Air Strike and Air Lift cannot exceed 2 selected spaces during monsoon (subject to stricter independent modifiers).
5. Non-monsoon behavior is unchanged except where it previously encoded incorrect monsoon-only limits.

## Tests

1. **Compile invariant update** (`fitl-production-data-compilation.test.ts`): assert monsoon config has four restricted actions and `blockPivotal: true`.
2. **Integration runtime — Advise sweep blocked in monsoon**: monsoon active, Advise `sweep` mode must fail.
3. **Integration runtime — Advise two-space legal in monsoon (non-sweep modes)**: monsoon active, 2 spaces with allowed Advise modes should succeed.
4. **Integration runtime — Air Lift cap is 2 spaces in monsoon**: 2 spaces legal, 3 spaces rejected.
5. **Integration runtime — Air Strike cap is 2 spaces in monsoon**: 2 spaces legal, 3 spaces rejected.
6. **Integration runtime — Sweep/March blocked via turn-flow action gating**.
7. **Regression**: existing FITL turn-flow and SA integration tests pass with updated assertions.

## Outcome

- **Completion date**: 2026-02-23
- **What changed (actual)**:
  - Updated `data/games/fire-in-the-lake/30-rules-actions.md` monsoon config to action-level restrictions (`sweep`, `march`, `airStrike<=2 spaces`, `airLift<=2 spaces`) with `blockPivotal: true`.
  - Removed incorrect monsoon-specific one-space caps from Advise/Air Lift/Air Strike profile selection logic.
  - Added explicit Advise monsoon mode gating so Sweep mode is unavailable when lookahead is Coup.
  - Updated production compilation and US/ARVN SA integration tests to reflect Rule 2.3.9 behavior.
  - Hardened kernel validation (`packages/engine/src/kernel/apply-move.ts`) to apply turn-flow option-matrix/window checks during `applyMove` validation, preventing direct-move bypass of monsoon window restrictions.
- **Deviation from original plan**:
  - Original reassessment planned no kernel changes. During implementation, tests exposed a validation-path gap (turn-flow windows enforced in `legalMoves` filtering but not enforced in direct `applyMove` validation). This was fixed to preserve architecture invariants.
- **Verification**:
  - `pnpm -F @ludoforge/engine test` passed (`255` tests, `0` failed).
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm -F @ludoforge/engine test:all` still reports pre-existing unrelated Texas Hold'em e2e failures (5 files), while FITL unit/integration coverage passed.
