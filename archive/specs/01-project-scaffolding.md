# Spec 01: Project Scaffolding & Build System

**Status**: ✅ COMPLETED
**Priority**: P0 (critical path)
**Complexity**: S
**Dependencies**: none
**Estimated effort**: 1 day
**Source sections**: Brainstorming doc intro, CLAUDE.md conventions

## Overview

Bootstrap the TypeScript project with strict configuration, test infrastructure, and all required dependencies. This spec delivers a compilable, testable project skeleton that all subsequent specs build upon.

## Scope

### In Scope
- `package.json` with production and dev dependencies
- `tsconfig.json` with strict TypeScript configuration
- Source directory structure for all 5 source modules + top-level `schemas/`
- Test directory structure (unit, integration, e2e, performance, memory)
- npm scripts for build, test, and type checking
- Smoke test proving the build pipeline works
- `.gitignore` updates for build artifacts

### Out of Scope
- Any actual type definitions (Spec 02)
- Any implementation code beyond smoke tests
- CI/CD configuration
- Linting tools beyond `tsc --noEmit`
- Documentation generation

## Key Types & Interfaces

No types defined in this spec. This spec creates the empty module directories that Spec 02 and beyond will populate.

## Implementation Requirements

### package.json

**Production dependencies**:
- `yaml` (eemeli/yaml) — YAML 1.2 strict parser. NOT `js-yaml`.
- `zod` — runtime schema validation

**Dev dependencies**:
- `typescript` — TypeScript compiler
- `@types/node` — Node.js type definitions

**Package metadata**:
```json
{
  "name": "ludoforge-llm",
  "version": "0.0.0",
  "description": "LLM-driven board game evolution engine",
  "license": "GPL-3.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=18.0.0" }
}
```

- `"type": "module"` is **required** for ESM output. With `"module": "Node16"` in tsconfig, TypeScript infers the output format from this field. Without it, output defaults to CommonJS and the smoke test's static ESM imports will fail.
- `"engines"` documents the minimum Node.js version needed for `node --test`.

**npm scripts**:
```json
{
  "build": "tsc",
  "clean": "rm -rf dist",
  "typecheck": "tsc --noEmit",
  "pretest": "npm run build",
  "test:unit": "node --test dist/test/unit/",
  "test:integration": "node --test dist/test/integration/",
  "test:e2e": "node --test dist/test/e2e/",
  "test": "node --test dist/test/unit/ dist/test/integration/",
  "test:all": "node --test dist/test/unit/ dist/test/integration/ dist/test/e2e/"
}
```

Notes:
- Tests run against compiled JS in `dist/` since Node.js built-in test runner requires JS files.
- `pretest` automatically runs `npm run build` before any `npm test` invocation, so developers never forget the build step.
- `clean` wipes `dist/` for a fresh build.
- `test:all` includes e2e tests in addition to unit + integration.

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictPropertyInitialization": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Key settings:
- `strict: true` — enforces all strict mode flags
- `noUncheckedIndexedAccess: true` — array/object indexing returns `T | undefined`
- `exactOptionalPropertyTypes: true` — prevents `undefined` assignment to optional properties
- `target: ES2022` — enables modern JS features (top-level await, etc.)
- `module: Node16` / `moduleResolution: Node16` — ESM support with Node.js resolution

### Directory Structure

```
src/
  kernel/          # Pure deterministic game engine
    index.ts       # Module barrel export (empty initially)
  cnl/             # Game Spec parsing + compilation
    index.ts
  agents/          # Bot implementations
    index.ts
  sim/             # Simulation runner + evaluation
    index.ts
  cli/             # Developer CLI commands
    index.ts
schemas/           # JSON Schema files (top-level, populated by Spec 02)
test/
  unit/            # Individual function tests
  integration/     # Cross-module tests
  e2e/             # Full pipeline tests
  performance/     # Benchmarks
  memory/          # Memory leak detection
```

`schemas/` is a top-level directory (not under `src/`) because it contains JSON Schema files, not TypeScript source modules. This aligns with Spec 02's file layout (`schemas/GameDef.schema.json` etc.).

Each `src/*/index.ts` starts as an empty barrel export file:
```typescript
// Module: <name>
// Implementation added by subsequent specs.
export {};
```

### .gitignore

Replace the existing GitHub Node.js template with a minimal, project-specific `.gitignore`:

```
# Build output
dist/

# Dependencies
node_modules/

# TypeScript
*.tsbuildinfo

# Test coverage
coverage/
*.lcov

# Environment
.env
.env.*
!.env.example

# Logs
*.log

# OS
.DS_Store
Thumbs.db
```

