# Spec 151: Engine Package Environment Isolation

**Status**: PROPOSED
**Priority**: P2 (medium — closes a recurring CI break shape; modest scope; high signal-to-noise)
**Complexity**: S (one ESLint rule, one audit, possibly one or two more file splits along the same pattern PR #235 already established)
**Dependencies**:
- Foundation 1 (Engine Agnosticism) — engine code must not presume host environment.
- Foundation 5 (One Rules Protocol, Many Clients) — the engine ships one runtime contract consumed by both Node hosts (CLI, scripts, tests, sim) and browser hosts (runner, future web tools).
- Foundation 14 (No Backwards Compatibility) — public engine package exports change shape (Node-only APIs leave the browser-safe barrels); affected callers (engine tests, scripts) update import paths in the same change.

**Source**:
- PR #235 commit `6fce497e` Clusters 3 + 4: `policy-wasm-runtime.ts` and `data-assets.ts` each had top-level `node:fs` / `node:path` / `node:url` imports that vite/rollup pulled into `@ludoforge/runner`'s browser bundle via the `@ludoforge/engine/agents` and `@ludoforge/engine` (kernel/index) barrels. Both fixes used the same shape: split file IO into a `*-node-loader.ts` sibling. See `reports/ci-failures-pr-235-2026-05-03.md`.
- The recurrence pattern: each fix surfaced after the prior one cleared, because vite/rollup only reports the first offending node-only module per build. The current CI passes only because no other `node:*`-importing engine file is currently in the runner's transitive closure — but no convention prevents the next FITLWASM-style ticket from adding one.
- At-risk inventory (today, post-#235): `packages/engine/src/sim/trace-writer.ts` (`node:fs`), `packages/engine/src/agents/policy-ir.ts` (`node:crypto`), `packages/engine/src/cnl/load-gamespec-source.ts` (`node:crypto` + `node:fs` + `node:path`), `packages/engine/src/cnl/compile-observers.ts` (`node:crypto`). All currently safe (none transitively imported from runner-reached barrels), but each is one careless wide-barrel value-import away from re-breaking the runner build.

## Brainstorm Context

**Original framing.** The engine package is a shared TypeScript library consumed by two host classes:
- **Node hosts** — CLI scripts (`packages/engine/scripts/profile-fitl-preview-drive.mjs`), tests (`node --test`), sim entry points, evolution pipeline. Have full Node API surface.
- **Browser hosts** — `@ludoforge/runner` (vite + rollup → browser bundle), future web tools.

The engine declares package subpath exports (`./agents`, `./runtime`, `./trace`, `./cnl`, `./sim`, `./`) without any host-environment annotation. Any source file under `packages/engine/src/` that the runner transitively imports gets pulled into the browser bundle. Vite externalizes `node:*` modules to a stub that doesn't expose their named symbols, so any TOP-LEVEL `import { extname } from 'node:path'` becomes a hard rollup error: `"extname" is not exported by "__vite-browser-external"`.

PR #235 fixed two such cases by splitting each offending module into `<name>.ts` (browser-safe core) + `<name>-node-loader.ts` (Node-only file IO). The split pattern works mechanically, but it's a convention enforced only by author discipline — there's no compile-time check, no lint rule, no test, and no documented contract that says "files under these subpaths must not have `node:*` imports".

**Motivation.** Three forces converge:
1. **The fix is recurring.** Two split-file fixes in PR #235; another likely the next time an engine ticket adds `node:*` imports to a file that's reachable from a browser barrel. Each instance costs a CI cycle and a refactor.
2. **The detection is downstream.** Vite/rollup catches it; engine `pnpm build` doesn't. CI fails at the runner step, not at the offending file. Authors don't know they violated a constraint until CI reports it three layers away.
3. **The rule is local.** Any individual file can be classified as "browser-safe" or "Node-only" by looking at one boolean: does it have a top-level `node:*` import? An ESLint rule scoped to designated browser-safe directories would block the violation at the offending file, in editor diagnostics, before commit.

**Prior art surveyed.**
- **Bun/Deno's `node:` prefix conventions** — both runtimes accept `node:*` imports but expose them as platform-specific. Browser-targeted bundlers reject them by design.
- **Rollup's `external` configuration** — vite uses this to externalize `node:*` modules. The error we hit is the standard error shape for this case; it's not a vite quirk.
- **Webpack's `node: false` config / Browserify shims** — historical patterns where `fs` etc. were stubbed silently. Current best practice (which vite follows): fail loudly so the author knows the bundle has a host-environment violation.
- **Per-directory lint scoping** — the project's own `eslint.config.js` already uses `no-restricted-imports` scoped to specific file globs (e.g., `packages/engine/src/cnl/**/*.ts` blocks `*contract*` imports from kernel; `effects-*.ts` blocks direct `eval-error` imports). The same primitive supports the rule this spec needs.

**Synthesis.** Codify the split-file convention as a documented invariant + an ESLint rule:
1. **Invariant**: any `.ts` file under `packages/engine/src/` is either browser-safe (no `node:*` imports anywhere in its transitive closure within the engine's own source) or Node-only (named `*-node-loader.ts`, OR under a designated Node-only subdirectory). Browser-safe files MUST NOT import from Node-only files; Node-only files MAY import from browser-safe files.
2. **ESLint rule**: forbid top-level `node:*` imports in any engine source file EXCEPT the Node-only sentinels (`*-node-loader.ts` files; designated Node-only directories). Caught at lint time, before commit.
3. **Optional CI check**: a smoke test that grep-walks the runner's vite-build output looking for `node:*` references; fails CI if any leak.

**Alternatives explicitly considered (and rejected).**
- **Mark the engine package `sideEffects: false` in `package.json`.** Lets rollup tree-shake unused modules. Tempting (one-line config) but risky — the engine has legitimate side-effecting initialization in some files (e.g., RNG seeding patterns; though not currently top-level), and a blanket `sideEffects: false` could drop them silently. Rejected — opaque, hard to verify; doesn't catch the next instance at the offending file.
- **Add a Node-only subpath export `@ludoforge/engine/node`.** Move all Node-only APIs there. Cleaner organizationally but requires moving files, not just renaming, and breaks deep imports test files currently use. Rejected — strictly larger diff than the `*-node-loader.ts` convention, no clear additional benefit. The convention is already established in PR #235; codify it rather than replace it.
- **Configure the runner's vite to alias offending modules to browser stubs.** Hides the symptom; doesn't fix the architecture; loses the ability to catch the next regression. Rejected — antithetical to F#1 + F#5.
- **Migrate engine to dual-build (one ESM browser bundle, one ESM Node bundle)**. Heavy infrastructure change; turbo-build complexity; doesn't help the current monorepo shape. Rejected — over-engineering for a problem an ESLint rule solves.

**User constraints reflected.** F#1 (Engine Agnosticism — engine code does not assume Node-only APIs at runtime in browser contexts), F#5 (One Rules Protocol, Many Clients — the engine ships one contract consumable by Node + browser hosts via the same package; only the bootstrap layer differs), F#14 (No Backwards Compatibility — when an existing file is split, all callers update import paths in the same commit; no compatibility shim).

## Overview

Three deliverables:

1. **`docs/engine-environment-isolation.md`** — short doc (one page) defining browser-safe vs. Node-only files, the `*-node-loader.ts` naming convention, and which subpath exports are browser-safe.
2. **ESLint rule `no-node-imports-in-browser-safe-files`** (or use `no-restricted-imports` patterns) — forbid `from 'node:*'` in any engine source file except `*-node-loader.ts` and designated Node-only directories. Wire into `eslint.config.js`.
3. **Audit + remediate** — grep the engine src for current `node:*` importers, classify each as "currently browser-safe path" (rename to `*-node-loader.ts` or relocate) or "Node-only-by-design" (annotate as such). PR #235 already split `policy-wasm-runtime` and `data-assets`; remaining at-risk files: `sim/trace-writer.ts`, `agents/policy-ir.ts`, `cnl/load-gamespec-source.ts`, `cnl/compile-observers.ts`. None are currently in the runner's transitive closure, but the rule should still apply uniformly so future authors don't accidentally pull them in.

## Problem Statement

### Defect class: barrel re-export silently pulls Node IO into browser bundle

The engine ships wide-barrel re-exports (`packages/engine/src/kernel/index.ts` re-exports 139 modules; `agents/index.ts` re-exports 11). Authors writing new files in `agents/` or `kernel/` naturally use `import { ... } from '../kernel/index.js'` for convenience — value-imports, not type-imports.

Vite/rollup, building the runner, traverses the import graph from `runner/src/...` through `@ludoforge/engine/agents` (= `agents/index.ts`) into every transitively-reachable module. Any module with a top-level `node:*` import becomes a runtime requirement of the bundle. Vite externalizes `node:*` to a stub; rollup then errors when ANY symbol from that stub is referenced (e.g., `extname is not exported by "__vite-browser-external"`).

The error is reported at the OFFENDING FILE (the one with the `node:*` import), not at the wide-barrel re-export that pulled it in. Authors who didn't touch the offending file see CI fail with a mysterious error in code they didn't modify.

### Why an ESLint rule is the right shape

The rule expressible in `no-restricted-imports`:

```js
{
  files: [
    "packages/engine/src/**/*.ts",
    "!packages/engine/src/**/*-node-loader.ts",
    // plus any designated Node-only subdirectory globs
  ],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [{ group: ["node:*"], message: "..." }],
    }],
  },
}
```

Caught at lint, in editor, before commit. The author who adds the import knows immediately. The fix is also obvious: rename the file `*-node-loader.ts`, OR move the IO to a sibling `*-node-loader.ts`.

### Why a convention alone is not enough

PR #235 established the convention. The next FITLWASM-style ticket has no automated reminder. The ESLint rule is the durable enforcement; the convention doc is the explanation.

## Design

### D1. Convention doc (`docs/engine-environment-isolation.md`)

One-page reference covering:
- Which engine subpath exports are browser-safe: `./` (kernel/index), `./runtime`, `./agents`, `./trace`. (Verify against `packages/runner/src` import inventory at spec-implementation time.)
- Which subpath exports are Node-only: `./cnl`, `./sim`, plus the future explicit Node-loader subpaths.
- Naming convention: any file with top-level `node:*` imports MUST be named `<base>-node-loader.ts`. Exception: files under designated Node-only directories (`packages/engine/src/sim/cli/`, `packages/engine/src/cnl/loader/`, etc., as classified during the audit) are also exempt.
- Split pattern: when a Node-only API needs to live alongside browser-safe code, follow the PR #235 shape — keep browser-safe core in `<name>.ts`, move file IO + auto-init to `<name>-node-loader.ts`. The loader imports from the core; the core never imports from the loader.
- Caller responsibility: tests, CLI scripts, and Node-side bootstrap call into `*-node-loader.ts` files via deep imports. They MUST NOT be re-exported from any browser-safe barrel.

### D2. ESLint rule

Add to `eslint.config.js` after the existing `no-restricted-imports` blocks. Two-part shape:

```js
// Block node:* imports in engine source files, except in Node-only files.
{
  files: ["packages/engine/src/**/*.ts"],
  ignores: [
    "packages/engine/src/**/*-node-loader.ts",
    "packages/engine/src/sim/cli/**/*.ts",      // (fill in per audit)
    "packages/engine/src/cnl/**/*.ts",          // entire CNL package — Node-only by design
  ],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [{
        group: ["node:*"],
        message:
          "Engine browser-safe modules must not import node:* APIs. " +
          "Move file IO / Node bootstrap to a sibling <name>-node-loader.ts " +
          "and have callers import that file directly. See docs/engine-environment-isolation.md.",
      }],
    }],
  },
},
```

The exact `ignores` list is determined by the audit (D3). The ESLint rule definition is consistent with existing per-glob `no-restricted-imports` blocks already in `eslint.config.js`.

### D3. Audit + remediation

Inventory current `node:*` importers in `packages/engine/src/` and classify each:

| File | node:* imports | Currently barrel-reachable from runner? | Action |
|------|----------------|-------------------------------------|--------|
| `kernel/data-assets-node-loader.ts` | `node:fs`, `node:path` | No (created by PR #235 with correct name) | Add to ignores; OK |
| `agents/policy-wasm-runtime-node-loader.ts` | `node:fs`, `node:fs/promises`, `node:path`, `node:url` | No (created by PR #235 with correct name) | Add to ignores; OK |
| `sim/trace-writer.ts` | `node:fs` | No (sim subpath not imported by runner) | Either rename to `trace-writer-node-loader.ts` (consistent) OR add `sim/` to ignores (broader exemption). Pick at implementation time. |
| `agents/policy-ir.ts` | `node:crypto` | No (only imported by `cnl/compile-agents.ts`) | Same options as above. `node:crypto` is more browser-tolerable than `node:fs` (browsers have `crypto.subtle`); could either rename or use `globalThis.crypto` if the SHA path is light. |
| `cnl/load-gamespec-source.ts` | `node:crypto`, `node:fs`, `node:path` | No (CNL not exported to runner) | Add `cnl/` directory to ignores (CNL is Node-only by design). |
| `cnl/compile-observers.ts` | `node:crypto` | No (CNL not exported to runner) | Same as above — covered by `cnl/` directory ignore. |

Outcome: probably 2–4 file renames + 2 directory ignore entries + the new doc + the ESLint rule. Net change: small; high signal — every future regression of this shape gets caught at lint.

### D4. Smoke test (optional, lower priority)

A CI step or test that greps the runner's vite-build output (`packages/runner/dist/assets/*.js`) for any literal `"node:fs"`, `"node:path"`, etc. references. Fails the build if any leak through. Belt-and-suspenders against rollup configuration drift.

Optional because the ESLint rule is the primary enforcement; the smoke test only catches cases where someone uses dynamic `await import('node:fs')` (which the static lint rule wouldn't flag). Defer unless the audit finds existing dynamic imports.

## Acceptance Criteria

1. **Doc exists**: `docs/engine-environment-isolation.md` present, one page, lists browser-safe vs. Node-only subpaths and the `*-node-loader.ts` convention.
2. **ESLint rule active**: `pnpm turbo lint` fails when a `node:*` import is added to any browser-safe engine source file. Verified via a deliberate test edit (added then reverted before merge): adding `import { readFileSync } from 'node:fs'` to `packages/engine/src/agents/policy-eval.ts` produces a lint error referencing the convention doc.
3. **Audit complete**: every current `node:*`-importing engine file is either in a `*-node-loader.ts` file OR in a directory listed in the ESLint rule's ignores. The ignores list is documented in `docs/engine-environment-isolation.md`.
4. **No runner regression**: `pnpm turbo build` passes; `@ludoforge/runner` browser bundle builds clean (no rollup `__vite-browser-external` errors).
5. **Test imports updated** for any file renamed during D3.

## Risks

- **Audit reveals more files than anticipated.** The current inventory is small (4 at-risk files) but the audit may surface dynamic patterns or test-helper files not caught by the grep. Mitigated by running the audit as a discovery step BEFORE writing the ESLint rule's ignores; adjust ignores to match reality.
- **`cnl/` directory blanket ignore is too broad.** If CNL ever needs to be browser-importable (unlikely but possible — e.g., a future in-browser spec editor), the blanket ignore would let `node:*` imports leak through. Mitigated by per-file rather than per-directory ignores in the audit; document why if going with blanket.
- **`node:crypto` is partially browser-safe via `globalThis.crypto`.** Could refactor `policy-ir.ts` and `compile-observers.ts` to use `crypto.subtle.digest` instead of `node:crypto.createHash` and avoid the rename entirely. Defer — adds scope; the rename is cheaper and consistent.
- **The convention is one of two valid patterns.** A future contributor could legitimately argue for `_node` suffix or per-directory split. The doc + rule lock in `*-node-loader.ts` to match what PR #235 established. Rolling the convention later requires a doc update + lint config update; no other infrastructure cost.

## Out Of Scope

- Splitting the engine into a separate `@ludoforge/engine-browser` package.
- Dual ESM builds (one Node-targeted, one browser-targeted).
- Refactoring `node:crypto` callers to use `crypto.subtle.digest` (separate decision).
- Changes to the runner's vite configuration (the runner's vite is fine; the bug is in engine source classification).
- Changes to the engine package's `exports` map in `package.json` (the existing subpath exports stay; the convention layers on top).
- The `engine-wasm` package (separate concern; Rust crate, not TypeScript source).
