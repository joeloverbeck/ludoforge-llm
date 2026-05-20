# CI / ci Workflow — Default Lane Wall Time

**Date**: 2026-05-19
**Status**: ✅ EXPLOITED — archived 2026-05-20.
**Trigger**: `.github/workflows/ci.yml` `CI / ci` job consistently exceeds 10 minutes on GitHub-hosted runners. Question: is something hanging, or is a development-oriented test lane being too heavy for the main lane?
**Measurement host**: Local WSL2 (Linux 6.6.114.1-microsoft-standard-WSL2), engine prebuilt via `pnpm -F @ludoforge/engine build`.
**Scope**: Wall-time decomposition of `pnpm turbo test` in the `CI / ci` job — i.e., everything that runs after `pnpm turbo build` lands.

---

## Verdict

**Not hanging.** One specific test file — `packages/engine/test/architecture/policy-preview-inner-outcome-parity.test.ts` (Spec 178 chooseOne inner-preview outcome parity) — accounts for **173 s out of 297 s** of the engine `default` lane locally, i.e., ~58 % of test wall time. Extrapolated to a GitHub-hosted runner (typically 1.5–2× slower for CPU-bound JS), this single file alone is **~4–5 min** of CI wall time. Combined with the workflow's install + rust toolchain + lint + typecheck + build + tooling overhead (~2–4 min), the >10-minute floor is explained without invoking a hang. Every individual test that participates in the dominant suite completes within its 90 s per-test timeout (max observed: 84 s).

The user's secondary hypothesis is also partially right: the `default` lane was authored as the "local fast feedback" lane (excludes the FITL-events / FITL-rules / texas-cross-game / slow-parity / policy-canaries shards that live in `engine-tests.yml`), but a 5-seed verbose-trace parity witness has crept into its `architecture/**` sub-glob and now dominates the lane's runtime.

---

## What `CI / ci` actually runs

`ci.yml` defines two jobs:

| Job | Cost-relevant steps | Notes |
|---|---|---|
| `ci` (the main lane) | `pnpm install --frozen-lockfile` → `pnpm turbo lint` → `pnpm turbo typecheck` → `pnpm turbo build` → `pnpm turbo test` | Plus `actions/checkout@v6`, `pnpm/action-setup@v6`, `actions/setup-node@v6` with pnpm cache, `dtolnay/rust-toolchain@stable` with `wasm32-unknown-unknown` target, and `pnpm guard:worktree-pointers`. |
| `node-compat` (Node 20 matrix) | Same install + rust + build, then **stops at build** (skips test) because `node --test` globs require Node 22. | Runs in parallel with `ci`; doesn't add to `CI / ci` wall time but consumes a runner. |

`pnpm turbo test` resolves (per `turbo.json` and per-package `package.json` files) to two parallel tasks:

1. **`@ludoforge/engine` test** (`packages/engine/package.json:65`):
   `pnpm run schema:artifacts:check && node scripts/run-tests.mjs --lane default`
2. **`@ludoforge/runner` test** (`packages/runner/package.json:14`):
   `vitest run`

`@ludoforge/engine-wasm` has no `test` script and contributes nothing here.

The engine `default` lane is defined in `packages/engine/scripts/run-tests.mjs:19-28`:

```
{
  execution: 'sequential',
  patterns: [
    'dist/test/unit/**/*.test.js',
    'dist/test/architecture/**/*.test.js',
    ...listIntegrationTestsForLane('integration:core').map(toDistTestPath),
  ],
  timeoutMs: 10 * 60 * 1000,
}
```

`integration:core` (resolved in `packages/engine/scripts/test-lane-manifest.mjs`) is `ALL_INTEGRATION_TESTS` minus the game-package tests (except 7 smoke tests), minus the 10 `SLOW_INTEGRATION_TESTS`, minus the 4 `POLICY_CANARY_INTEGRATION_TESTS` — i.e., **96 file paths** at the time of measurement.

