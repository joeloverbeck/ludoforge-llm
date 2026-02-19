# VISCONF-011: Keep bootstrap fixtures and schema artifacts aligned after visual-field removal

**Status**: ✅ COMPLETED
**Spec**: 42 (Per-Game Visual Config), D13
**Priority**: P1
**Depends on**: VISCONF-012
**Blocks**: Nothing

---

## Corrected assumptions

The original ticket assumed manual edits were still needed in:
- `packages/runner/src/bootstrap/fitl-game-def.json`
- `packages/runner/src/bootstrap/texas-game-def.json`

That is no longer true in current architecture:
- Bootstrap fixtures are generated from canonical game specs via `packages/runner/scripts/bootstrap-fixtures.mjs`.
- Fixture targets are declared in `packages/runner/src/bootstrap/bootstrap-targets.json`.
- `packages/runner/src/bootstrap/fitl-game-def.json` and `packages/runner/src/bootstrap/texas-game-def.json` are generated artifacts and should not be hand-edited.
- Visual keys removed by Spec 42 (`visual`, `layoutRole`, `layoutMode`, `cardAnimation`, faction `color`/`displayName`) are already absent from the generated fixtures and from `packages/engine/schemas/GameDef.schema.json`.

Architectural decision:
- Keep canonical rule data in GameSpecDoc and generated artifacts, not duplicated by manual JSON maintenance.
- This is cleaner and more extensible than manual fixture patching because drift is caught by deterministic generation checks.

---

## Updated scope

1. Verify generated bootstrap fixtures are current against canonical specs.
2. Verify schema artifacts are current and synchronized with kernel source schemas.
3. Preserve strict boundary: no visual fields in GameDef/bootstrap/schema artifacts.

This ticket no longer introduces engine/runtime API changes; it validates and locks in the already-migrated architecture.

---

## Files in scope

| File | Role |
|------|------|
| `packages/runner/src/bootstrap/bootstrap-targets.json` | Manifest for generated bootstrap fixtures |
| `packages/runner/scripts/bootstrap-fixtures.mjs` | Generator/check script for runner bootstrap fixtures |
| `packages/runner/src/bootstrap/fitl-game-def.json` | Generated bootstrap artifact |
| `packages/runner/src/bootstrap/texas-game-def.json` | Generated bootstrap artifact |
| `packages/engine/schemas/GameDef.schema.json` | Generated engine schema artifact |

---

## Acceptance criteria

### Commands/tests that must pass

1. `pnpm -F @ludoforge/runner bootstrap:fixtures:check`
2. `pnpm -F @ludoforge/runner test -- test/bootstrap/resolve-bootstrap-config.test.ts`
3. `pnpm -F @ludoforge/runner test -- test/bootstrap/bootstrap-fixtures-script.test.ts`
4. `pnpm -F @ludoforge/engine schema:artifacts:check`
5. `pnpm -F @ludoforge/engine test` (includes schema artifact check and unit/integration coverage, including `json-schema`, `schemas-top-level`, and `schema-artifacts-sync`)

### Verification

1. Generated bootstrap fixtures contain no removed visual keys (`visual`, `layoutRole`, `layoutMode`, `cardAnimation`, faction `color`/`displayName`).
2. `GameDef.schema.json` contains no removed visual contracts (`ZoneVisualHints`, `TokenVisualHints`, `CardAnimationMetadata`, and associated properties).
3. No manual edits are required for bootstrap fixture JSON when canonical specs change; regeneration/check flow is authoritative.

### Invariants

- Bootstrap fixtures remain valid GameDef payloads.
- Engine schema artifacts remain synchronized with source contracts.
- Visual presentation data stays outside engine GameDef contracts and inside runner visual config.

---

## Out of scope

- Additional visual-config feature work (covered by other VISCONF tickets/spec deliverables).
- Changes to engine/compiler behavior beyond artifact synchronization and validation coverage.

---

## Outcome

- **Completion date**: 2026-02-19
- **What changed**:
  - Reassessed and corrected ticket assumptions to match current architecture (generated bootstrap fixtures, not hand-edited JSON).
  - Updated scope and acceptance criteria to executable, current commands and tests.
  - Verified fixture drift checks, runner bootstrap tests, engine schema checks, and workspace lint/test pass.
- **Deviations from original plan**:
  - Original plan required stripping fields from bootstrap JSON directly; this was already complete and no direct fixture editing was needed.
  - Ticket shifted from implementation to architecture-alignment and verification hardening.
- **Verification results**:
  - `pnpm -F @ludoforge/runner bootstrap:fixtures:check` passed.
  - `pnpm -F @ludoforge/runner test -- test/bootstrap/resolve-bootstrap-config.test.ts test/bootstrap/bootstrap-fixtures-script.test.ts` passed.
  - `pnpm -F @ludoforge/engine schema:artifacts:check` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo lint` passed.
  - `pnpm turbo test` passed.
