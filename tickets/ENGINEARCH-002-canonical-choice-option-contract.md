# ENGINEARCH-002: Canonical Pending Choice Option Contract

**Status**: PENDING
**Spec**: 35 (Frontend Integration Boundaries), 39 (React DOM UI Layer)
**Priority**: P1
**Depends on**: ENGINEARCH-001
**Estimated complexity**: M

---

## Summary

Remove dual-source pending choice option data (`options` + `optionLegality`) and replace it with one canonical option structure to eliminate divergence risk between engine and runner.

---

## What Needs to Fix

- Refactor kernel pending-choice types to use one canonical list of choice options that includes:
  - value
  - legality status
  - illegal reason (if present)
- Remove fallback paths in runner that assume missing legality implies legal.
- Update worker boundary contracts and clone-compat assumptions to match the canonical structure.
- Remove temporary compatibility paths and aliasing; fix all call sites directly.

---

## Invariants That Must Pass

- Pending-choice option legality has a single source of truth.
- Runner selectable/highlighted targets are derived from the same canonical option list rendered to users.
- Engine/runner boundary payloads remain structured-clone compatible.
- No backward-compat aliases remain for legacy `options`-only choice payloads.

---

## Tests That Should Pass

- `packages/engine/test/unit/effects-choice.test.ts`
  - assert discovery pending choice emits canonical option entries.
- `packages/engine/test/unit/kernel/legal-choices.test.ts`
  - assert legality probing writes into canonical option entries only.
- `packages/runner/test/model/derive-render-model-state.test.ts`
  - assert rendered `currentChoiceOptions` map directly from canonical option entries.
- `packages/runner/test/model/derive-render-model-zones.test.ts`
  - assert selectability uses canonical legality state only.
- `packages/runner/test/worker/clone-compat.test.ts`
  - assert updated pending-choice shape remains clone-safe.
- Existing suites remain green:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/runner lint`

