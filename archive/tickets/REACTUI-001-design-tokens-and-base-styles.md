# REACTUI-001: Design Tokens and Base Styles

**Spec**: 39 (React DOM UI Layer) — Deliverable D1
**Priority**: P0 (blocks all other REACTUI tickets)
**Estimated complexity**: S
**Status**: ✅ COMPLETED

---

## Summary

Create the CSS design token system and shared composable styles that every subsequent UI component will import. This establishes the visual language of the DOM overlay layer.

---

## Reassessed Assumptions and Scope Corrections

### Corrected baseline assumptions (repo reality)

- `packages/runner/src/ui/` does **not** exist yet and must be created by this ticket.
- `packages/runner/src/App.tsx` is still a minimal placeholder and does not mount Spec 39 UI shell components yet.
- No UI-layer test directory exists under `packages/runner/test/ui/`; this ticket creates it.
- Runner Vitest is currently Node-environment (`environment: 'node'`) and only includes `test/**/*.test.ts`.

### Scope adjustments

- This ticket remains strictly **D1 foundation only** (tokens + shared styles + global token import).
- To make acceptance tests deterministic, this ticket may perform **minimal Vitest config extension** required for CSS module import assertions. No component/runtime behavior changes beyond this are allowed.
- No `GameContainer`, no overlay components, no lifecycle gating logic. Those remain in later REACTUI tickets.

### Architectural rationale

- Establishing a single token + shared-style entry point now keeps future REACTUI components DRY and prevents duplicated per-component style primitives.
- Minimal test harness support for CSS imports now avoids ad hoc test workarounds in later tickets and keeps style contracts verified at the module boundary.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/tokens.css` | CSS custom properties: faction palette, UI chrome, spacing, typography, z-index |
| `packages/runner/src/ui/shared.module.css` | Composable CSS Module patterns: `.panel`, `.rounded`, `.interactive`, etc. |
| `packages/runner/test/ui/tokens.test.ts` | Verifies token stylesheet import path resolves in test harness |
| `packages/runner/test/ui/shared-module.test.ts` | Verifies shared CSS module exposes expected class keys |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/main.tsx` | Add `import './ui/tokens.css'` so tokens are globally available |
| `packages/runner/vitest.config.ts` | Minimal update (if needed) to support CSS-module import assertions under current test environment |

---

## Detailed Requirements

### `tokens.css`

Define CSS custom properties on `:root` exactly as specified in Spec 39 "Styling Strategy":

- **Faction palette**: `--faction-0` through `--faction-3` (generic defaults)
- **UI chrome**: `--bg-panel`, `--bg-panel-hover`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border-subtle`, `--accent`, `--danger`, `--success`
- **Spacing scale**: `--space-xs` (4px), `--space-sm` (8px), `--space-md` (16px), `--space-lg` (24px), `--space-xl` (32px)
- **Typography**: `--font-mono`, `--font-ui`, `--font-size-sm` (12px), `--font-size-md` (14px), `--font-size-lg` (18px), `--font-size-xl` (24px)
- **Z-index layers**: `--z-canvas` (0), `--z-overlay` (10), `--z-panel` (20), `--z-tooltip` (30), `--z-modal` (40)

### `shared.module.css`

Composable base patterns via `composes:`:

- `.panel`: `--bg-panel` background, `--border-subtle` border, border-radius, padding
- `.panelHover`: extends `.panel` with `--bg-panel-hover` on `:hover`
- `.interactive`: `pointer-events: auto`, cursor pointer
- `.textPrimary`, `.textSecondary`, `.textMuted`: color classes
- `.fontMono`, `.fontUi`: font-family classes
- `.srOnly`: screen-reader-only (visually hidden but accessible)

---

## Out of Scope

- Component-specific `.module.css` files (created in their own tickets)
- Visual config loading and theming (Spec 42)
- Runtime faction color overrides (Spec 42 visual config)
- Mobile optimization
- Dark/light mode toggling

---

## Acceptance Criteria

### Tests that must pass

| Test file | Test |
|-----------|------|
| `packages/runner/test/ui/tokens.test.ts` | Verify `tokens.css` import resolves without transform/runtime errors |
| `packages/runner/test/ui/shared-module.test.ts` | Verify `shared.module.css` exports class keys: `panel`, `panelHover`, `interactive`, `textPrimary`, `textSecondary`, `textMuted`, `fontMono`, `fontUi`, `srOnly` |

### Invariants

- `tokens.css` contains **only** CSS custom properties on `:root`. No element selectors, no class selectors.
- `shared.module.css` contains **only** composable classes. No element selectors.
- No JavaScript logic — these are pure CSS files.
- `main.tsx` import is the **only** global side-effect import for tokens.
- All token values match the exact values from Spec 39 section "Styling Strategy".
- No game-specific values (no "FITL", no "poker" references).

---

## Outcome

- **Completion date**: 2026-02-17
- **What changed vs originally planned**:
  - Implemented planned D1 artifacts: `tokens.css`, `shared.module.css`, and global token import in `main.tsx`.
  - Added planned UI tests under `packages/runner/test/ui/`.
  - Added one minimal, scope-justified support artifact not explicit in original ticket: `packages/runner/src/types/css.d.ts` to satisfy TypeScript module typing for CSS imports.
  - Added minimal Vitest config support (`css: true`) to ensure CSS imports are testable in the current Node-based runner test environment.
- **Deviations**:
  - No runtime/component behavior deviations. Only test/type harness support was added to make D1 verifiable in the current repo baseline.
- **Verification**:
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
