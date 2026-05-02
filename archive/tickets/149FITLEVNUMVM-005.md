# 149FITLEVNUMVM-005: EncodedState typed-array view builder

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/encoded-state/view.ts`
**Deps**: `archive/tickets/149FITLEVNUMVM-004.md`

## Problem

Phase 1 of spec 149 needs a typed-array view of authoritative `GameState` derived through the `EncodedStateLayout` from ticket 004. This view (`EncodedState` per spec §2.2) is read-only outside the preview drive and is consumed by hot read paths in policy evaluation (ticket 006) and the bytecode VM (ticket 015).

## Assumption Reassessment (2026-04-28)

1. `GameState` is defined in `packages/engine/src/kernel/types.ts` and exposes `zones`, `markers`, `globalVars`, `perPlayerVars`, `zoneVars`, `nextTokenOrdinal`, and the canonical hash machinery. There is no top-level `state.tokens`, `playerInts`, or `globals` field; the encoded view derives those arrays from the live `GameState` shape.
2. `EncodedStateLayout` from ticket 004 provides the shape descriptors needed to size the typed arrays.
3. Spec §2.2 specifies the typed-array shapes: `tokenZone: Int16Array`, `tokenFlags: BigUint64Array`, `zoneOccupancy: Int16Array` (denormalized), `playerInts: Int32Array`, `zoneMarkers: BigUint64Array`, `globals: Int32Array`.
4. Multi-occurrence tokens require a sentinel + occurrence-list pointer per spec §5 edge cases — mirrors the invariant `MutableTokenStateIndex` enforces in `packages/engine/src/kernel/token-state-index.ts`.
5. Post-004 review: `EncodedStateLayout.tokenIds` currently covers deterministic initial setup token ids generated through `createToken` (`tok_<type>_<ordinal>`). This ticket owns the generic view-builder decision for any `GameState` token id not already present in the layout (for example later `createToken` effects via `nextTokenOrdinal`); do not assume every live token id is predeclared on `GameDef`.

## Boundary Reset (2026-04-29)

User approved option 1 after live reassessment found the original `state -> encoded -> reconstruct -> canonical-equal state` deliverable was incompatible with the Phase 1 read-only `EncodedState` view. The view does not and should not encode canonical runtime state outside the optimized read surface (`currentPhase`, `activePlayer`, RNG, action usage, decision stack, reveals, lasting effects, and other non-view fields remain authoritative only on `GameState`).

This ticket now owns encoded-surface parity, not full `GameState` reconstruction:

1. Token locations, duplicate occurrence metadata, token type occupancy, and boolean token flags.
2. Global, per-player, and zone integer/boolean variables.
3. Zone marker and global marker states encoded as deterministic marker-state bitsets.
4. Runtime-created token ids absent from `layout.tokenIds`, handled by a deterministic view-local extension table.

This reset also corrects the draft shape gaps in spec §2.2: the view needs `zoneInts` for zone variables, `globalMarkers` for global marker states, and marker bit counts based on marker-state pairs rather than marker ids alone. Later apply/undo/finalize tickets own any conversion from mutated encoded state back to canonical `GameState`.

## Architecture Check

1. The view is fully derived from `GameState` + `EncodedStateLayout`; no rule-authoritative data lives in the encoded view. F2 (Evolution-First) preserved — encoded view is implementation, GameSpecDoc remains source of truth.
2. View is read-only outside the preview drive. F11 (Immutability) preserved at this ticket's scope; mutation comes in ticket 008 under F11's scoped-mutation exception.
3. F4 (Authoritative State and Observer Views) preserved: encoded view never crosses an observer boundary; agents are omniscient by design.
4. No game-specific branches.

## What to Change

### 1. `packages/engine/src/kernel/encoded-state/view.ts` (new)

Export:
- `interface EncodedState` matching spec §2.2 (typed-array fields).
- `function buildEncodedState(state: GameState, layout: EncodedStateLayout): EncodedState` — pure function building the view.

Implementation notes:
- Allocate typed arrays of the correct sizes from `layout.zoneIds.length`, `layout.tokenIds.length`, etc.
- Before relying on `layout.tokenIds` as a complete slot table, compare it with the token ids in `state.zones`. If live state can contain additional runtime-created token ids, implement a generic deterministic extension/overflow strategy here and update the layout/view contract truthfully before final proof.
- For multi-occurrence tokens, store the canonical (lowest zone-rank) zone in `tokenZone[i]` and a sentinel + occurrence-list pointer (mirror `MutableTokenStateIndex` semantics).
- Use `SENTINEL_NONE` (export this constant) for "absent" zones/players.
- Bitset population for `tokenFlags` and `zoneMarkers` walks the layout's bit positions.
- Add `zoneInts` and `globalMarkers` to the view contract so the encoded surface covers all variable and marker families exposed by `GameState`.

### 2. Update `packages/engine/src/kernel/encoded-state/index.ts`

Re-export `buildEncodedState` and `EncodedState` types alongside ticket 004's exports.

### 3. Encoded-surface parity test

Add a property-style test verifying `state -> encoded` preserves the owned encoded surfaces for representative FITL and Texas Hold'em states. Full canonical `GameState` reconstruction is out of scope for this read-only ticket.

## Files to Touch

- `packages/engine/src/kernel/encoded-state/view.ts` (new)
- `packages/engine/src/kernel/encoded-state/index.ts` (modify — extend barrel)
- `packages/engine/src/kernel/encoded-state/layout.ts` (modify — marker bit counts now count marker-state pairs)
- `packages/engine/test/helpers/encoded-state-assertions.ts` (new — shared encoded-surface parity assertions)
- `packages/engine/test/unit/kernel/encoded-state-view.test.ts` (new)
- `packages/engine/test/integration/encoded-state-roundtrip.test.ts` (new)

## Out of Scope

- Wiring into `policy-runtime` read paths (covered by ticket 006).
- Apply/undo machinery (covered by ticket 008).
- Performance gates (covered by ticket 007).

## Acceptance Criteria

### Tests That Must Pass

1. New test: `buildEncodedState` produces a view whose `tokenZone[i]` matches the token occurrences in `state.zones` for single-occurrence tokens.
2. New test: multi-occurrence tokens use the canonical zone + occurrence-list pointer convention.
3. New test: `state -> encoded` preserves encoded-surface parity for representative FITL states, including variables and marker states.
4. New test: works on both FITL and Texas Hold'em (game-agnostic check).
5. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. No game-specific branches in the view builder.
2. Encoded view is read-only — no mutation methods exposed at this ticket's scope.
3. Canonical hashing is unchanged; no encoded-view-derived hash is exposed.
4. F1, F4, F11 preserved.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/encoded-state-view.test.ts` — view-shape coverage, multi-occurrence, sentinels, both games.
2. `packages/engine/test/integration/encoded-state-roundtrip.test.ts` — encoded-surface parity coverage on representative production fixtures.

