# Spec 35: Monorepo Restructure & Build System

**Status**: ACTIVE
**Priority**: P0 (must come first)
**Complexity**: M
**Dependencies**: None
**Roadmap**: [35-00-frontend-implementation-roadmap.md](./35-00-frontend-implementation-roadmap.md)
**Design doc**: [brainstorming/browser-based-game-runner.md](../brainstorming/browser-based-game-runner.md)

---

## Objective

Restructure the LudoForge-LLM repository from a single-package project into a pnpm workspaces monorepo with Turborepo task orchestration. Move the existing engine code into `packages/engine/` and create a new `packages/runner/` package with a Vite + React 19 scaffold.

**Success criteria**: `pnpm turbo build` succeeds, all existing engine tests pass from `packages/engine/`, and the runner scaffold renders a blank React page.

---

## Constraints

- Git history must be preserved for moved files (use `git mv`).
- No changes to engine source code or public API — move only.
- Existing CI pipeline must continue to work (update paths as needed).
- Engine package must be importable by the runner package via TypeScript project references.
- Engine remains usable standalone (its `package.json` must be self-contained).

---

## Deliverables

### D1: pnpm Workspaces Configuration

Create `pnpm-workspace.yaml` at repo root:

```yaml
packages:
  - "packages/*"
```

### D2: Turborepo Setup

Create `turbo.json` at repo root with task pipeline:

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

### D3: Move Engine Code to `packages/engine/`

Move the following into `packages/engine/`:

| Current Location | New Location |
|-----------------|--------------|
| `src/` | `packages/engine/src/` |
| `test/` | `packages/engine/test/` |
| `schemas/` | `packages/engine/schemas/` |
| `data/` | `packages/engine/data/` |
| `tsconfig.json` | `packages/engine/tsconfig.json` (adapted) |
| `package.json` | `packages/engine/package.json` (adapted) |

The engine package name: `@ludoforge/engine`.

Engine `package.json` must:
- Export types and compiled JS from `dist/`
- Retain all existing scripts (`build`, `test`, `lint`, `typecheck`, etc.)
- Keep existing dependencies (`yaml`, `zod`) and devDependencies

### D4: Shared TypeScript Configuration

Create `tsconfig.base.json` at repo root with shared compiler options. Both `packages/engine/tsconfig.json` and `packages/runner/tsconfig.json` extend it.

```jsonc
// tsconfig.base.json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

### D5: Create Runner Package Scaffold

Create `packages/runner/` with:

- `package.json` (name: `@ludoforge/runner`, type: module)
- `tsconfig.json` (extends base, includes TypeScript project reference to `@ludoforge/engine`)
- `vite.config.ts` (React plugin, resolve alias for engine package)
- `index.html` (Vite entry point)
- `src/main.tsx` (React 19 root render)
- `src/App.tsx` (placeholder component that imports a type from `@ludoforge/engine` to verify cross-package resolution)

Dependencies for runner:
- `react`, `react-dom` (v19)
- `@vitejs/plugin-react`
- `vite`
- `typescript`
- `@ludoforge/engine` (workspace dependency)

### D6: Root Package Configuration

Update or create root `package.json`:
- `"private": true`
- No direct dependencies (all in packages)
- Scripts delegate to Turborepo: `"build": "turbo build"`, `"test": "turbo test"`, etc.
- Dev dependencies: `turbo`

### D7: CI Pipeline Updates

Update any CI configuration (GitHub Actions, etc.) to:
- Install with `pnpm install`
- Build with `pnpm turbo build`
- Test with `pnpm turbo test`
- Lint with `pnpm turbo lint`

### D8: Verification

- [ ] `pnpm install` completes without errors
- [ ] `pnpm turbo build` compiles both packages
- [ ] `pnpm -F @ludoforge/engine test` passes all existing tests
- [ ] `pnpm -F @ludoforge/runner dev` starts Vite dev server
- [ ] Runner scaffold renders a React component that successfully imports an engine type
- [ ] `git log --follow packages/engine/src/kernel/index.ts` shows full history

---

## Implementation Notes

### File Move Strategy

Use `git mv` for all moves to preserve history:

```bash
mkdir -p packages/engine
git mv src packages/engine/src
git mv test packages/engine/test
git mv schemas packages/engine/schemas
git mv data packages/engine/data
```

### Import Path Updates

After moving to `packages/engine/`, internal imports within engine code should not change (they use relative paths). The engine's `tsconfig.json` paths may need adjustment if any root-relative paths were used.

### ESLint Configuration

The existing `.eslintrc` or `eslint.config.js` should move to `packages/engine/` or be adapted for monorepo use (root config with package-specific overrides).

### Node.js Test Runner Compatibility

The engine uses Node.js built-in test runner (`node --test`). Verify that test discovery and execution still work from the `packages/engine/` directory. Update npm scripts in `packages/engine/package.json` to use correct relative paths.

---

## Out of Scope

- Runner implementation beyond the scaffold (Specs 36+)
- Changes to engine source code or API
- Deployment configuration (static hosting, CDN)
- Package publishing to npm
