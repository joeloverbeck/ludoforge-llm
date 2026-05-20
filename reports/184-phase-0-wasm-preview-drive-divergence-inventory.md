# Spec 184 Phase 0+1 WASM Preview-Drive Divergence Inventory

**Date**: 2026-05-19
**Status**: Phase 0+1 inventory and classification witness.
**Commit**: `3b0bd9ff274840cce57bbea8c1dcab6845de2329`
**Command**: `pnpm -F @ludoforge/engine build && node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --output-dir /tmp/ludoforge-184 --date 2026-05-19`
**Raw rollup**: `/tmp/ludoforge-184/fitl-arvn-15-seed-decomposition-2026-05-19.md`
**Raw CSV**: `/tmp/ludoforge-184/fitl-arvn-15-seed-decomposition-2026-05-19.csv`

## Summary

- Seeds completed: 15/15 (`1000..1014`).
- Per-decision rows: 3,808.
- WASM production preview-drive route count: 3,163.
- WASM production preview-drive unsupported count: 2,936.
- Inventory rows below reconcile to 2,936 unsupported contributions.
- The executable producer is `profile-fitl-arvn-15-seed-decomposition.mjs`; `profile-fitl-arvn-15-seed-report-rendering.mjs` is only the markdown/CSV renderer imported by that producer.

## Evidence Limits

The 15-seed rollup is reason-granular, not per-candidate-value-granular. It records the unsupported class, unsupported owner, reason, profile, microturn class, seed coverage, and counts. It does not record the TS evaluator's per-candidate numeric preview value for each unsupported row. Therefore the inventory records TS outcome as the Spec 175 fallback oracle (`TS fallback materializes canonical preview result`) and leaves numeric values to the downstream parity fixtures in tickets 002 and 003.

## Unsupported-Reason Rollup

| Unsupported key | Count | Classification | Target | Rationale |
|---|---:|---|---|---|
| `unsupported-effect / production-preview-drive.actionBatch / production preview-drive requires deterministic shared scalar runtime bindings` | 1,314 | (b) document unsupported | Phase 3 | The drive cannot lower candidate batches whose scalar bindings are not deterministic and shared across the action program. Preserve null-return to TS fallback and keep parity coverage. |
| `unsupported-effect / production-preview-drive.cardEventAction / production preview-drive does not route card event action candidates` | 770 | (b) document unsupported | Phase 3 | Card-event routing is intentionally outside this bounded production preview-drive path. Preserve null-return to TS fallback and keep parity coverage. |
| `unknown / production-deep-choosenstep-continuation.projectedState / deep preview-drive reached a terminal boundary before materializing a WASM projected state` | 536 | (b) document unsupported | Phase 3 | Terminal/seat boundary before a projected state is an expected boundary outcome for deep chooseNStep continuation, not a missing mutation handler. |
| `unsupported-effect / production-preview-drive.previewStateSlots / unsupported preview surface "victoryCurrentMargin"` | 264 | (a) extend drive | Phase 2 | This is the Spec 184 root gap: aggregate-fed preview margin refs need a WASM-supported victory-margin surface instead of silently falling back to state features. |
| `agent-guided-completion / production-preview-drive.chooseN / only origin-seat greedy chooseN publication is supported` | 38 | (b) document unsupported | Phase 3 | Agent-guided chooseN completion exceeds the current bounded production preview-drive route; TS fallback remains the oracle. |
| `unsupported-effect / production-preview-drive.effect.popInterruptPhase / unsupported production preview-drive effect popInterruptPhase` | 14 | (b) document unsupported | Phase 3 | Interrupt-stack phase popping is not modeled by the current production preview-drive state patch path; TS fallback remains the oracle. |

Rollup count check: `1314 + 770 + 536 + 264 + 38 + 14 = 2936`.

## Phase 0 Inventory Rows