The `sequential` execution mode in `run-tests.mjs` spawns one Node process **per pattern**, not per file. The two globs (`unit/**`, `architecture/**`) run as one Node process each (parallel-within-process per Node's `--test` default). The 96 integration:core paths each spawn their own Node process.

---

## Wall-time measurements

| Component | Wall (local) | Notes |
|---|---:|---|
| **`pnpm turbo test` (turbo orchestrated)** | not measured directly | Same time-budget as the larger of engine vs runner, since turbo runs them in parallel. Bound by engine. |
| **`@ludoforge/engine` test (engine `default` lane)** | **297.45 s** | `/usr/bin/time -p`, includes `schema:artifacts:check`. |
| &emsp;`pnpm run schema:artifacts:check` (preamble) | ~14 s | Shown in log as `✔ json schema artifacts (14380.386956ms)`. |
| &emsp;`dist/test/unit/**/*.test.js` glob (one Node process, parallel-within) | **33 s** | 551 unit test files. |
| &emsp;`dist/test/architecture/**/*.test.js` glob (one Node process, parallel-within) | **177 s** (2 m 57 s) | 62 architecture test files. Dominated by one file (see below). |
| &emsp;`integration:core` (96 files, 96 sequential Node processes) | **~87 s** | Avg ~0.9 s per file. Per-file Node startup is the floor. Slowest file: 5 s. |
| **`@ludoforge/runner` test (vitest run)** | **34.7 s** | 205 test files, 2019 tests, jsdom + Pixi mocks. Not the cost driver. |

`/usr/bin/time -p` raw output for the engine lane: `real 297.45`, `user 536.70`, `sys 49.19` (user > real confirms parallelism within the glob processes).

---

## Dominant bottleneck: Spec 178 chooseOne inner-preview outcome parity

The `architecture/**` glob ran for 177 s, of which **173 s** was a single `describe` block.

**File**: `packages/engine/test/architecture/policy-preview-inner-outcome-parity.test.ts:105-113`
**Test class**: `architectural-invariant` (`@test-class` marker on line 1)
**Shape**: 5 `it()` cases iterating over `WITNESS_SEEDS = [1005, 1011, 1008, 1013, 1009]` (line 31). Each test calls `captureOutcomeParity(seed, expected.maxTurns)` (line 74), which:

1. `compileProductionSpec()` — compiles the full ARVN production spec
2. `createGameDefRuntime(def)` — builds the runtime
3. Instantiates a `PolicyAgent` per seat with `traceLevel: 'verbose'`
4. `runGame(def, seed, agents, maxTurns, 4, { skipDeltas: true }, runtime)` — runs a full bounded simulation
5. Collects per-decision `agentDecision` candidates, scoreContributions, previewDrive, previewUsage, etc.
6. `assert.deepEqual` against a JSON fixture in `test/architecture/fixtures/178-outcome-parity-<seed>.json`

Per-seed wall times measured in the run log:

| Seed | Wall | % of test budget (90 s timeout) |
|---|---:|---:|
| 1008 | **83.85 s** | 93 % |
| 1005 | 33.23 s | 37 % |
| 1009 | 32.75 s | 36 % |
| 1013 | 11.92 s | 13 % |
| 1011 | 11.33 s | 13 % |
| **Suite total** | **173.08 s** | — |

Structurally this is a multi-seed convergence-witness suite by content (per-seed trajectory parity) even though it carries the `architectural-invariant` marker. Per `.claude/rules/testing.md`'s test classification, a `convergence-witness` is the right marker when "the property is inherently seed- or profile-specific" — which is the case here. The current marker says it's testing a property that holds across every legitimate kernel evolution; the implementation says it's testing five specific (seed, profile, kernel-version) trajectories.

---

## Secondary contributors

These are real but lower-magnitude costs worth recording so any follow-up fix doesn't over-attribute savings to (A) above:

- **`integration:core` sequential Node startup**: 96 separate Node invocations. Each pays ~0.3–0.5 s of Node + module-loading overhead before the test body runs. With per-file actual test work in the 0.1–5 s range, roughly half of the 87 s wall time in this section is Node startup, not test work. The longest individual files were `parse-validate-full-spec.test.js`, `cnl/compile-event-annotations-golden.test.js`, `agents/cross-game-driver-conformance.test.js`, `agents/compiled-policy-determinism.test.js` (all 5 s).
- **`schema:artifacts:check`** (~14 s): part of the engine test script preamble, validates schema artifacts before running tests. Not currently a candidate for cuts.
- **Runner `vitest run`** (~35 s): Vitest already runs files in parallel workers; runner is not the cost driver. Many `Not implemented: HTMLCanvasElement's getContext()` jsdom warnings appear in stderr but do not affect timing.
- **Workflow-level overhead** (not measured here, but observable in past `gh run view` output): `actions/checkout`, pnpm setup, Node setup with cache restore, `dtolnay/rust-toolchain@stable` with wasm32 target, and `pnpm install --frozen-lockfile`. Rust toolchain install can be 30–60 s; full install up to 2 min cold. Total non-test overhead is typically 2–4 min on cold caches, less on warm.

---

## Why nothing is actually hanging

- Per-test timeout in `policy-preview-inner-outcome-parity.test.ts:107` is `90_000` ms. Worst-observed seed (1008) used 84 s — within budget. A genuine hang would have tripped that timeout.
- Per-pattern timeout in the `default` lane is **10 minutes** (`DEFAULT_HEAVY_INTEGRATION_TIMEOUT_MS` in `run-tests.mjs:13`). The whole architecture glob completed in 177 s, well inside that budget.
- The `[test-progress] [default] still running ... spec-180-standing-role-primitives.test.js after 2m 31s quiet 2m 31s` lines in the log are **misleading attribution**, not a hang. `test-class-reporter.mjs:131-150` tracks `currentFile` as "whoever emitted the last event". With Node's parallel test runner executing 62 architecture files inside one process, a quiet window means *some* file is computing without emitting; the reporter labels it with the last-active file, which was the standing-role primitives file just because it happened to be the previous emitter. The actual silent worker during those 2.5 minutes was `policy-preview-inner-outcome-parity.test.ts` running deep simulation between assertion emissions.
- Confirmed by isolating: `node --test ... spec-180-standing-role-primitives.test.js` completes in **0.39 s** standalone — it is not slow.

---

## Decision Tree

What to do next depends on appetite for change. Verdict of the diagnostic is fixed; the follow-up branches.

| Branch | What it does | Estimated `CI / ci` impact | Cost / risk |
|---|---|---|---|
| **A. Re-shard Spec 178 witness into `engine-tests.yml`** | Add a new lane (e.g., `policy-preview-inner-outcome-parity` with 1 or 2 shards) to `engine-tests.yml` matrix, and exclude the file from `architecture/**` glob membership in `run-tests.mjs`. The file moves out of `CI / ci` and into the parallel `Engine Tests` workflow alongside `policy-canaries`, `slow-parity`, etc. | Saves ~3 min of `CI / ci` wall time immediately. Total CI compute unchanged (work moves to a parallel shard). | Low. Existing precedent for excluded heavy tests is well-established (`POLICY_CANARY_INTEGRATION_TESTS`, `SLOW_INTEGRATION_TESTS`). One mechanical change to `test-lane-manifest.mjs` (add `POLICY_PREVIEW_PARITY_TESTS` constant + exclusion clause for `integration:core` analogue — but note this file is under `test/architecture/`, not `test/integration/`, so the manifest needs a new architecture-exclusion path rather than reusing the integration helpers). One new lane row in `engine-tests.yml`. |
| **B. Reduce the witness's cost in place** | Drop `traceLevel: 'verbose'` or downsample `WITNESS_SEEDS` from 5 to 2. | Saves ~2 min of `CI / ci` wall time if seeds 1008 + 1005 are kept; ~3 min if only one seed remains. | Medium. Loses coverage — the verbose trace fields (`advisories`, `scoreContributions`, `previewDrive`, `previewUsage`) ARE used in the deep-equal comparison and would need fixture regeneration. Coverage rationale belongs in the spec history (Spec 178), which would need to be reviewed before commitment. Not recommended without first checking with the witness's author intent. |
| **C. No change** | Accept the runtime. | None. | None. Defensible if the parity witness is load-bearing for ongoing Spec 178 work AND the >10-min wall time is tolerated. |
| **D. Parallelize the `default` lane's integration:core pattern (secondary)** | Switch `integration:core` from per-file Node spawns to a single glob (`integration:core` lane in `run-tests.mjs:37`, change `execution: 'batched'` and use a glob pattern). | Saves ~30–50 s. | Low/medium. Risk: collisions if integration tests share global state (Zobrist tables, cache files, etc.). Worth investigating only if A is insufficient. |

Branch dependencies: A is independent. B excludes A. D is orthogonal and could pair with A or B. C excludes all of the above.

---

## Recommended follow-up artifact

**Branch A** is the recommended path. The work warrants a single ticket (no spec needed — pattern is mechanical and mirrors existing precedent in `test-lane-manifest.mjs` for `SLOW_INTEGRATION_TESTS` and `POLICY_CANARY_INTEGRATION_TESTS`).

**Proposed ticket scope**:

1. Add a `POLICY_PREVIEW_PARITY_ARCHITECTURE_TESTS` (or similar) constant in `test-lane-manifest.mjs` listing the file (currently just `policy-preview-inner-outcome-parity.test.ts`).
2. Introduce an architecture-test-exclusion helper analogous to `isSlowIntegrationTest`, and apply it to the `default` lane patterns in `run-tests.mjs` so the file is dropped from the `architecture/**` glob enumeration. (Cleanest path: change the `default` lane's architecture pattern from a wildcard glob to an enumerated file list minus the excluded test, OR add a wrapper that emits the glob and post-filters.)
3. Add a `policy-preview-parity` shard row to `.github/workflows/engine-tests.yml`'s `test` matrix with `timeout: 15` (90 s/seed × 5 seeds × 2× CI slowdown factor leaves headroom).
4. Add an `engine` package script `test:architecture:policy-preview-parity` that points the existing lane runner at this single file (or shard set if seeds are split later).
5. Verify locally that `pnpm -F @ludoforge/engine test` (the `default` lane) no longer includes the witness, and that `pnpm -F @ludoforge/engine test:architecture:policy-preview-parity` does include it.

Suggested namespace for the ticket (per `archival-workflow.md` conventions): `CIDLANEWITN` (CI Default Lane Witness) or similar — actual naming up to whoever invokes `/spec-to-tickets` or hand-authors the ticket.

If branch D becomes necessary later (after A lands, if CI is still over target), that is a separate, smaller ticket focused on the `integration:core` lane's Node-process startup overhead. Not warranted until A is measured.

---

## Reassessment

**Measurement environment caveat.** Measurements were taken on WSL2 on a local dev box, not on a GitHub-hosted Ubuntu runner. GitHub-hosted `ubuntu-latest` runners are typically 1.5–2× slower than modern dev hardware for CPU-bound JavaScript work, but the *ratio* between components is preserved. The structural finding — that one test file consumes ~58 % of the engine `default` lane's wall time — is invariant of host, and the recommended action (re-shard A) does not depend on the absolute CI numbers being precise. If exact CI numbers matter for prioritization, re-running `gh run view --log` on a recent `CI / ci` execution and grepping for the per-pattern `[run-tests] [default] done ... (Xs)` lines will give the authoritative figures.

**What this report does NOT verify.** The report measures the `pnpm turbo test` portion of `CI / ci`. It does not separately measure `pnpm turbo lint`, `pnpm turbo typecheck`, or `pnpm turbo build` on this host. Those steps are present in `ci.yml` and contribute to total `CI / ci` wall time but were outside the user's framing ("wall-time the test suites involved"). If `CI / ci` post-A remains over target, the next diagnostic should measure those steps too.

**Witness coverage caveat (branch B).** The decision tree presents B (cost reduction in place) as a valid branch but does not commit to it. The verbose trace fields captured by the test are non-trivial: full per-decision candidate traces with scoreContributions, advisories, previewDrive, previewUsage, and previewOutcome — i.e., the entire ARVN decision surface for chooseOne micro-turns. The Spec 178 fixture-driven nature of the witness suggests this is intentional and load-bearing for regression protection; downsampling should not happen without confirmation that the property is still witnessed adequately.

**Verification artifacts disposition**: no verification artifacts created. All inspection used Read / Bash / grep on existing files. The two timing log files (`/tmp/engine-default-lane.log`, `/tmp/runner-test.log`) are ephemeral OS-cleanup temp files and do not need archival.

**Replacement convention**: not applicable — this is a fresh diagnostic, no prior CI-timing report exists in `reports/`.

**Follow-up artifact**: ticket (not yet authored). Branch A in the Decision Tree above describes the scope.
