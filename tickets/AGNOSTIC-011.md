# AGNOSTIC-011: Bootstrap Fixture Drift Guard for Generated GameDef Artifacts

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Runner tooling/CI wiring
**Deps**: None

## What Needs to Change

1. Add a drift check ensuring committed generated bootstrap fixtures (for example `fitl-game-def.json`) match current source specs.
2. Provide a deterministic check command suitable for CI (fail when fixture is stale).
3. Ensure bootstrap generation and drift-check workflows are documented and reproducible locally.
4. Keep fixture generation/check logic generic so additional game fixtures can be added without bespoke scripts.

## Invariants

1. Source spec changes that affect bootstrap output are never silently shipped with stale fixture JSON.
2. CI can enforce fixture freshness deterministically.
3. Developers have one clear command path to regenerate and verify fixtures.
4. Existing bootstrap workflow remains functional for default/FITL and future games.

## Tests That Should Pass

1. Add/extend tooling tests (or script integration tests) for:
   - fresh fixture passes drift check
   - intentionally modified stale fixture fails drift check
2. `pnpm -F @ludoforge/runner bootstrap:fitl` (or generalized bootstrap generation command)
3. New drift-check command (for example under runner scripts) passes in clean state.
4. Relevant CI lane command(s) pass with fresh artifacts.

