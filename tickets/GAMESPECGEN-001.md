# GAMESPECGEN-001: Close GameSpecDoc Expressiveness Gaps for General Board/Card Games

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — GameSpecDoc schema/compiler/runtime capabilities
**Deps**: ARCHBOUND-001

## Problem

Current architecture target is that a `GameSpecDoc` should encode any existing board/card game for immediate play, with no required runtime dependence on external `data/<game>/...` fixtures. We need a structured gap-closure effort to ensure the generic schema/compiler/runtime can represent and execute broad board/card mechanics without game-specific engine code.

## Assumption Reassessment (2026-02-22)

1. The repository already supports multiple game examples, but capability coverage has not been codified as a formal board/card mechanic matrix with pass/fail criteria.
2. Evolution input contract requires YAML-only mutation and representability of required runtime data within `GameSpecDoc` payloads.
3. Mismatch: architectural goal is explicit, but acceptance criteria for “any board/card game” are not yet operationalized; this ticket adds measurable coverage targets and implementation increments.

## Architecture Check

1. A capability-matrix-driven implementation is cleaner than ad hoc feature additions because it forces generic modeling primitives before game onboarding.
2. This reinforces the agnostic engine rule by adding shared schema/runtime primitives rather than per-game branches.
3. No backward-compatibility aliases should be added; prefer direct schema/runtime evolution and fixture migration.

## What to Change

### 1. Define and ratify a mechanic capability matrix

- Create a board/card mechanic matrix (zones, decks, hidden info, turn structure, triggered effects, replacement effects, bidding/auctions, drafting, hand management, simultaneous reveals, scoring patterns, etc.).
- Mark current support level per mechanic: native, partial, missing.
- Define minimum generic primitives required for each missing mechanic.

### 2. Implement missing generic primitives in GameSpecDoc pipeline

- Extend shared `GameSpecDoc` contracts and compiler lowering to cover prioritized missing mechanics.
- Ensure runtime execution remains generic (no game identifiers, no per-game branches).
- Where needed, embed required data assets in `GameSpecDoc` YAML payloads per evolution-input rule.

### 3. Add conformance fixtures and execution tests

- Add/upgrade canonical fixtures proving each prioritized mechanic compiles and executes.
- Add negative tests for invalid mechanic encodings.
- Add end-to-end compile+simulate checks that require no mandatory external data files.

## Files to Touch

- `specs/**` (modify/add — capability matrix spec and execution criteria)
- `packages/engine/src/**` (modify — schema/compiler/runtime generic primitives)
- `packages/engine/schemas/**` (modify — shared schema artifacts)
- `packages/engine/test/**` (modify/add — conformance and integration tests)
- `packages/runner/test/**` (modify/add — runner integration where mechanic visibility is required)
- `data/**` (modify optional fixtures only; must not become required runtime inputs)

## Out of Scope

- Game-specific rendering polish.
- Per-game engine hardcoding.
- Maintaining compatibility with deprecated schema encodings.

## Acceptance Criteria

### Tests That Must Pass

1. Capability matrix exists with explicit support status and prioritized closure list.
2. For each mechanic targeted in this ticket, at least one fixture compiles and simulates successfully using only `GameSpecDoc` + generic engine.
3. Integration tests prove no required runtime dependency on `data/<game>/...` fixture files.
4. Existing suites: `pnpm -F @ludoforge/engine test:all` and `pnpm -F @ludoforge/runner test`

### Invariants

1. `GameDef` and simulation/kernel remain game-agnostic.
2. `GameSpecDoc` (including embedded data assets) is sufficient to compile and execute targeted mechanics.
3. Visual presentation requirements remain in `visual-config.yaml`, not simulation contracts.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/**` — compile/simulate conformance for newly supported mechanics.
2. `packages/engine/test/unit/**` — schema/compiler validation for new generic primitives.
3. `packages/runner/test/**` — integration assertions for mechanic visibility where relevant.

### Commands

1. `pnpm turbo schema:artifacts`
2. `pnpm -F @ludoforge/engine test:all`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm turbo test`
