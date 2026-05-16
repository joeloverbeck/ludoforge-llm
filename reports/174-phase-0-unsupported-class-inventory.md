# Spec 174 Phase 0 Unsupported Preview-Drive Class Inventory

**Date**: 2026-05-15
**Ticket**: `archive/tickets/174WASMDEEPPRV-001.md`
**Spec**: `specs/174-wasm-preview-drive-coverage-extension.md`
**Trigger witness**: `reports/fitl-arvn-15-seed-decomposition-2026-05-15-post-008-final.md`

## Summary

The post-008 witness shows the remaining slow tier is dominated by `continuedDeepening` preview branches. The hottest slow-tier axes are `train:chooseNStep:add`, `train:chooseNStep:confirm`, `coupArvnRedeployPolice:chooseOne`, `govern:chooseNStep:confirm`, and `govern:chooseNStep:add`; all five are reported under `continuedDeepening`.

The live WASM preview-drive gap has two layers:

- **Broad phase**: `policy-wasm-score-routing.ts` already calls `evaluateProductionPreviewDriveBatchWithWasm` for preview candidate-feature rows, but fail-closes when the production preview-drive compiler or WASM runtime returns unsupported.
- **Deep phase**: `policy-preview-inner-deepening.ts` `runDeepPass` does not invoke the WASM preview-drive route today; it continues through the TypeScript `continueChooseNStepInnerPreviewDrive` path per option.

Ticket 001 adds production preview-drive route and unsupported counters only. It does not increment those counters from dispatch sites; Phase 3 activation owns that wiring after tickets 002-007 prove ABI and parity coverage.

## Source Surfaces

| Surface | Live owner | Current behavior |
|---|---|---|
| Broad-phase candidate feature rows | `packages/engine/src/agents/policy-wasm-score-routing.ts` | Calls `evaluateProductionPreviewDriveBatchWithWasm`; records candidate-feature row counters; fail-closes on unsupported preview refs or unsupported preview-drive result classes. |
| Production preview-drive compiler | `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` | Lowers supported preview-drive input into WASM IR; returns stable unsupported reason strings for unsupported generic shapes. |
| WASM runtime preview-drive bridge | `packages/engine/src/agents/policy-wasm-runtime.ts` | Converts WASM status `-14` into `unsupported preview-drive class <class>` based on the first unsupported step. |
| Deep-phase inner deepening | `packages/engine/src/agents/policy-preview-inner-deepening.ts` | Bypasses WASM and uses the TypeScript deepening driver. |

## Broad-Phase Fail-Closed Reasons

| Emitting surface | Reason string / detail value | Unsupported class | Owner | Attribution | Follow-up owner |
|---|---|---|---|---|---|
| `policy-wasm-score-routing.ts` | `unsupported preview-drive ref` | not returned by production compiler | preview ref collection | Broad phase | `174WASMDEEPPRV-002` for signal carriers when the ref is an F20 carrier; otherwise `174WASMDEEPPRV-004` for preview-state slot coverage. |
| `policy-wasm-score-routing.ts` | `${result.reason}` from `evaluateProductionPreviewDriveBatchWithWasm` | `result.unsupportedDriveClass` | `result.unsupportedOwner` | Broad phase | Determined by the production preview-drive reason table below. |
| `policy-wasm-runtime.ts` | `unsupported preview-drive class <class>` | first unsupported WASM step class | first unsupported WASM step owner | Broad phase runtime bridge | Same owner as the first unsupported step; tickets 002-006 extend the ABI before Phase 3 activation consumes it. |

## Production Preview-Drive Reason Table

