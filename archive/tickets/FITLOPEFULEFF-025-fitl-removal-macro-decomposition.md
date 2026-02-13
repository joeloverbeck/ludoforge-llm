# FITLOPEFULEFF-025: FITL Removal Macro Contract Cleanup & Test Hardening

**Status**: ✅ COMPLETED
**Priority**: P1
**Estimated effort**: Medium (4-6 hours)
**Spec reference**: Spec 26 (Assault/Attack behaviors), Spec 13a macro architecture
**Depends on**: FITLOPEFULEFF-023, FITLOPEFULEFF-024

## Summary

Reassess and clean up FITL removal macro contracts based on current repository state.

Current code already uses a decomposed structure:
- `piece-removal-ordering` (priority removal core)
- `coin-assault-removal-order` (COIN wrapper)
- `insurgent-attack-removal-order` (insurgent wrapper)

Objective: remove stale/ambiguous macro parameters, keep responsibilities explicit, and strengthen tests so invariants are exercised by production compilation/runtime paths.

## Problem

Ticket assumptions are stale relative to current code:
- Proposed macro IDs in this ticket do not match implemented IDs.
- `piece-removal-ordering` already centralizes target ordering/tunnel handling.
- `coin-assault-removal-order` already encapsulates Aid side effect.
- `insurgent-attack-removal-order` exists but attack-profile call-site integration is not present in current production profile set.

Additionally, current contract has ambiguity/debt:
- `actorFaction` is threaded through removal macros despite no behavioral effect.
- Existing `fitl-removal-ordering` tests include synthetic effect checks that do not fully validate production macro contracts.

## Proposed Architecture

Keep existing macro decomposition and improve contracts:
1. Keep `piece-removal-ordering` as the reusable core.
2. Keep wrapper macros by behavior (`coin-assault-removal-order`, `insurgent-attack-removal-order`).
3. Remove unused `actorFaction` parameters/arguments from macros/call-sites.
4. Keep attacker-specific param only where behavior depends on it (`attackerFaction` attrition).
5. Strengthen tests to assert production macro contract + behavior, not just synthetic effect snippets.

Rationale vs original proposal:
- Renaming/re-splitting into new macro IDs provides little architectural gain now and increases churn.
- Contract cleanup + stronger tests improves correctness and extensibility with lower complexity.

## Files to Touch

- `data/games/fire-in-the-lake.md` — remove unused removal macro params/args and align contracts
- `test/integration/fitl-removal-ordering.test.ts` — add production-macro contract/invariant assertions
- `test/integration/fitl-coin-operations.test.ts`

## Out of Scope

- Full insurgent `attack-profile` rule implementation beyond current stub scope
- Kernel changes (handled in FITLOPEFULEFF-024)

## Acceptance Criteria

### Tests That Must Pass
1. COIN Assault removal order remains correct and deterministic.
2. Removal macro contracts are explicit and free of unused actor inference params.
3. Production tests assert macro usage/contract invariants (not only synthetic effects).
4. Build/typecheck/lint/tests pass.

### Invariants
- All game-specific behavior remains in GameSpecDoc data
- No hidden coupling between COIN and insurgent removal wrappers
- No dead/unused macro parameters in removal flow
- Build passes (`npm run build`)
- Typecheck passes (`npm run typecheck`)
- Lint passes (`npm run lint`)
- Tests pass (`npm test`)

## Outcome

- **Completion date**: 2026-02-13
- **What changed**:
  - Reassessed and corrected stale ticket assumptions about existing FITL removal macro decomposition.
  - Removed unused `actorFaction` parameter threading from removal macros/call sites in `data/games/fire-in-the-lake.md`.
  - Fixed insurgent removal wrapper binding names to consistently use bound identifiers.
  - Strengthened integration tests to enforce removal macro contract invariants and no dead `actorFaction` passthrough.
  - Updated COIN operations integration assertions to reflect explicit, minimal macro arguments.
- **Deviations from original plan**:
  - Did not rename/re-split macros to new IDs because existing decomposition already satisfied the architectural separation; focused on contract cleanup and coverage hardening instead.
  - Kept full insurgent Attack profile implementation out of scope (profile remains a stub in current production spec).
- **Verification results**:
  - `npm run lint` passed
  - `npm run build` passed
  - `npm run typecheck` passed
  - `npm test` passed (143 tests, 0 failures)
