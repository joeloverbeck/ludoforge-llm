# Spec 35: Monorepo Restructure & Build System

**Status**: ✅ COMPLETED
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
- No changes to engine source code or public API — move only. **Exception**: `test/helpers/production-spec-helpers.ts` requires a path fix for `data/` resolution (see Implementation Notes — Path Resolution).
- Engine package must be importable by the runner package via TypeScript project references.
- Engine remains usable standalone (its `package.json` must be self-contained).
- CI is out of scope (no pipeline exists currently — see D7).

---

## Deliverables

### D0: npm to pnpm Migration

Before restructuring, migrate from npm to pnpm:

1. Delete `package-lock.json`
2. Delete `node_modules/`
3. Install pnpm (if not present): `corepack enable && corepack prepare pnpm@10.12.1 --activate`
4. Create `.npmrc` at root:
   ```
   shamefully-hoist=false
   strict-peer-dependencies=true
   ```
5. Add `"packageManager": "pnpm@10.12.1"` to root `package.json`

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
    "schema:artifacts": {
      "dependsOn": ["build"],
      "outputs": ["schemas/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "clean": {
      "cache": false
    }
  }
}
```

Tasks beyond the original spec:
- `schema:artifacts` — engine's schema generation pipeline (`dependsOn: ["build"]` since it imports compiled types)
- `dev` — runner's Vite dev server (non-cacheable, persistent)
- `clean` — per-package cleanup (non-cacheable)

### D3: Move Engine Code to `packages/engine/`

Move the following into `packages/engine/`:

| Current Location | New Location |
|-----------------|--------------|
| `src/` | `packages/engine/src/` |
| `test/` | `packages/engine/test/` |
| `schemas/` | `packages/engine/schemas/` |
| `scripts/` | `packages/engine/scripts/` |
| `tsconfig.json` | `packages/engine/tsconfig.json` (adapted) |
| `package.json` | `packages/engine/package.json` (adapted) |

**Stays at root:**

- `data/` — shared game data (used by engine tests and runner)
- `docs/`, `specs/`, `tickets/`, `archive/`, `brainstorming/`, `reports/` — project management
- `.claude/`, `CLAUDE.md`, `AGENTS.md` — AI assistant config
- `README.md`, `LICENSE`, `.gitignore` — repo metadata
- `eslint.config.js` — shared lint config (see ESLint Strategy section)

The engine package name: `@ludoforge/engine`.

**Engine `package.json`:**

```jsonc
{
  "name": "@ludoforge/engine",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "exports": {
    ".": {
      "types": "./dist/src/kernel/index.d.ts",
      "import": "./dist/src/kernel/index.js"
    },
    "./cnl": {
      "types": "./dist/src/cnl/index.d.ts",
      "import": "./dist/src/cnl/index.js"
    },
    "./agents": {
      "types": "./dist/src/agents/index.d.ts",
      "import": "./dist/src/agents/index.js"
    },
    "./sim": {
      "types": "./dist/src/sim/index.d.ts",
      "import": "./dist/src/sim/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "lint": "eslint . --ext .ts",
    "typecheck": "tsc --noEmit",
    "schema:artifacts": "node scripts/schema-artifacts.mjs",
    "schema:artifacts:check": "node scripts/schema-artifacts.mjs --check",
    "test:unit": "node --test \"dist/test/unit/**/*.test.js\"",
    "test:integration": "node --test \"dist/test/integration/**/*.test.js\"",
    "test:e2e": "node --test \"dist/test/e2e/**/*.test.js\"",
    "test": "npm run schema:artifacts:check && node --test \"dist/test/unit/**/*.test.js\" \"dist/test/integration/**/*.test.js\"",
    "test:all": "node --test \"dist/test/unit/**/*.test.js\" \"dist/test/integration/**/*.test.js\" \"dist/test/e2e/**/*.test.js\""
  },
  "dependencies": {
    "yaml": "^2.8.0",
    "zod": "^4.1.5"
  },
  "devDependencies": {
    "@types/node": "^24.3.1",
    "ajv": "^8.17.1",
    "typescript": "^5.9.2"
  }
}
```

Key changes from current `package.json`:
- `exports` field with granular subpath exports (kernel, cnl, agents, sim)
- `"type": "module"` carried over explicitly
- Removed `pretest` hook — Turborepo's `test.dependsOn: ["build"]` handles the build-before-test sequence
- Removed `lint:fix` — runs via root turbo
- `schema:artifacts` simplified from `schema:artifacts:generate`
- ESLint itself becomes a root devDependency (shared), not per-package

### D4: Shared TypeScript Configuration

Create `tsconfig.base.json` at repo root with shared compiler options (minimal — no module system settings):

```jsonc
// tsconfig.base.json (root)
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

Design decisions:
- **Removed** from base: `module`, `moduleResolution` — these differ per package (Node16 for engine, bundler for runner)
- **Added** to base: `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — carried from the current `tsconfig.json` (valuable strict options)
- **Kept**: `isolatedModules: true` — required for Vite in runner; verified via pre-move step

**Engine `tsconfig.json`** (`packages/engine/tsconfig.json`):

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": ".",
    "composite": true
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Note: `composite: true` is **required** for TypeScript project references to work.

**Runner `tsconfig.json`** (`packages/runner/tsconfig.json`):

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

### D5: Create Runner Package Scaffold

Create `packages/runner/` with:

- `package.json` (name: `@ludoforge/runner`, type: module)
- `tsconfig.json` (extends base, includes TypeScript project reference to `@ludoforge/engine`)
- `vite.config.ts` (React plugin)
- `index.html` (Vite entry point)
- `src/main.tsx` (React 19 root render)
- `src/App.tsx` (placeholder component that imports a type from `@ludoforge/engine` to verify cross-package resolution)

`vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
```

No resolve alias is needed — pnpm workspace resolution handles `@ludoforge/engine` imports without aliases.

Dependencies for runner:
- `react`, `react-dom` (v19)
- `@vitejs/plugin-react`
- `vite`
- `typescript`
- `@ludoforge/engine` (workspace dependency: `"workspace:*"`)

### D6: Root Package Configuration

Create root `package.json`:

```jsonc
{
  "name": "ludoforge-llm",
  "private": true,
  "packageManager": "pnpm@10.12.1",
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "dev": "turbo dev",
    "clean": "turbo clean"
  },
  "devDependencies": {
    "@eslint/js": "^9.34.0",
    "eslint": "^9.34.0",
    "globals": "^16.3.0",
    "typescript-eslint": "^8.41.0",
    "turbo": "^2.5.0"
  }
}
```

Notes:
- `packageManager` field for corepack
- `dev` and `clean` scripts added
- ESLint devDependencies hoisted to root (shared lint config)
- No `version`, `description`, `license` — root is a private workspace root, not published

### D7: CI Pipeline Updates

CI is out of scope — no pipeline exists currently (no `.github/workflows/`). When CI is added later, use:
- `pnpm install` for dependency installation
- `pnpm turbo build` for builds
- `pnpm turbo test` for tests
- `pnpm turbo lint` for linting

### D8: Verification

**Pre-move verification** (before restructuring):
- [ ] `npx tsc --isolatedModules --noEmit` passes (no const enum / namespace issues)
- [ ] `npm test` passes (baseline before move)

**Post-move verification:**
- [ ] `pnpm install` completes without errors
- [ ] `pnpm turbo build` compiles both packages
- [ ] `pnpm -F @ludoforge/engine test` passes all existing tests
- [ ] `pnpm -F @ludoforge/runner dev` starts Vite dev server
- [ ] Runner scaffold renders a React component that imports a type from `@ludoforge/engine`
- [ ] `git log --follow packages/engine/src/kernel/index.ts` shows full history
- [ ] Engine test that compiles FITL from `data/` still works (path resolution verified)
- [ ] `pnpm turbo schema:artifacts` generates schemas correctly
- [ ] No Vite resolve aliases used (imports resolve via workspace protocol)

---

## Implementation Notes

### File Move Strategy

Use `git mv` for all moves to preserve history:

```bash
mkdir -p packages/engine
git mv src packages/engine/src
git mv test packages/engine/test
git mv schemas packages/engine/schemas
git mv scripts packages/engine/scripts
# data/ stays at root
```

### Path Resolution — `data/` in Engine Tests (CRITICAL)

Engine tests reference `data/` via `process.cwd()` in `test/helpers/production-spec-helpers.ts` (lines 13-15):

```typescript
const FITL_PRODUCTION_SPEC_PATH = join(process.cwd(), 'data', 'games', 'fire-in-the-lake');
const TEXAS_PRODUCTION_SPEC_PATH = join(process.cwd(), 'data', 'games', 'texas-holdem');
const FIXTURE_BASE_PATH = join(process.cwd(), 'test', 'fixtures', 'cnl', 'compiler');
```

After the move, `pnpm -F @ludoforge/engine test` runs with `cwd = packages/engine/`. The `data/` paths break (looking for `packages/engine/data/games/...` which doesn't exist). The `FIXTURE_BASE_PATH` is fine (`test/` moves with engine).

**Fix**: Change the `data/` paths to navigate to repo root: `join(process.cwd(), '..', '..', 'data', 'games', ...)`. This is the only code change needed in the engine beyond file moves — a test infrastructure fix necessitated by the directory restructure, not a public API change.

### `pretest` Removal

Remove `pretest` from engine's `package.json`. Turborepo's task graph (`test` depends on `build`) replaces it. Running `pnpm -F @ludoforge/engine test` directly (outside Turborepo) still works — the engine's `test` script runs `node --test` against already-built JS in `dist/`.

### Import Path Updates

After moving to `packages/engine/`, internal imports within engine code should not change (they use relative paths). The engine's `tsconfig.json` is adapted from the current one (see D4).

### ESLint Strategy

Keep `eslint.config.js` at repo root. It applies to all `**/*.ts` files across packages. The current flat config (ESLint v9) works for monorepos without modification — it already ignores `archive/`, `dist/`, `node_modules/`.

When the runner is scaffolded (D5), add React/JSX rules to the root config (or create `packages/runner/eslint.config.js` that extends the root).

ESLint devDependencies (`eslint`, `@eslint/js`, `typescript-eslint`, `globals`) live in the root `package.json`.

### Node.js Test Runner Compatibility

The engine uses Node.js built-in test runner (`node --test`). Verify that test discovery and execution still work from the `packages/engine/` directory. The npm scripts in `packages/engine/package.json` use correct relative glob paths (see D3).

---

## Path Resolution Analysis

Verified all `process.cwd()` and `import.meta.url` usage in the codebase:

| File | Mechanism | Status | Notes |
|------|-----------|--------|-------|
| `test/helpers/production-spec-helpers.ts` (lines 13-14) | `process.cwd()` + `data/` | **BREAKS** | Needs fix: navigate to repo root (see Implementation Notes) |
| `test/helpers/production-spec-helpers.ts` (line 15) | `process.cwd()` + `test/fixtures/` | **OK** | `test/` moves with engine |
| `scripts/schema-artifacts.mjs` (lines 9-11) | `import.meta.url` | **OK** | Resolves relative to itself; after move `rootDir = packages/engine/` which is correct since `schemas/` moves with engine |
| `scripts/schema-artifacts.mjs` (line 7) | Relative import `../dist/src/kernel/...` | **OK** | Correct relative to `packages/engine/scripts/` |

---

## Out of Scope

- Runner implementation beyond the scaffold (Specs 36+)
- Changes to engine source code or API (except the `data/` path fix in test helper — see Constraints)
- Deployment configuration (static hosting, CDN)
- Package publishing to npm
- CI pipeline setup (see D7)

---

## Outcome

- **Completion date**: 2026-02-17
- **What was actually changed**:
  - Completed monorepo migration from single-package layout to pnpm workspaces + Turborepo.
  - Relocated engine code to `packages/engine/` with history-preserving rename operations.
  - Added `@ludoforge/engine` and `@ludoforge/runner` package boundaries and configs.
  - Added shared TS base config and package-level TS configs.
  - Applied required `data/` root path fix in engine test helper after relocation.
  - Updated project documentation to monorepo command/path conventions.
- **Deviations from original plan**:
  - Migration steps were completed as an uninterrupted sequence so repository build/test/lint/typecheck stayed green before archival.
  - Engine `test` script uses `pnpm run schema:artifacts:check` for package-manager consistency.
- **Verification results**:
  - `pnpm turbo build`: pass
  - `pnpm turbo test`: pass (`243/243` engine tests)
  - `pnpm turbo lint`: pass
  - `pnpm turbo typecheck`: pass
  - `pnpm turbo schema:artifacts`: pass
  - `pnpm turbo build && pnpm -F @ludoforge/engine test:e2e`: pass (`3/3` e2e tests)
  - `pnpm -F @ludoforge/runner dev`: startup smoke passed
