# FITL: Re-model Commitment as Interrupt Flow on Generic Engine Primitives

**Status**: ✅ COMPLETED  
**Priority**: P0  
**Complexity**: L  
**Depends on**: GAMEDEFGEN-001, GAMEDEFGEN-002, GAMEDEFGEN-003, GAMEDEFGEN-004

## 1) What needs to change / be implemented

Re-encode FITL commitment behavior to use generic interrupt/executor/query architecture with no FITL-specific kernel branching.

- Keep `commitment` as a declared phase in `turnStructure.phases` for now.
  - Current engine contracts require `pushInterruptPhase.phase` and `resumePhase` to reference declared phases.
  - Scope is to model commitment as an interrupt flow, not to add a new ephemeral non-phase interrupt primitive in this ticket.
- Remove `commitmentPhaseRequested` boolean toggle and rely on interrupt-phase entry plus explicit executor semantics for commitment resolution.
- Rework `card-73` (and any future commitment triggers) to enter commitment interrupt flow via generic transition effect.
- Ensure commitment action execution authority is explicitly US (or data-defined executor), not implicit active faction execution.
- Tighten commitment movement targeting to rules-accurate classes:
  - US Available
  - COIN-control spaces (for Province/City targets)
  - LoCs
  - Saigon
- Keep all FITL-specific behavior in GameSpecDoc data only.

## 2) Invariants that should pass

- No FITL-specific branch code in kernel.
- Commitment can be invoked by card effect as interrupt and always returns to prior flow deterministically.
- Commitment legality/decision prompts are consistent with executor semantics and rule targeting.
- No test harness workarounds that remove `turnOrder` are required to execute commitment.

## 3) Tests that should pass

### New/modified FITL tests
- `test/integration/fitl-commitment-phase.test.ts`
  - remove turn-order disable workaround.
  - verify card-73 interrupt entry and commitment resolution semantics on production wiring.
- `test/integration/fitl-events-1965-arvn.test.ts`
  - card-73 event wiring and semantics.
- `test/integration/fitl-events-text-only-behavior-backfill.test.ts`
  - card-73 behavior remains executable.
- Add `test/integration/fitl-commitment-targeting-rules.test.ts`
  - only legal destination classes are selectable for commitment moves.
- Add `test/integration/fitl-commitment-executor.test.ts`
  - commitment decisions/effects execute under US executor semantics.

### Existing tests
- `npm run build`
- `npm run lint`
- `npm test`

## Outcome

- **Completion date**: February 15, 2026
- **What changed vs original plan**:
  - Removed legacy `commitmentPhaseRequested` global variable and all references.
  - Rewired card-73 unshaded to interrupt-only entry (`pushInterruptPhase`).
  - Updated `resolveCommitment` to explicit US executor semantics and tightened destination filters to:
    - LoCs
    - Saigon
    - COIN-controlled Province/City spaces
  - Added two new integration tests for targeting rules and executor semantics.
  - Updated existing card-73 integration assertions to match new wiring.
- **Deviations from original plan**:
  - `commitment` remains a declared phase due current engine requirement that interrupt phase ids exist in `turnStructure.phases`.
  - Commitment lifecycle test uses production `turnOrder` with runtime-state continuity preserved; no `turnOrder` disabling is used.
- **Verification results**:
  - `npm run build` passed.
  - `npm run lint` passed.
  - `npm test` passed (unit + integration).
