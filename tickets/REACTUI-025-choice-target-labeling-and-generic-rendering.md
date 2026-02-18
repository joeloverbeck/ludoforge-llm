# REACTUI-025: Choice Target Labeling and Generic Target Rendering

**Status**: PENDING
**Spec**: 37 (State Management), 39 (React DOM UI)
**Priority**: P2
**Depends on**: REACTUI-024
**Estimated complexity**: M

---

## Summary

Improve choice-option presentation so labels and rendering hints are derived generically from RenderModel data (`zone`, `token`, `player`, scalar), not from string formatting heuristics.

---

## What Needs to Change

- Extend choice render projection to include normalized, game-agnostic target metadata per option (e.g. target kind + resolved display payload).
- Use `targetKinds` and RenderModel entity maps to resolve display labels where possible:
  - zones -> `RenderZone.displayName`
  - tokens -> token label strategy (type/id/owner-derived generic formatter)
  - players -> `RenderPlayer.displayName`
  - scalar fallback -> deterministic generic formatter
- Update `ChoicePanel` option rendering to consume resolved metadata instead of relying solely on `String(value)` formatting.
- Preserve strict agnostic engine rule: no game-specific identifiers or branches.

---

## Out of Scope

- Game-specific theming or per-game UX customization (Spec 42).
- Canvas highlighting of selectable targets (Spec 38 interaction layer).

---

## Acceptance Criteria

### Tests that should pass

- `packages/runner/test/model/derive-render-model-state.test.ts`
  - validates resolved labels for zone/token/player/scalar options.
  - validates deterministic fallback when resolution target is missing.
- `packages/runner/test/ui/ChoicePanel.test.ts`
  - validates rendered option labels use resolved metadata.
- `packages/runner/test/utils/format-display-name.test.ts`
  - baseline formatter behavior remains intact for fallback paths.

### Invariants

- Choice option labeling is deterministic and game-agnostic.
- No UI dependence on game-specific IDs/strings.
- `targetKinds` influences generic rendering semantics without hardcoded game rules.
- Missing entity references degrade gracefully to safe fallback labels.

