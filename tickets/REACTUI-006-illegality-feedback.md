# REACTUI-006: IllegalityFeedback

**Spec**: 39 (React DOM UI Layer) — Deliverable D6
**Priority**: P1
**Depends on**: REACTUI-001
**Estimated complexity**: S

---

## Summary

Create the `IllegalityFeedback` component that renders inline when a `RenderChoiceOption` is illegal. This is a presentational component used by ChoicePanel (REACTUI-007) to explain why an option is disabled.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/IllegalityFeedback.tsx` | Inline message/tooltip for illegal choice options |
| `packages/runner/src/ui/IllegalityFeedback.module.css` | Styling: muted text, icon, positioning |

### Modified files

None (consumed by ChoicePanel in REACTUI-007).

---

## Detailed Requirements

- Props: `{ illegalReason: string }`.
- Renders a small inline message showing the `illegalReason` text.
- Visual treatment: muted color (`--text-muted` or `--danger`), small font (`--font-size-sm`), optional warning icon.
- Positioned inline below or beside the option text.
- Purely presentational — no store access, no side effects.
- Accessible: `role="note"` or similar, so screen readers announce the reason.

---

## Out of Scope

- ChoicePanel integration (REACTUI-007 imports this component)
- Tooltip positioning (simple inline display, not floating)
- Animation on appearance (Spec 40)

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/IllegalityFeedback.test.tsx` | Renders the `illegalReason` text |
| `packages/runner/test/ui/IllegalityFeedback.test.tsx` | Has accessible role attribute |
| `packages/runner/test/ui/IllegalityFeedback.test.tsx` | Uses muted color styling |

### Invariants

- Pure presentational component. No store access.
- No game-specific logic or terminology.
- Receives all data via props.
- Uses CSS Modules — no inline styles.