| Reason string emitted today | Unsupported class | Owner | Attribution | Follow-up owner |
|---|---|---|---|---|
| `production preview-drive requires at least one candidate` | `unknown` | `production-preview-drive` | Broad phase input validation | `174WASMDEEPPRV-005` if caused by grouping/batch construction; otherwise Phase 3 route activation guard in `174WASMDEEPPRV-008`. |
| `production preview-drive requires at least one scalar preview-state slot` | `unsupported-effect` | `production-preview-drive.previewStateSlots` | Broad phase preview-state materialization | `174WASMDEEPPRV-004` |
| `unsupported preview-state slot "<slot>"` | `unsupported-effect` | `production-preview-drive.previewStateSlots` | Broad phase preview-state materialization | `174WASMDEEPPRV-004` |
| `production preview-drive supports one shared action program per batch` | `unsupported-effect` | `production-preview-drive.actionBatch` | Broad phase candidate grouping | `174WASMDEEPPRV-005` |
| `action "<actionId>" has no generic production definition` | `unsupported-effect` | `action:<actionId>` | Broad phase action lowering | `174WASMDEEPPRV-003` for publication shape when the action is otherwise generic; otherwise residual Phase 3 unsupported classification in `174WASMDEEPPRV-008`. |
| `production preview-drive requires deterministic shared scalar runtime bindings` | `unsupported-effect` | `production-preview-drive.actionBatch` | Broad phase candidate grouping / binding publication | `174WASMDEEPPRV-005` |
| `unsupported preview-state feature "<featureId>"` | `unsupported-effect` | `production-preview-drive.previewStateSlots` | Broad phase preview-state materialization | `174WASMDEEPPRV-004` |
| `unsupported preview surface "<surfaceFamily>"` | `unsupported-effect` | `production-preview-drive.previewStateSlots` | Broad phase preview-state materialization | `174WASMDEEPPRV-004` |
| `only deterministic integer zoneVar addVar effects are supported` | `unsupported-effect` | `production-preview-drive.addVar` | Broad phase effect lowering | `174WASMDEEPPRV-004` when slot/state publication is missing; otherwise `174WASMDEEPPRV-006` when completion semantics need the value across deepening iterations. |
| `only matching global scalar addVar effects are supported` | `unsupported-effect` | `production-preview-drive.addVar` | Broad phase effect lowering | `174WASMDEEPPRV-004` |
| `only deterministic integer addVar deltas are supported` | `unsupported-effect` | `production-preview-drive.addVar` | Broad phase effect lowering | `174WASMDEEPPRV-004` |
| `only deterministic integer zoneVar setVar effects are supported` | `unsupported-effect` | `production-preview-drive.setVar` | Broad phase effect lowering | `174WASMDEEPPRV-004` |
| `only matching global scalar setVar effects are supported` | `unsupported-effect` | `production-preview-drive.setVar` | Broad phase effect lowering | `174WASMDEEPPRV-004` |
| `only deterministic integer setVar values are supported` | `unsupported-effect` | `production-preview-drive.setVar` | Broad phase effect lowering | `174WASMDEEPPRV-004` |
| `only deterministic scalar setMarker effects are supported` | `unsupported-effect` | `production-preview-drive.effect.setMarker` | Broad phase effect lowering | `174WASMDEEPPRV-004` |
| `setMarker state must be present in the generic marker lattice` | `unsupported-effect` | `production-preview-drive.effect.setMarker` | Broad phase effect lowering | `174WASMDEEPPRV-004` |
| `only deterministic scalar shiftMarker effects are supported` | `unsupported-effect` | `production-preview-drive.effect.shiftMarker` | Broad phase effect lowering | `174WASMDEEPPRV-004` |
| `only deterministic scalar moveToken effects are supported` | `unsupported-effect` | `production-preview-drive.effect.moveToken` | Broad phase effect lowering | `174WASMDEEPPRV-003` for publication identity plus `174WASMDEEPPRV-004` for state-slot publication. |
| `only deterministic scalar moveAll effects are supported` | `unsupported-effect` | `production-preview-drive.effect.moveAll` | Broad phase effect lowering | `174WASMDEEPPRV-003` / `174WASMDEEPPRV-004` |
| `only deterministic scalar setTokenProp effects are supported` | `unsupported-effect` | `production-preview-drive.effect.setTokenProp` | Broad phase effect lowering | `174WASMDEEPPRV-004` |
| `only deterministic non-negative removeByPriority budgets are supported` | `unsupported-effect` | `production-preview-drive.effect.removeByPriority` | Broad phase completion/effect lowering | `174WASMDEEPPRV-006` |
| `only deterministic scalar removeByPriority groups are supported` | `unsupported-effect` | `production-preview-drive.effect.removeByPriority` | Broad phase candidate grouping | `174WASMDEEPPRV-005` |
| `removeByPriority groups must resolve token ids` | `unsupported-effect` | `production-preview-drive.effect.removeByPriority` | Broad phase candidate grouping / publication identity | `174WASMDEEPPRV-003` / `174WASMDEEPPRV-005` |
| `removeByPriority groups must move uniquely resolved tokens` | `unsupported-effect` | `production-preview-drive.effect.removeByPriority` | Broad phase candidate grouping / state publication | `174WASMDEEPPRV-004` / `174WASMDEEPPRV-005` |
| `only origin-seat greedy chooseOne publication is supported` | `agent-guided-completion` | `production-preview-drive.chooseOne` | Broad phase completion publication | `174WASMDEEPPRV-006` |
| `only deterministic scalar chooseOne options are supported` | `unsupported-effect` | `production-preview-drive.chooseOne` | Broad phase decision publication | `174WASMDEEPPRV-003` |
| `only origin-seat greedy chooseN publication is supported` | `agent-guided-completion` | `production-preview-drive.chooseN` | Broad phase completion publication | `174WASMDEEPPRV-006` |
| `only deterministic scalar chooseN options are supported` | `unsupported-effect` | `production-preview-drive.chooseN` | Broad phase decision-stack publication | `174WASMDEEPPRV-003` |
| `only deterministic integer chooseN bounds are supported` | `unsupported-effect` | `production-preview-drive.chooseN` | Broad phase decision-stack publication | `174WASMDEEPPRV-003` |
| `chooseN bounds must be deterministic non-negative integers` | `unsupported-effect` | `production-preview-drive.chooseN` | Broad phase decision-stack publication | `174WASMDEEPPRV-003` |
| `only deterministic scalar if conditions are supported` | `unsupported-effect` | `production-preview-drive.effect.if` | Broad phase effect lowering | `174WASMDEEPPRV-002` when the condition depends on F20 signal carriers; otherwise `174WASMDEEPPRV-004`. |
| `only deterministic scalar let bindings are supported` | `unsupported-effect` | `production-preview-drive.effect.let` | Broad phase effect lowering | `174WASMDEEPPRV-004` |
| `only deterministic scalar forEach queries are supported` | `unsupported-effect` | `production-preview-drive.effect.forEach` | Broad phase effect lowering | `174WASMDEEPPRV-005` when the query is group-shaped; otherwise `174WASMDEEPPRV-004`. |
| `only deterministic non-negative forEach limits are supported` | `unsupported-effect` | `production-preview-drive.effect.forEach` | Broad phase bounded iteration | `174WASMDEEPPRV-006` |
| `unsupported production preview-drive effect <effectKind>` | `unsupported-effect` | `production-preview-drive.effect.<effectKind>` | Broad phase residual effect lowering | Residual Phase 1 surface closest to the effect shape: 002 signal carriers, 003 publication, 004 state slots, 005 grouping, or 006 completion semantics. |

