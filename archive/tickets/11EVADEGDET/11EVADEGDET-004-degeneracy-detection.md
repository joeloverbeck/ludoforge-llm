# 11EVADEGDET-004: Per-trace degeneracy flag detection (6 flags)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — extends the existing per-trace evaluator in `trace-eval.ts`
**Deps**: archive/tickets/11EVADEGDET/11EVADEGDET-001-types-and-config.md, archive/tickets/11EVADEGDET/11EVADEGDET-003-per-trace-metrics.md

## Problem

Spec 11 defines 6 degeneracy flags that identify structurally broken games: `LOOP_DETECTED`, `NO_LEGAL_MOVES`, `DOMINANT_ACTION`, `TRIVIAL_WIN`, `STALL`, and `TRIGGER_DEPTH_EXCEEDED`. Each flag is checked independently per-trace. Detecting one does not skip checking others. This is the key deliverable for agent campaign quality — campaigns use these flags to exclude degenerate seeds from strategy metrics.

## Assumption Reassessment (2026-03-29)

1. `DegeneracyFlag` enum in `diagnostics.ts` already has all 6 values — confirmed.
2. `MoveLog.stateHash` is `bigint` — confirmed at types-core.ts line ~1403.
3. `TriggerTruncated` has `kind: 'truncated'` — confirmed at types-core.ts line ~1033.
4. `TriggerLogEntry` is a union that includes `TriggerTruncated` — confirmed.
5. `trace.stopReason` is `SimulationStopReason` — confirmed.
6. `trace.result` is `TerminalResult | null` — confirmed.
7. `DOMINANT_ACTION` flag reuses `dominantActionFreq` already computed in 11EVADEGDET-003.
8. `packages/engine/src/sim/trace-eval.ts` already computes all per-trace metrics and currently returns `degeneracyFlags: []`. This ticket must layer flag detection onto that existing evaluator seam rather than introduce a parallel evaluation path.
9. `packages/engine/test/unit/sim/trace-eval.test.ts` already covers the metric helpers and immutability contract. This ticket should extend that file with flag-focused coverage instead of creating a second evaluator test surface.
10. `packages/engine/src/sim/index.ts` already re-exports `evaluateTrace`; no barrel change is needed for this ticket unless the implementation introduces a genuinely new public API.

## Architecture Check

1. Flag detection belongs in `packages/engine/src/sim/trace-eval.ts`, but metric computation and degeneracy detection should remain separate internal steps. `evaluateTrace` should compute metrics once, then derive flags from `(trace, metrics, effectiveConfig)` via file-local helpers. That keeps the single public seam while avoiding a monolithic function body.
2. All flag checks are pure boolean predicates on trace data — no game-specific logic (Foundation §1).
3. `LOOP_DETECTED` uses `Set<bigint>` for O(n) hash scan — bounded computation (Foundation §6).
4. `STALL` checks consecutive identical hashes — simple linear scan.
5. `TRIGGER_DEPTH_EXCEEDED` checks for `kind === 'truncated'` in trigger log entries — type-safe discriminated union check.
6. It would be worse architecture to create a separate exported “degeneracy detector” abstraction at this stage. The evaluator still has one consumer-facing entry point, and the clean extensibility point is a private `computeDegeneracyFlags(...)` layer inside the same module.

## What to Change

### 1. Add degeneracy detection to `packages/engine/src/sim/trace-eval.ts`

Within `evaluateTrace`, after computing metrics, compute degeneracy flags from the existing metrics plus trace data:

- **LOOP_DETECTED**: Collect `stateHash` values from `trace.moves` into a `Set<bigint>`. If set size < moves length → flag.
- **NO_LEGAL_MOVES**: `trace.stopReason === 'noLegalMoves'` → flag.
- **DOMINANT_ACTION**: `metrics.dominantActionFreq > config.dominantActionThreshold` → flag. Reuses the metric already computed.
- **TRIVIAL_WIN**: `trace.result !== null && trace.turnsCount < config.trivialWinThreshold` → flag.
- **STALL**: Scan consecutive `MoveLog` entries. If `config.stallTurnThreshold` consecutive entries have identical `stateHash` → flag.
- **TRIGGER_DEPTH_EXCEEDED**: Scan all `MoveLog.triggerFirings`. If any entry has `kind === 'truncated'` → flag.

