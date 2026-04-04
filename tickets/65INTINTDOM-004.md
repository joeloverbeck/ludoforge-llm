# 65INTINTDOM-004: Serialization boundary (extern/intern functions)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — sim/ (trace output), agents/ (decision traces), kernel diagnostics
**Deps**: `archive/tickets/65INTINTDOM-003.md`

## Problem

With integer ZoneIds internally, all output boundaries — trace JSON, agent decision traces, diagnostic messages, error messages — must convert integer IDs back to human-readable string names. Without this, traces become unreadable (`zone 42` instead of `kien-giang-an-xuyen:none`) and downstream consumers (runner, analytics) break.

## Assumption Reassessment (2026-04-03)

1. `intern.ts` with `extern*`/`intern*` helpers is created in ticket 001 but not integrated anywhere.
2. Trace output is in `packages/engine/src/sim/` — `delta.ts`, `simulator.ts`, `snapshot.ts`.
3. Agent decision traces are in `packages/engine/src/agents/` — `policy-eval.ts`, `policy-agent.ts`, `policy-runtime.ts`.
4. Diagnostic/error messages throughout kernel use string interpolation with ZoneId values — these will show integers without conversion.
5. `PlayerId` is already integer but has no extern function — it needs one for I/O boundary consistency.

## Architecture Check

1. The serialization boundary pattern is clean: kernel operates on integers internally, conversion to strings happens only at I/O boundaries. This is the same pattern as database systems (internal row IDs vs display values).
2. The `InternTable` is passed to extern functions — no global state, no singletons. Foundation 8 (Determinism) preserved.
3. No game-specific logic in extern/intern functions — they're generic lookups in the intern table. Foundation 1 (Engine Agnosticism) preserved.

## What to Change

### 1. Integrate extern functions at trace output boundaries

In `packages/engine/src/sim/`, identify all points where ZoneId values are serialized to JSON traces. Wrap with `externZoneId(id, def.internTable)` calls. Key files: `delta.ts`, `simulator.ts`, `snapshot.ts`.

### 2. Integrate extern functions in agent decision traces

In `packages/engine/src/agents/`, agent evaluation traces include zone references for move descriptions and candidate scoring. Wrap ZoneId outputs with extern calls. Key files: `policy-eval.ts`, `policy-agent.ts`.

### 3. Integrate extern functions in diagnostic/error messages

Grep for template literals and string interpolation involving ZoneId in kernel code. Diagnostic messages (warnings, errors, validation failures) must use extern functions for readability.

### 4. Add PlayerId extern/intern entry

`PlayerId` is already integer but needs an intern table entry for string↔number conversion at I/O boundaries (player names in traces, agent output). Add `externPlayerId` integration at the same output boundaries.

### 5. Verify trace format compatibility

Ensure serialized traces use string zone names (via extern), not integer indices. The runner and analytics tools consume string-based traces — this must not break.

## Files to Touch

- `packages/engine/src/kernel/intern.ts` (modify) — add integration helpers if needed
- `packages/engine/src/sim/delta.ts` (modify) — extern at trace output
- `packages/engine/src/sim/simulator.ts` (modify) — extern at trace output
- `packages/engine/src/sim/snapshot.ts` (modify) — extern at snapshot serialization
- `packages/engine/src/agents/policy-eval.ts` (modify) — extern in decision traces
- `packages/engine/src/agents/policy-agent.ts` (modify) — extern in agent output
- Kernel files with diagnostic messages referencing ZoneId (modify)

## Out of Scope

- Runner migration (ticket 005) — runner gets integer IDs directly, not via trace serialization
- ActionId/PhaseId/SeatId extern functions (ticket 007) — only ZoneId and PlayerId in this ticket
- Variable name interning (ticket 009)

## Acceptance Criteria

### Tests That Must Pass

1. Serialized traces contain string zone names, not integer indices
2. Agent decision traces contain human-readable zone names
3. Error/diagnostic messages contain human-readable zone names
4. FITL simulation produces a valid trace that the runner can consume
5. Existing suite: `pnpm turbo test`

### Invariants

1. The kernel NEVER calls extern/intern during computation — only at I/O boundaries
2. Trace JSON format is unchanged from the consumer's perspective (string zone names)
3. `intern(extern(id, table), table) === id` for all IDs at every boundary

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/sim/trace-serialization.test.ts` — verify trace output uses string zone names
2. `packages/engine/test/integration/fitl-trace-roundtrip.test.ts` — compile FITL, run simulation, verify trace contains string zone names

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`
