# VISCONF-009: Compiler/validator visual-key removal hardening

**Status**: ✅ COMPLETED
**Spec**: 42 (Per-Game Visual Config), D11
**Priority**: P1
**Depends on**: VISCONF-008 (already completed in `archive/tickets/VISCONF-008.md`)
**Blocks**: None

---

## Reassessed Summary (2026-02-19)

VISCONF-009 was originally written as a large compiler-refactor ticket. That assumption is outdated.
The compiler/type removals described here are already implemented. The remaining value is to harden regression coverage for strict rejection of legacy visual keys in `GameSpecDoc` inputs, especially inside `dataAssets` payloads.

Architectural judgment: the current architecture (visual config fully in runner, engine/compiler purely rules/data) is better than the previous mixed model and should be preserved. No rollback or aliasing should be introduced.

---

## Assumption Reassessment

### Discrepancies from original ticket assumptions

1. **Core code removals are already done**
- `lowerCardAnimationMetadata`, `resolveCardAnimationRoleZones`, `resolveMapSpaceVisuals`, `mergeZoneVisualHints`, `buildTokenTypeVisualsMap`, and `normalizeZoneLayoutRole` are already absent.
- `game-spec-doc.ts` already excludes removed visual fields/types.
- `compiler-core.ts` no longer assembles `metadata.layoutMode`/`cardAnimation` into `GameDef`.

2. **Validators already hard-reject key metadata/zone visual fields**
- `metadata.layoutMode`, `metadata.cardAnimation`, `zones[*].layoutRole`, and `zones[*].visual` already emit explicit `severity: 'error'` diagnostics.

3. **Original dependency/blocking model is stale**
- VISCONF-012 is no longer blocked by compiler implementation work; substantial test migration is already present.

4. **Strict rejection for data-asset visual keys relies on schema strictness**
- `pieceCatalog` and `map` payload schemas are strict and reject unknown keys as errors.
- This behavior exists but needs explicit regression tests for removed visual keys.

---

## Updated Scope

### In scope

1. Add/strengthen tests so legacy visual keys are compile-blocking errors for:
- `metadata.cardAnimation`, `metadata.layoutMode`
- `zones[*].layoutRole`, `zones[*].visual`
- `dataAssets[*].payload.factions[*].color`, `dataAssets[*].payload.factions[*].displayName`
- `dataAssets[*].payload.pieceTypes[*].visual`
- `dataAssets[*].payload.visualRules`, `dataAssets[*].payload.spaces[*].visual`

2. Re-run relevant engine tests/typecheck/build to confirm no regression.

### Out of scope

- Repeating already-completed compiler/type deletions.
- Runner visual-config changes.
- Game data cleanup tickets (VISCONF-010/011).

---

## Acceptance Criteria

1. `pnpm -F @ludoforge/engine test -- --grep validate-spec` (or equivalent targeted validator test run) passes with new assertions.
2. Added tests assert that removed legacy visual keys in metadata/zones/data-assets produce at least one `severity: 'error'` diagnostic at the expected path.
3. `pnpm -F @ludoforge/engine typecheck` passes.
4. `pnpm -F @ludoforge/engine build` passes.

---

## Architecture Notes

- Current direction is correct: keep engine contracts presentation-free and keep visual policy in runner `visual-config.yaml`.
- If future cleanup is needed, prefer a shared validator helper for “removed legacy keys” to avoid duplication of explicit checks across validator modules while preserving explicit error codes.

---

## Outcome

- Completion date: 2026-02-19
- What changed:
  - Reassessed and corrected ticket assumptions/scope to match current code reality after VISCONF-008 archival consolidation.
  - Added regression coverage for strict rejection of removed visual keys in `dataAssets` payloads:
    - `pieceCatalog` rejected legacy faction visual keys and piece-type visual keys.
    - `map` rejected legacy map-level and space-level visual keys.
  - Preserved existing metadata/zone legacy visual-key rejection coverage.
- Deviations from original plan:
  - Did not re-implement compiler/type removals because they were already completed in existing code.
  - Focus narrowed to regression hardening and verification.
- Verification:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm -F @ludoforge/engine test` passed.