## Invariants

1. `npx tsc` compiles with zero errors on the empty project
2. `node --test dist/test/unit/` runs without crashing (even with minimal tests)
3. `import { parse } from 'yaml'` resolves (eemeli/yaml installed correctly)
4. `import { z } from 'zod'` resolves
5. TypeScript strict mode is enabled — `noImplicitAny`, `strictNullChecks`, and all strict flags active
6. All 5 source module directories under `src/` (kernel, cnl, agents, sim, cli) exist and contain a valid `index.ts`
7. All test directories under `test/` exist
8. `schemas/` directory exists at project root

## Required Tests

### Unit Tests

**Smoke test** (`test/unit/smoke.test.ts`):
```typescript
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';

describe('project smoke test', () => {
  it('imports from kernel module', async () => {
    const mod = await import('../../src/kernel/index.js');
    assert.ok(mod !== undefined);
  });

  it('imports from cnl module', async () => {
    const mod = await import('../../src/cnl/index.js');
    assert.ok(mod !== undefined);
  });

  it('imports from agents module', async () => {
    const mod = await import('../../src/agents/index.js');
    assert.ok(mod !== undefined);
  });

  it('imports from sim module', async () => {
    const mod = await import('../../src/sim/index.js');
    assert.ok(mod !== undefined);
  });

  it('imports from cli module', async () => {
    const mod = await import('../../src/cli/index.js');
    assert.ok(mod !== undefined);
  });

  it('imports yaml (eemeli/yaml)', async () => {
    const { parse } = await import('yaml');
    assert.equal(typeof parse, 'function');
  });

  it('imports zod', async () => {
    const { z } = await import('zod');
    assert.equal(typeof z.object, 'function');
  });
});
```

**Build test**: `npx tsc` exits with code 0.

### Integration Tests

None for this spec. Integration tests begin with Spec 02.

### Property Tests

None for this spec.

### Golden Tests

None for this spec.

## Acceptance Criteria

- [ ] `npm install` succeeds with no errors
- [ ] `npx tsc` compiles with zero errors and zero warnings
- [ ] `npx tsc --noEmit` passes
- [ ] `npm test` succeeds (pretest auto-builds, then runs unit + integration)
- [ ] `yaml` package version is eemeli/yaml (not js-yaml)
- [ ] TypeScript strict mode fully enabled (verified in tsconfig.json)
- [ ] `"type": "module"` present in package.json
- [ ] All 5 source module directories under `src/` exist with barrel exports
- [ ] `schemas/` directory exists at project root
- [ ] All 5 test directories exist
- [ ] `dist/` directory is in `.gitignore`

## Files to Create/Modify

```
package.json                    # NEW — project manifest
tsconfig.json                   # NEW — TypeScript configuration
.gitignore                      # REPLACE — minimal project-specific entries
src/kernel/index.ts             # NEW — empty barrel export
src/cnl/index.ts                # NEW — empty barrel export
src/agents/index.ts             # NEW — empty barrel export
src/sim/index.ts                # NEW — empty barrel export
src/cli/index.ts                # NEW — empty barrel export
schemas/                        # NEW — top-level directory for JSON Schema files
test/unit/smoke.test.ts         # NEW — smoke test
test/integration/               # NEW — empty directory
test/e2e/                       # NEW — empty directory
test/performance/               # NEW — empty directory
test/memory/                    # NEW — empty directory
```

## Outcome

- Completion date: February 10, 2026
- What changed:
  - Added TypeScript project scaffold with strict `tsconfig.json`
  - Added `package.json` with required dependencies (`yaml`, `zod`) and dev dependencies (`typescript`, `@types/node`)
  - Added source module barrels under `src/kernel`, `src/cnl`, `src/agents`, `src/sim`, and `src/cli`
  - Added top-level `schemas/` directory
  - Added test folders: `test/unit`, `test/integration`, `test/e2e`, `test/performance`, `test/memory`
  - Added smoke test at `test/unit/smoke.test.ts`
  - Replaced `.gitignore` with project-specific minimal entries
- Deviations from original plan:
  - Updated test npm scripts to use `**/*.test.js` globs instead of directory paths, because `node --test` on Node.js 22 fails on bare directory arguments.
- Verification results:
  - `npm install` passed
  - `npx tsc` passed
  - `npx tsc --noEmit` passed
  - `npm test` passed (unit smoke test executed successfully)
