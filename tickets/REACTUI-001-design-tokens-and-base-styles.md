# REACTUI-001: Design Tokens and Base Styles

**Spec**: 39 (React DOM UI Layer) — Deliverable D1
**Priority**: P0 (blocks all other REACTUI tickets)
**Estimated complexity**: S

---

## Summary

Create the CSS design token system and shared composable styles that every subsequent UI component will import. This establishes the visual language of the DOM overlay layer.

---

## File List

### New files

| File | Purpose |
|------|---------|
| `packages/runner/src/ui/tokens.css` | CSS custom properties: faction palette, UI chrome, spacing, typography, z-index |
| `packages/runner/src/ui/shared.module.css` | Composable CSS Module patterns: `.panel`, `.rounded`, `.interactive`, etc. |

### Modified files

| File | Change |
|------|--------|
| `packages/runner/src/main.tsx` | Add `import './ui/tokens.css'` so tokens are globally available |

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
| `packages/runner/test/ui/tokens.test.ts` | Verify `tokens.css` can be imported without parse errors (Vitest CSS module support) |
| `packages/runner/test/ui/shared-module.test.ts` | Verify `shared.module.css` exports the expected class names: `panel`, `panelHover`, `interactive`, `textPrimary`, `textSecondary`, `textMuted`, `srOnly` |

### Invariants

- `tokens.css` contains **only** CSS custom properties on `:root`. No element selectors, no class selectors.
- `shared.module.css` contains **only** composable classes. No element selectors.
- No JavaScript logic — these are pure CSS files.
- `main.tsx` import is the **only** global side-effect import for tokens.
- All token values match the exact values from Spec 39 section "Styling Strategy".
- No game-specific values (no "FITL", no "poker" references).