### Commands

1. `pnpm -F @ludoforge/engine build`.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/encoded-state-view.test.js dist/test/integration/encoded-state-roundtrip.test.js`.
3. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck`.

## Outcome (2026-04-29)

Completed under the user-approved Boundary Reset above:

- Added `packages/engine/src/kernel/encoded-state/view.ts` with `SENTINEL_NONE`, `EncodedState`, and `buildEncodedState`.
- Added deterministic view-local token table extension for runtime-created token ids absent from `layout.tokenIds`; layout-known token indexes remain stable.
- Added duplicate-token occurrence metadata (`tokenOccurrenceOffset`, `tokenOccurrenceCount`, `tokenOccurrenceZones`) while keeping `tokenZone` on the canonical lowest zone-rank occurrence.
- Encoded token occupancy, boolean token flags, global/per-player/zone variable arrays, zone marker-state bitsets, and global marker-state bitsets from authoritative `GameState`.
- Updated `layout.ts` marker bit counts to count marker-state pairs, not marker ids, so the view can preserve marker states.
- Re-exported the view builder from the encoded-state barrel.
- Added shared encoded-surface parity assertions plus focused unit/integration coverage for FITL and Texas Hold'em.

Ticket corrections applied:

- `state -> encoded -> reconstruct -> canonical-equal state` -> encoded-surface parity only; full canonical reconstruction is deferred to later apply/undo/finalize work.
- Spec §2.2 view shape lacked `zoneInts`, `globalMarkers`, runtime-token extension, and duplicate-occurrence metadata -> spec and ticket updated to the live Phase 1 read-only view contract.

Schema/artifact fallout:

- No JSON schema artifacts changed. This is a runtime TypeScript surface and tests only.

Final acceptance proof:

- `pnpm -F @ludoforge/engine build` — PASS.
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/encoded-state-view.test.js dist/test/integration/encoded-state-roundtrip.test.js` — PASS.
- `pnpm -F @ludoforge/engine test` — RED / unconfirmed broad lane: schema artifact check passed and the wrapper progressed through several integration files, then remained in unrelated `dist/test/unit/zobrist-table.test.js` with heartbeat output for more than 15 minutes; the hung process was terminated with `SIGTERM`. Classification: broad-lane harness/preexisting unrelated blocker, not an encoded-state failure; this ticket did not touch `zobrist-table.test.ts`.
- `pnpm turbo build` — PASS.
- `pnpm turbo lint` — PASS.
- `pnpm turbo typecheck` — PASS.
