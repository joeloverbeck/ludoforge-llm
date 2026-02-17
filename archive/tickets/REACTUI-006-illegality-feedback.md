# REACTUI-006: IllegalityFeedback

**Spec**: 39 (React DOM UI Layer) — Deliverable D6
**Priority**: P1
**Depends on**: REACTUI-003
**Estimated complexity**: S
**Status**: ✅ COMPLETED

---

## Summary

Create the `IllegalityFeedback` component that renders inline when a `RenderChoiceOption` is illegal. This is a presentational component used by ChoicePanel (REACTUI-007) to explain why an option is disabled.

---

## Reassessed Assumptions and Scope Corrections

### Corrected baseline assumptions (repo reality)

- The current `RenderChoiceOption` contract in `packages/runner/src/model/render-model.ts` defines `illegalReason` as `string | null`, not `string`.
- Runner UI tests are currently `*.test.ts` contract tests under Node + `renderToStaticMarkup`; this ticket should follow that pattern rather than introducing `*.test.tsx` assumptions.
- `ChoicePanel` is not implemented yet (REACTUI-007), so this ticket remains a standalone presentational primitive with no store wiring.

### Scope adjustments

- Prop contract is corrected to `illegalReason: string | null`.
- Component must render a deterministic fallback message when `illegalReason` is null/blank (defensive contract for future render-model producers).
- Styling verification focuses on CSS-module token usage (`--text-muted`/`--danger`) and not computed style evaluation in Node tests.

### Architectural rationale

- Keeping `IllegalityFeedback` pure and null-safe avoids coupling UI correctness to upstream renderer completeness while preserving a single reusable rendering point for illegality reasons.
- Centralizing illegality text treatment in one component is cleaner and more extensible than duplicating muted/error snippets in ChoicePanel modes.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/IllegalityFeedback.tsx` | Inline message/annotation for illegal choice options |
| `packages/runner/src/ui/IllegalityFeedback.module.css` | Styling: muted danger text, compact typography |
| `packages/runner/test/ui/IllegalityFeedback.test.ts` | Contract tests for rendering, accessibility semantics, and CSS token usage |

### Modified files

None (consumed by ChoicePanel in REACTUI-007).

---

## Detailed Requirements

- Props: `{ illegalReason: string | null }`.
- Renders a small inline message showing `illegalReason` text.
- If `illegalReason` is `null`, empty, or whitespace-only, renders fallback text: `This option is currently unavailable.`
- Visual treatment: muted/danger text via design tokens (`--text-muted` and/or `--danger`), small font (`--font-size-sm`), optional warning glyph.
- Positioned inline below or beside option text (no floating/portal behavior).
- Purely presentational: no store access, no side effects.
- Accessible: element uses `role="note"` and exposes human-readable content.

---

## Out of Scope

- ChoicePanel integration (REACTUI-007 imports this component)
- Tooltip positioning (simple inline display, not floating)
- Animation on appearance (Spec 40)
- Any changes to RenderModel derivation logic for illegal options

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/IllegalityFeedback.test.ts` | Renders provided `illegalReason` text |
| `packages/runner/test/ui/IllegalityFeedback.test.ts` | Renders fallback text when `illegalReason` is null/blank |
| `packages/runner/test/ui/IllegalityFeedback.test.ts` | Uses `role="note"` for accessibility semantics |
| `packages/runner/test/ui/IllegalityFeedback.test.ts` | CSS module references tokenized muted/danger styling and small font size |

### Invariants

- Pure presentational component. No store access.
- No game-specific logic or terminology.
- Receives all data via props.
- Uses CSS Modules. No inline style attributes.
- Null-safe behavior is deterministic and test-covered.

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed vs originally planned**:
  - Implemented `IllegalityFeedback` as a pure presentational component with `role="note"` semantics and compact inline styling.
  - Added CSS module with tokenized muted/danger styling and small typography.
  - Added focused UI contract tests for explicit reason rendering, null/blank fallback, accessibility semantics, and CSS token usage.
  - Corrected ticket assumptions before implementation: `illegalReason` nullability and Node-based `*.test.ts` test conventions.
- **Deviations**:
  - Added deterministic fallback messaging for `null`/blank reasons (`This option is currently unavailable.`) to harden the UI contract against incomplete upstream reason payloads.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
