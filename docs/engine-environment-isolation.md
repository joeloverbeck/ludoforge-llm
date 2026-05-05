# Engine Environment Isolation

The engine package is consumed by both Node hosts and browser hosts. Browser-safe engine modules must not import `node:*` APIs. Node-only file IO, process bootstrap, and filesystem-backed loading belong in explicitly named Node-loader files or in a directory classified as Node-only.

This convention prevents Vite/Rollup from pulling `node:*` imports into the runner browser bundle and failing on `__vite-browser-external` stubs. PR #235 fixed this failure shape by splitting Node file IO out of browser-reached modules. Spec 151 keeps that pattern as the package convention instead of adding browser stubs, aliases, `sideEffects: false`, or dual engine builds.

## Package Subpaths

Browser-safe exports:

- `@ludoforge/engine` (`./`, `packages/engine/src/kernel/index.ts`) is browser-safe by policy for future browser tools. The runner does not import it today.
- `@ludoforge/engine/runtime` (`./runtime`, `packages/engine/src/kernel/runtime.ts`) is browser-safe. As of May 5, 2026, `packages/runner/src` imports this subpath 67 times.
- `@ludoforge/engine/agents` (`./agents`, `packages/engine/src/agents/index.ts`) is browser-safe. As of May 5, 2026, `packages/runner/src` imports this subpath once.
- `@ludoforge/engine/trace` (`./trace`, `packages/engine/src/trace/index.ts`) is browser-safe. As of May 5, 2026, `packages/runner/src` imports this subpath 3 times.

Node-only exports:

- `@ludoforge/engine/cnl` (`./cnl`, `packages/engine/src/cnl/index.ts`) is Node-only by design.
- `@ludoforge/engine/sim` (`./sim`, `packages/engine/src/sim/index.ts`) is Node-only by design.
- Future explicit Node-loader paths are Node-only. Do not re-export them from browser-safe barrels.

## Naming And Split Pattern

Any engine source file with a top-level `node:*` import must be named `<base>-node-loader.ts`, unless it lives under a documented Node-only ignore directory.

When a browser-safe API needs nearby Node-only loading, split it into two files:

- Keep deterministic, browser-safe core logic in `<name>.ts`.
- Move filesystem access, `node:*` imports, and auto-initialization into `<name>-node-loader.ts`.
- Let the loader import the core.
- Never let the core import the loader.

Callers in tests, CLI scripts, and Node bootstrap code may deep-import `*-node-loader.ts` modules. Browser-safe barrels and package subpaths must not re-export Node loaders.

## ESLint Ignore List

The Spec 151 lint rule (`151ENVISO-003`) should exempt exactly these Node-only surfaces:

- `packages/engine/src/**/*-node-loader.ts`
- `packages/engine/src/cnl/**/*.ts`

The `cnl` directory is exempt because compiler-natural-language loading and lowering are Node-only package surfaces. Other directories should not be added to the ignore list without updating this document and the rule together.

## Current Node Loader Inventory

Every `*-node-loader.ts` file under `packages/engine/src` must be listed here:

- `packages/engine/src/agents/policy-ir-node-loader.ts`
- `packages/engine/src/agents/policy-wasm-runtime-node-loader.ts`
- `packages/engine/src/kernel/data-assets-node-loader.ts`
- `packages/engine/src/sim/trace-writer-node-loader.ts`

Current `node:*` importers outside that list are allowed only under the documented `cnl` ignore:

- `packages/engine/src/cnl/compile-observers.ts`
- `packages/engine/src/cnl/load-gamespec-source.ts`
