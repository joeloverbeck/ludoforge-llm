# FITL: Re-model Commitment as Interrupt Flow on Generic Engine Primitives

**Status**: Draft  
**Priority**: P0  
**Complexity**: L  
**Depends on**: GAMEDEFGEN-001, GAMEDEFGEN-002, GAMEDEFGEN-003, GAMEDEFGEN-004

## 1) What needs to change / be implemented

Re-encode FITL commitment behavior to use the new generic interrupt/executor/query architecture.

- Remove commitment as a permanent phase from FITL global turn structure.
- Replace `commitmentPhaseRequested` boolean toggle with interrupt request/flow encoding.
- Rework `card-73` (and any future commitment triggers) to enter commitment interrupt flow via generic transition effect.
- Ensure commitment action execution authority is explicitly US (or data-defined executor), not just active faction.
- Tighten commitment movement targeting to rules-accurate classes:
  - US Available
  - COIN-control spaces
  - LoCs
  - Saigon
- Keep all FITL-specific behavior in GameSpecDoc data only.

## 2) Invariants that should pass

- No FITL-specific branch code in kernel.
- Commitment can be invoked by card effect as interrupt and always returns to prior flow deterministically.
- Commitment legality/decision prompts are consistent with executor semantics and rule targeting.
- No test harness workarounds (for example disabling turnOrder in test) required to execute commitment.

## 3) Tests that should pass

### New/modified FITL tests
- `test/integration/fitl-commitment-phase.test.ts`
  - remove turn-order workaround, verify full lifecycle path.
- `test/integration/fitl-events-1965-arvn.test.ts`
  - card-73 event wiring and semantics.
- `test/integration/fitl-events-text-only-behavior-backfill.test.ts`
  - card-73 behavior remains executable.
- Add `test/integration/fitl-commitment-targeting-rules.test.ts`
  - only legal destination classes are selectable.
- Add `test/integration/fitl-commitment-executor.test.ts`
  - commitment decisions/effects execute under US executor semantics.

### Existing tests
- `npm run build`
- `npm run lint`
- `npm test`

