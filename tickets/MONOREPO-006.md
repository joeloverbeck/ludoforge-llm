# MONOREPO-006: Engine Package Configuration & Path Fix

**Spec**: 35 — Monorepo Restructure & Build System (D3 package.json, D4 engine tsconfig, D6 root package.json, Path Resolution fix)
**Priority**: P0
**Depends on**: MONOREPO-004, MONOREPO-005
**Blocks**: MONOREPO-007, MONOREPO-008

---

## Objective

Configure the engine as a proper workspace package: create its `package.json` with subpath exports, create its `tsconfig.json` extending the base, update the root `package.json` for turbo-driven scripts, update `eslint.config.js` for the new directory layout, and fix the `data/` path resolution in `production-spec-helpers.ts`. After this ticket, `pnpm turbo build` and `pnpm -F @ludoforge/engine test` must succeed.

Execution policy for this ticket:
- Canonical verification path is Turborepo (`pnpm turbo ...`) to guarantee task ordering.
- Direct filtered package commands are allowed only when build outputs are already present from the same run, or when explicitly prefixed with a build step in the same command sequence.

---

## Tasks

### 1. Create `packages/engine/package.json`

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

Key differences from old root `package.json`:
- Name: `@ludoforge/engine`
- `exports` field with subpath exports
- No `pretest` (turborepo handles build-before-test)
- No `lint:fix` (run via root)
- ESLint not in devDependencies (hoisted to root)

### 2. Create `packages/engine/tsconfig.json`

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

### 3. Update root `package.json`

Transform from a single-package to a workspace root:
- Keep `"name": "ludoforge-llm"`, `"private": true`
- Add `"packageManager": "pnpm@10.12.1"` (if not already from MONOREPO-002)
- Replace scripts with turbo-driven versions:
  ```json
  "scripts": {
    "build": "turbo build",
    "test": "turbo test",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "dev": "turbo dev",
    "clean": "turbo clean"
  }
  ```
- Move ESLint deps to root devDependencies, remove engine-only deps:
  ```json
  "devDependencies": {
    "@eslint/js": "^9.34.0",
    "eslint": "^9.34.0",
    "globals": "^16.3.0",
    "typescript-eslint": "^8.41.0",
    "turbo": "^2.5.0"
  }
  ```
- Remove `dependencies` (yaml, zod move to engine)
- Remove `version`, `description`, `license` (workspace root, not published)
- Keep `"engines": { "node": ">=18.0.0" }`

### 4. Update `eslint.config.js`

The root ESLint config needs no changes to rule definitions but the `ignores` pattern should confirm it covers the new structure. Verify the existing ignores (`archive/**`, `dist/**`, `node_modules/**`) still work. Since `packages/engine/dist/` matches `dist/**` via relative resolution in flat config — confirm this or add `packages/**/dist/**` if needed.

### 4.5 Turbo outputs scope clarification (no change required)

Do **not** rewrite `turbo.json` output globs in this ticket. The existing task outputs:
- `"build": { "outputs": ["dist/**"] }`
- `"schema:artifacts": { "outputs": ["schemas/**"] }`

are evaluated relative to each workspace package task root in Turborepo, which is already the intended package-scoped behavior after the move (`packages/engine/dist/**`, `packages/engine/schemas/**`, etc.).

### 5. Fix `data/` path in `packages/engine/test/helpers/production-spec-helpers.ts`

Change lines 13-14 from:
```typescript
const FITL_PRODUCTION_SPEC_PATH = join(process.cwd(), 'data', 'games', 'fire-in-the-lake');
const TEXAS_PRODUCTION_SPEC_PATH = join(process.cwd(), 'data', 'games', 'texas-holdem');
```
To:
```typescript
const FITL_PRODUCTION_SPEC_PATH = join(process.cwd(), '..', '..', 'data', 'games', 'fire-in-the-lake');
const TEXAS_PRODUCTION_SPEC_PATH = join(process.cwd(), '..', '..', 'data', 'games', 'texas-holdem');
```

This is the ONLY source code change in the entire restructure — a test infrastructure fix necessitated by the directory move.

### 6. Run `pnpm install` to regenerate lockfile with workspace packages

### 7. Verify everything works

- `pnpm turbo build` compiles the engine
- `pnpm -F @ludoforge/engine test` passes all tests
- `pnpm turbo schema:artifacts` generates schemas correctly
- `pnpm -F @ludoforge/engine test:e2e` runs e2e tests only after an explicit build precondition (`pnpm turbo build && pnpm -F @ludoforge/engine test:e2e`)

---

## Files Expected to Touch

| Action | File |
|--------|------|
| Create | `packages/engine/package.json` |
| Create | `packages/engine/tsconfig.json` |
| Edit | `package.json` (root — transform to workspace root) |
| Edit | `eslint.config.js` (verify/update ignores for monorepo) |
| Edit | `packages/engine/test/helpers/production-spec-helpers.ts` (lines 13-14 — data/ path fix) |
| Regenerate | `pnpm-lock.yaml` |

---

## Out of Scope

- Creating `packages/runner/` (that's MONOREPO-007).
- Changing any engine source code beyond the `production-spec-helpers.ts` path fix.
- Modifying engine public API or types.
- Changing engine test logic or assertions.
- Adding React/JSX ESLint rules (that's MONOREPO-007).
- CI pipeline setup.
- Rewriting `turbo.json` output globs for package scoping (already package-relative by design).

---

## Acceptance Criteria

### Tests that must pass

- `pnpm install` exits 0 with no peer dependency errors.
- `pnpm turbo build` exits 0 and produces `packages/engine/dist/`.
- `pnpm turbo test` exits 0 (canonical build-ordered path).
- `pnpm -F @ludoforge/engine test` exits 0 with identical test count/results to MONOREPO-001 baseline when run after `pnpm turbo build`.
- `pnpm -F @ludoforge/engine test:e2e` exits 0 when run after `pnpm turbo build` (e2e tests that use `data/` paths pass).
- `pnpm turbo schema:artifacts` exits 0 and writes to `packages/engine/schemas/`.
- `pnpm turbo lint` exits 0.
- `pnpm turbo typecheck` exits 0.

### Invariants that must remain true

- `packages/engine/package.json` has `"name": "@ludoforge/engine"`.
- `packages/engine/package.json` has `exports` with 4 subpaths (`.`, `./cnl`, `./agents`, `./sim`).
- `packages/engine/tsconfig.json` extends `../../tsconfig.base.json`.
- `packages/engine/tsconfig.json` has `"composite": true`.
- Root `package.json` scripts all use `turbo` (no direct `tsc` or `node --test`).
- Verification steps do not run `pnpm turbo test` and direct `pnpm -F @ludoforge/engine test:e2e` concurrently.
- Root `package.json` has no `dependencies` (only `devDependencies`).
- Engine tests compile and reference `data/` at repo root via `../../data/`.
- `FIXTURE_BASE_PATH` in production-spec-helpers.ts still uses `process.cwd()` + `test/fixtures/...` (unchanged — `test/` moved with engine).
- The only code change in engine is the 2-line path fix in `production-spec-helpers.ts`.
- `git log --follow packages/engine/src/kernel/index.ts` still shows full pre-move history.
