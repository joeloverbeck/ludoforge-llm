# 112GLBMRKPOLSUR-005: Cookbook documentation and FITL integration test

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — documentation and tests only
**Deps**: `archive/tickets/112GLBMRKPOLSUR-004.md`, `specs/112-global-marker-policy-surface.md`

## Problem

The agent DSL cookbook doesn't document `globalMarker.*` as a reference family. Without documentation, LLM-driven agent evolution won't discover or use capability-based state features. An integration test is also needed to verify the full pipeline works end-to-end with FITL game data.

## Assumption Reassessment (2026-04-05)

1. Cookbook at `docs/agent-dsl-cookbook.md` has a Reference Paths table starting around line 27 — confirmed.
2. FITL has `globalMarkerLattices` defined (e.g., `cap_boobyTraps` with states `inactive`, `shaded`, `unshaded`) — confirmed via `data/games/fire-in-the-lake/40-content-data-assets.md`.
3. FITL observability config at `data/games/fire-in-the-lake/93-observability.md` exposes `activeCardAnnotation` as public — confirmed. Will need `globalMarkers` section added for full integration test (optional — defaults to public).

## Architecture Check

1. Documentation only — no engine logic changes.
2. Integration test uses production FITL data, verifying compilation → evaluation → resolution pipeline.
3. No game-specific logic in engine code — the test exercises generic globalMarker resolution with FITL data.

## What to Change

### 1. Add `globalMarker.*` to cookbook Reference Paths table (`docs/agent-dsl-cookbook.md`)

Add row to the State References table:

```markdown
| `globalMarker.<id>` | string | current state of a global marker lattice (e.g., `"shaded"`, `"inactive"`) |
```

### 2. Add usage pattern to cookbook

After the "React to the active event card" section, add a pattern showing how to use `globalMarker.*` for capability valuation:

```yaml
stateFeatures:
  boobyTrapsActive:
    type: number
    expr:
      boolToNumber:
        eq:
          - { ref: globalMarker.cap_boobyTraps }
          - "shaded"

considerations:
  valueCapabilities:
    scopes: [move]
    weight: { param: capabilityWeight }
    value:
      ref: feature.boobyTrapsActive
```

Include a note: "The `globalMarker.*` ref returns a string (the marker's current lattice state). Use `eq` to compare against specific states, then `boolToNumber` to convert for numeric scoring."

### 3. FITL integration test

Create a test that:
1. Compiles the FITL game spec (which has `globalMarkerLattices`)
2. Verifies the compiled observer catalog includes `globalMarkers` with entries for FITL capabilities
3. Sets up a game state with `cap_boobyTraps` set to `"shaded"`
4. Resolves `globalMarker.cap_boobyTraps` → returns `"shaded"`
5. Resolves `globalMarker.cap_boobyTraps` with default state (not set) → returns lattice default

### 4. Update FITL observability config (optional)

Add `globalMarkers` section to `data/games/fire-in-the-lake/93-observability.md` if needed for explicit visibility control. May not be necessary if defaults are `public`.

## Files to Touch

- `docs/agent-dsl-cookbook.md` (modify)
- `packages/engine/test/integration/agents/global-marker-surface.test.ts` (new)
- `data/games/fire-in-the-lake/93-observability.md` (modify, if needed)

## Out of Scope

- No engine code changes
- No changes to vc-evolved profile (that's a campaign experiment, not a ticket deliverable)
- No changes to agent compilation or observer compilation

## Acceptance Criteria

### Tests That Must Pass

1. FITL integration: `globalMarker.cap_boobyTraps` resolves to correct state
2. FITL integration: default state returned when marker not explicitly set
3. FITL integration: compiled catalog includes `globalMarkers` entries
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Cookbook examples use correct DSL types (number for features, `eq` for string comparison, `boolToNumber` for conversion)
2. No game-specific engine logic introduced by tests (tests use FITL data but verify generic behavior)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/agents/global-marker-surface.test.ts` — end-to-end FITL test for globalMarker resolution

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/integration/agents/global-marker-surface.test.js`
2. `pnpm -F @ludoforge/engine test`
