# MONOREPO-007: Create Runner Package Scaffold

**Spec**: 35 — Monorepo Restructure & Build System (D5)
**Priority**: P0
**Depends on**: MONOREPO-005, MONOREPO-006
**Blocks**: MONOREPO-008

---

## Objective

Create the `packages/runner/` package: a Vite + React 19 scaffold that renders a blank page and imports a type from `@ludoforge/engine` to verify cross-package TypeScript project reference resolution. This is a scaffold only — no game runner implementation.

---

## Tasks

### 1. Create `packages/runner/package.json`

```jsonc
{
  "name": "@ludoforge/runner",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit",
    "preview": "vite preview"
  },
  "dependencies": {
    "@ludoforge/engine": "workspace:*",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.6",
    "@vitejs/plugin-react": "^4.6.0",
    "typescript": "^5.9.2",
    "vite": "^7.0.0"
  }
}
```

### 2. Create `packages/runner/tsconfig.json`

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": "src",
    "noEmit": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"],
  "references": [
    { "path": "../engine" }
  ]
}
```

### 3. Create `packages/runner/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
```

No resolve aliases — pnpm workspace resolution handles `@ludoforge/engine` imports.

### 4. Create `packages/runner/index.html`

Standard Vite entry HTML with `<div id="root">` and `<script type="module" src="/src/main.tsx">`.

### 5. Create `packages/runner/src/main.tsx`

React 19 root render into `#root`.

### 6. Create `packages/runner/src/App.tsx`

Placeholder component that:
- Imports a type from `@ludoforge/engine` (e.g., `GameDef` or similar) to verify cross-package resolution.
- Renders a minimal message like "LudoForge Runner" in an `<h1>`.

### 7. Run `pnpm install` to resolve the workspace dependency.

### 8. Verify:
- `pnpm -F @ludoforge/runner dev` starts Vite dev server without errors.
- `pnpm -F @ludoforge/runner typecheck` passes.
- `pnpm turbo build` builds both engine and runner.

---

## Files Expected to Touch

| Action | File |
|--------|------|
| Create | `packages/runner/package.json` |
| Create | `packages/runner/tsconfig.json` |
| Create | `packages/runner/vite.config.ts` |
| Create | `packages/runner/index.html` |
| Create | `packages/runner/src/main.tsx` |
| Create | `packages/runner/src/App.tsx` |
| Regenerate | `pnpm-lock.yaml` (new dependencies) |

---

## Out of Scope

- Implementing any game runner features (Specs 36–42).
- Adding PixiJS, Zustand, Comlink, GSAP, or any runner runtime dependencies.
- Adding React Router, state management, or complex component structure.
- Adding tests for the runner scaffold (it's a placeholder).
- Modifying engine code or engine configuration.
- Adding Vite resolve aliases (workspace protocol handles imports).
- Adding React/JSX ESLint rules (can be done in a follow-up if needed).

---

## Acceptance Criteria

### Tests that must pass

- `pnpm -F @ludoforge/runner typecheck` exits 0.
- `pnpm turbo build` exits 0 (both engine and runner build).
- `pnpm -F @ludoforge/engine test` still passes (engine unaffected).

### Invariants that must remain true

- `packages/runner/package.json` has `"name": "@ludoforge/runner"`.
- `packages/runner/package.json` depends on `"@ludoforge/engine": "workspace:*"`.
- `packages/runner/tsconfig.json` has `"references": [{ "path": "../engine" }]`.
- `packages/runner/tsconfig.json` extends `../../tsconfig.base.json`.
- `packages/runner/src/App.tsx` imports at least one type from `@ludoforge/engine`.
- No Vite resolve aliases used (imports resolve via workspace protocol).
- `pnpm -F @ludoforge/runner dev` starts Vite dev server and serves the React app.
- No changes to engine source, tests, or configuration.
- Runner has zero game-specific logic — it's a blank scaffold.
