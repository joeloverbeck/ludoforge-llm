# ENGINEARCH-004: Choice Legality API Mode Split

**Status**: PENDING
**Spec**: 35 (Frontend Integration Boundaries), 39 (React DOM UI Layer)
**Priority**: P1
**Depends on**: ENGINEARCH-003
**Estimated complexity**: M

---

## Summary

Split pending-choice discovery and legality-evaluation into explicit engine APIs/modes so callers cannot accidentally consume ambiguous legality semantics.

---

## What Needs to Change

- Replace boolean `probeOptionLegality` with an explicit mode contract in kernel legality surfaces (for example `mode: 'discover' | 'evaluate'`).
- Ensure mode defaults are explicit and safe (no implicit fallback behavior that can be misused by new callers).
- Keep worker/runner paths on evaluated legality mode; keep internal move-enumeration/probing paths on discovery mode where appropriate.
- Update engine public types/docs so legality semantics are unambiguous for pending options.
- Remove deprecated/temporary mode aliases; no backward compatibility shims.

---

## Invariants That Should Pass

- Callers can deterministically choose between discovery and evaluated legality behavior via explicit mode.
- Runner/UI paths always receive legality-enriched canonical options suitable for selection/highlighting.
- Discovery-mode callers do not pay unnecessary probe costs.
- No engine call site depends on implicit legality probing defaults.

---

## Tests That Should Pass

- `packages/engine/test/unit/kernel/legal-choices.test.ts`
  - add explicit mode tests for `discover` vs `evaluate` behavior.
- `packages/runner/test/worker/game-worker.test.ts`
  - assert worker legal-choices path always requests evaluated legality mode.
- `packages/runner/test/model/derive-render-model-state.test.ts`
  - assert rendered choice options remain legality-complete in UI path.
- Existing quality gates remain green:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/engine typecheck`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/engine lint`
  - `pnpm -F @ludoforge/runner lint`