| ID | Count | Action / microturn | Profile | Preview ref / surface | WASM drive outcome | TS outcome | State-mutation shape | Seeds |
|---|---:|---|---|---|---|---|---|---|
| I001 | 406 | `coupArvnRedeployPolice` | `arvn-evolved` | shared scalar runtime bindings | unsupported `actionBatch` | TS fallback oracle | candidate batch needs deterministic shared scalar bindings before lowering | `1000 1001 1002 1003 1004 1005 1006 1007 1008 1009 1010 1011 1012 1013 1014` |
| I002 | 405 | `govern:chooseNStep:confirm` | `arvn-evolved` | deep projected state | unsupported `projectedState` | TS fallback oracle | terminal seat/turn boundary before WASM projected-state materialization | `1000 1001 1002 1003 1004 1005 1006 1007 1008 1009 1010 1011 1012 1013` |
| I003 | 401 | `coupArvnRedeployOptionalTroops` | `arvn-evolved` | shared scalar runtime bindings | unsupported `actionBatch` | TS fallback oracle | candidate batch needs deterministic shared scalar bindings before lowering | `1001 1002 1003 1004 1005 1006 1007 1008 1009 1010 1011 1012 1013 1014` |
| I004 | 255 | `govern` | `arvn-evolved` | card-event action route | unsupported `cardEventAction` | TS fallback oracle | card-event candidate not routed by production preview-drive | `1000 1001 1002 1003 1004 1006 1007 1008 1009 1010 1011 1012 1013` |
| I005 | 188 | `govern` | `arvn-evolved` | shared scalar runtime bindings | unsupported `actionBatch` | TS fallback oracle | candidate batch needs deterministic shared scalar bindings before lowering | `1000 1001 1002 1003 1004 1005 1006 1007 1008 1009 1010 1011 1012 1013` |
| I006 | 107 | `event` | `us-baseline` | card-event action route | unsupported `cardEventAction` | TS fallback oracle | card-event candidate not routed by production preview-drive | `1000 1001 1002 1003 1004 1005 1006 1007 1008 1009 1010 1011 1012 1013 1014` |
| I007 | 105 | `event` | `nva-baseline` | card-event action route | unsupported `cardEventAction` | TS fallback oracle | card-event candidate not routed by production preview-drive | `1000 1001 1002 1003 1004 1005 1006 1007 1008 1009 1010 1011 1012 1013 1014` |
| I008 | 103 | `rally` | `vc-baseline` | card-event action route | unsupported `cardEventAction` | TS fallback oracle | card-event candidate not routed by production preview-drive | `1000 1001 1002 1003 1004 1005 1006 1007 1008 1009 1010 1011 1012 1013 1014` |
| I009 | 100 | `coupRedeployPass` | `arvn-evolved` | shared scalar runtime bindings | unsupported `actionBatch` | TS fallback oracle | candidate batch needs deterministic shared scalar bindings before lowering | `1000 1001 1002 1003 1004 1005 1006 1007 1008 1009 1010 1011 1012 1013 1014` |
| I010 | 85 | `event` | `arvn-evolved` | card-event action route | unsupported `cardEventAction` | TS fallback oracle | card-event candidate not routed by production preview-drive | `1001 1004 1005 1006 1008 1009 1011 1014` |
| I011 | 58 | `govern:chooseNStep:add` | `arvn-evolved` | deep projected state | unsupported `projectedState` | TS fallback oracle | terminal seat/turn boundary before WASM projected-state materialization | `1003 1004 1008 1013` |
| I012 | 52 | `govern` | `arvn-evolved` | `preview.victory.currentMargin.*` (`victoryCurrentMargin`) | unsupported `previewStateSlots` | TS fallback oracle | missing victory-margin surface support in production preview-drive | `1000 1001 1002 1003 1004 1005 1006 1008 1009 1010 1011 1013` |
| I013 | 50 | `sweep` | `arvn-evolved` | card-event action route | unsupported `cardEventAction` | TS fallback oracle | card-event candidate not routed by production preview-drive | `1012 1014` |
| I014 | 48 | `coupAgitateVC` | `vc-baseline` | shared scalar runtime bindings | unsupported `actionBatch` | TS fallback oracle | candidate batch needs deterministic shared scalar bindings before lowering | `1000 1001 1003 1004 1005 1006 1007 1009 1010 1011 1012 1013 1014` |
| I015 | 46 | `coupPacifyUS` | `us-baseline` | shared scalar runtime bindings | unsupported `actionBatch` | TS fallback oracle | candidate batch needs deterministic shared scalar bindings before lowering | `1000 1001 1002 1003 1004 1005 1006 1007 1008 1009 1010 1011 1012 1013 1014` |
| I016 | 45 | `coupPacifyPass` | `arvn-evolved` | shared scalar runtime bindings | unsupported `actionBatch` | TS fallback oracle | candidate batch needs deterministic shared scalar bindings before lowering | `1003 1004 1005 1007 1009 1010 1011 1012 1014` |
| I017 | 44 | `coupCommitmentPass` | `arvn-evolved` | `preview.victory.currentMargin.*` (`victoryCurrentMargin`) | unsupported `previewStateSlots` | TS fallback oracle | missing victory-margin surface support in production preview-drive | `1000 1001 1002 1003 1004 1005 1006 1007 1008 1009 1010 1011 1012 1013 1014` |
| I018 | 44 | `event-decision:chooseNStep:add` | `arvn-evolved` | deep projected state | unsupported `projectedState` | TS fallback oracle | terminal seat/turn boundary before WASM projected-state materialization | `1006 1008 1009` |
| I019 | 42 | `train` | `arvn-evolved` | `preview.victory.currentMargin.*` (`victoryCurrentMargin`) | unsupported `previewStateSlots` | TS fallback oracle | missing victory-margin surface support in production preview-drive | `1000 1001 1003 1004 1006 1007 1008 1010 1011` |
| I020 | 34 | `coupArvnRedeployOptionalTroops` | `arvn-evolved` | `preview.victory.currentMargin.*` (`victoryCurrentMargin`) | unsupported `previewStateSlots` | TS fallback oracle | missing victory-margin surface support in production preview-drive | `1001 1002 1003 1004 1005 1006 1007 1008 1009 1010 1011 1012 1013 1014` |
| I021 | 34 | `train` | `arvn-evolved` | chooseN publication | unsupported `chooseN` | TS fallback oracle | agent-guided chooseN completion outside origin-seat greedy publication support | `1003 1008 1010` |
| I022 | 32 | `coupPacifyARVN` | `arvn-evolved` | `preview.victory.currentMargin.*` (`victoryCurrentMargin`) | unsupported `previewStateSlots` | TS fallback oracle | missing victory-margin surface support in production preview-drive | `1000 1001 1002 1004 1006 1008 1009 1010` |
| I023 | 30 | `coupPacifyARVN` | `arvn-evolved` | shared scalar runtime bindings | unsupported `actionBatch` | TS fallback oracle | candidate batch needs deterministic shared scalar bindings before lowering | `1000 1001 1002 1006 1008 1013` |
| I024 | 30 | `transport` | `arvn-evolved` | card-event action route | unsupported `cardEventAction` | TS fallback oracle | card-event candidate not routed by production preview-drive | `1000 1005 1006 1010` |
| I025 | 26 | `coupPacifyPass` | `arvn-evolved` | `preview.victory.currentMargin.*` (`victoryCurrentMargin`) | unsupported `previewStateSlots` | TS fallback oracle | missing victory-margin surface support in production preview-drive | `1000 1001 1002 1004 1006 1008 1009 1010 1013` |
| I026 | 24 | `coupArvnRedeployPolice` | `arvn-evolved` | `preview.victory.currentMargin.*` (`victoryCurrentMargin`) | unsupported `previewStateSlots` | TS fallback oracle | missing victory-margin surface support in production preview-drive | `1000 1004 1010` |
| I027 | 20 | `event` | `vc-baseline` | card-event action route | unsupported `cardEventAction` | TS fallback oracle | card-event candidate not routed by production preview-drive | `1001 1002 1004 1005 1006 1007 1008 1009 1010 1011` |
| I028 | 16 | `coupNvaRedeployTroops` | `nva-baseline` | shared scalar runtime bindings | unsupported `actionBatch` | TS fallback oracle | candidate batch needs deterministic shared scalar bindings before lowering | `1004 1008` |
| I029 | 16 | `train:chooseNStep:add` | `arvn-evolved` | deep projected state | unsupported `projectedState` | TS fallback oracle | terminal seat/turn boundary before WASM projected-state materialization | `1000 1001 1003 1004 1006 1007 1008 1009 1010 1011` |
| I030 | 15 | `sweep` | `arvn-evolved` | shared scalar runtime bindings | unsupported `actionBatch` | TS fallback oracle | candidate batch needs deterministic shared scalar bindings before lowering | `1014` |
| I031 | 13 | `train:chooseNStep:confirm` | `arvn-evolved` | deep projected state | unsupported `projectedState` | TS fallback oracle | terminal seat/turn boundary before WASM projected-state materialization | `1001 1003 1008 1010 1011` |
| I032 | 10 | `coupRedeployPass` | `arvn-evolved` | `preview.victory.currentMargin.*` (`victoryCurrentMargin`) | unsupported `previewStateSlots` | TS fallback oracle | missing victory-margin surface support in production preview-drive | `1000 1004 1008 1010` |
| I033 | 8 | `rally` | `vc-baseline` | shared scalar runtime bindings | unsupported `actionBatch` | TS fallback oracle | candidate batch needs deterministic shared scalar bindings before lowering | `1005 1006` |
| I034 | 7 | `ambushVc` | `vc-baseline` | card-event action route | unsupported `cardEventAction` | TS fallback oracle | card-event candidate not routed by production preview-drive | `1011 1012 1013 1014` |
| I035 | 6 | `coupPacifyARVN` | `arvn-evolved` | effect `popInterruptPhase` | unsupported `popInterruptPhase` | TS fallback oracle | interrupt-stack pop effect absent from production preview-drive state patch support | `1004` |
| I036 | 5 | `resolveHonoluluPacify` | `arvn-evolved` | effect `popInterruptPhase` | unsupported `popInterruptPhase` | TS fallback oracle | interrupt-stack pop effect absent from production preview-drive state patch support | `1004` |
| I037 | 5 | `train` | `arvn-evolved` | shared scalar runtime bindings | unsupported `actionBatch` | TS fallback oracle | candidate batch needs deterministic shared scalar bindings before lowering | `1009` |
| I038 | 5 | `train` | `arvn-evolved` | card-event action route | unsupported `cardEventAction` | TS fallback oracle | card-event candidate not routed by production preview-drive | `1011` |
| I039 | 5 | `transport` | `arvn-evolved` | shared scalar runtime bindings | unsupported `actionBatch` | TS fallback oracle | candidate batch needs deterministic shared scalar bindings before lowering | `1010` |
| I040 | 3 | `advise` | `us-baseline` | card-event action route | unsupported `cardEventAction` | TS fallback oracle | card-event candidate not routed by production preview-drive | `1001 1011 1012` |
| I041 | 3 | `advise` | `us-baseline` | chooseN publication | unsupported `chooseN` | TS fallback oracle | agent-guided chooseN completion outside origin-seat greedy publication support | `1003 1010` |
| I042 | 3 | `resolveHonoluluPacify` | `us-baseline` | effect `popInterruptPhase` | unsupported `popInterruptPhase` | TS fallback oracle | interrupt-stack pop effect absent from production preview-drive state patch support | `1010 1012 1014` |
| I043 | 1 | `patrol` | `us-baseline` | chooseN publication | unsupported `chooseN` | TS fallback oracle | agent-guided chooseN completion outside origin-seat greedy publication support | `1010` |
| I044 | 1 | `rally` | `nva-baseline` | shared scalar runtime bindings | unsupported `actionBatch` | TS fallback oracle | candidate batch needs deterministic shared scalar bindings before lowering | `1000` |