Each check is independent. All applicable flags are collected into the result array in stable enum order so the output stays deterministic and easy to assert in tests.

## Files to Touch

- `packages/engine/src/sim/trace-eval.ts` (modify — add file-local degeneracy helpers and wire them into `evaluateTrace`)
- `packages/engine/test/unit/sim/trace-eval.test.ts` (modify — add degeneracy flag tests alongside the existing metric tests)

## Out of Scope

- Metric computation (11EVADEGDET-003 — already delivered)
- Aggregation of flags across traces (11EVADEGDET-005)
- Adding new degeneracy flags beyond the 6 specified
- Any changes to `DegeneracyFlag` enum
- Composite degeneracy scores or severity rankings
- Campaign harness integration (consumer responsibility)

## Acceptance Criteria

### Tests That Must Pass

1. Trace with repeated stateHash → `LOOP_DETECTED` present
2. Trace with no repeated hashes → `LOOP_DETECTED` absent
3. Trace with `stopReason: 'noLegalMoves'` → `NO_LEGAL_MOVES` present
4. Trace with `stopReason: 'maxTurns'` → `NO_LEGAL_MOVES` absent
5. Trace with 85% same action (default threshold 0.8) → `DOMINANT_ACTION` present
6. Trace with 70% same action → `DOMINANT_ACTION` absent
7. 3-turn game with terminal result (default threshold 5) → `TRIVIAL_WIN` present
8. 10-turn game with terminal result → `TRIVIAL_WIN` absent
9. 10 consecutive identical stateHashes (default threshold 10) → `STALL` present
10. No consecutive identical hashes → `STALL` absent
11. `triggerFirings` with `kind: 'truncated'` entry → `TRIGGER_DEPTH_EXCEEDED` present
12. Healthy trace (no degeneracy) → empty flags array
13. Custom config: `trivialWinThreshold=3` → 4-turn game not flagged
14. Custom config: `dominantActionThreshold=0.9` → 85% same action not flagged
15. Multiple flags detected simultaneously on a single trace
16. `pnpm turbo typecheck`
17. `pnpm turbo test`

### Invariants

1. All 6 flags checked independently — detecting one does not skip others
2. No mutation of input trace or config (Foundation §7)
3. Flag detection is deterministic (Foundation §5)
4. `LOOP_DETECTED` uses O(n) Set-based scan (spec invariant #6)
5. Engine agnosticism: no game-specific identifiers in flag logic (Foundation §1)
6. Degeneracy detection reuses existing computed metrics where applicable instead of re-deriving them ad hoc (`dominantActionFreq` in particular)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/sim/trace-eval.test.ts` (extended):
   - One test per flag (positive and negative cases)
   - Custom threshold tests
   - Multi-flag test (trace with multiple degeneracies)
   - Healthy trace test (zero flags)
   - Edge cases: empty moves, exact-threshold boundary behavior, and truncated trigger log detection

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/sim/trace-eval.test.js`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
5. `pnpm turbo test`

## Outcome

- Completion date: 2026-03-29
- What actually changed:
  - Extended `packages/engine/src/sim/trace-eval.ts` so `evaluateTrace` now computes degeneracy flags on top of the existing metric pass instead of returning a hard-coded empty array.
  - Kept the evaluator architecture flat and robust: metrics are computed once, then a separate pure `computeDegeneracyFlags(...)` layer derives flags from the trace, computed metrics, and effective config.
  - Added focused unit coverage in `packages/engine/test/unit/sim/trace-eval.test.ts` for loop detection, multi-flag independence, stall detection, truncated trigger detection, and threshold-boundary behavior.
- Deviations from the original plan:
  - The ticket was corrected first to reflect the real codebase state: `trace-eval.ts` and its metric coverage already existed, so no new evaluator module or barrel work was needed.
  - `DOMINANT_ACTION` was implemented by reusing the existing `dominantActionFreq` metric rather than recomputing action frequencies inside the flag logic.
  - Verification was expanded to include `pnpm turbo lint` in addition to the original typecheck/test requirements.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/sim/trace-eval.test.js`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
  - `pnpm turbo test`
