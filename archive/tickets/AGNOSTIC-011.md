# AGNOSTIC-011: Bootstrap Fixture Drift Guard for Generated GameDef Artifacts

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Runner tooling/CI wiring
**Deps**: specs/35-00-frontend-implementation-roadmap.md

## Assumptions Reassessment (2026-02-18)

1. Runner bootstrap fixtures already include multiple generated artifacts: `fitl-game-def.json` and `texas-game-def.json` under `packages/runner/src/bootstrap/`.
2. Bootstrap generation currently exists as duplicated, per-game scripts:
   - `packages/runner/scripts/compile-fitl-bootstrap.mjs`
   - `packages/runner/scripts/compile-texas-bootstrap.mjs`
   This does not scale cleanly as fixture count grows.
3. There is currently no dedicated drift-check command that deterministically fails when committed bootstrap fixtures are stale relative to source specs.
4. There is currently no script-level test coverage for fixture generation/drift-check behavior.
5. Existing bootstrap registry consumption is generic (`bootstrap-registry.ts` and `resolve-bootstrap-config.ts`), but generation tooling is not yet equally generic.

## Architecture Decision

1. Bootstrap fixture generation/check must be registry-driven and game-agnostic.
2. Drift detection should use deterministic generated output (pretty-printed JSON with stable ordering from current compiler output) and strict byte comparison against committed fixtures.
3. No per-game alias commands as the primary architecture for fixture maintenance; maintain one canonical generate command and one canonical drift-check command.
4. No backwards-compat shims: if fixtures drift, checks fail and fixtures must be regenerated.

## What Needs to Change

1. Replace duplicated per-game bootstrap compilation scripts with one generic runner bootstrap generation script that can compile all registered bootstrap fixture targets.
2. Add a drift-check command ensuring committed generated bootstrap fixtures (currently FITL + Texas) exactly match current source specs.
3. Provide deterministic commands suitable for CI and local workflows:
   - one command to regenerate fixtures
   - one command to verify no drift (fails on stale fixtures)
4. Add script-level tests covering fresh and stale fixture scenarios.
5. Document the generation + drift-check workflow in runner bootstrap docs.

## Out of Scope

1. Changing runtime bootstrap selection semantics in `bootstrap-registry.ts` / `resolve-bootstrap-config.ts`.
2. Reworking GameDef compiler internals.
3. Introducing game-specific generation branches in runner runtime code.

## Invariants

1. Source spec changes that affect bootstrap output are never silently shipped with stale fixture JSON.
2. CI can enforce fixture freshness deterministically.
3. Developers have one clear command path to regenerate and verify fixtures.
4. Bootstrap generation/check logic remains generic and extensible for additional fixtures.
5. Runtime bootstrap workflow remains functional for default/FITL/Texas and future games.

## Tests That Should Pass

1. Add/extend tooling tests (script-level or integration tests) for:
   - fresh fixture passes drift check
   - intentionally modified stale fixture fails drift check
2. Canonical bootstrap generation command (new generic command under `@ludoforge/runner`) runs successfully.
3. Canonical bootstrap drift-check command passes in clean state and fails in stale state.
4. `pnpm -F @ludoforge/runner test`
5. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-02-18
- What changed:
  - Added canonical generic bootstrap fixture tooling at `packages/runner/scripts/bootstrap-fixtures.mjs` with deterministic `generate` and `check` modes.
  - Replaced per-game script commands with canonical commands in `packages/runner/package.json`:
    - `bootstrap:fixtures`
    - `bootstrap:fixtures:check`
  - Removed duplicated per-game scripts:
    - `packages/runner/scripts/compile-fitl-bootstrap.mjs`
    - `packages/runner/scripts/compile-texas-bootstrap.mjs`
  - Added tooling regression tests at `packages/runner/test/bootstrap/bootstrap-fixtures-script.test.ts` for fresh/stale/missing fixture cases.
  - Updated bootstrap workflow documentation in:
    - `README.md`
    - `packages/runner/src/bootstrap/README.md`
  - Added test typing support for `.mjs` imports at `packages/runner/test/types/mjs-modules.d.ts`.
- Deviations from original plan:
  - Original ticket implied a FITL-only drift example and optional generalized command; implementation now enforces a single canonical all-fixtures workflow and includes Texas in the same deterministic path.
  - CI wiring was left command-based (ready for any CI lane) because repository-local CI config is not present in-tree.
- Verification results:
  - `pnpm -F @ludoforge/runner bootstrap:fixtures` passed.
  - `pnpm -F @ludoforge/runner bootstrap:fixtures:check` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