Inventory count check: all 44 rows sum to 2,936.

## Phase 1 Classification Table

| Inventory IDs | Count | Classification | Target phase | One-line rationale |
|---|---:|---|---|---|
| I012, I017, I019, I020, I022, I025, I026, I032 | 264 | (a) extend drive | 2 | `victoryCurrentMargin` is the aggregate-fed preview surface that caused Spec 184; WASM must materialize the projected margin instead of making `coalesce(preview, feature.selfMargin)` fall back. |
| I001, I003, I005, I009, I014, I015, I016, I023, I028, I030, I033, I037, I039, I044 | 1,314 | (b) document unsupported | 3 | Non-shared scalar runtime bindings are a boundedness/compilation limitation; retain null-return to TS fallback unless a later ticket deliberately broadens binding lowering. |
| I004, I006, I007, I008, I010, I013, I024, I027, I034, I038, I040 | 770 | (b) document unsupported | 3 | Card-event action routing remains outside the production preview-drive route and should be covered by the existing unsupported-reason parity path. |
| I002, I011, I018, I029, I031 | 536 | (b) document unsupported | 3 | Deep chooseNStep continuation reached an expected terminal/seat boundary before materializing a projected state; this is a documented fallback boundary, not a missing Phase 2 mutation handler. |
| I021, I041, I043 | 38 | (b) document unsupported | 3 | Agent-guided chooseN publication exceeds current origin-seat greedy support; retain fallback coverage. |
| I035, I036, I042 | 14 | (b) document unsupported | 3 | `popInterruptPhase` state-patch support is absent; keep it as an explicitly unsupported effect unless later evidence makes it a support target. |

Classification count check: `(a) 264 + (b) 2672 + (c) 0 = 2936`.

## Downstream Notes

- Ticket 002 owns Phase 2 support for `victoryCurrentMargin` rows and should add parity fixtures for the listed `(action / profile)` surface.
- Ticket 003 owns documentation and reason-coverage review for the `(b)` rows. Five `(b)` reason families already appear in `policy-wasm-preview-drive-equivalence-reason-coverage.test.ts` as of this commit: `projectedState`, `cardEventAction`, `actionBatch`, `chooseN`, and `popInterruptPhase`. Ticket 003 should verify comments and fixtures remain adequate rather than blindly duplicating coverage.
- No `(c) drive should already model this -- fix bug` rows were found in this run.