## Deep-Phase Attribution

`runDeepPass` in `policy-preview-inner-deepening.ts` currently routes every `continuedDeepening` option through TypeScript. Therefore the deep phase has no live WASM fail-closed reason string today; its current unsupported class is the absence of a production WASM dispatch boundary. `174WASMDEEPPRV-008` records this as explicit unsupported deep-route telemetry; the prerequisite state-patch/materialization ABI owner is `174WASMDEEPPRV-012`, and the real deep activation owner remains `174WASMDEEPPRV-011`.

The post-008 witness classes that make the deep-phase route material are:

| Witness class | Preview branch | Decisions in slow tier | Total ms in slow tier | Phase owner |
|---|---|---:|---:|---|
| `train:chooseNStep:add` | `continuedDeepening` | 33 | 54546.24 | `174WASMDEEPPRV-003`, `174WASMDEEPPRV-005`, `174WASMDEEPPRV-006`, `174WASMDEEPPRV-008` telemetry, `174WASMDEEPPRV-012` state-patch ABI, then `174WASMDEEPPRV-011` materialized-state activation |
| `train:chooseNStep:confirm` | `continuedDeepening` | 35 | 39527.73 | `174WASMDEEPPRV-003`, `174WASMDEEPPRV-005`, `174WASMDEEPPRV-006`, `174WASMDEEPPRV-008` telemetry, `174WASMDEEPPRV-012` state-patch ABI, then `174WASMDEEPPRV-011` materialized-state activation |
| `coupArvnRedeployPolice:chooseOne` | `continuedDeepening` | 52 | 24104.97 | `174WASMDEEPPRV-003`, `174WASMDEEPPRV-004`, `174WASMDEEPPRV-006`, `174WASMDEEPPRV-008` telemetry, `174WASMDEEPPRV-012` state-patch ABI, then `174WASMDEEPPRV-011` materialized-state activation |
| `govern:chooseNStep:confirm` | `continuedDeepening` | 25 | 12791.11 | `174WASMDEEPPRV-003`, `174WASMDEEPPRV-005`, `174WASMDEEPPRV-006`, `174WASMDEEPPRV-008` telemetry, `174WASMDEEPPRV-012` state-patch ABI, then `174WASMDEEPPRV-011` materialized-state activation |
| `govern:chooseNStep:add` | `continuedDeepening` | 35 | 11820.45 | `174WASMDEEPPRV-003`, `174WASMDEEPPRV-005`, `174WASMDEEPPRV-006`, `174WASMDEEPPRV-008` telemetry, `174WASMDEEPPRV-012` state-patch ABI, then `174WASMDEEPPRV-011` materialized-state activation |

## Counter Wiring Status

Ticket 001 adds these generic counters in `policy-wasm-runtime.ts`:

- `productionPreviewDriveRouteCount`
- `productionPreviewDriveUnsupportedCount`
- `recordProductionPolicyWasmPreviewDrive(kind: 'supported' | 'unsupported')`
- `getProductionPolicyWasmPreviewDriveRouteCount()`
- `getProductionPolicyWasmPreviewDriveUnsupportedCount()`

Dispatch callsites intentionally remain unchanged in this phase. Phase 3a activation telemetry (`174WASMDEEPPRV-008`) owns calling `recordProductionPolicyWasmPreviewDrive(...)` from broad-phase supported batches and deep-phase unsupported fallback sites, so fallback success cannot be mistaken for route activation. Phase 3b prerequisite (`174WASMDEEPPRV-012`) owns the state-patch/materialization ABI, and Phase 3b (`174WASMDEEPPRV-011`) owns true deep materialized-state activation.
