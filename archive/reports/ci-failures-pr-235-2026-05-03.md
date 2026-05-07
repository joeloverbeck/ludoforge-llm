# PR #235 — CI Failure Recovery (2026-05-03)

PR branch: `intermediary-upload-after-21-commits` (intermediary upload of 22 local-main commits beyond `origin/main`).
Failing run: <https://github.com/joeloverbeck/ludoforge-llm/actions/runs/25290167650> (CI workflow), <https://github.com/joeloverbeck/ludoforge-llm/actions/runs/25290167658> (Engine Determinism Parity).
Fix commit: `6fce497e fix(ci): unblock PR CI — lint, wasm toolchain, browser-safe split`.

Surfaced as 5 clusters in 4 gate-1 rounds. Each prior fix unmasked the next; all 5 are needed to reach green.

## Cluster table

| # | Cluster | Lanes | Class | Status | Root cause | Fix |
|---|---------|-------|-------|--------|------------|-----|
| 1 | engine lint | `ci` (lint step) | lint | PR regression vs `origin/main` (`78732e2474`) | 5 unused-symbol errors + 3 missing-return-type warnings in two new `policy-wasm-production-preview-*.ts` files added by FITLWASM-014 / FITLWASM-017 | Drop unused imports / args / catch-binding; add explicit return types using `NonNullable<GameDef[…]>[number] \| undefined` shape |
| 2 | wasm toolchain in `ci.yml` | `node-compat (20)` (blocking after `16feb9ad` removed `continue-on-error`); `ci` build step (next failure once lint cleared) | structural | PR regression — new `@ludoforge/engine-wasm` Rust crate has no toolchain in `ci.yml` jobs | Add `dtolnay/rust-toolchain@stable` + `wasm32-unknown-unknown` target step before `pnpm install` in both jobs |
| 3 | `policy-wasm-runtime.ts` pulls Node-only `node:fs` / `node:path` / `node:url` / `node:fs/promises` into the runner browser bundle via `@ludoforge/engine/agents` barrel | `ci` build step | build | PR regression introduced by FITLWASM-014 (`e7052dc7`); never CI-validated against runner because lint failed first | Split file: keep browser-safe core in `policy-wasm-runtime.ts`, move `findRepoRoot`, `defaultPolicyWasmPath`, `initializePolicyWasmRuntimeSync`, `loadPolicyWasmRuntime`, `asBytes` to new `policy-wasm-runtime-node-loader.ts`. Drop dead `LUDOFORGE_POLICY_WASM` auto-init branch in `getInitializedPolicyWasmRuntime` (no callers). Export `createPolicyWasmRuntime` for the loader. Update 4 test imports + 1 script destructure. |
| 4 | `data-assets.ts` pulls `node:fs`/`node:path` into the runner browser bundle via `kernel/index.ts` barrel + new policy-wasm value-imports from `'../kernel/index.js'` | `ci` build step (next failure once Cluster 3 cleared) | build | PR regression — `data-assets.ts` itself pre-existed on `origin/main` but was never reachable from the runner; FITLWASM tickets added new `agents/` files that value-import from `'../kernel/index.js'`, pulling all 139 kernel re-exports into the bundle | Same split pattern: keep `validateDataAssetEnvelope` + types in `data-assets.ts`, move `loadDataAssetEnvelopeFromFile`, `readAssetFile`, `formatError` to new `data-assets-node-loader.ts`. Update 1 test import. |
| 5a | `policy-runtime-encoded.test.ts:282` snapshot expects `'unsupported weight expression for consideration boardStrength'`; actual is `'value expression'` | `ci` test step | test-lane | PR regression introduced by FITLWASM-011 (`cdb92288`) — test author asserted wrong message. `boardStrength.weight` is `literal(1)` so `literalBatchValues` short-circuits weight; only `value` (`globalTokenAgg`) reaches the throwing fake runtime | Update snapshot to `'value expression'` (snapshot of correct contract; impl is right) |
| 5b | `zobrist-incremental-edge-cases.test.ts:261` asserts `decisionStackFrame` keys are NOT interned in `table.keyCache`; actual: 1 such key is interned | `ci` test step | test-lane | PR regression — `shouldCacheFeatureKey` in `zobrist.ts` returns `true` for `'decisionStackFrame'` despite digests being unbounded over a game | Move `'decisionStackFrame'` from `return true` cases to `return false` cases in `shouldCacheFeatureKey` (matches existing `turnCount` / `nextFrameId` / `nextTurnId` classification for unbounded-value features) |

Advisory lanes (`policy-profile-quality` shards) were all green and not touched. `node-compat (20)` was advisory until `16feb9ad`; recovered as a hard-required lane via Cluster 2.

## Verification (local)

- `pnpm turbo lint typecheck build`: 7/7 tasks pass.
- `pnpm -F @ludoforge/engine test` (lane=default — what `pnpm turbo test` runs): 60/60 files, all tests pass.
- `pnpm -F @ludoforge/runner test` (vitest): 205 files, 2019 tests, all pass.
- `pnpm -F @ludoforge/engine-wasm build`: cargo wasm32 ok.

## Architectural-gap candidate (post-push, for user review)

Clusters 3 and 4 have the same shape: a kernel/agents barrel re-exports a file with top-level `node:*` imports, which gets pulled into the runner's browser bundle. The split-into-`*-node-loader.ts` pattern fixes each instance but does NOT prevent the next one — there is no convention or lint rule preventing a future `node:fs` import from being added to a file reachable from the browser barrel chain.

Other engine source files with `node:*` imports that are NOT currently in the runner's transitive closure (and would silently break the runner if someone imports them from a barrel-reachable module): `sim/trace-writer.ts`, `agents/policy-ir.ts`, `cnl/compile-observers.ts`, `cnl/load-gamespec-source.ts`. The `node:crypto` users (`createHash`) currently slip through — vite/rollup didn't error on them in this run, but they're still in the brittle category.

Candidate spec slot: `archive/specs/151-engine-package-environment-isolation.md` — codify which engine subpath exports are browser-safe vs Node-only, document the split pattern, and consider an ESLint rule (e.g., `no-restricted-imports` configured per-file or per-directory) that forbids `node:*` imports from files re-exported by a designated browser-safe barrel. Foundation 5 (One Rules Protocol, Many Clients) underwrites this.

I have NOT written the spec — flagging only. Per skill, this is post-push and additive; the CI fix is shipped.

## What did NOT work

Nothing in this session was attempted and reverted. Each gate-1 round resulted in a working fix verified locally before the next gate. Sole adjustment: when the first lint pass cleared the 5 errors, `--max-warnings 0` re-flagged 3 missing-return-type warnings in the same file — required a follow-up edit in the same cluster.
