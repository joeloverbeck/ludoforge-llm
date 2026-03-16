# 63CHOOPEROPT-011: UI distinction for exact vs provisional chooseN options

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: 63CHOOPEROPT-001, 63CHOOPEROPT-009

## Problem

The runner UI currently treats all `unknown` options identically. With the new `resolution` field, the UI should visually distinguish exact results from provisional ones so players understand the confidence level of option hints.

## Assumption Reassessment (2026-03-15)

1. The choice panel in `packages/runner/src/ui/` renders `ChoicePendingChooseNRequest` options.
2. Options with `legality: 'unknown'` are currently selectable (spec 3.4 — this MUST remain true).
3. `resolution` field is optional on `ChoiceOption` (added in 001). The `resolution` field must be added to `RenderChoiceOption` and forwarded from `derive-render-model.ts` before the UI can read it.

## Architecture Check

1. UI-only change — no engine kernel modifications.
2. The visual distinction is a nice-to-have polish, not a correctness requirement.
3. Must be input-modality-agnostic: works for mouse, keyboard, and screen readers.

## What to Change

### 1. Update choice option rendering

In the chooseN choice panel component:
- `resolution: 'exact'` + `legality: 'legal'` → standard enabled style (green/checkmark)
- `resolution: 'exact'` + `legality: 'illegal'` → standard disabled style (greyed out)
- `resolution: 'provisional'` + `legality: 'unknown'` → subtly different style (e.g., dashed border, muted color, "?" icon)
- `resolution: 'stochastic'` or `'ambiguous'` → similar to provisional but with a distinct indicator
- Missing `resolution` (legacy/chooseOne) → treat as exact

### 2. Add ARIA labels

- Provisional options: `aria-label` includes "(unverified)" or similar
- Stochastic options: `aria-label` includes "(uncertain)"
- This ensures screen reader users are informed

### 3. Optional tooltip

If the choice panel supports tooltips, show resolution details on hover:
- "This option's legality has been exactly verified"
- "This option could not be fully verified within the search budget"
- "This option crosses a random decision boundary"

## Files to Touch

- `packages/runner/src/model/render-model.ts` — add `resolution` field to `RenderChoiceOption` (modify)
- `packages/runner/src/model/derive-render-model.ts` — forward `resolution` from engine `ChoiceOption` to `RenderChoiceOption` (modify)
- `packages/runner/src/ui/ChoicePanel.tsx` — choice panel component that renders chooseN options (modify)
- `packages/runner/src/ui/ChoicePanel.module.css` — add provisional/stochastic visual styles (modify)

## Out of Scope

- Engine kernel changes (all done in prior tickets)
- Worker/bridge changes (done in 009)
- Diagnostics display (separate dev tooling concern)
- Lazy/on-demand refinement of provisional options (future spec)
- Store changes (resolution field flows through existing `ChoicePendingRequest`)

## Acceptance Criteria

### Tests That Must Pass

1. New test: option with `resolution: 'exact'` + `legality: 'legal'` renders with standard enabled style
2. New test: option with `resolution: 'provisional'` + `legality: 'unknown'` renders with provisional indicator
3. New test: option with missing `resolution` renders normally (backward compatibility)
4. New test: ARIA labels include resolution status for provisional/stochastic options
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. `unknown` options remain selectable regardless of `resolution` value (spec 3.4).
2. Only `illegal` options are blocked from selection — no change to interaction behavior.
3. Visual distinction is subtle — not alarming or confusing to players.
4. Backward-compatible: options without `resolution` field display normally.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/ui/choose-n-resolution-display.test.ts` — rendering variants, ARIA labels, backward compatibility

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-16
- **What changed**:
  - `packages/runner/src/model/render-model.ts` — added `resolution?: ChooseNOptionResolution` to `RenderChoiceOption`
  - `packages/runner/src/model/derive-render-model.ts` — forwards `resolution` from engine `ChoiceOption` to render model
  - `packages/runner/src/ui/ChoicePanel.tsx` — both `discreteOne` and `MultiSelectMode` renderers now apply resolution-aware CSS classes, ARIA labels (`(unverified)`/`(uncertain)`), and visual indicators (`?`/`~`)
  - `packages/runner/src/ui/ChoicePanel.module.css` — added `.optionProvisional` (dashed border), `.optionStochastic` (dotted border), `.resolutionIndicator`
  - `packages/runner/test/ui/choose-n-resolution-display.test.ts` — 8 new tests
- **Deviations**: Tooltip (section 3) was not implemented — the choice panel does not currently have tooltip infrastructure, and adding it was out of scope for a LOW-priority polish ticket. Resolution info is conveyed via visual indicators and ARIA labels instead.
- **Verification**: 1571 runner tests pass, typecheck clean.
