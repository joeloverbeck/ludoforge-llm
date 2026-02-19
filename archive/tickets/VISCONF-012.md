# VISCONF-012: Engine test boundary verification after visual-config extraction

**Status**: ✅ COMPLETED
**Spec**: 42 (Per-Game Visual Config), D14
**Priority**: P1
**Depends on**: VISCONF-009, VISCONF-010, VISCONF-011
**Blocks**: Spec 42 archival and F3 criteria update

---

## Why this ticket was corrected

The original ticket assumed many engine test cleanups were still pending. Current repo state shows most of that work is already implemented.

### Reassessed assumptions

| Original assumption | Current reality | Ticket update |
|---|---|---|
| `card-animation-metadata.test.ts` still exists and must be deleted | File no longer exists | Remove deletion task |
| `texas-card-animation-metadata.test.ts` still exists and must be deleted | File no longer exists | Remove deletion task |
| Multiple engine tests still assert visual fields | `visual/layoutRole/cardAnimation/layoutMode` references are absent from listed tests except negative validator coverage | Convert to verification-only task |
| Strict negative validation tests for removed visual keys are missing | `packages/engine/test/unit/validate-spec.test.ts` already includes negative tests for removed metadata/zone/map/piece-catalog visual keys with `severity: 'error'` | Keep and strengthen only if edge gaps are found |
| Verification grep should return zero visual-key hits in `packages/engine/test` | This conflicts with required negative tests that intentionally include removed keys | Replace with scoped grep rule excluding the negative validator test file |

---

## Updated scope

This ticket now focuses on **validation and hardening**, not bulk deletions:

1. Verify current engine test suite boundaries remain strict (no positive assertions on removed visual fields).
2. Verify strict rejection behavior for legacy visual keys remains error-level and path-accurate.
3. Add/strengthen tests only if a real edge-case gap is discovered during reassessment.
4. Execute required hard test and lint/typecheck gates.
5. If all Spec 42 deliverables are effectively complete, finalize and archive related planning artifacts.

---

## Architectural reassessment (clean break policy)

The current architecture is better than the pre-Spec-42 architecture and aligns with the clean-break rule:

- Engine/compiler remain presentation-agnostic.
- Runner owns visual concerns through `VisualConfigProvider` + per-game `visual-config.yaml`.
- Legacy visual keys in `GameSpecDoc` are rejected as errors, preventing silent aliasing/back-compat drift.

No architecture rollback or compatibility aliasing should be introduced in this ticket.

---

## Files to verify (not automatically modify)

- `packages/engine/test/unit/compile-zones.test.ts`
- `packages/engine/test/unit/compiler-structured-results.test.ts`
- `packages/engine/test/unit/data-assets.test.ts`
- `packages/engine/test/unit/schemas-top-level.test.ts`
- `packages/engine/test/unit/json-schema.test.ts`
- `packages/engine/test/unit/fitl-production-map-cities.test.ts`
- `packages/engine/test/unit/fitl-production-map-provinces-locs.test.ts`
- `packages/engine/test/unit/fitl-production-piece-inventory.test.ts`
- `packages/engine/test/integration/fitl-derived-values.test.ts`
- `packages/engine/test/unit/validate-spec.test.ts`

---

## Acceptance criteria

### Hard checks

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm -F @ludoforge/engine typecheck`
4. `pnpm -F @ludoforge/runner test`
5. `pnpm -F @ludoforge/runner lint`
6. `pnpm -F @ludoforge/runner typecheck`
7. `pnpm turbo test`
8. `pnpm turbo lint`

### Boundary verification

1. No engine test outside `validate-spec.test.ts` asserts legacy visual fields as supported runtime/compiler output.
2. `validate-spec.test.ts` must contain error-level rejection coverage for removed visual keys, with diagnostic path assertions.
3. No engine source type/schema/compiler path reintroduces visual fields into `GameDef`.

### Suggested grep sanity checks

- `rg -n "layoutRole|cardAnimation|layoutMode|visual|displayName" packages/engine/test --glob '*.ts'`
  - Expected: matches only in negative boundary tests (currently `validate-spec.test.ts`).

---

## Out of scope

- Reintroducing any visual fields into engine types/compiler
- Backwards compatibility aliasing for removed keys
- Runner feature redesign beyond correctness/verification
- Large refactors without evidence of architectural defect

---

## Outcome

- **Completion date**: 2026-02-19
- **What changed**:
  - Reassessed and corrected stale ticket assumptions (many originally listed edits were already complete).
  - Strengthened strict-boundary coverage in `packages/engine/test/unit/validate-spec.test.ts` by asserting exact diagnostic paths and `severity: 'error'` for removed metadata/zone visual keys.
  - Re-ran hard validation gates across engine/runner/workspace (`engine test`, `engine e2e`, `engine typecheck`, `runner test`, `runner lint`, `runner typecheck`, `turbo test`, `turbo lint`) and confirmed pass.
- **Deviation from original plan**:
  - Original plan focused on broad test-file cleanup/deletions; reassessment showed those deletions were already done, so execution narrowed to verification and targeted test hardening.
- **Verification result**: All required checks passed; no engine test outside negative boundary coverage treats removed visual fields as supported output.
